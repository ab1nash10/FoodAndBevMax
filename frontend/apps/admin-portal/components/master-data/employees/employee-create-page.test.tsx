import type { Employee } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import type * as LocationModule from '@/components/location-context';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { at, router } from '@/test/next-navigation';
import { EmployeeCreatePageClient } from './employee-create-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', async () => {
  const { getLocationTitle } = await vi.importActual<typeof LocationModule>(
    '@/components/location-context',
  );
  return { ...(await import('@/test/location')), getLocationTitle };
});
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  createEmployee: vi.fn<OrganizationApi['createEmployee']>(),
  listEmployees: vi.fn<OrganizationApi['listEmployees']>(),
  listHospitals: vi.fn<OrganizationApi['listHospitals']>(),
  listLegalEntities: vi.fn<OrganizationApi['listLegalEntities']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
}));

const manager = {
  employeeCode: 'EMP0009',
  employeeName: 'Dr Anil Mehta',
  id: 'e-anil',
} as Employee;

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/employees/new');
  atLocation(ppg);
  organizationApi.listHospitals.mockReturnValue(page([ppg]) as never);
  organizationApi.listLegalEntities.mockReturnValue(page([]));
  organizationApi.listEmployees.mockReturnValue(page([manager]));
  organizationApi.createEmployee.mockReturnValue(
    reply({ ...manager, employeeCode: 'EMP0010', employeeName: 'Meena Das', id: 'e-meena' }),
  );
});

describe('the new employee form', () => {
  it('says what is missing until the name and employment type are given', async () => {
    const { user } = renderScreen(<EmployeeCreatePageClient />);
    const submit = screen.getByRole('button', { name: 'Create employee' });

    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription('Employee name is required.');
    await user.type(screen.getByLabelText(/^Employee name/), 'Meena Das');
    expect(submit).toHaveAccessibleDescription('Choose on-role or off-role.');
    await user.click(screen.getByRole('radio', { name: 'On-Role' }));
    expect(submit).toBeEnabled();
  });

  it('picks a reporting manager by search and sends their id', async () => {
    const { user } = renderScreen(<EmployeeCreatePageClient />);
    await user.type(screen.getByLabelText(/^Employee name/), 'Meena Das');
    await user.click(screen.getByRole('radio', { name: 'On-Role' }));

    await user.type(screen.getByLabelText('Reporting manager'), 'anil');
    await user.click(await screen.findByRole('button', { name: /Dr Anil Mehta/ }));
    expect(screen.getByLabelText('Reporting manager')).toHaveValue('Dr Anil Mehta (EMP0009)');
    expect(organizationApi.listEmployees).toHaveBeenCalledWith({
      hospitalId: 'h-ppg',
      isActive: true,
      limit: 8,
      search: 'anil',
    });

    await user.click(screen.getByRole('button', { name: 'Create employee' }));

    await waitFor(() =>
      expect(organizationApi.createEmployee).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeName: 'Meena Das',
          employmentType: 'ON_ROLL',
          reportingManagerId: 'e-anil',
        }),
      ),
    );
    // Back to the list, found by the new employee's code.
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(expect.stringContaining('/masters/employees')),
    );
  });

  it('rejects an email that is not one', async () => {
    const { user } = renderScreen(<EmployeeCreatePageClient />);
    await user.type(screen.getByLabelText(/^Employee name/), 'Meena Das');
    await user.click(screen.getByRole('radio', { name: 'On-Role' }));
    await user.type(screen.getByLabelText('Official email'), 'meena@');

    await user.click(screen.getByRole('button', { name: 'Create employee' }));

    expect(organizationApi.createEmployee).not.toHaveBeenCalled();
  });
});
