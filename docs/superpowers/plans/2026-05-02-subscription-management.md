# Subscription Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build daily text and image quotas with paid subscription plans and ZPay payment fulfillment.

**Architecture:** Add an isolated subscription subsystem instead of modifying LibreChat's existing token balance model. Most logic lives in `packages/api` and `packages/data-schemas`; the legacy `api` package only mounts routes and adds thin quota hooks to chat and image tool entry points.

**Tech Stack:** TypeScript, CommonJS Express wrappers, Mongoose, MongoDB, React, React Query, Jest, EasyPay/ZPay MD5 signing.

---

## File Structure

Create:

- `packages/data-schemas/src/types/subscription.ts`: database interfaces and string unions.
- `packages/data-schemas/src/schema/subscription/plan.ts`: plan schema.
- `packages/data-schemas/src/schema/subscription/user.ts`: user subscription schema.
- `packages/data-schemas/src/schema/subscription/bucket.ts`: daily usage bucket schema.
- `packages/data-schemas/src/schema/subscription/event.ts`: usage event schema.
- `packages/data-schemas/src/schema/subscription/order.ts`: payment order schema.
- `packages/data-schemas/src/schema/subscription/index.ts`: schema exports.
- `packages/data-schemas/src/models/subscription.ts`: model factories.
- `packages/data-schemas/src/methods/subscription.ts`: plan, usage, subscription, and order data methods.
- `packages/data-schemas/src/methods/subscription.spec.ts`: database tests.
- `packages/api/src/subscriptions/types.ts`: service-level input and response types.
- `packages/api/src/subscriptions/config.ts`: subscription env config loader.
- `packages/api/src/subscriptions/windows.ts`: quota window calculation.
- `packages/api/src/subscriptions/quota.ts`: quota service.
- `packages/api/src/subscriptions/payment/easypay.ts`: EasyPay signing, creation payloads, and notify verification.
- `packages/api/src/subscriptions/payment/service.ts`: order creation and fulfillment service.
- `packages/api/src/subscriptions/middleware.ts`: Express quota middleware and image tool guard helpers.
- `packages/api/src/subscriptions/routes.ts`: Express router factory.
- `packages/api/src/subscriptions/*.spec.ts`: service and payment tests.
- `api/server/routes/subscriptions.js`: CommonJS route wrapper.
- `client/src/data-provider/Subscriptions/queries.ts`: React Query queries.
- `client/src/data-provider/Subscriptions/mutations.ts`: React Query mutations.
- `client/src/data-provider/Subscriptions/index.ts`: feature exports.
- `client/src/components/Nav/SettingsTabs/Subscription/Subscription.tsx`: settings tab view.
- `client/src/components/Nav/SettingsTabs/Subscription/UsageMeter.tsx`: usage display.
- `client/src/components/Nav/SettingsTabs/Subscription/PlanList.tsx`: plan list and checkout actions.
- `client/src/components/Nav/SettingsTabs/Subscription/index.ts`: component export.

Modify:

- `packages/data-schemas/src/schema/index.ts`
- `packages/data-schemas/src/models/index.ts`
- `packages/data-schemas/src/methods/index.ts`
- `packages/data-schemas/src/types/index.ts`
- `packages/api/src/index.ts`
- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/keys.ts`
- `packages/data-provider/src/types.ts`
- `client/src/data-provider/index.ts`
- `client/src/components/Nav/SettingsTabs/index.ts`
- `client/src/components/Nav/Settings.tsx`
- `client/src/locales/en/translation.json`
- `api/server/index.js`
- `api/server/routes/index.js`
- `api/server/routes/agents/chat.js`
- `api/server/routes/assistants/chatV1.js`
- `api/server/routes/assistants/chatV2.js`
- `api/app/clients/tools/util/handleTools.js`
- `api/server/services/ToolService.js`
- `client/src/components/Messages/Content/Error.tsx`

## Scope Check

The design covers four linked subsystems: database state, quota enforcement, ZPay payment, and user UI. They are kept in one plan because each task produces a working layer required by the next task, and the first usable release needs all four.

### Task 1: Shared API Contract

**Files:**
- Modify: `packages/data-provider/src/api-endpoints.ts`
- Modify: `packages/data-provider/src/data-service.ts`
- Modify: `packages/data-provider/src/keys.ts`
- Modify: `packages/data-provider/src/types.ts`

- [ ] **Step 1: Add shared subscription types**

Add this block near other exported response types in `packages/data-provider/src/types.ts`:

```ts
export type TSubscriptionQuotaKind = 'text' | 'image';
export type TSubscriptionOrderStatus =
  | 'pending'
  | 'paid'
  | 'fulfilling'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'failed';

export type TSubscriptionPlan = {
  key: string;
  name: string;
  description?: string;
  price: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  enabled: boolean;
  sortOrder: number;
};

export type TSubscriptionUsage = {
  windowKey: string;
  resetAt: string;
  text: { used: number; limit: number };
  image: { used: number; limit: number };
};

export type TSubscriptionStatus = {
  plan: TSubscriptionPlan;
  subscription?: {
    planKey: string;
    status: 'active' | 'expired' | 'cancelled';
    startsAt: string;
    expiresAt: string;
  };
  usage: TSubscriptionUsage;
};

export type TCreateSubscriptionOrderRequest = {
  planKey: string;
  paymentType: 'alipay' | 'wxpay';
  isMobile?: boolean;
};

export type TCreateSubscriptionOrderResponse = {
  orderId: string;
  outTradeNo: string;
  status: TSubscriptionOrderStatus;
  payUrl?: string;
  qrCode?: string;
  expiresAt: string;
};

export type TSubscriptionOrder = TCreateSubscriptionOrderResponse & {
  planKey: string;
  amount: number;
  completedAt?: string;
};
```

- [ ] **Step 2: Add query keys**

Add enum members in `packages/data-provider/src/keys.ts`:

```ts
subscriptionPlans = 'subscriptionPlans',
subscriptionStatus = 'subscriptionStatus',
subscriptionOrder = 'subscriptionOrder',
```

- [ ] **Step 3: Add endpoint builders**

Add these functions in `packages/data-provider/src/api-endpoints.ts`:

```ts
export const subscriptions = () => `${BASE_URL}/api/subscriptions`;
export const subscriptionPlans = () => `${subscriptions()}/plans`;
export const subscriptionStatus = () => `${subscriptions()}/me`;
export const subscriptionOrders = () => `${subscriptions()}/orders`;
export const subscriptionOrder = (orderId: string) =>
  `${subscriptionOrders()}/${encodeURIComponent(orderId)}`;
