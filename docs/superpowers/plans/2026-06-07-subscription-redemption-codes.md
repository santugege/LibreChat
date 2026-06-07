# Subscription Redemption Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build administrator-generated redemption codes that grant time-limited subscription quotas for Taobao promotion.

**Architecture:** Add redemption batches and codes as new subscription collections. Reuse the existing subscription plan snapshot and quota system by redeeming codes into `UserSubscription` records. Expose user redeem and admin management endpoints through the existing subscription route factory, then add shared data-provider contracts and React UI.

**Tech Stack:** TypeScript, Express, Mongoose, React, React Query, Jest, LibreChat subscription modules.

---

## File Structure

- Create `packages/data-schemas/src/schema/subscription/redemptionBatch.ts`
  Defines batch-level generation metadata and indexes.
- Create `packages/data-schemas/src/schema/subscription/redemptionCode.ts`
  Defines per-code status, hashed code lookup, redemption audit, and indexes.
- Modify `packages/data-schemas/src/schema/subscription/index.ts`
  Exports redemption schemas.
- Modify `packages/data-schemas/src/models/subscription.ts`
  Registers `SubscriptionRedemptionBatch` and `SubscriptionRedemptionCode`.
- Modify `packages/data-schemas/src/types/subscription.ts`
  Adds redemption interfaces and status types.
- Modify `packages/data-schemas/src/methods/subscription.ts`
  Adds batch creation, listing, code lookup, atomic redeem, disabling, and source-based subscription extension support.
- Modify `packages/data-schemas/src/methods/subscription.spec.ts`
  Covers schema/method behavior.
- Create `packages/api/src/subscriptions/redemption.ts`
  Owns code generation, normalization, hashing, validation, and redeem orchestration.
- Create `packages/api/src/subscriptions/redemption.spec.ts`
  Covers service behavior without Express.
- Modify `packages/api/src/subscriptions/routes.ts`
  Adds user and admin redemption routes.
- Modify `packages/api/src/subscriptions/routes.spec.ts`
  Covers route contracts and auth.
- Create `api/server/middleware/limiters/redemptionLimiter.js`
  Adds user/IP rate limiting for redeem attempts.
- Modify `api/server/middleware/limiters/index.js`
  Exports the limiter.
- Modify `api/server/routes/subscriptions.js`
  Injects the limiter into the subscription router.
- Modify `packages/data-provider/src/api-endpoints.ts`
  Adds redemption endpoint builders.
- Modify `packages/data-provider/src/data-service.ts`
  Adds data service functions.
- Modify `packages/data-provider/src/types.ts`
  Adds shared request/response types.
- Modify `packages/data-provider/src/keys.ts`
  Adds query keys.
- Modify `packages/data-provider/specs/subscription-api-contract.spec.ts`
  Covers shared contracts.
- Modify `client/src/data-provider/Subscriptions/queries.ts`
  Adds admin redemption queries.
- Modify `client/src/data-provider/Subscriptions/mutations.ts`
  Adds redeem/generate/disable mutations and invalidations.
- Modify `client/src/data-provider/Subscriptions/*.spec.ts`
  Covers hooks.
- Create `client/src/components/Nav/SettingsTabs/Subscription/RedemptionCodeForm.tsx`
  User redeem UI.
- Modify `client/src/components/Nav/SettingsTabs/Subscription/Subscription.tsx`
  Renders user redeem UI.
- Create `client/src/components/Admin/RedemptionCodesPage.tsx`
  Admin batch generation/list UI.
- Modify `client/src/components/Admin/AdminShell.tsx`
  Adds Redemptions navigation.
- Modify `client/src/components/Admin/index.ts`
  Exports new page if needed.
- Modify `client/src/components/Admin/AdminShell.spec.tsx`
  Covers redemptions nav/page.
- Modify `client/src/locales/en/translation.json`
  Adds UI strings.

---

### Task 1: Add Redemption Data Types And Schemas

**Files:**
- Modify: `packages/data-schemas/src/types/subscription.ts`
- Create: `packages/data-schemas/src/schema/subscription/redemptionBatch.ts`
- Create: `packages/data-schemas/src/schema/subscription/redemptionCode.ts`
- Modify: `packages/data-schemas/src/schema/subscription/index.ts`
- Modify: `packages/data-schemas/src/models/subscription.ts`
- Test: `packages/data-schemas/src/methods/subscription.spec.ts`

- [ ] **Step 1: Add failing model registration test**

Add this test near the subscription model setup tests in `packages/data-schemas/src/methods/subscription.spec.ts`. If the file does not have a model registration describe block, add this describe block near the top after setup helpers.

```ts
test('registers subscription redemption models', () => {
  expect(mongoose.models.SubscriptionRedemptionBatch).toBeDefined();
  expect(mongoose.models.SubscriptionRedemptionCode).toBeDefined();
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:packages:data-schemas -- subscription.spec.ts --runInBand
```

Expected: FAIL because `SubscriptionRedemptionBatch` and `SubscriptionRedemptionCode` are not registered.

- [ ] **Step 3: Add TypeScript interfaces**

In `packages/data-schemas/src/types/subscription.ts`, add these exports after `SubscriptionPaymentType`.

```ts
export type SubscriptionRedemptionCodeStatus = 'active' | 'redeemed' | 'disabled' | 'expired';

export interface ISubscriptionRedemptionBatch extends Document {
  name: string;
  quantity: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey: string;
  planName: string;
  planDescription?: string;
  planAmount?: number;
  expiresAt?: Date;
  note?: string;
  campaign?: string;
  createdBy: Types.ObjectId;
  tenantId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISubscriptionRedemptionCode extends Document {
  batch: Types.ObjectId;
  codeHash: string;
  codePrefix: string;
  status: SubscriptionRedemptionCodeStatus;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey: string;
  planName: string;
  planDescription?: string;
  planAmount?: number;
  expiresAt?: Date;
  redeemedBy?: Types.ObjectId;
  redeemedAt?: Date;
  sourceSubscriptionId?: Types.ObjectId;
  disableReason?: string;
  note?: string;
  tenantId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
```

- [ ] **Step 4: Create batch schema**

Create `packages/data-schemas/src/schema/subscription/redemptionBatch.ts`.

```ts
import { Schema } from 'mongoose';
import type { ISubscriptionRedemptionBatch } from '~/types';

const redemptionBatchSchema = new Schema<ISubscriptionRedemptionBatch>(
  {
    name: { type: String, required: true, trim: true },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'quantity must be an integer' },
    },
    durationDays: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'durationDays must be an integer' },
    },
    textDailyLimit: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'textDailyLimit must be an integer' },
    },
    imageDailyLimit: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'imageDailyLimit must be an integer' },
    },
    planKey: { type: String, required: true, trim: true },
    planName: { type: String, required: true, trim: true },
    planDescription: { type: String, default: undefined },
    planAmount: { type: Number, min: 0, default: 0 },
    expiresAt: { type: Date, default: undefined, index: true },
    note: { type: String, default: undefined },
    campaign: { type: String, default: undefined, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tenantId: { type: String, index: true, default: null },
  },
  { timestamps: true },
);

redemptionBatchSchema.index({ tenantId: 1, createdAt: -1 });
redemptionBatchSchema.index({ tenantId: 1, campaign: 1, createdAt: -1 });

export default redemptionBatchSchema;
```

- [ ] **Step 5: Create code schema**

Create `packages/data-schemas/src/schema/subscription/redemptionCode.ts`.

```ts
import { Schema } from 'mongoose';
import type { ISubscriptionRedemptionCode } from '~/types';

const redemptionCodeSchema = new Schema<ISubscriptionRedemptionCode>(
  {
    batch: { type: Schema.Types.ObjectId, ref: 'SubscriptionRedemptionBatch', required: true, index: true },
    codeHash: { type: String, required: true },
    codePrefix: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['active', 'redeemed', 'disabled', 'expired'],
      default: 'active',
      index: true,
    },
    durationDays: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'durationDays must be an integer' },
    },
    textDailyLimit: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'textDailyLimit must be an integer' },
    },
    imageDailyLimit: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'imageDailyLimit must be an integer' },
    },
    planKey: { type: String, required: true, trim: true },
    planName: { type: String, required: true, trim: true },
    planDescription: { type: String, default: undefined },
    planAmount: { type: Number, min: 0, default: 0 },
    expiresAt: { type: Date, default: undefined, index: true },
    redeemedBy: { type: Schema.Types.ObjectId, ref: 'User', default: undefined, index: true },
    redeemedAt: { type: Date, default: undefined, index: true },
    sourceSubscriptionId: { type: Schema.Types.ObjectId, ref: 'UserSubscription', default: undefined },
    disableReason: { type: String, default: undefined },
    note: { type: String, default: undefined },
    tenantId: { type: String, index: true, default: null },
  },
  { timestamps: true },
);

redemptionCodeSchema.index({ codeHash: 1, tenantId: 1 }, { unique: true });
redemptionCodeSchema.index({ batch: 1, createdAt: 1 });
redemptionCodeSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
redemptionCodeSchema.index({ redeemedBy: 1, redeemedAt: -1 });

export default redemptionCodeSchema;
```

- [ ] **Step 6: Export schemas**

In `packages/data-schemas/src/schema/subscription/index.ts`, add:

