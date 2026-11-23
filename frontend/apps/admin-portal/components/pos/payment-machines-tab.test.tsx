import type { Hospital, PaymentMachine, PosDevice } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { PaymentMachinesTab } from './payment-machines-tab';

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
  createPaymentMachine: vi.fn<Client['createPaymentMachine']>(),
  listHospitals: vi.fn<Client['listHospitals']>(),
  listPaymentMachines: vi.fn<Client['listPaymentMachines']>(),
  listPosDevices: vi.fn<Client['listPosDevices']>(),
  updatePaymentMachine: vi.fn<Client['updatePaymentMachine']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

// The form checks the location and POS device are real ids (UUIDs).
const patparganj = {
  ...ppg,
  address: null,
  city: 'New Delhi',
  id: '11111111-1111-4111-8111-111111111111',
  state: 'Delhi',
} as unknown as Hospital;
const till = {
  code: 'POS-01',
  id: '44444444-4444-4444-8444-444444444444',
  isActive: true,
  name: 'Front Till',
} as PosDevice;

const machine = (overrides: Partial<PaymentMachine> = {}): PaymentMachine => ({
  createdAt: '2026-11-01T05:00:00Z',
  deletedAt: null,
  hasPinelabSecurityToken: true,
  hospital: patparganj,
  hospitalId: patparganj.id,
  id: 'm1',
  isActive: true,
  isDefault: true,
  name: 'Pine Labs 1',
  pinelabImei: null,
  pinelabMerchantId: '29610',
  pinelabMerchantStorePosCode: null,
  pinelabSecurityToken: '••••',
  posDevice: till,
  posDeviceId: till.id,
  primaryUpi: 'PHONEPE',
  serialNumber: '7000123',
  updatedAt: '2026-11-19T05:00:00Z',
  ...overrides,
});

const all = ['PAYMENT_MACHINE_VIEW', 'PAYMENT_MACHINE_CREATE', 'PAYMENT_MACHINE_UPDATE'];

// Filling a whole form types many keys: on a busy machine that takes longer than the default 5 s.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/pos', 'tab=payments');
  atLocation(patparganj, [patparganj]);
  signedIn(all);
  api.listHospitals.mockImplementation(() => page([patparganj]));
  api.listPosDevices.mockImplementation(() => page([till]));
});

