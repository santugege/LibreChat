import type { SubscriptionPaymentDb, SubscriptionPaymentOrder } from './service';
import { createSubscriptionPaymentService } from './service';
import { signEasyPay } from './easypay';

const plan = {
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

const baseOrder: SubscriptionPaymentOrder = {
  _id: 'order-id-1',
  user: 'user-1',
  outTradeNo: 'lc_order_1',
  planKey: 'pro',
  durationDays: 30,
  amount: 29.5,
  paymentType: 'alipay',
  status: 'pending',
  expiresAt: new Date('2026-05-02T00:00:00.000Z'),
  tenantId: 'tenant-a',
};

function setZPayEnv(): void {
  process.env.ZPAY_API_BASE = 'https://zpay.example';
  process.env.ZPAY_PID = '1000';
  process.env.ZPAY_PKEY = 'secret';
  process.env.ZPAY_NOTIFY_URL = 'https://librechat.example/zpay/notify';
  process.env.ZPAY_RETURN_URL = 'https://librechat.example/subscriptions';
}

function createPaymentDb(overrides: Partial<SubscriptionPaymentDb> = {}): SubscriptionPaymentDb {
  return {
    getEnabledSubscriptionPlans: async () => [plan],
    createSubscriptionPaymentOrder: async () => ({ _id: 'unused' }),
    findSubscriptionPaymentOrderByTradeNo: async () => baseOrder,
    markSubscriptionOrderPaid: async () => null,
    markSubscriptionOrderFulfilling: async () => null,
    markSubscriptionOrderCompleted: async () => null,
    markSubscriptionOrderFailed: async () => null,
    markSubscriptionOrderExpired: async () => null,
    createOrExtendUserSubscription: async () => null,
    ...overrides,
  };
}

function mockFetch(
  implementation: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): jest.MockedFunction<typeof fetch> {
  const fetchMock = Object.assign(
    jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(implementation),
    {
      preconnect: jest.fn<
        ReturnType<typeof fetch.preconnect>,
        Parameters<typeof fetch.preconnect>
      >(),
    },
  );
  global.fetch = fetchMock;
  return fetchMock;
}

describe('createSubscriptionPaymentService reconciliation', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setZPayEnv();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.ZPAY_API_BASE;
    delete process.env.ZPAY_PID;
    delete process.env.ZPAY_PKEY;
    delete process.env.ZPAY_NOTIFY_URL;
    delete process.env.ZPAY_RETURN_URL;
    jest.restoreAllMocks();
  });

  test('reconcileOrder is a no-op for completed orders', async () => {
    const fetchMock = mockFetch(async () => {
      throw new Error('should not query ZPay');
    });
    const service = createSubscriptionPaymentService(
      createPaymentDb({
        findSubscriptionPaymentOrderByTradeNo: async () => ({
          ...baseOrder,
          status: 'completed',
          completedAt: new Date('2026-05-02T00:05:00.000Z'),
        }),
      }),
    );

    await expect(service.reconcileOrder('lc_order_1')).resolves.toEqual({
      status: 'completed',
      changed: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('reconcileOrder fulfills an order when ZPay reports it paid', async () => {
    const calls: string[] = [];
    let rawNotify = '';
    let orderLookupCount = 0;
    let subscriptionInput: Parameters<SubscriptionPaymentDb['createOrExtendUserSubscription']>[0];
    mockFetch(async () => {
      return new Response(
        JSON.stringify({
          code: 1,
          status: 1,
          trade_no: 'zpay-trade-1',
          money: '29.50',
        }),
      );
    });
    const db = createPaymentDb({
      findSubscriptionPaymentOrderByTradeNo: async () => {
        orderLookupCount += 1;
        return orderLookupCount <= 2 ? baseOrder : { ...baseOrder, status: 'completed' };
      },
      markSubscriptionOrderPaid: async (_outTradeNo, tradeNo, rawBody) => {
        calls.push(`paid:${tradeNo}`);
        rawNotify = rawBody;
        return { ...baseOrder, status: 'paid', tradeNo };
      },
      markSubscriptionOrderFulfilling: async () => {
        calls.push('fulfilling');
        return { fulfillingAt: new Date('2026-05-02T00:01:00.000Z') };
      },
      createOrExtendUserSubscription: async (input) => {
        calls.push('subscription');
        subscriptionInput = input;
        return { _id: 'subscription-id-1', user: 'user-1', planKey: 'pro' };
      },
      markSubscriptionOrderCompleted: async () => {
        calls.push('completed');
        return { ...baseOrder, status: 'completed' };
      },
    });

    await expect(createSubscriptionPaymentService(db).reconcileOrder('lc_order_1')).resolves.toEqual(
      {
        status: 'completed',
        changed: true,
      },
    );

    const params = Object.fromEntries(new URLSearchParams(rawNotify).entries());
    expect(calls).toEqual(['paid:zpay-trade-1', 'fulfilling', 'subscription', 'completed']);
    expect(params).toMatchObject({
      pid: '1000',
      out_trade_no: 'lc_order_1',
      trade_no: 'zpay-trade-1',
      money: '29.50',
      trade_status: 'TRADE_SUCCESS',
      sign_type: 'MD5',
    });
    expect(params.sign).toBe(signEasyPay(params, 'secret'));
    expect(subscriptionInput!).toMatchObject({
      user: 'user-1',
      planKey: 'pro',
      durationDays: 30,
      sourceOrderId: 'order-id-1',
      tenantId: 'tenant-a',
      planName: 'Pro',
      planDescription: 'Professional plan',
      planAmount: 29.5,
      textDailyLimit: 200,
      imageDailyLimit: 50,
    });
  });
});
