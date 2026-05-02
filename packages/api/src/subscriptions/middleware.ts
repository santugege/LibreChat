import { randomUUID } from 'crypto';
import type { Request, RequestHandler } from 'express';

import type { QuotaServiceDeps } from './quota';
import type { SubscriptionQuotaError } from './types';
import { getSubscriptionConfig } from './config';
import { createQuotaService } from './quota';

type ObjectIdLike = {
  toString: () => string;
};

type QuotaRequestUser = {
  id?: string | null;
  _id?: string | ObjectIdLike | null;
  tenantId?: string | null;
};

type ChatQuotaBody = {
  messageId?: string | null;
  conversationId?: string | null;
  isContinued?: boolean | null;
};

type QuotaRequest = Request<Record<string, string>, object, ChatQuotaBody | undefined> & {
  user?: QuotaRequestUser;
  subscriptionQuotaRequestId?: string;
};

type TextQuotaErrorFormat = 'chat' | 'openai' | 'responses';
type TextQuotaRequestIdPolicy = 'chat' | 'generated';

type SubscriptionQuotaChatErrorBody = SubscriptionQuotaError & {
  text: string;
};

type SubscriptionQuotaApiErrorBody = {
  type: 'subscription_quota';
  text: string;
  subscriptionQuota: SubscriptionQuotaError;
  error: {
    message: string;
    type: 'rate_limit_error' | 'too_many_requests';
    param: null;
    code: 'subscription_quota';
  };
};

type SubscriptionQuotaHttpError = Error & {
  statusCode: 429;
  body: SubscriptionQuotaChatErrorBody | SubscriptionQuotaApiErrorBody;
};

export type TextQuotaMiddlewareDb = {
  getEnabledSubscriptionPlans: QuotaServiceDeps['getPlans'];
  findActiveUserSubscription: QuotaServiceDeps['findActiveUserSubscription'];
  consumeSubscriptionQuota: QuotaServiceDeps['consumeSubscriptionQuota'];
};

export type TextQuotaMiddlewareOptions = {
  errorFormat?: TextQuotaErrorFormat;
  requestIdPolicy?: TextQuotaRequestIdPolicy;
};

function readNonemptyString(value?: string | null): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  return value;
}

function readIdentifier(value?: string | ObjectIdLike | null): string | undefined {
  if (typeof value === 'string') {
    return readNonemptyString(value);
  }

  return readNonemptyString(value?.toString());
}

function getUserId(req: QuotaRequest): string | undefined {
  return readIdentifier(req.user?.id) ?? readIdentifier(req.user?._id);
}

function getTenantId(req: QuotaRequest): string | undefined {
  return readNonemptyString(req.user?.tenantId);
}

function getGeneratedRequestId(body?: ChatQuotaBody): string {
  const conversationId = readNonemptyString(body?.conversationId);
  if (conversationId) {
    return `${conversationId}:${randomUUID()}`;
  }

  return randomUUID();
}

function getRequestId(
  body?: ChatQuotaBody,
  requestIdPolicy: TextQuotaRequestIdPolicy = 'generated',
): string {
  if (requestIdPolicy === 'generated' || body?.isContinued === true) {
    return getGeneratedRequestId(body);
  }

  const messageId = readNonemptyString(body?.messageId);
  if (messageId) {
    return messageId;
  }

  return getGeneratedRequestId(body);
}

function createQuotaMessage(error: SubscriptionQuotaError): string {
  return `Daily ${error.kind} quota reached for the ${error.planKey} plan. Used ${error.used} of ${error.limit}. Resets at ${error.resetAt}.`;
}

function createQuotaErrorBody(
  error: SubscriptionQuotaError,
  errorFormat: TextQuotaErrorFormat,
): SubscriptionQuotaChatErrorBody | SubscriptionQuotaApiErrorBody {
  const text = JSON.stringify(error);
  if (errorFormat === 'chat') {
    return {
      ...error,
      text,
    };
  }

  return {
    type: 'subscription_quota',
    text,
    subscriptionQuota: error,
    error: {
      message: createQuotaMessage(error),
      type: errorFormat === 'openai' ? 'rate_limit_error' : 'too_many_requests',
      param: null,
      code: 'subscription_quota',
    },
  };
}

function createQuotaHttpError(
  error: SubscriptionQuotaError,
  errorFormat: TextQuotaErrorFormat,
): SubscriptionQuotaHttpError {
  const httpError = new Error(JSON.stringify(error)) as SubscriptionQuotaHttpError;
  httpError.statusCode = 429;
  httpError.body = createQuotaErrorBody(error, errorFormat);
  return httpError;
}

export function createTextQuotaMiddleware(
  db: TextQuotaMiddlewareDb,
  options: TextQuotaMiddlewareOptions = {},
): RequestHandler {
  const quotaDeps: QuotaServiceDeps = {
    getPlans: db.getEnabledSubscriptionPlans,
    findActiveUserSubscription: db.findActiveUserSubscription,
    consumeSubscriptionQuota: db.consumeSubscriptionQuota,
  };
  const errorFormat = options.errorFormat ?? 'chat';
  const requestIdPolicy = options.requestIdPolicy ?? 'generated';

  return async (req, _res, next) => {
    try {
      const config = getSubscriptionConfig();
      if (!config.enabled) {
        next();
        return;
      }

      const quotaReq = req as QuotaRequest;
      const userId = getUserId(quotaReq);
      if (!userId) {
        next();
        return;
      }

      const tenantId = getTenantId(quotaReq);
      const quota = createQuotaService(quotaDeps, config);
      const requestId =
        readNonemptyString(quotaReq.subscriptionQuotaRequestId) ??
        getRequestId(quotaReq.body, requestIdPolicy);
      const result = await quota.consume({
        userId,
        kind: 'text',
        amount: 1,
        requestId,
        timezone: config.timezone,
        ...(tenantId !== undefined ? { tenantId } : {}),
      });

      if (!result.allowed) {
        next(createQuotaHttpError(result.error, errorFormat));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
