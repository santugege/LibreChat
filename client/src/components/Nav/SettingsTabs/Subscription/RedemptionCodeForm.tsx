import React, { useState } from 'react';
import { TicketCheck } from 'lucide-react';
import { useRedeemSubscriptionCode } from '~/data-provider';
import { useLocalize } from '~/hooks';

function RedemptionCodeForm() {
  const localize = useLocalize();
  const redeem = useRedeemSubscriptionCode();
  const [code, setCode] = useState('');
  const [success, setSuccess] = useState(false);
  const canSubmit = code.trim().length > 0 && !redeem.isLoading;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setSuccess(false);
    redeem.mutate(
      { code: code.trim() },
      {
        onSuccess: () => {
          setCode('');
          setSuccess(true);
        },
      },
    );
  };

  return (
    <section className="space-y-3 rounded-lg border border-border-light p-3">
      <div className="flex items-center gap-2">
        <TicketCheck className="h-4 w-4 text-text-secondary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">{localize('com_nav_subscription_redeem_title')}</h3>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">{localize('com_nav_subscription_redeem_code_label')}</span>
          <input
            aria-label={localize('com_nav_subscription_redeem_code_label')}
            className="h-10 w-full rounded-md border border-border-light bg-transparent px-3 text-sm"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setSuccess(false);
            }}
            placeholder={localize('com_nav_subscription_redeem_placeholder')}
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {localize('com_nav_subscription_redeem_submit')}
        </button>
      </form>
      {success && (
        <p className="text-xs text-green-600" role="status">
          {localize('com_nav_subscription_redeem_success')}
        </p>
      )}
      {redeem.isError && (
        <p className="text-xs text-red-600" role="alert">
          {localize('com_nav_subscription_redeem_error')}
        </p>
      )}
    </section>
  );
}

export default React.memo(RedemptionCodeForm);