```ts
export { default as redemptionBatchSchema } from './redemptionBatch';
export { default as redemptionCodeSchema } from './redemptionCode';
```

- [ ] **Step 7: Register models**

In `packages/data-schemas/src/models/subscription.ts`, import the new schemas and interfaces, apply tenant isolation, and return models.

```ts
import {
  planSchema,
  usageEventSchema,
  usageBucketSchema,
  paymentOrderSchema,
  userSubscriptionSchema,
  quotaExemptionSchema,
  redemptionBatchSchema,
  redemptionCodeSchema,
} from '~/schema/subscription';
import type {
  ISubscriptionPlan,
  IUserSubscription,
  ISubscriptionUsageEvent,
  ISubscriptionUsageBucket,
  ISubscriptionPaymentOrder,
  ISubscriptionQuotaExemption,
  ISubscriptionRedemptionBatch,
  ISubscriptionRedemptionCode,
} from '~/types';
```

Inside `createSubscriptionModels`, add:

```ts
  applyTenantIsolation(redemptionBatchSchema);
  applyTenantIsolation(redemptionCodeSchema);
```

Inside the returned object, add:

```ts
    SubscriptionRedemptionBatch:
      mongoose.models.SubscriptionRedemptionBatch ||
      mongoose.model<ISubscriptionRedemptionBatch>(
        'SubscriptionRedemptionBatch',
        redemptionBatchSchema,
      ),
    SubscriptionRedemptionCode:
      mongoose.models.SubscriptionRedemptionCode ||
      mongoose.model<ISubscriptionRedemptionCode>(
        'SubscriptionRedemptionCode',
        redemptionCodeSchema,
      ),
```

- [ ] **Step 8: Run test**

Run:

```bash
npm run test:packages:data-schemas -- subscription.spec.ts --runInBand
```

Expected: PASS for the new registration test.

- [ ] **Step 9: Commit**

```bash
git add packages/data-schemas/src/types/subscription.ts packages/data-schemas/src/schema/subscription/redemptionBatch.ts packages/data-schemas/src/schema/subscription/redemptionCode.ts packages/data-schemas/src/schema/subscription/index.ts packages/data-schemas/src/models/subscription.ts packages/data-schemas/src/methods/subscription.spec.ts
git commit -m "feat: add subscription redemption schemas"
```

---

### Task 2: Add Redemption Database Methods

**Files:**
- Modify: `packages/data-schemas/src/methods/subscription.ts`
- Modify: `packages/data-schemas/src/methods/subscription.spec.ts`

- [ ] **Step 1: Add failing method tests**

Add tests for create/list/redeem near existing subscription method tests.

```ts
test('creates a redemption batch and atomically redeems one code', async () => {
  const adminId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const sourceId = new mongoose.Types.ObjectId();
  const expiresAt = new Date('2026-12-31T00:00:00.000Z');

  const batch = await methods.createSubscriptionRedemptionBatch({
    name: 'Taobao 30 Day',
    quantity: 1,
    durationDays: 30,
    textDailyLimit: 1000,
    imageDailyLimit: 20,
    planKey: 'redeem-30d',
    planName: 'Taobao 30 Day',
    planAmount: 0,
    expiresAt,
    createdBy: adminId,
  });

  expect(batch?.name).toBe('Taobao 30 Day');

  await methods.insertSubscriptionRedemptionCodes([
    {
      batch: batch!._id,
      codeHash: 'hash-1',
      codePrefix: 'LC-TEST',
      durationDays: 30,
      textDailyLimit: 1000,
      imageDailyLimit: 20,
      planKey: 'redeem-30d',
      planName: 'Taobao 30 Day',
      planAmount: 0,
      expiresAt,
    },
  ]);

  const redeemed = await methods.redeemSubscriptionRedemptionCode({
    codeHash: 'hash-1',
    user: userId,
    sourceSubscriptionId: sourceId,
    now: new Date('2026-06-07T00:00:00.000Z'),
  });

  expect(redeemed?.status).toBe('redeemed');
  expect(redeemed?.redeemedBy?.toString()).toBe(userId.toString());

  const second = await methods.redeemSubscriptionRedemptionCode({
    codeHash: 'hash-1',
    user: new mongoose.Types.ObjectId(),
    sourceSubscriptionId: new mongoose.Types.ObjectId(),
    now: new Date('2026-06-07T00:01:00.000Z'),
  });

  expect(second).toBeNull();
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm run test:packages:data-schemas -- subscription.spec.ts --runInBand
```

Expected: FAIL because methods are not implemented.

- [ ] **Step 3: Add method input and output types**

In `packages/data-schemas/src/methods/subscription.ts`, extend imports to include:

```ts
  ISubscriptionRedemptionBatch,
  ISubscriptionRedemptionCode,
  SubscriptionRedemptionCodeStatus,
```

Add these types near the other subscription method input types.

```ts
export type CreateSubscriptionRedemptionBatchInput = {
  name: string;
  quantity: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey: string;
  planName: string;
  planDescription?: string;
  planAmount?: number;
  expiresAt?: Date;
  note?: string;
  campaign?: string;
  createdBy: ObjectIdInput;
  tenantId?: string;
};

export type InsertSubscriptionRedemptionCodeInput = {
  batch: ObjectIdInput;
  codeHash: string;
  codePrefix: string;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey: string;
  planName: string;
  planDescription?: string;
  planAmount?: number;
  expiresAt?: Date;
  note?: string;
  tenantId?: string;
};

export type ListSubscriptionRedemptionBatchesInput = {
  limit: number;
  offset: number;
  tenantId?: string;
};

export type ListSubscriptionRedemptionCodesInput = {
  batch?: ObjectIdInput;
  status?: SubscriptionRedemptionCodeStatus;
  limit: number;
  offset: number;
  tenantId?: string;
};

export type RedeemSubscriptionRedemptionCodeInput = {
  codeHash: string;
  user: ObjectIdInput;
  sourceSubscriptionId: ObjectIdInput;
  now?: Date;
  tenantId?: string;
};

export type DisableSubscriptionRedemptionCodeInput = {
  codeId: ObjectIdInput;
  reason?: string;
  tenantId?: string;
};
```

- [ ] **Step 4: Add validation helpers**

Add helpers before `createSubscriptionMethods`.

```ts
function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid subscription redemption input: ${name} must be a positive integer`);
  }
}

function assertNonnegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid subscription redemption input: ${name} must be a nonnegative integer`);
  }
}

function validateRedemptionSnapshot(input: {
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey: string;
  planName: string;
}): void {
  assertPositiveInteger(input.durationDays, 'durationDays');
  assertNonnegativeInteger(input.textDailyLimit, 'textDailyLimit');
  assertNonnegativeInteger(input.imageDailyLimit, 'imageDailyLimit');

  if (input.planKey.trim().length === 0 || input.planName.trim().length === 0) {
    throw new Error('Invalid subscription redemption input: planKey and planName are required');
  }
}
```

- [ ] **Step 5: Implement methods**

Inside `createSubscriptionMethods`, add:

```ts
  async function createSubscriptionRedemptionBatch(
    input: CreateSubscriptionRedemptionBatchInput,
  ): Promise<ISubscriptionRedemptionBatch | null> {
    validateRedemptionSnapshot(input);
    assertPositiveInteger(input.quantity, 'quantity');

    return await runAsSystem(async () => {
      const Batch = mongoose.models
        .SubscriptionRedemptionBatch as Model<ISubscriptionRedemptionBatch>;
      const batch = await Batch.create({
        ...input,
        createdBy: toObjectId(input.createdBy),
        ...getTenantFilter(input.tenantId),
      });
      return batch.toObject() as ISubscriptionRedemptionBatch;
    });
  }

  async function insertSubscriptionRedemptionCodes(
    inputs: InsertSubscriptionRedemptionCodeInput[],
  ): Promise<ISubscriptionRedemptionCode[]> {
    if (inputs.length === 0) {
      return [];
    }

    inputs.forEach(validateRedemptionSnapshot);

    return await runAsSystem(async () => {
      const Code = mongoose.models.SubscriptionRedemptionCode as Model<ISubscriptionRedemptionCode>;
      const docs = await Code.insertMany(
        inputs.map((input) => ({
          ...input,
          batch: toObjectId(input.batch),
          ...getTenantFilter(input.tenantId),
        })),
        { ordered: true },
      );
      return docs.map((doc) => doc.toObject() as ISubscriptionRedemptionCode);
    });
  }

  async function listSubscriptionRedemptionBatches(
    input: ListSubscriptionRedemptionBatchesInput,
  ): Promise<ISubscriptionRedemptionBatch[]> {
    return await runAsSystem(async () => {
      const Batch = mongoose.models
        .SubscriptionRedemptionBatch as Model<ISubscriptionRedemptionBatch>;
      return (await Batch.find(getTenantFilter(input.tenantId))
        .sort({ createdAt: -1, _id: -1 })
        .skip(input.offset)
        .limit(input.limit)
        .lean()) as ISubscriptionRedemptionBatch[];
    });
  }

  async function countSubscriptionRedemptionBatches(tenantId?: string): Promise<number> {
    return await runAsSystem(async () => {
      const Batch = mongoose.models
        .SubscriptionRedemptionBatch as Model<ISubscriptionRedemptionBatch>;
      return await Batch.countDocuments(getTenantFilter(tenantId));
    });
  }

  async function listSubscriptionRedemptionCodes(
    input: ListSubscriptionRedemptionCodesInput,
  ): Promise<ISubscriptionRedemptionCode[]> {
    return await runAsSystem(async () => {
      const Code = mongoose.models.SubscriptionRedemptionCode as Model<ISubscriptionRedemptionCode>;
      return (await Code.find({
        ...(input.batch ? { batch: toObjectId(input.batch) } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...getTenantFilter(input.tenantId),
      })
        .sort({ createdAt: -1, _id: -1 })
        .skip(input.offset)
        .limit(input.limit)
        .lean()) as ISubscriptionRedemptionCode[];
    });
  }

  async function countSubscriptionRedemptionCodes(
    input: Omit<ListSubscriptionRedemptionCodesInput, 'limit' | 'offset'>,
  ): Promise<number> {
    return await runAsSystem(async () => {
      const Code = mongoose.models.SubscriptionRedemptionCode as Model<ISubscriptionRedemptionCode>;
      return await Code.countDocuments({
        ...(input.batch ? { batch: toObjectId(input.batch) } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...getTenantFilter(input.tenantId),
      });
    });
  }

  async function redeemSubscriptionRedemptionCode(
    input: RedeemSubscriptionRedemptionCodeInput,
  ): Promise<ISubscriptionRedemptionCode | null> {
    return await runAsSystem(async () => {
      const Code = mongoose.models.SubscriptionRedemptionCode as Model<ISubscriptionRedemptionCode>;
      const now = input.now ?? new Date();
      return (await Code.findOneAndUpdate(
        {
          codeHash: input.codeHash,
          status: 'active',
          $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
          ...getTenantFilter(input.tenantId),
        },
        {
          $set: {
            status: 'redeemed',
            redeemedBy: toObjectId(input.user),
            redeemedAt: now,
            sourceSubscriptionId: toObjectId(input.sourceSubscriptionId),
          },
        },
        { new: true, runValidators: true },
      ).lean()) as ISubscriptionRedemptionCode | null;
    });
  }

  async function disableSubscriptionRedemptionCode(
    input: DisableSubscriptionRedemptionCodeInput,
  ): Promise<ISubscriptionRedemptionCode | null> {
    return await runAsSystem(async () => {
      const Code = mongoose.models.SubscriptionRedemptionCode as Model<ISubscriptionRedemptionCode>;
      return (await Code.findOneAndUpdate(
        {
          _id: toObjectId(input.codeId),
          status: 'active',
          ...getTenantFilter(input.tenantId),
        },
        {
          $set: {
            status: 'disabled',
            ...(input.reason ? { disableReason: input.reason } : {}),
          },
        },
        { new: true, runValidators: true },
      ).lean()) as ISubscriptionRedemptionCode | null;
    });
  }
```

Add the functions to the returned object.

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test:packages:data-schemas -- subscription.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/data-schemas/src/methods/subscription.ts packages/data-schemas/src/methods/subscription.spec.ts
git commit -m "feat: add subscription redemption methods"
```

---

### Task 3: Add Redemption Service

**Files:**
- Create: `packages/api/src/subscriptions/redemption.ts`
- Create: `packages/api/src/subscriptions/redemption.spec.ts`

- [ ] **Step 1: Write failing service tests**

Create `packages/api/src/subscriptions/redemption.spec.ts`.

```ts
import { createRedemptionService, normalizeRedemptionCode } from './redemption';

