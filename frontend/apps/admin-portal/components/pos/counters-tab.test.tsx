import type { Counter, Hospital, PosDevice, Restaurant } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { CountersTab } from './counters-tab';

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
  createCounter: vi.fn<Client['createCounter']>(),
  endPosShiftWithoutTill: vi.fn<Client['endPosShiftWithoutTill']>(),
  listCounters: vi.fn<Client['listCounters']>(),
  listHospitals: vi.fn<Client['listHospitals']>(),
  listPosDevices: vi.fn<Client['listPosDevices']>(),
  listRestaurants: vi.fn<Client['listRestaurants']>(),
  updateCounter: vi.fn<Client['updateCounter']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

// The form checks the location and restaurant are real ids (UUIDs).
const patparganj = {
  ...ppg,
  address: null,
  city: 'New Delhi',
  id: '11111111-1111-4111-8111-111111111111',
  state: 'Delhi',
} as unknown as Hospital;
const cafe = {
  id: '33333333-3333-4333-8333-333333333333',
  isActive: true,
  restaurantCode: 'RST-0001',
  restaurantName: 'Cafe Max',
} as Restaurant;
const till = { code: 'POS-01', id: 'pd-1', name: 'Front Till' } as PosDevice;

const counter = (overrides: Partial<Counter> = {}): Counter => ({
  counterCode: 'C-01',
  counterName: 'Billing 1',
  createdAt: '2026-11-01T05:00:00Z',
  deletedAt: null,
  hasTill: true,
  hospital: patparganj,
  hospitalId: patparganj.id,
  id: 'c1',
  isActive: true,
  openShift: null,
  paymentDeviceId: null,
  pineLabsDeviceId: null,
  posDeviceId: 'pd-1',
  restaurant: cafe,
  restaurantId: cafe.id,
  updatedAt: '2026-11-19T05:00:00Z',
  ...overrides,
});

const all = ['COUNTER_VIEW', 'COUNTER_CREATE', 'COUNTER_UPDATE', 'POS_DAY_CLOSE'];

// Filling a whole form types many keys: on a busy machine that takes longer than the default 5 s.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/pos', 'tab=counters');
  atLocation(patparganj, [patparganj]);
  signedIn(all);
  api.listHospitals.mockImplementation(() => page([patparganj]));
  api.listRestaurants.mockImplementation(() => page([cafe]));
  api.listPosDevices.mockImplementation(() => page([till]));
});

