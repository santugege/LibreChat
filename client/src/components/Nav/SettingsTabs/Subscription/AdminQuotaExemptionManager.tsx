import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  useGetSubscriptionQuotaExemptions,
  useCreateSubscriptionQuotaExemption,
  useDeleteSubscriptionQuotaExemption,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

const inputClass =
  'min-h-9 rounded-md border border-border-light bg-transparent px-2 py-1.5 text-sm';
const labelClass = 'space-y-1 text-xs font-medium text-text-secondary';

function getValidEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  return /\S+@\S+\.\S+/.test(trimmed) ? trimmed : '';
}

function AdminQuotaExemptionManager() {
  const localize = useLocalize();
  const exemptionsQuery = useGetSubscriptionQuotaExemptions();
  const createExemption = useCreateSubscriptionQuotaExemption();
  const deleteExemption = useDeleteSubscriptionQuotaExemption();
  const [email, setEmail] = useState('');
  const exemptions = useMemo(() => exemptionsQuery.data ?? [], [exemptionsQuery.data]);
  const isSaving = createExemption.isLoading || deleteExemption.isLoading;
  const validEmail = getValidEmail(email);
  const canSubmit = validEmail.length > 0 && !isSaving;
  const hasMutationError = createExemption.isError || deleteExemption.isError;

  const addExemption = () => {
    if (!canSubmit) {
      return;
    }

    createExemption.mutate(
      { email: validEmail },
      {
        onSuccess: () => setEmail(''),
      },
    );
  };

  return (
    <section className="space-y-3 border-t border-border-light pt-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">
          {localize('com_nav_subscription_quota_exemptions')}
        </h3>
        <p className="text-xs text-text-secondary">
          {localize('com_nav_subscription_quota_exemption_description')}
        </p>
      </div>

      {exemptionsQuery.isLoading && (
        <p className="rounded-lg border border-border-light p-3 text-sm text-text-secondary">
          {localize('com_nav_subscription_quota_exemption_loading')}
        </p>
      )}
      {exemptionsQuery.isError && (
        <p className="rounded-lg border border-red-500/40 p-3 text-sm text-red-600" role="alert">
          {localize('com_nav_subscription_quota_exemption_load_error')}
        </p>
      )}
      {hasMutationError && (
        <p className="rounded-lg border border-red-500/40 p-3 text-sm text-red-600" role="alert">
          {localize('com_nav_subscription_quota_exemption_save_error')}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className={`${labelClass} flex-1`}>
          <span>{localize('com_nav_subscription_quota_exemption_email')}</span>
          <input
            aria-label={localize('com_nav_subscription_quota_exemption_email')}
            className={inputClass}
            type="email"
            value={email}
            placeholder="user@example.com"
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canSubmit}
          onClick={addExemption}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {localize('com_nav_subscription_quota_exemption_add')}
        </button>
      </div>

      <div className="space-y-2">
        {exemptions.length === 0 && !exemptionsQuery.isLoading && (
          <p className="rounded-lg border border-border-light p-3 text-sm text-text-secondary">
            {localize('com_nav_subscription_quota_exemption_empty')}
          </p>
        )}
        {exemptions.map((exemption) => (
          <div
            key={exemption.email}
            className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border-light px-3 py-2"
          >
            <span className="truncate text-sm font-medium">{exemption.email}</span>
            <button
              type="button"
              aria-label={localize('com_nav_subscription_quota_exemption_delete', {
                email: exemption.email,
              })}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-red-600 disabled:opacity-50"
              disabled={isSaving}
              onClick={() => deleteExemption.mutate(exemption.email)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default React.memo(AdminQuotaExemptionManager);
