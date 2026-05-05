import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useCreateSubscriptionOrder = (): UseMutationResult<
  t.TCreateSubscriptionOrderResponse,
  unknown,
  t.TCreateSubscriptionOrderRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: t.TCreateSubscriptionOrderRequest) => dataService.createSubscriptionOrder(payload),
    {
      onSuccess: (order) => {
        queryClient.invalidateQueries([QueryKeys.subscriptionStatus]);
        queryClient.invalidateQueries([QueryKeys.subscriptionOrder, order.orderId]);
      },
    },
  );
};
