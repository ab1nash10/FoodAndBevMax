import type {
  AccessRole,
  AccessUser,
  Employee,
  Hospital,
  HospitalSummary,
} from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { UserDialog } from './user-dialog';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  listEmployees: vi.fn<OrganizationApi['listEmployees']>(),
  listHospitals: vi.fn<OrganizationApi['listHospitals']>(),
}));
type UserApi = typeof ApiModule.userApi;
const userApi = vi.hoisted(() => ({
  createUser: vi.fn<UserApi['createUser']>(),
  updateUser: vi.fn<UserApi['updateUser']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
  userApi,
}));

const role = (
  id: string,
  name: string,
  locationScope: AccessRole['locationScope'],
): AccessRole => ({
  description: null,
  id,
  isOperator: false,
  locationScope,
  name,
  status: 'ACTIVE',
});
const superAdmin = role('r-super', 'Super Admin', 'ALL');
const storeManager = role('r-store', 'Store Manager', 'MULTI');
const cashier = role('r-cash', 'Cashier', 'SINGLE');
const roles = [superAdmin, storeManager, cashier];

const place = (id: string, code: string, name: string) =>
  ({ hospitalCode: code, hospitalName: name, id, isActive: true }) as HospitalSummary;
const ppg = place('h-ppg', 'PPG', 'Patparganj');
const saket = place('h-skt', 'SKT', 'Saket');

const asha: AccessUser = {
  avatarUrl: null,
  createdAt: '2026-10-01T00:00:00Z',
  credentialsLockedUntil: null,
  defaultLocationId: 'h-ppg',
  designation: 'Store Lead',
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
};

const field = (name: RegExp) => screen.getByLabelText(name);

async function fillNewUser(
  user: ReturnType<typeof renderScreen>['user'],
  roleName = 'Store Manager',
) {
  await user.type(field(/^Name/), 'neha kapoor');
  await user.type(field(/^Email/), ' Neha@Max.in ');
  await user.type(field(/^Employee code/), 'e200');
  await user.type(field(/^Mobile/), '98-0000-0002');
  await user.selectOptions(field(/^Role/), roleName);
}

const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  signedIn(['USER_EDIT'], ['Admin']);
  organizationApi.listHospitals.mockReturnValue(page([ppg, saket] as Hospital[]));
  userApi.createUser.mockImplementation(() => reply({ ...asha, id: 'u-new' }));
  userApi.updateUser.mockImplementation(() => reply(asha));
});

