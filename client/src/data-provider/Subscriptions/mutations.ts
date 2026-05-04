import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

type UpdateSubscriptionAdminPlanVariables = {
  planKey: string;
  payload: t.TUpdateSubscriptionPlanRequest;
};

function invalidateSubscriptionPlanQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({
    queryKey: [QueryKeys.subscriptionAdminPlans],
    refetchType: 'all',
  });
  queryClient.invalidateQueries({
    queryKey: [QueryKeys.subscriptionPlans],
    refetchType: 'all',
  });
  queryClient.invalidateQueries({
    queryKey: [QueryKeys.subscriptionStatus],
    refetchType: 'all',
  });
}

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

export const useCreateSubscriptionAdminPlan = (): UseMutationResult<
  t.TSubscriptionPlan,
  unknown,
  t.TCreateSubscriptionPlanRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: t.TCreateSubscriptionPlanRequest) => dataService.createSubscriptionAdminPlan(payload),
    {
      onSuccess: () => invalidateSubscriptionPlanQueries(queryClient),
    },
  );
};

export const useUpdateSubscriptionAdminPlan = (): UseMutationResult<
  t.TSubscriptionPlan,
  unknown,
  UpdateSubscriptionAdminPlanVariables,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    ({ planKey, payload }: UpdateSubscriptionAdminPlanVariables) =>
      dataService.updateSubscriptionAdminPlan(planKey, payload),
    {
      onSuccess: () => invalidateSubscriptionPlanQueries(queryClient),
    },
  );
};

export const useDeleteSubscriptionAdminPlan = (): UseMutationResult<
  t.TSubscriptionPlan,
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((planKey: string) => dataService.deleteSubscriptionAdminPlan(planKey), {
    onSuccess: () => invalidateSubscriptionPlanQueries(queryClient),
  });
};