describe('subscription redemption service', () => {
  const now = new Date('2026-06-07T00:00:00.000Z');

  test('normalizes pasted codes', () => {
    expect(normalizeRedemptionCode(' lc-abcd efgh ')).toBe('LC-ABCDEFGH');
  });

  test('generates plaintext once and stores hashed codes', async () => {
    const inserted: Array<{ codeHash: string; codePrefix: string }> = [];
    const service = createRedemptionService({
      secret: 'secret',
      now: () => now,
      db: {
        createSubscriptionRedemptionBatch: async (input) => ({ ...input, _id: 'batch-1' }),
        insertSubscriptionRedemptionCodes: async (codes) => {
          inserted.push(...codes);
          return codes.map((code, index) => ({ ...code, _id: `code-${index + 1}` }));
        },
        redeemSubscriptionRedemptionCode: async () => null,
        createOrExtendUserSubscription: async () => null,
      },
    });

    const result = await service.createBatch({
      adminUser: { id: 'admin-1' },
      body: {
        name: 'Taobao',
        quantity: 2,
        durationDays: 30,
        textDailyLimit: 1000,
        imageDailyLimit: 20,
      },
    });

    expect(result.codes).toHaveLength(2);
    expect(result.codes[0].code).toMatch(/^LC-/);
    expect(inserted[0].codeHash).not.toBe(result.codes[0].code);
    expect(inserted[0].codePrefix).toBe(result.codes[0].prefix);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm run test:packages:api -- redemption.spec.ts --runInBand
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement service**

Create `packages/api/src/subscriptions/redemption.ts`.

```ts
import { createHash, randomBytes } from 'crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_MAX_BATCH_SIZE = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

type ObjectIdLike = string | { toString(): string };

export type RedemptionRouteUser = {
  id: string;
  tenantId?: string;
};

export type CreateRedemptionBatchBody = {
  name: string;
  quantity: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey?: string;
  planName?: string;
  planDescription?: string;
  planAmount?: number;
  expiresAt?: string;
  note?: string;
  campaign?: string;
};

export type RedeemRedemptionCodeBody = {
  code: string;
};

type BatchLike = {
  _id: ObjectIdLike;
  name: string;
  quantity: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey: string;
  planName: string;
  planDescription?: string;
  planAmount?: number;
  expiresAt?: Date;
  note?: string;
  campaign?: string;
  createdBy: ObjectIdLike;
  tenantId?: string | null;
  createdAt?: Date;
};

type CodeLike = {
  _id: ObjectIdLike;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey: string;
  planName: string;
  planDescription?: string;
  planAmount?: number;
  expiresAt?: Date;
};

type SubscriptionLike = {
  planKey: string;
  status: 'active' | 'expired' | 'cancelled';
  startsAt: Date;
  expiresAt: Date;
};

export type RedemptionServiceDb = {
  createSubscriptionRedemptionBatch: (input: {
    name: string;
    quantity: number;
    durationDays: number;
    textDailyLimit: number;
    imageDailyLimit: number;
    planKey: string;
    planName: string;
    planDescription?: string;
    planAmount?: number;
    expiresAt?: Date;
    note?: string;
    campaign?: string;
    createdBy: string;
    tenantId?: string;
  }) => Promise<BatchLike | null>;
  insertSubscriptionRedemptionCodes: (
    inputs: Array<{
      batch: ObjectIdLike;
      codeHash: string;
      codePrefix: string;
      durationDays: number;
      textDailyLimit: number;
      imageDailyLimit: number;
      planKey: string;
      planName: string;
      planDescription?: string;
      planAmount?: number;
      expiresAt?: Date;
      note?: string;
      tenantId?: string;
    }>,
  ) => Promise<CodeLike[]>;
  redeemSubscriptionRedemptionCode: (input: {
    codeHash: string;
    user: string;
    sourceSubscriptionId: ObjectIdLike;
    now: Date;
    tenantId?: string;
  }) => Promise<CodeLike | null>;
  createOrExtendUserSubscription: (input: {
    user: string;
    planKey: string;
    durationDays: number;
    sourceOrderId: ObjectIdLike;
    now: Date;
    tenantId?: string;
    planName?: string;
    planDescription?: string;
    planAmount?: number;
    textDailyLimit?: number;
    imageDailyLimit?: number;
  }) => Promise<SubscriptionLike | null>;
};

export type CreateRedemptionServiceDeps = {
  db: RedemptionServiceDb;
  secret?: string;
  maxBatchSize?: number;
  now?: () => Date;
};

export function normalizeRedemptionCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export function hashRedemptionCode(code: string, secret: string): string {
  return createHash('sha256').update(`${normalizeRedemptionCode(code)}:${secret}`).digest('hex');
}

function generateCode(): string {
  const bytes = randomBytes(16);
  let chars = '';
  for (const byte of bytes) {
    chars += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return `LC-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

function getDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Invalid redemption expiration date');
  }
  return date;
}

function assertInteger(value: number, name: string, min: number): void {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Invalid redemption request: ${name}`);
  }
}

function getPlanKey(body: CreateRedemptionBatchBody): string {
  return (
    body.planKey?.trim() ||
    `redeem-${body.durationDays}d-${body.textDailyLimit}t-${body.imageDailyLimit}i`
  );
}

function getPlanName(body: CreateRedemptionBatchBody): string {
  return body.planName?.trim() || body.name.trim();
}

function serializeSubscription(subscription: SubscriptionLike) {
  return {
    planKey: subscription.planKey,
    status: subscription.status,
    startsAt: subscription.startsAt.toISOString(),
    expiresAt: subscription.expiresAt.toISOString(),
  };
}

export function createRedemptionService(deps: CreateRedemptionServiceDeps) {
  const getNow = deps.now ?? (() => new Date());
  const maxBatchSize = deps.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
  const secret = deps.secret ?? process.env.REDEMPTION_CODE_SECRET ?? process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('REDEMPTION_CODE_SECRET or JWT_SECRET is required');
  }

  async function createBatch(input: { adminUser: RedemptionRouteUser; body: CreateRedemptionBatchBody }) {
    const body = input.body;
    if (body.name.trim().length === 0) {
      throw new Error('Invalid redemption request: name');
    }
    assertInteger(body.quantity, 'quantity', 1);
    assertInteger(body.durationDays, 'durationDays', 1);
    assertInteger(body.textDailyLimit, 'textDailyLimit', 0);
    assertInteger(body.imageDailyLimit, 'imageDailyLimit', 0);
    if (body.quantity > maxBatchSize) {
      throw new Error('Invalid redemption request: quantity exceeds maximum');
    }

    const expiresAt = getDate(body.expiresAt);
    const planKey = getPlanKey(body);
    const planName = getPlanName(body);
    const batch = await deps.db.createSubscriptionRedemptionBatch({
      name: body.name.trim(),
      quantity: body.quantity,
      durationDays: body.durationDays,
      textDailyLimit: body.textDailyLimit,
      imageDailyLimit: body.imageDailyLimit,
      planKey,
      planName,
      ...(body.planDescription ? { planDescription: body.planDescription } : {}),
      ...(body.planAmount !== undefined ? { planAmount: body.planAmount } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      ...(body.note ? { note: body.note } : {}),
      ...(body.campaign ? { campaign: body.campaign } : {}),
      createdBy: input.adminUser.id,
      ...(input.adminUser.tenantId ? { tenantId: input.adminUser.tenantId } : {}),
    });

    if (!batch) {
      throw new Error('Failed to create redemption batch');
    }

    const plaintextCodes = Array.from({ length: body.quantity }, () => generateCode());
    await deps.db.insertSubscriptionRedemptionCodes(
      plaintextCodes.map((code) => ({
        batch: batch._id,
        codeHash: hashRedemptionCode(code, secret),
        codePrefix: code.slice(0, 7),
        durationDays: body.durationDays,
        textDailyLimit: body.textDailyLimit,
        imageDailyLimit: body.imageDailyLimit,
        planKey,
        planName,
        ...(body.planDescription ? { planDescription: body.planDescription } : {}),
        ...(body.planAmount !== undefined ? { planAmount: body.planAmount } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        ...(body.note ? { note: body.note } : {}),
        ...(input.adminUser.tenantId ? { tenantId: input.adminUser.tenantId } : {}),
      })),
    );

    return {
      batch: {
        id: batch._id.toString(),
        name: batch.name,
        quantity: batch.quantity,
        durationDays: batch.durationDays,
        textDailyLimit: batch.textDailyLimit,
        imageDailyLimit: batch.imageDailyLimit,
        planKey: batch.planKey,
        planName: batch.planName,
        ...(batch.expiresAt ? { expiresAt: batch.expiresAt.toISOString() } : {}),
      },
      codes: plaintextCodes.map((code) => ({
        code,
        prefix: code.slice(0, 7),
        ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
      })),
    };
  }

  async function redeem(input: { user: RedemptionRouteUser; body: RedeemRedemptionCodeBody }) {
    const code = normalizeRedemptionCode(input.body.code);
    if (code.length < 8 || code.length > 64) {
      throw new Error('Invalid redemption code');
    }

    const sourceId = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const now = getNow();
    const redeemed = await deps.db.redeemSubscriptionRedemptionCode({
      codeHash: hashRedemptionCode(code, secret),
      user: input.user.id,
      sourceSubscriptionId: sourceId,
      now,
      ...(input.user.tenantId ? { tenantId: input.user.tenantId } : {}),
    });

    if (!redeemed) {
      throw new Error('Invalid redemption code');
    }

    const subscription = await deps.db.createOrExtendUserSubscription({
      user: input.user.id,
      planKey: redeemed.planKey,
      durationDays: redeemed.durationDays,
      sourceOrderId: sourceId,
      now,
      ...(input.user.tenantId ? { tenantId: input.user.tenantId } : {}),
      planName: redeemed.planName,
      ...(redeemed.planDescription ? { planDescription: redeemed.planDescription } : {}),
      ...(redeemed.planAmount !== undefined ? { planAmount: redeemed.planAmount } : {}),
      textDailyLimit: redeemed.textDailyLimit,
      imageDailyLimit: redeemed.imageDailyLimit,
    });

    if (!subscription) {
      throw new Error('Redemption fulfillment failed');
    }

    return {
      subscription: serializeSubscription(subscription),
      plan: {
        key: redeemed.planKey,
        name: redeemed.planName,
        ...(redeemed.planDescription ? { description: redeemed.planDescription } : {}),
        price: redeemed.planAmount ?? 0,
        durationDays: redeemed.durationDays,
        textDailyLimit: redeemed.textDailyLimit,
        imageDailyLimit: redeemed.imageDailyLimit,
        enabled: true,
        sortOrder: 0,
      },
    };
  }

  return { createBatch, redeem };
}
```

Note: after this minimal version passes tests, replace the temporary string `sourceId` with a `mongoose.Types.ObjectId` created in the data-method layer or injected from the route. Add that refinement in Task 4 route integration.

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test:packages:api -- redemption.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/subscriptions/redemption.ts packages/api/src/subscriptions/redemption.spec.ts
git commit -m "feat: add subscription redemption service"
```

---

### Task 4: Add API Routes And Rate Limiter

**Files:**
- Modify: `packages/api/src/subscriptions/routes.ts`
- Modify: `packages/api/src/subscriptions/routes.spec.ts`
- Create: `api/server/middleware/limiters/redemptionLimiter.js`
- Modify: `api/server/middleware/limiters/index.js`
- Modify: `api/server/routes/subscriptions.js`

- [ ] **Step 1: Add failing route tests**

In `packages/api/src/subscriptions/routes.spec.ts`, add tests near other subscription route tests.

```ts
test('redeems a subscription code for the authenticated user', async () => {
  const redeemSubscriptionCode = jest.fn(async () => ({
    subscription: {
      planKey: 'redeem-30d',
      status: 'active',
      startsAt: '2026-06-07T00:00:00.000Z',
      expiresAt: '2026-07-07T00:00:00.000Z',
    },
    plan: {
      key: 'redeem-30d',
      name: 'Taobao 30 Day',
      price: 0,
      durationDays: 30,
      textDailyLimit: 1000,
      imageDailyLimit: 20,
      enabled: true,
      sortOrder: 0,
    },
  }));
  const app = createApp({
    ...baseDeps,
    redeemSubscriptionCode,
  });

  const response = await requestApp(app, '/api/subscriptions/redeem', {
    method: 'post',
    body: { code: 'LC-ABCD-EFGH-JKLM-NPQR' },
  });

  expect(response.status).toBe(200);
  expect(response.body.subscription.planKey).toBe('redeem-30d');
  expect(redeemSubscriptionCode).toHaveBeenCalledWith({
    user: expect.objectContaining({ id: testUserId }),
    body: { code: 'LC-ABCD-EFGH-JKLM-NPQR' },
  });
});

test('admin creates a redemption batch', async () => {
  const createRedemptionBatch = jest.fn(async () => ({
    batch: { id: 'batch-1', name: 'Taobao', quantity: 1 },
    codes: [{ code: 'LC-ABCD-EFGH-JKLM-NPQR', prefix: 'LC-ABCD' }],
  }));
  const app = createApp({
    ...baseDeps,
    createRedemptionBatch,
  });

  const response = await requestApp(app, '/api/subscriptions/admin/redemption-batches', {
    method: 'post',
    body: {
      name: 'Taobao',
      quantity: 1,
      durationDays: 30,
      textDailyLimit: 1000,
      imageDailyLimit: 20,
    },
  });

  expect(response.status).toBe(201);
  expect(response.body.codes[0].code).toBe('LC-ABCD-EFGH-JKLM-NPQR');
});
```

Adapt helper names to the existing `routes.spec.ts` test harness. If the harness stores dependencies in `getDefaultDeps`, add the new dependency methods there as jest fakes.

- [ ] **Step 2: Run failing route tests**

Run:

```bash
npm run test:packages:api -- routes.spec.ts --runInBand
```

Expected: FAIL because the route factory lacks redemption dependencies and endpoints.

- [ ] **Step 3: Extend route dependencies**

In `packages/api/src/subscriptions/routes.ts`, import:

```ts
import { createRedemptionService } from './redemption';
```

Extend `SubscriptionRouteDb` with the redemption methods added in Task 2. Add a route dependency for limiter:

```ts
  redeemRateLimiter?: express.RequestHandler;
```

Inside `createSubscriptionRouter`, initialize:

```ts
  const redemption = createRedemptionService({ db: deps.db });
  const redeemLimiter = deps.redeemRateLimiter ?? ((_req, _res, next) => next());
```

- [ ] **Step 4: Add user redeem route**

Add before admin routes:

```ts
  router.post('/redeem', deps.requireJwtAuth, redeemLimiter, async (req, res, next) => {
    try {
      const user = getAuthenticatedUser(req);
      const result = await redemption.redeem({
        user,
        body: getRedemptionCodeBody(req.body),
      });
      res.json(result);
    } catch (error) {
      handleRedemptionRouteError(error, res, next);
    }
  });
```

Add body parser helper:

```ts
function getRedemptionCodeBody(body: unknown): { code: string } {
  if (!isObjectRecord(body) || typeof body.code !== 'string') {
    throw new Error('Invalid redemption code request');
  }
  return { code: body.code };
}
```

Add error helper:

```ts
function handleRedemptionRouteError(
  error: unknown,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (error instanceof Error && error.message.includes('Invalid redemption')) {
    res.status(400).json({ message: 'Invalid or unavailable redemption code' });
    return;
  }
  next(error);
}
```

- [ ] **Step 5: Add admin batch route**

Add after `/admin/orders` routes:

```ts
  router.post(
    '/admin/redemption-batches',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const result = await redemption.createBatch({
          adminUser: user,
          body: getRedemptionBatchBody(req.body),
        });
        res.status(201).json(result);
      } catch (error) {
        handleRedemptionRouteError(error, res, next);
      }
    },
  );
```

Add body helper:

```ts
function getRedemptionBatchBody(body: unknown) {
  if (!isObjectRecord(body)) {
    throw new Error('Invalid redemption batch request');
  }

  return {
    name: String(body.name ?? ''),
    quantity: Number(body.quantity),
    durationDays: Number(body.durationDays),
    textDailyLimit: Number(body.textDailyLimit),
    imageDailyLimit: Number(body.imageDailyLimit),
    ...(typeof body.planKey === 'string' ? { planKey: body.planKey } : {}),
    ...(typeof body.planName === 'string' ? { planName: body.planName } : {}),
    ...(typeof body.planDescription === 'string' ? { planDescription: body.planDescription } : {}),
    ...(typeof body.planAmount === 'number' ? { planAmount: body.planAmount } : {}),
    ...(typeof body.expiresAt === 'string' ? { expiresAt: body.expiresAt } : {}),
    ...(typeof body.note === 'string' ? { note: body.note } : {}),
    ...(typeof body.campaign === 'string' ? { campaign: body.campaign } : {}),
  };
}
```

- [ ] **Step 6: Create limiter**

Create `api/server/middleware/limiters/redemptionLimiter.js`.

```js
const rateLimit = require('express-rate-limit');
const { limiterCache, removePorts } = require('@librechat/api');

const redemptionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.id ?? req.user?._id?.toString();
    return userId ? `user:${userId}` : `ip:${removePorts(req.ip)}`;
  },
  store: limiterCache('subscription_redemption_limiter'),
});

