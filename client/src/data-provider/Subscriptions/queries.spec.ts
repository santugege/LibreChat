import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import {
  useGetSubscriptionAdminPlans,
  useGetSubscriptionAdminRedemptionBatches,
  useGetSubscriptionAdminRedemptionCodes,
  useGetSubscriptionOrder,
  useGetSubscriptionPlans,
  useGetSubscriptionStatus,
} from './queries';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
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
    getSubscriptionPlans: jest.fn(),
    getSubscriptionStatus: jest.fn(),
    getSubscriptionOrder: jest.fn(),
    getSubscriptionAdminPlans: jest.fn(),
    getSubscriptionAdminRedemptionBatches: jest.fn(),
    getSubscriptionAdminRedemptionCodes: jest.fn(),
  },
}));

const mockUseQuery = useQuery as jest.Mock;

describe('subscription queries', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: undefined });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('queries enabled subscription plans', () => {
    useGetSubscriptionPlans({ enabled: true });

    expect(mockUseQuery).toHaveBeenCalledWith(
      [QueryKeys.subscriptionPlans],
      expect.any(Function),
      expect.objectContaining({ enabled: true }),
    );

    const queryFn = mockUseQuery.mock.calls[0][1];
    queryFn();
    expect(dataService.getSubscriptionPlans).toHaveBeenCalled();
  });

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

  it('queries admin redemption batches', () => {
    const params = { limit: 20, offset: 0 };
    useGetSubscriptionAdminRedemptionBatches(params, { enabled: true });

    expect(mockUseQuery).toHaveBeenCalledWith(
      [QueryKeys.subscriptionAdminRedemptionBatches, params],
      expect.any(Function),
      expect.objectContaining({ enabled: true }),
    );

    const queryFn = mockUseQuery.mock.calls[0][1];
    queryFn();
    expect(dataService.getSubscriptionAdminRedemptionBatches).toHaveBeenCalledWith(params);
  });

  it('queries admin redemption codes', () => {
    const params = { limit: 20, offset: 0, status: 'active' as const };
    useGetSubscriptionAdminRedemptionCodes(params, { enabled: true });

    expect(mockUseQuery).toHaveBeenCalledWith(
      [QueryKeys.subscriptionAdminRedemptionCodes, params],
      expect.any(Function),
      expect.objectContaining({ enabled: true }),
    );

    const queryFn = mockUseQuery.mock.calls[0][1];
    queryFn();
    expect(dataService.getSubscriptionAdminRedemptionCodes).toHaveBeenCalledWith(params);
  });

  it('queries current subscription status', () => {
    useGetSubscriptionStatus();

    expect(mockUseQuery).toHaveBeenCalledWith(
      [QueryKeys.subscriptionStatus],
      expect.any(Function),
      expect.objectContaining({
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: true,
      }),
    );

    const queryFn = mockUseQuery.mock.calls[0][1];
    queryFn();
    expect(dataService.getSubscriptionStatus).toHaveBeenCalled();
  });

  it('queries a subscription order by id', () => {
    useGetSubscriptionOrder('order-1', { enabled: true });

    expect(mockUseQuery).toHaveBeenCalledWith(
      [QueryKeys.subscriptionOrder, 'order-1'],
      expect.any(Function),
      expect.objectContaining({ enabled: true }),
    );

    const queryFn = mockUseQuery.mock.calls[0][1];
    queryFn();
    expect(dataService.getSubscriptionOrder).toHaveBeenCalledWith('order-1');
  });
});
