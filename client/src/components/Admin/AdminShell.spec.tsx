import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import AdminShell from './AdminShell';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useGetAdminUsers: () => ({
    data: { users: [], total: 0, limit: 20, offset: 0 },
    isLoading: false,
    isError: false,
  }),
  useSearchAdminUsers: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
  useGetSubscriptionAdminOrders: () => ({
    data: { orders: [], total: 0, limit: 20, offset: 0 },
    isLoading: false,
    isError: false,
  }),
}));

const { useAuthContext } = jest.requireMock('~/hooks') as {
  useAuthContext: jest.Mock;
};

function renderAdminShell(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <AdminShell />
    </MemoryRouter>,
  );
}

describe('AdminShell', () => {
  it('blocks non-admin users', () => {
    useAuthContext.mockReturnValue({ user: { role: SystemRoles.USER } });

    renderAdminShell('/d/admin/accounts');

    expect(screen.getByText('com_admin_access_denied')).toBeInTheDocument();
  });

  it('renders account management for admin users', () => {
    useAuthContext.mockReturnValue({ user: { role: SystemRoles.ADMIN } });

    renderAdminShell('/d/admin/accounts');

    expect(screen.getByText('com_admin_accounts_title')).toBeInTheDocument();
    expect(screen.getByText('com_admin_accounts_empty')).toBeInTheDocument();
  });

  it('renders payment management for admin users', () => {
    useAuthContext.mockReturnValue({ user: { role: SystemRoles.ADMIN } });

    renderAdminShell('/d/admin/payments');

    expect(screen.getByText('com_admin_payments_title')).toBeInTheDocument();
    expect(screen.getByText('com_admin_payments_empty')).toBeInTheDocument();
  });
});
