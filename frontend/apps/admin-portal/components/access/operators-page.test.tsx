import type { AccessRole, AccessUser, AccessUserListQuery, Hospital } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { OperatorsPageClient } from './operators-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/test/location'));
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  listEmployees: vi.fn<OrganizationApi['listEmployees']>(),
  listHospitals: vi.fn<OrganizationApi['listHospitals']>(),
}));
type UserApi = typeof ApiModule.userApi;
const userApi = vi.hoisted(() => ({
  listRoles: vi.fn<UserApi['listRoles']>(),
  listUsers: vi.fn<UserApi['listUsers']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
  userApi,
}));

const role = (id: string, name: string, isOperator = true): AccessRole => ({
  description: null,
  id,
  isOperator,
  locationScope: isOperator ? 'SINGLE' : 'MULTI',
  name,
  status: 'ACTIVE',
});
const cashier = role('r-pos', 'Restaurant/POS Operator');
const kitchen = role('r-kitchen', 'Kitchen Operator');
const delivery = role('r-delivery', 'Delivery Operator');
const inventory = role('r-inventory', 'Inventory Manager');
const admin = role('r-admin', 'Admin', false);

const operator = (patch: Partial<AccessUser>): AccessUser => ({
  avatarUrl: null,
  createdAt: '2026-10-01T00:00:00Z',
  credentialsLockedUntil: null,
  defaultLocationId: 'h-ppg',
  designation: null,
  email: 'anu@max.in',
  employeeCode: '8569',
  hospitals: [{ id: 'h-ppg', name: 'Patparganj' }],
  id: 'u-anu',
  lastLoginAt: '2026-11-18T10:20:32Z',
  locationScope: 'SINGLE',
  mobile: '6006625862',
  name: 'Anu Bala',
  roles: [delivery],
  status: 'ACTIVE',
  updatedAt: '2026-10-01T00:00:00Z',
  ...patch,
});
const anu = operator({});
const monika = operator({
  email: 'monika@max.in',
  employeeCode: '7615',
  id: 'u-monika',
  lastLoginAt: null,
  mobile: '7651904472',
  name: 'Monika Kesarwani',
  roles: [cashier],
  status: 'DISABLED',
});

const lastListQuery = () => vi.mocked(userApi.listUsers).mock.calls.at(-1)?.[0];
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

beforeEach(() => {
  vi.clearAllMocks();
  at('/operators');
  atLocation(ppg);
  signedIn(['USER_VIEW', 'USER_CREATE', 'USER_UPDATE'], ['Admin']);
  userApi.listRoles.mockReturnValue(page([admin, cashier, kitchen, delivery, inventory]));
  userApi.listUsers.mockImplementation((_query?: AccessUserListQuery) => page([anu, monika]));
  organizationApi.listHospitals.mockReturnValue(page([ppg as Hospital]));
});

describe('Operators', () => {
  it('lists the operators at the chosen location, column by column', async () => {
    renderScreen(<OperatorsPageClient />);

    expect(await screen.findByText('Anu Bala')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Operators/, level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Name',
      'Email',
      'Mobile',
      'Code',
      'Type',
      'Location',
      'Status',
      'Last login at',
      'Actions',
    ]);
    const anuRow = within(row('Anu Bala'));
    for (const text of ['anu@max.in', '6006625862', '8569', 'Delivery Operator', 'Patparganj']) {
      expect(anuRow.getByText(text)).toBeInTheDocument();
    }
    expect(anuRow.getByText('18 Nov 2026')).toBeInTheDocument();
    expect(anuRow.getByRole('img', { name: 'Active' })).toBeInTheDocument();
    const monikaRow = within(row('Monika Kesarwani'));
    expect(monikaRow.getByText('Restaurant/POS Operator')).toBeInTheDocument();
    expect(monikaRow.getByRole('img', { name: 'Disabled' })).toBeInTheDocument();
    expect(monikaRow.getByText('Never')).toBeInTheDocument();
    expect(lastListQuery()).toMatchObject({ group: 'OPERATORS', hospitalId: 'h-ppg', page: 1 });
  });

  it('filters by type: only the operator types are offered', async () => {
    const { user } = renderScreen(<OperatorsPageClient />);
    await screen.findByText('Anu Bala');

    const type = screen.getByRole('combobox', { name: 'Type' });
    await waitFor(() =>
      expect(
        within(type)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([
        'All',
        'Restaurant/POS Operator',
        'Kitchen Operator',
        'Delivery Operator',
        'Inventory Manager',
      ]),
    );
    await user.selectOptions(type, 'Kitchen Operator');

    await waitFor(() =>
      expect(lastListQuery()).toMatchObject({ group: 'OPERATORS', page: 1, roleId: 'r-kitchen' }),
    );
  });

  it('searches by name, email, mobile or code', async () => {
    const { user } = renderScreen(<OperatorsPageClient />);
    await screen.findByText('Anu Bala');

    await user.type(screen.getByRole('searchbox', { name: 'Search operators' }), '8569');

    await waitFor(() => expect(lastListQuery()).toMatchObject({ page: 1, search: '8569' }));
  });

  it('adds an operator with an operator type only', async () => {
    const { user } = renderScreen(<OperatorsPageClient />);
    await screen.findByText('Anu Bala');

    await user.click(screen.getByRole('button', { name: 'New Operator' }));

    const form = within(screen.getByRole('dialog', { name: 'Add operator' }));
    expect(
      within(form.getByRole('combobox', { name: /^Role/ }))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Select a role',
      'Restaurant/POS Operator',
      'Kitchen Operator',
      'Delivery Operator',
      'Inventory Manager',
    ]);
  });

  it('opens an operator to edit from its row', async () => {
    const { user } = renderScreen(<OperatorsPageClient />);
    await screen.findByText('Anu Bala');

    await user.click(within(row('Anu Bala')).getByRole('button', { name: 'Edit Anu Bala' }));

    const form = within(screen.getByRole('dialog', { name: 'Edit operator' }));
    expect(form.getByRole('textbox', { name: /^Name/ })).toHaveValue('Anu Bala');
  });

  it('offers no way to add or change an operator to someone who may only view them', async () => {
    signedIn(['USER_VIEW'], ['Admin']);
    const { user } = renderScreen(<OperatorsPageClient />);
    await screen.findByText('Anu Bala');

    expect(screen.queryByRole('button', { name: 'New Operator' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Anu Bala' })).not.toBeInTheDocument();

    await user.click(within(row('Anu Bala')).getByText('Anu Bala'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says there are no operators yet', async () => {
    userApi.listUsers.mockReturnValue(page([]));
    renderScreen(<OperatorsPageClient />);

    expect(await screen.findByText('No operators found')).toBeInTheDocument();
  });
});
