import React, { useMemo, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import type { TSubscriptionPlan } from 'librechat-data-provider';
import {
  useCreateSubscriptionAdminPlan,
  useDeleteSubscriptionAdminPlan,
  useGetSubscriptionAdminPlans,
  useUpdateSubscriptionAdminPlan,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

type PlanFormState = {
  key: string;
  name: string;
  description: string;
  price: string;
  durationDays: string;
  textDailyLimit: string;
  imageDailyLimit: string;
  enabled: boolean;
  sortOrder: string;
};

const emptyForm: PlanFormState = {
  key: '',
  name: '',
  description: '',
  price: '0',
  durationDays: '30',
  textDailyLimit: '0',
  imageDailyLimit: '0',
  enabled: true,
  sortOrder: '0',
};

const inputClass =
  'min-h-9 rounded-md border border-border-light bg-transparent px-2 py-1.5 text-sm';
const labelClass = 'space-y-1 text-xs font-medium text-text-secondary';

function parseFiniteNumber(value: string): number {
  if (value.trim().length === 0) {
    return Number.NaN;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formFromPlan(plan: TSubscriptionPlan): PlanFormState {
  return {
    key: plan.key,
    name: plan.name,
    description: plan.description ?? '',
    price: String(plan.price),
    durationDays: String(plan.durationDays),
    textDailyLimit: String(plan.textDailyLimit),
    imageDailyLimit: String(plan.imageDailyLimit),
    enabled: plan.enabled,
    sortOrder: String(plan.sortOrder),
  };
}

function payloadFromForm(form: PlanFormState): TSubscriptionPlan {
  const description = form.description.trim();
  return {
    key: form.key.trim(),
    name: form.name.trim(),
    ...(description ? { description } : {}),
    price: parseFiniteNumber(form.price),
    durationDays: parseFiniteNumber(form.durationDays),
    textDailyLimit: parseFiniteNumber(form.textDailyLimit),
    imageDailyLimit: parseFiniteNumber(form.imageDailyLimit),
    enabled: form.enabled,
    sortOrder: parseFiniteNumber(form.sortOrder),
  };
}

function isValidForm(form: PlanFormState): boolean {
  const price = parseFiniteNumber(form.price);
  const durationDays = parseFiniteNumber(form.durationDays);
  const textDailyLimit = parseFiniteNumber(form.textDailyLimit);
  const imageDailyLimit = parseFiniteNumber(form.imageDailyLimit);
  const sortOrder = parseFiniteNumber(form.sortOrder);

  return (
    form.key.trim().length > 0 &&
    form.name.trim().length > 0 &&
    price >= 0 &&
    Number.isInteger(durationDays) &&
    durationDays > 0 &&
    Number.isInteger(textDailyLimit) &&
    textDailyLimit >= 0 &&
    Number.isInteger(imageDailyLimit) &&
    imageDailyLimit >= 0 &&
    Number.isInteger(sortOrder)
  );
}

function AdminPlanManager() {
  const localize = useLocalize();
  const plansQuery = useGetSubscriptionAdminPlans();
  const createPlan = useCreateSubscriptionAdminPlan();
  const updatePlan = useUpdateSubscriptionAdminPlan();
  const deletePlan = useDeleteSubscriptionAdminPlan();
  const [draft, setDraft] = useState<PlanFormState>(emptyForm);
  const [editingKey, setEditingKey] = useState('');
  const [confirmDeleteKey, setConfirmDeleteKey] = useState('');
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const isSaving = createPlan.isLoading || updatePlan.isLoading || deletePlan.isLoading;
  const canSubmit = isValidForm(draft) && !isSaving;
  const hasMutationError = createPlan.isError || updatePlan.isError || deletePlan.isError;

  const updateDraft = (field: keyof PlanFormState, value: string | boolean) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setConfirmDeleteKey('');
  };

  const resetForm = () => {
    setDraft(emptyForm);
    setEditingKey('');
    setConfirmDeleteKey('');
  };

  const editPlan = (plan: TSubscriptionPlan) => {
    setEditingKey(plan.key);
    setDraft(formFromPlan(plan));
    setConfirmDeleteKey('');
  };

  const submitForm = () => {
    if (!isValidForm(draft)) {
      return;
    }

    const payload = payloadFromForm(draft);
    if (editingKey) {
      const { key: _key, ...patch } = payload;
      updatePlan.mutate({ planKey: editingKey, payload: patch }, { onSuccess: resetForm });
      return;
    }

    createPlan.mutate(payload, { onSuccess: resetForm });
  };

  const deleteSelectedPlan = () => {
    if (!editingKey) {
      return;
    }

    if (confirmDeleteKey !== editingKey) {
      setConfirmDeleteKey(editingKey);
      return;
    }

    deletePlan.mutate(editingKey, { onSuccess: resetForm });
  };

  return (
    <section className="space-y-3 border-t border-border-light pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{localize('com_nav_subscription_admin_plans')}</h3>
        <button
          type="button"
          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border-light px-2 py-1 text-xs font-medium transition-colors hover:bg-surface-hover"
          onClick={resetForm}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {localize('com_nav_subscription_admin_new_plan')}
        </button>
      </div>

      {plansQuery.isLoading && (
        <p className="rounded-lg border border-border-light p-3 text-sm text-text-secondary">
          {localize('com_nav_subscription_admin_loading')}
        </p>
      )}
      {plansQuery.isError && (
        <p className="rounded-lg border border-red-500/40 p-3 text-sm text-red-600" role="alert">
          {localize('com_nav_subscription_admin_load_error')}
        </p>
      )}
      {hasMutationError && (
        <p className="rounded-lg border border-red-500/40 p-3 text-sm text-red-600" role="alert">
          {localize('com_nav_subscription_admin_save_error')}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {plans.map((plan) => (
          <button
            key={plan.key}
            type="button"
            className="min-h-16 rounded-lg border border-border-light p-3 text-left transition-colors hover:bg-surface-hover"
            onClick={() => editPlan(plan)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{plan.name}</span>
              <span
                className={
                  plan.enabled
                    ? 'rounded-full bg-green-600 px-2 py-0.5 text-[11px] font-medium text-white'
                    : 'rounded-full bg-surface-tertiary px-2 py-0.5 text-[11px] font-medium text-text-secondary'
                }
              >
                {localize(
                  plan.enabled
                    ? 'com_nav_subscription_admin_enabled'
                    : 'com_nav_subscription_admin_disabled',
                )}
              </span>
            </div>
            <div className="mt-1 truncate text-xs text-text-secondary">{plan.key}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className={labelClass}>
          <span>{localize('com_nav_subscription_admin_key')}</span>
          <input
            aria-label={localize('com_nav_subscription_admin_key')}
            className={inputClass}
            value={draft.key}
            disabled={Boolean(editingKey)}
            onChange={(event) => updateDraft('key', event.target.value)}
          />
        </label>
        <label className={labelClass}>
          <span>{localize('com_nav_subscription_admin_name')}</span>
          <input
            aria-label={localize('com_nav_subscription_admin_name')}
            className={inputClass}
            value={draft.name}
            onChange={(event) => updateDraft('name', event.target.value)}
          />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          <span>{localize('com_nav_subscription_admin_description')}</span>
          <input
            aria-label={localize('com_nav_subscription_admin_description')}
            className={inputClass}
            value={draft.description}
            onChange={(event) => updateDraft('description', event.target.value)}
          />
        </label>
        <label className={labelClass}>
          <span>{localize('com_nav_subscription_admin_price')}</span>
          <input
            aria-label={localize('com_nav_subscription_admin_price')}
            className={inputClass}
            type="number"
            min="0"
            step="0.01"
            value={draft.price}
            onChange={(event) => updateDraft('price', event.target.value)}
          />
        </label>
        <label className={labelClass}>
          <span>{localize('com_nav_subscription_admin_duration')}</span>
          <input
            aria-label={localize('com_nav_subscription_admin_duration')}
            className={inputClass}
            type="number"
            min="1"
            step="1"
            value={draft.durationDays}
            onChange={(event) => updateDraft('durationDays', event.target.value)}
          />
        </label>
        <label className={labelClass}>
          <span>{localize('com_nav_subscription_admin_text_limit')}</span>
          <input
            aria-label={localize('com_nav_subscription_admin_text_limit')}
            className={inputClass}
            type="number"
            min="0"
            step="1"
            value={draft.textDailyLimit}
            onChange={(event) => updateDraft('textDailyLimit', event.target.value)}
          />
        </label>
        <label className={labelClass}>
          <span>{localize('com_nav_subscription_admin_image_limit')}</span>
          <input
            aria-label={localize('com_nav_subscription_admin_image_limit')}
            className={inputClass}
            type="number"
            min="0"
            step="1"
            value={draft.imageDailyLimit}
            onChange={(event) => updateDraft('imageDailyLimit', event.target.value)}
          />
        </label>
        <label className={labelClass}>
          <span>{localize('com_nav_subscription_admin_sort_order')}</span>
          <input
            aria-label={localize('com_nav_subscription_admin_sort_order')}
            className={inputClass}
            type="number"
            step="1"
            value={draft.sortOrder}
            onChange={(event) => updateDraft('sortOrder', event.target.value)}
          />
        </label>
        <label className="inline-flex min-h-9 items-center gap-2 self-end rounded-md border border-border-light px-2 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => updateDraft('enabled', event.target.checked)}
          />
          {localize('com_nav_subscription_admin_enabled')}
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canSubmit}
          onClick={submitForm}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {localize('com_nav_subscription_admin_save')}
        </button>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border-light px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          disabled={isSaving}
          onClick={resetForm}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          {localize('com_nav_subscription_admin_cancel')}
        </button>
        {editingKey && (
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-red-500/50 px-3 py-1.5 text-sm font-medium text-red-600 disabled:opacity-50"
            disabled={isSaving}
            onClick={deleteSelectedPlan}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {localize(
              confirmDeleteKey === editingKey
                ? 'com_nav_subscription_admin_confirm_delete'
                : 'com_nav_subscription_admin_delete',
            )}
          </button>
        )}
      </div>
    </section>
  );
}

export default React.memo(AdminPlanManager);
