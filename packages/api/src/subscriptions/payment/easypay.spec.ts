import type { SubscriptionPaymentDb } from './service';
import { signEasyPay, verifyEasyPayNotify } from './easypay';
import { createSubscriptionPaymentService } from './service';

describe('EasyPay ZPay helpers', () => {
  test('signs sorted parameters and omits signature metadata and empty values', () => {
    const sign = signEasyPay(
      {
        pid: '1000',
        type: 'alipay',
        out_trade_no: 'lc_1',
        money: '29.00',
        sign: 'ignored',
        sign_type: 'MD5',
        empty: '',
      },
      'secret',
    );

    expect(sign).toBe('129c9a2c8e3b2ea7b3eed67fa11a6a33');
    expect(sign).toHaveLength(32);
    expect(sign).toMatch(/^[a-f0-9]{32}$/);
  });

  test('verifies successful ZPay notification', () => {
    const payload = {
      pid: '1000',
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_1',
      money: '29.00',
      trade_status: 'TRADE_SUCCESS',
    };
    const sign = signEasyPay(payload, 'secret');
    const body = new URLSearchParams({ ...payload, sign, sign_type: 'MD5' }).toString();

    const notify = verifyEasyPayNotify(body, 'secret');

    expect(notify).toEqual({
      pid: '1000',
      outTradeNo: 'lc_1',
      tradeNo: 'zpay-trade-1',
      amount: 29,
      success: true,
      rawBody: body,
    });
  });

  test('rejects notifications without a signature', () => {
    const body = new URLSearchParams({
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_1',
      money: '29.00',
      trade_status: 'TRADE_SUCCESS',
    }).toString();

    expect(() => verifyEasyPayNotify(body, 'secret')).toThrow('Missing EasyPay signature');
  });

  test('rejects notifications with an invalid signature', () => {
    const payload = {
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_1',
      money: '29.00',
      trade_status: 'TRADE_SUCCESS',
    };
    const body = new URLSearchParams({
      ...payload,
      sign: 'bad',
      sign_type: 'MD5',
    }).toString();

    expect(() => verifyEasyPayNotify(body, 'secret')).toThrow('Invalid EasyPay signature');
  });

  test('rejects notifications with invalid amount', () => {
    const payload = {
      pid: '1000',
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_1',
      money: 'not-a-number',
      trade_status: 'TRADE_SUCCESS',
    };
    const sign = signEasyPay(payload, 'secret');
    const body = new URLSearchParams({ ...payload, sign, sign_type: 'MD5' }).toString();

    expect(() => verifyEasyPayNotify(body, 'secret')).toThrow('Invalid EasyPay amount');
  });

  test('rejects notifications without MD5 sign type', () => {
    const payload = {
      pid: '1000',
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_1',
      money: '29.00',
      trade_status: 'TRADE_SUCCESS',
    };
    const sign = signEasyPay(payload, 'secret');
    const body = new URLSearchParams({ ...payload, sign }).toString();

    expect(() => verifyEasyPayNotify(body, 'secret')).toThrow('Invalid EasyPay sign_type');
  });

  test.each([
    ['pid', 'Missing EasyPay pid'],
    ['trade_no', 'Missing EasyPay trade_no'],
    ['out_trade_no', 'Missing EasyPay out_trade_no'],
  ])('rejects notifications missing %s', (field, errorMessage) => {
    const payload = {
      pid: '1000',
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_1',
      money: '29.00',
      trade_status: 'TRADE_SUCCESS',
    };
    const params = { ...payload, [field]: '' };
    const sign = signEasyPay(params, 'secret');
    const body = new URLSearchParams({ ...params, sign, sign_type: 'MD5' }).toString();

    expect(() => verifyEasyPayNotify(body, 'secret')).toThrow(errorMessage);
  });

  test.each([
    ['missing status', undefined],
    ['unknown status', 'WAIT_BUYER_PAY'],
  ])('rejects notifications with %s', (_label, tradeStatus) => {
    const payload = {
      pid: '1000',
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_1',
      money: '29.00',
      ...(tradeStatus ? { trade_status: tradeStatus } : {}),
    };
    const sign = signEasyPay(payload, 'secret');
    const body = new URLSearchParams({ ...payload, sign, sign_type: 'MD5' }).toString();

    expect(() => verifyEasyPayNotify(body, 'secret')).toThrow('Invalid EasyPay trade_status');
  });
});

