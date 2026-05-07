import { useEffect } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { TSubscriptionOrder } from 'librechat-data-provider';

export function useRefreshSubscriptionStatusOnCompletedOrder(
  order: TSubscriptionOrder | undefined,
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (order?.status !== 'completed') {
      return;
    }

    queryClient.invalidateQueries({
      queryKey: [QueryKeys.subscriptionStatus],
      refetchType: 'all',
    });
  }, [order?.orderId, order?.status, queryClient]);
}
