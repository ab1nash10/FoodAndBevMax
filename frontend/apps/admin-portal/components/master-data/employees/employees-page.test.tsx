import type { Employee, EmployeeListQuery } from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CsvModule from '@/lib/csv';
import type * as ApiModule from '@/lib/api';
import type * as LocationModule from '@/components/location-context';
import { page, renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { downloadCsv } from '@/lib/csv';
import { EmployeesPageClient } from './employees-page';

// The location stand-in, with the label helpers it leaves out and a reach set per test.
const override = vi.hoisted(() => ({ location: {} }));

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', async () => {
  const location = await import('@/test/location');
  const { formatGlobalLocationLabel, getLocationTitle } = await vi.importActual<
    typeof LocationModule
  >('@/components/location-context');
  return {
    ...location,
    formatGlobalLocationLabel,
    getLocationTitle,
    useLocationContext: () => ({ ...location.useLocationContext(), ...override.location }),
  };
});
vi.mock('@/lib/csv', async (importOriginal) => ({
  ...(await importOriginal<typeof CsvModule>()),
  downloadCsv: vi.fn(),
}));
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  createEmployee: vi.fn<OrganizationApi['createEmployee']>(),
  importEmployees: vi.fn<OrganizationApi['importEmployees']>(),
  listEmployees: vi.fn<OrganizationApi['listEmployees']>(),
  listHospitals: vi.fn<OrganizationApi['listHospitals']>(),
  listLegalEntities: vi.fn<OrganizationApi['listLegalEntities']>(),
  updateEmployee: vi.fn<OrganizationApi['updateEmployee']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
}));

const employee = (patch: Partial<Employee>): Employee => ({
  birthDate: null,
  createdAt: '2026-10-01T09:30:00Z',
  deletedAt: null,
  department: 'Nursing',
  designation: 'Staff Nurse',
  eligibleForDiscount: true,
  employeeCode: 'EMP0001',
  employeeLevel: null,
  employeeName: 'Ravi Kumar',
  employmentType: 'ON_ROLL',
  gender: 'MALE',
  hospital: ppg,
  hospitalId: 'h-ppg',
  id: 'e-ravi',
  isActive: true,
  joiningDate: null,
  legalEntityId: null,
  mobile: '9876543210',
  officialEmail: null,
  reportingManager: null,
  reportingManagerId: null,
  updatedAt: '2026-10-01T09:30:00Z',
  ...patch,
});
const ravi = employee({});
const sunita = employee({
  department: null,
  eligibleForDiscount: false,
  employeeCode: 'EMP0002',
  employeeName: 'Sunita Shared',
  hospital: null,
  hospitalId: null,
  id: 'e-sunita',
  isActive: false,
  mobile: null,
});

function serve(employees: Employee[]) {
  organizationApi.listEmployees.mockImplementation((query?: EmployeeListQuery) =>
    query?.limit === 0
      ? reply({
          items: [],
          meta: { limit: 0, page: 1, total: query.isActive === false ? 1 : 2, totalPages: 1 },
        })
      : page(employees),
  );
}

const lastListQuery = () =>
  vi
    .mocked(organizationApi.listEmployees)
    .mock.calls.map(([query]) => query)
    .filter((query) => query?.limit !== 0)
    .at(-1);
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/employees');
  window.history.replaceState(null, '', '/masters/employees');
  atLocation(ppg);
  override.location = {};
  signedIn(['EMPLOYEE_VIEW', 'EMPLOYEE_CREATE', 'EMPLOYEE_UPDATE']);
  serve([ravi, sunita]);
  organizationApi.listHospitals.mockReturnValue(page([{ ...ppg, legalEntityId: 'le-1' }]) as never);
  organizationApi.listLegalEntities.mockReturnValue(page([]));
  organizationApi.createEmployee.mockImplementation(() => reply(ravi));
  organizationApi.updateEmployee.mockImplementation(() => reply(ravi));
});

