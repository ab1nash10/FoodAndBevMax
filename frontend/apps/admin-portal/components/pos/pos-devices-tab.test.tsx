import type { Hospital, LegalEntity, PosDevice, Restaurant } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { PosDevicesTab } from './pos-devices-tab';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
// The real module's helpers (getLocationTitle…) with the header's location stood in.
vi.mock('@/components/location-context', async (importOriginal) => ({
  ...(await importOriginal<typeof LocationModule>()),
  ...(await import('@/test/location')),
}));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  createPosDevice: vi.fn<Client['createPosDevice']>(),
  listHospitals: vi.fn<Client['listHospitals']>(),
  listLegalEntities: vi.fn<Client['listLegalEntities']>(),
  listPosDevices: vi.fn<Client['listPosDevices']>(),
  listPosDeviceUserOptions: vi.fn<Client['listPosDeviceUserOptions']>(),
  listRestaurants: vi.fn<Client['listRestaurants']>(),
  revokeTill: vi.fn<Client['revokeTill']>(),
  updatePosDevice: vi.fn<Client['updatePosDevice']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

// The form checks the location, restaurants and users are real ids (UUIDs).
const patparganj = {
  ...ppg,
  address: null,
  city: 'New Delhi',
  id: '11111111-1111-4111-8111-111111111111',
  legalEntityId: 'e1',
  state: 'Delhi',
} as unknown as Hospital;
const entity = {
  entityName: 'Balaji Medical and Diagnostic Research Centre',
  gstNumber: '07AABCB1234A1Z5',
  id: 'e1',
  isActive: true,
  locationName: 'MSSH PPG',
} as LegalEntity;
const cafe = {
  id: '33333333-3333-4333-8333-333333333333',
  restaurantName: 'Cafe Max',
} as Restaurant;
const asha = {
  employeeCode: 'E100',
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Asha Verma',
};

const device = (overrides: Partial<PosDevice> = {}): PosDevice => ({
  code: 'POS-01',
  createdAt: '2026-11-01T05:00:00Z',
  deletedAt: null,
  hasActiveTillKey: true,
  hospital: patparganj,
  hospitalId: patparganj.id,
  hostName: 'MAX-PPG-POS-01',
  id: 'pd-1',
  isActive: true,
  isInvoicePrintEnabled: false,
  isKotPrintEnabled: true,
  legalEntityId: 'e1',
  name: 'Front Till',
  restaurantIds: [cafe.id],
  restaurants: [
    { id: cafe.id, isActive: true, restaurantCode: 'RST-0001', restaurantName: 'Cafe Max' },
  ],
  updatedAt: '2026-11-19T05:00:00Z',
  users: [{ ...asha, enrolled: true, hostName: 'PPG-DESK-7', userId: asha.id }],
  ...overrides,
});

const all = ['POS_DEVICE_VIEW', 'POS_DEVICE_CREATE', 'POS_DEVICE_UPDATE'];

// Filling a whole form types many keys: on a busy machine that takes longer than the default 5 s.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/pos');
  atLocation(patparganj, [patparganj]);
  signedIn(all);
  api.listHospitals.mockImplementation(() => page([patparganj]));
  api.listLegalEntities.mockImplementation(() => page([entity]));
  api.listRestaurants.mockImplementation(() => page([cafe]));
  api.listPosDeviceUserOptions.mockImplementation(() => reply([asha]));
});