describe('the Payment machines tab', () => {
  it('lists machines with their numbers, POS device and UPI provider', async () => {
    api.listPaymentMachines.mockImplementation(() => page([machine()]));
    renderScreen(<PaymentMachinesTab />);

    const row = (await screen.findByText('Pine Labs 1')).closest('tr') as HTMLElement;
    expect(within(row).getByText('7000123')).toBeInTheDocument();
    expect(within(row).getByText('29610')).toBeInTheDocument();
    expect(within(row).getByText('Not set')).toBeInTheDocument();
    expect(within(row).getByText('Front Till')).toBeInTheDocument();
    expect(within(row).getByText('PhonePe')).toBeInTheDocument();
    expect(within(row).getByRole('switch', { name: 'Primary machine: Pine Labs 1' })).toBeChecked();
    expect(api.listPaymentMachines).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalId: patparganj.id, limit: 20, page: 1 }),
    );
  });

  it('says there are none at the location, or why the list failed', async () => {
    api.listPaymentMachines.mockImplementation(() => page([]));
    const first = renderScreen(<PaymentMachinesTab />);
    expect(await screen.findByText('No payment machines at Patparganj')).toBeInTheDocument();
    first.unmount();

    api.listPaymentMachines.mockRejectedValue(new Error('Machines could not be loaded'));
    renderScreen(<PaymentMachinesTab />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Machines could not be loaded');
  });

  it('searches through the API', async () => {
    api.listPaymentMachines.mockImplementation(() => page([]));
    const { user } = renderScreen(<PaymentMachinesTab />);

    await user.type(
      await screen.findByRole('searchbox', { name: 'Search payment machines' }),
      '29610',
    );
    await waitFor(() =>
      expect(api.listPaymentMachines).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: '29610' }),
      ),
    );
  });

  it('offers New payment machine, editing and the switches only to those allowed to', async () => {
    signedIn(['PAYMENT_MACHINE_VIEW']);
    api.listPaymentMachines.mockImplementation(() => page([machine()]));
    const { user } = renderScreen(<PaymentMachinesTab />);

    await user.click(await screen.findByText('Pine Labs 1'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New payment machine/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Pine Labs 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Set inactive' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Primary machine: Pine Labs 1' })).toBeDisabled();
  });

  it('checks the numbers before adding a machine', async () => {
    api.listPaymentMachines.mockImplementation(() => page([]));
    const { user } = renderScreen(<PaymentMachinesTab />);

    await user.click(await screen.findByRole('button', { name: /New payment machine/ }));
    const dialog = screen.getByRole('dialog', { name: 'New Payment Machine' });
    await user.type(within(dialog).getByLabelText('Serial number'), '70-01');
    await user.click(within(dialog).getByRole('button', { name: 'Add payment machine' }));

    expect(await within(dialog).findByText('Name is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('Select a POS device.')).toBeInTheDocument();
    expect(within(dialog).getByText('Use digits only.')).toBeInTheDocument();
    expect(api.createPaymentMachine).not.toHaveBeenCalled();
  });

  it('adds a machine to a POS device at the header location', async () => {
    api.listPaymentMachines.mockImplementation(() => page([]));
    api.createPaymentMachine.mockImplementation(() => reply(machine({ id: 'm9' })));
    const { user } = renderScreen(<PaymentMachinesTab />);

    await user.click(await screen.findByRole('button', { name: /New payment machine/ }));
    const dialog = screen.getByRole('dialog', { name: 'New Payment Machine' });
    await within(dialog).findByRole('option', { name: 'Front Till (POS-01)' });
    await user.selectOptions(within(dialog).getByLabelText(/POS Device/), till.id);
    await user.type(within(dialog).getByLabelText(/Name/), 'Pine Labs 2');
    await user.type(within(dialog).getByLabelText('Serial number'), '7000456');
    await user.selectOptions(within(dialog).getByLabelText('Primary UPI'), 'GOOGLE_PAY');
    await user.click(within(dialog).getByRole('switch', { name: 'Default' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add payment machine' }));

    await waitFor(() =>
      expect(api.createPaymentMachine).toHaveBeenCalledWith({
        hospitalId: patparganj.id,
        isActive: true,
        isDefault: true,
        name: 'Pine Labs 2',
        pinelabImei: undefined,
        pinelabMerchantId: undefined,
        pinelabMerchantStorePosCode: undefined,
        pinelabSecurityToken: undefined,
        posDeviceId: till.id,
        primaryUpi: 'GOOGLE_PAY',
        serialNumber: '7000456',
      }),
    );
  });

  it('edits a machine on its saved POS device, keeping the saved token and clearing blanks', async () => {
    api.listPaymentMachines.mockImplementation(() => page([machine()]));
    api.updatePaymentMachine.mockImplementation(() => reply(machine()));
    const { user } = renderScreen(<PaymentMachinesTab />);

    await user.click(await screen.findByRole('button', { name: 'Edit Pine Labs 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Payment Machine' });
    // Once its options arrive, the POS device box shows the saved one.
    await within(dialog).findByRole('option', { name: 'Front Till (POS-01)' });
    expect(within(dialog).getByLabelText(/POS Device/)).toHaveValue(till.id);
    await user.clear(within(dialog).getByLabelText('Pine Labs merchant ID'));
    await user.selectOptions(within(dialog).getByLabelText('Primary UPI'), '');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(api.updatePaymentMachine).toHaveBeenCalledWith(
        'm1',
        expect.objectContaining({
          pinelabMerchantId: '',
          pinelabSecurityToken: undefined,
          posDeviceId: till.id,
          primaryUpi: null,
          serialNumber: '7000123',
        }),
      ),
    );
  });

  it('makes a machine the primary one straight from the list, and shows a refusal', async () => {
    api.listPaymentMachines.mockImplementation(() => page([machine({ isDefault: false })]));
    api.updatePaymentMachine.mockRejectedValue(new Error('POS device is inactive'));
    const { user } = renderScreen(<PaymentMachinesTab />);

    await user.click(await screen.findByRole('switch', { name: 'Primary machine: Pine Labs 1' }));

    await waitFor(() =>
      expect(api.updatePaymentMachine).toHaveBeenCalledWith('m1', { isDefault: true }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('POS device is inactive');
  });
});
