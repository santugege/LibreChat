import { createHash, randomUUID } from 'crypto';
import type { Request, RequestHandler } from 'express';

import { getSubscriptionConfig } from './config';

type ObjectIdLike = {
  toString: () => string;
};

type IdempotencyUser = {
  id?: string | null;
  _id?: string | ObjectIdLike | null;
  tenantId?: string | null;
};

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue | undefined };

type IdempotencyBody = {
  messageId?: string | null;
  conversationId?: string | null;
  [key: string]: JsonValue | undefined;
};

type TextQuotaIdempotencyResponse = {
  streamId: string;
  conversationId: string;
  status: string;
};

type TextQuotaIdempotencyEntry = {
  quotaRequestId: string;
  expiresAt: number;
  ttlMs: number;
  responsePromise: Promise<TextQuotaIdempotencyResponse>;
  resolveResponse: (response: TextQuotaIdempotencyResponse) => void;
  response?: TextQuotaIdempotencyResponse;
};

export type TextQuotaIdempotencyRequest = Request<
  Record<string, string>,
  object,
  IdempotencyBody | undefined
> & {
  user?: IdempotencyUser;
  subscriptionQuotaRequestId?: string;
  subscriptionQuotaIdempotencyKey?: string;
};

export type TextQuotaIdempotencyOptions = {
  ttlMs?: number;
  pendingWaitMs?: number;
};

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_PENDING_WAIT_MS = 10_000;
const CLEANUP_INTERVAL_MS = 10_000;
const idempotencyEntries = new Map<string, TextQuotaIdempotencyEntry>();
let lastCleanupAt = 0;

function readNonemptyString(value?: string | ObjectIdLike | null): string | undefined {
  if (typeof value === 'string') {
    return value.length > 0 ? value : undefined;
  }

  const stringValue = value?.toString();
  return stringValue && stringValue.length > 0 ? stringValue : undefined;
}

function getUserId(req: TextQuotaIdempotencyRequest): string | undefined {
  return readNonemptyString(req.user?.id) ?? readNonemptyString(req.user?._id);
}

function getTenantId(req: TextQuotaIdempotencyRequest): string {
  return readNonemptyString(req.user?.tenantId) ?? '';
}

function stableStringify(value: JsonValue | undefined): string {
  if (value === undefined) {
    return '';
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value)
    .filter((entry): entry is [string, JsonValue] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
}

function createFingerprint(body: IdempotencyBody): string {
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

function getIdempotencyKey(req: TextQuotaIdempotencyRequest): string | undefined {
  const userId = getUserId(req);
  const body = req.body;
  const messageId = readNonemptyString(body?.messageId);
  if (!userId || !body || !messageId) {
    return undefined;
  }

  return [userId, getTenantId(req), createFingerprint(body)].join(':');
}

function cleanupExpiredEntries(now: number): void {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanupAt = now;
  for (const [key, entry] of idempotencyEntries) {
    if (entry.expiresAt <= now) {
      idempotencyEntries.delete(key);
    }
  }
}

function createEntry(ttlMs: number, now: number): TextQuotaIdempotencyEntry {
  let resolveResponse: (response: TextQuotaIdempotencyResponse) => void = () => undefined;
  const responsePromise = new Promise<TextQuotaIdempotencyResponse>((resolve) => {
    resolveResponse = resolve;
  });

  return {
    ttlMs,
    responsePromise,
    resolveResponse,
    quotaRequestId: randomUUID(),
    expiresAt: now + ttlMs,
  };
}

function waitForResponse(
  entry: TextQuotaIdempotencyEntry,
  waitMs: number,
): Promise<TextQuotaIdempotencyResponse | undefined> {
  if (entry.response) {
    return Promise.resolve(entry.response);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(undefined);
    }, waitMs);

    entry.responsePromise.then((response) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

export function createTextQuotaIdempotencyMiddleware(
  options: TextQuotaIdempotencyOptions = {},
): RequestHandler {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const pendingWaitMs = options.pendingWaitMs ?? DEFAULT_PENDING_WAIT_MS;

  return async (req, res, next) => {
    if (!getSubscriptionConfig().enabled) {
      next();
      return;
    }

    try {
      const quotaReq = req as TextQuotaIdempotencyRequest;
      const now = Date.now();
      cleanupExpiredEntries(now);

      const key = getIdempotencyKey(quotaReq);
      if (!key) {
        next();
        return;
      }

      const existingEntry = idempotencyEntries.get(key);
      if (existingEntry) {
        existingEntry.expiresAt = now + existingEntry.ttlMs;
        const response = await waitForResponse(existingEntry, pendingWaitMs);

        if (response) {
          res.json(response);
          return;
        }

        if (idempotencyEntries.get(key) === existingEntry) {
          idempotencyEntries.delete(key);
        }

        next();
        return;
      }

      const entry = createEntry(ttlMs, now);
      idempotencyEntries.set(key, entry);
      quotaReq.subscriptionQuotaRequestId = entry.quotaRequestId;
      quotaReq.subscriptionQuotaIdempotencyKey = key;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function rememberTextQuotaIdempotency(
  req: Request,
  response: TextQuotaIdempotencyResponse,
): void {
  const quotaReq = req as TextQuotaIdempotencyRequest;
  const key = quotaReq.subscriptionQuotaIdempotencyKey;
  if (!key) {
    return;
  }

  const entry = idempotencyEntries.get(key);
  if (!entry) {
    return;
  }

  entry.response = response;
  entry.expiresAt = Date.now() + entry.ttlMs;
  entry.resolveResponse(response);
}
