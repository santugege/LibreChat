import React, { useMemo, useState } from 'react';
import { Download, TicketPlus } from 'lucide-react';
import type t from 'librechat-data-provider';
import {
  useCreateSubscriptionRedemptionBatch,
  useGetSubscriptionAdminRedemptionBatches,
} from '~/data-provider';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import PaginationControls from './PaginationControls';

const pageSize = 20;

type FormState = {
  name: string;
  quantity: string;
  durationDays: string;
  textDailyLimit: string;
  imageDailyLimit: string;
  expiresAt: string;
  campaign: string;
  note: string;
};

const emptyForm: FormState = {
  name: '',
  quantity: '100',
  durationDays: '30',
  textDailyLimit: '1000',
  imageDailyLimit: '20',
  expiresAt: '',
  campaign: '',
  note: '',
};

const formFields: Array<{
  key: keyof FormState;
  inputType: 'text' | 'number' | 'datetime-local';
  min?: string;
}> = [
  { key: 'name', inputType: 'text' },
  { key: 'quantity', inputType: 'number', min: '1' },
  { key: 'durationDays', inputType: 'number', min: '1' },
  { key: 'textDailyLimit', inputType: 'number', min: '0' },
  { key: 'imageDailyLimit', inputType: 'number', min: '0' },
  { key: 'expiresAt', inputType: 'datetime-local' },
  { key: 'campaign', inputType: 'text' },
  { key: 'note', inputType: 'text' },
];

function toInt(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function getFieldLabel(field: keyof FormState): TranslationKeys {
  return `com_admin_redemptions_${field}` as TranslationKeys;
}

function toPayload(form: FormState): t.TCreateSubscriptionRedemptionBatchRequest {
  return {
    name: form.name.trim(),
    quantity: toInt(form.quantity),
    durationDays: toInt(form.durationDays),
    textDailyLimit: toInt(form.textDailyLimit),
    imageDailyLimit: toInt(form.imageDailyLimit),
    ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
    ...(form.campaign.trim() ? { campaign: form.campaign.trim() } : {}),
    ...(form.note.trim() ? { note: form.note.trim() } : {}),
  };
}

function escapeCsv(value: string | number | undefined): string {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCodes(batchName: string, codes: t.TGeneratedSubscriptionRedemptionCode[]) {
  const rows = ['code,prefix,expiresAt'].concat(
    codes.map((code) => [code.code, code.prefix, code.expiresAt ?? ''].map(escapeCsv).join(',')),
  );
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${batchName || 'redemption-codes'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function getDisplayDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : '';
}

function RedemptionCodesPage() {
  const localize = useLocalize();
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [created, setCreated] = useState<t.TCreateSubscriptionRedemptionBatchResponse | null>(
    null,
  );
  const batchesQuery = useGetSubscriptionAdminRedemptionBatches({ limit: pageSize, offset });
  const createBatch = useCreateSubscriptionRedemptionBatch();
  const batches = batchesQuery.data?.batches ?? [];
  const total = batchesQuery.data?.total ?? 0;
  const canSubmit = useMemo(() => {
    const payload = toPayload(form);
    return (
      payload.name.length > 0 &&
      payload.quantity > 0 &&
      payload.durationDays > 0 &&
      payload.textDailyLimit >= 0 &&
      payload.imageDailyLimit >= 0 &&
      !createBatch.isLoading
    );
  }, [form, createBatch.isLoading]);

  const updateForm = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    createBatch.mutate(toPayload(form), {
      onSuccess: (response) => {
        setCreated(response);
        setForm(emptyForm);
      },
    });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">
          {localize('com_admin_redemptions_title')}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {localize('com_admin_redemptions_description')}
        </p>
      </div>

      <form
        className="grid gap-3 rounded-lg border border-border-light p-3 md:grid-cols-4"
        onSubmit={submit}
      >
        {formFields.map(({ key, inputType, min }) => (
          <label key={key} className="space-y-1 text-xs font-medium text-text-secondary">
            <span>{localize(getFieldLabel(key))}</span>
            <input
              className="h-10 w-full rounded-md border border-border-light bg-transparent px-3 text-sm text-text-primary"
              type={inputType}
              min={min}
              value={form[key]}
              onChange={(event) => updateForm(key, event.target.value)}
            />
          </label>
        ))}
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 md:self-end"
        >
          <TicketPlus className="h-4 w-4" aria-hidden="true" />
          {localize('com_admin_redemptions_generate')}
        </button>
      </form>

      {createBatch.isError && (
        <div className="rounded-md border border-red-500/40 p-3 text-sm text-red-600" role="alert">
          {localize('com_admin_redemptions_generate_error')}
        </div>
      )}

      {created && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-green-600/40 p-3">
          <span className="text-sm text-text-primary">
            {localize('com_admin_redemptions_generated', { count: created.codes.length })}
          </span>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border-light px-3 text-sm"
            onClick={() => downloadCodes(created.batch.name, created.codes)}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {localize('com_admin_redemptions_download')}
          </button>
        </div>
      )}

      <div className="min-h-0 overflow-auto rounded-lg border border-border-light">
        <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-surface-secondary text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">{localize('com_admin_redemptions_name')}</th>
              <th className="px-3 py-2 font-medium">
                {localize('com_admin_redemptions_campaign')}
              </th>
              <th className="px-3 py-2 font-medium">
                {localize('com_admin_redemptions_quantity')}
              </th>
              <th className="px-3 py-2 font-medium">
                {localize('com_admin_redemptions_durationDays')}
              </th>
              <th className="px-3 py-2 font-medium">
                {localize('com_admin_redemptions_textDailyLimit')}
              </th>
              <th className="px-3 py-2 font-medium">
                {localize('com_admin_redemptions_imageDailyLimit')}
              </th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_redemptions_created')}</th>
            </tr>
          </thead>
          <tbody>
            {batchesQuery.isLoading && (
              <tr>
                <td className="px-3 py-6 text-center text-text-secondary" colSpan={7}>
                  {localize('com_admin_loading')}
                </td>
              </tr>
            )}
            {!batchesQuery.isLoading && batches.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-text-secondary" colSpan={7}>
                  {localize('com_admin_redemptions_empty')}
                </td>
              </tr>
            )}
            {!batchesQuery.isLoading &&
              batches.map((batch) => (
                <tr key={batch.id} className="border-t border-border-light">
                  <td className="px-3 py-3 font-medium text-text-primary">{batch.name}</td>
                  <td className="px-3 py-3 text-text-secondary">{batch.campaign ?? ''}</td>
                  <td className="px-3 py-3 text-text-secondary">{batch.quantity}</td>
                  <td className="px-3 py-3 text-text-secondary">{batch.durationDays}</td>
                  <td className="px-3 py-3 text-text-secondary">{batch.textDailyLimit}</td>
                  <td className="px-3 py-3 text-text-secondary">{batch.imageDailyLimit}</td>
                  <td className="px-3 py-3 text-text-secondary">
                    {getDisplayDate(batch.createdAt)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <PaginationControls
        total={total}
        limit={pageSize}
        offset={offset}
        onOffsetChange={setOffset}
      />
    </section>
  );
}

export default React.memo(RedemptionCodesPage);
