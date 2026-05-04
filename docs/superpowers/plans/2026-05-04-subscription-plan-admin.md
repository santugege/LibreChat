# Subscription Plan Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators manage every subscription plan, including `free`, from the existing subscription settings tab.

**Architecture:** Keep subscription plans as MongoDB data and make admin changes authoritative. Add database plan CRUD methods, administrator-only subscription routes, shared data-provider contracts, and a compact admin management section in the existing settings tab. Remove quota fallback to environment-configured free limits.

**Tech Stack:** TypeScript, Express, Mongoose, React, React Query, Jest, Testing Library, lucide-react.

---

## File Structure

- Modify: `packages/data-schemas/src/methods/subscription.ts`
  - Add admin plan list/get/create/update/delete methods while preserving tenant filters.
- Modify: `packages/data-schemas/src/methods/subscription.spec.ts`
  - Add Mongo-backed tests for admin plan CRUD and tenant isolation.
- Modify: `packages/api/src/subscriptions/types.ts`
  - Add a plan-unavailable quota error union.
- Modify: `packages/api/src/subscriptions/config.ts`
  - Remove free-plan limit fields from runtime config.
- Modify: `packages/api/src/subscriptions/quota.ts`
  - Resolve plans only from enabled database plans and deny when unavailable.
- Modify: `packages/api/src/subscriptions/quota.spec.ts`
  - Replace free fallback expectations with plan-unavailable denials.
- Modify: `packages/api/src/subscriptions/middleware.ts`
  - Format plan-unavailable quota errors cleanly.
- Modify: `packages/api/src/subscriptions/routes.ts`
  - Add admin plan CRUD endpoints and route-level validation.
- Modify: `packages/api/src/subscriptions/routes.spec.ts`
  - Test admin routes and admin middleware enforcement.
- Modify: `packages/api/src/subscriptions/payment/service.ts`
  - Reject disabled and free plans during checkout.
- Modify: `packages/api/src/subscriptions/payment/easypay.spec.ts`
  - Test free and disabled plan checkout rejection.
- Modify: `api/server/routes/subscriptions.js`
  - Pass admin capability middleware into the TypeScript router.
- Modify: `packages/data-provider/src/api-endpoints.ts`
  - Add admin plan endpoint builders.
- Modify: `packages/data-provider/src/types.ts`
  - Add admin plan create/update payload types and nullable status plan if needed.
- Modify: `packages/data-provider/src/keys.ts`
  - Add `subscriptionAdminPlans`.
- Modify: `packages/data-provider/src/data-service.ts`
  - Add admin plan CRUD service functions.
- Modify: `packages/data-provider/specs/subscription-api-contract.spec.ts`
  - Test endpoint builders and data-service delegation.
- Modify: `client/src/data-provider/Subscriptions/queries.ts`
  - Add `useGetSubscriptionAdminPlans`.
- Modify: `client/src/data-provider/Subscriptions/mutations.ts`
  - Add create/update/delete admin mutations with invalidation.
- Modify: `client/src/data-provider/Subscriptions/*.spec.ts`
  - Test hook wiring and invalidation.
- Create: `client/src/components/Nav/SettingsTabs/Subscription/AdminPlanManager.tsx`
  - Admin-only plan list, create form, inline edit form, enabled toggle, delete action.
- Modify: `client/src/components/Nav/SettingsTabs/Subscription/Subscription.tsx`
  - Render admin manager when `user.role === SystemRoles.ADMIN`.
- Modify: `client/src/components/Nav/SettingsTabs/Subscription/Subscription.spec.tsx`
  - Test admin visibility and normal-user hiding.
- Modify: `client/src/locales/en/translation.json`
  - Add English keys for admin plan management.

---

### Task 1: Database Plan CRUD

**Files:**
- Modify: `packages/data-schemas/src/methods/subscription.spec.ts`
- Modify: `packages/data-schemas/src/methods/subscription.ts`

- [ ] **Step 1: Write failing database tests**

Add these method signatures to the local `SubscriptionTestMethods` type in `packages/data-schemas/src/methods/subscription.spec.ts`:

```ts
  listSubscriptionPlans: (tenantId?: string) => Promise<SubscriptionPlanResult[]>;
  getSubscriptionPlan: (key: string, tenantId?: string) => Promise<SubscriptionPlanResult | null>;
  createSubscriptionPlan: (input: SubscriptionPlanInput) => Promise<SubscriptionPlanResult | null>;
  updateSubscriptionPlan: (
    key: string,
    input: Partial<Omit<SubscriptionPlanInput, 'key' | 'tenantId'>>,
    tenantId?: string,
  ) => Promise<SubscriptionPlanResult | null>;
  deleteSubscriptionPlan: (key: string, tenantId?: string) => Promise<SubscriptionPlanResult | null>;
```

Add this test after the existing plan upsert test:

```ts
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
    const updated = await methods.updateSubscriptionPlan!(
      'free',
      { enabled: true, textDailyLimit: 25, sortOrder: 5 },
    );
    const deleted = await methods.deleteSubscriptionPlan!('pro');
    const afterDelete = await methods.listSubscriptionPlans!();

    expect(allPlans.map((plan) => plan.key)).toEqual(['free', 'pro']);
    expect(free?.enabled).toBe(false);
    expect(updated).toMatchObject({ key: 'free', enabled: true, textDailyLimit: 25, sortOrder: 5 });
    expect(deleted?.key).toBe('pro');
    expect(afterDelete.map((plan) => plan.key)).toEqual(['free']);
  });
```

Add this tenant test:

```ts
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
```

- [ ] **Step 2: Run database tests and verify failure**

Run:

```bash
cd packages/data-schemas
npx jest src/methods/subscription.spec.ts --runInBand
```

Expected: fail with missing method names such as `methods.createSubscriptionPlan is not a function`.

- [ ] **Step 3: Implement database methods**

In `packages/data-schemas/src/methods/subscription.ts`, add these exported input types near `UpsertSubscriptionPlanInput`:

```ts
export type CreateSubscriptionPlanInput = UpsertSubscriptionPlanInput;

export type UpdateSubscriptionPlanInput = Partial<
  Omit<UpsertSubscriptionPlanInput, 'key' | 'tenantId'>
>;
```

Inside `createSubscriptionMethods`, add these functions near `upsertSubscriptionPlan`:

```ts
  async function listSubscriptionPlans(tenantId?: string): Promise<ISubscriptionPlan[]> {
    return await runAsSystem(async () => {
      const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
      return (await SubscriptionPlan.find(getTenantFilter(tenantId))
        .sort({ sortOrder: 1, price: 1, key: 1 })
        .lean()) as ISubscriptionPlan[];
    });
  }

  async function getSubscriptionPlan(
    key: string,
    tenantId?: string,
  ): Promise<ISubscriptionPlan | null> {
    return await runAsSystem(async () => {
      const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
      return (await SubscriptionPlan.findOne({
        key,
        ...getTenantFilter(tenantId),
      }).lean()) as ISubscriptionPlan | null;
    });
  }

  async function createSubscriptionPlan(
    input: CreateSubscriptionPlanInput,
  ): Promise<ISubscriptionPlan | null> {
    return await runAsSystem(async () => {
      const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
      const plan = await SubscriptionPlan.create({
        ...input,
        ...getTenantFilter(input.tenantId),
      });
      return plan.toObject() as ISubscriptionPlan;
    });
  }

  async function updateSubscriptionPlan(
    key: string,
    input: UpdateSubscriptionPlanInput,
    tenantId?: string,
  ): Promise<ISubscriptionPlan | null> {
    return await runAsSystem(async () => {
      const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
      return (await SubscriptionPlan.findOneAndUpdate(
        { key, ...getTenantFilter(tenantId) },
        { $set: input },
        { new: true, runValidators: true },
      ).lean()) as ISubscriptionPlan | null;
    });
  }

  async function deleteSubscriptionPlan(
    key: string,
    tenantId?: string,
  ): Promise<ISubscriptionPlan | null> {
    return await runAsSystem(async () => {
      const SubscriptionPlan = mongoose.models.SubscriptionPlan as Model<ISubscriptionPlan>;
      return (await SubscriptionPlan.findOneAndDelete({
        key,
        ...getTenantFilter(tenantId),
      }).lean()) as ISubscriptionPlan | null;
    });
  }
```

Add the functions to the returned object:

```ts
    listSubscriptionPlans,
    getSubscriptionPlan,
    createSubscriptionPlan,
    updateSubscriptionPlan,
    deleteSubscriptionPlan,
```

- [ ] **Step 4: Run database tests and verify pass**

Run:

```bash
cd packages/data-schemas
npx jest src/methods/subscription.spec.ts --runInBand
```

Expected: all tests in `subscription.spec.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add packages/data-schemas/src/methods/subscription.ts packages/data-schemas/src/methods/subscription.spec.ts
git commit -m "feat: add subscription plan data methods"
```

---

### Task 2: Quota Uses Database Plans Only

**Files:**
- Modify: `packages/api/src/subscriptions/types.ts`
- Modify: `packages/api/src/subscriptions/config.ts`
- Modify: `packages/api/src/subscriptions/quota.ts`
- Modify: `packages/api/src/subscriptions/quota.spec.ts`
- Modify: `packages/api/src/subscriptions/middleware.ts`

- [ ] **Step 1: Write failing quota tests**

In `packages/api/src/subscriptions/quota.spec.ts`, update `config` to remove free limits:

```ts
const config: SubscriptionConfig = {
  enabled: true,
  timezone: 'Asia/Shanghai',
};
```

Replace the three fallback tests with:

```ts
  test('denies quota when no free database plan exists', async () => {
    const deps: QuotaServiceDeps = {
      getPlans: async () => [],
      findActiveUserSubscription: async () => null,
      consumeSubscriptionQuota: async () => {
        throw new Error('should not consume quota without a plan');
      },
    };

    const service = createQuotaService(deps, config);
    const result = await service.consume({
      userId: 'user-1',
      kind: 'text',
      amount: 1,
      requestId: 'request-no-free-plan',
      now: new Date('2026-05-01T18:00:00.000Z'),
    });

    expect(result.allowed).toBe(false);
    if (result.allowed) {
      throw new Error('Expected plan denial');
    }
    expect(result.error).toEqual({
      type: 'subscription_plan_unavailable',
      kind: 'text',
      planKey: 'free',
      reason: 'missing',
      resetAt: '2026-05-02T16:00:00.000Z',
    });
  });

  test('denies quota when active subscription plan is missing', async () => {
    const deps: QuotaServiceDeps = {
      getPlans: async () => [plan({ key: 'free' })],
      findActiveUserSubscription: async () => ({ planKey: 'missing-plan' }),
      consumeSubscriptionQuota: async () => {
        throw new Error('should not consume quota without the active plan');
      },
    };

    const service = createQuotaService(deps, config);
    const result = await service.consume({
      userId: 'user-1',
      kind: 'image',
      amount: 1,
      requestId: 'request-missing-plan',
      now: new Date('2026-05-01T18:00:00.000Z'),
    });

    expect(result.allowed).toBe(false);
    if (result.allowed) {
      throw new Error('Expected plan denial');
    }
    expect(result.error).toMatchObject({
      type: 'subscription_plan_unavailable',
      kind: 'image',
      planKey: 'missing-plan',
      reason: 'missing',
    });
  });

  test('denies quota when free database plan is disabled', async () => {
    const deps: QuotaServiceDeps = {
      getPlans: async () => [plan({ enabled: false })],
      findActiveUserSubscription: async () => null,
      consumeSubscriptionQuota: async () => {
        throw new Error('should not consume quota with a disabled plan');
      },
    };

    const service = createQuotaService(deps, config);
    const result = await service.consume({
      userId: 'user-1',
      kind: 'text',
      amount: 1,
      requestId: 'request-disabled-free-plan',
      now: new Date('2026-05-01T18:00:00.000Z'),
    });

    expect(result.allowed).toBe(false);
    if (result.allowed) {
      throw new Error('Expected plan denial');
    }
    expect(result.error).toMatchObject({
      type: 'subscription_plan_unavailable',
      planKey: 'free',
      reason: 'disabled',
    });
  });
```

Update `getSubscriptionConfig` tests so they no longer mention `SUBSCRIPTION_FREE_TEXT_DAILY_LIMIT` or `SUBSCRIPTION_FREE_IMAGE_DAILY_LIMIT`.

- [ ] **Step 2: Run quota tests and verify failure**

Run:

```bash
cd packages/api
npx jest src/subscriptions/quota.spec.ts --runInBand
```

Expected: fail because quota still creates configured fallback plans and config still returns free limit fields.

- [ ] **Step 3: Update quota error types**

Replace `SubscriptionQuotaError` in `packages/api/src/subscriptions/types.ts` with:

```ts
export type SubscriptionQuotaLimitError = {
  type: 'subscription_quota';
  kind: SubscriptionQuotaKind;
  used: number;
  limit: number;
  planKey: string;
  resetAt: string;
};

export type SubscriptionPlanUnavailableError = {
  type: 'subscription_plan_unavailable';
  kind: SubscriptionQuotaKind;
  planKey: string;
  reason: 'missing' | 'disabled';
  resetAt: string;
};

export type SubscriptionQuotaError =
  | SubscriptionQuotaLimitError
  | SubscriptionPlanUnavailableError;
```

- [ ] **Step 4: Remove free limits from subscription config**

In `packages/api/src/subscriptions/config.ts`, reduce the type and return value:

```ts
const DEFAULT_TIMEZONE = 'Asia/Shanghai';

export type SubscriptionConfig = {
  enabled: boolean;
  timezone: string;
};
```