module.exports = redemptionLimiter;
```

- [ ] **Step 7: Export limiter**

In `api/server/middleware/limiters/index.js`, export:

```js
const redemptionLimiter = require('./redemptionLimiter');

module.exports = {
  ...module.exports,
  redemptionLimiter,
};
```

If the file already exports an object literal, add `redemptionLimiter` to that literal instead of using spread assignment.

- [ ] **Step 8: Inject limiter**

In `api/server/routes/subscriptions.js`, import from middleware and pass to `createSubscriptionRouter`:

```js
const { requireJwtAuth, redemptionLimiter } = require('~/server/middleware');
```

Add dependency:

```js
  redeemRateLimiter: redemptionLimiter,
```

- [ ] **Step 9: Run route tests**

Run:

```bash
npm run test:packages:api -- routes.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/api/src/subscriptions/routes.ts packages/api/src/subscriptions/routes.spec.ts api/server/middleware/limiters/redemptionLimiter.js api/server/middleware/limiters/index.js api/server/routes/subscriptions.js
git commit -m "feat: add subscription redemption routes"
```

---

### Task 5: Add Shared Data Provider Contracts

**Files:**
- Modify: `packages/data-provider/src/types.ts`
- Modify: `packages/data-provider/src/api-endpoints.ts`
- Modify: `packages/data-provider/src/data-service.ts`
- Modify: `packages/data-provider/src/keys.ts`
- Modify: `packages/data-provider/specs/subscription-api-contract.spec.ts`

- [ ] **Step 1: Add failing contract test**

In `packages/data-provider/specs/subscription-api-contract.spec.ts`, extend imports:

```ts
  subscriptionRedeem,
  subscriptionAdminRedemptionBatches,
  subscriptionAdminRedemptionCodes,
```

Add assertions:

```ts
expect(subscriptionRedeem()).toBe('/api/subscriptions/redeem');
expect(subscriptionAdminRedemptionBatches()).toBe('/api/subscriptions/admin/redemption-batches');
expect(subscriptionAdminRedemptionCodes({ limit: 20, offset: 40, status: 'active' })).toBe(
  '/api/subscriptions/admin/redemption-codes?limit=20&offset=40&status=active',
);
expect(QueryKeys.subscriptionAdminRedemptionBatches).toBe('subscriptionAdminRedemptionBatches');
expect(QueryKeys.subscriptionAdminRedemptionCodes).toBe('subscriptionAdminRedemptionCodes');
```

- [ ] **Step 2: Run failing contract test**

Run:

```bash
npm run test:packages:data-provider -- subscription-api-contract.spec.ts --runInBand
```

Expected: FAIL because endpoints and keys do not exist.

- [ ] **Step 3: Add shared types**

In `packages/data-provider/src/types.ts`, add near subscription types:

```ts
export type TSubscriptionRedemptionCodeStatus = 'active' | 'redeemed' | 'disabled' | 'expired';

export type TRedeemSubscriptionCodeRequest = {
  code: string;
};

export type TRedeemSubscriptionCodeResponse = {
  subscription: NonNullable<TSubscriptionStatus['subscription']>;
  plan: TSubscriptionPlan;
};

export type TCreateSubscriptionRedemptionBatchRequest = {
  name: string;
  quantity: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey?: string;
  planName?: string;
  planDescription?: string;
  planAmount?: number;
  expiresAt?: string;
  note?: string;
  campaign?: string;
};

export type TSubscriptionRedemptionBatch = {
  id: string;
  name: string;
  quantity: number;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey: string;
  planName: string;
  expiresAt?: string;
  campaign?: string;
  note?: string;
  createdAt?: string;
};

export type TGeneratedSubscriptionRedemptionCode = {
  code: string;
  prefix: string;
  expiresAt?: string;
};

export type TCreateSubscriptionRedemptionBatchResponse = {
  batch: TSubscriptionRedemptionBatch;
  codes: TGeneratedSubscriptionRedemptionCode[];
};

export type TSubscriptionRedemptionCode = {
  id: string;
  batchId: string;
  codePrefix: string;
  status: TSubscriptionRedemptionCodeStatus;
  durationDays: number;
  textDailyLimit: number;
  imageDailyLimit: number;
  planKey: string;
  planName: string;
  expiresAt?: string;
  redeemedBy?: string;
  redeemedAt?: string;
  disableReason?: string;
  note?: string;
  createdAt?: string;
};

export type TSubscriptionAdminRedemptionBatchesResponse = {
  batches: TSubscriptionRedemptionBatch[];
  total: number;
  limit: number;
  offset: number;
};

export type TSubscriptionAdminRedemptionCodesParams = TAdminPageParams & {
  batchId?: string;
  status?: TSubscriptionRedemptionCodeStatus;
};

export type TSubscriptionAdminRedemptionCodesResponse = {
  codes: TSubscriptionRedemptionCode[];
  total: number;
  limit: number;
  offset: number;
};
```

- [ ] **Step 4: Add endpoints**

In `packages/data-provider/src/api-endpoints.ts`, add:

```ts
export const subscriptionRedeem = () => `${subscriptions()}/redeem`;
export const subscriptionAdminRedemptionBatches = (params: AdminPageParams = {}) =>
  `${subscriptions()}/admin/redemption-batches${buildQuery(params)}`;
export const subscriptionAdminRedemptionCodes = (
  params: SubscriptionAdminRedemptionCodesParams = {},
) => `${subscriptions()}/admin/redemption-codes${buildQuery(params)}`;
export const subscriptionAdminRedemptionCode = (codeId: string) =>
  `${subscriptions()}/admin/redemption-codes/${encodeURIComponent(codeId)}`;
```

Also add:

```ts
type SubscriptionAdminRedemptionCodesParams = AdminPageParams & {
  batchId?: string;
  status?: string;
};
```

- [ ] **Step 5: Add data-service functions**

In `packages/data-provider/src/data-service.ts`, add:

```ts
export function redeemSubscriptionCode(
  payload: t.TRedeemSubscriptionCodeRequest,
): Promise<t.TRedeemSubscriptionCodeResponse> {
  return request.post(endpoints.subscriptionRedeem(), payload);
}

export function createSubscriptionRedemptionBatch(
  payload: t.TCreateSubscriptionRedemptionBatchRequest,
): Promise<t.TCreateSubscriptionRedemptionBatchResponse> {
  return request.post(endpoints.subscriptionAdminRedemptionBatches(), payload);
}

export function getSubscriptionAdminRedemptionBatches(
  params: t.TAdminPageParams = {},
): Promise<t.TSubscriptionAdminRedemptionBatchesResponse> {
  return request.get(endpoints.subscriptionAdminRedemptionBatches(params));
}

export function getSubscriptionAdminRedemptionCodes(
  params: t.TSubscriptionAdminRedemptionCodesParams = {},
): Promise<t.TSubscriptionAdminRedemptionCodesResponse> {
  return request.get(endpoints.subscriptionAdminRedemptionCodes(params));
}

