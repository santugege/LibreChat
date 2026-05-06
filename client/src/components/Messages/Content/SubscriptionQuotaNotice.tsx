import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import type { LocalizeFunction } from '~/common';
import SubscriptionPlansDialog from '~/components/Nav/SettingsTabs/Subscription/SubscriptionPlansDialog';

export type SubscriptionQuotaNoticePayload = {
  kind: string;
  used: number;
  limit: number;
  planKey: string;
  resetAt: string;
};

function formatSubscriptionResetAt(resetAt: string): string {
  const date = new Date(resetAt);

  if (Number.isNaN(date.getTime())) {
    return resetAt;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).format(date);
}

export default function SubscriptionQuotaNotice({
  quota,
  localize,
}: {
  quota: SubscriptionQuotaNoticePayload;
  localize: LocalizeFunction;
}) {
  const [plansOpen, setPlansOpen] = useState(false);
  const { kind, used, limit, planKey, resetAt } = quota;
  const titleKey =
    kind === 'image'
      ? 'com_error_subscription_quota_title_image'
      : 'com_error_subscription_quota_title_text';

  return (
    <div className="flex flex-col gap-3 text-text-primary">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <p className="font-medium">{localize(titleKey)}</p>
        </div>
        <p className="text-sm text-text-secondary">
          {localize('com_error_subscription_quota_body', {
            0: used,
            1: limit,
            2: planKey,
            3: formatSubscriptionResetAt(resetAt),
          })}
        </p>
        <p className="text-sm text-text-secondary">
          {localize('com_error_subscription_quota_help')}
        </p>
      </div>
      <button
        type="button"
        className="inline-flex w-fit items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-surface-primary dark:bg-blue-500 dark:hover:bg-blue-400"
        onClick={() => setPlansOpen(true)}
      >
        <CreditCard className="h-4 w-4" aria-hidden="true" />
        {localize('com_error_subscription_quota_action')}
      </button>
      {plansOpen && <SubscriptionPlansDialog open={plansOpen} onOpenChange={setPlansOpen} />}
    </div>
  );
}
