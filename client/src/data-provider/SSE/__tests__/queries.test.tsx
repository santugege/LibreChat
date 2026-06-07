import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { queueTitleGeneration, useTitleGeneration } from '../queries';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getActiveJobs: jest.fn(),
      genTitle: jest.fn(),
    },
  };
});

const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const conversation = (conversationId: string): TConversation =>
  ({
    conversationId,
    title: 'New Chat',
    endpoint: null,
    createdAt: '2026-06-07T00:00:00.000Z',
    updatedAt: '2026-06-07T00:00:00.000Z',
  }) as TConversation;

describe('useTitleGeneration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (dataService.getActiveJobs as jest.Mock).mockResolvedValue({ activeJobIds: [] });
  });

  it('retries when title is not ready yet and applies the generated title later', async () => {
    const queryClient = createQueryClient();
    const conversationId = 'convo-title-race';

    queryClient.setQueryData(
      [QueryKeys.conversation, conversationId],
      conversation(conversationId),
    );

    (dataService.genTitle as jest.Mock)
      .mockRejectedValueOnce(new Error('Title not found'))
      .mockResolvedValueOnce({ title: 'Deployment Checklist' });

    renderHook(() => useTitleGeneration(true), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      queueTitleGeneration(conversationId);
    });

    await waitFor(() => {
      expect(dataService.genTitle).toHaveBeenCalledTimes(1);
    });

    await waitFor(
      () => {
        expect(dataService.genTitle).toHaveBeenCalledTimes(2);
      },
      { timeout: 5000 },
    );

    await waitFor(() => {
      expect(
        queryClient.getQueryData<TConversation>([QueryKeys.conversation, conversationId])?.title,
      ).toBe('Deployment Checklist');
    });
  });
});
