import { renderHook } from '@testing-library/react';

import useUnifiedSidebarLinks from '../useUnifiedSidebarLinks';

jest.mock('recoil', () => ({
  useRecoilValue: () => ({ endpoint: 'openAI' }),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    conversationByIndex: () => 'conversationByIndex',
  },
}));

jest.mock('librechat-data-provider', () => ({
  getConfigDefaults: () => ({ interface: { parameters: true } }),
  getEndpointField: () => 'openAI',
}));

jest.mock('librechat-data-provider/react-query', () => ({
  useUserKeyQuery: () => ({ data: { expiresAt: undefined } }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { interface: { parameters: true } } }),
  useGetEndpointsQuery: () => ({ data: { openAI: { userProvide: false } } }),
}));

jest.mock('~/components/UnifiedSidebar/ConversationsSection', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('~/hooks/Nav/useSideNavLinks', () => ({
  __esModule: true,
  default: () => {
    const MockIcon = () => null;

    return [
      {
        title: 'com_sidepanel_parameters',
        label: '',
        icon: MockIcon,
        id: 'parameters',
      },
      {
        title: 'com_sidepanel_attach_files',
        label: '',
        icon: MockIcon,
        id: 'files',
      },
    ];
  },
}));

describe('useUnifiedSidebarLinks', () => {
  it('does not expose model parameters in the primary sidebar links', () => {
    const { result } = renderHook(() => useUnifiedSidebarLinks());
    const ids = result.current.map((link) => link.id);

    expect(ids).toContain('conversations');
    expect(ids).toContain('files');
    expect(ids).not.toContain('parameters');
  });
});