Keep `isValidTimeZone`, remove `readNonnegativeNumber`, and return:

```ts
  return {
    enabled: env.SUBSCRIPTIONS_ENABLED?.trim().toLowerCase() === 'true',
    timezone,
  };
```

- [ ] **Step 5: Implement database-only quota resolution**

In `packages/api/src/subscriptions/quota.ts`, delete `createFreePlan`. Add:

```ts
function createPlanUnavailableError(
  kind: SubscriptionQuotaKind,
  planKey: string,
  reason: 'missing' | 'disabled',
  resetAt: Date,
): SubscriptionQuotaError {
  return {
    type: 'subscription_plan_unavailable',
    kind,
    planKey,
    reason,
    resetAt: resetAt.toISOString(),
  };
}

function findPlan(
  plans: SubscriptionPlanView[],
  planKey: string,
): { plan?: SubscriptionPlanView; reason?: 'missing' | 'disabled' } {
  const plan = plans.find((item) => item.key === planKey);
  if (!plan) {
    return { reason: 'missing' };
  }
  if (!plan.enabled) {
    return { reason: 'disabled' };
  }
  return { plan };
}
```

Update `resolvePlan`:

```ts
    const activePlanKey = activeSubscription?.planKey ?? 'free';
    const { plan } = findPlan(plans, activePlanKey);

    if (!plan) {
      throw new Error(`Subscription plan is unavailable: ${activePlanKey}`);
    }

    return plan;
```

Update `consume` before consuming quota:

```ts
    const planKey = (await deps.findActiveUserSubscription(input.userId, now, input.tenantId))
      ?.planKey ?? 'free';
```

Then refactor to avoid calling `findActiveUserSubscription` twice:

```ts
    const [plans, activeSubscription] = await Promise.all([
      deps.getPlans(input.tenantId),
      deps.findActiveUserSubscription(input.userId, now, input.tenantId),
    ]);
    const planKey = activeSubscription?.planKey ?? 'free';
    const { plan, reason } = findPlan(plans, planKey);
    const window = getQuotaWindow(now, timezone);

    if (!plan) {
      return {
        allowed: false,
        error: createPlanUnavailableError(input.kind, planKey, reason ?? 'missing', window.windowEnd),
      };
    }
```

Keep normal quota consumption unchanged after the `if (!plan)` branch.

- [ ] **Step 6: Update middleware formatting**

In `packages/api/src/subscriptions/middleware.ts`, change API body types so `type` and `code` can be either error type:

```ts
type SubscriptionQuotaApiErrorBody = {
  type: SubscriptionQuotaError['type'];
  text: string;
  subscriptionQuota: SubscriptionQuotaError;
  error: {
    message: string;
    type: 'rate_limit_error' | 'too_many_requests' | 'invalid_request_error';
    param: null;
    code: SubscriptionQuotaError['type'];
  };
};
```

Update message creation:

```ts
function createQuotaMessage(error: SubscriptionQuotaError): string {
  if (error.type === 'subscription_plan_unavailable') {
    return `Subscription plan ${error.planKey} is ${error.reason}.`;
  }

  return `Daily ${error.kind} quota reached for the ${error.planKey} plan. Used ${error.used} of ${error.limit}. Resets at ${error.resetAt}.`;
}
```

Update body creation:

```ts
    type: error.type,
    subscriptionQuota: error,
    error: {
      message: createQuotaMessage(error),
      type:
        error.type === 'subscription_plan_unavailable'
          ? 'invalid_request_error'
          : errorFormat === 'openai'
            ? 'rate_limit_error'
            : 'too_many_requests',
      param: null,
      code: error.type,
    },
```

- [ ] **Step 7: Run quota and middleware tests**

Run:

```bash
cd packages/api
npx jest src/subscriptions/quota.spec.ts src/subscriptions/middleware.spec.ts --runInBand
```

Expected: both suites pass.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/subscriptions/types.ts packages/api/src/subscriptions/config.ts packages/api/src/subscriptions/quota.ts packages/api/src/subscriptions/quota.spec.ts packages/api/src/subscriptions/middleware.ts
git commit -m "feat: remove subscription free plan fallback"
```

---

### Task 3: Admin Subscription Routes

**Files:**
- Modify: `packages/api/src/subscriptions/routes.spec.ts`
- Modify: `packages/api/src/subscriptions/routes.ts`
- Modify: `api/server/routes/subscriptions.js`

- [ ] **Step 1: Write failing route tests**

In `packages/api/src/subscriptions/routes.spec.ts`, extend the test app dependencies with `requireAdminAccess` where each `createApp` call is made:

```ts
      requireAdminAccess: (_req, _res, next) => next(),
```

Add this test:

```ts
  test('admin routes list all plans and create, update, and delete plans', async () => {
    const calls: string[] = [];
    const createdPlans: unknown[] = [];
    const updatedPlans: unknown[] = [];
    const app = createApp({
      db: {
        getEnabledSubscriptionPlans: async () => [plan],
        listSubscriptionPlans: async (tenantId?: string) => {
          calls.push(`list:${tenantId ?? 'none'}`);
          return [{ ...plan, enabled: false }];
        },
        createSubscriptionPlan: async (input: unknown) => {
          createdPlans.push(input);
          return { ...plan, ...(input as object) };
        },
        updateSubscriptionPlan: async (key: string, input: unknown, tenantId?: string) => {
          updatedPlans.push({ key, input, tenantId });
          return { ...plan, key, ...(input as object) };
        },
        deleteSubscriptionPlan: async (key: string) => ({ ...plan, key }),
        findActiveUserSubscription: async () => null,
        consumeSubscriptionQuota: async () => ({
          allowed: true,
          used: 0,
          limit: 200,
          resetAt: new Date('2026-05-03T00:00:00.000Z'),
        }),
        getSubscriptionPaymentOrder: async () => null,
      },
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'admin-1', tenantId: 'tenant-a' };
        next();
      },
      requireAdminAccess: (_req, _res, next) => next(),
      createPaymentService: () => ({
        createOrder: async () => {
          throw new Error('should not create order');
        },
        handleZPayNotify: async () => {
          throw new Error('should not handle notify');
        },
      }),
    });

    const listResponse = await requestApp(app, '/api/subscriptions/admin/plans');
    const createResponse = await requestApp(app, '/api/subscriptions/admin/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'free',
        name: 'Free',
        price: 0,
        durationDays: 30,
        textDailyLimit: 20,
        imageDailyLimit: 2,
        enabled: true,
        sortOrder: 0,
      }),
    });
    const patchResponse = await requestApp(app, '/api/subscriptions/admin/plans/free', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, textDailyLimit: 10 }),
    });
    const deleteResponse = await requestApp(app, '/api/subscriptions/admin/plans/free', {
      method: 'DELETE',
    });

    expect(listResponse.status).toBe(200);
    expect(createResponse.status).toBe(201);
    expect(patchResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(calls).toEqual(['list:tenant-a']);
    expect(createdPlans[0]).toMatchObject({ key: 'free', tenantId: 'tenant-a' });
    expect(updatedPlans[0]).toMatchObject({
      key: 'free',
      input: { enabled: false, textDailyLimit: 10 },
      tenantId: 'tenant-a',
    });
  });
