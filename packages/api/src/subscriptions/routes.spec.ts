import express from 'express';
import type { Server } from 'http';

import type { SubscriptionPlanView } from './types';
import { createSubscriptionRouter } from './routes';

type TestUser = {
  id: string;
  tenantId?: string | null;
};

type TestRequest = express.Request & {
  user?: TestUser;
};

const plan: SubscriptionPlanView = {
  key: 'pro',
  name: 'Pro',
  description: 'Professional plan',
  price: 29.5,
  durationDays: 30,
  textDailyLimit: 200,
  imageDailyLimit: 50,
  enabled: true,
  sortOrder: 1,
};

const adminOrder = {
  id: 'order-1',
  outTradeNo: 'LC-20260507-1',
  tradeNo: 'zpay-1',
  userId: 'user-1',
  user: {
    id: 'user-1',
    name: 'Ada Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    avatar: 'https://example.com/avatar.png',
  },
  planKey: 'pro',
  amount: 29.5,
  paymentType: 'alipay' as const,
  status: 'completed' as const,
  expiresAt: new Date('2026-05-07T12:00:00.000Z'),
  createdAt: new Date('2026-05-07T10:00:00.000Z'),
  paidAt: new Date('2026-05-07T10:02:00.000Z'),
  completedAt: new Date('2026-05-07T10:03:00.000Z'),
};

