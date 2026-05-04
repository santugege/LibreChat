import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SystemRoles } from 'librechat-data-provider';
import type { TSubscriptionPlan, TSubscriptionStatus } from 'librechat-data-provider';
import Subscription from './Subscription';

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
const mockCreateSubscriptionAdminPlan = jest.fn();
const mockUpdateSubscriptionAdminPlan = jest.fn();
const mockDeleteSubscriptionAdminPlan = jest.fn();

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
}));

const plans: TSubscriptionPlan[] = [
  {
    key: 'free',
    name: 'Free',
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
  });

  afterEach(() => {
    jest.resetAllMocks();
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
    expect(screen.getByRole('button', { name: 'com_nav_subscription_wxpay' })).toBeDisabled();
    expect(screen.getByText('com_nav_subscription_payment_unconfigured')).toBeInTheDocument();
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
  });

  it('hides plan management from non-admin users', () => {
    render(<Subscription />);

    expect(screen.queryByText('com_nav_subscription_admin_plans')).not.toBeInTheDocument();
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