```

Add an admin enforcement test:

```ts
  test('admin plan routes require admin middleware', async () => {
    const app = createApp({
      db: {
        getEnabledSubscriptionPlans: async () => [plan],
        listSubscriptionPlans: async () => [plan],
        createSubscriptionPlan: async () => plan,
        updateSubscriptionPlan: async () => plan,
        deleteSubscriptionPlan: async () => plan,
        findActiveUserSubscription: async () => null,
        consumeSubscriptionQuota: async () => ({
          allowed: true,
          used: 0,
          limit: 200,
          resetAt: new Date('2026-05-03T00:00:00.000Z'),
        }),
        getSubscriptionPaymentOrder: async () => null,
      },
      requireJwtAuth: (req, _res, next) => {
        (req as TestRequest).user = { id: 'user-1' };
        next();
      },
      requireAdminAccess: (_req, res) => {
        res.status(403).json({ message: 'admin required' });
      },
      createPaymentService: () => ({
        createOrder: async () => {
          throw new Error('should not create order');
        },
        handleZPayNotify: async () => {
          throw new Error('should not handle notify');
        },
      }),
    });

    const response = await requestApp(app, '/api/subscriptions/admin/plans');

    expect(response.status).toBe(403);
  });
```

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
cd packages/api
npx jest src/subscriptions/routes.spec.ts --runInBand
```

Expected: fail because the route factory does not accept admin dependencies or expose admin endpoints.

- [ ] **Step 3: Implement route types and validation**

In `packages/api/src/subscriptions/routes.ts`, extend `SubscriptionRouteDb`:

```ts
  listSubscriptionPlans: (tenantId?: string) => Promise<SubscriptionPlanView[]>;
  createSubscriptionPlan: (
    input: SubscriptionPlanView & { tenantId?: string },
  ) => Promise<SubscriptionPlanView | null>;
  updateSubscriptionPlan: (
    key: string,
    input: Partial<Omit<SubscriptionPlanView, 'key'>>,
    tenantId?: string,
  ) => Promise<SubscriptionPlanView | null>;
  deleteSubscriptionPlan: (
    key: string,
    tenantId?: string,
  ) => Promise<SubscriptionPlanView | null>;
```

Extend `CreateSubscriptionRouterDeps`:

```ts
  requireAdminAccess: express.RequestHandler;
```

Add validation helpers:

```ts
function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonnegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonnegativeInteger(value: unknown): value is number {
  return isNonnegativeNumber(value) && Number.isInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function getPlanBody(body: unknown): SubscriptionPlanView {
  if (!isObjectRecord(body)) {
    throw new Error('Invalid subscription plan request');
  }

  const {
    key,
    name,
    description,
    price,
    durationDays,
    textDailyLimit,
    imageDailyLimit,
    enabled,
    sortOrder,
  } = body;

  if (
    !isNonemptyString(key) ||
    !isNonemptyString(name) ||
    !isNonnegativeNumber(price) ||
    !isPositiveInteger(durationDays) ||
    !isNonnegativeInteger(textDailyLimit) ||
    !isNonnegativeInteger(imageDailyLimit) ||
    typeof enabled !== 'boolean' ||
    !Number.isInteger(sortOrder)
  ) {
    throw new Error('Invalid subscription plan request');
  }

  return {
    key: key.trim(),
    name: name.trim(),
    ...(isNonemptyString(description) ? { description: description.trim() } : {}),
    price,
    durationDays,
    textDailyLimit,
    imageDailyLimit,
    enabled,
    sortOrder,
  };
}

function getPlanPatchBody(body: unknown): Partial<Omit<SubscriptionPlanView, 'key'>> {
  if (!isObjectRecord(body)) {
    throw new Error('Invalid subscription plan request');
  }

  const patch: Partial<Omit<SubscriptionPlanView, 'key'>> = {};
  if ('name' in body) {
    if (!isNonemptyString(body.name)) throw new Error('Invalid subscription plan request');
    patch.name = body.name.trim();
  }
  if ('description' in body) {
    if (body.description === undefined || body.description === null || body.description === '') {
      patch.description = undefined;
    } else if (isNonemptyString(body.description)) {
      patch.description = body.description.trim();
    } else {
      throw new Error('Invalid subscription plan request');
    }
  }
  if ('price' in body) {
    if (!isNonnegativeNumber(body.price)) throw new Error('Invalid subscription plan request');
    patch.price = body.price;
  }
  if ('durationDays' in body) {
    if (!isPositiveInteger(body.durationDays)) throw new Error('Invalid subscription plan request');
    patch.durationDays = body.durationDays;
  }
  if ('textDailyLimit' in body) {
    if (!isNonnegativeInteger(body.textDailyLimit)) throw new Error('Invalid subscription plan request');
    patch.textDailyLimit = body.textDailyLimit;
  }
  if ('imageDailyLimit' in body) {
    if (!isNonnegativeInteger(body.imageDailyLimit)) throw new Error('Invalid subscription plan request');
    patch.imageDailyLimit = body.imageDailyLimit;
  }
  if ('enabled' in body) {
    if (typeof body.enabled !== 'boolean') throw new Error('Invalid subscription plan request');
    patch.enabled = body.enabled;
  }
  if ('sortOrder' in body) {
    if (!Number.isInteger(body.sortOrder)) throw new Error('Invalid subscription plan request');
    patch.sortOrder = body.sortOrder;
  }
  return patch;
}
```

- [ ] **Step 4: Implement admin endpoints**

Add these routes before `/payment/webhook/zpay`:

```ts
  router.get('/admin/plans', deps.requireJwtAuth, deps.requireAdminAccess, async (req, res, next) => {
    try {
      const user = getAuthenticatedUser(req);
      const plans = await deps.db.listSubscriptionPlans(user.tenantId);
      res.json(plans);
    } catch (error) {
      next(error);
    }
  });

  router.post('/admin/plans', deps.requireJwtAuth, deps.requireAdminAccess, async (req, res, next) => {
    try {
      const user = getAuthenticatedUser(req);
      const planInput = getPlanBody(req.body);
      const plan = await deps.db.createSubscriptionPlan({
        ...planInput,
        ...(user.tenantId !== undefined ? { tenantId: user.tenantId } : {}),
      });
      res.status(201).json(plan);
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    '/admin/plans/:key',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const plan = await deps.db.updateSubscriptionPlan(
          req.params.key,
          getPlanPatchBody(req.body),
          user.tenantId,
        );
        if (!plan) {
          res.status(404).json({ message: 'Subscription plan not found' });
          return;
        }
        res.json(plan);
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/admin/plans/:key',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const plan = await deps.db.deleteSubscriptionPlan(req.params.key, user.tenantId);
        if (!plan) {
          res.status(404).json({ message: 'Subscription plan not found' });
          return;
        }
        res.json(plan);
      } catch (error) {
        next(error);
      }
    },
  );
```

