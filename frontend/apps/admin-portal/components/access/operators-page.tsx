'use client';

import { Button } from '@aahar/ui';
import type { AccessUser, UserStatus } from '@aahar/api-client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Pencil, Plus, XCircle } from 'lucide-react';
import { useState } from 'react';
import { UserDialog } from '@/components/access/user-dialog';
import { useAuth } from '@/components/auth-provider';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  AppPageHeader,
  DateTimeCell,
  EmptyState,
  ListPager,
  RowAction,
  tableStyles,
} from '@/components/design-system';
import { FilterField, FiltersMenu, ListToolbar, RefreshButton } from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import { LoadError } from '@/components/location-empty-states';
import { Badge, Panel, Select, Skeleton } from '@/components/ui';
import { FilterSearch } from '@/components/ui-controls';
import { userApi } from '@/lib/api';
import { useListLimit } from '@/lib/list-limit';
import { queryKeys } from '@/lib/query-keys';
import {
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const headers = [
  'Name',
  'Email',
  'Mobile',
  'Code',
  'Type',
  'Location',
  'Status',
  'Last login at',
  'Actions',
];

/** The people holding an operator role (POS, kitchen, delivery, inventory); admins are on /users. */
export function OperatorsPageClient() {
  const { hasPermission } = useAuth();
  // The server refuses the save without these, so the screen does not offer it.
  const canEdit = hasPermission('USER_UPDATE');
  const [editing, setEditing] = useState<AccessUser | null | undefined>(undefined);
  // Search, type, status and page live in the URL, as on every list.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [typeFilter, setTypeFilter] = useUrlParam('type');
  const [statusFilter, setStatusFilter] = useUrlParam<'' | UserStatus>('status', '', [
    'ACTIVE',
    'DISABLED',
  ]);
  const [page, setPage] = useUrlNumberParam('page');
  const [limit, setLimit] = useListLimit(setPage, 25);
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => setPage(1));

  const operatorsQuery = useQuery({
    queryKey: queryKeys.accessUsers(
      'OPERATORS',
      search,
      scopedHospitalId ?? 'all',
      typeFilter,
      statusFilter,
      page,
      limit,
    ),
    queryFn: async () =>
      (
        await userApi.listUsers({
          group: 'OPERATORS',
          hospitalId: scopedHospitalId,
          limit,
          page,
          roleId: typeFilter || undefined,
          search,
          status: statusFilter || undefined,
        })
      ).data,
  });
  const rolesQuery = useQuery({
    queryKey: queryKeys.accessRoles(),
    queryFn: async () => (await userApi.listRoles({ limit: 100, page: 1 })).data,
  });
  const types = (rolesQuery.data?.items ?? []).filter((role) => role.isOperator);
  const operators = operatorsQuery.data?.items ?? [];
  const meta = operatorsQuery.data?.meta ?? { limit, page, total: 0, totalPages: 1 };
  const hasFilters = Boolean(searchInput || typeFilter || statusFilter);

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  function clearFilters() {
    changeFilter(() => {
      setSearch('');
      setTypeFilter('');
      setStatusFilter('');
    });
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          hasPermission('USER_CREATE') ? (
            <Button onClick={() => setEditing(null)} type="button">
              <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              New Operator
            </Button>
          ) : undefined
        }
        count={operatorsQuery.data?.meta.total}
        description="Restaurant/POS, kitchen, delivery and inventory staff, each at one location."
        title="Operators"
      />
      <Panel className="overflow-hidden">
        <ListToolbar>
          <FilterSearch
            label="Search operators"
            onChange={(value) => changeFilter(() => setSearch(value))}
            placeholder="Name, email, mobile or code"
            value={searchInput}
          />
          <FiltersMenu activeCount={statusFilter ? 1 : 0}>
            <FilterField label="Status">
              <Select
                onChange={(event) =>
                  changeFilter(() => setStatusFilter(event.target.value as '' | UserStatus))
                }
                value={statusFilter}
              >
                <option value="">All</option>
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </Select>
            </FilterField>
          </FiltersMenu>
          <RefreshButton onClick={() => void operatorsQuery.refetch()} />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        <div className="border-b border-ds-divider p-3">
          <div className="max-w-xs">
            <FilterField label="Type">
              <Select
                onChange={(event) => changeFilter(() => setTypeFilter(event.target.value))}
                value={typeFilter}
              >
                <option value="">All</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </FilterField>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'min-w-[1000px]')}>
            <thead className={tableStyles.head}>
              <tr>
                {headers.map((header) => (
                  <th
                    className={cn(tableStyles.th, header === 'Actions' && 'pr-3 text-right')}
                    key={header}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {operatorsQuery.isLoading
                ? Array.from({ length: 6 }, (_, index) => (
                    <tr className="border-t border-ds-divider" key={`operator-skeleton-${index}`}>
                      <td className="px-4 py-3" colSpan={headers.length}>
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : null}
              {operators.map((operator) => {
                const active = operator.status === 'ACTIVE';

                return (
                  <tr className={tableStyles.row} data-record-id={operator.id} key={operator.id}>
                    <td className={cn(tableStyles.td, tableStyles.title)}>{operator.name}</td>
                    <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                      {operator.email ?? '—'}
                    </td>
                    <td className={cn(tableStyles.td, 'text-ds-text-2')}>{operator.mobile}</td>
                    <td className={cn(tableStyles.td, tableStyles.code)}>
                      {operator.employeeCode}
                    </td>
                    <td className={tableStyles.td}>
                      {operator.roles.map((role) => role.name).join(', ')}
                    </td>
                    <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                      {operator.hospitals.length ? (
                        operator.hospitals.map((hospital) => hospital.name).join(', ')
                      ) : (
                        <Badge variant="warning">None assigned</Badge>
                      )}
                    </td>
                    <td className={tableStyles.td}>
                      <span
                        aria-label={active ? 'Active' : 'Disabled'}
                        className="inline-flex"
                        role="img"
                        title={active ? 'Active' : 'Disabled'}
                      >
                        {active ? (
                          <CheckCircle2
                            aria-hidden="true"
                            className="h-5 w-5 text-ds-status-ok-fg"
                          />
                        ) : (
                          <XCircle aria-hidden="true" className="h-5 w-5 text-ds-status-bad-fg" />
                        )}
                      </span>
                    </td>
                    <td className={tableStyles.td}>
                      {operator.lastLoginAt ? (
                        <DateTimeCell value={operator.lastLoginAt} />
                      ) : (
                        <span className="text-ds-muted">Never</span>
                      )}
                    </td>
                    <td className={cn(tableStyles.td, 'pr-3')}>
                      {canEdit ? (
                        <span className="flex justify-end">
                          <RowAction
                            icon={Pencil}
                            label={`Edit ${operator.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditing(operator);
                            }}
                            title="Edit"
                          />
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!operatorsQuery.isLoading && operators.length === 0 ? (
                <tr>
                  <td className="p-4" colSpan={headers.length}>
                    {operatorsQuery.isError ? (
                      <div className="py-6">
                        <LoadError error={operatorsQuery.error} />
                      </div>
                    ) : (
                      <EmptyState
                        action={
                          hasFilters ? (
                            <Button onClick={clearFilters} type="button" variant="outline">
                              Clear filters
                            </Button>
                          ) : undefined
                        }
                        description={
                          hasFilters
                            ? 'Try another name or clear the filters.'
                            : 'Add the first operator to give them access.'
                        }
                        title={hasFilters ? 'No operators match' : 'No operators found'}
                      />
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <ListPager
          limit={meta.limit}
          noun="operator"
          onLimitChange={setLimit}
          onPageChange={setPage}
          page={meta.page}
          total={meta.total}
          totalPages={meta.totalPages}
        />
      </Panel>
      {editing !== undefined ? (
        <UserDialog
          noun="operator"
          onClose={() => setEditing(undefined)}
          roles={types}
          user={editing}
        />
      ) : null}
    </section>
  );
}