export function disableSubscriptionRedemptionCode(
  codeId: string,
  payload: { reason?: string } = {},
): Promise<t.TSubscriptionRedemptionCode> {
  return request.patch(endpoints.subscriptionAdminRedemptionCode(codeId), payload);
}
```

- [ ] **Step 6: Add query keys**

In `packages/data-provider/src/keys.ts`, add:

```ts
  subscriptionAdminRedemptionBatches = 'subscriptionAdminRedemptionBatches',
  subscriptionAdminRedemptionCodes = 'subscriptionAdminRedemptionCodes',
```

- [ ] **Step 7: Extend data-service contract assertions**

In `packages/data-provider/specs/subscription-api-contract.spec.ts`, add calls that mock and assert:

```ts
const redeemPayload: t.TRedeemSubscriptionCodeRequest = { code: 'LC-ABCD-EFGH-JKLM-NPQR' };
postSpy.mockResolvedValueOnce({
  subscription: status.subscription!,
  plan,
});
await expect(redeemSubscriptionCode(redeemPayload)).resolves.toEqual({
  subscription: status.subscription!,
  plan,
});
expect(postSpy).toHaveBeenCalledWith('/api/subscriptions/redeem', redeemPayload);
```

Import `redeemSubscriptionCode` from `data-service`.

- [ ] **Step 8: Run contract test**

Run:

```bash
npm run test:packages:data-provider -- subscription-api-contract.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/data-provider/src/types.ts packages/data-provider/src/api-endpoints.ts packages/data-provider/src/data-service.ts packages/data-provider/src/keys.ts packages/data-provider/specs/subscription-api-contract.spec.ts
git commit -m "feat: add subscription redemption API contracts"
```

---

### Task 6: Add React Query Hooks

**Files:**
- Modify: `client/src/data-provider/Subscriptions/queries.ts`
- Modify: `client/src/data-provider/Subscriptions/mutations.ts`
- Modify: `client/src/data-provider/Subscriptions/queries.spec.ts`
- Modify: `client/src/data-provider/Subscriptions/mutations.spec.ts`

- [ ] **Step 1: Add failing hook tests**

In `mutations.spec.ts`, add:

```ts
it('redeems subscription codes and invalidates subscription status', () => {
  const { result } = renderHook(() => useRedeemSubscriptionCode(), { wrapper });
  result.current.mutate({ code: 'LC-ABCD-EFGH-JKLM-NPQR' });
  expect(dataService.redeemSubscriptionCode).toHaveBeenCalledWith({
    code: 'LC-ABCD-EFGH-JKLM-NPQR',
  });
});

it('creates subscription redemption batches', () => {
  const { result } = renderHook(() => useCreateSubscriptionRedemptionBatch(), { wrapper });
  result.current.mutate({
    name: 'Taobao',
    quantity: 1,
    durationDays: 30,
    textDailyLimit: 1000,
    imageDailyLimit: 20,
  });
  expect(dataService.createSubscriptionRedemptionBatch).toHaveBeenCalled();
});
```

In `queries.spec.ts`, add:

```ts
it('queries admin redemption batches', () => {
  useGetSubscriptionAdminRedemptionBatches({ limit: 20, offset: 0 }, { enabled: true });
  expect(useQuery).toHaveBeenCalledWith(
    [QueryKeys.subscriptionAdminRedemptionBatches, { limit: 20, offset: 0 }],
    expect.any(Function),
    expect.objectContaining({ enabled: true }),
  );
});
```

- [ ] **Step 2: Run failing hook tests**

Run:

```bash
npm run test:client -- Subscriptions
```

Expected: FAIL because hooks do not exist.

- [ ] **Step 3: Add query hooks**

In `client/src/data-provider/Subscriptions/queries.ts`, add:

```ts
export const useGetSubscriptionAdminRedemptionBatches = (
  params: t.TAdminPageParams = {},
  config?: UseQueryOptions<t.TSubscriptionAdminRedemptionBatchesResponse>,
): QueryObserverResult<t.TSubscriptionAdminRedemptionBatchesResponse> => {
  return useQuery<t.TSubscriptionAdminRedemptionBatchesResponse>(
    [QueryKeys.subscriptionAdminRedemptionBatches, params],
    () => dataService.getSubscriptionAdminRedemptionBatches(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useGetSubscriptionAdminRedemptionCodes = (
  params: t.TSubscriptionAdminRedemptionCodesParams = {},
  config?: UseQueryOptions<t.TSubscriptionAdminRedemptionCodesResponse>,
): QueryObserverResult<t.TSubscriptionAdminRedemptionCodesResponse> => {
  return useQuery<t.TSubscriptionAdminRedemptionCodesResponse>(
    [QueryKeys.subscriptionAdminRedemptionCodes, params],
    () => dataService.getSubscriptionAdminRedemptionCodes(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};
```

- [ ] **Step 4: Add mutation hooks**

In `client/src/data-provider/Subscriptions/mutations.ts`, add:

```ts
function invalidateRedemptionAdminQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({
    queryKey: [QueryKeys.subscriptionAdminRedemptionBatches],
    refetchType: 'all',
  });
  queryClient.invalidateQueries({
    queryKey: [QueryKeys.subscriptionAdminRedemptionCodes],
    refetchType: 'all',
  });
}

export const useRedeemSubscriptionCode = (): UseMutationResult<
  t.TRedeemSubscriptionCodeResponse,
  unknown,
  t.TRedeemSubscriptionCodeRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: t.TRedeemSubscriptionCodeRequest) => dataService.redeemSubscriptionCode(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.subscriptionStatus]);
        queryClient.invalidateQueries([QueryKeys.subscriptionPlans]);
        queryClient.invalidateQueries([QueryKeys.balance]);
      },
    },
  );
};

export const useCreateSubscriptionRedemptionBatch = (): UseMutationResult<
  t.TCreateSubscriptionRedemptionBatchResponse,
  unknown,
  t.TCreateSubscriptionRedemptionBatchRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: t.TCreateSubscriptionRedemptionBatchRequest) =>
      dataService.createSubscriptionRedemptionBatch(payload),
    {
      onSuccess: () => invalidateRedemptionAdminQueries(queryClient),
    },
  );
};

export const useDisableSubscriptionRedemptionCode = (): UseMutationResult<
  t.TSubscriptionRedemptionCode,
  unknown,
  { codeId: string; reason?: string },
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    ({ codeId, reason }) => dataService.disableSubscriptionRedemptionCode(codeId, { reason }),
    {
      onSuccess: () => invalidateRedemptionAdminQueries(queryClient),
    },
  );
};
```

- [ ] **Step 5: Run hook tests**

Run:

```bash
npm run test:client -- Subscriptions
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/data-provider/Subscriptions/queries.ts client/src/data-provider/Subscriptions/mutations.ts client/src/data-provider/Subscriptions/queries.spec.ts client/src/data-provider/Subscriptions/mutations.spec.ts
git commit -m "feat: add subscription redemption hooks"
```

---

### Task 7: Add User Redeem UI

**Files:**
- Create: `client/src/components/Nav/SettingsTabs/Subscription/RedemptionCodeForm.tsx`
- Modify: `client/src/components/Nav/SettingsTabs/Subscription/Subscription.tsx`
- Modify: `client/src/components/Nav/SettingsTabs/Subscription/Subscription.spec.tsx`
- Modify: `client/src/locales/en/translation.json`

- [ ] **Step 1: Add failing UI test**

In `Subscription.spec.tsx`, mock `useRedeemSubscriptionCode` and add:

```ts
test('redeems a code from the subscription tab', async () => {
  const mutate = jest.fn();
  mockUseRedeemSubscriptionCode.mockReturnValue({ mutate, isLoading: false, isError: false, isSuccess: false });

  render(<Subscription />);

  await userEvent.type(screen.getByLabelText('com_nav_subscription_redeem_code_label'), 'LC-ABCD');
  await userEvent.click(screen.getByRole('button', { name: 'com_nav_subscription_redeem_submit' }));

  expect(mutate).toHaveBeenCalledWith(
    { code: 'LC-ABCD' },
    expect.objectContaining({ onSuccess: expect.any(Function) }),
  );
});
```

- [ ] **Step 2: Run failing UI test**

Run:

```bash
npm run test:client -- Subscription.spec.tsx --runInBand
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Create redeem form**

Create `client/src/components/Nav/SettingsTabs/Subscription/RedemptionCodeForm.tsx`.

```tsx
import React, { useState } from 'react';
import { TicketCheck } from 'lucide-react';
import { useRedeemSubscriptionCode } from '~/data-provider';
import { useLocalize } from '~/hooks';

function RedemptionCodeForm() {
  const localize = useLocalize();
  const redeem = useRedeemSubscriptionCode();
  const [code, setCode] = useState('');
  const [success, setSuccess] = useState(false);
  const canSubmit = code.trim().length > 0 && !redeem.isLoading;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setSuccess(false);
    redeem.mutate(
      { code: code.trim() },
      {
        onSuccess: () => {
          setCode('');
          setSuccess(true);
        },
      },
    );
  };

  return (
    <section className="space-y-3 rounded-lg border border-border-light p-3">
      <div className="flex items-center gap-2">
        <TicketCheck className="h-4 w-4 text-text-secondary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">{localize('com_nav_subscription_redeem_title')}</h3>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">{localize('com_nav_subscription_redeem_code_label')}</span>
          <input
            aria-label={localize('com_nav_subscription_redeem_code_label')}
            className="h-10 w-full rounded-md border border-border-light bg-transparent px-3 text-sm"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setSuccess(false);
            }}
            placeholder={localize('com_nav_subscription_redeem_placeholder')}
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {localize('com_nav_subscription_redeem_submit')}
        </button>
      </form>
      {success && (
        <p className="text-xs text-green-600" role="status">
          {localize('com_nav_subscription_redeem_success')}
        </p>
      )}
      {redeem.isError && (
        <p className="text-xs text-red-600" role="alert">
          {localize('com_nav_subscription_redeem_error')}
        </p>
      )}
    </section>
  );
}

export default React.memo(RedemptionCodeForm);
```