- [ ] **Step 5: Wire admin middleware in the CommonJS route**

In `api/server/routes/subscriptions.js`, import capability middleware:

```js
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
```

Create and pass the middleware:

```js
const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

module.exports = createSubscriptionRouter({
  db,
  requireJwtAuth,
  requireAdminAccess,
  createQuotaService: (quotaDeps) => createQuotaService(quotaDeps),
  createPaymentService: () => createSubscriptionPaymentService(db),
});
```

- [ ] **Step 6: Run route tests and verify pass**

Run:

```bash
cd packages/api
npx jest src/subscriptions/routes.spec.ts --runInBand
```

Expected: all route tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/subscriptions/routes.ts packages/api/src/subscriptions/routes.spec.ts api/server/routes/subscriptions.js
git commit -m "feat: add subscription plan admin routes"
```

---

### Task 4: Reject Free and Disabled Checkout Plans

**Files:**
- Modify: `packages/api/src/subscriptions/payment/easypay.spec.ts`
- Modify: `packages/api/src/subscriptions/payment/service.ts`

- [ ] **Step 1: Write failing payment tests**

Add these tests in `describe('createSubscriptionPaymentService')`:

```ts
  test('rejects free plans during checkout', async () => {
    const createdOrders: Parameters<SubscriptionPaymentDb['createSubscriptionPaymentOrder']>[0][] =
      [];
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

    expect(createdOrders).toHaveLength(0);
  });

  test('rejects disabled plans during checkout', async () => {
    const createdOrders: Parameters<SubscriptionPaymentDb['createSubscriptionPaymentOrder']>[0][] =
      [];
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

    expect(createdOrders).toHaveLength(0);
  });
```

- [ ] **Step 2: Run payment tests and verify failure**

Run:

```bash
cd packages/api
npx jest src/subscriptions/payment/easypay.spec.ts --runInBand
```

Expected: free plan test fails because checkout accepts price `0`.

- [ ] **Step 3: Implement checkout validation**

In `packages/api/src/subscriptions/payment/service.ts`, update `getPlan`:

```ts
    if (!plan || !plan.enabled || plan.price <= 0) {
      throw new Error('Subscription plan is not available for checkout');
    }
```

Use the same error when `getFulfillmentDurationDays` cannot resolve a legacy order plan.

- [ ] **Step 4: Run payment tests and verify pass**

Run:

```bash
cd packages/api
npx jest src/subscriptions/payment/easypay.spec.ts --runInBand
```

Expected: all payment tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/subscriptions/payment/service.ts packages/api/src/subscriptions/payment/easypay.spec.ts
git commit -m "fix: reject non-purchasable subscription plans"
```

---

### Task 5: Data Provider Admin Contract

**Files:**
- Modify: `packages/data-provider/specs/subscription-api-contract.spec.ts`
- Modify: `packages/data-provider/src/api-endpoints.ts`
- Modify: `packages/data-provider/src/types.ts`
- Modify: `packages/data-provider/src/keys.ts`
- Modify: `packages/data-provider/src/data-service.ts`

- [ ] **Step 1: Write failing contract tests**

Update imports in `packages/data-provider/specs/subscription-api-contract.spec.ts`:

```ts
  subscriptionAdminPlan,
  subscriptionAdminPlans,
```

and:

```ts
  createSubscriptionAdminPlan,
  deleteSubscriptionAdminPlan,
  getSubscriptionAdminPlans,
  updateSubscriptionAdminPlan,
```

Extend the endpoint test:

```ts
    expect(subscriptionAdminPlans()).toBe('/api/subscriptions/admin/plans');
    expect(subscriptionAdminPlan('free plan')).toBe('/api/subscriptions/admin/plans/free%20plan');
```

Extend the query key test:

```ts
    expect(QueryKeys.subscriptionAdminPlans).toBe('subscriptionAdminPlans');
```

Add payload samples in the service delegation test:

```ts
    const createPlanPayload: t.TCreateSubscriptionPlanRequest = {
      key: 'team',
      name: 'Team',
      price: 99,
      durationDays: 30,
      textDailyLimit: 1000,
      imageDailyLimit: 100,
      enabled: true,
      sortOrder: 20,
    };
    const updatePlanPayload: t.TUpdateSubscriptionPlanRequest = {
      enabled: false,
      textDailyLimit: 500,
    };
```

Mock additional requests after existing calls:

```ts
    getSpy.mockResolvedValueOnce([plan]);
    const deleteSpy = jest.spyOn(request, 'delete').mockResolvedValueOnce(plan);
```

Add expectations:

```ts
    await expect(getSubscriptionAdminPlans()).resolves.toEqual([plan]);
    await expect(createSubscriptionAdminPlan(createPlanPayload)).resolves.toEqual(plan);
    await expect(updateSubscriptionAdminPlan('team', updatePlanPayload)).resolves.toEqual(plan);
    await expect(deleteSubscriptionAdminPlan('team')).resolves.toEqual(plan);

    expect(getSpy).toHaveBeenNthCalledWith(4, '/api/subscriptions/admin/plans');
    expect(postSpy).toHaveBeenCalledWith('/api/subscriptions/admin/plans', createPlanPayload);
    expect(request.patch).toHaveBeenCalledWith(
      '/api/subscriptions/admin/plans/team',
      updatePlanPayload,
    );
    expect(deleteSpy).toHaveBeenCalledWith('/api/subscriptions/admin/plans/team');
```

- [ ] **Step 2: Run data-provider contract test and verify failure**

Run:

```bash
cd packages/data-provider
npx jest specs/subscription-api-contract.spec.ts --runInBand
```

Expected: fail because endpoints, query key, types, and service functions do not exist.

- [ ] **Step 3: Add endpoint builders**

In `packages/data-provider/src/api-endpoints.ts`:

```ts
export const subscriptionAdminPlans = () => `${subscriptions()}/admin/plans`;
export const subscriptionAdminPlan = (planKey: string) =>
  `${subscriptionAdminPlans()}/${encodeURIComponent(planKey)}`;
```

- [ ] **Step 4: Add shared types**

In `packages/data-provider/src/types.ts` after `TSubscriptionPlan`:

```ts
export type TCreateSubscriptionPlanRequest = TSubscriptionPlan;

export type TUpdateSubscriptionPlanRequest = Partial<Omit<TSubscriptionPlan, 'key'>>;
```

- [ ] **Step 5: Add query key**

In `packages/data-provider/src/keys.ts`:

```ts
  subscriptionAdminPlans = 'subscriptionAdminPlans',
```

