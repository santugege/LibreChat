import React from 'react';
import { render, screen } from '@testing-library/react';
import type { TSubscriptionPlan, TSubscriptionStatus } from 'librechat-data-provider';
import Subscription from './Subscription';

const mockUseGetStartupConfig = jest.fn();
const mockUseGetSubscriptionPlans = jest.fn();
const mockUseGetSubscriptionStatus = jest.fn();
const mockUseCreateSubscriptionOrder = jest.fn();
const mockUseGetSubscriptionOrder = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('|')}` : key,
  useAuthContext: () => ({ isAuthenticated: true }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
  useGetSubscriptionPlans: (...args: unknown[]) => mockUseGetSubscriptionPlans(...args),
  useGetSubscriptionStatus: (...args: unknown[]) => mockUseGetSubscriptionStatus(...args),
  useCreateSubscriptionOrder: () => mockUseCreateSubscriptionOrder(),
  useGetSubscriptionOrder: (...args: unknown[]) => mockUseGetSubscriptionOrder(...args),
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
    mockUseGetStartupConfig.mockReturnValue({
      data: { subscriptions: { enabled: true, paymentConfigured: false } },
    });
    mockUseGetSubscriptionPlans.mockReturnValue({ data: plans, isLoading: false });
    mockUseGetSubscriptionStatus.mockReturnValue({ data: status, isLoading: false });
    mockUseCreateSubscriptionOrder.mockReturnValue({ mutate: jest.fn(), isLoading: false });
    mockUseGetSubscriptionOrder.mockReturnValue({ data: undefined });
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
});
