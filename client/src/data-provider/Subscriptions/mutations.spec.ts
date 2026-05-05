import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useCreateSubscriptionOrder } from './mutations';

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('librechat-data-provider', () => ({
  QueryKeys: {
    subscriptionStatus: 'subscriptionStatus',
    subscriptionOrder: 'subscriptionOrder',
  },
  dataService: {
    createSubscriptionOrder: jest.fn(),
  },
}));

const mockUseMutation = useMutation as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.Mock;

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
});