function createApp(deps: Parameters<typeof createSubscriptionRouter>[0]) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use('/api/subscriptions', createSubscriptionRouter(deps));
  app.use(
    (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ message: error.message });
    },
  );
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
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { server, baseUrl } = await listen(app);

  try {
    return await fetch(`${baseUrl}${path}`, init);
  } finally {
    await close(server);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

type RouterDeps = Parameters<typeof createSubscriptionRouter>[0];
type AdminSubscriptionRouteDb = RouterDeps['db'];

const requireAdminAccess: express.RequestHandler = (_req, _res, next) => next();

function createDb(overrides: Partial<AdminSubscriptionRouteDb> = {}): AdminSubscriptionRouteDb {
  return {
    getEnabledSubscriptionPlans: async () => [plan],
    findActiveUserSubscription: async () => null,
    consumeSubscriptionQuota: async () => ({
      allowed: true,
      used: 0,
      limit: 200,
      resetAt: new Date('2026-05-03T00:00:00.000Z'),
    }),
    getSubscriptionUsageBucket: async () => null,
    getSubscriptionPaymentOrder: async () => null,
    listSubscriptionPlans: async () => [plan],
    createSubscriptionPlan: async () => plan,
    updateSubscriptionPlan: async () => plan,
    deleteSubscriptionPlan: async () => plan,
    listSubscriptionQuotaExemptions: async () => [],
    createSubscriptionQuotaExemption: async (input) => ({ email: input.email }),
    deleteSubscriptionQuotaExemption: async (email) => ({ email }),
    isSubscriptionQuotaExempt: async () => false,
    listSubscriptionPaymentOrders: async () => [],
    countSubscriptionPaymentOrders: async () => 0,
    ...overrides,
  };
}

function createPaymentService() {
  return {
    createOrder: async () => {
      throw new Error('should not create order');
    },
    handleZPayNotify: async () => {
      throw new Error('should not handle notify');
    },
  };
}

describe('createSubscriptionRouter', () => {
  test('returns plans for the authenticated tenant', async () => {
    const tenantIds: Array<string | undefined> = [];
    const app = createApp({
      db: createDb({
        getEnabledSubscriptionPlans: async (tenantId?: string) => {
          tenantIds.push(tenantId);
          return [plan];
        },
      }),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'user-1', tenantId: 'tenant-a' };
        next();
      },
      requireAdminAccess,
      createPaymentService,
    });

    const response = await requestApp(app, '/api/subscriptions/plans');
    const body = await readJson<(typeof plan)[]>(response);

    expect(response.status).toBe(200);
    expect(tenantIds).toEqual(['tenant-a']);
    expect(body).toEqual([plan]);
  });

  test('returns current subscription status with resolved plan and active subscription', async () => {
    const app = createApp({
      db: createDb({
        findActiveUserSubscription: async () => ({
          planKey: 'pro',
          status: 'active',
          startsAt: new Date('2026-05-01T00:00:00.000Z'),
          expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        }),
      }),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'user-1', tenantId: 'tenant-a' };
        next();
      },
      requireAdminAccess,
      createPaymentService,
    });

    const response = await requestApp(app, '/api/subscriptions/me');
    const body = await readJson<{
      plan: typeof plan;
      subscription: {
        planKey: string;
        status: string;
        startsAt: string;
        expiresAt: string;
      };
      usage: {
        windowKey: string;
        resetAt: string;
        text: { used: number; limit: number };
        image: { used: number; limit: number };
      };
    }>(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      plan,
      subscription: {
        planKey: 'pro',
        status: 'active',
        startsAt: '2026-05-01T00:00:00.000Z',
        expiresAt: '2026-06-01T00:00:00.000Z',
      },
      usage: {
        text: { used: 0, limit: 200 },
        image: { used: 0, limit: 50 },
      },
    });
    expect(typeof body.usage.windowKey).toBe('string');
    expect(typeof body.usage.resetAt).toBe('string');
  });

  test('returns persisted text and image usage in current subscription status', async () => {
    const usageBucketCalls: unknown[] = [];
    const app = createApp({
      db: createDb({
        findActiveUserSubscription: async () => ({
          planKey: 'pro',
          status: 'active',
          startsAt: new Date('2026-05-01T00:00:00.000Z'),
          expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        }),
        getSubscriptionUsageBucket: async (...args: unknown[]) => {
          usageBucketCalls.push(args);
          return {
            textUsed: 7,
            imageUsed: 3,
          };
        },
      }),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'user-1', tenantId: 'tenant-a' };
        next();
      },
      requireAdminAccess,
      createPaymentService,
    });

    const response = await requestApp(app, '/api/subscriptions/me');
    const body = await readJson<{
      usage: {
        windowKey: string;
        text: { used: number; limit: number };
        image: { used: number; limit: number };
      };
    }>(response);

    expect(response.status).toBe(200);
    expect(usageBucketCalls).toEqual([['user-1', body.usage.windowKey, 'tenant-a']]);
    expect(body.usage.text).toEqual({ used: 7, limit: 200 });
    expect(body.usage.image).toEqual({ used: 3, limit: 50 });
  });

  test('creates payment orders using the authenticated user and request ip', async () => {
    const createOrderInputs: unknown[] = [];
    const app = createApp({
      db: createDb(),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'user-1', tenantId: 'tenant-a' };
        next();
      },
      requireAdminAccess,
      createPaymentService: () => ({
        createOrder: async (input: unknown) => {
          createOrderInputs.push(input);
          return {
            orderId: 'order-id-1',
            outTradeNo: 'lc_order_1',
            status: 'pending' as const,
            payUrl: 'https://zpay.example/pay',
            expiresAt: '2026-05-02T01:00:00.000Z',
          };
        },
        handleZPayNotify: async () => {
          throw new Error('should not handle notify');
        },
      }),
    });

    const response = await requestApp(app, '/api/subscriptions/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planKey: 'pro', paymentType: 'alipay', isMobile: true }),
    });
    const body = await readJson<{
      orderId: string;
      outTradeNo: string;
      status: string;
      payUrl: string;
    }>(response);

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      orderId: 'order-id-1',
      outTradeNo: 'lc_order_1',
      status: 'pending',
      payUrl: 'https://zpay.example/pay',
    });
    expect(createOrderInputs[0]).toMatchObject({
      user: { id: 'user-1', tenantId: 'tenant-a' },
      body: { planKey: 'pro', paymentType: 'alipay', isMobile: true },
    });
  });

  test('returns a user-scoped payment order', async () => {
    const orderLookups: unknown[] = [];
    const app = createApp({
      db: createDb({
        getSubscriptionPaymentOrder: async (...args: unknown[]) => {
          orderLookups.push(args);
          return {
            _id: { toString: () => 'order-id-1' },
            outTradeNo: 'lc_order_1',
            status: 'completed',
            planKey: 'pro',
            amount: 29.5,
            payUrl: 'https://zpay.example/pay',
            qrImageUrl: 'https://zpay.example/qrcode/order-id-1.jpg',
            expiresAt: new Date('2026-05-02T01:00:00.000Z'),
            completedAt: new Date('2026-05-02T00:00:00.000Z'),
          };
        },
      }),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'user-1', tenantId: 'tenant-a' };
        next();
      },
      requireAdminAccess,
      createPaymentService,
    });

    const response = await requestApp(app, '/api/subscriptions/orders/order-id-1');
    const body = await readJson<{
      orderId: string;
      outTradeNo: string;
      status: string;
      planKey: string;
      amount: number;
      payUrl: string;
      qrImageUrl: string;
      expiresAt: string;
      completedAt: string;
    }>(response);

    expect(response.status).toBe(200);
    expect(orderLookups).toEqual([['order-id-1', 'user-1', 'tenant-a']]);
    expect(body).toEqual({
      orderId: 'order-id-1',
      outTradeNo: 'lc_order_1',
      status: 'completed',
      payUrl: 'https://zpay.example/pay',
      qrImageUrl: 'https://zpay.example/qrcode/order-id-1.jpg',
      expiresAt: '2026-05-02T01:00:00.000Z',
      planKey: 'pro',
      amount: 29.5,
      completedAt: '2026-05-02T00:00:00.000Z',
    });
  });

  test('handles ZPay webhooks without JWT auth', async () => {
    const rawBodies: string[] = [];
    const app = createApp({
      db: createDb(),
      requireJwtAuth: () => {
        throw new Error('webhook should not require JWT auth');
      },
      requireAdminAccess,
      createPaymentService: () => ({
        createOrder: async () => {
          throw new Error('should not create order');
        },
        handleZPayNotify: async (rawBody: string) => {
          rawBodies.push(rawBody);
        },
      }),
    });

    const response = await requestApp(app, '/api/subscriptions/payment/webhook/zpay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ out_trade_no: 'lc_order_1', trade_no: 'zpay-trade-1' }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('success');
    expect(rawBodies).toEqual(['out_trade_no=lc_order_1&trade_no=zpay-trade-1']);
  });

  test('handles ZPay GET webhooks without JWT auth', async () => {
    const rawBodies: string[] = [];
    const app = createApp({
      db: createDb(),
      requireJwtAuth: () => {
        throw new Error('webhook should not require JWT auth');
      },
      requireAdminAccess,
      createPaymentService: () => ({
        createOrder: async () => {
          throw new Error('should not create order');
        },
        handleZPayNotify: async (rawBody: string) => {
          rawBodies.push(rawBody);
        },
      }),
    });

    const response = await requestApp(
      app,
      '/api/subscriptions/payment/webhook/zpay?out_trade_no=lc_order_1&trade_no=zpay-trade-1',
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('success');
    expect(rawBodies).toEqual(['out_trade_no=lc_order_1&trade_no=zpay-trade-1']);
  });

  test('admin routes manage subscription plans for the authenticated tenant', async () => {
    const allPlans: SubscriptionPlanView[] = [
      plan,
      {
        ...plan,
        key: 'free',
        name: 'Free',
        description: 'Free plan',
        price: 0,
        textDailyLimit: 20,
        imageDailyLimit: 5,
        sortOrder: 0,
      },
    ];
    const listTenantIds: Array<string | undefined> = [];
    const createdPlans: Array<SubscriptionPlanView & { tenantId?: string }> = [];
    const updatedPlans: Array<{
      key: string;
      input: Partial<Omit<SubscriptionPlanView, 'key'>>;
      tenantId?: string;
    }> = [];
    const deletedPlans: Array<{ key: string; tenantId?: string }> = [];
    const patch = { name: 'Updated Free', description: '', enabled: false };
    const app = createApp({
      db: createDb({
        listSubscriptionPlans: async (tenantId?: string) => {
          listTenantIds.push(tenantId);
          return allPlans;
        },
        createSubscriptionPlan: async (input) => {
          createdPlans.push(input);
          return input;
        },
        updateSubscriptionPlan: async (key, input, tenantId) => {
          updatedPlans.push({ key, input, tenantId });
          return { ...allPlans[1], ...input };
        },
        deleteSubscriptionPlan: async (key, tenantId) => {
          deletedPlans.push({ key, tenantId });
          return allPlans[1];
        },
      }),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'admin-1', tenantId: 'tenant-a' };
        next();
      },
      requireAdminAccess,
      createPaymentService,
    });

    const listResponse = await requestApp(app, '/api/subscriptions/admin/plans');
    const createResponse = await requestApp(app, '/api/subscriptions/admin/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(allPlans[1]),
    });
    const updateResponse = await requestApp(app, '/api/subscriptions/admin/plans/free', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const deleteResponse = await requestApp(app, '/api/subscriptions/admin/plans/free', {
      method: 'DELETE',
    });

    expect(listResponse.status).toBe(200);
    expect(await readJson<typeof allPlans>(listResponse)).toEqual(allPlans);
    expect(listTenantIds).toEqual(['tenant-a']);

    expect(createResponse.status).toBe(201);
    expect(await readJson<typeof plan>(createResponse)).toEqual({
      ...allPlans[1],
      tenantId: 'tenant-a',
    });
    expect(createdPlans).toEqual([{ ...allPlans[1], tenantId: 'tenant-a' }]);

    expect(updateResponse.status).toBe(200);
    expect(updatedPlans).toEqual([
      {
        key: 'free',
        input: { name: 'Updated Free', description: undefined, enabled: false },
        tenantId: 'tenant-a',
      },
    ]);
    expect(updatedPlans[0].input).toHaveProperty('description', undefined);

    expect(deleteResponse.status).toBe(200);
    expect(deletedPlans).toEqual([{ key: 'free', tenantId: 'tenant-a' }]);
  });

  test('admin plan routes require admin middleware', async () => {
    const app = createApp({
      db: createDb(),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'admin-1', tenantId: 'tenant-a' };
        next();
      },
      requireAdminAccess: (_req, res) => {
        res.status(403).json({ message: 'admin required' });
      },
      createPaymentService,
    });

    const response = await requestApp(app, '/api/subscriptions/admin/plans');

    expect(response.status).toBe(403);
    expect(await readJson<{ message: string }>(response)).toEqual({ message: 'admin required' });
  });

  test('returns admin payment orders with pagination and tenant scope', async () => {
    const listSubscriptionPaymentOrders = jest.fn().mockResolvedValue([adminOrder]);
    const countSubscriptionPaymentOrders = jest.fn().mockResolvedValue(1);
    const app = createApp({
      db: createDb({ listSubscriptionPaymentOrders, countSubscriptionPaymentOrders }),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'admin-1', tenantId: 'tenant-a' };
        next();
      },
      requireAdminAccess,
      createPaymentService,
    });

    const response = await requestApp(
      app,
      '/api/subscriptions/admin/orders?limit=25&offset=50&status=completed',
    );
    const body = await readJson<{
      orders: Array<{ id: string; status: string; createdAt: string }>;
      total: number;
      limit: number;
      offset: number;
    }>(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      orders: [
        {
          id: 'order-1',
          outTradeNo: 'LC-20260507-1',
          tradeNo: 'zpay-1',
          userId: 'user-1',
          user: {
            id: 'user-1',
            name: 'Ada Lovelace',
            username: 'ada',
            email: 'ada@example.com',
            avatar: 'https://example.com/avatar.png',
          },
          planKey: 'pro',
          amount: 29.5,
          paymentType: 'alipay',
          status: 'completed',
          expiresAt: '2026-05-07T12:00:00.000Z',
          createdAt: '2026-05-07T10:00:00.000Z',
          paidAt: '2026-05-07T10:02:00.000Z',
          completedAt: '2026-05-07T10:03:00.000Z',
        },
      ],
      total: 1,
      limit: 25,
      offset: 50,
    });
    expect(listSubscriptionPaymentOrders).toHaveBeenCalledWith({
      limit: 25,
      offset: 50,
      status: 'completed',
      tenantId: 'tenant-a',
    });
    expect(countSubscriptionPaymentOrders).toHaveBeenCalledWith({
      status: 'completed',
      tenantId: 'tenant-a',
    });
  });

  test('rejects invalid admin payment order status', async () => {
    const app = createApp({
      db: createDb(),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'admin-1' };
        next();
      },
      requireAdminAccess,
      createPaymentService,
    });

    const response = await requestApp(app, '/api/subscriptions/admin/orders?status=not-a-status');
    const body = await readJson<{ message: string }>(response);

    expect(response.status).toBe(400);
    expect(body).toEqual({ message: 'Invalid subscription payment order request' });
  });

  test('runs admin middleware for payment order list', async () => {
    const requireAdminAccessSpy: express.RequestHandler = (_req, res) => {
      res.status(403).json({ message: 'Forbidden' });
    };
    const app = createApp({
      db: createDb(),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'user-1' };
        next();
      },
      requireAdminAccess: requireAdminAccessSpy,
      createPaymentService,
    });

    const response = await requestApp(app, '/api/subscriptions/admin/orders');

    expect(response.status).toBe(403);
  });

  test('admin routes manage quota exemption emails for the authenticated tenant', async () => {
    const exemptions = [{ email: 'vip@example.com' }, { email: 'team@example.com' }];
    const listTenantIds: Array<string | undefined> = [];
    const created: Array<{ email: string; tenantId?: string }> = [];
    const deleted: Array<{ email: string; tenantId?: string }> = [];
    const app = createApp({
      db: createDb({
        listSubscriptionQuotaExemptions: async (tenantId?: string) => {
          listTenantIds.push(tenantId);
          return exemptions;
        },
        createSubscriptionQuotaExemption: async (input) => {
          created.push(input);
          return { email: input.email.trim().toLowerCase(), tenantId: input.tenantId };
        },
        deleteSubscriptionQuotaExemption: async (email, tenantId) => {
          deleted.push({ email, tenantId });
          return { email: email.trim().toLowerCase(), tenantId };
        },
      }),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'admin-1', tenantId: 'tenant-a' };
        next();
      },
      requireAdminAccess,
      createPaymentService,
    });

    const listResponse = await requestApp(app, '/api/subscriptions/admin/quota-exemptions');
    const createResponse = await requestApp(app, '/api/subscriptions/admin/quota-exemptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ' VIP@Example.COM ' }),
    });
    const deleteResponse = await requestApp(
      app,
      '/api/subscriptions/admin/quota-exemptions/VIP%40Example.COM',
      { method: 'DELETE' },
    );

    expect(listResponse.status).toBe(200);
    expect(await readJson<typeof exemptions>(listResponse)).toEqual(exemptions);
    expect(listTenantIds).toEqual(['tenant-a']);

    expect(createResponse.status).toBe(201);
    expect(await readJson<{ email: string; tenantId?: string }>(createResponse)).toEqual({
      email: 'vip@example.com',
      tenantId: 'tenant-a',
    });
    expect(created).toEqual([{ email: 'vip@example.com', tenantId: 'tenant-a' }]);

    expect(deleteResponse.status).toBe(200);
    expect(await readJson<{ email: string; tenantId?: string }>(deleteResponse)).toEqual({
      email: 'vip@example.com',
      tenantId: 'tenant-a',
    });
    expect(deleted).toEqual([{ email: 'vip@example.com', tenantId: 'tenant-a' }]);
  });

  test('admin quota exemption create rejects invalid emails', async () => {
    const app = createApp({
      db: createDb(),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'admin-1', tenantId: 'tenant-a' };
        next();
      },
      requireAdminAccess,
      createPaymentService,
    });

    const response = await requestApp(app, '/api/subscriptions/admin/quota-exemptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });

    expect(response.status).toBe(400);
    expect(await readJson<{ message: string }>(response)).toEqual({
      message: 'Invalid subscription quota exemption request',
    });
  });

  test('admin plan create rejects invalid bodies with a bad request response', async () => {
    const app = createApp({
      db: createDb(),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'admin-1', tenantId: 'tenant-a' };
        next();
      },
      requireAdminAccess,
      createPaymentService,
    });

    const response = await requestApp(app, '/api/subscriptions/admin/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...plan, unknownField: true }),
    });

    expect(response.status).toBe(400);
    expect(await readJson<{ message: string }>(response)).toEqual({
      message: 'Invalid subscription plan request',
    });
  });

  test('admin plan patch rejects tenant changes with a bad request response', async () => {
    const app = createApp({
      db: createDb(),
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'admin-1', tenantId: 'tenant-a' };
        next();
      },
      requireAdminAccess,
      createPaymentService,
    });

    const response = await requestApp(app, '/api/subscriptions/admin/plans/free', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: 'other' }),
    });

    expect(response.status).toBe(400);
    expect(await readJson<{ message: string }>(response)).toEqual({
      message: 'Invalid subscription plan request',
    });
  });
});
