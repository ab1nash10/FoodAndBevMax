import type { AccessRole, AccessUser, AccessUserListQuery, Hospital } from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { UsersRolesPageClient } from './users-roles-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/test/location'));
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  listHospitals: vi.fn<OrganizationApi['listHospitals']>(),
}));
type UserApi = typeof ApiModule.userApi;
const userApi = vi.hoisted(() => ({
  assignUserLocations: vi.fn<UserApi['assignUserLocations']>(),
  createUser: vi.fn<UserApi['createUser']>(),
  getUserPermissions: vi.fn<UserApi['getUserPermissions']>(),
  listRoles: vi.fn<UserApi['listRoles']>(),
  listUsers: vi.fn<UserApi['listUsers']>(),
  replaceUserPermissions: vi.fn<UserApi['replaceUserPermissions']>(),
  updateUser: vi.fn<UserApi['updateUser']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
  userApi,
}));

const superAdminRole: AccessRole = {
  description: null,
  id: 'r-super',
  isOperator: false,
  locationScope: 'ALL',
  name: 'Super Admin',
  status: 'ACTIVE',
};
const storeManager: AccessRole = {
  description: null,
  id: 'r-store',
  isOperator: false,
  locationScope: 'MULTI',
  name: 'Store Manager',
  status: 'ACTIVE',
};

const kitchenOperator: AccessRole = {
  description: null,
  id: 'r-kitchen',
  isOperator: true,
  locationScope: 'SINGLE',
  name: 'Kitchen Operator',
  status: 'ACTIVE',
};

const person = (patch: Partial<AccessUser>): AccessUser => ({
  avatarUrl: null,
  createdAt: '2026-10-01T00:00:00Z',
  credentialsLockedUntil: null,
  defaultLocationId: 'h-ppg',
  designation: null,
  email: 'asha@max.in',
  employeeCode: 'E100',
  hospitals: [{ id: 'h-ppg', name: 'Patparganj' }],
  id: 'u-asha',
  lastLoginAt: null,
  locationScope: 'MULTI',
  mobile: '9800000001',
  name: 'Asha Rao',
  roles: [storeManager],
  status: 'ACTIVE',
  updatedAt: '2026-10-01T00:00:00Z',
  ...patch,
});

const asha = person({});
const ravi = person({
  email: 'ravi@max.in',
  employeeCode: 'E001',
  hospitals: [],
  id: 'u-ravi',
  locationScope: 'ALL',
  name: 'Ravi Super',
  roles: [superAdminRole],
});
const meena = person({
  email: null,
  hospitals: [],
  id: 'u-meena',
  mobile: '9800000003',
  name: 'Meena Das',
  status: 'DISABLED',
});

/** The list answers with these users; the 1-row "count" requests with these totals. */
function serve(users: AccessUser[], totals = { ACTIVE: 2, DISABLED: 1, all: 3, superAdmins: 1 }) {
  userApi.listUsers.mockImplementation((query?: AccessUserListQuery) => {
    if (query?.limit === 1) {
      const total = query.roleId
        ? totals.superAdmins
        : query.status
          ? totals[query.status]
          : totals.all;
      return reply({ items: [], meta: { limit: 1, page: 1, total, totalPages: total } });
    }
    return page(users);
  });
}

const lastListQuery = () =>
  vi
    .mocked(userApi.listUsers)
    .mock.calls.map(([query]) => query)
    .filter((query) => query?.limit !== 1)
    .at(-1);

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

beforeEach(() => {
  vi.clearAllMocks();
  at('/access');
  window.history.replaceState(null, '', '/access');
  atLocation(ppg);
  signedIn(['USER_VIEW', 'USER_CREATE', 'USER_UPDATE'], ['Admin']);
  userApi.listRoles.mockReturnValue(page([superAdminRole, storeManager, kitchenOperator]));
  organizationApi.listHospitals.mockReturnValue(page([ppg as Hospital]));
  serve([asha, ravi, meena]);
});

