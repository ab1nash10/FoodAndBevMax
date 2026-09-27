'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccessUser } from '@aahar/api-client';
import { Loader2, Pencil, Plus, RefreshCw, ShieldCheck, UsersRound, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { BulkLocationBar } from '@/components/access/bulk-location-bar';
import { UserDialog } from '@/components/access/user-dialog';
import { useToast } from '@/components/toast-provider';
import { Badge, Input, Panel, Skeleton } from '@/components/ui';
import { getApiErrorMessage, userApi } from '@/lib/api';

/** Mirrors the server guard: only a Super Admin may change Super Admin access. */
const SUPER_ADMIN_ROLE = 'Super Admin';

function PermissionsDialog({ user, onClose }: Readonly<{ onClose: () => void; user: AccessUser }>) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const permissionsQuery = useQuery({
    queryKey: ['user-permissions', user.id],
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
      void queryClient.invalidateQueries({ queryKey: ['user-permissions', user.id] });
      showToast({ title: 'Permissions saved', variant: 'success' });
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
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit permissions for ${user.name}`}
    >
      <Panel className="flex max-h-[85vh] w-full max-w-3xl flex-col p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-100">
              Edit Permissions — {user.name}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Saved selections override the permissions inherited from the user’s role.
            </p>
          </div>
          <Button
            aria-label="Close"
            disabled={saveMutation.isPending}
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {permissionsQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((row) => (
                <Skeleton className="h-16 w-full" key={row} />
              ))}
            </div>
          ) : null}
          {permissionsQuery.isError ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {getApiErrorMessage(permissionsQuery.error)}
            </p>
          ) : null}
          {!permissionsQuery.isLoading &&
          !permissionsQuery.isError &&
          Object.keys(groups).length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No permissions are available.</p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(groups).map(([module, permissions]) => (
              <section
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                key={module}
              >
                <h3 className="mb-3 text-sm font-semibold text-slate-950 dark:text-slate-100">
                  {module.replaceAll('_', ' ')}
                </h3>
                <div className="space-y-2">
                  {permissions.map((permission) => (
                    <label
                      className="flex cursor-pointer items-start gap-3 text-sm text-slate-700 dark:text-slate-300"
                      key={permission.id}
                    >
                      <input
                        checked={selected.has(permission.id)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                        onChange={() => toggle(permission.id)}
                        type="checkbox"
                      />
                      <span>
                        <span className="font-medium">
                          {permission.description ?? permission.code}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">{permission.code}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
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
      </Panel>
    </div>
  );
}

export function UsersRolesPageClient() {
  const { roles: actorRoles } = useAuth();
  const isSuperAdmin = actorRoles.includes(SUPER_ADMIN_ROLE);
  const [editingUser, setEditingUser] = useState<AccessUser | null | undefined>(undefined);
  const [permissionUser, setPermissionUser] = useState<AccessUser | null>(null);
  const [search, setSearch] = useState('');
  const usersQuery = useQuery({
    queryKey: ['access-users', search],
    queryFn: async () => (await userApi.listUsers({ limit: 50, page: 1, search })).data,
  });
  const rolesQuery = useQuery({
    queryKey: ['access-roles'],
    queryFn: async () => (await userApi.listRoles({ limit: 100, page: 1 })).data,
  });
  const users = usersQuery.data?.items ?? [];
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
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-mint text-brand-teal">
            <UsersRound className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-teal">Access</p>
            <h1 className="text-2xl font-semibold text-slate-950 dark:text-slate-100">
              Users / Roles
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Create users, assign roles, and manage individual permission overrides.
            </p>
          </div>
        </div>
        <Button onClick={() => setEditingUser(null)} type="button">
          <Plus className="h-4 w-4" />
          Create User
        </Button>
      </div>
      <Panel>
        <div className="flex gap-3 border-b p-4">
          <Input
            aria-label="Search users"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search users"
            value={search}
          />
          <Button
            aria-label="Refresh users"
            onClick={() => void usersQuery.refetch()}
            type="button"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        {selectedUsers.length > 0 ? (
          <BulkLocationBar onDone={() => setSelectedIds(new Set())} selected={selectedUsers} />
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">
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
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Employee Code</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Locations</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usersQuery.isLoading ? (
                <tr>
                  <td colSpan={7} className="p-4">
                    <Skeleton className="h-10 w-full" />
                  </td>
                </tr>
              ) : null}
              {users.map((user) => (
                <tr className="hover:bg-slate-50" key={user.id}>
                  <td className="px-4 py-4">
                    <input
                      aria-label={`Select ${user.name}`}
                      checked={selectedIds.has(user.id)}
                      disabled={isLocked(user)}
                      onChange={() => toggleOne(user.id)}
                      title={isLocked(user) ? lockedReason : undefined}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-slate-950 dark:text-slate-100">{user.name}</p>
                    <p className="text-slate-500">{user.email ?? user.mobile}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{user.employeeCode}</td>
                  <td className="px-4 py-4 text-slate-600">
                    {user.roles.map((role) => role.name).join(', ') || 'Unassigned'}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {user.locationScope === 'ALL' ? (
                      <Badge variant="info">All locations</Badge>
                    ) : user.hospitals.length === 0 ? (
                      <Badge variant="warning">None assigned</Badge>
                    ) : (
                      user.hospitals.map((hospital) => hospital.name).join(', ')
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={user.status === 'ACTIVE' ? 'success' : 'danger'}>
                      {user.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={isLocked(user)}
                        onClick={() => setEditingUser(user)}
                        size="sm"
                        title={isLocked(user) ? lockedReason : undefined}
                        type="button"
                        variant="outline"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        disabled={isLocked(user)}
                        onClick={() => setPermissionUser(user)}
                        size="sm"
                        title={isLocked(user) ? lockedReason : undefined}
                        type="button"
                        variant="outline"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Permissions
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!usersQuery.isLoading && users.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={7}>
                    {usersQuery.isError ? getApiErrorMessage(usersQuery.error) : 'No users found.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
      {editingUser !== undefined ? (
        <UserDialog
          onClose={() => setEditingUser(undefined)}
          roles={(rolesQuery.data?.items ?? []).filter(
            (role) => isSuperAdmin || role.name !== SUPER_ADMIN_ROLE,
          )}
          user={editingUser}
        />
      ) : null}
      {permissionUser ? (
        <PermissionsDialog onClose={() => setPermissionUser(null)} user={permissionUser} />
      ) : null}
    </section>
  );
}
