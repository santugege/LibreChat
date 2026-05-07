# Admin Account Payment Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an administrator-only admin center with read-only account management and a read-only subscription payment order list.

**Architecture:** Reuse the existing `/api/admin/users` account endpoints and add one read-only `/api/subscriptions/admin/orders` endpoint to the existing subscription router. Shared contracts live in `packages/data-provider`, Mongo-backed order list methods live in `packages/data-schemas`, and the React admin center lives under the dashboard route tree.

**Tech Stack:** Express, TypeScript, Mongoose, React, React Router, React Query, Jest, Tailwind utility classes, LibreChat localization.

---

## File Structure

- Modify: `packages/data-provider/src/api-endpoints.ts`
  - Add admin user and subscription admin order endpoint builders.
- Modify: `packages/data-provider/src/types.ts`
  - Add admin account list/search response types and admin payment list response types.
- Modify: `packages/data-provider/src/keys.ts`
  - Add stable admin query keys.
- Modify: `packages/data-provider/src/data-service.ts`
  - Add request wrappers for admin users, admin user search, and admin payment orders.
- Create: `packages/data-provider/specs/admin-api-contract.spec.ts`
  - Contract tests for new endpoint builders, query keys, types, and data-service functions.
- Modify: `packages/data-schemas/src/methods/subscription.ts`
  - Add `listSubscriptionPaymentOrders` and `countSubscriptionPaymentOrders`.
- Modify: `packages/data-schemas/src/methods/subscription.spec.ts`
  - Mongo-backed tests for list, count, status filter, tenant scope, sorting, and sensitive field omission.
- Modify: `packages/api/src/subscriptions/routes.ts`
  - Extend `SubscriptionRouteDb`, parse admin order query params, serialize orders, add `GET /admin/orders`.
- Modify: `packages/api/src/subscriptions/routes.spec.ts`
  - Route tests for auth middleware, pagination, status filter, tenant scope, validation, and serialization.
- Create: `client/src/data-provider/Admin/queries.ts`
  - React Query hooks for admin account and payment list queries.
- Create: `client/src/data-provider/Admin/queries.spec.ts`
  - Hook contract tests.
- Create: `client/src/data-provider/Admin/index.ts`
  - Re-export admin hooks.
- Modify: `client/src/data-provider/index.ts`
  - Export the new admin data-provider folder.
- Create: `client/src/components/Admin/PaginationControls.tsx`
  - Shared compact previous/next pagination controls.
- Create: `client/src/components/Admin/AdminShell.tsx`
  - Admin-only page shell with tabs for accounts and payments.
- Create: `client/src/components/Admin/AccountsPage.tsx`
  - Account search and paginated account table.
- Create: `client/src/components/Admin/PaymentsPage.tsx`
  - Payment status filter and paginated payment table.
- Create: `client/src/components/Admin/index.ts`
  - Re-export `AdminShell`.
- Create: `client/src/components/Admin/AdminShell.spec.tsx`
  - Frontend route shell and table state tests.
- Modify: `client/src/routes/Dashboard.tsx`
  - Add `/d/admin/*` route.
- Modify: `client/src/components/Nav/AccountSettings.tsx`
  - Add admin-center menu item for administrators.
- Modify: `client/src/locales/en/translation.json`
  - Add English localization keys for the admin center.

---

### Task 1: Shared Admin API Contract

**Files:**
- Create: `packages/data-provider/specs/admin-api-contract.spec.ts`
- Modify: `packages/data-provider/src/api-endpoints.ts`
- Modify: `packages/data-provider/src/types.ts`
- Modify: `packages/data-provider/src/keys.ts`
- Modify: `packages/data-provider/src/data-service.ts`

- [ ] **Step 1: Write failing contract tests**

Create `packages/data-provider/specs/admin-api-contract.spec.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import {
  adminUsers,
  adminUserSearch,
  subscriptionAdminOrders,
} from '../src/api-endpoints';
import {
  getAdminUsers,
  searchAdminUsers,
  getSubscriptionAdminOrders,
} from '../src/data-service';
import { QueryKeys } from '../src/keys';
import request from '../src/request';
import type * as t from '../src/types';

describe('admin API contract', () => {
  it('builds admin endpoint URLs', () => {
    expect(adminUsers()).toBe('/api/admin/users');
    expect(adminUsers({ limit: 25, offset: 50 })).toBe('/api/admin/users?limit=25&offset=50');
    expect(adminUserSearch({ q: 'test user@example.com', limit: 10 })).toBe(
      '/api/admin/users/search?q=test%20user%40example.com&limit=10',
    );
    expect(subscriptionAdminOrders()).toBe('/api/subscriptions/admin/orders');
    expect(subscriptionAdminOrders({ limit: 20, offset: 40, status: 'completed' })).toBe(
      '/api/subscriptions/admin/orders?limit=20&offset=40&status=completed',
    );
  });

  it('defines admin query keys', () => {
    expect(QueryKeys.adminUsers).toBe('adminUsers');
    expect(QueryKeys.adminUserSearch).toBe('adminUserSearch');
    expect(QueryKeys.subscriptionAdminOrders).toBe('subscriptionAdminOrders');
  });

  it('accepts admin list response types', () => {
    const users: t.TAdminUsersResponse = {
      users: [
        {
          id: 'user-1',
          name: 'Ada Lovelace',
          username: 'ada',
          email: 'ada@example.com',
          avatar: '',
          role: 'USER',
          provider: 'local',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-02T00:00:00.000Z',
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    };
    const orders: t.TSubscriptionAdminOrdersResponse = {
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
            avatar: '',
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
      limit: 50,
      offset: 0,
    };

    expect(users.users[0].email).toBe('ada@example.com');
    expect(orders.orders[0].status).toBe('completed');
  });

  it('delegates admin data-service calls to request', async () => {
    const usersResponse: t.TAdminUsersResponse = { users: [], total: 0, limit: 20, offset: 0 };
    const searchResponse: t.TAdminUserSearchResponse = { users: [], total: 0, capped: false };
    const ordersResponse: t.TSubscriptionAdminOrdersResponse = {
      orders: [],
      total: 0,
      limit: 20,
      offset: 0,
    };
    const getSpy = jest.spyOn(request, 'get');
    getSpy.mockResolvedValueOnce(usersResponse);
    getSpy.mockResolvedValueOnce(searchResponse);
    getSpy.mockResolvedValueOnce(ordersResponse);

    await expect(getAdminUsers({ limit: 20, offset: 0 })).resolves.toEqual(usersResponse);
    await expect(searchAdminUsers({ q: 'ada@example.com', limit: 10 })).resolves.toEqual(
      searchResponse,
    );
    await expect(
      getSubscriptionAdminOrders({ limit: 20, offset: 0, status: 'completed' }),
    ).resolves.toEqual(ordersResponse);

    expect(getSpy).toHaveBeenNthCalledWith(1, '/api/admin/users?limit=20&offset=0');
    expect(getSpy).toHaveBeenNthCalledWith(
      2,
      '/api/admin/users/search?q=ada%40example.com&limit=10',
    );
    expect(getSpy).toHaveBeenNthCalledWith(
      3,
      '/api/subscriptions/admin/orders?limit=20&offset=0&status=completed',
    );
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd packages/data-provider
npx jest specs/admin-api-contract.spec.ts --runInBand
```

