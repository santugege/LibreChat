import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

type UpdateSubscriptionAdminPlanVariables = {
  planKey: string;
  payload: t.TUpdateSubscriptionPlanRequest;
};

function invalidateSubscriptionQuotaExemptionQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({
    queryKey: [QueryKeys.subscriptionQuotaExemptions],
    refetchType: 'all',
  });
}

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

function invalidateRedemptionAdminQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({
    queryKey: [QueryKeys.subscriptionAdminRedemptionBatches],
    refetchType: 'all',
  });
  queryClient.invalidateQueries({
    queryKey: [QueryKeys.subscriptionAdminRedemptionCodes],
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

export const useRedeemSubscriptionCode = (): UseMutationResult<
  t.TRedeemSubscriptionCodeResponse,
  unknown,
  t.TRedeemSubscriptionCodeRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: t.TRedeemSubscriptionCodeRequest) => dataService.redeemSubscriptionCode(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.subscriptionStatus]);
        queryClient.invalidateQueries([QueryKeys.subscriptionPlans]);
        queryClient.invalidateQueries([QueryKeys.balance]);
      },
    },
  );
};

export const useCreateSubscriptionRedemptionBatch = (): UseMutationResult<
  t.TCreateSubscriptionRedemptionBatchResponse,
  unknown,
  t.TCreateSubscriptionRedemptionBatchRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: t.TCreateSubscriptionRedemptionBatchRequest) =>
      dataService.createSubscriptionRedemptionBatch(payload),
    {
      onSuccess: () => invalidateRedemptionAdminQueries(queryClient),
    },
  );
};

export const useDisableSubscriptionRedemptionCode = (): UseMutationResult<
  t.TSubscriptionRedemptionCode,
  unknown,
  { codeId: string; reason?: string },
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    ({ codeId, reason }: { codeId: string; reason?: string }) =>
      dataService.disableSubscriptionRedemptionCode(codeId, { reason }),
    {
      onSuccess: () => invalidateRedemptionAdminQueries(queryClient),
    },
  );
};

export const useCreateSubscriptionQuotaExemption = (): UseMutationResult<
  t.TSubscriptionQuotaExemption,
  unknown,
  t.TCreateSubscriptionQuotaExemptionRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: t.TCreateSubscriptionQuotaExemptionRequest) =>
      dataService.createSubscriptionQuotaExemption(payload),
    {
      onSuccess: () => invalidateSubscriptionQuotaExemptionQueries(queryClient),
    },
  );
};

export const useDeleteSubscriptionQuotaExemption = (): UseMutationResult<
  t.TSubscriptionQuotaExemption,
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((email: string) => dataService.deleteSubscriptionQuotaExemption(email), {
    onSuccess: () => invalidateSubscriptionQuotaExemptionQueries(queryClient),
  });
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
