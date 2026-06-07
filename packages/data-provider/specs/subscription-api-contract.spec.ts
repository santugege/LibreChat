/**
 * @jest-environment jsdom
 */
import {
  subscriptionAdminPlan,
  subscriptionAdminPlans,
  subscriptionAdminRedemptionBatches,
  subscriptionAdminRedemptionCode,
  subscriptionAdminRedemptionCodes,
  subscriptionOrder,
  subscriptionOrders,
  subscriptionPlans,
  subscriptionRedeem,
  subscriptionStatus,
  subscriptions,
} from '../src/api-endpoints';
import {
  createSubscriptionRedemptionBatch,
  createSubscriptionAdminPlan,
  createSubscriptionOrder,
  deleteSubscriptionAdminPlan,
  disableSubscriptionRedemptionCode,
  getSubscriptionAdminRedemptionBatches,
  getSubscriptionAdminRedemptionCodes,
  getSubscriptionAdminPlans,
  getSubscriptionOrder,
  getSubscriptionPlans,
  getSubscriptionStatus,
  redeemSubscriptionCode,
  updateSubscriptionAdminPlan,
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
    expect(subscriptionRedeem()).toBe('/api/subscriptions/redeem');
    expect(subscriptionAdminPlans()).toBe('/api/subscriptions/admin/plans');
    expect(subscriptionAdminPlan('free plan')).toBe('/api/subscriptions/admin/plans/free%20plan');
    expect(subscriptionAdminRedemptionBatches()).toBe(
      '/api/subscriptions/admin/redemption-batches',
    );
    expect(subscriptionAdminRedemptionBatches({ limit: 20, offset: 40 })).toBe(
      '/api/subscriptions/admin/redemption-batches?limit=20&offset=40',
    );
    expect(subscriptionAdminRedemptionCodes({ limit: 20, offset: 40, status: 'active' })).toBe(
      '/api/subscriptions/admin/redemption-codes?limit=20&offset=40&status=active',
    );
    expect(subscriptionAdminRedemptionCode('code/id with spaces')).toBe(
      '/api/subscriptions/admin/redemption-codes/code%2Fid%20with%20spaces',
    );
    expect(subscriptionOrder('order/id with spaces')).toBe(
      '/api/subscriptions/orders/order%2Fid%20with%20spaces',
    );
  });

  it('defines subscription query keys', () => {
    expect(QueryKeys.subscriptionPlans).toBe('subscriptionPlans');
    expect(QueryKeys.subscriptionStatus).toBe('subscriptionStatus');
    expect(QueryKeys.subscriptionOrder).toBe('subscriptionOrder');
    expect(QueryKeys.subscriptionAdminPlans).toBe('subscriptionAdminPlans');
    expect(QueryKeys.subscriptionAdminRedemptionBatches).toBe(
      'subscriptionAdminRedemptionBatches',
    );
    expect(QueryKeys.subscriptionAdminRedemptionCodes).toBe('subscriptionAdminRedemptionCodes');
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
    const redeemPayload: t.TRedeemSubscriptionCodeRequest = {
      code: 'LC-ABCD-EFGH-JKLM-NPQR',
    };
    const redemptionBatchPayload: t.TCreateSubscriptionRedemptionBatchRequest = {
      name: 'Taobao',
      quantity: 1,
      durationDays: 30,
      textDailyLimit: 1000,
      imageDailyLimit: 20,
    };
    const redemptionBatchResponse: t.TCreateSubscriptionRedemptionBatchResponse = {
      batch: {
        id: 'batch-1',
        name: 'Taobao',
        quantity: 1,
        durationDays: 30,
        textDailyLimit: 1000,
        imageDailyLimit: 20,
        planKey: 'redeem-30d',
        planName: 'Taobao',
      },
      codes: [{ code: 'LC-ABCD-EFGH-JKLM-NPQR', prefix: 'LC-ABCD' }],
    };
    const redemptionBatchesResponse: t.TSubscriptionAdminRedemptionBatchesResponse = {
      batches: [redemptionBatchResponse.batch],
      total: 1,
      limit: 20,
      offset: 0,
    };
    const redemptionCodesResponse: t.TSubscriptionAdminRedemptionCodesResponse = {
      codes: [
        {
          id: 'code-1',
          batchId: 'batch-1',
          codePrefix: 'LC-ABCD',
          status: 'active',
          durationDays: 30,
          textDailyLimit: 1000,
          imageDailyLimit: 20,
          planKey: 'redeem-30d',
          planName: 'Taobao',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
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
    getSpy.mockResolvedValueOnce([createPlanPayload]);
    getSpy.mockResolvedValueOnce(redemptionBatchesResponse);
    getSpy.mockResolvedValueOnce(redemptionCodesResponse);
    const postSpy = jest.spyOn(request, 'post');
    postSpy.mockResolvedValueOnce(createdOrder);
    postSpy.mockResolvedValueOnce(createPlanPayload);
    postSpy.mockResolvedValueOnce({
      subscription: status.subscription!,
      plan,
    });
    postSpy.mockResolvedValueOnce(redemptionBatchResponse);
    const patchSpy = jest.spyOn(request, 'patch').mockResolvedValueOnce({
      ...createPlanPayload,
      ...updatePlanPayload,
    });
    patchSpy.mockResolvedValueOnce({ ...redemptionCodesResponse.codes[0], status: 'disabled' });
    const deleteSpy = jest.spyOn(request, 'delete').mockResolvedValueOnce(createPlanPayload);

    await expect(getSubscriptionPlans()).resolves.toEqual([plan]);
    await expect(getSubscriptionStatus()).resolves.toEqual(status);
    await expect(createSubscriptionOrder(payload)).resolves.toEqual(createdOrder);
    await expect(getSubscriptionOrder('order/id with spaces')).resolves.toEqual(order);
    await expect(getSubscriptionAdminPlans()).resolves.toEqual([createPlanPayload]);
    await expect(
      getSubscriptionAdminRedemptionBatches({ limit: 20, offset: 0 }),
    ).resolves.toEqual(redemptionBatchesResponse);
    await expect(getSubscriptionAdminRedemptionCodes({ limit: 20, offset: 0 })).resolves.toEqual(
      redemptionCodesResponse,
    );
    await expect(createSubscriptionAdminPlan(createPlanPayload)).resolves.toEqual(createPlanPayload);
    await expect(redeemSubscriptionCode(redeemPayload)).resolves.toEqual({
      subscription: status.subscription!,
      plan,
    });
    await expect(createSubscriptionRedemptionBatch(redemptionBatchPayload)).resolves.toEqual(
      redemptionBatchResponse,
    );
    await expect(updateSubscriptionAdminPlan('free plan', updatePlanPayload)).resolves.toEqual({
      ...createPlanPayload,
      ...updatePlanPayload,
    });
    await expect(disableSubscriptionRedemptionCode('code-1', { reason: 'refund' })).resolves.toEqual(
      { ...redemptionCodesResponse.codes[0], status: 'disabled' },
    );
    await expect(deleteSubscriptionAdminPlan('free plan')).resolves.toEqual(createPlanPayload);

    expect(getSpy).toHaveBeenNthCalledWith(1, '/api/subscriptions/plans');
    expect(getSpy).toHaveBeenNthCalledWith(2, '/api/subscriptions/me');
    expect(getSpy).toHaveBeenNthCalledWith(
      3,
      '/api/subscriptions/orders/order%2Fid%20with%20spaces',
    );
    expect(getSpy).toHaveBeenNthCalledWith(4, '/api/subscriptions/admin/plans');
    expect(getSpy).toHaveBeenNthCalledWith(
      5,
      '/api/subscriptions/admin/redemption-batches?limit=20&offset=0',
    );
    expect(getSpy).toHaveBeenNthCalledWith(
      6,
      '/api/subscriptions/admin/redemption-codes?limit=20&offset=0',
    );
    expect(postSpy).toHaveBeenNthCalledWith(1, '/api/subscriptions/orders', payload);
    expect(postSpy).toHaveBeenNthCalledWith(
      2,
      '/api/subscriptions/admin/plans',
      createPlanPayload,
    );
    expect(postSpy).toHaveBeenNthCalledWith(3, '/api/subscriptions/redeem', redeemPayload);
    expect(postSpy).toHaveBeenNthCalledWith(
      4,
      '/api/subscriptions/admin/redemption-batches',
      redemptionBatchPayload,
    );
    expect(patchSpy).toHaveBeenCalledWith(
      '/api/subscriptions/admin/plans/free%20plan',
      updatePlanPayload,
    );
    expect(patchSpy).toHaveBeenCalledWith('/api/subscriptions/admin/redemption-codes/code-1', {
      reason: 'refund',
    });
    expect(deleteSpy).toHaveBeenCalledWith('/api/subscriptions/admin/plans/free%20plan');
  });
});
