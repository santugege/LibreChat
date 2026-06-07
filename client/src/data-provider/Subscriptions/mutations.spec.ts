import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import {
  useCreateSubscriptionAdminPlan,
  useCreateSubscriptionOrder,
  useCreateSubscriptionRedemptionBatch,
  useDeleteSubscriptionAdminPlan,
  useDisableSubscriptionRedemptionCode,
  useRedeemSubscriptionCode,
  useUpdateSubscriptionAdminPlan,
} from './mutations';

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('librechat-data-provider', () => ({
  QueryKeys: {
    subscriptionPlans: 'subscriptionPlans',
    subscriptionStatus: 'subscriptionStatus',
    subscriptionOrder: 'subscriptionOrder',
    subscriptionAdminPlans: 'subscriptionAdminPlans',
    subscriptionAdminRedemptionBatches: 'subscriptionAdminRedemptionBatches',
    subscriptionAdminRedemptionCodes: 'subscriptionAdminRedemptionCodes',
  },
  dataService: {
    createSubscriptionOrder: jest.fn(),
    createSubscriptionAdminPlan: jest.fn(),
    updateSubscriptionAdminPlan: jest.fn(),
    deleteSubscriptionAdminPlan: jest.fn(),
    redeemSubscriptionCode: jest.fn(),
    createSubscriptionRedemptionBatch: jest.fn(),
    disableSubscriptionRedemptionCode: jest.fn(),
  },
}));

const mockUseMutation = useMutation as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.Mock;
const adminPlanPayload = {
  key: 'team',
  name: 'Team',
  price: 99,
  durationDays: 30,
  textDailyLimit: 1000,
  imageDailyLimit: 100,
  enabled: true,
  sortOrder: 20,
};

describe('subscription mutations', () => {
  const invalidateQueries = jest.fn();

  beforeEach(() => {
    mockUseQueryClient.mockReturnValue({ invalidateQueries });
    mockUseMutation.mockReturnValue({ mutate: jest.fn() });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('creates a subscription order and invalidates subscription queries', () => {
    useCreateSubscriptionOrder();

    expect(mockUseMutation).toHaveBeenCalledWith(expect.any(Function), expect.any(Object));

    const mutationFn = mockUseMutation.mock.calls[0][0];
    mutationFn({ planKey: 'pro_monthly', paymentType: 'alipay' });
    expect(dataService.createSubscriptionOrder).toHaveBeenCalledWith({
      planKey: 'pro_monthly',
      paymentType: 'alipay',
    });

    const options = mockUseMutation.mock.calls[0][1];
    options.onSuccess({ orderId: 'order-1' });

    expect(invalidateQueries).toHaveBeenCalledWith([QueryKeys.subscriptionStatus]);
    expect(invalidateQueries).toHaveBeenCalledWith([QueryKeys.subscriptionOrder, 'order-1']);
  });

  it('creates an admin subscription plan and invalidates plan queries', () => {
    useCreateSubscriptionAdminPlan();

    const mutationFn = mockUseMutation.mock.calls[0][0];
    mutationFn(adminPlanPayload);
    expect(dataService.createSubscriptionAdminPlan).toHaveBeenCalledWith(adminPlanPayload);

    const options = mockUseMutation.mock.calls[0][1];
    options.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.subscriptionAdminPlans],
      refetchType: 'all',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.subscriptionPlans],
      refetchType: 'all',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.subscriptionStatus],
      refetchType: 'all',
    });
  });

  it('updates an admin subscription plan and invalidates plan queries', () => {
    useUpdateSubscriptionAdminPlan();

    const mutationFn = mockUseMutation.mock.calls[0][0];
    mutationFn({ planKey: 'team', payload: { enabled: false } });
    expect(dataService.updateSubscriptionAdminPlan).toHaveBeenCalledWith('team', {
      enabled: false,
    });

    const options = mockUseMutation.mock.calls[0][1];
    options.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.subscriptionAdminPlans],
      refetchType: 'all',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.subscriptionPlans],
      refetchType: 'all',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.subscriptionStatus],
      refetchType: 'all',
    });
  });

  it('deletes an admin subscription plan and invalidates plan queries', () => {
    useDeleteSubscriptionAdminPlan();

    const mutationFn = mockUseMutation.mock.calls[0][0];
    mutationFn('team');
    expect(dataService.deleteSubscriptionAdminPlan).toHaveBeenCalledWith('team');

    const options = mockUseMutation.mock.calls[0][1];
    options.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.subscriptionAdminPlans],
      refetchType: 'all',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.subscriptionPlans],
      refetchType: 'all',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.subscriptionStatus],
      refetchType: 'all',
    });
  });

  it('redeems a subscription code and invalidates subscription status', () => {
    useRedeemSubscriptionCode();

    const mutationFn = mockUseMutation.mock.calls[0][0];
    mutationFn({ code: 'LC-ABCD-EFGH-JKLM-NPQR' });
    expect(dataService.redeemSubscriptionCode).toHaveBeenCalledWith({
      code: 'LC-ABCD-EFGH-JKLM-NPQR',
    });

    const options = mockUseMutation.mock.calls[0][1];
    options.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith([QueryKeys.subscriptionStatus]);
    expect(invalidateQueries).toHaveBeenCalledWith([QueryKeys.subscriptionPlans]);
    expect(invalidateQueries).toHaveBeenCalledWith([QueryKeys.balance]);
  });

  it('creates subscription redemption batches and invalidates redemption admin queries', () => {
    useCreateSubscriptionRedemptionBatch();

    const payload = {
      name: 'Taobao',
      quantity: 1,
      durationDays: 30,
      textDailyLimit: 1000,
      imageDailyLimit: 20,
    };
    const mutationFn = mockUseMutation.mock.calls[0][0];
    mutationFn(payload);
    expect(dataService.createSubscriptionRedemptionBatch).toHaveBeenCalledWith(payload);

    const options = mockUseMutation.mock.calls[0][1];
    options.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.subscriptionAdminRedemptionBatches],
      refetchType: 'all',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.subscriptionAdminRedemptionCodes],
      refetchType: 'all',
    });
  });

  it('disables subscription redemption codes and invalidates redemption admin queries', () => {
    useDisableSubscriptionRedemptionCode();

    const mutationFn = mockUseMutation.mock.calls[0][0];
    mutationFn({ codeId: 'code-1', reason: 'refund' });
    expect(dataService.disableSubscriptionRedemptionCode).toHaveBeenCalledWith('code-1', {
      reason: 'refund',
    });

    const options = mockUseMutation.mock.calls[0][1];
    options.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.subscriptionAdminRedemptionBatches],
      refetchType: 'all',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.subscriptionAdminRedemptionCodes],
      refetchType: 'all',
    });
  });
});
