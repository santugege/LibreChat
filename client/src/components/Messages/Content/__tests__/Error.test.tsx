import { fireEvent, render, screen } from '@testing-library/react';

import Error from '../Error';

const mockSubscriptionPlansDialog = jest.fn(({ open }: { open: boolean }) =>
  open ? <div data-testid="plans-dialog" /> : null,
);
const mockSettings = jest.fn(({ open }: { open: boolean }) =>
  open ? <div data-testid="settings-dialog" /> : null,
);

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, params?: Record<string, string | number>) => {
    if (key === 'com_error_subscription_quota_title_text') {
      return '今日文本额度已用完';
    }

    if (key === 'com_error_subscription_quota_title_image') {
      return '今日图片额度已用完';
    }

    if (key === 'com_error_subscription_quota_body') {
      return `已使用 ${params?.['0']} / ${params?.['1']}，当前套餐：${params?.['2']}。重置时间：${params?.['3']}。`;
    }

    if (key === 'com_error_subscription_quota_help') {
      return '订阅套餐可获得更高每日额度。';
    }

    if (key === 'com_error_subscription_quota_action') {
      return '查看订阅套餐';
    }

    return key;
  },
}));

jest.mock('~/components/Nav/SettingsTabs/Subscription/SubscriptionPlansDialog', () => ({
  __esModule: true,
  default: (props: { open: boolean }) => mockSubscriptionPlansDialog(props),
}));

jest.mock('~/components/Nav/Settings', () => ({
  __esModule: true,
  default: (props: { open: boolean }) => mockSettings(props),
}));

describe('message Error content', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders subscription quota errors with a Chinese subscription CTA', () => {
    render(
      <Error
        text={JSON.stringify({
          type: 'subscription_quota',
          kind: 'text',
          used: 2,
          limit: 2,
          planKey: 'free',
          resetAt: '2026-05-05T16:00:00.000Z',
        })}
      />,
    );

    expect(screen.getByText('今日文本额度已用完')).toBeInTheDocument();
    expect(screen.getByText(/已使用 2 \/ 2，当前套餐：free。重置时间：/)).toBeInTheDocument();
    expect(screen.getByText('订阅套餐可获得更高每日额度。')).toBeInTheDocument();
    expect(screen.queryByText(/Daily text limit reached/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看订阅套餐' }));

    expect(screen.getByTestId('plans-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument();
    expect(mockSettings).not.toHaveBeenCalled();
  });
});
