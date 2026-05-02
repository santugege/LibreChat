/**
 * @jest-environment jsdom
 */
import {
  subscriptionOrder,
  subscriptionOrders,
  subscriptionPlans,
  subscriptionStatus,
  subscriptions,
} from '../src/api-endpoints';
import {
  createSubscriptionOrder,
  getSubscriptionOrder,
  getSubscriptionPlans,
  getSubscriptionStatus,
} from '../src/data-service';
import { QueryKeys } from '../src/keys';
import request from '../src/request';
import type * as t from '../src/types';

describe('subscription API contract', () => {
  it('builds subscription endpoint URLs', () => {
    expect(subscriptions()).toBe('/api/subscriptions');
    expect(subscriptionPlans()).toBe('/api/subscriptions/plans');
    expect(subscriptionStatus()).toBe('/api/subscriptions/me');
    expect(subscriptionOrders()).toBe('/api/subscriptions/orders');
    expect(subscriptionOrder('order/id with spaces')).toBe(
      '/api/subscriptions/orders/order%2Fid%20with%20spaces',
    );
  });

  it('defines subscription query keys', () => {
    expect(QueryKeys.subscriptionPlans).toBe('subscriptionPlans');
    expect(QueryKeys.subscriptionStatus).toBe('subscriptionStatus');
    expect(QueryKeys.subscriptionOrder).toBe('subscriptionOrder');
  });

  it('accepts subscription status without an active subscription', () => {
    const status: t.TSubscriptionStatus = {
      plan: {
        key: 'free',
        name: 'Free',
        price: 0,
        durationDays: 0,
        textDailyLimit: 20,
        imageDailyLimit: 0,
        enabled: true,
        sortOrder: 0,
      },
      subscription: null,
      usage: {
        windowKey: '2026-05-02',
        resetAt: '2026-05-03T00:00:00.000Z',
        text: { used: 0, limit: 20 },
        image: { used: 0, limit: 0 },
      },
    };

    expect(status.subscription).toBeNull();
  });

  it('delegates subscription data-service calls to request', async () => {
    const plan: t.TSubscriptionPlan = {
      key: 'pro',
      name: 'Pro',
      description: 'More daily usage',
      price: 1999,
      durationDays: 30,
      textDailyLimit: 1000,
      imageDailyLimit: 100,
      enabled: true,
      sortOrder: 1,
    };
    const status: t.TSubscriptionStatus = {
      plan,
      subscription: {
        planKey: 'pro',
        status: 'active',
        startsAt: '2026-05-01T00:00:00.000Z',
        expiresAt: '2026-05-31T00:00:00.000Z',
      },
      usage: {
        windowKey: '2026-05-02',
        resetAt: '2026-05-03T00:00:00.000Z',
        text: { used: 12, limit: 1000 },
        image: { used: 2, limit: 100 },
      },
    };
    const payload: t.TCreateSubscriptionOrderRequest = {
      planKey: 'pro',
      paymentType: 'alipay',
      isMobile: true,
    };
    const createdOrder: t.TCreateSubscriptionOrderResponse = {
      orderId: 'order-1',
      outTradeNo: 'trade-1',
      status: 'pending',
      payUrl: 'https://pay.example/order-1',
      expiresAt: '2026-05-02T12:00:00.000Z',
    };
    const order: t.TSubscriptionOrder = {
      ...createdOrder,
      planKey: 'pro',
      amount: 1999,
    };

    const getSpy = jest.spyOn(request, 'get');
    getSpy.mockResolvedValueOnce([plan]);
    getSpy.mockResolvedValueOnce(status);
    getSpy.mockResolvedValueOnce(order);
    const postSpy = jest.spyOn(request, 'post').mockResolvedValueOnce(createdOrder);

    await expect(getSubscriptionPlans()).resolves.toEqual([plan]);
    await expect(getSubscriptionStatus()).resolves.toEqual(status);
    await expect(createSubscriptionOrder(payload)).resolves.toEqual(createdOrder);
    await expect(getSubscriptionOrder('order/id with spaces')).resolves.toEqual(order);

    expect(getSpy).toHaveBeenNthCalledWith(1, '/api/subscriptions/plans');
    expect(getSpy).toHaveBeenNthCalledWith(2, '/api/subscriptions/me');
    expect(getSpy).toHaveBeenNthCalledWith(
      3,
      '/api/subscriptions/orders/order%2Fid%20with%20spaces',
    );
    expect(postSpy).toHaveBeenCalledWith('/api/subscriptions/orders', payload);
  });
});