describe('adding a user', () => {
  it('asks for the required fields before sending anything', async () => {
    const { user } = renderScreen(<UserDialog onClose={onClose} roles={roles} user={null} />);

    await user.click(screen.getByRole('button', { name: 'Add user' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Complete the required fields');
    expect(userApi.createUser).not.toHaveBeenCalled();
  });

  it('sends the new user with a clean email and their default location first', async () => {
    const { user } = renderScreen(<UserDialog onClose={onClose} roles={roles} user={null} />);
    await fillNewUser(user);
    await screen.findByRole('option', { name: 'SKT - Saket' });
    await user.selectOptions(field(/^Default location/), 'h-skt');

    await user.click(screen.getByRole('button', { name: 'Add user' }));

    expect(userApi.createUser).toHaveBeenCalledWith({
      designation: undefined,
      email: 'neha@max.in',
      employeeCode: 'E200',
      hospitalIds: ['h-skt'],
      mobile: '9800000002',
      name: 'Neha Kapoor',
      roleId: 'r-store',
      status: 'ACTIVE',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('needs a location for a role that works at chosen locations', async () => {
    const { user } = renderScreen(<UserDialog onClose={onClose} roles={roles} user={null} />);
    await fillNewUser(user);

    await user.click(screen.getByRole('button', { name: 'Add user' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The Store Manager role needs at least one location.',
    );
    expect(userApi.createUser).not.toHaveBeenCalled();
  });

  it('needs exactly one location for a single-location role', async () => {
    const { user } = renderScreen(<UserDialog onClose={onClose} roles={roles} user={null} />);
    await fillNewUser(user, 'Cashier');

    await user.click(screen.getByRole('button', { name: 'Add user' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Select a location');
    expect(screen.getByRole('alert')).toHaveTextContent('The Cashier role works at one location');
  });

  it('needs only a default location for an all-locations role', async () => {
    const { user } = renderScreen(<UserDialog onClose={onClose} roles={roles} user={null} />);
    await fillNewUser(user, 'Super Admin');

    expect(screen.getByRole('button', { name: /Add location/ })).toBeDisabled();
    expect(
      screen.getByText(
        'Super Admin reaches every location, so only the default location is needed.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add user' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Select a default location');

    await user.selectOptions(field(/^Default location/), 'h-ppg');
    await user.click(screen.getByRole('button', { name: 'Add user' }));
    expect(userApi.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalIds: ['h-ppg'], roleId: 'r-super' }),
    );
  });

  it('picks locations in the location picker', async () => {
    const { user } = renderScreen(<UserDialog onClose={onClose} roles={roles} user={null} />);
    await fillNewUser(user);

    await user.click(screen.getByRole('button', { name: /Add location/ }));
    const picker = within(screen.getByRole('dialog', { name: 'Select locations' }));
    await user.click(await picker.findByRole('checkbox', { name: 'PPG - Patparganj' }));
    await user.click(picker.getByRole('checkbox', { name: 'SKT - Saket' }));
    await user.click(picker.getByRole('button', { name: 'Add 2 locations' }));

    // The first picked becomes the default.
    expect(screen.getByText('(default)').parentElement).toHaveTextContent('Patparganj');
    await user.click(screen.getByRole('button', { name: 'Add user' }));
    expect(userApi.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalIds: ['h-ppg', 'h-skt'] }),
    );
  });

  it('says why the user was not created', async () => {
    userApi.createUser.mockRejectedValue(new ApiClientError(409, 'Employee code E200 is taken'));
    const { user } = renderScreen(<UserDialog onClose={onClose} roles={roles} user={null} />);
    await fillNewUser(user);
    await user.selectOptions(field(/^Default location/), 'h-ppg');

    await user.click(screen.getByRole('button', { name: 'Add user' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('User was not created');
    expect(alert).toHaveTextContent('Employee code E200 is taken');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('adding someone from the Employees list', () => {
  const adarsh = {
    designation: 'Steward',
    employeeCode: '7449',
    employeeName: 'Adarsh Shukla',
    hospitalId: 'h-skt',
    id: 'e-adarsh',
    mobile: '+91 95692 58373',
    officialEmail: 'adarsh@max.in',
  } as Employee;

  it('fills in their details, which can still be changed', async () => {
    signedIn(['USER_CREATE', 'EMPLOYEE_VIEW'], ['Admin']);
    organizationApi.listEmployees.mockReturnValue(page([adarsh]));
    const { user } = renderScreen(<UserDialog onClose={onClose} roles={roles} user={null} />);
    await screen.findByRole('option', { name: 'SKT - Saket' });

    await user.type(screen.getByRole('textbox', { name: 'Pick from Employees' }), 'adarsh');
    await user.click(await screen.findByRole('button', { name: /Adarsh Shukla/ }));

    expect(organizationApi.listEmployees).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true, search: 'adarsh' }),
    );
    expect(field(/^Name/)).toHaveValue('Adarsh Shukla');
    expect(field(/^Email/)).toHaveValue('adarsh@max.in');
    expect(field(/^Employee code/)).toHaveValue('7449');
    expect(field(/^Mobile/)).toHaveValue('9569258373');
    expect(field(/^Designation/)).toHaveValue('Steward');
    expect(field(/^Default location/)).toHaveValue('h-skt');

    await user.clear(field(/^Email/));
    await user.type(field(/^Email/), 'adarsh.s@max.in');
    await user.selectOptions(field(/^Role/), 'Cashier');
    await user.click(screen.getByRole('button', { name: 'Add user' }));

    expect(userApi.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'adarsh.s@max.in',
        employeeCode: '7449',
        hospitalIds: ['h-skt'],
        mobile: '9569258373',
        name: 'Adarsh Shukla',
        roleId: 'r-cash',
      }),
    );
  });

  it('is offered only to someone who may see employees, and only for someone new', () => {
    signedIn(['USER_CREATE'], ['Admin']);
    const { unmount } = renderScreen(<UserDialog onClose={onClose} roles={roles} user={null} />);
    expect(screen.queryByRole('textbox', { name: 'Pick from Employees' })).toBeNull();
    unmount();

    signedIn(['USER_UPDATE', 'EMPLOYEE_VIEW'], ['Admin']);
    renderScreen(<UserDialog onClose={onClose} roles={roles} user={asha} />);
    expect(screen.queryByRole('textbox', { name: 'Pick from Employees' })).toBeNull();
  });
});

describe('editing a user', () => {
  it('keeps the employee code unless changed, sends no password, and clears a blanked designation', async () => {
    const { user } = renderScreen(<UserDialog onClose={onClose} roles={roles} user={asha} />);

    expect(field(/^Employee code/)).toBeDisabled();
    expect(field(/^Name/)).toHaveValue('Asha Rao');
    await user.clear(field(/^Designation/));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const [id, body] = userApi.updateUser.mock.calls[0]!;
    expect(id).toBe('u-asha');
    expect(body).not.toHaveProperty('employeeCode');
    expect(body).not.toHaveProperty('password');
    expect(body).toMatchObject({
      designation: null,
      hospitalIds: ['h-ppg'],
      status: 'ACTIVE',
    });
  });

  it('disables a user with the Active switch', async () => {
    const { user } = renderScreen(<UserDialog onClose={onClose} roles={roles} user={asha} />);

    await user.click(screen.getByRole('checkbox', { name: 'Active' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(userApi.updateUser).toHaveBeenCalledWith(
      'u-asha',
      expect.objectContaining({ status: 'DISABLED' }),
    );
  });

  it('locks the email and mobile of someone signed in', () => {
    const lockedUntil = new Date(Date.now() + 3_600_000).toISOString();
    renderScreen(
      <UserDialog
        onClose={onClose}
        roles={roles}
        user={{ ...asha, credentialsLockedUntil: lockedUntil }}
      />,
    );

    expect(screen.getByRole('note')).toHaveTextContent('Asha Rao is signed in.');
    expect(field(/^Email/)).toBeDisabled();
    expect(field(/^Mobile/)).toBeDisabled();
    // There is no password: sign-in is by a code to the email or mobile.
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(field(/^Name/)).toBeEnabled();
  });

  it('lets a Super Admin change them anyway', () => {
    signedIn(['USER_EDIT'], ['Super Admin']);
    const lockedUntil = new Date(Date.now() + 3_600_000).toISOString();
    renderScreen(
      <UserDialog
        onClose={onClose}
        roles={roles}
        user={{ ...asha, credentialsLockedUntil: lockedUntil }}
      />,
    );

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(field(/^Email/)).toBeEnabled();
  });

  it('leaves your own email and mobile to another administrator', () => {
    // The stand-in signs in as user-1: this is their own record.
    renderScreen(<UserDialog onClose={onClose} roles={roles} user={{ ...asha, id: 'user-1' }} />);

    expect(field(/^Email/)).toBeDisabled();
    expect(field(/^Mobile/)).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('another administrator changes them');
    expect(field(/^Name/)).toBeEnabled();
  });

  it('removes a location, and the default with it', async () => {
    const { user } = renderScreen(<UserDialog onClose={onClose} roles={roles} user={asha} />);

    await user.click(await screen.findByRole('button', { name: 'Remove Patparganj' }));

    expect(screen.getByText('No locations added yet.')).toBeInTheDocument();
    expect(field(/^Default location/)).toHaveValue('');
  });
});
