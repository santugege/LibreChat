import React from 'react';
import { Navigate, NavLink, useLocation } from 'react-router-dom';
import { CreditCard, Ticket, Users } from 'lucide-react';
import { SystemRoles } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import cn from '~/utils/cn';
import AccountsPage from './AccountsPage';
import PaymentsPage from './PaymentsPage';
import RedemptionCodesPage from './RedemptionCodesPage';

function AdminShell() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const location = useLocation();

  if (user?.role !== SystemRoles.ADMIN) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-text-primary">
        <div className="max-w-md rounded-lg border border-border-light p-5 text-center">
          <h1 className="text-lg font-semibold">{localize('com_admin_access_denied')}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {localize('com_admin_access_denied_description')}
          </p>
        </div>
      </main>
    );
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'inline-flex min-h-9 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
      isActive
        ? 'bg-surface-tertiary text-text-primary'
        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
    );
  const path = location.pathname.replace(/\/+$/, '');
  const page = path.endsWith('/payments')
    ? 'payments'
    : path.endsWith('/redemptions')
      ? 'redemptions'
      : path.endsWith('/accounts')
        ? 'accounts'
        : '';

  return (
    <main className="flex min-h-screen flex-col bg-background text-text-primary">
      <header className="border-b border-border-light px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-semibold">{localize('com_admin_title')}</h1>
          <nav className="flex flex-wrap gap-1" aria-label={localize('com_admin_title')}>
            <NavLink to="/d/admin/accounts" className={linkClass}>
              <Users className="h-4 w-4" aria-hidden="true" />
              {localize('com_admin_accounts_nav')}
            </NavLink>
            <NavLink to="/d/admin/payments" className={linkClass}>
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              {localize('com_admin_payments_nav')}
            </NavLink>
            <NavLink to="/d/admin/redemptions" className={linkClass}>
              <Ticket className="h-4 w-4" aria-hidden="true" />
              {localize('com_admin_redemptions_nav')}
            </NavLink>
          </nav>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 p-4 sm:p-6">
        {page === '' && <Navigate to="/d/admin/accounts" replace />}
        {page === 'accounts' && <AccountsPage />}
        {page === 'payments' && <PaymentsPage />}
        {page === 'redemptions' && <RedemptionCodesPage />}
      </div>
    </main>
  );
}

export default React.memo(AdminShell);
