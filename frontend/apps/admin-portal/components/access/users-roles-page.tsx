'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccessUser, UserStatus } from '@aahar/api-client';
import { Loader2, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import {
  AppPageHeader,
  EmptyState,
  ListPager,
  RecordAvatar,
  RowAction,
  StatStrip,
  tableStyles,
} from '@/components/design-system';
import { BulkLocationBar } from '@/components/access/bulk-location-bar';
import { UserDialog } from '@/components/access/user-dialog';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { FilterField, FiltersMenu, ListToolbar, RefreshButton } from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Badge, Panel, Select, Skeleton } from '@/components/ui';
import { FilterSearch, Modal } from '@/components/ui-controls';
import {
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { getApiErrorMessage, userApi } from '@/lib/api';
import { LoadError } from '@/components/location-empty-states';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

const userPageSize = 50;

/** Mirrors the server guard: only a Super Admin may change Super Admin access. */
const SUPER_ADMIN_ROLE = 'Super Admin';

function PermissionsDialog({ user, onClose }: Readonly<{ onClose: () => void; user: AccessUser }>) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const permissionsQuery = useQuery({
    queryKey: queryKeys.userPermissions(user.id),
    queryFn: async () => (await userApi.getUserPermissions(user.id)).data,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (permissionsQuery.data) setSelected(new Set(permissionsQuery.data.effectivePermissionIds));
  }, [permissionsQuery.data]);
  const saveMutation = useMutation({
    mutationFn: () => userApi.replaceUserPermissions(user.id, [...selected]),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Permissions were not saved',
        variant: 'error',
      });
    },
    onSuccess(response) {
      setSelected(new Set(response.data.effectivePermissionIds));
      void queryClient.invalidateQueries({ queryKey: queryKeys.userPermissions(user.id) });
      showToast({ recordId: user.id, title: 'Permissions saved', variant: 'success' });
      onClose();
    },
  });
  const groups = useMemo(() => {
    const permissions = permissionsQuery.data?.permissions ?? [];
    return permissions.reduce<Record<string, typeof permissions>>((result, permission) => {
      (result[permission.module] ??= []).push(permission);
      return result;
    }, {});
  }, [permissionsQuery.data]);
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  return (
    <Modal
      footer={
        <div className="flex justify-end gap-2">
          <Button
            disabled={saveMutation.isPending}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={
              permissionsQuery.isLoading || permissionsQuery.isError || saveMutation.isPending
            }
            onClick={() => saveMutation.mutate()}
            type="button"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save
            Permissions
          </Button>
        </div>
      }
      onClose={() => {
        if (!saveMutation.isPending) onClose();
      }}
      open
      side
      title={`Permissions — ${user.name}`}
    >
      <p className="mb-4 text-sm text-ds-muted">
        Saved selections override the permissions inherited from the user’s role.
      </p>
      <div>
        {permissionsQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((row) => (
              <Skeleton className="h-16 w-full" key={row} />
            ))}
          </div>
        ) : null}
        {permissionsQuery.isError ? (
          <div className="rounded-md border border-ds-status-bad-fg/25 bg-ds-status-bad-bg p-4">
            <LoadError error={permissionsQuery.error} />
          </div>
        ) : null}
        {!permissionsQuery.isLoading &&
        !permissionsQuery.isError &&
        Object.keys(groups).length === 0 ? (
          <p className="py-8 text-center text-sm text-ds-muted">No permissions are available.</p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(groups).map(([module, permissions]) => (
            <section className="rounded-lg border border-ds-border p-4" key={module}>
              <h3 className="mb-3 text-sm font-semibold text-ds-text">
                {module.replaceAll('_', ' ')}
              </h3>
              <div className="space-y-2">
                {permissions.map((permission) => (
                  <label
                    className="flex cursor-pointer items-start gap-3 text-sm text-ds-text-2"
                    key={permission.id}
                  >
                    <input
                      checked={selected.has(permission.id)}
                      className="mt-0.5 h-4 w-4 rounded-sm border-ds-input text-ds-link focus:ring-ds-primary"
                      onChange={() => toggle(permission.id)}
                      type="checkbox"
                    />
                    <span>
                      <span className="font-medium">
                        {permission.description ?? permission.code}
                      </span>
                      <span className="ml-2 text-xs text-ds-muted">{permission.code}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function UsersRolesPageClient() {
  const { roles: actorRoles } = useAuth();
  const isSuperAdmin = actorRoles.includes(SUPER_ADMIN_ROLE);
  const [editingUser, setEditingUser] = useState<AccessUser | null | undefined>(undefined);
  const [permissionUser, setPermissionUser] = useState<AccessUser | null>(null);
  // Search, status, role and page live in the URL; the search box updates at once and the
  // query waits for a pause in typing.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [statusFilter, setStatusFilter] = useUrlParam<'' | UserStatus>('status', '', [
    'ACTIVE',
    'DISABLED',
  ]);
  const [roleFilter, setRoleFilter] = useUrlParam('role');
  const [page, setPage] = useUrlNumberParam('page');
  // The users working at the location chosen in the sidebar ("All Locations": everyone reachable).
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const hospitalScope = scopedHospitalId ?? 'all';

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => setPage(1));

  const usersQuery = useQuery({
    queryKey: queryKeys.accessUsers(search, hospitalScope, statusFilter, roleFilter, page),
    queryFn: async () =>
      (
        await userApi.listUsers({
          hospitalId: scopedHospitalId,
          limit: userPageSize,
          page,
          roleId: roleFilter || undefined,
          search,
          status: statusFilter || undefined,
        })
      ).data,
  });
  const rolesQuery = useQuery({
    queryKey: queryKeys.accessRoles(),
    queryFn: async () => (await userApi.listRoles({ limit: 100, page: 1 })).data,
  });
  const roles = rolesQuery.data?.items ?? [];
  const superAdminRoleId = roles.find((role) => role.name === SUPER_ADMIN_ROLE)?.id;
  // Totals at the chosen location; Super Admins once the roles say which role that is.
  const statsQuery = useQuery({
    enabled: !rolesQuery.isLoading,
    queryFn: async () => {
      const count = async (query: { roleId?: string; status?: UserStatus }) =>
        (await userApi.listUsers({ ...query, hospitalId: scopedHospitalId, limit: 1, page: 1 }))
          .data.meta.total;
      const [all, active, disabled, superAdmins] = await Promise.all([
        count({}),
        count({ status: 'ACTIVE' }),
        count({ status: 'DISABLED' }),
        superAdminRoleId ? count({ roleId: superAdminRoleId }) : null,
      ]);

      return { active, all, disabled, superAdmins };
    },
    queryKey: queryKeys.accessUsers('stats', hospitalScope, superAdminRoleId ?? 'none'),
  });
  const stats = statsQuery.data;
  const users = usersQuery.data?.items ?? [];
  const meta = usersQuery.data?.meta ?? {
    limit: userPageSize,
    page,
    total: 0,
    totalPages: 1,
  };
  const isLocked = (user: AccessUser) =>
    !isSuperAdmin && user.roles.some((role) => role.name === SUPER_ADMIN_ROLE);
  const lockedReason = 'Only a Super Admin can change Super Admin access';
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectableUsers = users.filter((user) => !isLocked(user));
  const selectedUsers = users.filter((user) => selectedIds.has(user.id));
  const allSelected = selectableUsers.length > 0 && selectedIds.size === selectableUsers.length;
  const toggleOne = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const hasFilters = Boolean(searchInput || statusFilter || roleFilter);

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  function clearFilters() {
    changeFilter(() => {
      setSearch('');
      setStatusFilter('');
      setRoleFilter('');
    });
  }

  /** A stat's filter alone: the status or the role, the other cleared. */
  function showOnly(status: '' | UserStatus, roleId: string) {
    changeFilter(() => {
      setStatusFilter(status);
      setRoleFilter(roleId);
    });
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          <Button onClick={() => setEditingUser(null)} type="button">
            <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            New user
          </Button>
        }
        count={stats?.all}
        description="Create users, assign roles, and manage individual permission overrides."
        title="Users / Roles"
      />
      <StatStrip
        label="Users at a glance"
        stats={[
          {
            active: !statusFilter && !roleFilter,
            label: 'Users',
            onSelect: () => showOnly('', ''),
            share: stats?.all ? 1 : undefined,
            value: stats?.all ?? '–',
          },
          {
            active: statusFilter === 'ACTIVE' && !roleFilter,
            label: 'Active',
            onSelect: () => showOnly('ACTIVE', ''),
            share: stats?.all ? stats.active / stats.all : undefined,
            tone: 'ok',
            value: stats?.active ?? '–',
          },
          {
            active: statusFilter === 'DISABLED' && !roleFilter,
            label: 'Disabled',
            onSelect: () => showOnly('DISABLED', ''),
            share: stats?.all ? stats.disabled / stats.all : undefined,
            tone: 'bad',
            value: stats?.disabled ?? '–',
          },
          {
            active: Boolean(superAdminRoleId) && roleFilter === superAdminRoleId && !statusFilter,
            label: 'Super Admins',
            onSelect: superAdminRoleId ? () => showOnly('', superAdminRoleId) : undefined,
            share:
              stats?.all && stats.superAdmins !== null ? stats.superAdmins / stats.all : undefined,
            tone: 'pending',
            value: stats?.superAdmins ?? '–',
          },
        ]}
      />
      <Panel className="overflow-hidden">
        <ListToolbar>
          <FilterSearch
            label="Search users"
            onChange={(value) => changeFilter(() => setSearch(value))}
            placeholder="Name, email, mobile or code"
            value={searchInput}
          />
          <FiltersMenu activeCount={[statusFilter, roleFilter].filter(Boolean).length}>
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
            <FilterField label="Role">
              <Select
                onChange={(event) => changeFilter(() => setRoleFilter(event.target.value))}
                value={roleFilter}
              >
                <option value="">All roles</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </FilterField>
          </FiltersMenu>
          <RefreshButton
            onClick={() => {
              void usersQuery.refetch();
              void statsQuery.refetch();
            }}
          />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        {selectedUsers.length > 0 ? (
          <BulkLocationBar onDone={() => setSelectedIds(new Set())} selected={selectedUsers} />
        ) : null}
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'min-w-[900px]')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-10 pr-0')}>
                  <input
                    aria-label="Select all users"
                    checked={allSelected}
                    disabled={selectableUsers.length === 0}
                    onChange={(event) =>
                      setSelectedIds(
                        event.target.checked
                          ? new Set(selectableUsers.map((user) => user.id))
                          : new Set(),
                      )
                    }
                    type="checkbox"
                  />
                </th>
                <th className={tableStyles.th}>User</th>
                <th className={tableStyles.th}>Employee code</th>
                <th className={tableStyles.th}>Role</th>
                <th className={tableStyles.th}>Locations</th>
                <th className={tableStyles.th}>Status</th>
                <th className={cn(tableStyles.th, 'w-24')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.isLoading
                ? Array.from({ length: 6 }, (_, index) => (
                    <tr className="border-t border-ds-divider" key={`user-skeleton-${index}`}>
                      <td className="px-4 py-3" colSpan={7}>
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : null}
              {users.map((user) => {
                const locked = isLocked(user);

                return (
                  <tr
                    className={cn(tableStyles.row, locked && 'cursor-default')}
                    data-record-id={user.id}
                    key={user.id}
                    onClick={locked ? undefined : () => setEditingUser(user)}
                    title={locked ? lockedReason : undefined}
                  >
                    {/* Its own click: ticking a user does not open them. */}
                    <td
                      className={cn(tableStyles.td, 'pr-0')}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        aria-label={`Select ${user.name}`}
                        checked={selectedIds.has(user.id)}
                        disabled={locked}
                        onChange={() => toggleOne(user.id)}
                        title={locked ? lockedReason : undefined}
                        type="checkbox"
                      />
                    </td>
                    <td className={tableStyles.td}>
                      <span className="flex min-w-0 items-center gap-3">
                        <RecordAvatar name={user.name} />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className={cn('truncate', tableStyles.title)}>{user.name}</span>
                          <span className="truncate text-[12.5px] text-ds-muted">
                            {user.email ?? user.mobile}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className={cn(tableStyles.td, tableStyles.code)}>{user.employeeCode}</td>
                    <td className={tableStyles.td}>
                      {/* Roles as chips; Super Admin stands out, as only it can change Super Admin access. */}
                      {user.roles.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {user.roles.map((role) => (
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
                                role.name === SUPER_ADMIN_ROLE
                                  ? 'bg-ds-primary-soft text-ds-link'
                                  : 'bg-ds-subtle text-ds-text-2 ring-1 ring-ds-border',
                              )}
                              key={role.id}
                            >
                              {role.name}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-ds-muted">Unassigned</span>
                      )}
                    </td>
                    <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                      {user.locationScope === 'ALL' ? (
                        <Badge variant="info">All locations</Badge>
                      ) : user.hospitals.length === 0 ? (
                        <Badge variant="warning">None assigned</Badge>
                      ) : (
                        user.hospitals.map((hospital) => hospital.name).join(', ')
                      )}
                    </td>
                    <td className={tableStyles.td}>
                      <Badge variant={user.status === 'ACTIVE' ? 'success' : 'danger'}>
                        {user.status.toLowerCase()}
                      </Badge>
                    </td>
                    <td className={cn(tableStyles.td, 'pr-3')}>
                      <span className="flex justify-end gap-0.5">
                        <RowAction
                          disabled={locked}
                          icon={Pencil}
                          label={`Edit ${user.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingUser(user);
                          }}
                          title={locked ? lockedReason : 'Edit'}
                        />
                        <RowAction
                          disabled={locked}
                          icon={ShieldCheck}
                          label={`Permissions for ${user.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPermissionUser(user);
                          }}
                          title={locked ? lockedReason : 'Permissions'}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!usersQuery.isLoading && users.length === 0 ? (
                <tr>
                  <td className="p-4" colSpan={7}>
                    {usersQuery.isError ? (
                      <div className="py-6">
                        <LoadError error={usersQuery.error} />
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
                            : 'Create the first user to give someone access.'
                        }
                        title={hasFilters ? 'No users match' : 'No users found'}
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
          noun="user"
          onPageChange={setPage}
          page={meta.page}
          total={meta.total}
          totalPages={meta.totalPages}
        />
      </Panel>
      {editingUser !== undefined ? (
        <UserDialog
          onClose={() => setEditingUser(undefined)}
          roles={roles.filter((role) => isSuperAdmin || role.name !== SUPER_ADMIN_ROLE)}
          user={editingUser}
        />
      ) : null}
      {permissionUser ? (
        <PermissionsDialog onClose={() => setPermissionUser(null)} user={permissionUser} />
      ) : null}
    </section>
  );
}