```

- [ ] **Step 4: Add data-service methods**

Add these exports in `packages/data-provider/src/data-service.ts`:

```ts
export function getSubscriptionPlans(): Promise<t.TSubscriptionPlan[]> {
  return request.get(endpoints.subscriptionPlans());
}

export function getSubscriptionStatus(): Promise<t.TSubscriptionStatus> {
  return request.get(endpoints.subscriptionStatus());
}

export function createSubscriptionOrder(
  payload: t.TCreateSubscriptionOrderRequest,
): Promise<t.TCreateSubscriptionOrderResponse> {
  return request.post(endpoints.subscriptionOrders(), payload);
}

export function getSubscriptionOrder(orderId: string): Promise<t.TSubscriptionOrder> {
  return request.get(endpoints.subscriptionOrder(orderId));
}
```

- [ ] **Step 5: Build shared package**

Run: `npm run build:data-provider`

Expected: command exits with code 0.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/data-provider/src/api-endpoints.ts packages/data-provider/src/data-service.ts packages/data-provider/src/keys.ts packages/data-provider/src/types.ts
git commit -m "feat: add subscription api contract"
```

### Task 2: Database Models And Methods

**Files:**
- Create: `packages/data-schemas/src/types/subscription.ts`
- Create: `packages/data-schemas/src/schema/subscription/*.ts`
- Create: `packages/data-schemas/src/models/subscription.ts`
- Create: `packages/data-schemas/src/methods/subscription.ts`
- Create: `packages/data-schemas/src/methods/subscription.spec.ts`
- Modify: `packages/data-schemas/src/schema/index.ts`
- Modify: `packages/data-schemas/src/models/index.ts`
- Modify: `packages/data-schemas/src/methods/index.ts`
- Modify: `packages/data-schemas/src/types/index.ts`

- [ ] **Step 1: Write failing model and quota tests**

Create `packages/data-schemas/src/methods/subscription.spec.ts`:

```ts
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '~/models';
import { createMethods } from './index';

describe('subscription methods', () => {
  let mongoServer: MongoMemoryServer;
  let methods: ReturnType<typeof createMethods>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    createModels(mongoose);
    methods = createMethods(mongoose);
  });

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('upserts and resolves an enabled subscription plan', async () => {
    await methods.upsertSubscriptionPlan({
      key: 'pro',
      name: 'Pro',
      price: 29,
      durationDays: 30,
      textDailyLimit: 200,
      imageDailyLimit: 50,
      enabled: true,
      sortOrder: 1,
    });

    const plans = await methods.getEnabledSubscriptionPlans();

    expect(plans).toHaveLength(1);
    expect(plans[0].key).toBe('pro');
    expect(plans[0].textDailyLimit).toBe(200);
  });

  test('consumes quota atomically until the limit is reached', async () => {
    const user = new mongoose.Types.ObjectId().toString();
    const first = await methods.consumeSubscriptionQuota({
      user,
      kind: 'text',
      amount: 1,
      limit: 2,
      windowKey: '2026-05-02',
      windowStart: new Date('2026-05-01T16:00:00.000Z'),
      windowEnd: new Date('2026-05-02T16:00:00.000Z'),
      requestId: 'req-1',
    });
    const second = await methods.consumeSubscriptionQuota({
      user,
      kind: 'text',
      amount: 1,
      limit: 2,
      windowKey: '2026-05-02',
      windowStart: new Date('2026-05-01T16:00:00.000Z'),
      windowEnd: new Date('2026-05-02T16:00:00.000Z'),
      requestId: 'req-2',
    });
    const third = await methods.consumeSubscriptionQuota({
      user,
      kind: 'text',
      amount: 1,
      limit: 2,
      windowKey: '2026-05-02',
      windowStart: new Date('2026-05-01T16:00:00.000Z'),
      windowEnd: new Date('2026-05-02T16:00:00.000Z'),
      requestId: 'req-3',
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.used).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd packages/data-schemas && npx jest src/methods/subscription.spec.ts --runInBand`

Expected: FAIL with `methods.upsertSubscriptionPlan is not a function`.

- [ ] **Step 3: Add database interfaces**

Create `packages/data-schemas/src/types/subscription.ts`:

```ts
import type { Document, Types } from 'mongoose';

export type SubscriptionQuotaKind = 'text' | 'image';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';
export type SubscriptionOrderStatus =
  | 'pending'
  | 'paid'
  | 'fulfilling'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'failed';

export interface ISubscriptionPlan extends Document {
  key: string;
  name: string;
  description?: string;
  price: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  enabled: boolean;
  sortOrder: number;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserSubscription extends Document {
  user: Types.ObjectId;
  planKey: string;
  status: SubscriptionStatus;
  startsAt: Date;
  expiresAt: Date;
  sourceOrderId?: Types.ObjectId;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISubscriptionUsageBucket extends Document {
  user: Types.ObjectId;
  windowKey: string;
  windowStart: Date;
  windowEnd: Date;
  textUsed: number;
  imageUsed: number;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISubscriptionUsageEvent extends Document {
  user: Types.ObjectId;
  kind: SubscriptionQuotaKind;
  amount: number;
  requestId: string;
  bucketKey: string;
  status: 'committed' | 'released';
  reason?: string;
  metadata?: Record<string, string | number | boolean>;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISubscriptionPaymentOrder extends Document {
  user: Types.ObjectId;
  outTradeNo: string;
  tradeNo?: string;
  planKey: string;
  amount: number;
  paymentType: 'alipay' | 'wxpay';
  status: SubscriptionOrderStatus;
  payUrl?: string;
  qrCode?: string;
  rawNotify?: string;
  expiresAt: Date;
  paidAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  failedReason?: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
```

- [ ] **Step 4: Export types**

Add to `packages/data-schemas/src/types/index.ts`:

```ts
export type * from './subscription';
```

- [ ] **Step 5: Add schemas**

Create schema files under `packages/data-schemas/src/schema/subscription/` using the interfaces from Step 3. Each schema must call `timestamps: true`. Add these indexes:

