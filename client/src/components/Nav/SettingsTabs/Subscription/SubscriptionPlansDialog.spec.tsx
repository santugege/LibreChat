import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SystemRoles } from 'librechat-data-provider';
import type {
  TCreateSubscriptionOrderRequest,
  TCreateSubscriptionOrderResponse,
  TSubscriptionPlan,
} from 'librechat-data-provider';
import SubscriptionPlansDialog from './SubscriptionPlansDialog';

const mockUseAuthContext = jest.fn();
const mockUseGetStartupConfig = jest.fn();
const mockUseGetSubscriptionPlans = jest.fn();
const mockUseCreateSubscriptionOrder = jest.fn();
const mockUseGetSubscriptionOrder = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('|')}` : key,
  useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
  useGetSubscriptionPlans: (...args: unknown[]) => mockUseGetSubscriptionPlans(...args),
  useCreateSubscriptionOrder: () => mockUseCreateSubscriptionOrder(),
  useGetSubscriptionOrder: (...args: unknown[]) => mockUseGetSubscriptionOrder(...args),
}));

const plans: TSubscriptionPlan[] = [
  {
    key: 'free',
    name: 'Free',
    description: 'Free plan',
    price: 0,
    durationDays: 30,
    textDailyLimit: 2,
    imageDailyLimit: 1,
    enabled: true,
    sortOrder: 0,
  },
  {
    key: 'pro_monthly',
    name: 'Pro Monthly',
    description: 'More daily usage',
    price: 29.9,
    durationDays: 30,
    textDailyLimit: 300,
    imageDailyLimit: 30,
    enabled: true,
    sortOrder: 10,
  },
];

describe('SubscriptionPlansDialog', () => {
  beforeEach(() => {
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { role: SystemRoles.USER },
    });
    mockUseGetStartupConfig.mockReturnValue({
      data: { subscriptions: { enabled: true, paymentConfigured: false } },
    });
    mockUseGetSubscriptionPlans.mockReturnValue({ data: plans, isLoading: false });
    mockUseCreateSubscriptionOrder.mockReturnValue({ mutate: jest.fn(), isLoading: false });
    mockUseGetSubscriptionOrder.mockReturnValue({ data: undefined });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  it('shows only purchasable plans in a focused dialog', () => {
    render(<SubscriptionPlansDialog open={true} onOpenChange={jest.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'com_subscription_plans_dialog_title' });

    expect(within(dialog).getByText('Pro Monthly')).toBeInTheDocument();
    expect(within(dialog).queryByText('Free')).not.toBeInTheDocument();
    expect(
      within(dialog).getByText('com_subscription_plans_dialog_description'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText('com_nav_settings')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('com_nav_subscription_admin_plans')).not.toBeInTheDocument();
  });

  it('creates a paid order and shows QR payment instructions', () => {
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

    render(<SubscriptionPlansDialog open={true} onOpenChange={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'com_nav_subscription_alipay' }));

    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(paymentWindow.opener).toBeNull();
    expect(paymentWindow.close).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      { planKey: 'pro_monthly', paymentType: 'alipay' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(paymentWindow.location.href).toBe('');

    const qrDialog = screen.getByRole('dialog', {
      name: 'com_nav_subscription_payment_qr_title',
    });

    expect(
      within(qrDialog).getByRole('img', { name: 'com_nav_subscription_payment_qr_title' }),
    ).toBeInTheDocument();
    expect(
      within(qrDialog).getByRole('link', { name: 'com_nav_subscription_open_payment' }),
    ).toHaveAttribute('href', 'https://qr.alipay.com/test-payment');
  });
});
