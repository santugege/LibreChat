import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { tenantStorage } from '~/config/tenantContext';
import { createModels } from '~/models';
import { createMethods } from './index';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('~/config/meiliLogger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.setTimeout(60000);

type SubscriptionPlanInput = {
  key: string;
  name: string;
  description?: string | undefined;
  price: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  enabled: boolean;
  sortOrder: number;
  tenantId?: string;
};

type SubscriptionPlanResult = SubscriptionPlanInput & {
  _id: mongoose.Types.ObjectId;
};

type ConsumeSubscriptionQuotaInput = {
  user: string;
  kind: 'text' | 'image';
  amount: number;
  limit: number;
  windowKey: string;
  windowStart: Date;
  windowEnd: Date;
  requestId: string;
  tenantId?: string;
};

type RuntimeConsumeSubscriptionQuotaInput = Omit<ConsumeSubscriptionQuotaInput, 'kind'> & {
  kind: string;
};

type ConsumeSubscriptionQuotaResult = {
  allowed: boolean;
  used: number;
  limit: number;
  resetAt: Date;
};

type UserSubscriptionResult = {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  planKey: string;
  planName?: string;
  planDescription?: string;
  planAmount?: number;
  textDailyLimit?: number;
  imageDailyLimit?: number;
  status: 'active' | 'expired' | 'cancelled';
  startsAt: Date;
  expiresAt: Date;
  sourceOrderId?: mongoose.Types.ObjectId;
  sourceOrderIds?: mongoose.Types.ObjectId[];
  fulfillmentKey?: string;
  tenantId?: string | null;
};

type SubscriptionPaymentOrderInput = {
  user: string;
  outTradeNo: string;
  tradeNo?: string;
  planKey: string;
  durationDays?: number;
  amount: number;
  paymentType: 'alipay' | 'wxpay';
  status?: 'pending' | 'paid' | 'fulfilling' | 'completed' | 'expired' | 'cancelled' | 'failed';
  payUrl?: string;
  qrCode?: string;
  qrImageUrl?: string;
  expiresAt: Date;
  tenantId?: string;
};

type SubscriptionPaymentOrderResult = Omit<SubscriptionPaymentOrderInput, 'user' | 'tenantId'> & {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  status: 'pending' | 'paid' | 'fulfilling' | 'completed' | 'expired' | 'cancelled' | 'failed';
  rawNotify?: string;
  paidAt?: Date;
  fulfillingAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  failedReason?: string;
  tenantId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type SubscriptionPaymentOrderListItemResult = {
  id: string;
  outTradeNo: string;
  tradeNo?: string;
  userId: string;
  user?: {
    id: string;
    name?: string;
    username?: string;
    email?: string;
    avatar?: string;
  };
  planKey: string;
  amount: number;
  paymentType: 'alipay' | 'wxpay';
  status: 'pending' | 'paid' | 'fulfilling' | 'completed' | 'expired' | 'cancelled' | 'failed';
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
  paidAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  failedReason?: string;
};

type SubscriptionPaymentOrderLockResult = {
  fulfillingAt: Date;
};

type SubscriptionQuotaExemptionResult = {
  _id: mongoose.Types.ObjectId;
  email: string;
  tenantId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type CreateOrExtendUserSubscriptionInput = {
  user: string;
  planKey: string;
  durationDays: number;
  sourceOrderId: mongoose.Types.ObjectId;
  now?: Date;
  tenantId?: string;
  planName?: string;
  planDescription?: string;
  planAmount?: number;
  textDailyLimit?: number;
  imageDailyLimit?: number;
};

type SubscriptionUsageBucketResult = {
  user: mongoose.Types.ObjectId;
  windowKey: string;
  textUsed: number;
  imageUsed: number;
  textRequestIds: string[];
  imageRequestIds: string[];
  tenantId?: string | null;
};

type SubscriptionUsageEventMetadataResult = {
  windowStart?: string;
  windowEnd?: string;
  limit?: number;
  [key: string]: string | number | boolean | undefined;
};

type SubscriptionUsageEventResult = {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  kind: 'text' | 'image';
  amount: number;
  requestId: string;
  bucketKey: string;
  windowStart: Date;
  windowEnd: Date;
  limit: number;
  status: 'committed' | 'released';
  metadata?: SubscriptionUsageEventMetadataResult;
  tenantId?: string | null;
};

type SubscriptionTestMethods = {
  upsertSubscriptionPlan: (input: SubscriptionPlanInput) => Promise<SubscriptionPlanResult | null>;
  listSubscriptionPlans: (tenantId?: string) => Promise<SubscriptionPlanResult[]>;
  getSubscriptionPlan: (key: string, tenantId?: string) => Promise<SubscriptionPlanResult | null>;
  createSubscriptionPlan: (input: SubscriptionPlanInput) => Promise<SubscriptionPlanResult | null>;
  updateSubscriptionPlan: (
    key: string,
    input: Partial<Omit<SubscriptionPlanInput, 'key' | 'tenantId'>>,
    tenantId?: string,
  ) => Promise<SubscriptionPlanResult | null>;
  deleteSubscriptionPlan: (
    key: string,
    tenantId?: string,
  ) => Promise<SubscriptionPlanResult | null>;
  getEnabledSubscriptionPlans: (tenantId?: string) => Promise<SubscriptionPlanResult[]>;
  findActiveUserSubscription: (
    user: string,
    now?: Date,
    tenantId?: string,
  ) => Promise<UserSubscriptionResult | null>;
  consumeSubscriptionQuota: (
    input: ConsumeSubscriptionQuotaInput,
  ) => Promise<ConsumeSubscriptionQuotaResult>;
  getSubscriptionUsageBucket: (
    user: string,
    windowKey: string,
    tenantId?: string,
  ) => Promise<SubscriptionUsageBucketResult | null>;
  createSubscriptionPaymentOrder: (
    input: SubscriptionPaymentOrderInput,
  ) => Promise<SubscriptionPaymentOrderResult | null>;
  findSubscriptionPaymentOrderByTradeNo: (
    outTradeNo: string,
  ) => Promise<SubscriptionPaymentOrderResult | null>;
  getSubscriptionPaymentOrderById: (
    orderId: string,
    tenantId?: string,
  ) => Promise<SubscriptionPaymentOrderResult | null>;
  listSubscriptionPaymentOrders: (input: {
    limit: number;
    offset: number;
    status?: 'pending' | 'paid' | 'fulfilling' | 'completed' | 'expired' | 'cancelled' | 'failed';
    tenantId?: string;
  }) => Promise<SubscriptionPaymentOrderListItemResult[]>;
  countSubscriptionPaymentOrders: (input: {
    status?: 'pending' | 'paid' | 'fulfilling' | 'completed' | 'expired' | 'cancelled' | 'failed';
    tenantId?: string;
  }) => Promise<number>;
  markSubscriptionOrderPaid: (
    outTradeNo: string,
    tradeNo: string,
    rawNotify: string,
  ) => Promise<SubscriptionPaymentOrderResult | null>;
  markSubscriptionOrderFulfilling: (
    outTradeNo: string,
    now?: Date,
  ) => Promise<SubscriptionPaymentOrderLockResult | null>;
  markSubscriptionOrderCompleted: (
    outTradeNo: string,
    fulfillingAt: Date,
  ) => Promise<SubscriptionPaymentOrderResult | null>;
  markSubscriptionOrderFailed: (
    outTradeNo: string,
    reason: string,
    fulfillingAt: Date,
  ) => Promise<SubscriptionPaymentOrderResult | null>;
  markSubscriptionOrderExpired: (
    outTradeNo: string,
  ) => Promise<SubscriptionPaymentOrderResult | null>;
  listStuckSubscriptionPaymentOrders: (input: {
    olderThan: Date;
    limit: number;
    statuses: Array<'pending' | 'paid' | 'fulfilling' | 'completed' | 'expired' | 'cancelled' | 'failed'>;
  }) => Promise<SubscriptionPaymentOrderResult[]>;
  createOrExtendUserSubscription: (
    input: CreateOrExtendUserSubscriptionInput,
  ) => Promise<UserSubscriptionResult | null>;
  listSubscriptionQuotaExemptions: (
    tenantId?: string,
  ) => Promise<SubscriptionQuotaExemptionResult[]>;
  createSubscriptionQuotaExemption: (input: {
    email: string;
    tenantId?: string;
  }) => Promise<SubscriptionQuotaExemptionResult | null>;
  deleteSubscriptionQuotaExemption: (
    email: string,
    tenantId?: string,
  ) => Promise<SubscriptionQuotaExemptionResult | null>;
  isSubscriptionQuotaExempt: (email: string, tenantId?: string) => Promise<boolean>;
};

const subscriptionModelNames = [
  'SubscriptionPlan',
  'UserSubscription',
  'SubscriptionUsageBucket',
  'SubscriptionUsageEvent',
  'SubscriptionPaymentOrder',
  'SubscriptionQuotaExemption',
] as const;

describe('subscription methods', () => {
  let mongoServer: MongoMemoryServer;
  let methods: ReturnType<typeof createMethods> & Partial<SubscriptionTestMethods>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const models = createModels(mongoose);
    Object.assign(mongoose.models, models);

    methods = createMethods(mongoose) as ReturnType<typeof createMethods> &
      Partial<SubscriptionTestMethods>;
    await Promise.all(
      subscriptionModelNames.map((modelName) => mongoose.models[modelName].syncIndexes()),
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all(
      subscriptionModelNames.map((modelName) => mongoose.models[modelName].deleteMany({})),
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('upserts subscription plans and returns enabled plans sorted for display', async () => {
    await methods.upsertSubscriptionPlan!({
      key: 'pro',
      name: 'Pro',
      price: 29,
      durationDays: 30,
      textDailyLimit: 200,
      imageDailyLimit: 50,
      enabled: true,
      sortOrder: 2,
    });

    await methods.upsertSubscriptionPlan!({
      key: 'starter',
      name: 'Starter',
      price: 9,
      durationDays: 30,
      textDailyLimit: 50,
      imageDailyLimit: 10,
      enabled: true,
      sortOrder: 1,
    });

    await methods.upsertSubscriptionPlan!({
      key: 'hidden',
      name: 'Hidden',
      price: 0,
      durationDays: 30,
      textDailyLimit: 1,
      imageDailyLimit: 1,
      enabled: false,
      sortOrder: 0,
    });

    const plans = await methods.getEnabledSubscriptionPlans!();

    expect(plans.map((plan) => plan.key)).toEqual(['starter', 'pro']);
    expect(plans[0].textDailyLimit).toBe(50);
    expect(plans[1].imageDailyLimit).toBe(50);
  });

  test('reads a subscription usage bucket for the current user window and tenant', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const windowStart = new Date('2026-05-05T16:00:00.000Z');
    const windowEnd = new Date('2026-05-06T16:00:00.000Z');

    await methods.consumeSubscriptionQuota!({
      user,
      kind: 'text',
      amount: 4,
      limit: 20,
      windowKey: '2026-05-06',
      windowStart,
      windowEnd,
      requestId: 'text-request',
      tenantId: 'tenant-a',
    });
    await methods.consumeSubscriptionQuota!({
      user,
      kind: 'image',
      amount: 2,
      limit: 10,
      windowKey: '2026-05-06',
      windowStart,
      windowEnd,
      requestId: 'image-request',
      tenantId: 'tenant-a',
    });

    const bucket = await methods.getSubscriptionUsageBucket!(user, '2026-05-06', 'tenant-a');
    const tenantlessBucket = await methods.getSubscriptionUsageBucket!(user, '2026-05-06');

    expect(bucket).toMatchObject({
      windowKey: '2026-05-06',
      textUsed: 4,
      imageUsed: 2,
      tenantId: 'tenant-a',
    });
    expect(tenantlessBucket).toBeNull();
  });

  test('lists, reads, updates, and deletes all subscription plans for admin management', async () => {
    await methods.createSubscriptionPlan!({
      key: 'free',
      name: 'Free',
      price: 0,
      durationDays: 30,
      textDailyLimit: 20,
      imageDailyLimit: 2,
      enabled: false,
      sortOrder: 0,
    });
    await methods.createSubscriptionPlan!({
      key: 'pro',
      name: 'Pro',
      price: 29,
      durationDays: 30,
      textDailyLimit: 200,
      imageDailyLimit: 50,
      enabled: true,
      sortOrder: 10,
    });

    const allPlans = await methods.listSubscriptionPlans!();
    const free = await methods.getSubscriptionPlan!('free');
    const updated = await methods.updateSubscriptionPlan!('free', {
      enabled: true,
      textDailyLimit: 25,
      sortOrder: 5,
    });
    const deleted = await methods.deleteSubscriptionPlan!('pro');
    const afterDelete = await methods.listSubscriptionPlans!();

    expect(allPlans.map((plan) => plan.key)).toEqual(['free', 'pro']);
    expect(free?.enabled).toBe(false);
    expect(updated).toMatchObject({ key: 'free', enabled: true, textDailyLimit: 25, sortOrder: 5 });
    expect(deleted?.key).toBe('pro');
    expect(afterDelete.map((plan) => plan.key)).toEqual(['free']);
  });

  test('admin plan updates can clear descriptions', async () => {
    await methods.createSubscriptionPlan!({
      key: 'team',
      name: 'Team',
      description: 'Team plan',
      price: 99,
      durationDays: 30,
      textDailyLimit: 1000,
      imageDailyLimit: 100,
      enabled: true,
      sortOrder: 20,
    });

    const updated = await methods.updateSubscriptionPlan!('team', {
      description: undefined,
    });

    expect(updated?.description).toBeUndefined();
    await expect(methods.getSubscriptionPlan!('team')).resolves.toMatchObject({
      key: 'team',
      name: 'Team',
    });
    await expect(methods.getSubscriptionPlan!('team')).resolves.not.toHaveProperty('description');
  });

  test('admin plan CRUD honors explicit tenant filters', async () => {
    await methods.createSubscriptionPlan!({
      key: 'free',
      name: 'Tenantless Free',
      price: 0,
      durationDays: 30,
      textDailyLimit: 20,
      imageDailyLimit: 2,
      enabled: true,
      sortOrder: 0,
    });
    await methods.createSubscriptionPlan!({
      key: 'free',
      name: 'Tenant Free',
      price: 0,
      durationDays: 30,
      textDailyLimit: 40,
      imageDailyLimit: 4,
      enabled: true,
      sortOrder: 0,
      tenantId: 'tenant-a',
    });

    const tenantless = await methods.getSubscriptionPlan!('free');
    const tenant = await methods.getSubscriptionPlan!('free', 'tenant-a');
    await methods.updateSubscriptionPlan!('free', { name: 'Updated Tenant Free' }, 'tenant-a');

    expect(tenantless?.name).toBe('Tenantless Free');
    expect(tenant?.textDailyLimit).toBe(40);
    await expect(methods.getSubscriptionPlan!('free', 'tenant-a')).resolves.toMatchObject({
      name: 'Updated Tenant Free',
    });
    await expect(methods.deleteSubscriptionPlan!('free', 'tenant-a')).resolves.toMatchObject({
      tenantId: 'tenant-a',
    });
    await expect(methods.getSubscriptionPlan!('free')).resolves.toMatchObject({
      name: 'Tenantless Free',
    });
  });

  test('manages quota exemption emails with normalized tenant-scoped lookups', async () => {
    const tenantless = await methods.createSubscriptionQuotaExemption!({
      email: ' VIP@Example.COM ',
    });
    const tenant = await methods.createSubscriptionQuotaExemption!({
      email: 'vip@example.com',
      tenantId: 'tenant-a',
    });

    const tenantlessList = await methods.listSubscriptionQuotaExemptions!();
    const tenantList = await methods.listSubscriptionQuotaExemptions!('tenant-a');
    const tenantlessMatch = await methods.isSubscriptionQuotaExempt!('vip@example.com');
    const tenantMatch = await methods.isSubscriptionQuotaExempt!('VIP@example.com', 'tenant-a');
    const tenantMiss = await methods.isSubscriptionQuotaExempt!('vip@example.com', 'tenant-b');
    const deleted = await methods.deleteSubscriptionQuotaExemption!('VIP@example.com', 'tenant-a');

    expect(tenantless).toMatchObject({ email: 'vip@example.com', tenantId: null });
    expect(tenant).toMatchObject({ email: 'vip@example.com', tenantId: 'tenant-a' });
    expect(tenantlessList.map((item) => item.email)).toEqual(['vip@example.com']);
    expect(tenantList.map((item) => item.email)).toEqual(['vip@example.com']);
    expect(tenantlessMatch).toBe(true);
    expect(tenantMatch).toBe(true);
    expect(tenantMiss).toBe(false);
    expect(deleted).toMatchObject({ email: 'vip@example.com', tenantId: 'tenant-a' });
    await expect(methods.isSubscriptionQuotaExempt!('vip@example.com', 'tenant-a')).resolves.toBe(
      false,
    );
  });

  test('consumes subscription quota until the limit is reached', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const windowStart = new Date('2026-05-01T16:00:00.000Z');
    const windowEnd = new Date('2026-05-02T16:00:00.000Z');

    const first = await methods.consumeSubscriptionQuota!({
      user,
      kind: 'text',
      amount: 1,
      limit: 2,
      windowKey: '2026-05-02',
      windowStart,
      windowEnd,
      requestId: 'req-1',
    });

    const second = await methods.consumeSubscriptionQuota!({
      user,
      kind: 'text',
      amount: 1,
      limit: 2,
      windowKey: '2026-05-02',
      windowStart,
      windowEnd,
      requestId: 'req-2',
    });

    const third = await methods.consumeSubscriptionQuota!({
      user,
      kind: 'text',
      amount: 1,
      limit: 2,
      windowKey: '2026-05-02',
      windowStart,
      windowEnd,
      requestId: 'req-3',
    });

    expect(first).toMatchObject({ allowed: true, used: 1, limit: 2 });
    expect(second).toMatchObject({ allowed: true, used: 2, limit: 2 });
    expect(third).toMatchObject({ allowed: false, used: 2, limit: 2 });
    expect(third.resetAt).toEqual(windowEnd);
  });

  test('keeps tenantless plans separate from tenant-scoped plans with the same key', async () => {
    await methods.upsertSubscriptionPlan!({
      key: 'pro',
      name: 'Tenant Pro',
      price: 29,
      durationDays: 30,
      textDailyLimit: 200,
      imageDailyLimit: 50,
      enabled: true,
      sortOrder: 1,
      tenantId: 'tenant-a',
    });

    const tenantlessPlan = await methods.upsertSubscriptionPlan!({
      key: 'pro',
      name: 'Tenantless Pro',
      price: 19,
      durationDays: 30,
      textDailyLimit: 100,
      imageDailyLimit: 25,
      enabled: true,
      sortOrder: 1,
    });

    const tenantlessPlans = await methods.getEnabledSubscriptionPlans!();
    const tenantPlans = await methods.getEnabledSubscriptionPlans!('tenant-a');

    expect(tenantlessPlan?.tenantId ?? null).toBeNull();
    expect(tenantlessPlans.map((plan) => plan.name)).toEqual(['Tenantless Pro']);
    expect(tenantPlans.map((plan) => plan.name)).toEqual(['Tenant Pro']);
  });

  test('rejects invalid subscription plan upserts through schema validators', async () => {
    const Plan = mongoose.models.SubscriptionPlan as mongoose.Model<SubscriptionPlanResult>;
    const basePlan: SubscriptionPlanInput = {
      key: 'validator-base',
      name: 'Validator Base',
      price: 29.99,
      durationDays: 30,
      textDailyLimit: 100,
      imageDailyLimit: 25,
      enabled: true,
      sortOrder: 1,
    };

    await expect(
      methods.upsertSubscriptionPlan!({
        ...basePlan,
        key: 'invalid-price',
        price: -1,
      }),
    ).rejects.toThrow();
    await expect(Plan.countDocuments({ key: 'invalid-price', tenantId: null })).resolves.toBe(0);

    await expect(
      methods.upsertSubscriptionPlan!({
        ...basePlan,
        key: 'fractional-duration',
        durationDays: 1.5,
      }),
    ).rejects.toThrow();
    await expect(Plan.countDocuments({ key: 'fractional-duration', tenantId: null })).resolves.toBe(
      0,
    );

    await expect(
      methods.upsertSubscriptionPlan!({
        ...basePlan,
        key: 'fractional-text-limit',
        textDailyLimit: 10.5,
      }),
    ).rejects.toThrow();
    await expect(
      Plan.countDocuments({ key: 'fractional-text-limit', tenantId: null }),
    ).resolves.toBe(0);

    await expect(
      methods.upsertSubscriptionPlan!({
        ...basePlan,
        key: 'fractional-image-limit',
        imageDailyLimit: 2.5,
      }),
    ).rejects.toThrow();
    await expect(
      Plan.countDocuments({ key: 'fractional-image-limit', tenantId: null }),
    ).resolves.toBe(0);

    await expect(
      methods.upsertSubscriptionPlan!({
        ...basePlan,
        key: 'fractional-sort-order',
        sortOrder: 1.5,
      }),
    ).rejects.toThrow();
    await expect(
      Plan.countDocuments({ key: 'fractional-sort-order', tenantId: null }),
    ).resolves.toBe(0);

    const fractionalPricePlan = await methods.upsertSubscriptionPlan!({
      ...basePlan,
      key: 'fractional-price',
      price: 29.99,
    });

    expect(fractionalPricePlan?.price).toBe(29.99);
  });

  test('keeps payment order trade numbers globally unique for webhook lookup', async () => {
    const Order = mongoose.models.SubscriptionPaymentOrder as mongoose.Model<{
      user: mongoose.Types.ObjectId;
      outTradeNo: string;
      planKey: string;
      amount: number;
      paymentType: 'alipay' | 'wxpay';
      status: 'pending' | 'paid' | 'fulfilling' | 'completed' | 'expired' | 'cancelled' | 'failed';
      expiresAt: Date;
      tenantId?: string | null;
    }>;
    const user = new mongoose.Types.ObjectId();
    const expiresAt = new Date('2026-05-03T00:00:00.000Z');

    await Order.create({
      user,
      outTradeNo: 'shared-out-trade-no',
      planKey: 'pro',
      amount: 29,
      paymentType: 'alipay',
      status: 'pending',
      expiresAt,
      tenantId: 'tenant-a',
    });

    await expect(
      Order.create({
        user,
        outTradeNo: 'shared-out-trade-no',
        planKey: 'pro',
        amount: 29,
        paymentType: 'alipay',
        status: 'pending',
        expiresAt,
        tenantId: 'tenant-b',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  test('creates payment orders and locks fulfillment once after payment', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const expiresAt = new Date('2026-05-03T00:00:00.000Z');

    const created = await methods.createSubscriptionPaymentOrder!({
      user,
      outTradeNo: 'lc_order_1',
      planKey: 'pro',
      durationDays: 30,
      amount: 29,
      paymentType: 'alipay',
      payUrl: 'https://pay.example/pay',
      qrCode: 'https://pay.example/qr',
      expiresAt,
      tenantId: 'tenant-a',
    });
    const found = await methods.findSubscriptionPaymentOrderByTradeNo!('lc_order_1');
    const paid = await methods.markSubscriptionOrderPaid!(
      'lc_order_1',
      'zpay-trade-1',
      'raw=notify',
    );
    const firstLock = await methods.markSubscriptionOrderFulfilling!('lc_order_1');
    const duplicateLock = await methods.markSubscriptionOrderFulfilling!('lc_order_1');
    const completed = await methods.markSubscriptionOrderCompleted!(
      'lc_order_1',
      firstLock!.fulfillingAt,
    );

    expect(created).toMatchObject({
      outTradeNo: 'lc_order_1',
      status: 'pending',
      durationDays: 30,
      tenantId: 'tenant-a',
    });
    expect(found?.tenantId).toBe('tenant-a');
    expect(paid).toMatchObject({
      status: 'paid',
      tradeNo: 'zpay-trade-1',
      rawNotify: 'raw=notify',
    });
    expect(paid?.paidAt).toBeInstanceOf(Date);
    expect(firstLock?.fulfillingAt).toBeInstanceOf(Date);
    expect(duplicateLock).toBeNull();
    expect(completed).toMatchObject({ status: 'completed' });
    expect(completed?.completedAt).toBeInstanceOf(Date);
  });

  test('lists subscription payment orders newest first with user display fields', async () => {
    const User = mongoose.models.User as mongoose.Model<{
      name: string;
      username: string;
      email: string;
      avatar?: string;
      provider: string;
      emailVerified: boolean;
    }>;
    const user = await User.create({
      name: 'Ada Lovelace',
      username: 'ada',
      email: 'ada@example.com',
      provider: 'local',
      emailVerified: true,
    });
    const older = await methods.createSubscriptionPaymentOrder!({
      user: user._id.toString(),
      outTradeNo: 'older-order',
      planKey: 'pro',
      amount: 29.5,
      paymentType: 'alipay',
      status: 'pending',
      expiresAt: new Date('2026-05-07T12:00:00.000Z'),
    });
    const newer = await methods.createSubscriptionPaymentOrder!({
      user: user._id.toString(),
      outTradeNo: 'newer-order',
      tradeNo: 'zpay-1',
      planKey: 'pro',
      amount: 39.5,
      paymentType: 'wxpay',
      status: 'completed',
      expiresAt: new Date('2026-05-08T12:00:00.000Z'),
    });

    await mongoose.models.SubscriptionPaymentOrder.updateOne(
      { _id: older?._id },
      { $set: { createdAt: new Date('2026-05-07T09:00:00.000Z') } },
    );
    await mongoose.models.SubscriptionPaymentOrder.updateOne(
      { _id: newer?._id },
      {
        $set: {
          createdAt: new Date('2026-05-07T10:00:00.000Z'),
          paidAt: new Date('2026-05-07T10:02:00.000Z'),
          completedAt: new Date('2026-05-07T10:03:00.000Z'),
          rawNotify: 'secret-provider-payload',
          payUrl: 'https://pay.example/secret',
          qrCode: 'secret-qr',
          qrImageUrl: 'https://pay.example/secret-qr.png',
        },
      },
    );

    const orders = await methods.listSubscriptionPaymentOrders!({ limit: 10, offset: 0 });
    const total = await methods.countSubscriptionPaymentOrders!({});

    expect(total).toBe(2);
    expect(orders.map((order) => order.outTradeNo)).toEqual(['newer-order', 'older-order']);
    expect(orders[0].userId).toBe(user._id.toString());
    expect(orders[0].user).toEqual({
      id: user._id.toString(),
      name: 'Ada Lovelace',
      username: 'ada',
      email: 'ada@example.com',
    });
    expect(orders[0]).not.toHaveProperty('rawNotify');
    expect(orders[0]).not.toHaveProperty('payUrl');
    expect(orders[0]).not.toHaveProperty('qrCode');
    expect(orders[0]).not.toHaveProperty('qrImageUrl');
  });

  test('filters subscription payment orders by status and tenant', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    await methods.createSubscriptionPaymentOrder!({
      user,
      outTradeNo: 'tenant-completed',
      planKey: 'pro',
      amount: 29.5,
      paymentType: 'alipay',
      status: 'completed',
      expiresAt: new Date('2026-05-08T12:00:00.000Z'),
      tenantId: 'tenant-a',
    });
    await methods.createSubscriptionPaymentOrder!({
      user,
      outTradeNo: 'tenant-pending',
      planKey: 'pro',
      amount: 29.5,
      paymentType: 'alipay',
      status: 'pending',
      expiresAt: new Date('2026-05-08T12:00:00.000Z'),
      tenantId: 'tenant-a',
    });
    await methods.createSubscriptionPaymentOrder!({
      user,
      outTradeNo: 'other-tenant-completed',
      planKey: 'pro',
      amount: 29.5,
      paymentType: 'alipay',
      status: 'completed',
      expiresAt: new Date('2026-05-08T12:00:00.000Z'),
      tenantId: 'tenant-b',
    });

    const orders = await methods.listSubscriptionPaymentOrders!({
      limit: 10,
      offset: 0,
      status: 'completed',
      tenantId: 'tenant-a',
    });
    const total = await methods.countSubscriptionPaymentOrders!({
      status: 'completed',
      tenantId: 'tenant-a',
    });

    expect(total).toBe(1);
    expect(orders.map((order) => order.outTradeNo)).toEqual(['tenant-completed']);
  });

  test('reacquires stale fulfilling payment order locks', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const expiresAt = new Date('2026-05-03T00:00:00.000Z');
    const firstLockAt = new Date('2026-05-02T00:00:00.000Z');
    const duplicateLockAt = new Date('2026-05-02T00:05:00.000Z');
    const staleLockAt = new Date('2026-05-02T00:11:00.000Z');

    await methods.createSubscriptionPaymentOrder!({
      user,
      outTradeNo: 'lc_stale_lock',
      planKey: 'pro',
      durationDays: 30,
      amount: 29,
      paymentType: 'alipay',
      expiresAt,
    });
    await methods.markSubscriptionOrderPaid!('lc_stale_lock', 'zpay-trade-stale', 'raw=notify');

    const firstLock = await methods.markSubscriptionOrderFulfilling!('lc_stale_lock', firstLockAt);
    const duplicateLock = await methods.markSubscriptionOrderFulfilling!(
      'lc_stale_lock',
      duplicateLockAt,
    );
    const staleLock = await methods.markSubscriptionOrderFulfilling!('lc_stale_lock', staleLockAt);
    const order = await methods.findSubscriptionPaymentOrderByTradeNo!('lc_stale_lock');
    const oldLeaseCompleted = await methods.markSubscriptionOrderCompleted!(
      'lc_stale_lock',
      firstLock!.fulfillingAt,
    );
    const oldLeaseFailed = await methods.markSubscriptionOrderFailed!(
      'lc_stale_lock',
      'old worker failed',
      firstLock!.fulfillingAt,
    );
    const completed = await methods.markSubscriptionOrderCompleted!(
      'lc_stale_lock',
      staleLock!.fulfillingAt,
    );

    expect(firstLock?.fulfillingAt.toISOString()).toBe(firstLockAt.toISOString());
    expect(duplicateLock).toBeNull();
    expect(staleLock?.fulfillingAt.toISOString()).toBe(staleLockAt.toISOString());
    expect(order).toMatchObject({ status: 'fulfilling' });
    expect(order?.failedReason).toBeUndefined();
    expect(order?.fulfillingAt?.toISOString()).toBe(staleLockAt.toISOString());
    expect(oldLeaseCompleted).toBeNull();
    expect(oldLeaseFailed).toBeNull();
    expect(completed).toMatchObject({ status: 'completed' });
  });

  test('marks locked payment orders failed without changing completed orders', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const expiresAt = new Date('2026-05-03T00:00:00.000Z');

    await methods.createSubscriptionPaymentOrder!({
      user,
      outTradeNo: 'lc_order_failed',
      planKey: 'pro',
      amount: 29,
      paymentType: 'wxpay',
      expiresAt,
    });
    await methods.createSubscriptionPaymentOrder!({
      user,
      outTradeNo: 'lc_order_completed',
      planKey: 'pro',
      amount: 29,
      paymentType: 'wxpay',
      expiresAt,
    });
    await methods.markSubscriptionOrderPaid!('lc_order_failed', 'zpay-trade-failed', 'raw=failed');
    await methods.markSubscriptionOrderPaid!(
      'lc_order_completed',
      'zpay-trade-completed',
      'raw=completed',
    );
    const failedLock = await methods.markSubscriptionOrderFulfilling!('lc_order_failed');
    const completedLock = await methods.markSubscriptionOrderFulfilling!('lc_order_completed');
    await methods.markSubscriptionOrderCompleted!(
      'lc_order_completed',
      completedLock!.fulfillingAt,
    );

    const failed = await methods.markSubscriptionOrderFailed!(
      'lc_order_failed',
      'fulfillment failed',
      failedLock!.fulfillingAt,
    );
    const stillCompleted = await methods.markSubscriptionOrderFailed!(
      'lc_order_completed',
      'late failure',
      completedLock!.fulfillingAt,
    );

    expect(failed).toMatchObject({
      status: 'failed',
      failedReason: 'fulfillment failed',
    });
    expect(failed?.failedAt).toBeInstanceOf(Date);
    expect(stillCompleted).toBeNull();
    await expect(
      methods.findSubscriptionPaymentOrderByTradeNo!('lc_order_completed'),
    ).resolves.toMatchObject({ status: 'completed' });
  });

  test('marks only pending subscription payment orders expired', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const expiresAt = new Date('2026-05-03T00:00:00.000Z');

    await methods.createSubscriptionPaymentOrder!({
      user,
      outTradeNo: 'lc_expired_pending',
      planKey: 'pro',
      amount: 29,
      paymentType: 'alipay',
      expiresAt,
    });
    await methods.createSubscriptionPaymentOrder!({
      user,
      outTradeNo: 'lc_expired_paid',
      planKey: 'pro',
      amount: 29,
      paymentType: 'alipay',
      expiresAt,
    });
    await methods.markSubscriptionOrderPaid!('lc_expired_paid', 'zpay-paid', 'raw=paid');

    const expired = await methods.markSubscriptionOrderExpired!('lc_expired_pending');
    const paid = await methods.markSubscriptionOrderExpired!('lc_expired_paid');

    expect(expired).toMatchObject({ outTradeNo: 'lc_expired_pending', status: 'expired' });
    expect(paid).toBeNull();
    await expect(
      methods.findSubscriptionPaymentOrderByTradeNo!('lc_expired_paid'),
    ).resolves.toMatchObject({ status: 'paid' });
  });

  test('lists stuck subscription payment orders older than the cutoff', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const expiresAt = new Date('2026-05-03T00:00:00.000Z');

    const oldPending = await methods.createSubscriptionPaymentOrder!({
      user,
      outTradeNo: 'old-pending',
      planKey: 'pro',
      amount: 29,
      paymentType: 'alipay',
      status: 'pending',
      expiresAt,
    });
    const oldPaid = await methods.createSubscriptionPaymentOrder!({
      user,
      outTradeNo: 'old-paid',
      planKey: 'pro',
      amount: 29,
      paymentType: 'alipay',
      status: 'paid',
      expiresAt,
    });
    const newPending = await methods.createSubscriptionPaymentOrder!({
      user,
      outTradeNo: 'new-pending',
      planKey: 'pro',
      amount: 29,
      paymentType: 'alipay',
      status: 'pending',
      expiresAt,
    });
    const oldCompleted = await methods.createSubscriptionPaymentOrder!({
      user,
      outTradeNo: 'old-completed',
      planKey: 'pro',
      amount: 29,
      paymentType: 'alipay',
      status: 'completed',
      expiresAt,
    });

    // Mongoose marks `createdAt` immutable when `timestamps: true` is set,
    // so model-level `updateOne($set: { createdAt })` is silently dropped.
    // Reach through to the raw collection to backdate the documents.
    const orderCollection = mongoose.models.SubscriptionPaymentOrder.collection;
    await orderCollection.updateOne(
      { _id: oldPending?._id },
      { $set: { createdAt: new Date('2026-05-02T00:00:00.000Z') } },
    );
    await orderCollection.updateOne(
      { _id: oldPaid?._id },
      { $set: { createdAt: new Date('2026-05-02T00:01:00.000Z') } },
    );
    await orderCollection.updateOne(
      { _id: newPending?._id },
      { $set: { createdAt: new Date('2026-05-02T00:20:00.000Z') } },
    );
    await orderCollection.updateOne(
      { _id: oldCompleted?._id },
      { $set: { createdAt: new Date('2026-05-02T00:00:00.000Z') } },
    );

    const orders = await methods.listStuckSubscriptionPaymentOrders!({
      olderThan: new Date('2026-05-02T00:15:00.000Z'),
      limit: 10,
      statuses: ['pending', 'paid', 'fulfilling'],
    });

    expect(orders.map((order) => order.outTradeNo)).toEqual(['old-pending', 'old-paid']);
  });

  test('creates one subscription for repeated source order fulfillment', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const sourceOrderId = new mongoose.Types.ObjectId();
    const now = new Date('2026-05-02T00:00:00.000Z');

    const created = await methods.createOrExtendUserSubscription!({
      user,
      planKey: 'pro',
      durationDays: 30,
      sourceOrderId,
      now,
      tenantId: 'tenant-a',
    });
    const repeated = await methods.createOrExtendUserSubscription!({
      user,
      planKey: 'pro',
      durationDays: 30,
      sourceOrderId,
      now,
      tenantId: 'tenant-a',
    });
    const UserSubscription = mongoose.models
      .UserSubscription as mongoose.Model<UserSubscriptionResult>;
    const subscriptions = await UserSubscription.find({
      user: new mongoose.Types.ObjectId(user),
      tenantId: 'tenant-a',
    }).lean();

    expect(created?.expiresAt.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(repeated?._id.toString()).toBe(created?._id.toString());
    expect(repeated?.expiresAt.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(subscriptions).toHaveLength(1);
  });

  test('persists plan snapshot fields when creating and extending user subscriptions', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const firstSourceOrderId = new mongoose.Types.ObjectId();
    const secondSourceOrderId = new mongoose.Types.ObjectId();
    const now = new Date('2026-05-02T00:00:00.000Z');

    const created = await methods.createOrExtendUserSubscription!({
      user,
      planKey: 'pro',
      durationDays: 30,
      sourceOrderId: firstSourceOrderId,
      now,
      planName: 'Pro',
      planDescription: 'Professional plan',
      planAmount: 29.5,
      textDailyLimit: 200,
      imageDailyLimit: 50,
    });
    const extended = await methods.createOrExtendUserSubscription!({
      user,
      planKey: 'team',
      durationDays: 30,
      sourceOrderId: secondSourceOrderId,
      now: new Date('2026-05-03T00:00:00.000Z'),
      planName: 'Team',
      planDescription: 'Team plan',
      planAmount: 99,
      textDailyLimit: 1000,
      imageDailyLimit: 250,
    });

    expect(created).toMatchObject({
      planName: 'Pro',
      planDescription: 'Professional plan',
      planAmount: 29.5,
      textDailyLimit: 200,
      imageDailyLimit: 50,
    });
    expect(extended?._id.toString()).toBe(created?._id.toString());
    expect(extended).toMatchObject({
      planKey: 'team',
      planName: 'Team',
      planDescription: 'Team plan',
      planAmount: 99,
      textDailyLimit: 1000,
      imageDailyLimit: 250,
    });
  });

  test('does not extend again when an older fulfilled source order is retried', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const firstSourceOrderId = new mongoose.Types.ObjectId();
    const secondSourceOrderId = new mongoose.Types.ObjectId();
    const now = new Date('2026-05-02T00:00:00.000Z');

    const first = await methods.createOrExtendUserSubscription!({
      user,
      planKey: 'pro',
      durationDays: 30,
      sourceOrderId: firstSourceOrderId,
      now,
      tenantId: 'tenant-a',
    });
    const second = await methods.createOrExtendUserSubscription!({
      user,
      planKey: 'pro',
      durationDays: 30,
      sourceOrderId: secondSourceOrderId,
      now,
      tenantId: 'tenant-a',
    });
    const repeatedFirst = await methods.createOrExtendUserSubscription!({
      user,
      planKey: 'pro',
      durationDays: 30,
      sourceOrderId: firstSourceOrderId,
      now,
      tenantId: 'tenant-a',
    });
    const UserSubscription = mongoose.models
      .UserSubscription as mongoose.Model<UserSubscriptionResult>;
    const afterRetry = await UserSubscription.findById(first?._id).lean().orFail();

    expect(second?._id.toString()).toBe(first?._id.toString());
    expect(second?.expiresAt.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(repeatedFirst?._id.toString()).toBe(first?._id.toString());
    expect(repeatedFirst?.expiresAt.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(afterRetry.expiresAt.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(afterRetry.sourceOrderIds?.map((value) => value.toString()).sort()).toEqual(
      [firstSourceOrderId.toString(), secondSourceOrderId.toString()].sort(),
    );
  });

  test('applies concurrent distinct source order extensions without losing duration', async () => {
    const UserSubscription = mongoose.models
      .UserSubscription as mongoose.Model<UserSubscriptionResult>;
    const user = new mongoose.Types.ObjectId();
    const now = new Date('2026-05-02T00:00:00.000Z');
    const active = await UserSubscription.create({
      user,
      planKey: 'pro',
      status: 'active',
      startsAt: now,
      expiresAt: new Date('2026-06-01T00:00:00.000Z'),
      tenantId: 'tenant-a',
    });
    const sourceOrderIds = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId());

    const results = await Promise.all(
      sourceOrderIds.map((sourceOrderId) =>
        methods.createOrExtendUserSubscription!({
          user: user.toString(),
          planKey: 'pro',
          durationDays: 30,
          sourceOrderId,
          now,
          tenantId: 'tenant-a',
        }),
      ),
    );
    const afterExtensions = await UserSubscription.findById(active._id).lean().orFail();

    expect(results.every((result) => result?._id.toString() === active._id.toString())).toBe(true);
    expect(afterExtensions.expiresAt.toISOString()).toBe('2026-10-29T00:00:00.000Z');
    expect(afterExtensions.sourceOrderIds?.map((value) => value.toString()).sort()).toEqual(
      sourceOrderIds.map((value) => value.toString()).sort(),
    );
  });

  test('coalesces concurrent first-time paid fulfillments into one subscription', async () => {
    const UserSubscription = mongoose.models
      .UserSubscription as mongoose.Model<UserSubscriptionResult>;
    const user = new mongoose.Types.ObjectId();
    const now = new Date('2026-05-02T00:00:00.000Z');
    const sourceOrderIds = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId());

    const results = await Promise.all(
      sourceOrderIds.map((sourceOrderId) =>
        methods.createOrExtendUserSubscription!({
          user: user.toString(),
          planKey: 'pro',
          durationDays: 30,
          sourceOrderId,
          now,
          tenantId: 'tenant-a',
        }),
      ),
    );
    const subscriptions = await UserSubscription.find({ user, tenantId: 'tenant-a' }).lean();

    expect(subscriptions).toHaveLength(1);
    expect(
      results.every((result) => result?._id.toString() === subscriptions[0]._id.toString()),
    ).toBe(true);
    expect(subscriptions[0].expiresAt.toISOString()).toBe('2026-09-29T00:00:00.000Z');
    expect(subscriptions[0].sourceOrderIds?.map((value) => value.toString()).sort()).toEqual(
      sourceOrderIds.map((value) => value.toString()).sort(),
    );
  });

  test('extends the latest active current or future subscription in the same tenant', async () => {
    const UserSubscription = mongoose.models
      .UserSubscription as mongoose.Model<UserSubscriptionResult>;
    const user = new mongoose.Types.ObjectId();
    const sourceOrderId = new mongoose.Types.ObjectId();
    const now = new Date('2026-05-02T00:00:00.000Z');
    const tenantless = await UserSubscription.create({
      user,
      planKey: 'tenantless-pro',
      status: 'active',
      startsAt: new Date('2026-05-01T00:00:00.000Z'),
      expiresAt: new Date('2026-05-20T00:00:00.000Z'),
    });
    const tenantFuture = await UserSubscription.create({
      user,
      planKey: 'tenant-pro',
      status: 'active',
      startsAt: new Date('2026-05-10T00:00:00.000Z'),
      expiresAt: new Date('2026-06-01T00:00:00.000Z'),
      tenantId: 'tenant-a',
    });

    const extended = await methods.createOrExtendUserSubscription!({
      user: user.toString(),
      planKey: 'tenant-pro',
      durationDays: 30,
      sourceOrderId,
      now,
      tenantId: 'tenant-a',
    });
    const afterTenantless = await UserSubscription.findById(tenantless._id).lean().orFail();
    const afterTenantFuture = await UserSubscription.findById(tenantFuture._id).lean().orFail();

    expect(extended?._id.toString()).toBe(tenantFuture._id.toString());
    expect(extended?.expiresAt.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(extended?.sourceOrderId?.toString()).toBe(sourceOrderId.toString());
    expect(afterTenantless.expiresAt.toISOString()).toBe('2026-05-20T00:00:00.000Z');
    expect(afterTenantFuture.expiresAt.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  test('keeps tenantless quota events separate from tenant-scoped request ids', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const windowStart = new Date('2026-05-01T16:00:00.000Z');
    const windowEnd = new Date('2026-05-02T16:00:00.000Z');
    const input = {
      user,
      kind: 'text' as const,
      amount: 1,
      limit: 2,
      windowKey: '2026-05-02',
      windowStart,
      windowEnd,
      requestId: 'shared-request-id',
    };

    await methods.consumeSubscriptionQuota!({ ...input, tenantId: 'tenant-a' });
    const tenantlessResult = await methods.consumeSubscriptionQuota!(input);

    const Event = mongoose.models.SubscriptionUsageEvent as mongoose.Model<{
      requestId: string;
      tenantId?: string | null;
    }>;
    const Bucket = mongoose.models.SubscriptionUsageBucket as mongoose.Model<{
      user: mongoose.Types.ObjectId;
      windowKey: string;
      tenantId?: string | null;
    }>;
    const events = await Event.find({ requestId: 'shared-request-id' }).lean();
    const buckets = await Bucket.find({
      user: new mongoose.Types.ObjectId(user),
      windowKey: '2026-05-02',
    }).lean();
    const eventTenantIds = events.map((event) => event.tenantId ?? null);
    const bucketTenantIds = buckets.map((bucket) => bucket.tenantId ?? null);

    expect(tenantlessResult).toMatchObject({ allowed: true, used: 1, limit: 2 });
    expect(eventTenantIds).toHaveLength(2);
    expect(eventTenantIds).toContain('tenant-a');
    expect(eventTenantIds).toContain(null);
    expect(bucketTenantIds).toHaveLength(2);
    expect(bucketTenantIds).toContain('tenant-a');
    expect(bucketTenantIds).toContain(null);
  });

  test('allows only one concurrent distinct request when quota limit is one', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const windowStart = new Date('2026-05-01T16:00:00.000Z');
    const windowEnd = new Date('2026-05-02T16:00:00.000Z');
    const inputs = Array.from({ length: 5 }, (_, index) => ({
      user,
      kind: 'text' as const,
      amount: 1,
      limit: 1,
      windowKey: '2026-05-02',
      windowStart,
      windowEnd,
      requestId: `distinct-request-${index}`,
    }));

    const results = await Promise.allSettled(
      inputs.map((input) => methods.consumeSubscriptionQuota!(input)),
    );
    const rejected = results.filter((result) => result.status === 'rejected');
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<ConsumeSubscriptionQuotaResult> =>
        result.status === 'fulfilled',
    );
    const Bucket = mongoose.models
      .SubscriptionUsageBucket as mongoose.Model<SubscriptionUsageBucketResult>;
    const bucket = await Bucket.findOne({
      user: new mongoose.Types.ObjectId(user),
      windowKey: '2026-05-02',
      tenantId: null,
    }).lean();

    expect(rejected).toHaveLength(0);
    expect(fulfilled.filter((result) => result.value.allowed)).toHaveLength(1);
    expect(fulfilled.filter((result) => !result.value.allowed)).toHaveLength(4);
    expect(bucket?.textUsed).toBe(1);
  });

  test('treats concurrent duplicate request ids as idempotent quota consumption', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const windowStart = new Date('2026-05-01T16:00:00.000Z');
    const windowEnd = new Date('2026-05-02T16:00:00.000Z');
    const input = {
      user,
      kind: 'text' as const,
      amount: 1,
      limit: 5,
      windowKey: '2026-05-02',
      windowStart,
      windowEnd,
      requestId: 'duplicate-request',
    };

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => methods.consumeSubscriptionQuota!(input)),
    );
    const rejected = results.filter((result) => result.status === 'rejected');
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<ConsumeSubscriptionQuotaResult> =>
        result.status === 'fulfilled',
    );
    const Bucket = mongoose.models
      .SubscriptionUsageBucket as mongoose.Model<SubscriptionUsageBucketResult>;
    const bucket = await Bucket.findOne({
      user: new mongoose.Types.ObjectId(user),
      windowKey: '2026-05-02',
      tenantId: null,
    }).lean();

    expect(rejected).toHaveLength(0);
    expect(fulfilled).toHaveLength(5);
    expect(fulfilled.every((result) => result.value.allowed)).toBe(true);
    expect(bucket?.textUsed).toBe(1);
    expect(bucket?.textRequestIds).toEqual(['duplicate-request']);
    expect(bucket?.imageRequestIds).toEqual([]);
  });

  test('throws when duplicate request ids use different quota dimensions', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const otherUser = new mongoose.Types.ObjectId().toString();
    const windowStart = new Date('2026-05-01T16:00:00.000Z');
    const windowEnd = new Date('2026-05-02T16:00:00.000Z');
    const requestId = 'dimension-mismatch';

    await methods.consumeSubscriptionQuota!({
      user,
      kind: 'text',
      amount: 1,
      limit: 5,
      windowKey: '2026-05-02',
      windowStart,
      windowEnd,
      requestId,
    });

    await expect(
      methods.consumeSubscriptionQuota!({
        user: otherUser,
        kind: 'image',
        amount: 2,
        limit: 5,
        windowKey: '2026-05-03',
        windowStart: new Date('2026-05-02T16:00:00.000Z'),
        windowEnd: new Date('2026-05-03T16:00:00.000Z'),
        requestId,
      }),
    ).rejects.toThrow('Subscription quota requestId collision');

    const Bucket = mongoose.models
      .SubscriptionUsageBucket as mongoose.Model<SubscriptionUsageBucketResult>;
    const buckets = await Bucket.find({ tenantId: null }).lean();

    expect(buckets).toHaveLength(1);
    expect(buckets[0].user.toString()).toBe(user);
    expect(buckets[0].windowKey).toBe('2026-05-02');
    expect(buckets[0].textUsed).toBe(1);
  });

  test('throws when duplicate request ids reuse a window key with different bounds or limit', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const windowStart = new Date('2026-05-01T16:00:00.000Z');
    const windowEnd = new Date('2026-05-02T16:00:00.000Z');
    const requestId = 'window-metadata-mismatch';

    await methods.consumeSubscriptionQuota!({
      user,
      kind: 'text',
      amount: 1,
      limit: 5,
      windowKey: '2026-05-02',
      windowStart,
      windowEnd,
      requestId,
    });

    await expect(
      methods.consumeSubscriptionQuota!({
        user,
        kind: 'text',
        amount: 1,
        limit: 6,
        windowKey: '2026-05-02',
        windowStart,
        windowEnd: new Date('2026-05-03T16:00:00.000Z'),
        requestId,
      }),
    ).rejects.toThrow('Subscription quota requestId collision');
  });

  test('rejects invalid runtime quota input before mutating buckets', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const windowStart = new Date('2026-05-01T16:00:00.000Z');
    const windowEnd = new Date('2026-05-02T16:00:00.000Z');
    const validInput: ConsumeSubscriptionQuotaInput = {
      user,
      kind: 'text',
      amount: 1,
      limit: 5,
      windowKey: '2026-05-02',
      windowStart,
      windowEnd,
      requestId: 'runtime-validation',
    };
    const consumeRuntime = methods.consumeSubscriptionQuota as (
      input: RuntimeConsumeSubscriptionQuotaInput,
    ) => Promise<ConsumeSubscriptionQuotaResult>;
    const Bucket = mongoose.models
      .SubscriptionUsageBucket as mongoose.Model<SubscriptionUsageBucketResult>;
    const invalidInputs: Array<[string, RuntimeConsumeSubscriptionQuotaInput]> = [
      ['empty request id', { ...validInput, requestId: '' }],
      ['invalid kind', { ...validInput, kind: 'audio' }],
      ['non-integer amount', { ...validInput, amount: 1.5 }],
      ['invalid window range', { ...validInput, windowEnd: windowStart }],
    ];

    for (const [, input] of invalidInputs) {
      await expect(consumeRuntime(input)).rejects.toThrow('Invalid subscription quota input');
      await expect(Bucket.countDocuments({})).resolves.toBe(0);
    }
  });

  test('rolls back bucket consumption when usage event creation fails', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const windowStart = new Date('2026-05-01T16:00:00.000Z');
    const windowEnd = new Date('2026-05-02T16:00:00.000Z');
    const Event = mongoose.models.SubscriptionUsageEvent as mongoose.Model<{
      requestId: string;
    }>;
    const Bucket = mongoose.models
      .SubscriptionUsageBucket as mongoose.Model<SubscriptionUsageBucketResult>;

    jest.spyOn(Event, 'create').mockRejectedValueOnce(new Error('event store unavailable'));

    await expect(
      methods.consumeSubscriptionQuota!({
        user,
        kind: 'text',
        amount: 1,
        limit: 5,
        windowKey: '2026-05-02',
        windowStart,
        windowEnd,
        requestId: 'event-create-fails',
      }),
    ).rejects.toThrow('event store unavailable');

    const bucket = await Bucket.findOne({
      user: new mongoose.Types.ObjectId(user),
      windowKey: '2026-05-02',
      tenantId: null,
    }).lean();

    expect(bucket?.textUsed ?? 0).toBe(0);
    expect(bucket?.textRequestIds ?? []).toEqual([]);
  });

  test('rolls back bucket consumption when event creation and follow-up lookup fail', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const windowStart = new Date('2026-05-01T16:00:00.000Z');
    const windowEnd = new Date('2026-05-02T16:00:00.000Z');
    const Event = mongoose.models
      .SubscriptionUsageEvent as mongoose.Model<SubscriptionUsageEventResult>;
    const Bucket = mongoose.models
      .SubscriptionUsageBucket as mongoose.Model<SubscriptionUsageBucketResult>;
    const createError = new Error('event store unavailable');

    jest.spyOn(Event, 'create').mockRejectedValueOnce(createError);
    jest
      .spyOn(Event.collection, 'findOne')
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('event lookup unavailable'));

    await expect(
      methods.consumeSubscriptionQuota!({
        user,
        kind: 'text',
        amount: 1,
        limit: 5,
        windowKey: '2026-05-02',
        windowStart,
        windowEnd,
        requestId: 'event-create-and-lookup-fail',
      }),
    ).rejects.toThrow('event store unavailable');

    const bucket = await Bucket.findOne({
      user: new mongoose.Types.ObjectId(user),
      windowKey: '2026-05-02',
      tenantId: null,
    }).lean();

    expect(bucket?.textUsed ?? 0).toBe(0);
    expect(bucket?.textRequestIds ?? []).toEqual([]);
  });

  test('keeps usage event canonical dimensions immutable through save and update', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const replacementUser = new mongoose.Types.ObjectId();
    const windowStart = new Date('2026-05-01T16:00:00.000Z');
    const windowEnd = new Date('2026-05-02T16:00:00.000Z');
    const Event = mongoose.models
      .SubscriptionUsageEvent as mongoose.Model<SubscriptionUsageEventResult>;

    await methods.consumeSubscriptionQuota!({
      user,
      kind: 'text',
      amount: 1,
      limit: 5,
      windowKey: '2026-05-02',
      windowStart,
      windowEnd,
      requestId: 'immutable-event',
    });

    const event = await Event.findOne({ requestId: 'immutable-event', tenantId: null }).orFail();
    const eventId = event._id;
    expect(event.windowStart).toEqual(windowStart);
    expect(event.windowEnd).toEqual(windowEnd);
    expect(event.limit).toBe(5);

    event.user = replacementUser;
    event.kind = 'image';
    event.amount = 2;
    event.requestId = 'save-changed-event';
    event.bucketKey = 'save-changed-window';
    event.windowStart = new Date('2026-05-02T16:00:00.000Z');
    event.windowEnd = new Date('2026-05-03T16:00:00.000Z');
    event.limit = 99;
    event.tenantId = 'tenant-a';
    event.status = 'released';
    await event.save();

    const afterSave = await Event.findById(eventId).lean().orFail();
    expect(afterSave.user.toString()).toBe(user);
    expect(afterSave.kind).toBe('text');
    expect(afterSave.amount).toBe(1);
    expect(afterSave.requestId).toBe('immutable-event');
    expect(afterSave.bucketKey).toBe('2026-05-02');
    expect(afterSave.windowStart).toEqual(windowStart);
    expect(afterSave.windowEnd).toEqual(windowEnd);
    expect(afterSave.limit).toBe(5);
    expect(afterSave.tenantId ?? null).toBeNull();
    expect(afterSave.status).toBe('released');

    await Event.updateOne(
      { _id: eventId },
      {
        $set: {
          user: replacementUser,
          kind: 'image',
          amount: 3,
          requestId: 'update-changed-event',
          bucketKey: 'update-changed-window',
          windowStart: new Date('2026-05-03T16:00:00.000Z'),
          windowEnd: new Date('2026-05-04T16:00:00.000Z'),
          limit: 100,
          status: 'committed',
        },
      },
    );

    const afterUpdate = await Event.findById(eventId).lean().orFail();
    expect(afterUpdate.user.toString()).toBe(user);
    expect(afterUpdate.kind).toBe('text');
    expect(afterUpdate.amount).toBe(1);
    expect(afterUpdate.requestId).toBe('immutable-event');
    expect(afterUpdate.bucketKey).toBe('2026-05-02');
    expect(afterUpdate.windowStart).toEqual(windowStart);
    expect(afterUpdate.windowEnd).toEqual(windowEnd);
    expect(afterUpdate.limit).toBe(5);
    expect(afterUpdate.tenantId ?? null).toBeNull();
    expect(afterUpdate.status).toBe('committed');
  });

  test('honors explicit plan tenant filters inside an ambient tenant context', async () => {
    await methods.upsertSubscriptionPlan!({
      key: 'ambient',
      name: 'Tenantless Ambient',
      price: 19,
      durationDays: 30,
      textDailyLimit: 100,
      imageDailyLimit: 25,
      enabled: true,
      sortOrder: 1,
    });

    await methods.upsertSubscriptionPlan!({
      key: 'ambient',
      name: 'Tenant B Ambient',
      price: 29,
      durationDays: 30,
      textDailyLimit: 200,
      imageDailyLimit: 50,
      enabled: true,
      sortOrder: 1,
      tenantId: 'tenant-b',
    });

    const [tenantlessPlans, tenantBPlans] = await tenantStorage.run(
      { tenantId: 'tenant-a' },
      async () => {
        const tenantless = await methods.getEnabledSubscriptionPlans!();
        const tenantB = await methods.getEnabledSubscriptionPlans!('tenant-b');
        return [tenantless, tenantB];
      },
    );

    expect(tenantlessPlans.map((plan) => plan.name)).toEqual(['Tenantless Ambient']);
    expect(tenantBPlans.map((plan) => plan.name)).toEqual(['Tenant B Ambient']);
  });

  test('keeps tenantless active subscriptions separate from tenant-scoped subscriptions', async () => {
    const UserSubscription = mongoose.models.UserSubscription as mongoose.Model<{
      user: mongoose.Types.ObjectId;
      planKey: string;
      status: 'active' | 'expired' | 'cancelled';
      startsAt: Date;
      expiresAt: Date;
      tenantId?: string | null;
    }>;
    const user = new mongoose.Types.ObjectId();
    const now = new Date('2026-05-02T00:00:00.000Z');

    await UserSubscription.create([
      {
        user,
        planKey: 'tenantless-pro',
        status: 'active',
        startsAt: new Date('2026-05-01T00:00:00.000Z'),
        expiresAt: new Date('2026-05-04T00:00:00.000Z'),
      },
      {
        user,
        planKey: 'tenant-pro',
        status: 'active',
        startsAt: new Date('2026-05-01T00:00:00.000Z'),
        expiresAt: new Date('2026-05-05T00:00:00.000Z'),
        tenantId: 'tenant-a',
      },
    ]);

    const tenantlessSubscription = await methods.findActiveUserSubscription!(user.toString(), now);
    const tenantSubscription = await methods.findActiveUserSubscription!(
      user.toString(),
      now,
      'tenant-a',
    );

    expect(tenantlessSubscription?.planKey).toBe('tenantless-pro');
    expect(tenantlessSubscription?.tenantId ?? null).toBeNull();
    expect(tenantSubscription?.planKey).toBe('tenant-pro');
    expect(tenantSubscription?.tenantId).toBe('tenant-a');
  });

  test('ignores future-dated active subscriptions until their start date', async () => {
    const UserSubscription = mongoose.models.UserSubscription as mongoose.Model<{
      user: mongoose.Types.ObjectId;
      planKey: string;
      status: 'active' | 'expired' | 'cancelled';
      startsAt: Date;
      expiresAt: Date;
      tenantId?: string | null;
    }>;
    const user = new mongoose.Types.ObjectId();
    const now = new Date('2026-05-02T00:00:00.000Z');

    await UserSubscription.create([
      {
        user,
        planKey: 'current-pro',
        status: 'active',
        startsAt: new Date('2026-05-01T00:00:00.000Z'),
        expiresAt: new Date('2026-05-03T00:00:00.000Z'),
      },
      {
        user,
        planKey: 'future-pro',
        status: 'active',
        startsAt: new Date('2026-05-03T00:00:00.000Z'),
        expiresAt: new Date('2026-05-10T00:00:00.000Z'),
      },
    ]);

    const subscription = await methods.findActiveUserSubscription!(user.toString(), now);

    expect(subscription?.planKey).toBe('current-pro');
  });
});
