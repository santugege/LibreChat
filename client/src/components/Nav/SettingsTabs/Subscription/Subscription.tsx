import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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
import AdminQuotaExemptionManager from './AdminQuotaExemptionManager';
import AdminPlanManager from './AdminPlanManager';
import PlanList from './PlanList';
import UsageMeter from './UsageMeter';

type PaymentType = TCreateSubscriptionOrderRequest['paymentType'];
type PaymentInstructions = {
  url: string;
  qrCode?: string;
};

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
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentInstructions, setPaymentInstructions] = useState<PaymentInstructions | null>(null);

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
  const paymentQrCode = order?.qrCode ?? paymentInstructions?.qrCode ?? '';
  const paymentHref =
    order?.qrCode ?? order?.payUrl ?? paymentInstructions?.qrCode ?? paymentInstructions?.url ?? '';
  const showPaymentDialog = Boolean(paymentQrCode && paymentDialogOpen);

  const handleCreateOrder = (planKey: string, paymentType: PaymentType) => {
    const paymentWindow = window.open('', '_blank');

    if (paymentWindow) {
      paymentWindow.opener = null;
    }

    createOrder.mutate(
      { planKey, paymentType },
      {
        onSuccess: (createdOrder) => {
          const checkoutUrl = createdOrder.payUrl ?? createdOrder.qrCode ?? '';
          const qrCode = createdOrder.qrCode ?? '';

          setOrderId(createdOrder.orderId);
          setPaymentInstructions(
            checkoutUrl
              ? {
                  url: qrCode || checkoutUrl,
                  ...(qrCode ? { qrCode } : {}),
                }
              : null,
          );

          if (qrCode) {
            setPaymentDialogOpen(true);
            paymentWindow?.close();
            return;
          }

          if (checkoutUrl && paymentWindow) {
            paymentWindow.location.href = checkoutUrl;
            return;
          }

          paymentWindow?.close();
        },
        onError: () => {
          paymentWindow?.close();
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

      {isAdmin && (
        <>
          <AdminQuotaExemptionManager />
          <AdminPlanManager />
        </>
      )}

      {showPaymentDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscription-payment-qr-title"
            className="w-full max-w-sm rounded-lg border border-border-light bg-surface-primary p-4 text-center shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3 text-left">
              <div className="space-y-1">
                <h3 id="subscription-payment-qr-title" className="text-sm font-semibold">
                  {localize('com_nav_subscription_payment_qr_title')}
                </h3>
                <p className="text-xs text-text-secondary">
                  {localize('com_nav_subscription_payment_qr_description')}
                </p>
              </div>
              <button
                type="button"
                aria-label={localize('com_ui_close')}
                className="rounded-md p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                onClick={() => setPaymentDialogOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div
                role="img"
                aria-label={localize('com_nav_subscription_payment_qr_title')}
                className="rounded-md bg-white p-3"
              >
                <QRCodeSVG value={paymentQrCode} size={220} includeMargin />
              </div>
              <a
                href={paymentHref}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-blue-600 underline underline-offset-2 dark:text-blue-400"
              >
                {localize('com_nav_subscription_open_payment')}
              </a>
            </div>
          </div>
        </div>
      )}

      {!paymentQrCode && paymentHref && (
        <a
          href={paymentHref}
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
