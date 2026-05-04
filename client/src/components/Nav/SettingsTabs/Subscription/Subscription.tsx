import React, { useMemo, useState } from 'react';
import { SystemRoles } from 'librechat-data-provider';
import type {
  TCreateSubscriptionOrderRequest,
  TSubscriptionOrder,
  TSubscriptionPlan,
} from 'librechat-data-provider';
import {
  useCreateSubscriptionOrder,
  useGetStartupConfig,
  useGetSubscriptionOrder,
  useGetSubscriptionPlans,
  useGetSubscriptionStatus,
} from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import AdminPlanManager from './AdminPlanManager';
import PlanList from './PlanList';
import UsageMeter from './UsageMeter';

type PaymentType = TCreateSubscriptionOrderRequest['paymentType'];

function isCompletedOrder(order: TSubscriptionOrder | undefined): boolean {
  return order?.status === 'completed';
}

function Subscription() {
  const localize = useLocalize();
  const { isAuthenticated, user } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const paymentConfigured = startupConfig?.subscriptions?.paymentConfigured === true;
  const enabled = isAuthenticated === true && startupConfig?.subscriptions?.enabled === true;
  const isAdmin = user?.role === SystemRoles.ADMIN;
  const [orderId, setOrderId] = useState('');

  const plansQuery = useGetSubscriptionPlans({ enabled });
  const statusQuery = useGetSubscriptionStatus({ enabled });
  const createOrder = useCreateSubscriptionOrder();
  const orderQuery = useGetSubscriptionOrder(orderId, {
    enabled: orderId.length > 0,
    refetchInterval: (data) => (isCompletedOrder(data) ? false : 3000),
  });

  const plans = useMemo<TSubscriptionPlan[]>(() => plansQuery.data ?? [], [plansQuery.data]);
  const currentPlan = statusQuery.data?.plan;
  const usage = statusQuery.data?.usage;
  const order = orderQuery.data;

  const handleCreateOrder = (planKey: string, paymentType: PaymentType) => {
    createOrder.mutate(
      { planKey, paymentType },
      {
        onSuccess: (createdOrder) => {
          setOrderId(createdOrder.orderId);
        },
      },
    );
  };

  if (!enabled) {
    return (
      <div className="p-1 text-sm text-text-secondary">
        {localize('com_nav_subscription_disabled')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-1 text-sm text-text-primary">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">{localize('com_nav_subscription_current_plan')}</h3>
          <p className="mt-1 text-sm text-text-secondary">
            {currentPlan?.name ?? localize('com_nav_subscription_loading')}
          </p>
        </div>

        {usage && (
          <div className="space-y-3 rounded-lg border border-border-light p-3">
            <UsageMeter
              label="com_nav_subscription_text_quota"
              used={usage.text.used}
              limit={usage.text.limit}
            />
            <UsageMeter
              label="com_nav_subscription_image_quota"
              used={usage.image.used}
              limit={usage.image.limit}
            />
            <p className="text-xs text-text-secondary">
              {localize('com_nav_subscription_resets_at', {
                resetAt: new Date(usage.resetAt).toLocaleString(),
              })}
            </p>
          </div>
        )}
      </section>

      {!paymentConfigured && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-text-primary">
          {localize('com_nav_subscription_payment_unconfigured')}
        </div>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">
          {localize('com_nav_subscription_available_plans')}
        </h3>
        <PlanList
          plans={plans}
          paymentConfigured={paymentConfigured}
          isCreatingOrder={createOrder.isLoading}
          onCreateOrder={handleCreateOrder}
        />
      </section>

      {isAdmin && <AdminPlanManager />}

      {order?.payUrl && (
        <a
          href={order.payUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-blue-600 underline underline-offset-2 dark:text-blue-400"
        >
          {localize('com_nav_subscription_open_payment')}
        </a>
      )}
    </div>
  );
}

export default React.memo(Subscription);