- [ ] **Step 6: Add data-service functions**

In `packages/data-provider/src/data-service.ts`:

```ts
export function getSubscriptionAdminPlans(): Promise<t.TSubscriptionPlan[]> {
  return request.get(endpoints.subscriptionAdminPlans());
}

export function createSubscriptionAdminPlan(
  payload: t.TCreateSubscriptionPlanRequest,
): Promise<t.TSubscriptionPlan> {
  return request.post(endpoints.subscriptionAdminPlans(), payload);
}

export function updateSubscriptionAdminPlan(
  planKey: string,
  payload: t.TUpdateSubscriptionPlanRequest,
): Promise<t.TSubscriptionPlan> {
  return request.patch(endpoints.subscriptionAdminPlan(planKey), payload);
}

export function deleteSubscriptionAdminPlan(planKey: string): Promise<t.TSubscriptionPlan> {
  return request.delete(endpoints.subscriptionAdminPlan(planKey));
}
```

- [ ] **Step 7: Run contract test and build data-provider**

Run:

```bash
cd packages/data-provider
npx jest specs/subscription-api-contract.spec.ts --runInBand
cd ../..
npm run build:data-provider
```

Expected: test passes and data-provider build completes.

- [ ] **Step 8: Commit**

```bash
git add packages/data-provider/src/api-endpoints.ts packages/data-provider/src/types.ts packages/data-provider/src/keys.ts packages/data-provider/src/data-service.ts packages/data-provider/specs/subscription-api-contract.spec.ts
git commit -m "feat: add subscription admin data provider contract"
```

---

### Task 6: React Query Admin Hooks

**Files:**
- Modify: `client/src/data-provider/Subscriptions/queries.spec.ts`
- Modify: `client/src/data-provider/Subscriptions/mutations.spec.ts`
- Modify: `client/src/data-provider/Subscriptions/queries.ts`
- Modify: `client/src/data-provider/Subscriptions/mutations.ts`

- [ ] **Step 1: Write failing query hook test**

Update `client/src/data-provider/Subscriptions/queries.spec.ts` imports:

```ts
  useGetSubscriptionAdminPlans,
```

Extend the mocked `QueryKeys` and `dataService`:

```ts
    subscriptionAdminPlans: 'subscriptionAdminPlans',
```

```ts
    getSubscriptionAdminPlans: jest.fn(),
```

Add:

```ts
  it('queries all subscription plans for admins', () => {
    useGetSubscriptionAdminPlans({ enabled: true });

    expect(mockUseQuery).toHaveBeenCalledWith(
      [QueryKeys.subscriptionAdminPlans],
      expect.any(Function),
      expect.objectContaining({ enabled: true }),
    );

    const queryFn = mockUseQuery.mock.calls[0][1];
    queryFn();
    expect(dataService.getSubscriptionAdminPlans).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Write failing mutation hook tests**

Update the mock in `client/src/data-provider/Subscriptions/mutations.spec.ts`:

```ts
    subscriptionPlans: 'subscriptionPlans',
    subscriptionAdminPlans: 'subscriptionAdminPlans',
```

```ts
    createSubscriptionAdminPlan: jest.fn(),
    updateSubscriptionAdminPlan: jest.fn(),
    deleteSubscriptionAdminPlan: jest.fn(),
```

Import:

```ts
  useCreateSubscriptionAdminPlan,
  useDeleteSubscriptionAdminPlan,
  useUpdateSubscriptionAdminPlan,
```

Add:

```ts
  it('creates an admin subscription plan and invalidates plan queries', () => {
    useCreateSubscriptionAdminPlan();

    const mutationFn = mockUseMutation.mock.calls[0][0];
    mutationFn({ key: 'team', name: 'Team' });
    expect(dataService.createSubscriptionAdminPlan).toHaveBeenCalledWith({
      key: 'team',
      name: 'Team',
    });

    const options = mockUseMutation.mock.calls[0][1];
    options.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith([QueryKeys.subscriptionAdminPlans]);
    expect(invalidateQueries).toHaveBeenCalledWith([QueryKeys.subscriptionPlans]);
    expect(invalidateQueries).toHaveBeenCalledWith([QueryKeys.subscriptionStatus]);
  });

  it('updates an admin subscription plan and invalidates plan queries', () => {
    useUpdateSubscriptionAdminPlan();

    const mutationFn = mockUseMutation.mock.calls[0][0];
    mutationFn({ planKey: 'team', payload: { enabled: false } });
    expect(dataService.updateSubscriptionAdminPlan).toHaveBeenCalledWith('team', {
      enabled: false,
    });
  });

  it('deletes an admin subscription plan and invalidates plan queries', () => {
    useDeleteSubscriptionAdminPlan();

    const mutationFn = mockUseMutation.mock.calls[0][0];
    mutationFn('team');
    expect(dataService.deleteSubscriptionAdminPlan).toHaveBeenCalledWith('team');
  });
```

- [ ] **Step 3: Run hook tests and verify failure**

Run:

```bash
cd client
npx jest src/data-provider/Subscriptions/queries.spec.ts src/data-provider/Subscriptions/mutations.spec.ts --runInBand
```

Expected: fail because the new hooks do not exist.

- [ ] **Step 4: Implement admin query hook**

In `client/src/data-provider/Subscriptions/queries.ts`:

```ts
export const useGetSubscriptionAdminPlans = (
  config?: UseQueryOptions<t.TSubscriptionPlan[]>,
): QueryObserverResult<t.TSubscriptionPlan[]> => {
  return useQuery<t.TSubscriptionPlan[]>(
    [QueryKeys.subscriptionAdminPlans],
    () => dataService.getSubscriptionAdminPlans(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};
```

- [ ] **Step 5: Implement admin mutations**

In `client/src/data-provider/Subscriptions/mutations.ts`:

```ts
function invalidateSubscriptionPlanQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries([QueryKeys.subscriptionAdminPlans]);
  queryClient.invalidateQueries([QueryKeys.subscriptionPlans]);
  queryClient.invalidateQueries([QueryKeys.subscriptionStatus]);
}

export const useCreateSubscriptionAdminPlan = (): UseMutationResult<
  t.TSubscriptionPlan,
  unknown,
  t.TCreateSubscriptionPlanRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: t.TCreateSubscriptionPlanRequest) => dataService.createSubscriptionAdminPlan(payload),
    {
      onSuccess: () => invalidateSubscriptionPlanQueries(queryClient),
    },
  );
};

export const useUpdateSubscriptionAdminPlan = (): UseMutationResult<
  t.TSubscriptionPlan,
  unknown,
  { planKey: string; payload: t.TUpdateSubscriptionPlanRequest },
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    ({ planKey, payload }) => dataService.updateSubscriptionAdminPlan(planKey, payload),
    {
      onSuccess: () => invalidateSubscriptionPlanQueries(queryClient),
    },
  );
};

