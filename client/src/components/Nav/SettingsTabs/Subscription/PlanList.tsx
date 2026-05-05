import React from 'react';
import type { TCreateSubscriptionOrderRequest, TSubscriptionPlan } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

type PaymentType = TCreateSubscriptionOrderRequest['paymentType'];

type PlanListProps = {
  plans: TSubscriptionPlan[];
  paymentConfigured: boolean;
  isCreatingOrder: boolean;
  onCreateOrder: (planKey: string, paymentType: PaymentType) => void;
};

const paymentOptions: { type: PaymentType; label: TranslationKeys }[] = [
  { type: 'alipay', label: 'com_nav_subscription_alipay' },
];

function PlanList({ plans, paymentConfigured, isCreatingOrder, onCreateOrder }: PlanListProps) {
  const localize = useLocalize();
  const paidPlans = plans.filter((plan) => plan.enabled && plan.price > 0);

  if (paidPlans.length === 0) {
    return (
      <div className="rounded-lg border border-border-light p-3 text-sm text-text-secondary">
        {localize('com_nav_subscription_no_paid_plans')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {paidPlans.map((plan) => (
        <div
          key={plan.key}
          className="rounded-lg border border-border-light bg-surface-primary p-3 text-text-primary"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">{plan.name}</h4>
              {plan.description && (
                <p className="mt-1 text-xs text-text-secondary">{plan.description}</p>
              )}
            </div>
            <div className="text-right text-sm font-medium">
              {localize('com_nav_subscription_price', { price: plan.price })}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-secondary">
            <span>
              {localize('com_nav_subscription_text_quota')}: {plan.textDailyLimit}
            </span>
            <span>
              {localize('com_nav_subscription_image_quota')}: {plan.imageDailyLimit}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {paymentOptions.map((option) => (
              <button
                key={option.type}
                type="button"
                className="rounded-md border border-border-light px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!paymentConfigured || isCreatingOrder}
                onClick={() => onCreateOrder(plan.key, option.type)}
              >
                {localize(option.label)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default React.memo(PlanList);