```ts
planSchema.index({ key: 1, tenantId: 1 }, { unique: true });
planSchema.index({ enabled: 1, sortOrder: 1 });
userSubscriptionSchema.index({ user: 1, status: 1, expiresAt: 1 });
usageBucketSchema.index({ user: 1, windowKey: 1, tenantId: 1 }, { unique: true });
usageEventSchema.index({ requestId: 1, tenantId: 1 }, { unique: true });
paymentOrderSchema.index({ outTradeNo: 1 }, { unique: true });
paymentOrderSchema.index({ user: 1, createdAt: -1 });
paymentOrderSchema.index({ status: 1, expiresAt: 1 });
```

- [ ] **Step 6: Add model factories**

Create `packages/data-schemas/src/models/subscription.ts`:

```ts
import {
  planSchema,
  usageEventSchema,
  usageBucketSchema,
  paymentOrderSchema,
  userSubscriptionSchema,
} from '~/schema/subscription';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type {
  ISubscriptionPlan,
  IUserSubscription,
  ISubscriptionUsageEvent,
  ISubscriptionUsageBucket,
  ISubscriptionPaymentOrder,
} from '~/types';

export function createSubscriptionModels(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(planSchema);
  applyTenantIsolation(userSubscriptionSchema);
  applyTenantIsolation(usageBucketSchema);
  applyTenantIsolation(usageEventSchema);
  applyTenantIsolation(paymentOrderSchema);

  return {
    SubscriptionPlan:
      mongoose.models.SubscriptionPlan ||
      mongoose.model<ISubscriptionPlan>('SubscriptionPlan', planSchema),
    UserSubscription:
      mongoose.models.UserSubscription ||
      mongoose.model<IUserSubscription>('UserSubscription', userSubscriptionSchema),
    SubscriptionUsageBucket:
      mongoose.models.SubscriptionUsageBucket ||
      mongoose.model<ISubscriptionUsageBucket>('SubscriptionUsageBucket', usageBucketSchema),
    SubscriptionUsageEvent:
      mongoose.models.SubscriptionUsageEvent ||
      mongoose.model<ISubscriptionUsageEvent>('SubscriptionUsageEvent', usageEventSchema),
    SubscriptionPaymentOrder:
      mongoose.models.SubscriptionPaymentOrder ||
      mongoose.model<ISubscriptionPaymentOrder>('SubscriptionPaymentOrder', paymentOrderSchema),
  };
}
```

- [ ] **Step 7: Register models**

In `packages/data-schemas/src/models/index.ts`, import `createSubscriptionModels` and spread its return value in `createModels`.

- [ ] **Step 8: Add methods**

Create `packages/data-schemas/src/methods/subscription.ts` with these exported methods:

```ts
import type { Model } from 'mongoose';
import type {
  ISubscriptionPlan,
  IUserSubscription,
  SubscriptionQuotaKind,
  ISubscriptionPaymentOrder,
  ISubscriptionUsageBucket,
} from '~/types';

export type UpsertSubscriptionPlanInput = Pick<
  ISubscriptionPlan,
  | 'key'
  | 'name'
  | 'price'
  | 'durationDays'
  | 'textDailyLimit'
  | 'imageDailyLimit'
  | 'enabled'
  | 'sortOrder'
> & {
  description?: string;
  tenantId?: string;
};

export type ConsumeSubscriptionQuotaInput = {
  user: string;
  kind: SubscriptionQuotaKind;
  amount: number;
  limit: number;
  windowKey: string;
  windowStart: Date;
  windowEnd: Date;
  requestId: string;
  tenantId?: string;
};

export function createSubscriptionMethods(mongoose: typeof import('mongoose')) {
  async function upsertSubscriptionPlan(input: UpsertSubscriptionPlanInput) {
    const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
    return SubscriptionPlan.findOneAndUpdate(
      { key: input.key, tenantId: input.tenantId },
      { $set: input },
      { upsert: true, new: true },
    ).lean();
  }

  async function getEnabledSubscriptionPlans() {
    const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
    return SubscriptionPlan.find({ enabled: true }).sort({ sortOrder: 1, price: 1 }).lean();
  }

  async function findActiveUserSubscription(user: string, now = new Date()) {
    const UserSubscription = mongoose.models.UserSubscription as Model<IUserSubscription>;
    return UserSubscription.findOne({
      user,
      status: 'active',
      expiresAt: { $gt: now },
    })
      .sort({ expiresAt: -1 })
      .lean();
  }

  async function consumeSubscriptionQuota(input: ConsumeSubscriptionQuotaInput) {
    const Bucket = mongoose.models.SubscriptionUsageBucket as Model<ISubscriptionUsageBucket>;
    const Event = mongoose.models.SubscriptionUsageEvent;
    const usedField = input.kind === 'text' ? 'textUsed' : 'imageUsed';
    const existingEvent = await Event.findOne({ requestId: input.requestId }).lean();
    if (existingEvent) {
      const bucket = await Bucket.findOne({ user: input.user, windowKey: input.windowKey }).lean();
      const used = Number(bucket?.[usedField] ?? 0);
      return { allowed: true, used, limit: input.limit, resetAt: input.windowEnd };
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      const bucket = await Bucket.findOne({ user: input.user, windowKey: input.windowKey }).lean();
      const current = Number(bucket?.[usedField] ?? 0);
      if (current + input.amount > input.limit) {
        return { allowed: false, used: current, limit: input.limit, resetAt: input.windowEnd };
      }

      const query = bucket
        ? { _id: bucket._id, [usedField]: current }
        : { user: input.user, windowKey: input.windowKey };
      const update = {
        $setOnInsert: {
          user: input.user,
          windowKey: input.windowKey,
          windowStart: input.windowStart,
          windowEnd: input.windowEnd,
          textUsed: 0,
          imageUsed: 0,
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        },
        $inc: { [usedField]: input.amount },
      };
      const updated = await Bucket.findOneAndUpdate(query, update, { upsert: true, new: true }).lean();
      if (updated) {
        await Event.create({
          user: input.user,
          kind: input.kind,
          amount: input.amount,
          requestId: input.requestId,
          bucketKey: input.windowKey,
          status: 'committed',
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        });
        return {
          allowed: true,
          used: Number(updated[usedField] ?? 0),
          limit: input.limit,
          resetAt: input.windowEnd,
        };
      }
    }

    throw new Error('Failed to consume subscription quota after retries');
  }

  return {
    upsertSubscriptionPlan,
    getEnabledSubscriptionPlans,
    findActiveUserSubscription,
    consumeSubscriptionQuota,
  };
}

export type SubscriptionMethods = ReturnType<typeof createSubscriptionMethods>;
```

- [ ] **Step 9: Register methods**

