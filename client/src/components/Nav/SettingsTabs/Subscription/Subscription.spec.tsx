import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryKeys, SystemRoles } from 'librechat-data-provider';
import type {
  TCreateSubscriptionOrderRequest,
  TCreateSubscriptionOrderResponse,
  TSubscriptionQuotaExemption,
  TSubscriptionOrder,
  TSubscriptionPlan,
  TSubscriptionStatus,
} from 'librechat-data-provider';
import Subscription from './Subscription';

const mockInvalidateQueries = jest.fn();
const mockUseAuthContext = jest.fn();
const mockUseGetStartupConfig = jest.fn();
const mockUseGetSubscriptionPlans = jest.fn();
const mockUseGetSubscriptionStatus = jest.fn();
const mockUseCreateSubscriptionOrder = jest.fn();
const mockUseGetSubscriptionOrder = jest.fn();
const mockUseGetSubscriptionAdminPlans = jest.fn();
const mockUseCreateSubscriptionAdminPlan = jest.fn();
const mockUseUpdateSubscriptionAdminPlan = jest.fn();
const mockUseDeleteSubscriptionAdminPlan = jest.fn();
const mockUseGetSubscriptionQuotaExemptions = jest.fn();
const mockUseCreateSubscriptionQuotaExemption = jest.fn();
const mockUseDeleteSubscriptionQuotaExemption = jest.fn();
const mockCreateSubscriptionAdminPlan = jest.fn();
const mockUpdateSubscriptionAdminPlan = jest.fn();
const mockDeleteSubscriptionAdminPlan = jest.fn();
const mockCreateSubscriptionQuotaExemption = jest.fn();
const mockDeleteSubscriptionQuotaExemption = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('|')}` : key,
  useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
  useGetSubscriptionPlans: (...args: unknown[]) => mockUseGetSubscriptionPlans(...args),
  useGetSubscriptionStatus: (...args: unknown[]) => mockUseGetSubscriptionStatus(...args),
  useCreateSubscriptionOrder: () => mockUseCreateSubscriptionOrder(),
  useGetSubscriptionOrder: (...args: unknown[]) => mockUseGetSubscriptionOrder(...args),
  useGetSubscriptionAdminPlans: () => mockUseGetSubscriptionAdminPlans(),
  useCreateSubscriptionAdminPlan: () => mockUseCreateSubscriptionAdminPlan(),
  useUpdateSubscriptionAdminPlan: () => mockUseUpdateSubscriptionAdminPlan(),
  useDeleteSubscriptionAdminPlan: () => mockUseDeleteSubscriptionAdminPlan(),
  useGetSubscriptionQuotaExemptions: () => mockUseGetSubscriptionQuotaExemptions(),
  useCreateSubscriptionQuotaExemption: () => mockUseCreateSubscriptionQuotaExemption(),
  useDeleteSubscriptionQuotaExemption: () => mockUseDeleteSubscriptionQuotaExemption(),
}));

const plans: TSubscriptionPlan[] = [
  {
    key: 'free',
    name: 'Free',
    description: 'Free plan',
    price: 0,
    durationDays: 30,
    textDailyLimit: 20,
    imageDailyLimit: 2,
    enabled: true,
    sortOrder: 0,
  },
  {
    key: 'pro_monthly',
    name: 'Pro Monthly',
    price: 29.9,
    durationDays: 30,
    textDailyLimit: 300,
    imageDailyLimit: 30,
    enabled: true,
    sortOrder: 10,
  },
];

const status: TSubscriptionStatus = {
  plan: plans[0],
  subscription: null,
  usage: {
    windowKey: '2026-05-04',
    resetAt: '2026-05-05T00:00:00.000Z',
    text: { used: 2, limit: 20 },
    image: { used: 1, limit: 2 },
  },
};

const quotaExemptions: TSubscriptionQuotaExemption[] = [
  {
    email: 'vip@example.com',
    createdAt: '2026-05-05T00:00:00.000Z',
  },
];

describe('Subscription settings tab', () => {
  beforeEach(() => {
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { role: SystemRoles.USER },
    });
    mockUseGetStartupConfig.mockReturnValue({
      data: { subscriptions: { enabled: true, paymentConfigured: false } },
    });
    mockUseGetSubscriptionPlans.mockReturnValue({ data: plans, isLoading: false });
    mockUseGetSubscriptionStatus.mockReturnValue({ data: status, isLoading: false });
    mockUseCreateSubscriptionOrder.mockReturnValue({ mutate: jest.fn(), isLoading: false });
    mockUseGetSubscriptionOrder.mockReturnValue({ data: undefined });
    mockUseGetSubscriptionAdminPlans.mockReturnValue({ data: plans, isLoading: false });
    mockUseCreateSubscriptionAdminPlan.mockReturnValue({
      mutate: mockCreateSubscriptionAdminPlan,
      isLoading: false,
      isError: false,
    });
    mockUseUpdateSubscriptionAdminPlan.mockReturnValue({
      mutate: mockUpdateSubscriptionAdminPlan,
      isLoading: false,
      isError: false,
    });
    mockUseDeleteSubscriptionAdminPlan.mockReturnValue({
      mutate: mockDeleteSubscriptionAdminPlan,
      isLoading: false,
      isError: false,
    });
    mockUseGetSubscriptionQuotaExemptions.mockReturnValue({
      data: quotaExemptions,
      isLoading: false,
      isError: false,
    });
    mockUseCreateSubscriptionQuotaExemption.mockReturnValue({
      mutate: mockCreateSubscriptionQuotaExemption,
      isLoading: false,
      isError: false,
    });
    mockUseDeleteSubscriptionQuotaExemption.mockReturnValue({
      mutate: mockDeleteSubscriptionQuotaExemption,
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    mockInvalidateQueries.mockReset();
  });

  it('renders the current plan, usage meters, and available plans', () => {
    render(<Subscription />);

    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Pro Monthly')).toBeInTheDocument();
    expect(screen.getByText('com_nav_subscription_text_quota')).toBeInTheDocument();
    expect(screen.getByText('2 / 20')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('disables paid checkout buttons when payment is not configured', () => {
    render(<Subscription />);

    expect(screen.getByRole('button', { name: 'com_nav_subscription_alipay' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'com_nav_subscription_wxpay' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('com_nav_subscription_payment_unconfigured')).toBeInTheDocument();
  });

  it('shows the Alipay QR code when ZPAY returns QR payment instructions', () => {
    const paymentWindow = {
      location: { href: '' },
      opener: window,
      close: jest.fn(),
    } as unknown as Window;
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(paymentWindow);
    const mutate = jest.fn(
      (
        _: TCreateSubscriptionOrderRequest,
        options: { onSuccess: (order: TCreateSubscriptionOrderResponse) => void },
      ) => {
        options.onSuccess({
          orderId: 'order-1',
          outTradeNo: 'trade-1',
          status: 'pending',
          payUrl: 'https://zpay.example/pay',
          qrCode: 'https://qr.alipay.com/test-payment',
          expiresAt: '2026-05-05T00:00:00.000Z',
        });
      },
    );
    mockUseGetStartupConfig.mockReturnValue({
      data: { subscriptions: { enabled: true, paymentConfigured: true } },
    });
    mockUseCreateSubscriptionOrder.mockReturnValue({ mutate, isLoading: false });

    render(<Subscription />);

    fireEvent.click(screen.getByRole('button', { name: 'com_nav_subscription_alipay' }));

    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(paymentWindow.opener).toBeNull();
    expect(paymentWindow.close).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      { planKey: 'pro_monthly', paymentType: 'alipay' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(paymentWindow.location.href).toBe('');
    const dialog = screen.getByRole('dialog', {
      name: 'com_nav_subscription_payment_qr_title',
    });
    expect(
      within(dialog).getByRole('img', { name: 'com_nav_subscription_payment_qr_title' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'com_nav_subscription_open_payment' }),
    ).toHaveAttribute('href', 'https://qr.alipay.com/test-payment');

    fireEvent.click(within(dialog).getByRole('button', { name: 'com_ui_close' }));

    expect(
      screen.queryByRole('dialog', { name: 'com_nav_subscription_payment_qr_title' }),
    ).not.toBeInTheDocument();
  });

  it('opens the ZPAY payment page when no QR code is returned', () => {
    const paymentWindow = {
      location: { href: '' },
      opener: window,
      close: jest.fn(),
    } as unknown as Window;
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(paymentWindow);
    const mutate = jest.fn(
      (
        _: TCreateSubscriptionOrderRequest,
        options: { onSuccess: (order: TCreateSubscriptionOrderResponse) => void },
      ) => {
        options.onSuccess({
          orderId: 'order-1',
          outTradeNo: 'trade-1',
          status: 'pending',
          payUrl: 'https://zpay.example/pay',
          expiresAt: '2026-05-05T00:00:00.000Z',
        });
      },
    );
    mockUseGetStartupConfig.mockReturnValue({
      data: { subscriptions: { enabled: true, paymentConfigured: true } },
    });
    mockUseCreateSubscriptionOrder.mockReturnValue({ mutate, isLoading: false });

    render(<Subscription />);

    fireEvent.click(screen.getByRole('button', { name: 'com_nav_subscription_alipay' }));

    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(paymentWindow.location.href).toBe('https://zpay.example/pay');
  });

  it('refreshes subscription status when a paid order completes', async () => {
    const paymentWindow = {
      location: { href: '' },
      opener: window,
      close: jest.fn(),
    } as unknown as Window;
    jest.spyOn(window, 'open').mockReturnValue(paymentWindow);
    const completedOrder: TSubscriptionOrder = {
      orderId: 'order-1',
      outTradeNo: 'trade-1',
      status: 'completed',
      expiresAt: '2026-05-05T00:00:00.000Z',
      planKey: 'pro_monthly',
      amount: 29.9,
      completedAt: '2026-05-04T00:00:00.000Z',
    };
    const mutate = jest.fn(
      (
        _: TCreateSubscriptionOrderRequest,
        options: { onSuccess: (order: TCreateSubscriptionOrderResponse) => void },
      ) => {
        options.onSuccess({
          orderId: 'order-1',
          outTradeNo: 'trade-1',
          status: 'pending',
          payUrl: 'https://zpay.example/pay',
          expiresAt: '2026-05-05T00:00:00.000Z',
        });
      },
    );
    mockUseGetStartupConfig.mockReturnValue({
      data: { subscriptions: { enabled: true, paymentConfigured: true } },
    });
    mockUseCreateSubscriptionOrder.mockReturnValue({ mutate, isLoading: false });
    mockUseGetSubscriptionOrder.mockImplementation((orderId: string) => ({
      data: orderId === 'order-1' ? completedOrder : undefined,
    }));

    render(<Subscription />);

    fireEvent.click(screen.getByRole('button', { name: 'com_nav_subscription_alipay' }));

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: [QueryKeys.subscriptionStatus],
        refetchType: 'all',
      });
    });
  });

  it('shows plan management for admins', () => {
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { role: SystemRoles.ADMIN },
    });

    render(<Subscription />);

    expect(screen.getByText('com_nav_subscription_admin_plans')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'com_nav_subscription_admin_new_plan' }),
    ).toBeInTheDocument();
    expect(screen.getByText('com_nav_subscription_quota_exemptions')).toBeInTheDocument();
  });

  it('hides plan management from non-admin users', () => {
    render(<Subscription />);

    expect(screen.queryByText('com_nav_subscription_admin_plans')).not.toBeInTheDocument();
    expect(screen.queryByText('com_nav_subscription_quota_exemptions')).not.toBeInTheDocument();
  });

  it('lets admins add and remove quota exemption emails', () => {
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { role: SystemRoles.ADMIN },
    });

    render(<Subscription />);

    expect(screen.getByText('vip@example.com')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('com_nav_subscription_quota_exemption_email'), {
      target: { value: ' VIP@Example.COM ' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'com_nav_subscription_quota_exemption_add' }),
    );

    expect(mockCreateSubscriptionQuotaExemption).toHaveBeenCalledWith(
      { email: 'vip@example.com' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'com_nav_subscription_quota_exemption_delete:vip@example.com',
      }),
    );

    expect(mockDeleteSubscriptionQuotaExemption).toHaveBeenCalledWith('vip@example.com');
  });

  it('creates an admin subscription plan from visible form fields', () => {
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { role: SystemRoles.ADMIN },
    });

    render(<Subscription />);

    expect(screen.getByText('com_nav_subscription_admin_key')).toBeInTheDocument();
    expect(screen.getByText('com_nav_subscription_admin_name')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('com_nav_subscription_admin_key'), {
      target: { value: 'team' },
    });
    fireEvent.change(screen.getByLabelText('com_nav_subscription_admin_name'), {
      target: { value: 'Team' },
    });
    fireEvent.change(screen.getByLabelText('com_nav_subscription_admin_price'), {
      target: { value: '99' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'com_nav_subscription_admin_save' }));

    expect(mockCreateSubscriptionAdminPlan).toHaveBeenCalledWith(
      {
        key: 'team',
        name: 'Team',
        price: 99,
        durationDays: 30,
        textDailyLimit: 0,
        imageDailyLimit: 0,
        enabled: true,
        sortOrder: 0,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('requires confirmation before deleting an admin subscription plan', () => {
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { role: SystemRoles.ADMIN },
    });

    render(<Subscription />);

    fireEvent.click(screen.getByRole('button', { name: /Free/ }));
    fireEvent.click(screen.getByRole('button', { name: 'com_nav_subscription_admin_delete' }));

    expect(mockDeleteSubscriptionAdminPlan).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'com_nav_subscription_admin_confirm_delete' }),
    );

    expect(mockDeleteSubscriptionAdminPlan).toHaveBeenCalledWith(
      'free',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('sends an empty description when clearing an admin subscription plan description', () => {
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { role: SystemRoles.ADMIN },
    });

    render(<Subscription />);

    fireEvent.click(screen.getByRole('button', { name: /Free/ }));
    fireEvent.change(screen.getByLabelText('com_nav_subscription_admin_description'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_nav_subscription_admin_save' }));

    expect(mockUpdateSubscriptionAdminPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        planKey: 'free',
        payload: expect.objectContaining({ description: '' }),
      }),
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );
  });

  it('shows loading and error states for admin plan management', () => {
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { role: SystemRoles.ADMIN },
    });
    mockUseGetSubscriptionAdminPlans.mockReturnValue({ data: undefined, isLoading: true });

    const { unmount } = render(<Subscription />);

    expect(screen.getByText('com_nav_subscription_admin_loading')).toBeInTheDocument();

    unmount();
    mockUseGetSubscriptionAdminPlans.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<Subscription />);

    expect(screen.getByText('com_nav_subscription_admin_load_error')).toBeInTheDocument();
  });

  it('shows a write error when an admin plan mutation fails', () => {
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { role: SystemRoles.ADMIN },
    });
    mockUseCreateSubscriptionAdminPlan.mockReturnValue({
      mutate: mockCreateSubscriptionAdminPlan,
      isLoading: false,
      isError: true,
    });

    render(<Subscription />);

    expect(screen.getByText('com_nav_subscription_admin_save_error')).toBeInTheDocument();
  });
});
