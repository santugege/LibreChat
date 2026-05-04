import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import Settings from './Settings';

const mockUseGetStartupConfig = jest.fn();
const mockUseAuthContext = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => mockUseAuthContext(),
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/hooks/usePersonalizationAccess', () => () => ({
  hasAnyPersonalizationFeature: false,
  hasMemoryOptOut: false,
}));

jest.mock('@headlessui/react', () => ({
  Dialog: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogPanel: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({
    children,
    as: Component = 'div',
  }: React.PropsWithChildren<{ as?: React.ElementType }>) => <Component>{children}</Component>,
  Transition: ({ children, show }: React.PropsWithChildren<{ show?: boolean }>) =>
    show ? <>{children}</> : null,
  TransitionChild: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@librechat/client', () => ({
  GearIcon: () => <span data-testid="gear-icon" />,
  DataIcon: () => <span data-testid="data-icon" />,
  UserIcon: () => <span data-testid="user-icon" />,
  SpeechIcon: () => <span data-testid="speech-icon" />,
  PersonalizationIcon: () => <span data-testid="personalization-icon" />,
  useMediaQuery: () => false,
}));

jest.mock('./SettingsTabs', () => ({
  General: () => <div data-testid="general-tab" />,
  Chat: () => <div data-testid="chat-tab" />,
  Commands: () => <div data-testid="commands-tab" />,
  Speech: () => <div data-testid="speech-tab" />,
  Personalization: () => <div data-testid="personalization-tab" />,
  Data: () => <div data-testid="data-tab" />,
  Balance: () => <div data-testid="balance-tab" />,
  Subscription: () => <div data-testid="subscription-tab" />,
  Account: () => <div data-testid="account-tab" />,
}));

class ObserverMock {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

beforeAll(() => {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ObserverMock,
  });
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: ObserverMock,
  });
});

describe('Settings', () => {
  beforeEach(() => {
    mockUseAuthContext.mockReturnValue({ isAuthenticated: true });
    mockUseGetStartupConfig.mockReturnValue({
      data: {
        balance: { enabled: false },
        subscriptions: { enabled: true, paymentConfigured: false },
      },
    });
  });

  afterEach(() => {
    cleanup();
    jest.resetAllMocks();
  });

  it('shows the subscription settings tab when subscriptions are enabled', () => {
    render(<Settings open={true} onOpenChange={jest.fn()} />);

    expect(screen.getByRole('tab', { name: 'com_nav_setting_subscription' })).toBeInTheDocument();
  });

  it('hides the subscription settings tab when subscriptions are disabled', () => {
    mockUseGetStartupConfig.mockReturnValue({
      data: {
        balance: { enabled: false },
        subscriptions: { enabled: false, paymentConfigured: false },
      },
    });

    render(<Settings open={true} onOpenChange={jest.fn()} />);

    expect(
      screen.queryByRole('tab', { name: 'com_nav_setting_subscription' }),
    ).not.toBeInTheDocument();
  });
});
