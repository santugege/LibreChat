import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import {
  useGetAdminUsers,
  useSearchAdminUsers,
  useGetSubscriptionAdminOrders,
} from './queries';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('librechat-data-provider', () => ({
  QueryKeys: {
    adminUsers: 'adminUsers',
    adminUserSearch: 'adminUserSearch',
    subscriptionAdminOrders: 'subscriptionAdminOrders',
  },
  dataService: {
    getAdminUsers: jest.fn(),
    searchAdminUsers: jest.fn(),
    getSubscriptionAdminOrders: jest.fn(),
  },
}));

const mockUseQuery = useQuery as jest.Mock;

describe('admin queries', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: undefined });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('queries paginated admin users', () => {
    const params = { limit: 20, offset: 40 };
    useGetAdminUsers(params, { enabled: true });

    expect(mockUseQuery).toHaveBeenCalledWith(
      [QueryKeys.adminUsers, params],
      expect.any(Function),
      expect.objectContaining({ enabled: true }),
    );

    const queryFn = mockUseQuery.mock.calls[0][1];
    queryFn();
    expect(dataService.getAdminUsers).toHaveBeenCalledWith(params);
  });

  it('queries admin user search only when a search term exists', () => {
    const params = { q: 'ada@example.com', limit: 10 };
    useSearchAdminUsers(params, { enabled: true });

    expect(mockUseQuery).toHaveBeenCalledWith(
      [QueryKeys.adminUserSearch, params],
      expect.any(Function),
      expect.objectContaining({ enabled: true }),
    );

    const queryFn = mockUseQuery.mock.calls[0][1];
    queryFn();
    expect(dataService.searchAdminUsers).toHaveBeenCalledWith(params);
  });

  it('disables admin user search for blank search terms', () => {
    const params = { q: '   ', limit: 10 };
    useSearchAdminUsers(params, { enabled: true });

    expect(mockUseQuery).toHaveBeenCalledWith(
      [QueryKeys.adminUserSearch, params],
      expect.any(Function),
      expect.objectContaining({ enabled: false }),
    );
  });

  it('queries subscription admin orders with filters', () => {
    const params = { limit: 20, offset: 0, status: 'completed' as const };
    useGetSubscriptionAdminOrders(params, { enabled: true });

    expect(mockUseQuery).toHaveBeenCalledWith(
      [QueryKeys.subscriptionAdminOrders, params],
      expect.any(Function),
      expect.objectContaining({ enabled: true }),
    );

    const queryFn = mockUseQuery.mock.calls[0][1];
    queryFn();
    expect(dataService.getSubscriptionAdminOrders).toHaveBeenCalledWith(params);
  });
});