describe('the POS Devices tab', () => {
  it('lists devices with their restaurants, entity, host name, users and print switches', async () => {
    api.listPosDevices.mockImplementation(() => page([device()]));
    renderScreen(<PosDevicesTab />);

    const row = (await screen.findByText('Front Till')).closest('tr') as HTMLElement;
    expect(within(row).getByText('POS-01')).toBeInTheDocument();
    expect(within(row).getByText('Browser enrolled')).toBeInTheDocument();
    expect(within(row).getByText('Cafe Max')).toBeInTheDocument();
    expect(await within(row).findByText('MSSH PPG')).toBeInTheDocument();
    expect(within(row).getByText('MAX-PPG-POS-01')).toBeInTheDocument();
    expect(within(row).getByText('1 user')).toBeInTheDocument();
    expect(within(row).getByRole('switch', { name: 'KOT print for Front Till' })).toBeChecked();
    expect(
      within(row).getByRole('switch', { name: 'Invoice print for Front Till' }),
    ).not.toBeChecked();
    expect(api.listPosDevices).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalId: patparganj.id, limit: 20, page: 1 }),
    );
  });

  it('says there are none at the location, or why the list failed', async () => {
    api.listPosDevices.mockImplementation(() => page([]));
    const first = renderScreen(<PosDevicesTab />);
    expect(await screen.findByText('No POS devices at Patparganj')).toBeInTheDocument();
    first.unmount();

    api.listPosDevices.mockRejectedValue(new Error('Devices could not be loaded'));
    renderScreen(<PosDevicesTab />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Devices could not be loaded');
  });

  it('searches through the API', async () => {
    api.listPosDevices.mockImplementation(() => page([]));
    const { user } = renderScreen(<PosDevicesTab />);

    await user.type(await screen.findByRole('searchbox', { name: 'Search POS devices' }), 'front');
    await waitFor(() =>
      expect(api.listPosDevices).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'front' }),
      ),
    );
  });

  it('offers no way to change a device to those who may only view them', async () => {
    signedIn(['POS_DEVICE_VIEW']);
    api.listPosDevices.mockImplementation(() => page([device()]));
    const { user } = renderScreen(<PosDevicesTab />);

    await user.click(await screen.findByText('Front Till'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New POS device/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Front Till' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Map restaurants/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revoke browser till/ })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Set inactive' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'KOT print for Front Till' })).toBeDisabled();
  });

  it('names what a new device is missing', async () => {
    api.listPosDevices.mockImplementation(() => page([]));
    const { user } = renderScreen(<PosDevicesTab />);

    await user.click(await screen.findByRole('button', { name: /New POS device/ }));
    const dialog = screen.getByRole('dialog', { name: 'New POS device' });
    await user.click(within(dialog).getByRole('button', { name: 'Add POS device' }));

    expect(await within(dialog).findByText('Name is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('Code is required.')).toBeInTheDocument();
    expect(api.createPosDevice).not.toHaveBeenCalled();
  });

  it('rejects a host name with spaces or underscores as soon as the field is left', async () => {
    api.listPosDevices.mockImplementation(() => page([]));
    const { user } = renderScreen(<PosDevicesTab />);

    await user.click(await screen.findByRole('button', { name: /New POS device/ }));
    const dialog = screen.getByRole('dialog', { name: 'New POS device' });
    await user.type(within(dialog).getByLabelText('Host name'), 'max_pos 01');
    // Leaving the field (a click elsewhere: the dialog keeps Tab to itself, and jsdom has no
    // layout for it to find the next field by).
    await user.click(within(dialog).getByLabelText(/Code/));

    expect(await within(dialog).findByText(/Enter a valid host name/)).toBeInTheDocument();
  });

  it('creates a device at the header location under its entity, with its restaurants and users', async () => {
    api.listPosDevices.mockImplementation(() => page([]));
    api.createPosDevice.mockImplementation(() => reply(device({ id: 'pd-9' })));
    const { user } = renderScreen(<PosDevicesTab />);

    await user.click(await screen.findByRole('button', { name: /New POS device/ }));
    const dialog = screen.getByRole('dialog', { name: 'New POS device' });
    await user.type(within(dialog).getByLabelText(/Name/, { selector: '#pos-name' }), 'Back Till');
    await user.type(within(dialog).getByLabelText(/Code/), 'POS-02');
    await user.click(await within(dialog).findByRole('checkbox', { name: 'Cafe Max' }));
    await user.click(within(dialog).getByRole('button', { name: /Add user/ }));
    await within(dialog).findByRole('option', { name: 'Asha Verma (E100)' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'User 1' }), asha.id);
    await user.type(
      within(dialog).getByRole('textbox', { name: 'User 1’s computer name' }),
      'PPG-DESK-7',
    );
    await user.click(within(dialog).getByRole('switch', { name: 'KOT Print' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add POS device' }));

    await waitFor(() =>
      expect(api.createPosDevice).toHaveBeenCalledWith({
        code: 'POS-02',
        hospitalId: patparganj.id,
        hostName: '',
        isActive: true,
        isInvoicePrintEnabled: false,
        isKotPrintEnabled: true,
        legalEntityId: 'e1',
        name: 'Back Till',
        restaurantIds: [cafe.id],
        users: [{ hostName: 'PPG-DESK-7', userId: asha.id }],
      }),
    );
  });

  it('edits a device without re-sending its untouched restaurant mapping', async () => {
    api.listPosDevices.mockImplementation(() => page([device()]));
    api.updatePosDevice.mockImplementation(() => reply(device()));
    const { user } = renderScreen(<PosDevicesTab />);

    await user.click(await screen.findByRole('button', { name: 'Edit Front Till' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit POS device' });
    expect(within(dialog).getByRole('combobox', { name: 'User 1' })).toHaveValue(asha.id);
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.updatePosDevice).toHaveBeenCalled());
    const [id, body] = api.updatePosDevice.mock.calls[0]!;
    expect(id).toBe('pd-1');
    expect(body).toMatchObject({
      code: 'POS-01',
      hostName: 'MAX-PPG-POS-01',
      users: [{ hostName: 'PPG-DESK-7', userId: asha.id }],
    });
    // Re-sending a mapping that holds a since-deactivated restaurant was refused.
    expect(body.restaurantIds).toBeUndefined();
  });

  it('switches KOT printing straight from the list, and shows a refusal', async () => {
    api.listPosDevices.mockImplementation(() => page([device()]));
    api.updatePosDevice.mockRejectedValue(new Error('POS device is inactive'));
    const { user } = renderScreen(<PosDevicesTab />);

    await user.click(await screen.findByRole('switch', { name: 'KOT print for Front Till' }));

    await waitFor(() =>
      expect(api.updatePosDevice).toHaveBeenCalledWith('pd-1', { isKotPrintEnabled: false }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('POS device is inactive');
  });

  it("revokes the device's browser till access once confirmed", async () => {
    api.listPosDevices.mockImplementation(() => page([device()]));
    api.revokeTill.mockImplementation(() => reply({}) as never);
    const { user } = renderScreen(<PosDevicesTab />);

    await user.click(
      await screen.findByRole('button', { name: 'Revoke browser till access for Front Till' }),
    );
    await user.click(screen.getByRole('button', { name: 'Revoke access' }));

    await waitFor(() => expect(api.revokeTill).toHaveBeenCalledWith('pd-1'));
  });

  it("opens the device's restaurant mapping", async () => {
    api.listPosDevices.mockImplementation(() => page([device()]));
    const { user } = renderScreen(<PosDevicesTab />);

    await user.click(await screen.findByRole('button', { name: 'Map restaurants to Front Till' }));

    expect(
      screen.getByRole('dialog', { name: "Restaurant's Accessibility - POS-01" }),
    ).toBeInTheDocument();
  });
});