Expected: fail because `adminUsers`, `adminUserSearch`, `subscriptionAdminOrders`,
`getAdminUsers`, `searchAdminUsers`, `getSubscriptionAdminOrders`, and query keys do not exist.

- [ ] **Step 3: Add endpoint builders**

In `packages/data-provider/src/api-endpoints.ts`, add after `subscriptionQuotaExemption`:

```ts
type AdminPageParams = {
  limit?: number;
  offset?: number;
};

type AdminUserSearchParams = {
  q: string;
  limit?: number;
};

type SubscriptionAdminOrdersParams = AdminPageParams & {
  status?: string;
};

export const adminUsers = (params: AdminPageParams = {}) =>
  `${BASE_URL}/api/admin/users${buildQuery(params)}`;

export const adminUserSearch = (params: AdminUserSearchParams) =>
  `${BASE_URL}/api/admin/users/search${buildQuery(params)}`;

export const subscriptionAdminOrders = (params: SubscriptionAdminOrdersParams = {}) =>
  `${subscriptions()}/admin/orders${buildQuery(params)}`;
```

- [ ] **Step 4: Add shared types**

In `packages/data-provider/src/types.ts`, add after `TSubscriptionOrder`:

```ts
export type TAdminPageParams = {
  limit?: number;
  offset?: number;
};

export type TAdminUserListItem = {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar: string;
  role: string;
  provider: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TAdminUsersResponse = {
  users: TAdminUserListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type TAdminUserSearchParams = {
  q: string;
  limit?: number;
};

export type TAdminUserSearchResult = {
  id: string;
  name: string;
  email: string;
  username?: string;
  avatarUrl?: string;
};

export type TAdminUserSearchResponse = {
  users: TAdminUserSearchResult[];
  total: number;
  capped: boolean;
};

export type TSubscriptionAdminOrdersParams = TAdminPageParams & {
  status?: TSubscriptionOrderStatus;
};

export type TSubscriptionAdminOrderUser = {
  id: string;
  name?: string;
  username?: string;
  email?: string;
  avatar?: string;
};

export type TSubscriptionAdminOrder = {
  id: string;
  outTradeNo: string;
  tradeNo?: string;
  userId: string;
  user?: TSubscriptionAdminOrderUser;
  planKey: string;
  amount: number;
  paymentType: 'alipay' | 'wxpay';
  status: TSubscriptionOrderStatus;
  expiresAt: string;
  createdAt?: string;
  updatedAt?: string;
  paidAt?: string;
  completedAt?: string;
  failedAt?: string;
  failedReason?: string;
};

export type TSubscriptionAdminOrdersResponse = {
  orders: TSubscriptionAdminOrder[];
  total: number;
  limit: number;
  offset: number;
};
```

- [ ] **Step 5: Add query keys**

In `packages/data-provider/src/keys.ts`, add near the existing subscription keys:

```ts
  adminUsers = 'adminUsers',
  adminUserSearch = 'adminUserSearch',
  subscriptionAdminOrders = 'subscriptionAdminOrders',
```

- [ ] **Step 6: Add data-service functions**

In `packages/data-provider/src/data-service.ts`, add near the existing subscription functions:

```ts
export function getAdminUsers(params: t.TAdminPageParams = {}): Promise<t.TAdminUsersResponse> {
  return request.get(endpoints.adminUsers(params));
}

export function searchAdminUsers(
  params: t.TAdminUserSearchParams,
): Promise<t.TAdminUserSearchResponse> {
  return request.get(endpoints.adminUserSearch(params));
}

export function getSubscriptionAdminOrders(
  params: t.TSubscriptionAdminOrdersParams = {},
): Promise<t.TSubscriptionAdminOrdersResponse> {
  return request.get(endpoints.subscriptionAdminOrders(params));
}
```

- [ ] **Step 7: Run data-provider tests**

Run:

```bash
cd packages/data-provider
npx jest specs/admin-api-contract.spec.ts --runInBand
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/data-provider/src/api-endpoints.ts packages/data-provider/src/types.ts packages/data-provider/src/keys.ts packages/data-provider/src/data-service.ts packages/data-provider/specs/admin-api-contract.spec.ts
git commit -m "feat: add admin API contracts"
```

---

### Task 2: Payment Order Data Methods

**Files:**
- Modify: `packages/data-schemas/src/methods/subscription.ts`
- Modify: `packages/data-schemas/src/methods/subscription.spec.ts`

