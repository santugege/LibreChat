import { fireEvent, render, screen } from '@testing-library/react';

import OutputRenderer from '../OutputRenderer';

const mockSubscriptionPlansDialog = jest.fn(({ open }: { open: boolean }) =>
  open ? <div data-testid="plans-dialog" /> : null,
);

jest.mock('copy-to-clipboard', () => jest.fn());

jest.mock('~/components/Messages/Content/CopyButton', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <button aria-label={label} type="button" />,
}));

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

    if (key === 'com_ui_copy') {
      return 'Copy';
    }

    return key;
  },
}));

jest.mock('~/components/Nav/SettingsTabs/Subscription/SubscriptionPlansDialog', () => ({
  __esModule: true,
  default: (props: { open: boolean }) => mockSubscriptionPlansDialog(props),
}));

describe('OutputRenderer', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    JSON.stringify({
      type: 'subscription_quota',
      kind: 'image',
      used: 5,
      limit: 5,
      planKey: 'free',
      resetAt: '2026-05-05T16:00:00.000Z',
    }),
    `Error processing tool image_gen_oai: ${JSON.stringify({
      type: 'subscription_quota',
      kind: 'image',
      used: 5,
      limit: 5,
      planKey: 'free',
      resetAt: '2026-05-05T16:00:00.000Z',
    })}`,
  ])('renders image quota subscription CTA for %s', (text) => {
    render(<OutputRenderer text={text} />);

    expect(screen.getByText('今日图片额度已用完')).toBeInTheDocument();
    expect(screen.getByText(/已使用 5 \/ 5，当前套餐：free。重置时间：/)).toBeInTheDocument();
    expect(screen.queryByText(/Error processing tool image_gen_oai/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看订阅套餐' }));

    expect(screen.getByTestId('plans-dialog')).toBeInTheDocument();
  });

  test('keeps generic tool errors as text output', () => {
    render(<OutputRenderer text="Error processing tool calculator: boom" />);

    expect(screen.getByText('Error processing tool calculator: boom')).toBeInTheDocument();
    expect(screen.queryByText('今日图片额度已用完')).not.toBeInTheDocument();
  });
});