In `packages/data-schemas/src/methods/index.ts`, add `SubscriptionMethods` to `AllMethods`, call `createSubscriptionMethods(mongoose)`, and spread the result into the returned object.

- [ ] **Step 10: Run tests**

Run: `cd packages/data-schemas && npx jest src/methods/subscription.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 11: Commit**

Run:

```bash
git add packages/data-schemas/src
git commit -m "feat: add subscription data models"
```

### Task 3: Quota Service

**Files:**
- Create: `packages/api/src/subscriptions/types.ts`
- Create: `packages/api/src/subscriptions/config.ts`
- Create: `packages/api/src/subscriptions/windows.ts`
- Create: `packages/api/src/subscriptions/quota.ts`
- Create: `packages/api/src/subscriptions/quota.spec.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Write quota tests**

Create `packages/api/src/subscriptions/quota.spec.ts`:

```ts
import { getQuotaWindow } from './windows';
import { createQuotaService } from './quota';

describe('subscription quota service', () => {
  test('uses configured timezone for day windows', () => {
    const window = getQuotaWindow(new Date('2026-05-01T18:00:00.000Z'), 'Asia/Shanghai');

    expect(window.windowKey).toBe('2026-05-02');
    expect(window.windowStart.toISOString()).toBe('2026-05-01T16:00:00.000Z');
    expect(window.windowEnd.toISOString()).toBe('2026-05-02T16:00:00.000Z');
  });

  test('returns structured denial when the daily limit is exhausted', async () => {
    const service = createQuotaService({
      getPlans: async () => [
        {
          key: 'free',
          name: 'Free',
          price: 0,
          durationDays: 0,
          textDailyLimit: 1,
          imageDailyLimit: 0,
          enabled: true,
          sortOrder: 0,
        },
      ],
      findActiveUserSubscription: async () => null,
      consumeSubscriptionQuota: async () => ({
        allowed: false,
        used: 1,
        limit: 1,
        resetAt: new Date('2026-05-02T16:00:00.000Z'),
      }),
    });

    const result = await service.consume({
      userId: '507f191e810c19729de860ea',
      kind: 'text',
      amount: 1,
      requestId: 'req-1',
      now: new Date('2026-05-01T18:00:00.000Z'),
      timezone: 'Asia/Shanghai',
    });

    expect(result.allowed).toBe(false);
    expect(result.error?.type).toBe('subscription_quota');
    expect(result.error?.kind).toBe('text');
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd packages/api && npx jest src/subscriptions/quota.spec.ts --runInBand`

Expected: FAIL with module not found for `./quota`.

- [ ] **Step 3: Add timezone window helper**

Create `packages/api/src/subscriptions/windows.ts`:

```ts
export type QuotaWindow = {
  windowKey: string;
  windowStart: Date;
  windowEnd: Date;
};

export function getQuotaWindow(now: Date, timeZone: string): QuotaWindow {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  const windowKey = `${year}-${month}-${day}`;
  const localMidnight = new Date(`${windowKey}T00:00:00.000`);
  const utcGuess = new Date(`${windowKey}T00:00:00.000Z`);
  const offsetMs = localMidnight.getTime() - utcGuess.getTime();
  const windowStart = new Date(utcGuess.getTime() - offsetMs);
  const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
  return { windowKey, windowStart, windowEnd };
}
```

- [ ] **Step 4: Add service types**

Create `packages/api/src/subscriptions/types.ts`:

```ts
import type { SubscriptionQuotaKind } from '@librechat/data-schemas';

export type SubscriptionPlanView = {
  key: string;
  name: string;
  description?: string;
  price: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  enabled: boolean;
  sortOrder: number;
};

export type SubscriptionQuotaError = {
  type: 'subscription_quota';
  kind: SubscriptionQuotaKind;
  used: number;
  limit: number;
  planKey: string;
  resetAt: string;
};
```

- [ ] **Step 5: Add config loader**

Create `packages/api/src/subscriptions/config.ts`:

```ts
export type SubscriptionConfig = {
  enabled: boolean;
  timezone: string;
  freeTextDailyLimit: number;
  freeImageDailyLimit: number;
};

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getSubscriptionConfig(env: NodeJS.ProcessEnv = process.env): SubscriptionConfig {
  return {
    enabled: env.SUBSCRIPTIONS_ENABLED?.toLowerCase().trim() === 'true',
    timezone: env.SUBSCRIPTION_QUOTA_TIMEZONE || 'Asia/Shanghai',
    freeTextDailyLimit: readNumber(env.SUBSCRIPTION_FREE_TEXT_DAILY_LIMIT, 20),
    freeImageDailyLimit: readNumber(env.SUBSCRIPTION_FREE_IMAGE_DAILY_LIMIT, 2),
  };
}
```

- [ ] **Step 6: Add quota service**

Create `packages/api/src/subscriptions/quota.ts`:

```ts
import type { SubscriptionQuotaKind } from '@librechat/data-schemas';
import type { SubscriptionPlanView, SubscriptionQuotaError } from './types';
import { getQuotaWindow } from './windows';

type ConsumeResult = {
  allowed: boolean;
  used: number;
  limit: number;
  resetAt: Date;
};

type QuotaDeps = {
  getPlans: () => Promise<SubscriptionPlanView[]>;
  findActiveUserSubscription: (user: string, now?: Date) => Promise<{ planKey: string } | null>;
  consumeSubscriptionQuota: (input: {
    user: string;
    kind: SubscriptionQuotaKind;
    amount: number;
    limit: number;
    windowKey: string;
    windowStart: Date;
    windowEnd: Date;
    requestId: string;
    tenantId?: string;
  }) => Promise<ConsumeResult>;
};

type ConsumeInput = {
  userId: string;
  kind: SubscriptionQuotaKind;
  amount: number;
  requestId: string;
  tenantId?: string;
  now?: Date;
  timezone: string;
};

export function createQuotaService(deps: QuotaDeps) {
  async function resolvePlan(userId: string, now: Date): Promise<SubscriptionPlanView> {
    const plans = await deps.getPlans();
    const active = await deps.findActiveUserSubscription(userId, now);
    const activePlan = active ? plans.find((plan) => plan.key === active.planKey) : undefined;
    const freePlan = plans.find((plan) => plan.key === 'free') ?? plans[0];
    if (!activePlan && !freePlan) {
      throw new Error('No subscription plans are configured');
    }
    return activePlan ?? freePlan;
  }

  async function consume(input: ConsumeInput) {
    const now = input.now ?? new Date();
    const plan = await resolvePlan(input.userId, now);
    const limit = input.kind === 'text' ? plan.textDailyLimit : plan.imageDailyLimit;
    const window = getQuotaWindow(now, input.timezone);
    const result = await deps.consumeSubscriptionQuota({
      user: input.userId,
      kind: input.kind,
      amount: input.amount,
      limit,
      windowKey: window.windowKey,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      requestId: input.requestId,
      tenantId: input.tenantId,
    });
    if (result.allowed) {
      return { allowed: true as const, plan, usage: result };
    }
    const error: SubscriptionQuotaError = {
      type: 'subscription_quota',
      kind: input.kind,
      used: result.used,
      limit: result.limit,
      planKey: plan.key,
      resetAt: result.resetAt.toISOString(),
    };
    return { allowed: false as const, plan, usage: result, error };
  }

  return { consume, resolvePlan };
}
```