- [ ] **Step 4: Render form**

In `Subscription.tsx`, import:

```ts
import RedemptionCodeForm from './RedemptionCodeForm';
```

Render it after the current plan section and before payment warnings:

```tsx
      <RedemptionCodeForm />
```

- [ ] **Step 5: Add translations**

In `client/src/locales/en/translation.json`, add keys:

```json
"com_nav_subscription_redeem_title": "兑换码",
"com_nav_subscription_redeem_code_label": "兑换码",
"com_nav_subscription_redeem_placeholder": "输入兑换码",
"com_nav_subscription_redeem_submit": "兑换",
"com_nav_subscription_redeem_success": "兑换成功，额度已更新。",
"com_nav_subscription_redeem_error": "兑换码无效、已过期或已被使用。"
```

Keep JSON comma placement valid.

- [ ] **Step 6: Run UI test**

Run:

```bash
npm run test:client -- Subscription.spec.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/Nav/SettingsTabs/Subscription/RedemptionCodeForm.tsx client/src/components/Nav/SettingsTabs/Subscription/Subscription.tsx client/src/components/Nav/SettingsTabs/Subscription/Subscription.spec.tsx client/src/locales/en/translation.json
git commit -m "feat: add subscription code redemption UI"
```

---

### Task 8: Add Admin Redemptions Page

**Files:**
- Create: `client/src/components/Admin/RedemptionCodesPage.tsx`
- Modify: `client/src/components/Admin/AdminShell.tsx`
- Modify: `client/src/components/Admin/AdminShell.spec.tsx`
- Modify: `client/src/locales/en/translation.json`

- [ ] **Step 1: Add failing admin shell test**

In `AdminShell.spec.tsx`, add:

```ts
test('renders redemptions page for admins', () => {
  useAuthContext.mockReturnValue({ user: { role: SystemRoles.ADMIN } });
  renderAdminShell('/d/admin/redemptions');
  expect(screen.getByText('com_admin_redemptions_title')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm run test:client -- AdminShell.spec.tsx --runInBand
```

Expected: FAIL because page/nav does not exist.

- [ ] **Step 3: Create admin page**

Create `client/src/components/Admin/RedemptionCodesPage.tsx`.

```tsx
import React, { useMemo, useState } from 'react';
import { Download, TicketPlus } from 'lucide-react';
import type t from 'librechat-data-provider';
import {
  useCreateSubscriptionRedemptionBatch,
  useGetSubscriptionAdminRedemptionBatches,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import PaginationControls from './PaginationControls';

const pageSize = 20;

type FormState = {
  name: string;
  quantity: string;
  durationDays: string;
  textDailyLimit: string;
  imageDailyLimit: string;
  expiresAt: string;
  campaign: string;
  note: string;
};

const emptyForm: FormState = {
  name: '',
  quantity: '100',
  durationDays: '30',
  textDailyLimit: '1000',
  imageDailyLimit: '20',
  expiresAt: '',
  campaign: '',
  note: '',
};

function toInt(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function toPayload(form: FormState): t.TCreateSubscriptionRedemptionBatchRequest {
  return {
    name: form.name.trim(),
    quantity: toInt(form.quantity),
    durationDays: toInt(form.durationDays),
    textDailyLimit: toInt(form.textDailyLimit),
    imageDailyLimit: toInt(form.imageDailyLimit),
    ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
    ...(form.campaign.trim() ? { campaign: form.campaign.trim() } : {}),
    ...(form.note.trim() ? { note: form.note.trim() } : {}),
  };
}

function downloadCodes(batchName: string, codes: t.TGeneratedSubscriptionRedemptionCode[]) {
  const rows = ['code,prefix,expiresAt'].concat(
    codes.map((code) => [code.code, code.prefix, code.expiresAt ?? ''].join(',')),
  );
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${batchName || 'redemption-codes'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function RedemptionCodesPage() {
  const localize = useLocalize();
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [created, setCreated] = useState<t.TCreateSubscriptionRedemptionBatchResponse | null>(null);
  const batchesQuery = useGetSubscriptionAdminRedemptionBatches({ limit: pageSize, offset });
  const createBatch = useCreateSubscriptionRedemptionBatch();
  const batches = batchesQuery.data?.batches ?? [];
  const total = batchesQuery.data?.total ?? 0;
  const canSubmit = useMemo(() => {
    const payload = toPayload(form);
    return (
      payload.name.length > 0 &&
      payload.quantity > 0 &&
      payload.durationDays > 0 &&
      payload.textDailyLimit >= 0 &&
      payload.imageDailyLimit >= 0 &&
      !createBatch.isLoading
    );
  }, [form, createBatch.isLoading]);

  const updateForm = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    createBatch.mutate(toPayload(form), {
      onSuccess: (response) => {
        setCreated(response);
        setForm(emptyForm);
      },
    });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">
          {localize('com_admin_redemptions_title')}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {localize('com_admin_redemptions_description')}
        </p>
      </div>

      <form className="grid gap-3 rounded-lg border border-border-light p-3 md:grid-cols-4" onSubmit={submit}>
        {(['name', 'quantity', 'durationDays', 'textDailyLimit', 'imageDailyLimit', 'expiresAt', 'campaign', 'note'] as const).map((field) => (
          <label key={field} className="space-y-1 text-xs font-medium text-text-secondary">
            <span>{localize(`com_admin_redemptions_${field}` as never)}</span>
            <input
              className="h-10 w-full rounded-md border border-border-light bg-transparent px-3 text-sm text-text-primary"
              type={field === 'expiresAt' ? 'datetime-local' : ['quantity', 'durationDays', 'textDailyLimit', 'imageDailyLimit'].includes(field) ? 'number' : 'text'}
              min={field === 'textDailyLimit' || field === 'imageDailyLimit' ? '0' : '1'}
              value={form[field]}
              onChange={(event) => updateForm(field, event.target.value)}
            />
          </label>
        ))}
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-white disabled:opacity-60 md:self-end"
        >
          <TicketPlus className="h-4 w-4" aria-hidden="true" />
          {localize('com_admin_redemptions_generate')}
        </button>
      </form>

      {createBatch.isError && (
        <div className="rounded-md border border-red-500/40 p-3 text-sm text-red-600" role="alert">
          {localize('com_admin_redemptions_generate_error')}
        </div>
      )}

      {created && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-green-600/40 p-3">
          <span className="text-sm text-text-primary">
            {localize('com_admin_redemptions_generated', { count: created.codes.length })}
          </span>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border-light px-3 text-sm"
            onClick={() => downloadCodes(created.batch.name, created.codes)}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {localize('com_admin_redemptions_download')}
          </button>
        </div>
      )}

      <div className="min-h-0 overflow-auto rounded-lg border border-border-light">
        <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-surface-secondary text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">{localize('com_admin_redemptions_name')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_redemptions_campaign')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_redemptions_quantity')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_redemptions_durationDays')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_redemptions_textDailyLimit')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_redemptions_imageDailyLimit')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_redemptions_created')}</th>
            </tr>
          </thead>
          <tbody>
            {batchesQuery.isLoading && (
              <tr>
                <td className="px-3 py-6 text-center text-text-secondary" colSpan={7}>
                  {localize('com_admin_loading')}
                </td>
              </tr>
            )}
            {!batchesQuery.isLoading && batches.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-text-secondary" colSpan={7}>
                  {localize('com_admin_redemptions_empty')}
                </td>
              </tr>
            )}
            {!batchesQuery.isLoading &&
              batches.map((batch) => (
                <tr key={batch.id} className="border-t border-border-light">
                  <td className="px-3 py-3 font-medium text-text-primary">{batch.name}</td>
                  <td className="px-3 py-3 text-text-secondary">{batch.campaign}</td>
                  <td className="px-3 py-3 text-text-secondary">{batch.quantity}</td>
                  <td className="px-3 py-3 text-text-secondary">{batch.durationDays}</td>
                  <td className="px-3 py-3 text-text-secondary">{batch.textDailyLimit}</td>
                  <td className="px-3 py-3 text-text-secondary">{batch.imageDailyLimit}</td>
                  <td className="px-3 py-3 text-text-secondary">
                    {batch.createdAt ? new Date(batch.createdAt).toLocaleString() : ''}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <PaginationControls total={total} limit={pageSize} offset={offset} onOffsetChange={setOffset} />
    </section>
  );
}

export default React.memo(RedemptionCodesPage);
```

- [ ] **Step 4: Add admin nav**

In `AdminShell.tsx`, import:

```ts
import { Ticket } from 'lucide-react';
import RedemptionCodesPage from './RedemptionCodesPage';
```

Update page detection:

```ts
  const page = path.endsWith('/payments')
    ? 'payments'
    : path.endsWith('/redemptions')
      ? 'redemptions'
      : path.endsWith('/accounts')
        ? 'accounts'
        : '';
```

Add nav link:

```tsx
            <NavLink to="/d/admin/redemptions" className={linkClass}>
              <Ticket className="h-4 w-4" aria-hidden="true" />
              {localize('com_admin_redemptions_nav')}
            </NavLink>
```

Add render:

```tsx
        {page === 'redemptions' && <RedemptionCodesPage />}
```

- [ ] **Step 5: Add translations**

In `client/src/locales/en/translation.json`, add:

```json
"com_admin_redemptions_nav": "兑换码",
"com_admin_redemptions_title": "兑换码管理",
"com_admin_redemptions_description": "批量生成淘宝推广兑换码，并下载一次性明文 CSV。",
"com_admin_redemptions_name": "名称",
"com_admin_redemptions_quantity": "数量",
"com_admin_redemptions_durationDays": "有效天数",
"com_admin_redemptions_textDailyLimit": "文本/天",
"com_admin_redemptions_imageDailyLimit": "图片/天",
"com_admin_redemptions_expiresAt": "兑换截止",
"com_admin_redemptions_campaign": "活动/SKU",
"com_admin_redemptions_note": "备注",
"com_admin_redemptions_generate": "生成",
"com_admin_redemptions_generate_error": "兑换码生成失败，请重试。",
"com_admin_redemptions_generated": "已生成 {{count}} 个兑换码。请立即下载，系统不会再次显示明文。",
"com_admin_redemptions_download": "下载 CSV",
"com_admin_redemptions_created": "创建时间",
"com_admin_redemptions_empty": "暂无兑换码批次。"
```

- [ ] **Step 6: Run admin UI tests**

Run:

```bash
npm run test:client -- AdminShell.spec.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/Admin/RedemptionCodesPage.tsx client/src/components/Admin/AdminShell.tsx client/src/components/Admin/AdminShell.spec.tsx client/src/locales/en/translation.json
git commit -m "feat: add admin redemption code page"
```

---

### Task 9: Add Admin Listing And Disable Routes

**Files:**
- Modify: `packages/api/src/subscriptions/routes.ts`
- Modify: `packages/api/src/subscriptions/routes.spec.ts`
- Modify: `client/src/components/Admin/RedemptionCodesPage.tsx`

- [ ] **Step 1: Add failing route tests**

Add route tests:

```ts
test('admin lists redemption batches', async () => {
  const app = createApp({
    ...baseDeps,
    listSubscriptionRedemptionBatches: async () => [
      {
        _id: 'batch-1',
        name: 'Taobao',
        quantity: 1,
        durationDays: 30,
        textDailyLimit: 1000,
        imageDailyLimit: 20,
        planKey: 'redeem-30d',
        planName: 'Taobao',
        createdBy: 'admin-1',
        createdAt: new Date('2026-06-07T00:00:00.000Z'),
      },
    ],
    countSubscriptionRedemptionBatches: async () => 1,
  });

  const response = await requestApp(app, '/api/subscriptions/admin/redemption-batches?limit=20&offset=0');

  expect(response.status).toBe(200);
  expect(response.body.total).toBe(1);
  expect(response.body.batches[0].id).toBe('batch-1');
});
```

- [ ] **Step 2: Implement list routes**

In `routes.ts`, add:

```ts
  router.get(
    '/admin/redemption-batches',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const page = parsePagination(req.query);
        const [batches, total] = await Promise.all([
          deps.db.listSubscriptionRedemptionBatches({ ...page, ...(user.tenantId ? { tenantId: user.tenantId } : {}) }),
          deps.db.countSubscriptionRedemptionBatches(user.tenantId),
        ]);
        res.json({
          batches: batches.map(serializeRedemptionBatch),
          total,
          limit: page.limit,
          offset: page.offset,
        });
      } catch (error) {
        next(error);
      }
    },
  );
```

Add serializer:

```ts
function serializeRedemptionBatch(batch: any) {
  return {
    id: getObjectId(batch._id),
    name: batch.name,
    quantity: batch.quantity,
    durationDays: batch.durationDays,
    textDailyLimit: batch.textDailyLimit,
    imageDailyLimit: batch.imageDailyLimit,
    planKey: batch.planKey,
    planName: batch.planName,
    ...(batch.expiresAt ? { expiresAt: new Date(batch.expiresAt).toISOString() } : {}),
    ...(batch.campaign ? { campaign: batch.campaign } : {}),
    ...(batch.note ? { note: batch.note } : {}),
    ...(batch.createdAt ? { createdAt: new Date(batch.createdAt).toISOString() } : {}),
  };
}
```

- [ ] **Step 3: Add code list and disable routes**

Add:

```ts
  router.get(
    '/admin/redemption-codes',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const page = parsePagination(req.query);
        const filter = {
          ...page,
          ...(typeof req.query.batchId === 'string' ? { batch: req.query.batchId } : {}),
          ...(typeof req.query.status === 'string' ? { status: req.query.status as any } : {}),
          ...(user.tenantId ? { tenantId: user.tenantId } : {}),
        };
        const [codes, total] = await Promise.all([
          deps.db.listSubscriptionRedemptionCodes(filter),
          deps.db.countSubscriptionRedemptionCodes(filter),
        ]);
        res.json({
          codes: codes.map(serializeRedemptionCode),
          total,
          limit: page.limit,
          offset: page.offset,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/admin/redemption-codes/:codeId',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const code = await deps.db.disableSubscriptionRedemptionCode({
          codeId: req.params.codeId,
          ...(typeof req.body?.reason === 'string' ? { reason: req.body.reason } : {}),
          ...(user.tenantId ? { tenantId: user.tenantId } : {}),
        });
        if (!code) {
          res.status(404).json({ message: 'Redemption code not found' });
          return;
        }
        res.json(serializeRedemptionCode(code));
      } catch (error) {
        next(error);
      }
    },
  );
```

Add serializer:

```ts
function serializeRedemptionCode(code: any) {
  return {
    id: getObjectId(code._id),
    batchId: getObjectId(code.batch),
    codePrefix: code.codePrefix,
    status: code.status,
    durationDays: code.durationDays,
    textDailyLimit: code.textDailyLimit,
    imageDailyLimit: code.imageDailyLimit,
    planKey: code.planKey,
    planName: code.planName,
    ...(code.expiresAt ? { expiresAt: new Date(code.expiresAt).toISOString() } : {}),
    ...(code.redeemedBy ? { redeemedBy: getObjectId(code.redeemedBy) } : {}),
    ...(code.redeemedAt ? { redeemedAt: new Date(code.redeemedAt).toISOString() } : {}),
    ...(code.disableReason ? { disableReason: code.disableReason } : {}),
    ...(code.note ? { note: code.note } : {}),
    ...(code.createdAt ? { createdAt: new Date(code.createdAt).toISOString() } : {}),
  };
}
```

- [ ] **Step 4: Run route tests**

Run:

```bash
npm run test:packages:api -- routes.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/subscriptions/routes.ts packages/api/src/subscriptions/routes.spec.ts client/src/components/Admin/RedemptionCodesPage.tsx
git commit -m "feat: list and disable subscription redemption codes"
```

---

### Task 10: Final Verification

**Files:**
- All touched files.

- [ ] **Step 1: Run focused data-schema tests**

Run:

```bash
npm run test:packages:data-schemas -- subscription.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run focused API tests**

Run:

```bash
npm run test:packages:api -- redemption.spec.ts routes.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 3: Run focused data-provider tests**

Run:

```bash
npm run test:packages:data-provider -- subscription-api-contract.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 4: Run focused client tests**

Run:

```bash
npm run test:client -- Subscription.spec.tsx AdminShell.spec.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 5: Build affected packages**

Run:

```bash
npm run build:data-provider
npm run build:data-schemas
npm run build:api
cd client && npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 6: Review diff**

Run:

```bash
git diff --stat main...
git diff main... -- packages/data-schemas/src/schema/subscription packages/data-schemas/src/methods/subscription.ts packages/api/src/subscriptions packages/data-provider/src client/src/components/Nav/SettingsTabs/Subscription client/src/components/Admin
```

Expected:

- no plaintext code persisted in schemas or methods
- user redeem route requires auth and limiter
- admin routes require admin access
- tenant id included in all database operations
- generated plaintext returned only from batch creation response

- [ ] **Step 7: Commit verification fixes**

If verification required fixes:

```bash
git add <fixed-files>
git commit -m "fix: harden subscription redemption verification"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Admin batch generation is covered in Tasks 1, 2, 3, 4, 5, 6, and 8.
- User redemption is covered in Tasks 2, 3, 4, 5, 6, and 7.
- One-time plaintext display is covered in Tasks 3 and 8.
- Hash-only persistence is covered in Tasks 1, 2, 3, and 10.
- Subscription quota reuse is covered in Tasks 3 and 4.
- Admin listing/disable is covered in Task 9.
- Tests and verification are covered across all tasks and Task 10.

Placeholder scan:

- No task contains placeholder markers or unspecified test instructions.

Type consistency:

- `TSubscriptionRedemptionCodeStatus` matches `SubscriptionRedemptionCodeStatus`.
- Data-provider endpoint names match hook names.
- Route names match endpoint builders.
- Snapshot fields match existing `createOrExtendUserSubscription` snapshot fields.