describe('the Counters tab', () => {
  it('lists counters with their restaurant, POS device and open shift', async () => {
    api.listCounters.mockImplementation(() =>
      page([
        counter(),
        counter({
          counterName: 'Billing 2',
          id: 'c2',
          openShift: { id: 's1', openedAt: '2026-11-19T04:00:00Z', openedByName: 'Asha Verma' },
          posDeviceId: null,
        }),
      ]),
    );
    renderScreen(<CountersTab />);

    const first = (await screen.findByText('Billing 1')).closest('tr') as HTMLElement;
    expect(within(first).getByText('Cafe Max')).toBeInTheDocument();
    expect(await within(first).findByText('Front Till')).toBeInTheDocument();
    expect(within(first).getByText('No shift open')).toBeInTheDocument();

    const second = screen.getByText('Billing 2').closest('tr') as HTMLElement;
    expect(within(second).getByText('Not set')).toBeInTheDocument();
    expect(within(second).getByText('Open')).toBeInTheDocument();
    expect(within(second).getByText(/Asha Verma · since 19 Nov/)).toBeInTheDocument();
    expect(api.listCounters).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalId: patparganj.id, limit: 20, page: 1 }),
    );
  });

  it('says there are no counters at the location, or why the list failed', async () => {
    api.listCounters.mockImplementation(() => page([]));
    const first = renderScreen(<CountersTab />);
    expect(await screen.findByText('No counters at Patparganj')).toBeInTheDocument();
    first.unmount();

    api.listCounters.mockRejectedValue(new Error('Counters could not be loaded'));
    renderScreen(<CountersTab />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Counters could not be loaded');
  });

  it('searches through the API', async () => {
    api.listCounters.mockImplementation(() => page([]));
    const { user } = renderScreen(<CountersTab />);

    await user.type(await screen.findByRole('searchbox', { name: 'Search counters' }), 'bill');
    await waitFor(() =>
      expect(api.listCounters).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'bill' }),
      ),
    );
  });

  it('offers New counter, editing and the status switch only to those allowed to', async () => {
    signedIn(['COUNTER_VIEW']);
    api.listCounters.mockImplementation(() =>
      page([
        counter({
          hasTill: false,
          openShift: { id: 's1', openedAt: '2026-11-19T04:00:00Z', openedByName: 'Asha Verma' },
        }),
      ]),
    );
    renderScreen(<CountersTab />);

    await screen.findByText('Billing 1');
    expect(screen.queryByRole('button', { name: /New counter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Billing 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Set inactive' })).toBeDisabled();
    // Ending a shift no till can end is for those who close days.
    expect(screen.getByText('No till to end it')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'End shift' })).not.toBeInTheDocument();
  });

  it('names what a new counter is missing', async () => {
    api.listCounters.mockImplementation(() => page([]));
    const { user } = renderScreen(<CountersTab />);

    await user.click(await screen.findByRole('button', { name: /New counter/ }));
    const dialog = screen.getByRole('dialog', { name: 'New Counter' });
    await user.click(within(dialog).getByRole('button', { name: 'Add counter' }));

    expect(await within(dialog).findByText('Name is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('Code is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('Select a restaurant.')).toBeInTheDocument();
    expect(api.createCounter).not.toHaveBeenCalled();
  });

  it('creates a counter at the header location, leaving blank device ids out', async () => {
    api.listCounters.mockImplementation(() => page([]));
    api.createCounter.mockImplementation(() => reply(counter({ id: 'c9' })));
    const { user } = renderScreen(<CountersTab />);

    await user.click(await screen.findByRole('button', { name: /New counter/ }));
    const dialog = screen.getByRole('dialog', { name: 'New Counter' });
    await user.type(within(dialog).getByLabelText(/Name/), 'billing 3');
    await user.type(within(dialog).getByLabelText(/Code/), 'c-03');
    await within(dialog).findByRole('option', { name: 'Cafe Max' });
    await user.selectOptions(within(dialog).getByLabelText(/Restaurant/), cafe.id);
    await within(dialog).findByRole('option', { name: 'Front Till (POS-01)' });
    await user.selectOptions(within(dialog).getByLabelText('POS Device'), 'pd-1');
    await user.click(within(dialog).getByRole('switch', { name: 'Active' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add counter' }));

    await waitFor(() =>
      expect(api.createCounter).toHaveBeenCalledWith({
        counterCode: 'C-03',
        counterName: 'Billing 3',
        hospitalId: patparganj.id,
        isActive: false,
        paymentDeviceId: undefined,
        pineLabsDeviceId: undefined,
        posDeviceId: 'pd-1',
        restaurantId: cafe.id,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New Counter' })).not.toBeInTheDocument(),
    );
  });

  it('clears a device id emptied on an edit, and shows a refusal', async () => {
    api.listCounters.mockImplementation(() => page([counter({ paymentDeviceId: 'PAY-9' })]));
    api.updateCounter.mockRejectedValue(new Error('Counter code C-01 is taken'));
    const { user } = renderScreen(<CountersTab />);

    await user.click(await screen.findByRole('button', { name: 'Edit Billing 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Counter' });
    const payment = within(dialog).getByLabelText('Payment device ID');
    expect(payment).toHaveValue('PAY-9');
    await user.clear(payment);
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(api.updateCounter).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ counterCode: 'C-01', paymentDeviceId: '' }),
      ),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Counter code C-01 is taken');
  });

  it('deactivates a counter once confirmed', async () => {
    api.listCounters.mockImplementation(() => page([counter()]));
    api.updateCounter.mockImplementation(() => reply(counter({ isActive: false })));
    const { user } = renderScreen(<CountersTab />);

    await user.click(await screen.findByRole('switch', { name: 'Set inactive' }));
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(api.updateCounter).toHaveBeenCalledWith('c1', { isActive: false }));
  });

  it('ends a shift no till can reach from the counter row', async () => {
    api.listCounters.mockImplementation(() =>
      page([
        counter({
          hasTill: false,
          openShift: { id: 's1', openedAt: '2026-11-19T04:00:00Z', openedByName: 'Asha Verma' },
        }),
      ]),
    );
    const { user } = renderScreen(<CountersTab />);

    await user.click(await screen.findByRole('button', { name: 'End shift' }));

    expect(
      screen.getByRole('dialog', { name: 'End Asha Verma’s shift at Billing 1?' }),
    ).toBeInTheDocument();
  });
});
