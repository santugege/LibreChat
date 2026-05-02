import express from 'express';
import type { Server } from 'http';

import type {
  ConsumeSubscriptionQuotaInput,
  ConsumeSubscriptionQuotaResult,
} from './quota';
import type { SubscriptionPlanView } from './types';
import { createTextQuotaMiddleware } from './middleware';
import {
  rememberTextQuotaIdempotency,
  createTextQuotaIdempotencyMiddleware,
} from './idempotency';

type TestUser = {
  id?: string | null;
  _id?: string | { toString(): string } | null;
  tenantId?: string | null;
};

type TestRequest = express.Request & {
  user?: TestUser;
};

type TestError = Error & {
  statusCode?: number;
  body?: object;
};

type TextQuotaDb = {
  getEnabledSubscriptionPlans: (tenantId?: string) => Promise<SubscriptionPlanView[]>;
  findActiveUserSubscription: (
    user: string,
    now?: Date,
    tenantId?: string,
  ) => Promise<{ planKey: string } | null>;
  consumeSubscriptionQuota: (
    input: ConsumeSubscriptionQuotaInput,
  ) => Promise<ConsumeSubscriptionQuotaResult>;
};

const freePlan: SubscriptionPlanView = {
  key: 'free',
  name: 'Free',
  price: 0,
  durationDays: 0,
  textDailyLimit: 9,
  imageDailyLimit: 3,
  enabled: true,
  sortOrder: 0,
};

function createDb(overrides: Partial<TextQuotaDb> = {}): TextQuotaDb {
  return {
    getEnabledSubscriptionPlans: async () => [freePlan],
    findActiveUserSubscription: async () => null,
    consumeSubscriptionQuota: async (input) => ({
      allowed: true,
      used: input.amount,
      limit: input.limit,
      resetAt: input.windowEnd,
    }),
    ...overrides,
  };
}

function createApp(db: TextQuotaDb, user?: TestUser): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as TestRequest).user = user;
    next();
  });
  app.post('/chat', createTextQuotaMiddleware(db), (_req, res) => {
    res.status(204).end();
  });
  app.use((error: TestError, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    let body: object = error.body ?? { message: error.message };
    try {
      body = error.body ?? (JSON.parse(error.message) as object);
    } catch {
      body = error.body ?? { message: error.message };
    }
    res.status(error.statusCode ?? 500).json(body);
  });
  return app;
}

function createApiApp(
  db: TextQuotaDb,
  errorFormat: 'openai' | 'responses',
  user?: TestUser,
  options: { requestIdPolicy?: 'chat' | 'generated' } = {},
): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as TestRequest).user = user;
    next();
  });
  app.post(
    '/chat',
    createTextQuotaMiddleware(db, {
      errorFormat,
      ...options,
    }),
    (_req, res) => {
      res.status(204).end();
    },
  );
  app.use((error: TestError, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json(error.body ?? { message: error.message });
  });
  return app;
}