export const useDeleteSubscriptionAdminPlan = (): UseMutationResult<
  t.TSubscriptionPlan,
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((planKey: string) => dataService.deleteSubscriptionAdminPlan(planKey), {
    onSuccess: () => invalidateSubscriptionPlanQueries(queryClient),
  });
};
```

- [ ] **Step 6: Run hook tests and verify pass**

Run:

```bash
cd client
npx jest src/data-provider/Subscriptions/queries.spec.ts src/data-provider/Subscriptions/mutations.spec.ts --runInBand
```

Expected: both hook suites pass.

- [ ] **Step 7: Commit**

```bash
git add client/src/data-provider/Subscriptions/queries.ts client/src/data-provider/Subscriptions/mutations.ts client/src/data-provider/Subscriptions/queries.spec.ts client/src/data-provider/Subscriptions/mutations.spec.ts
git commit -m "feat: add subscription admin hooks"
```

---

### Task 7: Admin Plan Management UI

**Files:**
- Create: `client/src/components/Nav/SettingsTabs/Subscription/AdminPlanManager.tsx`
- Modify: `client/src/components/Nav/SettingsTabs/Subscription/Subscription.tsx`
- Modify: `client/src/components/Nav/SettingsTabs/Subscription/Subscription.spec.tsx`
- Modify: `client/src/locales/en/translation.json`

- [ ] **Step 1: Write failing UI tests**

In `client/src/components/Nav/SettingsTabs/Subscription/Subscription.spec.tsx`, import `SystemRoles`:

```ts
import { SystemRoles } from 'librechat-data-provider';
```

Add a mock auth value:

```ts
const mockUseAuthContext = jest.fn();
```

Change the hooks mock:

```ts
  useAuthContext: () => mockUseAuthContext(),
```

In `beforeEach`, set:

```ts
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { role: SystemRoles.USER },
    });
```

Extend the data-provider mock:

```ts
  useGetSubscriptionAdminPlans: () => ({ data: plans, isLoading: false }),
  useCreateSubscriptionAdminPlan: () => ({ mutate: jest.fn(), isLoading: false }),
  useUpdateSubscriptionAdminPlan: () => ({ mutate: jest.fn(), isLoading: false }),
  useDeleteSubscriptionAdminPlan: () => ({ mutate: jest.fn(), isLoading: false }),
