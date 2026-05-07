import React, { useState } from 'react';
import type t from 'librechat-data-provider';
import { useGetSubscriptionAdminOrders } from '~/data-provider';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import PaginationControls from './PaginationControls';

const pageSize = 20;
const statuses: Array<t.TSubscriptionOrderStatus | ''> = [
  '',
  'pending',
  'paid',
  'fulfilling',
  'completed',
  'expired',
  'cancelled',
  'failed',
];

function getDisplayDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : '';
}

function getPaymentLabel(paymentType: 'alipay' | 'wxpay'): TranslationKeys {
  return paymentType === 'alipay' ? 'com_nav_subscription_alipay' : 'com_nav_subscription_wxpay';
}

function getStatusLabel(status: t.TSubscriptionOrderStatus): TranslationKeys {
  return `com_admin_payment_status_${status}` as TranslationKeys;
}

function PaymentsPage() {
  const localize = useLocalize();
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<t.TSubscriptionOrderStatus | ''>('');
  const ordersQuery = useGetSubscriptionAdminOrders({
    limit: pageSize,
    offset,
    ...(status ? { status } : {}),
  });
  const orders = ordersQuery.data?.orders ?? [];
  const total = ordersQuery.data?.total ?? 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-xl font-semibold text-text-primary">
          {localize('com_admin_payments_title')}
        </h1>
        <label className="space-y-1 text-xs font-medium text-text-secondary">
          <span>{localize('com_admin_payments_status')}</span>
          <select
            className="h-10 rounded-md border border-border-light bg-surface-primary px-3 text-sm text-text-primary"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as t.TSubscriptionOrderStatus | '');
              setOffset(0);
            }}
          >
            {statuses.map((item) => (
              <option key={item || 'all'} value={item}>
                {localize(item ? getStatusLabel(item) : 'com_admin_payments_all')}
              </option>
            ))}
          </select>
        </label>
      </div>

      {ordersQuery.isError && (
        <div className="rounded-md border border-red-500/40 p-3 text-sm text-red-600" role="alert">
          {localize('com_admin_payments_error')}
        </div>
      )}

      <div className="min-h-0 overflow-auto rounded-lg border border-border-light">
        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-surface-secondary text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_order')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_user')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_plan')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_amount')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_method')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_status')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_created')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_payments_completed')}</th>
            </tr>
          </thead>
          <tbody>
            {ordersQuery.isLoading && (
              <tr>
                <td className="px-3 py-6 text-center text-text-secondary" colSpan={8}>
                  {localize('com_admin_loading')}
                </td>
              </tr>
            )}
            {!ordersQuery.isLoading && orders.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-text-secondary" colSpan={8}>
                  {localize('com_admin_payments_empty')}
                </td>
              </tr>
            )}
            {!ordersQuery.isLoading &&
              orders.map((order) => (
                <tr key={order.id} className="border-t border-border-light">
                  <td className="px-3 py-3">
                    <div className="font-medium text-text-primary">{order.outTradeNo}</div>
                    <div className="text-xs text-text-secondary">{order.tradeNo}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-text-primary">
                      {order.user?.email ?? order.userId}
                    </div>
                    <div className="text-xs text-text-secondary">{order.user?.name}</div>
                  </td>
                  <td className="px-3 py-3 text-text-secondary">{order.planKey}</td>
                  <td className="px-3 py-3 text-text-primary">
                    {new Intl.NumberFormat(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(order.amount)}
                  </td>
                  <td className="px-3 py-3 text-text-secondary">
                    {localize(getPaymentLabel(order.paymentType))}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs font-medium text-text-primary">
                      {localize(getStatusLabel(order.status))}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-text-secondary">{getDisplayDate(order.createdAt)}</td>
                  <td className="px-3 py-3 text-text-secondary">
                    {getDisplayDate(order.completedAt)}
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

export default React.memo(PaymentsPage);