describe('Employees', () => {
  it('lists employees at the location, shared ones marked for all locations', async () => {
    renderScreen(<EmployeesPageClient />);

    expect(await screen.findByText('Ravi Kumar')).toBeInTheDocument();
    const raviRow = within(row('Ravi Kumar'));
    expect(raviRow.getByText('EMP0001')).toBeInTheDocument();
    expect(raviRow.getByText('Patparganj')).toBeInTheDocument();
    expect(raviRow.getByText('Nursing')).toBeInTheDocument();
    expect(raviRow.getByText('9876543210')).toBeInTheDocument();
    expect(raviRow.getByText('Eligible')).toBeInTheDocument();
    expect(raviRow.getByRole('switch', { name: 'Ravi Kumar active' })).toBeChecked();
    const sunitaRow = within(row('Sunita Shared'));
    expect(sunitaRow.getByText('All locations')).toBeInTheDocument();
    expect(sunitaRow.getAllByText('Not set')).toHaveLength(2);
    expect(sunitaRow.getByText('Not eligible')).toBeInTheDocument();
    expect(sunitaRow.getByText('Inactive')).toBeInTheDocument();
    expect(lastListQuery()).toMatchObject({
      hospitalId: 'h-ppg',
      page: 1,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('says there are none at the location', async () => {
    serve([]);
    renderScreen(<EmployeesPageClient />);

    expect(await screen.findByText('No employees at Patparganj')).toBeInTheDocument();
  });

  it('shows why the list could not be loaded', async () => {
    organizationApi.listEmployees.mockRejectedValue(
      new ApiClientError(503, 'Organization service is down'),
    );
    renderScreen(<EmployeesPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Organization service is down');
  });

  it('searches, filters by discount eligibility and sorts', async () => {
    const { user } = renderScreen(<EmployeesPageClient />);
    await screen.findByText('Ravi Kumar');

    await user.type(screen.getByRole('searchbox', { name: 'Search employees' }), 'ravi');
    await waitFor(() => expect(lastListQuery()).toMatchObject({ search: 'ravi' }));

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^Discount eligibility/ }),
      'notEligible',
    );
    await waitFor(() =>
      expect(lastListQuery()).toMatchObject({ eligibleForDiscount: false, search: 'ravi' }),
    );

    await user.selectOptions(screen.getByRole('combobox', { name: /^Sort/ }), 'employeeName:asc');
    await waitFor(() =>
      expect(lastListQuery()).toMatchObject({ sortBy: 'employeeName', sortOrder: 'asc' }),
    );
  });

  it('asks for the status in the link', async () => {
    at('/masters/employees', 'status=inactive');
    renderScreen(<EmployeesPageClient />);

    await waitFor(() => expect(lastListQuery()).toMatchObject({ isActive: false }));
  });

  describe('creating an employee', () => {
    it('waits for a name, then asks for the employment type', async () => {
      const { user } = renderScreen(<EmployeesPageClient />);
      await user.click(screen.getByRole('button', { name: 'New employee' }));
      const dialog = within(screen.getByRole('dialog', { name: 'Create employee' }));

      expect(dialog.getByRole('button', { name: 'Create employee' })).toBeDisabled();
      expect(dialog.getByText('Employee name is required.')).toBeInTheDocument();

      await user.type(dialog.getByLabelText(/^Employee name/), 'Meena Das');
      await user.click(dialog.getByRole('button', { name: 'Create employee' }));

      expect(await dialog.findByText('Choose on-role or off-role.')).toBeInTheDocument();
      expect(organizationApi.createEmployee).not.toHaveBeenCalled();
    });

    it('sends the new employee at the header’s location, blanks as nothing', async () => {
      const { user } = renderScreen(<EmployeesPageClient />);
      await user.click(screen.getByRole('button', { name: 'New employee' }));
      const dialog = within(screen.getByRole('dialog', { name: 'Create employee' }));

      await user.type(dialog.getByLabelText(/^Employee name/), 'Meena Das');
      await user.click(dialog.getByRole('radio', { name: 'Off-Role' }));
      await user.type(dialog.getByLabelText('Mobile'), '9800000003');
      await user.click(dialog.getByRole('button', { name: 'Create employee' }));

      await waitFor(() => expect(organizationApi.createEmployee).toHaveBeenCalled());
      expect(organizationApi.createEmployee.mock.calls[0]![0]).toEqual({
        birthDate: null,
        department: null,
        designation: null,
        eligibleForDiscount: true,
        employeeLevel: null,
        employeeName: 'Meena Das',
        employmentType: 'OUTSOURCED',
        gender: null,
        hospitalId: 'h-ppg',
        isActive: true,
        joiningDate: null,
        // The entity follows the location.
        legalEntityId: 'le-1',
        mobile: '9800000003',
        officialEmail: null,
        reportingManagerId: null,
      });
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Create employee' })).not.toBeInTheDocument(),
      );
    });

    it('says why the employee was not created', async () => {
      organizationApi.createEmployee.mockRejectedValue(
        new ApiClientError(409, 'Employee code is taken'),
      );
      const { user } = renderScreen(<EmployeesPageClient />);
      await user.click(screen.getByRole('button', { name: 'New employee' }));
      const dialog = within(screen.getByRole('dialog', { name: 'Create employee' }));

      await user.type(dialog.getByLabelText(/^Employee name/), 'Meena Das');
      await user.click(dialog.getByRole('radio', { name: 'On-Role' }));
      await user.click(dialog.getByRole('button', { name: 'Create employee' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Employee code is taken');
      expect(screen.getByRole('dialog', { name: 'Create employee' })).toBeInTheDocument();
    });
  });

  it('edits an employee from their row', async () => {
    const { user } = renderScreen(<EmployeesPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Edit Ravi Kumar' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit employee' }));
    expect(dialog.getByLabelText(/^Employee name/)).toHaveValue('Ravi Kumar');
    await user.clear(dialog.getByLabelText('Department'));
    await user.type(dialog.getByLabelText('Department'), 'Dietetics');
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(organizationApi.updateEmployee).toHaveBeenCalledWith(
        'e-ravi',
        expect.objectContaining({ department: 'Dietetics' }),
      ),
    );
  });

  it('deactivates an employee once confirmed', async () => {
    const { user } = renderScreen(<EmployeesPageClient />);

    await user.click(await screen.findByRole('switch', { name: 'Ravi Kumar active' }));
    expect(
      screen.getByRole('dialog', { name: 'Deactivate Ravi Kumar?' }),
    ).toHaveAccessibleDescription(
      'They can’t be used in new operations. Existing records stay visible.',
    );
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    expect(organizationApi.updateEmployee).toHaveBeenCalledWith('e-ravi', { isActive: false });
  });

  it('leaves a shared employee alone for a user without every location', async () => {
    override.location = { canSelectAllLocations: false };
    renderScreen(<EmployeesPageClient />);
    await screen.findByText('Sunita Shared');

    expect(
      within(row('Sunita Shared')).queryByRole('button', { name: /^Edit/ }),
    ).not.toBeInTheDocument();
    expect(within(row('Sunita Shared')).getByRole('switch')).toBeDisabled();
    expect(
      within(row('Ravi Kumar')).getByRole('button', { name: 'Edit Ravi Kumar' }),
    ).toBeInTheDocument();
  });

  it('exports the import’s columns for every employee that matches', async () => {
    const { user } = renderScreen(<EmployeesPageClient />);
    await screen.findByText('Ravi Kumar');

    await user.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
    const [filename, rows] = vi.mocked(downloadCsv).mock.calls[0]!;
    expect(filename).toMatch(/^employees-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(rows[0]).toEqual([
      'Employee code',
      'Employee name',
      'Employment type',
      'Department',
      'Designation',
      'Mobile',
      'Official email',
      'Gender',
      'Birth date',
      'Joining date',
      'Employee level',
      'Reporting manager code',
      'Location code',
      'Eligible for discount',
      'Status',
    ]);
    expect(rows[1]).toEqual([
      'EMP0001',
      'Ravi Kumar',
      'On-Role',
      'Nursing',
      'Staff Nurse',
      '9876543210',
      '',
      'Male',
      '',
      '',
      '',
      '',
      'PPG',
      'Yes',
      'Active',
    ]);
    expect(rows[2]).toContain('Inactive');
  });

  it('offers New employee only to someone who may add employees', async () => {
    signedIn(['EMPLOYEE_VIEW', 'EMPLOYEE_UPDATE']);
    renderScreen(<EmployeesPageClient />);
    await screen.findByText('Ravi Kumar');

    // The server refuses the create without EMPLOYEE_CREATE.
    expect(screen.queryByRole('button', { name: 'New employee' })).not.toBeInTheDocument();
  });

  it('lets only someone who may change employees edit or switch them', async () => {
    signedIn(['EMPLOYEE_VIEW', 'EMPLOYEE_CREATE']);
    const { user } = renderScreen(<EmployeesPageClient />);
    await screen.findByText('Ravi Kumar');

    expect(
      within(row('Ravi Kumar')).queryByRole('button', { name: 'Edit Ravi Kumar' }),
    ).not.toBeInTheDocument();
    expect(within(row('Ravi Kumar')).getByRole('switch')).toBeDisabled();
    await user.click(screen.getByText('Ravi Kumar'));
    expect(screen.queryByRole('dialog', { name: 'Edit employee' })).not.toBeInTheDocument();
  });

  it('offers Import only to someone who may add or change employees', async () => {
    signedIn(['EMPLOYEE_VIEW']);
    renderScreen(<EmployeesPageClient />);
    await screen.findByText('Ravi Kumar');

    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
  });
});