- [ ] **Step 7: Export subscription APIs**

Add to `packages/api/src/index.ts`:

```ts
export * from './subscriptions/config';
export * from './subscriptions/quota';
export * from './subscriptions/types';
export * from './subscriptions/windows';
```

- [ ] **Step 8: Run tests**

Run: `cd packages/api && npx jest src/subscriptions/quota.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add packages/api/src/subscriptions packages/api/src/index.ts
git commit -m "feat: add subscription quota service"
```

### Task 4: ZPay Payment Service

**Files:**
- Create: `packages/api/src/subscriptions/payment/easypay.ts`
- Create: `packages/api/src/subscriptions/payment/service.ts`
- Create: `packages/api/src/subscriptions/payment/easypay.spec.ts`
- Modify: `packages/api/src/index.ts`
- Extend: `packages/data-schemas/src/methods/subscription.ts`

- [ ] **Step 1: Write EasyPay signing tests**

Create `packages/api/src/subscriptions/payment/easypay.spec.ts`:

```ts
import { signEasyPay, verifyEasyPayNotify } from './easypay';

describe('EasyPay ZPay helpers', () => {
  test('signs parameters with sorted keys and pkey suffix', () => {
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

    expect(notify.outTradeNo).toBe('lc_1');
    expect(notify.tradeNo).toBe('zpay-trade-1');
    expect(notify.amount).toBe(29);
    expect(notify.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd packages/api && npx jest src/subscriptions/payment/easypay.spec.ts --runInBand`

Expected: FAIL with module not found for `./easypay`.

- [ ] **Step 3: Implement EasyPay helpers**

Create `packages/api/src/subscriptions/payment/easypay.ts`:

```ts
import crypto from 'crypto';

export type EasyPayNotify = {
  outTradeNo: string;
  tradeNo: string;
  amount: number;
  success: boolean;
  rawBody: string;
};

export function signEasyPay(params: Record<string, string>, pkey: string): string {
  const base = Object.keys(params)
    .filter((key) => key !== 'sign' && key !== 'sign_type' && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('md5').update(`${base}${pkey}`).digest('hex');
}

export function verifyEasyPayNotify(rawBody: string, pkey: string): EasyPayNotify {
  const values = new URLSearchParams(rawBody);
  const params = Object.fromEntries(values.entries());
  const sign = params.sign;
  if (!sign) {
    throw new Error('Missing EasyPay signature');
  }
  const expected = signEasyPay(params, pkey);
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sign))) {
    throw new Error('Invalid EasyPay signature');
  }
  return {
    outTradeNo: params.out_trade_no,
    tradeNo: params.trade_no,
    amount: Number(params.money),
    success: params.trade_status === 'TRADE_SUCCESS',
    rawBody,
  };
}
```

- [ ] **Step 4: Extend data methods for orders and subscriptions**

Add methods in `packages/data-schemas/src/methods/subscription.ts`:

```ts
createSubscriptionPaymentOrder(input)
findSubscriptionPaymentOrderByTradeNo(outTradeNo)
markSubscriptionOrderPaid(outTradeNo, tradeNo, rawNotify)
markSubscriptionOrderFulfilling(outTradeNo)
markSubscriptionOrderCompleted(outTradeNo)
markSubscriptionOrderFailed(outTradeNo, reason)
createOrExtendUserSubscription(input)
```

Use `findOneAndUpdate` filters that include the current status so duplicate webhooks do not extend a subscription twice.

- [ ] **Step 5: Implement payment service**

Create `packages/api/src/subscriptions/payment/service.ts` with:

