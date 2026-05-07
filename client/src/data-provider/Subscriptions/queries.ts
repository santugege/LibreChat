import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useGetSubscriptionPlans = (
  config?: UseQueryOptions<t.TSubscriptionPlan[]>,
): QueryObserverResult<t.TSubscriptionPlan[]> => {
  return useQuery<t.TSubscriptionPlan[]>(
    [QueryKeys.subscriptionPlans],
    () => dataService.getSubscriptionPlans(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

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

export const useGetSubscriptionQuotaExemptions = (
  config?: UseQueryOptions<t.TSubscriptionQuotaExemption[]>,
): QueryObserverResult<t.TSubscriptionQuotaExemption[]> => {
  return useQuery<t.TSubscriptionQuotaExemption[]>(
    [QueryKeys.subscriptionQuotaExemptions],
    () => dataService.getSubscriptionQuotaExemptions(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useGetSubscriptionStatus = (
  config?: UseQueryOptions<t.TSubscriptionStatus>,
): QueryObserverResult<t.TSubscriptionStatus> => {
  return useQuery<t.TSubscriptionStatus>(
    [QueryKeys.subscriptionStatus],
    () => dataService.getSubscriptionStatus(),
    {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      ...config,
    },
  );
};

export const useGetSubscriptionOrder = (
  orderId: string,
  config?: UseQueryOptions<t.TSubscriptionOrder>,
): QueryObserverResult<t.TSubscriptionOrder> => {
  return useQuery<t.TSubscriptionOrder>(
    [QueryKeys.subscriptionOrder, orderId],
    () => dataService.getSubscriptionOrder(orderId),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: orderId.length > 0 && (config?.enabled ?? true),
    },
  );
};