- [ ] **Step 1: Add failing Mongo-backed tests**

In `packages/data-schemas/src/methods/subscription.spec.ts`, add these tests inside the existing
subscription methods `describe` block after payment order retrieval tests:

```ts
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
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd packages/data-schemas
npx jest src/methods/subscription.spec.ts --runInBand
```

Expected: fail because `listSubscriptionPaymentOrders` and
`countSubscriptionPaymentOrders` do not exist.

- [ ] **Step 3: Add method types**

In `packages/data-schemas/src/methods/subscription.ts`, add after
`CreateSubscriptionPaymentOrderInput`:

```ts
export type ListSubscriptionPaymentOrdersInput = {
  limit: number;
  offset: number;
  status?: SubscriptionOrderStatus;
  tenantId?: string;
};

export type CountSubscriptionPaymentOrdersInput = {
  status?: SubscriptionOrderStatus;
  tenantId?: string;
};

export type SubscriptionPaymentOrderListUser = {
  id: string;
  name?: string;
  username?: string;
  email?: string;
  avatar?: string;
};

export type SubscriptionPaymentOrderListItem = {
  id: string;
  outTradeNo: string;
  tradeNo?: string;
  userId: string;
  user?: SubscriptionPaymentOrderListUser;
  planKey: string;
  amount: number;
  paymentType: SubscriptionPaymentType;
  status: SubscriptionOrderStatus;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
  paidAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  failedReason?: string;
};
```

- [ ] **Step 4: Add filter helper**

In `packages/data-schemas/src/methods/subscription.ts`, add near `getTenantFilter`:

```ts
function getPaymentOrderFilter(input: CountSubscriptionPaymentOrdersInput) {
  return {
    ...getTenantFilter(input.tenantId),
    ...(input.status ? { status: input.status } : {}),
  };
}
```

- [ ] **Step 5: Add list and count methods**

In `packages/data-schemas/src/methods/subscription.ts`, add after
`getSubscriptionPaymentOrder`:

```ts
  async function listSubscriptionPaymentOrders(
    input: ListSubscriptionPaymentOrdersInput,
  ): Promise<SubscriptionPaymentOrderListItem[]> {
    return await runAsSystem(async () => {
      const Order = mongoose.models.SubscriptionPaymentOrder as Model<ISubscriptionPaymentOrder>;
      const rows = await Order.aggregate<{
        _id: Types.ObjectId;
        outTradeNo: string;
        tradeNo?: string;
        user: Types.ObjectId;
        userInfo?: Array<{
          _id: Types.ObjectId;
          name?: string;
          username?: string;
          email?: string;
          avatar?: string;
        }>;
        planKey: string;
        amount: number;
        paymentType: SubscriptionPaymentType;
        status: SubscriptionOrderStatus;
        expiresAt: Date;
        createdAt?: Date;
        updatedAt?: Date;
        paidAt?: Date;
        completedAt?: Date;
        failedAt?: Date;
        failedReason?: string;
      }>([
        { $match: getPaymentOrderFilter(input) },
        { $sort: { createdAt: -1, _id: -1 } },
        { $skip: input.offset },
        { $limit: input.limit },
        {
          $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'userInfo',
          },
        },
        {
          $project: {
            rawNotify: 0,
            payUrl: 0,
            qrCode: 0,
          },
        },
      ]);

      return rows.map((row) => {
        const user = row.userInfo?.[0];
        const userId = row.user.toString();
        return {
          id: row._id.toString(),
          outTradeNo: row.outTradeNo,
          ...(row.tradeNo ? { tradeNo: row.tradeNo } : {}),
          userId,
          ...(user
            ? {
                user: {
                  id: user._id.toString(),
                  ...(user.name ? { name: user.name } : {}),
                  ...(user.username ? { username: user.username } : {}),
                  ...(user.email ? { email: user.email } : {}),
                  ...(user.avatar ? { avatar: user.avatar } : {}),
                },
              }
            : {}),
          planKey: row.planKey,
          amount: row.amount,
          paymentType: row.paymentType,
          status: row.status,
          expiresAt: row.expiresAt,
          ...(row.createdAt ? { createdAt: row.createdAt } : {}),
          ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
          ...(row.paidAt ? { paidAt: row.paidAt } : {}),
          ...(row.completedAt ? { completedAt: row.completedAt } : {}),
          ...(row.failedAt ? { failedAt: row.failedAt } : {}),
          ...(row.failedReason ? { failedReason: row.failedReason } : {}),
        };
      });
    });
  }

  async function countSubscriptionPaymentOrders(
    input: CountSubscriptionPaymentOrdersInput,
  ): Promise<number> {
    return await runAsSystem(async () => {
      const Order = mongoose.models.SubscriptionPaymentOrder as Model<ISubscriptionPaymentOrder>;
      return await Order.countDocuments(getPaymentOrderFilter(input));
    });
  }
```

- [ ] **Step 6: Return methods from `createMethods`**

In the returned object at the bottom of `packages/data-schemas/src/methods/subscription.ts`, add:

```ts
    listSubscriptionPaymentOrders,
    countSubscriptionPaymentOrders,
```

- [ ] **Step 7: Run data-schemas tests**

Run:

```bash
cd packages/data-schemas
npx jest src/methods/subscription.spec.ts --runInBand
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/data-schemas/src/methods/subscription.ts packages/data-schemas/src/methods/subscription.spec.ts
git commit -m "feat: add admin payment order methods"
```

---

### Task 3: Admin Payment List Route

**Files:**
- Modify: `packages/api/src/subscriptions/routes.ts`
- Modify: `packages/api/src/subscriptions/routes.spec.ts`

- [ ] **Step 1: Write failing route tests**

In `packages/api/src/subscriptions/routes.spec.ts`, add this helper near `plan`:

```ts
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
```

Extend `createDb` defaults:

