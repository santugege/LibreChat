import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useGetAdminUsers = (
  params: t.TAdminPageParams = {},
  config?: UseQueryOptions<t.TAdminUsersResponse>,
): QueryObserverResult<t.TAdminUsersResponse> => {
  return useQuery<t.TAdminUsersResponse>(
    [QueryKeys.adminUsers, params],
    () => dataService.getAdminUsers(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useSearchAdminUsers = (
  params: t.TAdminUserSearchParams,
  config?: UseQueryOptions<t.TAdminUserSearchResponse>,
): QueryObserverResult<t.TAdminUserSearchResponse> => {
  return useQuery<t.TAdminUserSearchResponse>(
    [QueryKeys.adminUserSearch, params],
    () => dataService.searchAdminUsers(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: params.q.trim().length > 0 && (config?.enabled ?? true),
    },
  );
};

export const useGetSubscriptionAdminOrders = (
  params: t.TSubscriptionAdminOrdersParams = {},
  config?: UseQueryOptions<t.TSubscriptionAdminOrdersResponse>,
): QueryObserverResult<t.TSubscriptionAdminOrdersResponse> => {
  return useQuery<t.TSubscriptionAdminOrdersResponse>(
    [QueryKeys.subscriptionAdminOrders, params],
    () => dataService.getSubscriptionAdminOrders(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};
