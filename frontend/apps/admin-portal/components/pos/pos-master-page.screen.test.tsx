import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { PosMasterPageClient } from './pos-master-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/test/location'));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  listPaymentMachines: vi.fn<Client['listPaymentMachines']>(),
  listPosDevices: vi.fn<Client['listPosDevices']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));
// The tabs have their own tests; here only which one shows matters.
vi.mock('@/components/pos/counters-tab', () => ({ CountersTab: () => <p>Counters list</p> }));
vi.mock('@/components/pos/payment-machines-tab', () => ({
  PaymentMachinesTab: () => <p>Payment machines list</p>,
}));
vi.mock('@/components/pos/pos-devices-tab', () => ({
  PosDevicesTab: () => <p>POS devices list</p>,
}));

const counted = (all: number, inactive: number) => (query?: { isActive?: boolean }) =>
  page(Array.from({ length: query?.isActive === false ? inactive : all }, () => ({}) as never));

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/pos');
  atLocation(ppg);
  api.listPosDevices.mockImplementation(counted(5, 1));
  api.listPaymentMachines.mockImplementation(counted(3, 2));
});

describe('POS & Payment Machines', () => {
  it('opens on POS devices with the counts of devices and machines at the location', async () => {
    signedIn(['POS_DEVICE_VIEW', 'PAYMENT_MACHINE_VIEW', 'COUNTER_VIEW']);
    renderScreen(<PosMasterPageClient />);

    expect(screen.getByText('POS devices list')).toBeInTheDocument();
    const glance = screen.getByRole('group', { name: 'POS at a glance' });
    expect(
      await within(glance).findByRole('button', { name: /^POS devices\s*5/ }),
    ).toBeInTheDocument();
    expect(
      within(glance).getByRole('button', { name: /^Inactive devices\s*1/ }),
    ).toBeInTheDocument();
    expect(
      await within(glance).findByRole('button', { name: /^Payment machines\s*3/ }),
    ).toBeInTheDocument();
    expect(
      within(glance).getByRole('button', { name: /^Inactive machines\s*2/ }),
    ).toBeInTheDocument();
    expect(api.listPosDevices).toHaveBeenCalledWith({
      hospitalId: 'h-ppg',
      isActive: undefined,
      limit: 0,
    });
  });

  it('shows the tab in the link', () => {
    signedIn(['POS_DEVICE_VIEW', 'PAYMENT_MACHINE_VIEW', 'COUNTER_VIEW']);
    at('/masters/pos', 'tab=counters');
    renderScreen(<PosMasterPageClient />);

    expect(screen.getByText('Counters list')).toBeInTheDocument();
  });

  it('offers only the tabs the user may view, and asks nothing of the others', () => {
    signedIn(['COUNTER_VIEW']);
    // A link to a tab they may not view falls back to one they may.
    at('/masters/pos', 'tab=devices');
    renderScreen(<PosMasterPageClient />);

    expect(screen.getByText('Counters list')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Counters' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'POS Devices' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Payment Machines' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^POS devices/ })).not.toBeInTheDocument();
    expect(api.listPosDevices).not.toHaveBeenCalled();
    expect(api.listPaymentMachines).not.toHaveBeenCalled();
  });
});