```ts
    listSubscriptionPaymentOrders: async () => [],
    countSubscriptionPaymentOrders: async () => 0,
```

Add tests inside `describe('createSubscriptionRouter', () => { ... })`:

```ts
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
```

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
cd packages/api
npx jest src/subscriptions/routes.spec.ts --runInBand
```

Expected: fail because the route and db dependency methods do not exist.

- [ ] **Step 3: Add route imports and types**

In `packages/api/src/subscriptions/routes.ts`, add imports:

```ts
import { parsePagination } from '../admin/pagination';
import type {
  TSubscriptionAdminOrder,
  TSubscriptionAdminOrdersResponse,
  TSubscriptionOrderStatus,
} from 'librechat-data-provider';
```

Add types near `SubscriptionPaymentOrderView`:

```ts
type SubscriptionAdminPaymentOrderView = {
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
  status: TSubscriptionOrderStatus;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
  paidAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  failedReason?: string;
};

type ListSubscriptionPaymentOrdersInput = {
  limit: number;
  offset: number;
  status?: TSubscriptionOrderStatus;
  tenantId?: string;
};

type CountSubscriptionPaymentOrdersInput = {
  status?: TSubscriptionOrderStatus;
  tenantId?: string;
};
```

Extend `SubscriptionRouteDb`:

```ts
  listSubscriptionPaymentOrders: (
    input: ListSubscriptionPaymentOrdersInput,
  ) => Promise<SubscriptionAdminPaymentOrderView[]>;
  countSubscriptionPaymentOrders: (input: CountSubscriptionPaymentOrdersInput) => Promise<number>;
```

- [ ] **Step 4: Add status parsing helpers**

In `packages/api/src/subscriptions/routes.ts`, add near validation helpers:

```ts
const invalidSubscriptionPaymentOrderRequestMessage = 'Invalid subscription payment order request';
const subscriptionOrderStatuses = new Set<TSubscriptionOrderStatus>([
  'pending',
  'paid',
  'fulfilling',
  'completed',
  'expired',
  'cancelled',
  'failed',
]);

function getQueryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getAdminOrdersQuery(query: express.Request['query']): {
  limit: number;
  offset: number;
  status?: TSubscriptionOrderStatus;
} {
  const { limit, offset } = parsePagination({
    limit: getQueryString(query.limit),
    offset: getQueryString(query.offset),
  });
  const rawStatus = getQueryString(query.status);

  if (!rawStatus) {
    return { limit, offset };
  }

  if (!subscriptionOrderStatuses.has(rawStatus as TSubscriptionOrderStatus)) {
    throw new Error(invalidSubscriptionPaymentOrderRequestMessage);
  }

  return { limit, offset, status: rawStatus as TSubscriptionOrderStatus };
}

function isInvalidSubscriptionPaymentOrderRequest(error: unknown): boolean {
  return (
    error instanceof Error && error.message === invalidSubscriptionPaymentOrderRequestMessage
  );
}

function handleSubscriptionPaymentOrderRouteError(
  error: unknown,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (isInvalidSubscriptionPaymentOrderRequest(error)) {
    res.status(400).json({ message: invalidSubscriptionPaymentOrderRequestMessage });
    return;
  }

  next(error);
}
```

- [ ] **Step 5: Add serialization**

Add near `serializeOrder`:

```ts
function serializeDate(date: Date | undefined): string | undefined {
  return date ? date.toISOString() : undefined;
}

function serializeAdminOrder(order: SubscriptionAdminPaymentOrderView): TSubscriptionAdminOrder {
  return {
    id: order.id,
    outTradeNo: order.outTradeNo,
    ...(order.tradeNo ? { tradeNo: order.tradeNo } : {}),
    userId: order.userId,
    ...(order.user ? { user: order.user } : {}),
    planKey: order.planKey,
    amount: order.amount,
    paymentType: order.paymentType,
    status: order.status,
    expiresAt: order.expiresAt.toISOString(),
    ...(serializeDate(order.createdAt) ? { createdAt: serializeDate(order.createdAt) } : {}),
    ...(serializeDate(order.updatedAt) ? { updatedAt: serializeDate(order.updatedAt) } : {}),
    ...(serializeDate(order.paidAt) ? { paidAt: serializeDate(order.paidAt) } : {}),
    ...(serializeDate(order.completedAt)
      ? { completedAt: serializeDate(order.completedAt) }
      : {}),
    ...(serializeDate(order.failedAt) ? { failedAt: serializeDate(order.failedAt) } : {}),
    ...(order.failedReason ? { failedReason: order.failedReason } : {}),
  };
}
```

- [ ] **Step 6: Add route**

In `createSubscriptionRouter`, add before `/admin/plans` so admin order paths are grouped:

```ts
  router.get(
    '/admin/orders',
    deps.requireJwtAuth,
    deps.requireAdminAccess,
    async (req, res, next) => {
      try {
        const user = getAuthenticatedUser(req);
        const query = getAdminOrdersQuery(req.query);
        const filter = {
          ...(query.status ? { status: query.status } : {}),
          ...(user.tenantId ? { tenantId: user.tenantId } : {}),
        };
        const [orders, total] = await Promise.all([
          deps.db.listSubscriptionPaymentOrders({
            limit: query.limit,
            offset: query.offset,
            ...filter,
          }),
          deps.db.countSubscriptionPaymentOrders(filter),
        ]);
        const response: TSubscriptionAdminOrdersResponse = {
          orders: orders.map(serializeAdminOrder),
          total,
          limit: query.limit,
          offset: query.offset,
        };
        res.json(response);
      } catch (error) {
        handleSubscriptionPaymentOrderRouteError(error, res, next);
      }
    },
  );
