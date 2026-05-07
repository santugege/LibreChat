/**
 * @jest-environment jsdom
 */
import { adminUsers, adminUserSearch, subscriptionAdminOrders } from '../src/api-endpoints';
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
