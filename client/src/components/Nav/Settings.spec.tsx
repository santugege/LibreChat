import React from 'react';
import { SettingsTabValues } from 'librechat-data-provider';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from './Settings';

const mockUseGetStartupConfig = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/hooks/usePersonalizationAccess', () => ({
  __esModule: true,
  default: () => ({
    hasMemoryOptOut: false,
    hasAnyPersonalizationFeature: false,
  }),
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
  GearIcon: () => <span aria-hidden="true" />,
  DataIcon: () => <span aria-hidden="true" />,
  UserIcon: () => <span aria-hidden="true" />,
  SpeechIcon: () => <span aria-hidden="true" />,
  PersonalizationIcon: () => <span aria-hidden="true" />,
  useMediaQuery: () => false,
}));

jest.mock('./SettingsTabs', () => ({
  General: () => <div data-testid="general-panel" />,
  Chat: () => <div data-testid="chat-panel" />,
  Commands: () => <div data-testid="commands-panel" />,
  Speech: () => <div data-testid="speech-panel" />,
  Personalization: () => <div data-testid="personalization-panel" />,
  Data: () => <div data-testid="data-panel" />,
  Balance: () => <div data-testid="balance-panel" />,
  Subscription: () => <div data-testid="subscription-panel" />,
  Account: () => <div data-testid="account-panel" />,
  About: () => <div data-testid="about-panel" />,
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

function renderSettings() {
  return render(<Settings open={true} onOpenChange={jest.fn()} />);
}

describe('Settings', () => {
  beforeEach(() => {
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
    renderSettings();

    expect(screen.getByRole('tab', { name: 'com_nav_setting_subscription' })).toBeInTheDocument();
  });

  it('opens on the requested initial settings tab', () => {
    render(
      <Settings open={true} onOpenChange={jest.fn()} initialTab={SettingsTabValues.SUBSCRIPTION} />,
    );

    expect(screen.getByTestId('subscription-panel')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'com_nav_setting_subscription' })).toHaveAttribute(
      'data-state',
      'active',
    );
  });

  it('hides the subscription settings tab when subscriptions are disabled', () => {
    mockUseGetStartupConfig.mockReturnValue({
      data: {
        balance: { enabled: false },
        subscriptions: { enabled: false, paymentConfigured: false },
      },
    });

    renderSettings();

    expect(
      screen.queryByRole('tab', { name: 'com_nav_setting_subscription' }),
    ).not.toBeInTheDocument();
  });

  it('shows the About tab while startup config is loading', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: undefined });

    renderSettings();

    expect(screen.getByText('com_nav_setting_about')).toBeInTheDocument();
  });

  it('hides the About tab only when buildInfo is explicitly disabled', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: { interface: { buildInfo: false } } });

    renderSettings();

    expect(screen.queryByText('com_nav_setting_about')).not.toBeInTheDocument();
  });

  it('resets the active tab when loaded config disables About', async () => {
    const user = userEvent.setup();
    const { rerender } = renderSettings();

    await user.click(screen.getByText('com_nav_setting_about'));
    expect(screen.getByTestId('about-panel')).toBeInTheDocument();

    mockUseGetStartupConfig.mockReturnValue({ data: { interface: { buildInfo: false } } });
    rerender(<Settings open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.queryByTestId('about-panel')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('general-panel')).toBeInTheDocument();
  });
});
