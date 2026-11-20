import type { AccessUser, Hospital, HospitalSummary } from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen, reply } from '@/test/harness';
import { BulkLocationBar } from './bulk-location-bar';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  listHospitals: vi.fn<OrganizationApi['listHospitals']>(),
}));
type UserApi = typeof ApiModule.userApi;
const userApi = vi.hoisted(() => ({
  assignUserLocations: vi.fn<UserApi['assignUserLocations']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
  userApi,
}));

const place = (id: string, name: string) =>
  ({ hospitalCode: id, hospitalName: name, id, isActive: true }) as HospitalSummary;
const person = (id: string, locationScope: AccessUser['locationScope']) =>
  ({ id, locationScope, name: id }) as AccessUser;

const onDone = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  organizationApi.listHospitals.mockReturnValue(
    page([place('h-ppg', 'Patparganj'), place('h-skt', 'Saket')] as Hospital[]),
  );
  userApi.assignUserLocations.mockReturnValue(reply({ updated: [], updatedCount: 2 }));
});

describe('assigning locations to several users', () => {
  it('assigns the ticked locations to every selected user', async () => {
    const { user } = renderScreen(
      <BulkLocationBar
        onDone={onDone}
        selected={[person('u-1', 'MULTI'), person('u-2', 'MULTI')]}
      />,
    );

    expect(screen.getByText('2 user(s) selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Assign/ })).toBeDisabled();
    await user.click(await screen.findByRole('checkbox', { name: 'Patparganj' }));
    await user.click(screen.getByRole('checkbox', { name: 'Saket' }));
    await user.click(screen.getByRole('button', { name: 'Assign 2 locations' }));

    expect(userApi.assignUserLocations).toHaveBeenCalledWith({
      hospitalIds: ['h-ppg', 'h-skt'],
      userIds: ['u-1', 'u-2'],
    });
    expect(await screen.findByText('Locations assigned')).toBeInTheDocument();
    expect(onDone).toHaveBeenCalled();
  });

  it('allows only one location when a single-location user is selected', async () => {
    const { user } = renderScreen(
      <BulkLocationBar
        onDone={onDone}
        selected={[person('u-1', 'MULTI'), person('u-2', 'SINGLE')]}
      />,
    );

    expect(
      screen.getByText('Pick one location — the selection includes a single-location role.'),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole('radio', { name: 'Patparganj' }));
    await user.click(screen.getByRole('radio', { name: 'Saket' }));

    expect(screen.getByRole('radio', { name: 'Patparganj' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Assign 1 location' })).toBeEnabled();
  });

  it('warns that all-locations users are not changed and multi-location users are replaced', () => {
    renderScreen(
      <BulkLocationBar onDone={onDone} selected={[person('u-1', 'ALL'), person('u-2', 'MULTI')]} />,
    );

    expect(
      screen.getByText(/1 Super Admin–scope user\(s\) already reach every location/),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 multi-location user\(s\) will be replaced/)).toBeInTheDocument();
  });

  it('says why the locations were not assigned', async () => {
    userApi.assignUserLocations.mockRejectedValue(
      new ApiClientError(400, 'Cashier works at one location'),
    );
    const { user } = renderScreen(
      <BulkLocationBar onDone={onDone} selected={[person('u-1', 'MULTI')]} />,
    );

    await user.click(await screen.findByRole('checkbox', { name: 'Saket' }));
    await user.click(screen.getByRole('button', { name: 'Assign 1 location' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Cashier works at one location'),
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it('clears the selection', async () => {
    const { user } = renderScreen(
      <BulkLocationBar onDone={onDone} selected={[person('u-1', 'MULTI')]} />,
    );

    await user.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(onDone).toHaveBeenCalled();
  });
});
