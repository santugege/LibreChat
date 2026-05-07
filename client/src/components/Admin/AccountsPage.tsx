import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type t from 'librechat-data-provider';
import { useGetAdminUsers, useSearchAdminUsers } from '~/data-provider';
import { useLocalize } from '~/hooks';
import PaginationControls from './PaginationControls';

const pageSize = 20;

function getDisplayDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : '';
}

function AccountsPage() {
  const localize = useLocalize();
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const trimmedSearch = search.trim();
  const isSearching = trimmedSearch.length >= 2;
  const listQuery = useGetAdminUsers({ limit: pageSize, offset }, { enabled: !isSearching });
  const searchQuery = useSearchAdminUsers({ q: trimmedSearch, limit: pageSize });
  const users = useMemo<t.TAdminUserListItem[]>(() => {
    if (!isSearching) {
      return listQuery.data?.users ?? [];
    }

    return (searchQuery.data?.users ?? []).map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username ?? '',
      email: user.email,
      avatar: user.avatarUrl ?? '',
      role: '',
      provider: '',
    }));
  }, [isSearching, listQuery.data?.users, searchQuery.data?.users]);
  const total = isSearching ? searchQuery.data?.total ?? users.length : listQuery.data?.total ?? 0;
  const isLoading = isSearching ? searchQuery.isLoading : listQuery.isLoading;
  const isError = isSearching ? searchQuery.isError : listQuery.isError;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-xl font-semibold text-text-primary">
          {localize('com_admin_accounts_title')}
        </h1>
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">{localize('com_admin_accounts_search')}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
            aria-hidden="true"
          />
          <input
            className="h-10 w-full rounded-md border border-border-light bg-transparent pl-9 pr-3 text-sm outline-none focus:border-border-heavy"
            value={search}
            placeholder={localize('com_admin_accounts_search')}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
          />
        </label>
      </div>

      {isError && (
        <div className="rounded-md border border-red-500/40 p-3 text-sm text-red-600" role="alert">
          {localize('com_admin_accounts_error')}
        </div>
      )}

      <div className="min-h-0 overflow-auto rounded-lg border border-border-light">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-surface-secondary text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">{localize('com_admin_accounts_user')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_accounts_email')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_accounts_role')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_accounts_provider')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_accounts_created')}</th>
              <th className="px-3 py-2 font-medium">{localize('com_admin_accounts_updated')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-3 py-6 text-center text-text-secondary" colSpan={6}>
                  {localize('com_admin_loading')}
                </td>
              </tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-text-secondary" colSpan={6}>
                  {localize('com_admin_accounts_empty')}
                </td>
              </tr>
            )}
            {!isLoading &&
              users.map((user) => (
                <tr key={user.id} className="border-t border-border-light">
                  <td className="px-3 py-3">
                    <div className="font-medium text-text-primary">{user.name || user.username}</div>
                    <div className="text-xs text-text-secondary">{user.username}</div>
                  </td>
                  <td className="px-3 py-3 text-text-primary">{user.email}</td>
                  <td className="px-3 py-3 text-text-secondary">{user.role}</td>
                  <td className="px-3 py-3 text-text-secondary">{user.provider}</td>
                  <td className="px-3 py-3 text-text-secondary">{getDisplayDate(user.createdAt)}</td>
                  <td className="px-3 py-3 text-text-secondary">{getDisplayDate(user.updatedAt)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!isSearching && (
        <PaginationControls
          total={total}
          limit={pageSize}
          offset={offset}
          onOffsetChange={setOffset}
        />
      )}
    </section>
  );
}

export default React.memo(AccountsPage);