```

- [ ] **Step 7: Run route tests**

Run:

```bash
cd packages/api
npx jest src/subscriptions/routes.spec.ts --runInBand
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/subscriptions/routes.ts packages/api/src/subscriptions/routes.spec.ts
git commit -m "feat: add admin payment order route"
```

---

### Task 4: Admin React Query Hooks

**Files:**
- Create: `client/src/data-provider/Admin/queries.ts`
- Create: `client/src/data-provider/Admin/queries.spec.ts`
- Create: `client/src/data-provider/Admin/index.ts`
- Modify: `client/src/data-provider/index.ts`

- [ ] **Step 1: Write failing hook tests**

Create `client/src/data-provider/Admin/queries.spec.ts`:

```ts
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import {
  useGetAdminUsers,
  useSearchAdminUsers,
  useGetSubscriptionAdminOrders,
} from './queries';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('admin data-provider queries', () => {
  it('uses pagination in the admin users query key and service call', () => {
    const spy = jest.spyOn(dataService, 'getAdminUsers').mockResolvedValue({
      users: [],
      total: 0,
      limit: 25,
      offset: 50,
    });

    renderHook(() => useGetAdminUsers({ limit: 25, offset: 50 }), {
      wrapper: createWrapper(),
    });

    expect(spy).toHaveBeenCalledWith({ limit: 25, offset: 50 });
  });

  it('does not search users when the query is empty', () => {
    const spy = jest.spyOn(dataService, 'searchAdminUsers').mockResolvedValue({
      users: [],
      total: 0,
      capped: false,
    });

    renderHook(() => useSearchAdminUsers({ q: '', limit: 10 }), {
      wrapper: createWrapper(),
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('uses status in the admin payment orders query key and service call', () => {
    const spy = jest.spyOn(dataService, 'getSubscriptionAdminOrders').mockResolvedValue({
      orders: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderHook(
      () => useGetSubscriptionAdminOrders({ limit: 20, offset: 0, status: 'completed' }),
      { wrapper: createWrapper() },
    );

    expect(spy).toHaveBeenCalledWith({ limit: 20, offset: 0, status: 'completed' });
    expect(QueryKeys.subscriptionAdminOrders).toBe('subscriptionAdminOrders');
  });
});
```

- [ ] **Step 2: Run hook tests and verify failure**

Run:

```bash
cd client
npx jest src/data-provider/Admin/queries.spec.ts --runInBand
```

Expected: fail because the admin data-provider folder does not exist.

- [ ] **Step 3: Add hooks**

Create `client/src/data-provider/Admin/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useGetAdminUsers = (
  params: t.TAdminPageParams,
  config?: UseQueryOptions<t.TAdminUsersResponse>,
): QueryObserverResult<t.TAdminUsersResponse> => {
  return useQuery<t.TAdminUsersResponse>(
    [QueryKeys.adminUsers, params.limit ?? null, params.offset ?? null],
    () => dataService.getAdminUsers(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      ...config,
    },
  );
};

export const useSearchAdminUsers = (
  params: t.TAdminUserSearchParams,
  config?: UseQueryOptions<t.TAdminUserSearchResponse>,
): QueryObserverResult<t.TAdminUserSearchResponse> => {
  const query = params.q.trim();
  return useQuery<t.TAdminUserSearchResponse>(
    [QueryKeys.adminUserSearch, query, params.limit ?? null],
    () => dataService.searchAdminUsers({ ...params, q: query }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      ...config,
      enabled: query.length >= 2 && (config?.enabled ?? true),
    },
  );
};

export const useGetSubscriptionAdminOrders = (
  params: t.TSubscriptionAdminOrdersParams,
  config?: UseQueryOptions<t.TSubscriptionAdminOrdersResponse>,
): QueryObserverResult<t.TSubscriptionAdminOrdersResponse> => {
  return useQuery<t.TSubscriptionAdminOrdersResponse>(
    [
      QueryKeys.subscriptionAdminOrders,
      params.limit ?? null,
      params.offset ?? null,
      params.status ?? null,
    ],
    () => dataService.getSubscriptionAdminOrders(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      ...config,
    },
  );
};
```

- [ ] **Step 4: Export hooks**

Create `client/src/data-provider/Admin/index.ts`:

```ts
export * from './queries';
```

In `client/src/data-provider/index.ts`, add:

```ts
export * from './Admin';
```

- [ ] **Step 5: Run hook tests**

Run:

```bash
cd client
npx jest src/data-provider/Admin/queries.spec.ts --runInBand
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/data-provider/Admin/queries.ts client/src/data-provider/Admin/queries.spec.ts client/src/data-provider/Admin/index.ts client/src/data-provider/index.ts
git commit -m "feat: add admin query hooks"
```

---

### Task 5: Admin Center Route and Navigation

**Files:**
- Create: `client/src/components/Admin/PaginationControls.tsx`
- Create: `client/src/components/Admin/AdminShell.tsx`
- Create: `client/src/components/Admin/AccountsPage.tsx`
- Create: `client/src/components/Admin/PaymentsPage.tsx`
- Create: `client/src/components/Admin/index.ts`
- Create: `client/src/components/Admin/AdminShell.spec.tsx`
- Modify: `client/src/routes/Dashboard.tsx`
- Modify: `client/src/components/Nav/AccountSettings.tsx`
- Modify: `client/src/locales/en/translation.json`

- [ ] **Step 1: Write failing route shell tests**

Create `client/src/components/Admin/AdminShell.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import AdminShell from './AdminShell';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useGetAdminUsers: () => ({
    data: { users: [], total: 0, limit: 20, offset: 0 },
    isLoading: false,
    isError: false,
  }),
  useSearchAdminUsers: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
  useGetSubscriptionAdminOrders: () => ({
    data: { orders: [], total: 0, limit: 20, offset: 0 },
    isLoading: false,
    isError: false,
  }),
}));

const { useAuthContext } = jest.requireMock('~/hooks') as {
  useAuthContext: jest.Mock;
};

describe('AdminShell', () => {
  it('blocks non-admin users', () => {
    useAuthContext.mockReturnValue({ user: { role: SystemRoles.USER } });

    render(
      <MemoryRouter initialEntries={['/d/admin/accounts']}>
        <AdminShell />
      </MemoryRouter>,
    );

    expect(screen.getByText('com_admin_access_denied')).toBeInTheDocument();
  });

  it('renders account management for admin users', () => {
    useAuthContext.mockReturnValue({ user: { role: SystemRoles.ADMIN } });

    render(
      <MemoryRouter initialEntries={['/d/admin/accounts']}>
        <AdminShell />
      </MemoryRouter>,
    );

    expect(screen.getByText('com_admin_accounts_title')).toBeInTheDocument();
    expect(screen.getByText('com_admin_accounts_empty')).toBeInTheDocument();
  });

  it('renders payment management for admin users', () => {
    useAuthContext.mockReturnValue({ user: { role: SystemRoles.ADMIN } });

    render(
      <MemoryRouter initialEntries={['/d/admin/payments']}>
        <AdminShell />
      </MemoryRouter>,
    );

    expect(screen.getByText('com_admin_payments_title')).toBeInTheDocument();
    expect(screen.getByText('com_admin_payments_empty')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd client
npx jest src/components/Admin/AdminShell.spec.tsx --runInBand
```

Expected: fail because `AdminShell` does not exist.

- [ ] **Step 3: Add pagination controls**

Create `client/src/components/Admin/PaginationControls.tsx`:

```tsx
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocalize } from '~/hooks';

type PaginationControlsProps = {
  total: number;
  limit: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
};

function PaginationControls({ total, limit, offset, onOffsetChange }: PaginationControlsProps) {
  const localize = useLocalize();
  const canPrevious = offset > 0;
  const nextOffset = offset + limit;
  const canNext = nextOffset < total;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);

  return (
    <div className="flex min-h-10 items-center justify-between gap-3 text-sm text-text-secondary">
      <span>
        {localize('com_admin_pagination_range', {
          start,
          end,
          total,
        })}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={localize('com_admin_pagination_previous')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-light hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canPrevious}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={localize('com_admin_pagination_next')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-light hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canNext}
          onClick={() => onOffsetChange(nextOffset)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default React.memo(PaginationControls);
```

- [ ] **Step 4: Add accounts page**

Create `client/src/components/Admin/AccountsPage.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type t from 'librechat-data-provider';
import { useGetAdminUsers, useSearchAdminUsers } from '~/data-provider';
import { useLocalize } from '~/hooks';
import PaginationControls from './PaginationControls';

const pageSize = 20;

function getDisplayDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : '';
}

function AccountsPage() {
  const localize = useLocalize();
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const trimmedSearch = search.trim();
  const listQuery = useGetAdminUsers({ limit: pageSize, offset }, { enabled: trimmedSearch.length < 2 });
  const searchQuery = useSearchAdminUsers({ q: trimmedSearch, limit: pageSize });
  const isSearching = trimmedSearch.length >= 2;
  const users = useMemo<t.TAdminUserListItem[]>(() => {
    if (!isSearching) {
      return listQuery.data?.users ?? [];
    }

    return (searchQuery.data?.users ?? []).map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username ?? '',
      email: user.email,
      avatar: user.avatarUrl ?? '',
      role: '',
      provider: '',
    }));
  }, [isSearching, listQuery.data?.users, searchQuery.data?.users]);
  const total = isSearching ? searchQuery.data?.total ?? users.length : listQuery.data?.total ?? 0;
  const isLoading = isSearching ? searchQuery.isLoading : listQuery.isLoading;
  const isError = isSearching ? searchQuery.isError : listQuery.isError;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">
            {localize('com_admin_accounts_title')}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {localize('com_admin_accounts_description')}
          </p>
        </div>
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">{localize('com_admin_accounts_search')}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
            aria-hidden="true"
          />
          <input
            className="h-10 w-full rounded-md border border-border-light bg-transparent pl-9 pr-3 text-sm outline-none focus:border-border-heavy"
            value={search}
            placeholder={localize('com_admin_accounts_search')}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
          />
        </label>
      </div>

      {isError && (
        <div className="rounded-md border border-red-500/40 p-3 text-sm text-red-600" role="alert">
          {localize('com_admin_accounts_error')}
        </div>
      )}

      <div className="min-h-0 overflow-auto rounded-lg border border-border-light">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-surface-secondary text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">{localize('com_admin_accounts_user')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_accounts_email')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_accounts_role')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_accounts_provider')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_accounts_created')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_accounts_updated')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-3 py-6 text-center text-text-secondary" colSpan={6}>
                  {localize('com_admin_loading')}
                </td>
              </tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-text-secondary" colSpan={6}>
                  {localize('com_admin_accounts_empty')}
                </td>
              </tr>
            )}
            {!isLoading &&
              users.map((user) => (
                <tr key={user.id} className="border-t border-border-light">
                  <td className="px-3 py-3">
                    <div className="font-medium text-text-primary">{user.name || user.username}</div>
                    <div className="text-xs text-text-secondary">{user.username}</div>
                  </td>
                  <td className="px-3 py-3 text-text-primary">{user.email}</td>
                  <td className="px-3 py-3 text-text-secondary">{user.role}</td>
                  <td className="px-3 py-3 text-text-secondary">{user.provider}</td>
                  <td className="px-3 py-3 text-text-secondary">{getDisplayDate(user.createdAt)}</td>
                  <td className="px-3 py-3 text-text-secondary">{getDisplayDate(user.updatedAt)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!isSearching && (
        <PaginationControls
          total={total}
          limit={pageSize}
          offset={offset}
          onOffsetChange={setOffset}
        />
      )}
    </section>
  );
}

export default React.memo(AccountsPage);
```

- [ ] **Step 5: Add payments page**

Create `client/src/components/Admin/PaymentsPage.tsx`:

```tsx
import React, { useState } from 'react';
import type t from 'librechat-data-provider';
import { useGetSubscriptionAdminOrders } from '~/data-provider';
import { useLocalize } from '~/hooks';
import PaginationControls from './PaginationControls';

const pageSize = 20;
const statuses: Array<t.TSubscriptionOrderStatus | ''> = [
  '',
  'pending',
  'paid',
  'fulfilling',
  'completed',
  'expired',
  'cancelled',
  'failed',
];

function getDisplayDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : '';
}

function getPaymentLabel(paymentType: 'alipay' | 'wxpay'): string {
  return paymentType === 'alipay' ? 'com_nav_subscription_alipay' : 'com_nav_subscription_wxpay';
}

function PaymentsPage() {
  const localize = useLocalize();
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<t.TSubscriptionOrderStatus | ''>('');
  const ordersQuery = useGetSubscriptionAdminOrders({
    limit: pageSize,
    offset,
    ...(status ? { status } : {}),
  });
  const orders = ordersQuery.data?.orders ?? [];
  const total = ordersQuery.data?.total ?? 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">
            {localize('com_admin_payments_title')}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {localize('com_admin_payments_description')}
          </p>
        </div>
        <label className="space-y-1 text-xs font-medium text-text-secondary">
          <span>{localize('com_admin_payments_status')}</span>
          <select
            className="h-10 rounded-md border border-border-light bg-surface-primary px-3 text-sm text-text-primary"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as t.TSubscriptionOrderStatus | '');
              setOffset(0);
            }}
          >
            {statuses.map((item) => (
              <option key={item || 'all'} value={item}>
                {localize(item ? `com_admin_payment_status_${item}` : 'com_admin_payments_all')}
              </option>
            ))}
          </select>
        </label>
      </div>

      {ordersQuery.isError && (
        <div className="rounded-md border border-red-500/40 p-3 text-sm text-red-600" role="alert">
          {localize('com_admin_payments_error')}
        </div>
      )}

      <div className="min-h-0 overflow-auto rounded-lg border border-border-light">
        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-surface-secondary text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_order')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_user')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_plan')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_amount')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_method')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_status')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_created')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_completed')}</th>
            </tr>
          </thead>
          <tbody>
            {ordersQuery.isLoading && (
              <tr>
                <td className="px-3 py-6 text-center text-text-secondary" colSpan={8}>
                  {localize('com_admin_loading')}
                </td>
              </tr>
            )}
            {!ordersQuery.isLoading && orders.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-text-secondary" colSpan={8}>
                  {localize('com_admin_payments_empty')}
                </td>
              </tr>
            )}
            {!ordersQuery.isLoading &&
              orders.map((order) => (
                <tr key={order.id} className="border-t border-border-light">
                  <td className="px-3 py-3">
                    <div className="font-medium text-text-primary">{order.outTradeNo}</div>
                    <div className="text-xs text-text-secondary">{order.tradeNo}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-text-primary">
                      {order.user?.email ?? order.userId}
                    </div>
                    <div className="text-xs text-text-secondary">{order.user?.name}</div>
                  </td>
                  <td className="px-3 py-3 text-text-secondary">{order.planKey}</td>
                  <td className="px-3 py-3 text-text-primary">
                    {new Intl.NumberFormat(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(order.amount)}
                  </td>
                  <td className="px-3 py-3 text-text-secondary">
                    {localize(getPaymentLabel(order.paymentType))}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs font-medium text-text-primary">
                      {localize(`com_admin_payment_status_${order.status}`)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-text-secondary">{getDisplayDate(order.createdAt)}</td>
                  <td className="px-3 py-3 text-text-secondary">
                    {getDisplayDate(order.completedAt)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <PaginationControls
        total={total}
        limit={pageSize}
        offset={offset}
        onOffsetChange={setOffset}
      />
    </section>
  );
}

export default React.memo(PaymentsPage);
```

- [ ] **Step 6: Add admin shell**

Create `client/src/components/Admin/AdminShell.tsx`:

```tsx
import React from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { CreditCard, Users } from 'lucide-react';
import { SystemRoles } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { cn } from '~/utils';
import AccountsPage from './AccountsPage';
import PaymentsPage from './PaymentsPage';

function AdminShell() {
  const localize = useLocalize();
  const { user } = useAuthContext();

  if (user?.role !== SystemRoles.ADMIN) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-text-primary">
        <div className="max-w-md rounded-lg border border-border-light p-5 text-center">
          <h1 className="text-lg font-semibold">{localize('com_admin_access_denied')}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {localize('com_admin_access_denied_description')}
          </p>
        </div>
      </main>
    );
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'inline-flex min-h-9 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
      isActive
        ? 'bg-surface-tertiary text-text-primary'
        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
    );

  return (
    <main className="flex min-h-screen flex-col bg-background text-text-primary">
      <header className="border-b border-border-light px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-semibold">{localize('com_admin_title')}</h1>
          <nav className="flex flex-wrap gap-1" aria-label={localize('com_admin_title')}>
            <NavLink to="/d/admin/accounts" className={linkClass}>
              <Users className="h-4 w-4" aria-hidden="true" />
              {localize('com_admin_accounts_nav')}
            </NavLink>
            <NavLink to="/d/admin/payments" className={linkClass}>
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              {localize('com_admin_payments_nav')}
            </NavLink>
          </nav>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 p-4 sm:p-6">
        <Routes>
          <Route index element={<Navigate to="accounts" replace />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="*" element={<Navigate to="accounts" replace />} />
        </Routes>
      </div>
    </main>
  );
}

export default React.memo(AdminShell);
```

Create `client/src/components/Admin/index.ts`:

```ts
export { default as AdminShell } from './AdminShell';
```

- [ ] **Step 7: Add dashboard route**

In `client/src/routes/Dashboard.tsx`, add import:

```ts
import { AdminShell } from '~/components/Admin';
```

Add child route before the wildcard route:

```tsx
    {
      path: 'admin/*',
      element: <AdminShell />,
    },
```

- [ ] **Step 8: Add account menu entry**

In `client/src/components/Nav/AccountSettings.tsx`, update imports:

```ts
import { useNavigate } from 'react-router-dom';
import { FileText, LogOut, ShieldCheck } from 'lucide-react';
import { SystemRoles } from 'librechat-data-provider';
```

Inside `AccountSettings`, add:

```ts
  const navigate = useNavigate();
  const isAdmin = user?.role === SystemRoles.ADMIN;
```

Add a menu item before Settings:

```tsx
        {isAdmin && (
          <Menu.MenuItem
            onClick={() => navigate('/d/admin/accounts')}
            className="select-item text-sm"
          >
            <ShieldCheck className="icon-md" aria-hidden="true" />
            {localize('com_admin_title')}
          </Menu.MenuItem>
        )}
```

- [ ] **Step 9: Add localization keys**

In `client/src/locales/en/translation.json`, add keys near existing admin keys:

```json
  "com_admin_access_denied": "Admin access required",
  "com_admin_access_denied_description": "Only administrators can view account and payment management.",
  "com_admin_accounts_created": "Created",
  "com_admin_accounts_description": "Review user accounts, roles, providers, and account timestamps.",
  "com_admin_accounts_email": "Email",
  "com_admin_accounts_empty": "No accounts found.",
  "com_admin_accounts_error": "Account list failed to load.",
  "com_admin_accounts_nav": "Accounts",
  "com_admin_accounts_provider": "Provider",
  "com_admin_accounts_role": "Role",
  "com_admin_accounts_search": "Search accounts",
  "com_admin_accounts_title": "Account Management",
  "com_admin_accounts_updated": "Updated",
  "com_admin_accounts_user": "User",
  "com_admin_loading": "Loading...",
  "com_admin_pagination_next": "Next page",
  "com_admin_pagination_previous": "Previous page",
  "com_admin_pagination_range": "{{start}}-{{end}} of {{total}}",
  "com_admin_payment_status_cancelled": "Cancelled",
  "com_admin_payment_status_completed": "Completed",
  "com_admin_payment_status_expired": "Expired",
  "com_admin_payment_status_failed": "Failed",
  "com_admin_payment_status_fulfilling": "Fulfilling",
  "com_admin_payment_status_paid": "Paid",
  "com_admin_payment_status_pending": "Pending",
  "com_admin_payments_all": "All statuses",
  "com_admin_payments_amount": "Amount",
  "com_admin_payments_completed": "Completed",
  "com_admin_payments_created": "Created",
  "com_admin_payments_description": "Review subscription payment orders and fulfillment status.",
  "com_admin_payments_empty": "No payment orders found.",
  "com_admin_payments_error": "Payment list failed to load.",
  "com_admin_payments_method": "Method",
  "com_admin_payments_nav": "Payments",
  "com_admin_payments_order": "Order",
  "com_admin_payments_plan": "Plan",
  "com_admin_payments_status": "Status",
  "com_admin_payments_title": "Payment Management",
  "com_admin_payments_user": "User",
  "com_admin_title": "Admin Center",
```

- [ ] **Step 10: Run frontend tests**

Run:

```bash
cd client
npx jest src/components/Admin/AdminShell.spec.tsx --runInBand
```

Expected: pass.

- [ ] **Step 11: Commit**

```bash
git add client/src/components/Admin client/src/routes/Dashboard.tsx client/src/components/Nav/AccountSettings.tsx client/src/locales/en/translation.json
git commit -m "feat: add admin center UI"
```

---

### Task 6: Final Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run backend subscription tests**

```bash
cd packages/data-schemas
npx jest src/methods/subscription.spec.ts --runInBand
cd ../api
npx jest src/subscriptions/routes.spec.ts --runInBand
```

Expected: both test suites pass.

- [ ] **Step 2: Run data-provider tests and build**

```bash
cd packages/data-provider
npx jest specs/admin-api-contract.spec.ts specs/subscription-api-contract.spec.ts --runInBand
cd ../..
npm run build:data-provider
```

Expected: contract tests pass and `build:data-provider` completes without TypeScript errors.

- [ ] **Step 3: Run frontend admin tests**

```bash
cd client
npx jest src/data-provider/Admin/queries.spec.ts src/components/Admin/AdminShell.spec.tsx --runInBand
```

Expected: frontend hook and route shell tests pass.

- [ ] **Step 4: Run focused lint or type check available in the repo**

Run the existing project command that covers the touched client TypeScript files:

```bash
npm run frontend
```

Expected: frontend build completes without TypeScript or lint errors.

- [ ] **Step 5: Inspect git status**

```bash
git status --short
```

Expected: only intentionally untracked user files remain outside this feature.

- [ ] **Step 6: Final commit if verification changed generated files**

If verification changes tracked generated files, commit only files changed by this feature:

```bash
git add packages/data-provider client/src/data-provider client/src/components/Admin client/src/routes/Dashboard.tsx client/src/components/Nav/AccountSettings.tsx client/src/locales/en/translation.json packages/data-schemas/src/methods/subscription.ts packages/data-schemas/src/methods/subscription.spec.ts packages/api/src/subscriptions/routes.ts packages/api/src/subscriptions/routes.spec.ts
git commit -m "chore: verify admin account payment management"
```

Expected: commit is created only when verification produced feature-owned tracked changes.

---

## Self-Review

- Spec coverage: account management is read-only and reuses existing admin user endpoints; payment
  management is a read-only list; routes are admin-only; frontend uses localized strings.
- Sensitive data: payment list omits `rawNotify`, `payUrl`, and `qrCode`.
- Tenant scope: data methods and route pass `tenantId` from the authenticated admin.
- Testing: backend, data-provider, frontend hooks, route shell, and final verification commands are
  included.