const plan = {
  key: 'pro',
  name: 'Pro',
  price: 29.5,
  durationDays: 30,
  textDailyLimit: 200,
  imageDailyLimit: 50,
  enabled: true,
  sortOrder: 1,
};
const fulfillmentLock = { fulfillingAt: new Date('2026-05-02T00:00:00.000Z') };
const fulfilledSubscription = { _id: 'subscription-id-1', user: 'user-1', planKey: 'pro' };

function setZPayEnv(): void {
  process.env.ZPAY_API_BASE = 'https://zpay.example///';
  process.env.ZPAY_PID = '1000';
  process.env.ZPAY_PKEY = 'secret';
  process.env.ZPAY_NOTIFY_URL = 'https://librechat.example/zpay/notify';
  process.env.ZPAY_RETURN_URL = 'https://librechat.example/subscriptions';
}

function createPaymentDb(overrides: Partial<SubscriptionPaymentDb> = {}): SubscriptionPaymentDb {
  return {
    getEnabledSubscriptionPlans: async () => [plan],
    createSubscriptionPaymentOrder: async () => ({ _id: 'order-id-1' }),
    findSubscriptionPaymentOrderByTradeNo: async () => null,
    markSubscriptionOrderPaid: async () => null,
    markSubscriptionOrderFulfilling: async () => null,
    markSubscriptionOrderCompleted: async () => null,
    markSubscriptionOrderFailed: async () => null,
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

describe('createSubscriptionPaymentService', () => {
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

  test('creates a signed ZPay order and persists the pending payment order', async () => {
    const createdOrders: Parameters<SubscriptionPaymentDb['createSubscriptionPaymentOrder']>[0][] =
      [];
    let receivedTenantId: string | undefined;
    const fetchMock = mockFetch(async () => {
      return new Response(
        JSON.stringify({
          code: 1,
          trade_no: 'zpay-trade-1',
          payurl: 'https://zpay.example/pay',
          payurl2: 'https://zpay.example/mobile',
          qrcode: 'https://zpay.example/qr',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    });
    const db: SubscriptionPaymentDb = {
      getEnabledSubscriptionPlans: async (tenantId) => {
        receivedTenantId = tenantId;
        return [plan];
      },
      createSubscriptionPaymentOrder: async (input) => {
        createdOrders.push(input);
        return { _id: 'order-id-1' };
      },
      findSubscriptionPaymentOrderByTradeNo: async () => null,
      markSubscriptionOrderPaid: async () => null,
      markSubscriptionOrderFulfilling: async () => null,
      markSubscriptionOrderCompleted: async () => null,
      markSubscriptionOrderFailed: async () => null,
      createOrExtendUserSubscription: async () => null,
    };

    const service = createSubscriptionPaymentService(db);
    const result = await service.createOrder({
      user: { id: 'user-1', tenantId: 'tenant-a' },
      body: { planKey: 'pro', paymentType: 'alipay', isMobile: true },
      ip: '203.0.113.5',
    });
    const [, fetchInit] = fetchMock.mock.calls[0];
    const body = fetchInit?.body;

    if (!(body instanceof URLSearchParams)) {
      throw new Error('Expected URLSearchParams request body');
    }

    expect(receivedTenantId).toBe('tenant-a');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://zpay.example/mapi.php',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(body.get('money')).toBe('29.50');
    expect(body.get('sign_type')).toBe('MD5');
    expect(body.get('sign')).toBe(
      signEasyPay(
        {
          pid: '1000',
          type: 'alipay',
          out_trade_no: body.get('out_trade_no') ?? '',
          notify_url: 'https://librechat.example/zpay/notify',
          return_url: 'https://librechat.example/subscriptions',
          name: 'Pro',
          money: '29.50',
          clientip: '203.0.113.5',
          device: 'mobile',
        },
        'secret',
      ),
    );
    expect(createdOrders).toHaveLength(1);
    expect(createdOrders[0]).toMatchObject({
      user: 'user-1',
      tenantId: 'tenant-a',
      tradeNo: 'zpay-trade-1',
      planKey: 'pro',
      durationDays: 30,
      amount: 29.5,
      paymentType: 'alipay',
      status: 'pending',
      payUrl: 'https://zpay.example/mobile',
      qrCode: 'https://zpay.example/qr',
    });
    expect(result).toMatchObject({
      orderId: 'order-id-1',
      outTradeNo: createdOrders[0].outTradeNo,
      status: 'pending',
      payUrl: 'https://zpay.example/mobile',
      qrCode: 'https://zpay.example/qr',
    });
  });

  test('rejects malformed ZPay order responses before persisting an order', async () => {
    const createdOrders: Parameters<SubscriptionPaymentDb['createSubscriptionPaymentOrder']>[0][] =
      [];
    mockFetch(async () => {
      return new Response('not-json', { headers: { 'Content-Type': 'application/json' } });
    });
    const db = createPaymentDb({
      createSubscriptionPaymentOrder: async (input) => {
        createdOrders.push(input);
        return { _id: 'order-id-1' };
      },
    });

    await expect(
      createSubscriptionPaymentService(db).createOrder({
        user: { id: 'user-1' },
        body: { planKey: 'pro', paymentType: 'alipay' },
      }),
    ).rejects.toThrow('ZPay order creation returned invalid JSON');

    expect(createdOrders).toHaveLength(0);
  });

  test('returns the ZPay error message from string error responses', async () => {
    const createdOrders: Parameters<SubscriptionPaymentDb['createSubscriptionPaymentOrder']>[0][] =
      [];
    mockFetch(async () => {
      return new Response(JSON.stringify({ code: 'error', msg: '商户状态异常' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const db = createPaymentDb({
      createSubscriptionPaymentOrder: async (input) => {
        createdOrders.push(input);
        return { _id: 'order-id-1' };
      },
    });

    await expect(
      createSubscriptionPaymentService(db).createOrder({
        user: { id: 'user-1' },
        body: { planKey: 'pro', paymentType: 'alipay' },
      }),
    ).rejects.toThrow('商户状态异常');

    expect(createdOrders).toHaveLength(0);
  });

  test('rejects successful ZPay order responses without a payment URL or QR code', async () => {
    const createdOrders: Parameters<SubscriptionPaymentDb['createSubscriptionPaymentOrder']>[0][] =
      [];
    mockFetch(async () => {
      return new Response(JSON.stringify({ code: 1, trade_no: 'zpay-trade-1' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const db = createPaymentDb({
      createSubscriptionPaymentOrder: async (input) => {
        createdOrders.push(input);
        return { _id: 'order-id-1' };
      },
    });

    await expect(
      createSubscriptionPaymentService(db).createOrder({
        user: { id: 'user-1' },
        body: { planKey: 'pro', paymentType: 'alipay' },
      }),
    ).rejects.toThrow('ZPay order creation response did not include payment instructions');

    expect(createdOrders).toHaveLength(0);
  });

  test('creates an order with a ZPay QR image when only img is returned', async () => {
    const createdOrders: Parameters<SubscriptionPaymentDb['createSubscriptionPaymentOrder']>[0][] =
      [];
    mockFetch(async () => {
      return new Response(
        JSON.stringify({
          code: 1,
          trade_no: 'zpay-trade-1',
          img: 'https://zpay.example/qrcode/order-id-1.jpg',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    });
    const db = createPaymentDb({
      createSubscriptionPaymentOrder: async (input) => {
        createdOrders.push(input);
        return { _id: 'order-id-1' };
      },
    });

    const result = await createSubscriptionPaymentService(db).createOrder({
      user: { id: 'user-1' },
      body: { planKey: 'pro', paymentType: 'alipay' },
    });

    expect(createdOrders[0]).toMatchObject({
      qrImageUrl: 'https://zpay.example/qrcode/order-id-1.jpg',
    });
    expect(result).toMatchObject({
      qrImageUrl: 'https://zpay.example/qrcode/order-id-1.jpg',
    });
  });

  test('rejects successful ZPay order responses with invalid payment instructions', async () => {
    const createdOrders: Parameters<SubscriptionPaymentDb['createSubscriptionPaymentOrder']>[0][] =
      [];
    mockFetch(async () => {
      return new Response(
        JSON.stringify({
          code: 1,
          trade_no: 'zpay-trade-1',
          payurl: 'javascript:alert(1)',
          qrcode: 'https://zpay.example/qr',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    });
    const db = createPaymentDb({
      createSubscriptionPaymentOrder: async (input) => {
        createdOrders.push(input);
        return { _id: 'order-id-1' };
      },
    });

    await expect(
      createSubscriptionPaymentService(db).createOrder({
        user: { id: 'user-1' },
        body: { planKey: 'pro', paymentType: 'alipay' },
      }),
    ).rejects.toThrow('ZPay order creation response included invalid payment instructions');

    expect(createdOrders).toHaveLength(0);
  });

  test('rejects free plans during checkout', async () => {
    const createdOrders: Parameters<SubscriptionPaymentDb['createSubscriptionPaymentOrder']>[0][] =
      [];
    const fetchMock = mockFetch(async () => {
      return new Response(
        JSON.stringify({
          code: 1,
          trade_no: 'zpay-trade-1',
          payurl: 'https://zpay.example/pay',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    });
    const db = createPaymentDb({
      getEnabledSubscriptionPlans: async () => [{ ...plan, key: 'free', price: 0 }],
      createSubscriptionPaymentOrder: async (input) => {
        createdOrders.push(input);
        return { _id: 'order-id-1' };
      },
    });

    await expect(
      createSubscriptionPaymentService(db).createOrder({
        user: { id: 'user-1' },
        body: { planKey: 'free', paymentType: 'alipay' },
      }),
    ).rejects.toThrow('Subscription plan is not available for checkout');

    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(createdOrders).toHaveLength(0);
  });

  test('rejects disabled plans during checkout', async () => {
    const createdOrders: Parameters<SubscriptionPaymentDb['createSubscriptionPaymentOrder']>[0][] =
      [];
    const fetchMock = mockFetch(async () => {
      return new Response(
        JSON.stringify({
          code: 1,
          trade_no: 'zpay-trade-1',
          payurl: 'https://zpay.example/pay',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    });
    const db = createPaymentDb({
      getEnabledSubscriptionPlans: async () => [{ ...plan, enabled: false }],
      createSubscriptionPaymentOrder: async (input) => {
        createdOrders.push(input);
        return { _id: 'order-id-1' };
      },
    });

    await expect(
      createSubscriptionPaymentService(db).createOrder({
        user: { id: 'user-1' },
        body: { planKey: 'pro', paymentType: 'wxpay' },
      }),
    ).rejects.toThrow('Subscription plan is not available for checkout');

    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(createdOrders).toHaveLength(0);
  });

  test('persists the rounded amount sent to ZPay', async () => {
    const createdOrders: Parameters<SubscriptionPaymentDb['createSubscriptionPaymentOrder']>[0][] =
      [];
    const fetchMock = mockFetch(async () => {
      return new Response(
        JSON.stringify({
          code: 1,
          trade_no: 'zpay-trade-1',
          payurl: 'https://zpay.example/pay',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    });
    const db = createPaymentDb({
      getEnabledSubscriptionPlans: async () => [{ ...plan, price: 29.999 }],
      createSubscriptionPaymentOrder: async (input) => {
        createdOrders.push(input);
        return { _id: 'order-id-1' };
      },
    });

    await createSubscriptionPaymentService(db).createOrder({
      user: { id: 'user-1' },
      body: { planKey: 'pro', paymentType: 'alipay' },
    });
    const body = fetchMock.mock.calls[0][1]?.body;

    if (!(body instanceof URLSearchParams)) {
      throw new Error('Expected URLSearchParams request body');
    }

    expect(body.get('money')).toBe('30.00');
    expect(createdOrders[0].amount).toBe(30);
  });

  test('fulfills from the paid order duration snapshot without reloading current plans', async () => {
    const calls: string[] = [];
    let subscriptionInput: Parameters<SubscriptionPaymentDb['createOrExtendUserSubscription']>[0];
    const payload = {
      pid: '1000',
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_order_snapshot',
      money: '29.50',
      trade_status: 'TRADE_SUCCESS',
    };
    const sign = signEasyPay(payload, 'secret');
    const rawBody = new URLSearchParams({ ...payload, sign, sign_type: 'MD5' }).toString();
    const orderWithSnapshot = {
      _id: 'order-id-snapshot',
      user: 'user-1',
      outTradeNo: 'lc_order_snapshot',
      planKey: 'pro',
      durationDays: 45,
      amount: 29.5,
      paymentType: 'alipay' as const,
      status: 'pending' as const,
      tenantId: 'tenant-a',
    };
    const db = createPaymentDb({
      getEnabledSubscriptionPlans: async () => {
        throw new Error('should not load current plans');
      },
      findSubscriptionPaymentOrderByTradeNo: async () => orderWithSnapshot,
      markSubscriptionOrderPaid: async () => {
        calls.push('paid');
        return null;
      },
      markSubscriptionOrderFulfilling: async () => {
        calls.push('fulfilling');
        return fulfillmentLock;
      },
      createOrExtendUserSubscription: async (input) => {
        subscriptionInput = input;
        calls.push('subscription');
        return fulfilledSubscription;
      },
      markSubscriptionOrderCompleted: async (_outTradeNo, fulfillingAt) => {
        calls.push('completed');
        expect(fulfillingAt).toEqual(fulfillmentLock.fulfillingAt);
        return {
          ...orderWithSnapshot,
          status: 'completed',
        };
      },
    });

    await createSubscriptionPaymentService(db).handleZPayNotify(rawBody);

    expect(calls).toEqual(['paid', 'fulfilling', 'subscription', 'completed']);
    expect(subscriptionInput!).toEqual({
      user: 'user-1',
      planKey: 'pro',
      durationDays: 45,
      sourceOrderId: 'order-id-snapshot',
      tenantId: 'tenant-a',
    });
  });

  test('fulfills legacy paid orders using duration from a current free plan', async () => {
    const calls: string[] = [];
    let subscriptionInput: Parameters<SubscriptionPaymentDb['createOrExtendUserSubscription']>[0];
    const payload = {
      pid: '1000',
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_order_legacy',
      money: '29.50',
      trade_status: 'TRADE_SUCCESS',
    };
    const sign = signEasyPay(payload, 'secret');
    const rawBody = new URLSearchParams({ ...payload, sign, sign_type: 'MD5' }).toString();
    const legacyOrder = {
      _id: 'order-id-legacy',
      user: 'user-1',
      outTradeNo: 'lc_order_legacy',
      planKey: 'pro',
      amount: 29.5,
      paymentType: 'alipay' as const,
      status: 'pending' as const,
      tenantId: 'tenant-a',
    };
    const db = createPaymentDb({
      getEnabledSubscriptionPlans: async (tenantId) => {
        calls.push(`plans:${tenantId ?? 'none'}`);
        return [{ ...plan, price: 0, durationDays: 60 }];
      },
      findSubscriptionPaymentOrderByTradeNo: async () => legacyOrder,
      markSubscriptionOrderPaid: async () => {
        calls.push('paid');
        return null;
      },
      markSubscriptionOrderFulfilling: async () => {
        calls.push('fulfilling');
        return fulfillmentLock;
      },
      createOrExtendUserSubscription: async (input) => {
        subscriptionInput = input;
        calls.push('subscription');
        return fulfilledSubscription;
      },
      markSubscriptionOrderCompleted: async (_outTradeNo, fulfillingAt) => {
        calls.push('completed');
        expect(fulfillingAt).toEqual(fulfillmentLock.fulfillingAt);
        return {
          ...legacyOrder,
          status: 'completed',
        };
      },
    });

    await createSubscriptionPaymentService(db).handleZPayNotify(rawBody);

    expect(calls).toEqual(['paid', 'fulfilling', 'plans:tenant-a', 'subscription', 'completed']);
    expect(subscriptionInput!).toEqual({
      user: 'user-1',
      planKey: 'pro',
      durationDays: 60,
      sourceOrderId: 'order-id-legacy',
      tenantId: 'tenant-a',
    });
  });

  test('fulfills a verified ZPay notification using the payment order id as source', async () => {
    const calls: string[] = [];
    let subscriptionInput: Parameters<SubscriptionPaymentDb['createOrExtendUserSubscription']>[0];
    const payload = {
      pid: '1000',
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_order_1',
      money: '29.50',
      trade_status: 'TRADE_SUCCESS',
    };
    const sign = signEasyPay(payload, 'secret');
    const rawBody = new URLSearchParams({ ...payload, sign, sign_type: 'MD5' }).toString();
    const db: SubscriptionPaymentDb = {
      getEnabledSubscriptionPlans: async (tenantId) => {
        calls.push(`plans:${tenantId ?? 'none'}`);
        return [plan];
      },
      createSubscriptionPaymentOrder: async () => ({ _id: 'unused' }),
      findSubscriptionPaymentOrderByTradeNo: async () => ({
        _id: 'order-id-1',
        user: 'user-1',
        outTradeNo: 'lc_order_1',
        planKey: 'pro',
        amount: 29.5,
        paymentType: 'alipay',
        status: 'pending',
        tenantId: 'tenant-a',
      }),
      markSubscriptionOrderPaid: async () => {
        calls.push('paid');
        return null;
      },
      markSubscriptionOrderFulfilling: async () => {
        calls.push('fulfilling');
        return fulfillmentLock;
      },
      markSubscriptionOrderCompleted: async (_outTradeNo, fulfillingAt) => {
        calls.push('completed');
        expect(fulfillingAt).toEqual(fulfillmentLock.fulfillingAt);
        return {
          _id: 'order-id-1',
          user: 'user-1',
          outTradeNo: 'lc_order_1',
          planKey: 'pro',
          amount: 29.5,
          paymentType: 'alipay',
          status: 'completed',
        };
      },
      markSubscriptionOrderFailed: async () => null,
      createOrExtendUserSubscription: async (input) => {
        subscriptionInput = input;
        calls.push('subscription');
        return fulfilledSubscription;
      },
    };

    await createSubscriptionPaymentService(db).handleZPayNotify(rawBody);

    expect(calls).toEqual(['paid', 'fulfilling', 'plans:tenant-a', 'subscription', 'completed']);
    expect(subscriptionInput!).toEqual({
      user: 'user-1',
      planKey: 'pro',
      durationDays: 30,
      sourceOrderId: 'order-id-1',
      tenantId: 'tenant-a',
    });
  });

  test('rejects ZPay notifications from a different pid before fulfillment', async () => {
    const payload = {
      pid: '9999',
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_order_1',
      money: '29.50',
      trade_status: 'TRADE_SUCCESS',
    };
    const sign = signEasyPay(payload, 'secret');
    const rawBody = new URLSearchParams({ ...payload, sign, sign_type: 'MD5' }).toString();
    const db = createPaymentDb({
      findSubscriptionPaymentOrderByTradeNo: async () => ({
        _id: 'order-id-1',
        user: 'user-1',
        outTradeNo: 'lc_order_1',
        planKey: 'pro',
        amount: 29.5,
        paymentType: 'alipay',
        status: 'pending',
      }),
      markSubscriptionOrderPaid: async () => {
        throw new Error('should not mark paid');
      },
    });

    await expect(createSubscriptionPaymentService(db).handleZPayNotify(rawBody)).rejects.toThrow(
      'EasyPay pid mismatch',
    );
  });

  test('marks fulfillment failed when subscription fulfillment returns no subscription', async () => {
    const calls: string[] = [];
    const payload = {
      pid: '1000',
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_order_1',
      money: '29.50',
      trade_status: 'TRADE_SUCCESS',
    };
    const sign = signEasyPay(payload, 'secret');
    const rawBody = new URLSearchParams({ ...payload, sign, sign_type: 'MD5' }).toString();
    const db = createPaymentDb({
      findSubscriptionPaymentOrderByTradeNo: async () => ({
        _id: 'order-id-1',
        user: 'user-1',
        outTradeNo: 'lc_order_1',
        planKey: 'pro',
        durationDays: 30,
        amount: 29.5,
        paymentType: 'alipay',
        status: 'pending',
      }),
      markSubscriptionOrderPaid: async () => {
        calls.push('paid');
        return null;
      },
      markSubscriptionOrderFulfilling: async () => {
        calls.push('fulfilling');
        return fulfillmentLock;
      },
      createOrExtendUserSubscription: async () => {
        calls.push('subscription');
        return null;
      },
      markSubscriptionOrderCompleted: async () => {
        calls.push('completed');
        return {
          _id: 'order-id-1',
          user: 'user-1',
          outTradeNo: 'lc_order_1',
          planKey: 'pro',
          amount: 29.5,
          paymentType: 'alipay',
          status: 'completed',
        };
      },
      markSubscriptionOrderFailed: async (_outTradeNo, reason, fulfillingAt) => {
        expect(fulfillingAt).toEqual(fulfillmentLock.fulfillingAt);
        calls.push(`failed:${reason}`);
        return null;
      },
    });

    await expect(createSubscriptionPaymentService(db).handleZPayNotify(rawBody)).rejects.toThrow(
      'Subscription fulfillment did not create or extend a subscription',
    );

    expect(calls).toEqual([
      'paid',
      'fulfilling',
      'subscription',
      'failed:Subscription fulfillment did not create or extend a subscription',
    ]);
  });

  test('marks fulfillment failed when the completed status update is missed', async () => {
    const calls: string[] = [];
    const payload = {
      pid: '1000',
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_order_1',
      money: '29.50',
      trade_status: 'TRADE_SUCCESS',
    };
    const sign = signEasyPay(payload, 'secret');
    const rawBody = new URLSearchParams({ ...payload, sign, sign_type: 'MD5' }).toString();
    const db = createPaymentDb({
      findSubscriptionPaymentOrderByTradeNo: async () => ({
        _id: 'order-id-1',
        user: 'user-1',
        outTradeNo: 'lc_order_1',
        planKey: 'pro',
        amount: 29.5,
        paymentType: 'alipay',
        status: 'pending',
      }),
      markSubscriptionOrderPaid: async () => {
        calls.push('paid');
        return null;
      },
      markSubscriptionOrderFulfilling: async () => {
        calls.push('fulfilling');
        return fulfillmentLock;
      },
      createOrExtendUserSubscription: async () => {
        calls.push('subscription');
        return fulfilledSubscription;
      },
      markSubscriptionOrderCompleted: async (_outTradeNo, fulfillingAt) => {
        calls.push('completed');
        expect(fulfillingAt).toEqual(fulfillmentLock.fulfillingAt);
        return null;
      },
      markSubscriptionOrderFailed: async (_outTradeNo, reason, fulfillingAt) => {
        expect(fulfillingAt).toEqual(fulfillmentLock.fulfillingAt);
        calls.push(`failed:${reason}`);
        return null;
      },
    });

    await expect(createSubscriptionPaymentService(db).handleZPayNotify(rawBody)).rejects.toThrow(
      'Subscription payment order completion failed',
    );

    expect(calls).toEqual([
      'paid',
      'fulfilling',
      'subscription',
      'completed',
      'failed:Subscription payment order completion failed',
    ]);
  });

  test('does not fulfill completed orders or mismatched amounts', async () => {
    const payload = {
      pid: '1000',
      trade_no: 'zpay-trade-1',
      out_trade_no: 'lc_order_1',
      money: '29.50',
      trade_status: 'TRADE_SUCCESS',
    };
    const sign = signEasyPay(payload, 'secret');
    const rawBody = new URLSearchParams({ ...payload, sign, sign_type: 'MD5' }).toString();
    const db: SubscriptionPaymentDb = {
      getEnabledSubscriptionPlans: async () => [plan],
      createSubscriptionPaymentOrder: async () => ({ _id: 'unused' }),
      findSubscriptionPaymentOrderByTradeNo: async () => ({
        _id: 'order-id-1',
        user: 'user-1',
        outTradeNo: 'lc_order_1',
        planKey: 'pro',
        amount: 19,
        paymentType: 'alipay',
        status: 'pending',
      }),
      markSubscriptionOrderPaid: async () => {
        throw new Error('should not mark paid');
      },
      markSubscriptionOrderFulfilling: async () => {
        throw new Error('should not fulfill');
      },
      markSubscriptionOrderCompleted: async () => null,
      markSubscriptionOrderFailed: async () => null,
      createOrExtendUserSubscription: async () => null,
    };

    await expect(createSubscriptionPaymentService(db).handleZPayNotify(rawBody)).rejects.toThrow(
      'Subscription payment amount mismatch',
    );

    db.findSubscriptionPaymentOrderByTradeNo = async () => ({
      _id: 'order-id-1',
      user: 'user-1',
      outTradeNo: 'lc_order_1',
      planKey: 'pro',
      amount: 29.5,
      paymentType: 'alipay',
      status: 'completed',
    });

    await expect(createSubscriptionPaymentService(db).handleZPayNotify(rawBody)).resolves.toBe(
      undefined,
    );
  });
});