function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0);
    server.once('error', reject);
    server.once('listening', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        reject(new Error('Expected TCP test server address'));
        return;
      }

      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function requestApp(
  app: express.Express,
  body: object = {},
): Promise<Response> {
  const { server, baseUrl } = await listen(app);

  try {
    return await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } finally {
    await close(server);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('createTextQuotaMiddleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SUBSCRIPTIONS_ENABLED: 'true',
      SUBSCRIPTION_QUOTA_TIMEZONE: 'America/New_York',
      SUBSCRIPTION_FREE_TEXT_DAILY_LIMIT: '20',
      SUBSCRIPTION_FREE_IMAGE_DAILY_LIMIT: '2',
    };
    jest.useFakeTimers().setSystemTime(new Date('2026-05-02T01:30:00.000Z'));
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
  });

  test('skips quota consumption when subscriptions are disabled', async () => {
    process.env.SUBSCRIPTIONS_ENABLED = 'false';
    let calls = 0;
    const db = createDb({
      getEnabledSubscriptionPlans: async () => {
        calls += 1;
        return [freePlan];
      },
      consumeSubscriptionQuota: async (input) => {
        calls += 1;
        return {
          allowed: true,
          used: input.amount,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    });
    const app = createApp(db, { id: 'user-1', tenantId: 'tenant-a' });

    const response = await requestApp(app, { messageId: 'message-1' });

    expect(response.status).toBe(204);
    expect(calls).toBe(0);
  });

  test('skips quota consumption when no authenticated user is present', async () => {
    let calls = 0;
    const db = createDb({
      getEnabledSubscriptionPlans: async () => {
        calls += 1;
        return [freePlan];
      },
      consumeSubscriptionQuota: async (input) => {
        calls += 1;
        return {
          allowed: true,
          used: input.amount,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    });
    const app = createApp(db);

    const response = await requestApp(app, { messageId: 'message-1' });

    expect(response.status).toBe(204);
    expect(calls).toBe(0);
  });

  test('consumes one text request for the authenticated tenant using a server-generated id', async () => {
    const planTenantIds: Array<string | undefined> = [];
    const subscriptionLookups: Array<[string, string | undefined]> = [];
    const quotaInputs: ConsumeSubscriptionQuotaInput[] = [];
    const db = createDb({
      getEnabledSubscriptionPlans: async (tenantId) => {
        planTenantIds.push(tenantId);
        return [freePlan];
      },
      findActiveUserSubscription: async (user, _now, tenantId) => {
        subscriptionLookups.push([user, tenantId]);
        return null;
      },
      consumeSubscriptionQuota: async (input) => {
        quotaInputs.push(input);
        return {
          allowed: true,
          used: input.amount,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    });
    const app = createApp(db, { id: 'user-1', tenantId: 'tenant-a' });

    const response = await requestApp(app, {
      messageId: 'message-1',
      conversationId: 'conversation-1',
    });

    expect(response.status).toBe(204);
    expect(planTenantIds).toEqual(['tenant-a']);
    expect(subscriptionLookups).toEqual([['user-1', 'tenant-a']]);
    expect(quotaInputs).toHaveLength(1);
    expect(quotaInputs[0]).toMatchObject({
      user: 'user-1',
      tenantId: 'tenant-a',
      kind: 'text',
      amount: 1,
      limit: freePlan.textDailyLimit,
      windowKey: '2026-05-01',
    });
    expect(quotaInputs[0]?.requestId).toEqual(expect.stringMatching(/^conversation-1:/));
    expect(quotaInputs[0]?.requestId).not.toBe('message-1');
  });

  test('counts repeated client messageIds as separate default chat requests', async () => {
    const consumedRequestIds = new Set<string>();
    let used = 0;
    const db = createDb({
      consumeSubscriptionQuota: async (input) => {
        if (!consumedRequestIds.has(input.requestId)) {
          consumedRequestIds.add(input.requestId);
          used += input.amount;
        }

        return {
          allowed: true,
          used,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    });
    const app = createApp(db, { id: 'user-1' });
    const body = {
      messageId: 'client-reused-id',
      conversationId: 'conversation-replay',
    };

    const firstResponse = await requestApp(app, body);
    const secondResponse = await requestApp(app, body);

    expect(firstResponse.status).toBe(204);
    expect(secondResponse.status).toBe(204);
    expect(used).toBe(2);
    expect(consumedRequestIds.size).toBe(2);
    expect(consumedRequestIds.has('client-reused-id')).toBe(false);
  });

  test('reuses quota and stream response for identical chat start retries', async () => {
    let controllerCalls = 0;
    const requestIds: string[] = [];
    const db = createDb({
      consumeSubscriptionQuota: async (input) => {
        requestIds.push(input.requestId);
        return {
          allowed: true,
          used: requestIds.length,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as TestRequest).user = { id: 'user-1' };
      next();
    });
    app.post(
      '/chat',
      createTextQuotaIdempotencyMiddleware({ ttlMs: 60_000 }),
      createTextQuotaMiddleware(db),
      (req, res) => {
        controllerCalls += 1;
        const response = {
          streamId: 'stream-retry-1',
          conversationId: 'conversation-retry',
          status: 'started',
        };
        rememberTextQuotaIdempotency(req, response);
        res.json(response);
      },
    );
    const body = {
      text: 'hello',
      messageId: 'retry-message-id',
      conversationId: 'conversation-retry',
    };

    const firstResponse = await requestApp(app, body);
    const secondResponse = await requestApp(app, body);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(await readJson(firstResponse)).toEqual({
      streamId: 'stream-retry-1',
      conversationId: 'conversation-retry',
      status: 'started',
    });
    expect(await readJson(secondResponse)).toEqual({
      streamId: 'stream-retry-1',
      conversationId: 'conversation-retry',
      status: 'started',
    });
    expect(controllerCalls).toBe(1);
    expect(requestIds).toHaveLength(1);
    expect(requestIds[0]).not.toBe('retry-message-id');
  });

  test('waits for the first in-flight chat start instead of starting a duplicate generation', async () => {
    jest.useRealTimers();
    let controllerCalls = 0;
    const releaseControllers: Array<() => void> = [];
    let markControllerEntered: (() => void) | undefined;
    const controllerEntered = new Promise<void>((resolve) => {
      markControllerEntered = resolve;
    });
    const requestIds: string[] = [];
    const db = createDb({
      consumeSubscriptionQuota: async (input) => {
        requestIds.push(input.requestId);
        return {
          allowed: true,
          used: requestIds.length,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as TestRequest).user = { id: 'user-1' };
      next();
    });
    app.post(
      '/chat',
      createTextQuotaIdempotencyMiddleware({ ttlMs: 60_000 }),
      createTextQuotaMiddleware(db),
      async (req, res) => {
        controllerCalls += 1;
        markControllerEntered?.();
        await new Promise<void>((resolve) => {
          releaseControllers.push(resolve);
        });
        const response = {
          streamId: 'stream-in-flight-1',
          conversationId: 'conversation-in-flight',
          status: 'started',
        };
        rememberTextQuotaIdempotency(req, response);
        res.json(response);
      },
    );
    const body = {
      text: 'hello',
      messageId: 'in-flight-message-id',
      conversationId: 'conversation-in-flight',
    };
    const { server, baseUrl } = await listen(app);

    try {
      const firstResponsePromise = fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await controllerEntered;
      const secondResponsePromise = fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(controllerCalls).toBe(1);
      releaseControllers.splice(0).forEach((releaseController) => releaseController());

      const [firstResponse, secondResponse] = await Promise.all([
        firstResponsePromise,
        secondResponsePromise,
      ]);

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      expect(await readJson(firstResponse)).toEqual({
        streamId: 'stream-in-flight-1',
        conversationId: 'conversation-in-flight',
        status: 'started',
      });
      expect(await readJson(secondResponse)).toEqual({
        streamId: 'stream-in-flight-1',
        conversationId: 'conversation-in-flight',
        status: 'started',
      });
      expect(controllerCalls).toBe(1);
      expect(requestIds).toHaveLength(1);
      expect(requestIds[0]).not.toBe('in-flight-message-id');
    } finally {
      releaseControllers.splice(0).forEach((releaseController) => releaseController());
      await close(server);
      jest.useFakeTimers().setSystemTime(new Date('2026-05-02T01:30:00.000Z'));
    }
  });

  test('does not reuse quota when the same client messageId has different chat payload', async () => {
    let controllerCalls = 0;
    const requestIds: string[] = [];
    const db = createDb({
      consumeSubscriptionQuota: async (input) => {
        requestIds.push(input.requestId);
        return {
          allowed: true,
          used: requestIds.length,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as TestRequest).user = { id: 'user-1' };
      next();
    });
    app.post(
      '/chat',
      createTextQuotaIdempotencyMiddleware({ ttlMs: 60_000 }),
      createTextQuotaMiddleware(db),
      (req, res) => {
        controllerCalls += 1;
        const response = {
          streamId: `stream-${controllerCalls}`,
          conversationId: 'conversation-retry',
          status: 'started',
        };
        rememberTextQuotaIdempotency(req, response);
        res.json(response);
      },
    );

    const firstResponse = await requestApp(app, {
      text: 'hello',
      messageId: 'changed-payload-message-id',
      conversationId: 'conversation-changed-payload',
    });
    const secondResponse = await requestApp(app, {
      text: 'different prompt',
      messageId: 'changed-payload-message-id',
      conversationId: 'conversation-changed-payload',
    });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(await readJson(firstResponse)).toMatchObject({ streamId: 'stream-1' });
    expect(await readJson(secondResponse)).toMatchObject({ streamId: 'stream-2' });
    expect(controllerCalls).toBe(2);
    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).not.toBe(requestIds[1]);
    expect(requestIds).not.toContain('changed-payload-message-id');
  });

  test('does not reuse chat starts when subscriptions are disabled', async () => {
    process.env.SUBSCRIPTIONS_ENABLED = 'false';
    let controllerCalls = 0;
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as TestRequest).user = { id: 'user-1' };
      next();
    });
    app.post('/chat', createTextQuotaIdempotencyMiddleware({ ttlMs: 60_000 }), (req, res) => {
      controllerCalls += 1;
      const response = {
        streamId: `stream-disabled-${controllerCalls}`,
        conversationId: 'conversation-disabled',
        status: 'started',
      };
      rememberTextQuotaIdempotency(req, response);
      res.json(response);
    });
    const body = {
      text: 'hello',
      messageId: 'disabled-message-id',
      conversationId: 'conversation-disabled',
    };

    const firstResponse = await requestApp(app, body);
    const secondResponse = await requestApp(app, body);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(await readJson(firstResponse)).toMatchObject({ streamId: 'stream-disabled-1' });
    expect(await readJson(secondResponse)).toMatchObject({ streamId: 'stream-disabled-2' });
    expect(controllerCalls).toBe(2);
  });

  test('forwards a structured quota error when the text limit is exhausted', async () => {
    const resetAt = new Date('2026-05-02T04:00:00.000Z');
    const db = createDb({
      consumeSubscriptionQuota: async (input) => ({
        allowed: false,
        used: input.limit,
        limit: input.limit,
        resetAt,
      }),
    });
    const app = createApp(db, { id: 'user-1' });

    const response = await requestApp(app, { messageId: 'message-2' });
    const body = await readJson<{
      type: string;
      text: string;
      kind: string;
      used: number;
      limit: number;
      planKey: string;
      resetAt: string;
    }>(response);

    expect(response.status).toBe(429);
    expect(body).toEqual({
      type: 'subscription_quota',
      text: JSON.stringify({
        type: 'subscription_quota',
        kind: 'text',
        used: freePlan.textDailyLimit,
        limit: freePlan.textDailyLimit,
        planKey: 'free',
        resetAt: resetAt.toISOString(),
      }),
      kind: 'text',
      used: freePlan.textDailyLimit,
      limit: freePlan.textDailyLimit,
      planKey: 'free',
      resetAt: resetAt.toISOString(),
    });
  });

  test('formats quota denial with an OpenAI-compatible error envelope when requested', async () => {
    const resetAt = new Date('2026-05-02T04:00:00.000Z');
    const db = createDb({
      consumeSubscriptionQuota: async (input) => ({
        allowed: false,
        used: input.limit,
        limit: input.limit,
        resetAt,
      }),
    });
    const app = createApiApp(db, 'openai', { id: 'user-1' });

    const response = await requestApp(app, { messageId: 'message-2' });
    const body = await readJson<{
      error: {
        message: string;
        type: string;
        param: null;
        code: string;
      };
      type: string;
      text: string;
      subscriptionQuota: {
        type: string;
        kind: string;
        used: number;
        limit: number;
        planKey: string;
        resetAt: string;
      };
    }>(response);

    expect(response.status).toBe(429);
    expect(body).toEqual({
      error: {
        message:
          'Daily text quota reached for the free plan. Used 9 of 9. Resets at 2026-05-02T04:00:00.000Z.',
        type: 'rate_limit_error',
        param: null,
        code: 'subscription_quota',
      },
      type: 'subscription_quota',
      text: JSON.stringify({
        type: 'subscription_quota',
        kind: 'text',
        used: freePlan.textDailyLimit,
        limit: freePlan.textDailyLimit,
        planKey: 'free',
        resetAt: resetAt.toISOString(),
      }),
      subscriptionQuota: {
        type: 'subscription_quota',
        kind: 'text',
        used: freePlan.textDailyLimit,
        limit: freePlan.textDailyLimit,
        planKey: 'free',
        resetAt: resetAt.toISOString(),
      },
    });
  });

  test('formats quota denial with an Open Responses-compatible error envelope when requested', async () => {
    const resetAt = new Date('2026-05-02T04:00:00.000Z');
    const db = createDb({
      consumeSubscriptionQuota: async (input) => ({
        allowed: false,
        used: input.limit,
        limit: input.limit,
        resetAt,
      }),
    });
    const app = createApiApp(db, 'responses', { id: 'user-1' });

    const response = await requestApp(app, { messageId: 'message-2' });
    const body = await readJson<{
      error: {
        type: string;
        code: string;
      };
    }>(response);

    expect(response.status).toBe(429);
    expect(body.error).toMatchObject({
      type: 'too_many_requests',
      code: 'subscription_quota',
    });
  });

  test('generates server-side request ids when requested even if the client sends messageId', async () => {
    const requestIds: string[] = [];
    const db = createDb({
      consumeSubscriptionQuota: async (input) => {
        requestIds.push(input.requestId);
        return {
          allowed: true,
          used: input.amount,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    });
    const app = createApiApp(db, 'openai', { id: 'user-1' }, {
      requestIdPolicy: 'generated',
    });
    const body = { messageId: 'client-controlled-id' };

    const firstResponse = await requestApp(app, body);
    const secondResponse = await requestApp(app, body);

    expect(firstResponse.status).toBe(204);
    expect(secondResponse.status).toBe(204);
    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).toEqual(expect.any(String));
    expect(requestIds[1]).toEqual(expect.any(String));
    expect(requestIds).not.toContain('client-controlled-id');
    expect(requestIds[0]).not.toBe(requestIds[1]);
  });

  test('generates conversation-scoped request ids when messageId is absent', async () => {
    const requestIds: string[] = [];
    const db = createDb({
      consumeSubscriptionQuota: async (input) => {
        requestIds.push(input.requestId);
        return {
          allowed: true,
          used: input.amount,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    });
    const app = createApp(db, { id: 'user-1' });

    const firstResponse = await requestApp(app, { conversationId: 'conversation-2' });
    const secondResponse = await requestApp(app, { conversationId: 'conversation-2' });

    expect(firstResponse.status).toBe(204);
    expect(secondResponse.status).toBe(204);
    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).toEqual(expect.stringMatching(/^conversation-2:/));
    expect(requestIds[1]).toEqual(expect.stringMatching(/^conversation-2:/));
    expect(requestIds[0]).not.toBe(requestIds[1]);
  });

  test('generates a fresh request id for continued chat turns that reuse the original messageId', async () => {
    const requestIds: string[] = [];
    const db = createDb({
      consumeSubscriptionQuota: async (input) => {
        requestIds.push(input.requestId);
        return {
          allowed: true,
          used: input.amount,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    });
    const app = createApp(db, { id: 'user-1' });
    const body = {
      messageId: 'original-message-id',
      conversationId: 'conversation-continued',
      isContinued: true,
    };

    const firstResponse = await requestApp(app, body);
    const secondResponse = await requestApp(app, body);

    expect(firstResponse.status).toBe(204);
    expect(secondResponse.status).toBe(204);
    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).toEqual(expect.stringMatching(/^conversation-continued:/));
    expect(requestIds[1]).toEqual(expect.stringMatching(/^conversation-continued:/));
    expect(requestIds).not.toContain('original-message-id');
    expect(requestIds[0]).not.toBe(requestIds[1]);
  });

  test('generates a request id when the request body has no stable id', async () => {
    const requestIds: string[] = [];
    const db = createDb({
      consumeSubscriptionQuota: async (input) => {
        requestIds.push(input.requestId);
        return {
          allowed: true,
          used: input.amount,
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      },
    });
    const app = createApp(db, { id: 'user-1' });

    const response = await requestApp(app);

    expect(response.status).toBe(204);
    expect(requestIds).toHaveLength(1);
    expect(requestIds[0]).toEqual(expect.any(String));
    expect(requestIds[0]).not.toHaveLength(0);
  });

  test('falls back to user _id when id is not present', async () => {
    const users: string[] = [];
    const db = createDb({
      findActiveUserSubscription: async (user) => {
        users.push(user);
        return null;
      },
    });
    const app = createApp(db, { _id: { toString: () => 'mongo-user-1' } });

    const response = await requestApp(app, { messageId: 'message-3' });

    expect(response.status).toBe(204);
    expect(users).toEqual(['mongo-user-1']);
  });
});
