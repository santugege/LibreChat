import { render, screen } from '@testing-library/react';

import Error from '../Error';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, params?: Record<string, string | number>) => {
    if (key === 'com_error_subscription_quota') {
      return `Daily text limit reached: ${params?.['0']}/${params?.['1']} on ${params?.['2']}. Resets at ${params?.['3']}.`;
    }

    return key;
  },
}));

describe('message Error content', () => {
  test('renders subscription quota errors with a user-facing message', () => {
    render(
      <Error
        text={JSON.stringify({
          type: 'subscription_quota',
          kind: 'text',
          used: 20,
          limit: 20,
          planKey: 'free',
          resetAt: '2026-05-03T00:00:00.000Z',
        })}
      />,
    );

    expect(
      screen.getByText(
        'Daily text limit reached: 20/20 on free. Resets at 2026-05-03T00:00:00.000Z.',
      ),
    ).toBeInTheDocument();
  });
});