```ts
import crypto from 'crypto';
import { signEasyPay, verifyEasyPayNotify } from './easypay';

type Db = {
  getEnabledSubscriptionPlans: () => Promise<
    Array<{
      key: string;
      name: string;
      price: number;
      durationDays: number;
      textDailyLimit: number;
      imageDailyLimit: number;
      enabled: boolean;
      sortOrder: number;
    }>
  >;
  createSubscriptionPaymentOrder: (input: Record<string, unknown>) => Promise<{ _id: unknown }>;
  findSubscriptionPaymentOrderByTradeNo: (outTradeNo: string) => Promise<{
    outTradeNo: string;
    planKey: string;
    amount: number;
    status: string;
    user: string;
  } | null>;
  markSubscriptionOrderPaid: (
    outTradeNo: string,
    tradeNo: string,
    rawNotify: string,
  ) => Promise<unknown>;
  markSubscriptionOrderFulfilling: (outTradeNo: string) => Promise<boolean>;
  markSubscriptionOrderCompleted: (outTradeNo: string) => Promise<unknown>;
  markSubscriptionOrderFailed: (outTradeNo: string, reason: string) => Promise<unknown>;
  createOrExtendUserSubscription: (input: Record<string, unknown>) => Promise<unknown>;
};

type CreateOrderInput = {
  user: { id: string; tenantId?: string };
  body: { planKey: string; paymentType: 'alipay' | 'wxpay'; isMobile?: boolean };
  ip?: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

export function createSubscriptionPaymentService(db: Db) {
  async function createOrder(input: CreateOrderInput) {
    const plans = await db.getEnabledSubscriptionPlans();
    const plan = plans.find((item) => item.key === input.body.planKey);
    if (!plan) {
      throw new Error('Subscription plan is not available');
    }

    const apiBase = getRequiredEnv('ZPAY_API_BASE').replace(/\/+$/, '');
    const pid = getRequiredEnv('ZPAY_PID');
    const pkey = getRequiredEnv('ZPAY_PKEY');
    const notifyUrl = getRequiredEnv('ZPAY_NOTIFY_URL');
    const returnUrl = getRequiredEnv('ZPAY_RETURN_URL');
    const outTradeNo = `lc_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const amount = formatAmount(plan.price);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const params: Record<string, string> = {
      pid,
      type: input.body.paymentType,
      out_trade_no: outTradeNo,
      notify_url: notifyUrl,
      return_url: returnUrl,
      name: plan.name,
      money: amount,
      clientip: input.ip ?? '',
    };
    if (input.body.isMobile) {
      params.device = 'mobile';
    }
    const sign = signEasyPay(params, pkey);
    const response = await fetch(`${apiBase}/mapi.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, sign, sign_type: 'MD5' }),
    });
    const payload = (await response.json()) as {
      code: number;
      msg?: string;
      trade_no?: string;
      payurl?: string;
      payurl2?: string;
      qrcode?: string;
    };
    if (payload.code !== 1) {
      throw new Error(payload.msg || 'ZPay order creation failed');
    }

    const order = await db.createSubscriptionPaymentOrder({
      user: input.user.id,
      tenantId: input.user.tenantId,
      outTradeNo,
      tradeNo: payload.trade_no,
      planKey: plan.key,
      amount: plan.price,
      paymentType: input.body.paymentType,
      status: 'pending',
      payUrl: input.body.isMobile && payload.payurl2 ? payload.payurl2 : payload.payurl,
      qrCode: payload.qrcode,
      expiresAt,
    });

    return {
      orderId: String(order._id),
      outTradeNo,
      status: 'pending',
      payUrl: input.body.isMobile && payload.payurl2 ? payload.payurl2 : payload.payurl,
      qrCode: payload.qrcode,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async function handleZPayNotify(rawBody: string) {
    const pkey = getRequiredEnv('ZPAY_PKEY');
    const notify = verifyEasyPayNotify(rawBody, pkey);
    const order = await db.findSubscriptionPaymentOrderByTradeNo(notify.outTradeNo);
    if (!order) {
      throw new Error('Subscription payment order was not found');
    }
    if (Math.abs(order.amount - notify.amount) > 0.001) {
      throw new Error('Subscription payment amount mismatch');
    }
    if (!notify.success) {
      return;
    }
    if (order.status === 'completed') {
      return;
    }
    await db.markSubscriptionOrderPaid(notify.outTradeNo, notify.tradeNo, notify.rawBody);
    const locked = await db.markSubscriptionOrderFulfilling(notify.outTradeNo);
    if (!locked) {
      return;
    }
    try {
      await db.createOrExtendUserSubscription({
        user: order.user,
        planKey: order.planKey,
        sourceOrderId: notify.outTradeNo,
      });
      await db.markSubscriptionOrderCompleted(notify.outTradeNo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.markSubscriptionOrderFailed(notify.outTradeNo, message);
      throw error;
    }
  }

  return { createOrder, handleZPayNotify };
}
```

- [ ] **Step 6: Export payment helpers**

Add to `packages/api/src/index.ts`:

```ts
export * from './subscriptions/payment/easypay';
export * from './subscriptions/payment/service';
```

- [ ] **Step 7: Run tests**

Run: `cd packages/api && npx jest src/subscriptions/payment/easypay.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/api/src/subscriptions/payment packages/api/src/index.ts packages/data-schemas/src/methods/subscription.ts
git commit -m "feat: add zpay subscription payment service"
```

### Task 5: Backend Routes

**Files:**
- Create: `packages/api/src/subscriptions/routes.ts`
- Create: `api/server/routes/subscriptions.js`
- Modify: `api/server/routes/index.js`
- Modify: `api/server/index.js`

- [ ] **Step 1: Add route factory**

Create `packages/api/src/subscriptions/routes.ts`:

```ts
import express from 'express';
import { getSubscriptionConfig } from './config';

export function createSubscriptionRouter(deps: {
  db: any;
  requireJwtAuth: express.RequestHandler;
  createQuotaService: Function;
  createPaymentService: Function;
}) {
  const router = express.Router();

  router.get('/plans', deps.requireJwtAuth, async (_req, res, next) => {
    try {
      const plans = await deps.db.getEnabledSubscriptionPlans();
      res.json(plans);
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', deps.requireJwtAuth, async (req, res, next) => {
    try {
      const config = getSubscriptionConfig();
      const quota = deps.createQuotaService(deps.db);
      const plan = await quota.resolvePlan(req.user.id, new Date());
      res.json({ plan, subscription: null, usage: { windowKey: '', resetAt: '', text: { used: 0, limit: plan.textDailyLimit }, image: { used: 0, limit: plan.imageDailyLimit } } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/orders', deps.requireJwtAuth, async (req, res, next) => {
    try {
      const payment = deps.createPaymentService(deps.db);
      const order = await payment.createOrder({ user: req.user, body: req.body, ip: req.ip });
      res.status(201).json(order);
    } catch (error) {
      next(error);
    }
  });

  router.get('/orders/:orderId', deps.requireJwtAuth, async (req, res, next) => {
    try {
      const order = await deps.db.getSubscriptionPaymentOrder(req.params.orderId, req.user.id);
      res.json(order);
    } catch (error) {
      next(error);
    }
  });

  router.post('/payment/webhook/zpay', express.urlencoded({ extended: false }), async (req, res) => {
    const payment = deps.createPaymentService(deps.db);
    await payment.handleZPayNotify(new URLSearchParams(req.body).toString());
    res.status(200).send('success');
  });

  return router;
}
```

- [ ] **Step 2: Export route factory**

Add to `packages/api/src/index.ts`:

```ts
export * from './subscriptions/routes';
```

- [ ] **Step 3: Add CommonJS wrapper**

Create `api/server/routes/subscriptions.js`:

```js
const {
  createQuotaService,
  createSubscriptionRouter,
  createSubscriptionPaymentService,
} = require('@librechat/api');
const db = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');

module.exports = createSubscriptionRouter({
  db,
  requireJwtAuth,
  createQuotaService: () =>
    createQuotaService({
      getPlans: db.getEnabledSubscriptionPlans,
      findActiveUserSubscription: db.findActiveUserSubscription,
      consumeSubscriptionQuota: db.consumeSubscriptionQuota,
    }),
  createPaymentService: () => createSubscriptionPaymentService(db),
});
```

- [ ] **Step 4: Register route export**

In `api/server/routes/index.js`, add:

```js
subscriptions: require('./subscriptions'),
```

- [ ] **Step 5: Mount route**

In `api/server/index.js`, mount before `apiNotFound`:

```js
app.use('/api/subscriptions', routes.subscriptions);
```

- [ ] **Step 6: Run route tests or smoke import**

Run: `cd api && npx jest server/index.spec.js --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/api/src/subscriptions/routes.ts packages/api/src/index.ts api/server/routes/subscriptions.js api/server/routes/index.js api/server/index.js
git commit -m "feat: expose subscription routes"
```

### Task 6: Text Quota Enforcement

**Files:**
- Create: `packages/api/src/subscriptions/middleware.ts`
- Modify: `api/server/routes/agents/chat.js`
- Modify: `api/server/routes/assistants/chatV1.js`
- Modify: `api/server/routes/assistants/chatV2.js`

- [ ] **Step 1: Add middleware factory**

Create `packages/api/src/subscriptions/middleware.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import type { RequestHandler } from 'express';
import { getSubscriptionConfig } from './config';
import { createQuotaService } from './quota';

export function createTextQuotaMiddleware(db: any): RequestHandler {
  return async (req, _res, next) => {
    try {
      const config = getSubscriptionConfig();
      if (!config.enabled || !req.user?.id) {
        return next();
      }
      const service = createQuotaService({
        getPlans: db.getEnabledSubscriptionPlans,
        findActiveUserSubscription: db.findActiveUserSubscription,
        consumeSubscriptionQuota: db.consumeSubscriptionQuota,
      });
      const result = await service.consume({
        userId: req.user.id,
        tenantId: req.user.tenantId,
        kind: 'text',
        amount: 1,
        requestId: req.body?.messageId || req.body?.conversationId || uuidv4(),
        timezone: config.timezone,
      });
      if (!result.allowed) {
        throw new Error(JSON.stringify(result.error));
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
```

- [ ] **Step 2: Export middleware**

Add to `packages/api/src/index.ts`:

```ts
export * from './subscriptions/middleware';
```

- [ ] **Step 3: Guard agent chat**

In `api/server/routes/agents/chat.js`, import:

```js
const { createTextQuotaMiddleware } = require('@librechat/api');
const db = require('~/models');
```

Add after `router.use(buildEndpointOption);`:

```js
router.use(createTextQuotaMiddleware(db));
```

- [ ] **Step 4: Guard assistant chat routes**

In `api/server/routes/assistants/chatV1.js` and `api/server/routes/assistants/chatV2.js`, import the middleware and add it before the chat controller route.

- [ ] **Step 5: Run backend route tests**

Run: `cd api && npx jest server/routes/agents/__tests__/abort.spec.js --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/api/src/subscriptions/middleware.ts packages/api/src/index.ts api/server/routes/agents/chat.js api/server/routes/assistants/chatV1.js api/server/routes/assistants/chatV2.js
git commit -m "feat: enforce text subscription quota"
```

### Task 7: Image Quota Enforcement

**Files:**
- Modify: `packages/api/src/subscriptions/middleware.ts`
- Modify: `api/app/clients/tools/util/handleTools.js`
- Modify: `api/server/services/ToolService.js`

- [ ] **Step 1: Add image guard factory**

Append to `packages/api/src/subscriptions/middleware.ts`:

```ts
export function createImageQuotaGuard(db: any, req: any) {
  return async ({ toolName, amount }: { toolName: string; amount: number }) => {
    const config = getSubscriptionConfig();
    if (!config.enabled || !req.user?.id) {
      return;
    }
    const service = createQuotaService({
      getPlans: db.getEnabledSubscriptionPlans,
      findActiveUserSubscription: db.findActiveUserSubscription,
      consumeSubscriptionQuota: db.consumeSubscriptionQuota,
    });
    const result = await service.consume({
      userId: req.user.id,
      tenantId: req.user.tenantId,
      kind: 'image',
      amount,
      requestId: `${toolName}:${req.body?.messageId ?? uuidv4()}`,
      timezone: config.timezone,
    });
    if (!result.allowed) {
      throw new Error(JSON.stringify(result.error));
    }
  };
}
```

- [ ] **Step 2: Wrap image tools centrally**

In `api/app/clients/tools/util/handleTools.js`, import `imageGenTools` from `librechat-data-provider`. Add this helper above `loadTools`:

```js
function wrapImageQuotaTools(loadedTools, imageQuotaGuard) {
  if (!imageQuotaGuard) {
    return loadedTools;
  }
  return loadedTools.map((loadedTool) => {
    if (!loadedTool?.name || !imageGenTools.has(loadedTool.name)) {
      return loadedTool;
    }
    const originalInvoke = loadedTool.invoke.bind(loadedTool);
    loadedTool.invoke = async (input, config) => {
      const parsed = typeof input === 'object' && input != null ? input : {};
      const amount = Math.max(1, Math.min(Number(parsed.n ?? 1), 10));
      await imageQuotaGuard({ toolName: loadedTool.name, amount });
      return originalInvoke(input, config);
    };
    return loadedTool;
  });
}
```

Before `return { loadedTools, toolContextMap };`, add:

```js
wrapImageQuotaTools(loadedTools, options.imageQuotaGuard);
```

- [ ] **Step 3: Pass guard from ToolService**

In `api/server/services/ToolService.js`, import:

```js
const { createImageQuotaGuard } = require('@librechat/api');
const db = require('~/models');
```

In each `loadTools` call that passes `req`, add:

```js
imageQuotaGuard: createImageQuotaGuard(db, req),
```

- [ ] **Step 4: Run tool tests**

Run: `cd api && npx jest app/clients/tools/structured/specs/imageTools-agent.spec.js --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/api/src/subscriptions/middleware.ts api/app/clients/tools/util/handleTools.js api/server/services/ToolService.js
git commit -m "feat: enforce image subscription quota"
```

### Task 8: Frontend Subscription UI

**Files:**
- Create: `client/src/data-provider/Subscriptions/queries.ts`
- Create: `client/src/data-provider/Subscriptions/mutations.ts`
- Create: `client/src/data-provider/Subscriptions/index.ts`
- Modify: `client/src/data-provider/index.ts`
- Create: `client/src/components/Nav/SettingsTabs/Subscription/*.tsx`
- Modify: `client/src/components/Nav/SettingsTabs/index.ts`
- Modify: `client/src/components/Nav/Settings.tsx`
- Modify: `client/src/locales/en/translation.json`

- [ ] **Step 1: Add query hooks**

Create `client/src/data-provider/Subscriptions/queries.ts`:

```ts
import { useRecoilValue } from 'recoil';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import store from '~/store';

export const useGetSubscriptionPlans = (
  config?: UseQueryOptions<t.TSubscriptionPlan[]>,
): QueryObserverResult<t.TSubscriptionPlan[]> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.TSubscriptionPlan[]>(
    [QueryKeys.subscriptionPlans],
    () => dataService.getSubscriptionPlans(),
    { ...config, enabled: (config?.enabled ?? true) === true && queriesEnabled },
  );
};

export const useGetSubscriptionStatus = (
  config?: UseQueryOptions<t.TSubscriptionStatus>,
): QueryObserverResult<t.TSubscriptionStatus> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.TSubscriptionStatus>(
    [QueryKeys.subscriptionStatus],
    () => dataService.getSubscriptionStatus(),
    { refetchOnWindowFocus: true, ...config, enabled: (config?.enabled ?? true) === true && queriesEnabled },
  );
};
```

- [ ] **Step 2: Add mutation hook**

Create `client/src/data-provider/Subscriptions/mutations.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type t from 'librechat-data-provider';

export function useCreateSubscriptionOrder() {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TCreateSubscriptionOrderRequest) => dataService.createSubscriptionOrder(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.subscriptionStatus]);
      },
    },
  );
}
```

- [ ] **Step 3: Export hooks**

Create `client/src/data-provider/Subscriptions/index.ts`:

```ts
export * from './queries';
export * from './mutations';
```

Add to `client/src/data-provider/index.ts`:

```ts
export * from './Subscriptions';
```

- [ ] **Step 4: Add usage meter component**

Create `client/src/components/Nav/SettingsTabs/Subscription/UsageMeter.tsx`:

```tsx
import React from 'react';

type Props = {
  label: string;
  used: number;
  limit: number;
};

export default function UsageMeter({ label, used, limit }: Props) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span>
          {used} / {limit}
        </span>
      </div>
      <div className="h-2 w-full rounded bg-surface-tertiary">
        <div className="h-2 rounded bg-blue-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add subscription tab**

Create `client/src/components/Nav/SettingsTabs/Subscription/Subscription.tsx`:

```tsx
import React from 'react';
import { useGetSubscriptionPlans, useGetSubscriptionStatus } from '~/data-provider';
import { useLocalize } from '~/hooks';
import UsageMeter from './UsageMeter';

function Subscription() {
  const localize = useLocalize();
  const statusQuery = useGetSubscriptionStatus();
  const plansQuery = useGetSubscriptionPlans();
  const status = statusQuery.data;

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
      {status && (
        <>
          <div>
            <div className="text-base font-medium">{status.plan.name}</div>
            <div className="text-text-secondary">{localize('com_nav_subscription_current')}</div>
          </div>
          <UsageMeter
            label={localize('com_nav_subscription_text_quota')}
            used={status.usage.text.used}
            limit={status.usage.text.limit}
          />
          <UsageMeter
            label={localize('com_nav_subscription_image_quota')}
            used={status.usage.image.used}
            limit={status.usage.image.limit}
          />
        </>
      )}
      <div className="grid gap-3">
        {(plansQuery.data ?? []).map((plan) => (
          <div key={plan.key} className="rounded border border-border-light p-3">
            <div className="font-medium">{plan.name}</div>
            <div className="text-text-secondary">
              {plan.textDailyLimit} / {plan.imageDailyLimit}
            </div>
            <div className="mt-2 text-sm">CNY {plan.price}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default React.memo(Subscription);
```

- [ ] **Step 6: Register settings tab**

Export the component from `client/src/components/Nav/SettingsTabs/index.ts` and add a `SUBSCRIPTION` value in `client/src/components/Nav/Settings.tsx`. Add the tab when authenticated.

- [ ] **Step 7: Add English localization keys**

Add to `client/src/locales/en/translation.json`:

```json
"com_nav_setting_subscription": "Subscription",
"com_nav_subscription_current": "Current plan",
"com_nav_subscription_text_quota": "Text messages today",
"com_nav_subscription_image_quota": "Images today"
```

- [ ] **Step 8: Run frontend type check/build**

Run: `npm run frontend`

Expected: command exits with code 0.

- [ ] **Step 9: Commit**

Run:

```bash
git add client/src/data-provider client/src/components/Nav/SettingsTabs client/src/components/Nav/Settings.tsx client/src/locales/en/translation.json
git commit -m "feat: add subscription settings ui"
```

### Task 9: Error Rendering And Final Verification

**Files:**
- Modify: `client/src/components/Messages/Content/Error.tsx`
- Verify: all modified packages

- [ ] **Step 1: Add subscription quota error type**

In `client/src/components/Messages/Content/Error.tsx`, add:

```ts
type TSubscriptionQuota = {
  type: 'subscription_quota';
  kind: 'text' | 'image';
  used: number;
  limit: number;
  planKey: string;
  resetAt: string;
};
```

- [ ] **Step 2: Add renderer**

Add to `errorMessages`:

```tsx
subscription_quota: (json: TSubscriptionQuota) => {
  const label = json.kind === 'image' ? 'image' : 'text';
  return `Daily ${label} quota reached for plan ${json.planKey}. Used ${json.used}/${json.limit}. Resets at ${json.resetAt}.`;
},
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
cd packages/data-schemas && npx jest src/methods/subscription.spec.ts --runInBand
cd ../api && npx jest src/subscriptions/quota.spec.ts src/subscriptions/payment/easypay.spec.ts --runInBand
```

Expected: both commands exit with code 0.

- [ ] **Step 4: Run builds**

Run:

```bash
npm run build:data-provider
npm run frontend
```

Expected: both commands exit with code 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add client/src/components/Messages/Content/Error.tsx
git commit -m "feat: render subscription quota errors"
```

- [ ] **Step 6: Manual smoke test**

Start backend and frontend:

```bash
npm run backend:dev
npm run frontend:dev
```

Expected:

- Free user can open settings and see the Subscription tab.
- Free user can send text messages until the configured text quota is exhausted.
- Over-limit text request shows `subscription_quota`.
- Image generation consumes image quota.
- Image upload and OCR do not consume image quota.
- ZPay webhook with a valid signature completes one subscription.
- Replaying the same webhook does not extend the subscription a second time.