```

Add:

```ts
  it('shows plan management for admins', () => {
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { role: SystemRoles.ADMIN },
    });

    render(<Subscription />);

    expect(screen.getByText('com_nav_subscription_admin_plans')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_nav_subscription_admin_new_plan' })).toBeInTheDocument();
  });

  it('hides plan management from non-admin users', () => {
    render(<Subscription />);

    expect(screen.queryByText('com_nav_subscription_admin_plans')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run UI test and verify failure**

Run:

```bash
cd client
npx jest src/components/Nav/SettingsTabs/Subscription/Subscription.spec.tsx --runInBand
```

Expected: fail because `AdminPlanManager` and admin rendering do not exist.

- [ ] **Step 3: Add translations**

In `client/src/locales/en/translation.json`, add keys near existing `com_nav_subscription_*` keys:

```json
  "com_nav_subscription_admin_cancel": "Cancel",
  "com_nav_subscription_admin_delete": "Delete",
  "com_nav_subscription_admin_description": "Description",
  "com_nav_subscription_admin_duration": "Days",
  "com_nav_subscription_admin_edit": "Edit",
  "com_nav_subscription_admin_enabled": "Enabled",
  "com_nav_subscription_admin_image_limit": "Images/day",
  "com_nav_subscription_admin_key": "Key",
  "com_nav_subscription_admin_name": "Name",
  "com_nav_subscription_admin_new_plan": "New plan",
  "com_nav_subscription_admin_plans": "Plan management",
  "com_nav_subscription_admin_price": "Price",
  "com_nav_subscription_admin_save": "Save",
  "com_nav_subscription_admin_sort_order": "Sort",
  "com_nav_subscription_admin_text_limit": "Texts/day"
```

- [ ] **Step 4: Create admin manager component**

Create `client/src/components/Nav/SettingsTabs/Subscription/AdminPlanManager.tsx` with:

```tsx
import React, { useMemo, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import type { TSubscriptionPlan } from 'librechat-data-provider';
import {
  useCreateSubscriptionAdminPlan,
  useDeleteSubscriptionAdminPlan,
  useGetSubscriptionAdminPlans,
  useUpdateSubscriptionAdminPlan,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

type PlanFormState = {
  key: string;
  name: string;
  description: string;
  price: string;
  durationDays: string;
  textDailyLimit: string;
  imageDailyLimit: string;
  enabled: boolean;
  sortOrder: string;
};

const emptyForm: PlanFormState = {
  key: '',
  name: '',
  description: '',
  price: '0',
  durationDays: '30',
  textDailyLimit: '0',
  imageDailyLimit: '0',
  enabled: true,
  sortOrder: '0',
};

function formFromPlan(plan: TSubscriptionPlan): PlanFormState {
  return {
    key: plan.key,
    name: plan.name,
    description: plan.description ?? '',
    price: String(plan.price),
    durationDays: String(plan.durationDays),
    textDailyLimit: String(plan.textDailyLimit),
    imageDailyLimit: String(plan.imageDailyLimit),
    enabled: plan.enabled,
    sortOrder: String(plan.sortOrder),
  };
}

function payloadFromForm(form: PlanFormState): TSubscriptionPlan {
  return {
    key: form.key.trim(),
    name: form.name.trim(),
    ...(form.description.trim() ? { description: form.description.trim() } : {}),
    price: Number(form.price),
    durationDays: Number(form.durationDays),
    textDailyLimit: Number(form.textDailyLimit),
    imageDailyLimit: Number(form.imageDailyLimit),
    enabled: form.enabled,
    sortOrder: Number(form.sortOrder),
  };
}

function AdminPlanManager() {
  const localize = useLocalize();
  const plansQuery = useGetSubscriptionAdminPlans();
  const createPlan = useCreateSubscriptionAdminPlan();
  const updatePlan = useUpdateSubscriptionAdminPlan();
  const deletePlan = useDeleteSubscriptionAdminPlan();
  const [draft, setDraft] = useState<PlanFormState>(emptyForm);
  const [editingKey, setEditingKey] = useState('');
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const isSaving = createPlan.isLoading || updatePlan.isLoading || deletePlan.isLoading;

  const updateDraft = (field: keyof PlanFormState, value: string | boolean) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setDraft(emptyForm);
    setEditingKey('');
  };

  const submitForm = () => {
    const payload = payloadFromForm(draft);
    if (editingKey) {
      const { key: _key, ...patch } = payload;
      updatePlan.mutate({ planKey: editingKey, payload: patch }, { onSuccess: resetForm });
      return;
    }

    createPlan.mutate(payload, { onSuccess: resetForm });
  };

  return (
    <section className="space-y-3 border-t border-border-light pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{localize('com_nav_subscription_admin_plans')}</h3>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-border-light px-2 py-1 text-xs font-medium hover:bg-surface-hover"
          onClick={resetForm}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {localize('com_nav_subscription_admin_new_plan')}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {plans.map((plan) => (
          <button
            key={plan.key}
            type="button"
            className="rounded-lg border border-border-light p-3 text-left hover:bg-surface-hover"
            onClick={() => {
              setEditingKey(plan.key);
              setDraft(formFromPlan(plan));
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{plan.name}</span>
              <span className="text-xs text-text-secondary">{plan.enabled ? 'on' : 'off'}</span>
            </div>
            <div className="mt-1 text-xs text-text-secondary">{plan.key}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label={localize('com_nav_subscription_admin_key')} className="rounded-md border border-border-light bg-transparent px-2 py-1.5 text-sm" value={draft.key} disabled={Boolean(editingKey)} onChange={(event) => updateDraft('key', event.target.value)} />
        <input aria-label={localize('com_nav_subscription_admin_name')} className="rounded-md border border-border-light bg-transparent px-2 py-1.5 text-sm" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} />
        <input aria-label={localize('com_nav_subscription_admin_description')} className="rounded-md border border-border-light bg-transparent px-2 py-1.5 text-sm sm:col-span-2" value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} />
        <input aria-label={localize('com_nav_subscription_admin_price')} className="rounded-md border border-border-light bg-transparent px-2 py-1.5 text-sm" type="number" min="0" step="0.01" value={draft.price} onChange={(event) => updateDraft('price', event.target.value)} />
        <input aria-label={localize('com_nav_subscription_admin_duration')} className="rounded-md border border-border-light bg-transparent px-2 py-1.5 text-sm" type="number" min="1" step="1" value={draft.durationDays} onChange={(event) => updateDraft('durationDays', event.target.value)} />
        <input aria-label={localize('com_nav_subscription_admin_text_limit')} className="rounded-md border border-border-light bg-transparent px-2 py-1.5 text-sm" type="number" min="0" step="1" value={draft.textDailyLimit} onChange={(event) => updateDraft('textDailyLimit', event.target.value)} />
        <input aria-label={localize('com_nav_subscription_admin_image_limit')} className="rounded-md border border-border-light bg-transparent px-2 py-1.5 text-sm" type="number" min="0" step="1" value={draft.imageDailyLimit} onChange={(event) => updateDraft('imageDailyLimit', event.target.value)} />
        <input aria-label={localize('com_nav_subscription_admin_sort_order')} className="rounded-md border border-border-light bg-transparent px-2 py-1.5 text-sm" type="number" step="1" value={draft.sortOrder} onChange={(event) => updateDraft('sortOrder', event.target.value)} />
        <label className="inline-flex items-center gap-2 rounded-md border border-border-light px-2 py-1.5 text-sm">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => updateDraft('enabled', event.target.checked)} />
          {localize('com_nav_subscription_admin_enabled')}
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" disabled={isSaving} onClick={submitForm}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {localize('com_nav_subscription_admin_save')}
        </button>
        <button type="button" className="inline-flex items-center gap-1 rounded-md border border-border-light px-3 py-1.5 text-sm font-medium disabled:opacity-50" disabled={isSaving} onClick={resetForm}>
          <X className="h-4 w-4" aria-hidden="true" />
          {localize('com_nav_subscription_admin_cancel')}
        </button>
        {editingKey && (
          <button type="button" className="inline-flex items-center gap-1 rounded-md border border-red-500/50 px-3 py-1.5 text-sm font-medium text-red-600 disabled:opacity-50" disabled={isSaving} onClick={() => deletePlan.mutate(editingKey, { onSuccess: resetForm })}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {localize('com_nav_subscription_admin_delete')}
          </button>
        )}
      </div>
    </section>
  );
}

export default React.memo(AdminPlanManager);
```

- [ ] **Step 5: Render manager for admins**

In `client/src/components/Nav/SettingsTabs/Subscription/Subscription.tsx`, import `SystemRoles` and `AdminPlanManager`:

```ts
import { SystemRoles } from 'librechat-data-provider';
import AdminPlanManager from './AdminPlanManager';
```

Read user from auth:

```ts
  const { isAuthenticated, user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;
```

Render near the bottom of the main `div`, before payment link or after the plan list:

```tsx
      {isAdmin && <AdminPlanManager />}
```

- [ ] **Step 6: Run UI test and verify pass**

Run:

```bash
cd client
npx jest src/components/Nav/SettingsTabs/Subscription/Subscription.spec.tsx --runInBand
```

Expected: subscription UI tests pass.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/Nav/SettingsTabs/Subscription/AdminPlanManager.tsx client/src/components/Nav/SettingsTabs/Subscription/Subscription.tsx client/src/components/Nav/SettingsTabs/Subscription/Subscription.spec.tsx client/src/locales/en/translation.json
git commit -m "feat: add subscription plan admin UI"
```

---

### Task 8: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run targeted backend tests**

```bash
cd packages/data-schemas
npx jest src/methods/subscription.spec.ts --runInBand
cd ../api
npx jest src/subscriptions/quota.spec.ts src/subscriptions/middleware.spec.ts src/subscriptions/routes.spec.ts src/subscriptions/payment/easypay.spec.ts --runInBand
```

Expected: all targeted backend tests pass.

- [ ] **Step 2: Run data-provider tests and build**

```bash
cd packages/data-provider
npx jest specs/subscription-api-contract.spec.ts --runInBand
cd ../..
npm run build:data-provider
```

Expected: contract test and data-provider build pass.

- [ ] **Step 3: Run frontend subscription tests**

```bash
cd client
npx jest src/data-provider/Subscriptions/queries.spec.ts src/data-provider/Subscriptions/mutations.spec.ts src/components/Nav/SettingsTabs/Subscription/Subscription.spec.tsx --runInBand
```

Expected: all frontend targeted tests pass.

- [ ] **Step 4: Check workspace diff**

```bash
git status --short
git diff --stat
```

Expected: only intended subscription admin files changed, plus any pre-existing user changes still separate.

- [ ] **Step 5: Commit verification fixes if needed**

If verification required small fixes, commit only those files:

```bash
git add <fixed-files>
git commit -m "fix: stabilize subscription plan admin"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

- Spec coverage: admin can manage `free` and new plans from the existing subscription tab; `free` can be edited, disabled, or deleted; quota no longer falls back to env; checkout rejects free/disabled plans.
- Placeholder scan: no task uses deferred placeholders; every step includes file paths, commands, and concrete code snippets.
- Type consistency: plan payload names are `TCreateSubscriptionPlanRequest` and `TUpdateSubscriptionPlanRequest`; query key is `subscriptionAdminPlans`; endpoints use `/api/subscriptions/admin/plans`.
