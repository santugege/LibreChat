import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import AdminShell from './AdminShell';

const mockUseGetSubscriptionAdminRedemptionBatches = jest.fn();
const mockUseGetSubscriptionAdminRedemptionCodes = jest.fn();
const mockUseCreateSubscriptionRedemptionBatch = jest.fn();
const mockUseDisableSubscriptionRedemptionCode = jest.fn();

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
  useGetSubscriptionAdminRedemptionBatches: (...args: unknown[]) =>
    mockUseGetSubscriptionAdminRedemptionBatches(...args),
  useGetSubscriptionAdminRedemptionCodes: (...args: unknown[]) =>
    mockUseGetSubscriptionAdminRedemptionCodes(...args),
  useCreateSubscriptionRedemptionBatch: () => mockUseCreateSubscriptionRedemptionBatch(),
  useDisableSubscriptionRedemptionCode: () => mockUseDisableSubscriptionRedemptionCode(),
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
  beforeEach(() => {
    mockUseGetSubscriptionAdminRedemptionBatches.mockReturnValue({
      data: { batches: [], total: 0, limit: 20, offset: 0 },
      isLoading: false,
      isError: false,
    });
    mockUseGetSubscriptionAdminRedemptionCodes.mockReturnValue({
      data: { codes: [], total: 0, limit: 20, offset: 0 },
      isLoading: false,
      isError: false,
    });
    mockUseCreateSubscriptionRedemptionBatch.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
      isError: false,
    });
    mockUseDisableSubscriptionRedemptionCode.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

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

  it('renders redemption code management for admin users', () => {
    useAuthContext.mockReturnValue({ user: { role: SystemRoles.ADMIN } });

    renderAdminShell('/d/admin/redemptions');

    expect(screen.getByText('com_admin_redemptions_title')).toBeInTheDocument();
    expect(screen.getByText('com_admin_redemptions_empty')).toBeInTheDocument();
  });

  it('shows codes for a redemption batch and disables an active code', () => {
    const disableCode = jest.fn();
    mockUseGetSubscriptionAdminRedemptionBatches.mockReturnValue({
      data: {
        batches: [
          {
            id: 'batch-1',
            name: 'Taobao',
            quantity: 1,
            durationDays: 30,
            textDailyLimit: 1000,
            imageDailyLimit: 20,
            planKey: 'redeem-30d',
            planName: 'Taobao',
            createdAt: '2026-06-07T00:00:00.000Z',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
      isLoading: false,
      isError: false,
    });
    mockUseGetSubscriptionAdminRedemptionCodes.mockReturnValue({
      data: {
        codes: [
          {
            id: 'code-1',
            batchId: 'batch-1',
            codePrefix: 'LC-ABCD',
            status: 'active',
            durationDays: 30,
            textDailyLimit: 1000,
            imageDailyLimit: 20,
            planKey: 'redeem-30d',
            planName: 'Taobao',
            createdAt: '2026-06-07T00:00:00.000Z',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
      isLoading: false,
      isError: false,
    });
    mockUseDisableSubscriptionRedemptionCode.mockReturnValue({
      mutate: disableCode,
      isLoading: false,
      isError: false,
    });
    useAuthContext.mockReturnValue({ user: { role: SystemRoles.ADMIN } });

    renderAdminShell('/d/admin/redemptions');

    fireEvent.click(screen.getByRole('button', { name: 'com_admin_redemptions_view_codes' }));

    expect(screen.getByText('LC-ABCD')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_redemptions_disable_code' }));

    expect(disableCode).toHaveBeenCalledWith({ codeId: 'code-1' });
    expect(mockUseGetSubscriptionAdminRedemptionCodes).toHaveBeenCalledWith(
      { batchId: 'batch-1', limit: 20, offset: 0 },
      expect.objectContaining({ enabled: true }),
    );
  });
});