describe('Admins', () => {
  it('lists the users at the chosen location with their role, locations and status', async () => {
    renderScreen(<UsersRolesPageClient />);

    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    const ashaRow = within(row('Asha Rao'));
    expect(ashaRow.getByText('asha@max.in')).toBeInTheDocument();
    expect(ashaRow.getByText('E100')).toBeInTheDocument();
    expect(ashaRow.getByText('Store Manager')).toBeInTheDocument();
    expect(ashaRow.getByText('Patparganj')).toBeInTheDocument();
    expect(ashaRow.getByText('active')).toBeInTheDocument();
    expect(within(row('Ravi Super')).getByText('All locations')).toBeInTheDocument();
    // No email: the mobile is shown under the name instead.
    expect(within(row('Meena Das')).getByText('9800000003')).toBeInTheDocument();
    expect(within(row('Meena Das')).getByText('None assigned')).toBeInTheDocument();
    expect(within(row('Meena Das')).getByText('disabled')).toBeInTheDocument();
    expect(lastListQuery()).toMatchObject({
      group: 'ADMINS',
      hospitalId: 'h-ppg',
      limit: 50,
      page: 1,
    });
    expect(screen.getByRole('heading', { name: /^Admins/, level: 1 })).toBeInTheDocument();
  });

  it('leaves operators to their own screen: no operator role in the filter or the form', async () => {
    const { user } = renderScreen(<UsersRolesPageClient />);
    await screen.findByText('Asha Rao');

    // Every count is of admins too.
    for (const [query] of vi.mocked(userApi.listUsers).mock.calls) {
      expect(query).toMatchObject({ group: 'ADMINS' });
    }
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.queryByRole('option', { name: 'Kitchen Operator' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'New admin' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Add admin' })).queryByRole('option', {
        name: 'Kitchen Operator',
      }),
    ).toBeNull();
  });

  it('says there are no users yet when the list is empty', async () => {
    serve([], { ACTIVE: 0, DISABLED: 0, all: 0, superAdmins: 0 });
    renderScreen(<UsersRolesPageClient />);

    expect(await screen.findByText('No users found')).toBeInTheDocument();
    expect(screen.getByText('Create the first user to give someone access.')).toBeInTheDocument();
  });

  it('shows why the users could not be loaded', async () => {
    userApi.listUsers.mockRejectedValue(new ApiClientError(503, 'User service is unavailable'));
    renderScreen(<UsersRolesPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('User service is unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('searches users by what is typed', async () => {
    const { user } = renderScreen(<UsersRolesPageClient />);
    await screen.findByText('Asha Rao');

    await user.type(screen.getByRole('searchbox', { name: 'Search users' }), 'asha');

    await waitFor(() => expect(lastListQuery()).toMatchObject({ page: 1, search: 'asha' }));
  });

  it('asks for the status and role in the link', async () => {
    at('/access', 'status=DISABLED&role=r-store');
    renderScreen(<UsersRolesPageClient />);

    await waitFor(() =>
      expect(lastListQuery()).toMatchObject({ roleId: 'r-store', status: 'DISABLED' }),
    );
    expect(screen.getByRole('button', { name: /Filters\s*2\s*set/ })).toBeInTheDocument();
  });

  it('puts a status picked in Filters into the link, back on page 1', async () => {
    at('/access', 'page=3');
    window.history.replaceState(null, '', '/access?page=3');
    const { user } = renderScreen(<UsersRolesPageClient />);
    await screen.findByText('Asha Rao');

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'ACTIVE');

    const params = new URLSearchParams(window.location.search);
    expect(params.get('status')).toBe('ACTIVE');
    expect(params.get('page')).toBeNull();
  });

  it('offers no way to add or change a user to someone who may only view them', async () => {
    signedIn(['USER_VIEW'], ['Admin']);
    const { user } = renderScreen(<UsersRolesPageClient />);
    await screen.findByText('Asha Rao');

    expect(screen.queryByRole('button', { name: 'New admin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Asha Rao' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Permissions for Asha Rao' }),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox', { name: /^Select/ })).toHaveLength(0);

    await user.click(within(row('Asha Rao')).getByText('Asha Rao'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('for an admin who is not a Super Admin', () => {
    it('locks every way of changing a Super Admin', async () => {
      const { user } = renderScreen(<UsersRolesPageClient />);
      await screen.findByText('Ravi Super');
      const raviRow = within(row('Ravi Super'));

      expect(raviRow.getByRole('button', { name: 'Edit Ravi Super' })).toBeDisabled();
      expect(raviRow.getByRole('button', { name: 'Permissions for Ravi Super' })).toBeDisabled();
      expect(raviRow.getByRole('checkbox', { name: 'Select Ravi Super' })).toBeDisabled();
      expect(row('Ravi Super')).toHaveAttribute(
        'title',
        'Only a Super Admin can change Super Admin access',
      );

      // A click on the row does not open them either.
      await user.click(raviRow.getByText('Ravi Super'));
      expect(screen.queryByRole('dialog', { name: 'Edit admin' })).not.toBeInTheDocument();
    });

    it('leaves everyone else editable', async () => {
      const { user } = renderScreen(<UsersRolesPageClient />);
      await screen.findByText('Asha Rao');

      await user.click(within(row('Asha Rao')).getByRole('button', { name: 'Edit Asha Rao' }));

      expect(screen.getByRole('dialog', { name: 'Edit admin' })).toBeInTheDocument();
    });

    it('does not offer the Super Admin role to a new user', async () => {
      const { user } = renderScreen(<UsersRolesPageClient />);
      await screen.findByText('Asha Rao');

      await user.click(screen.getByRole('button', { name: 'New admin' }));

      const roleBox = within(screen.getByRole('dialog', { name: 'Add admin' })).getByRole(
        'combobox',
        { name: /^Role/ },
      );
      const offered = within(roleBox)
        .getAllByRole('option')
        .map((option) => option.textContent);
      expect(offered).toEqual(['Select a role', 'Store Manager']);
    });

    it('selects all users except Super Admins', async () => {
      const { user } = renderScreen(<UsersRolesPageClient />);
      await screen.findByText('Asha Rao');

      await user.click(screen.getByRole('checkbox', { name: 'Select all users' }));

      expect(screen.getByRole('checkbox', { name: 'Select Asha Rao' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Select Meena Das' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Select Ravi Super' })).not.toBeChecked();
      expect(screen.getByText('2 user(s) selected')).toBeInTheDocument();
    });
  });

  describe('for a Super Admin', () => {
    beforeEach(() => signedIn(['USER_VIEW', 'USER_CREATE', 'USER_UPDATE'], ['Super Admin']));

    it('may edit another Super Admin and give the Super Admin role', async () => {
      const { user } = renderScreen(<UsersRolesPageClient />);
      await screen.findByText('Ravi Super');

      await user.click(within(row('Ravi Super')).getByRole('button', { name: 'Edit Ravi Super' }));

      const dialog = within(screen.getByRole('dialog', { name: 'Edit admin' }));
      expect(dialog.getByRole('combobox', { name: /^Role/ })).toHaveDisplayValue('Super Admin');
      expect(dialog.getByRole('option', { name: 'Super Admin' })).toBeInTheDocument();
    });
  });

  describe('permission overrides', () => {
    beforeEach(() => {
      userApi.getUserPermissions.mockReturnValue(
        reply({
          effectivePermissionIds: ['p-item-view'],
          permissions: [
            {
              action: 'VIEW',
              code: 'ITEM_VIEW',
              description: 'View items',
              id: 'p-item-view',
              module: 'MASTER_DATA',
            },
            {
              action: 'CREATE',
              code: 'ITEM_CREATE',
              description: 'Create items',
              id: 'p-item-create',
              module: 'MASTER_DATA',
            },
            {
              action: 'VIEW',
              code: 'USER_VIEW',
              description: null,
              id: 'p-user-view',
              module: 'ACCESS',
            },
          ],
        }),
      );
    });

    it('shows the user’s permissions by module and saves the ticked ones', async () => {
      userApi.replaceUserPermissions.mockReturnValue(
        reply({ effectivePermissionIds: ['p-item-view', 'p-item-create'], permissions: [] }),
      );
      const { user } = renderScreen(<UsersRolesPageClient />);
      await screen.findByText('Asha Rao');

      await user.click(
        within(row('Asha Rao')).getByRole('button', { name: 'Permissions for Asha Rao' }),
      );
      const dialog = within(screen.getByRole('dialog', { name: 'Permissions — Asha Rao' }));
      expect(await dialog.findByRole('heading', { name: 'MASTER DATA' })).toBeInTheDocument();
      expect(dialog.getByRole('checkbox', { name: /View items/ })).toBeChecked();
      // No description: the code names it.
      expect(dialog.getByRole('checkbox', { name: /USER_VIEW/ })).not.toBeChecked();

      await user.click(dialog.getByRole('checkbox', { name: /Create items/ }));
      await user.click(dialog.getByRole('button', { name: 'Save Permissions' }));

      expect(userApi.replaceUserPermissions).toHaveBeenCalledWith('u-asha', [
        'p-item-view',
        'p-item-create',
      ]);
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: /^Permissions/ })).not.toBeInTheDocument(),
      );
    });

    it('keeps the dialog open and says why when saving fails', async () => {
      userApi.replaceUserPermissions.mockRejectedValue(new ApiClientError(403, 'Not allowed'));
      const { user } = renderScreen(<UsersRolesPageClient />);
      await screen.findByText('Asha Rao');

      await user.click(
        within(row('Asha Rao')).getByRole('button', { name: 'Permissions for Asha Rao' }),
      );
      await screen.findByRole('heading', { name: 'MASTER DATA' });
      await user.click(screen.getByRole('button', { name: 'Save Permissions' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Permissions were not saved');
      expect(screen.getByRole('alert')).toHaveTextContent('Not allowed');
      expect(screen.getByRole('dialog', { name: 'Permissions — Asha Rao' })).toBeInTheDocument();
    });
  });
});
