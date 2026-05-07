import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type {
  TSubscriptionPlan,
  TSubscriptionOrder,
  TCreateSubscriptionOrderRequest,
} from 'librechat-data-provider';
import {
  useGetStartupConfig,
  useGetSubscriptionOrder,
  useGetSubscriptionPlans,
  useCreateSubscriptionOrder,
} from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import PlanList from './PlanList';
import { useRefreshSubscriptionStatusOnCompletedOrder } from './hooks';

type PaymentType = TCreateSubscriptionOrderRequest['paymentType'];
type PaymentInstructions = {
  url: string;
  qrCode?: string;
};

type SubscriptionPlansDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function isCompletedOrder(order: TSubscriptionOrder | undefined): boolean {
  return order?.status === 'completed';
}

function SubscriptionPlansDialog({ open, onOpenChange }: SubscriptionPlansDialogProps) {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const paymentConfigured = startupConfig?.subscriptions?.paymentConfigured === true;
  const enabled = isAuthenticated === true && startupConfig?.subscriptions?.enabled === true;
  const [orderId, setOrderId] = useState('');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentInstructions, setPaymentInstructions] = useState<PaymentInstructions | null>(null);

  const plansQuery = useGetSubscriptionPlans({ enabled });
  const createOrder = useCreateSubscriptionOrder();
  const orderQuery = useGetSubscriptionOrder(orderId, {
    enabled: orderId.length > 0,
    refetchInterval: (data) => (isCompletedOrder(data) ? false : 3000),
  });

  const plans = useMemo<TSubscriptionPlan[]>(() => plansQuery.data ?? [], [plansQuery.data]);
  const order = orderQuery.data;
  useRefreshSubscriptionStatusOnCompletedOrder(order);

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

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-plans-dialog-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-border-light bg-surface-primary shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-light p-4">
          <div className="space-y-1">
            <h2 id="subscription-plans-dialog-title" className="text-base font-semibold">
              {localize('com_subscription_plans_dialog_title')}
            </h2>
            <p className="text-sm text-text-secondary">
              {localize('com_subscription_plans_dialog_description')}
            </p>
          </div>
          <button
            type="button"
            aria-label={localize('com_ui_close')}
            className="rounded-md p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4 text-sm text-text-primary">
          {!enabled && (
            <div className="rounded-lg border border-border-light p-3 text-sm text-text-secondary">
              {localize('com_nav_subscription_disabled')}
            </div>
          )}

          {enabled && !paymentConfigured && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-text-primary">
              {localize('com_nav_subscription_payment_unconfigured')}
            </div>
          )}

          {enabled && (
            <PlanList
              plans={plans}
              paymentConfigured={paymentConfigured}
              isCreatingOrder={createOrder.isLoading}
              onCreateOrder={handleCreateOrder}
            />
          )}
        </div>
      </div>

      {showPaymentDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
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

export default React.memo(SubscriptionPlansDialog);
