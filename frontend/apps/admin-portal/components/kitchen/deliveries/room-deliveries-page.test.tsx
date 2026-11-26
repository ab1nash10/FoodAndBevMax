import type { RoomDeliveries, RoomDelivery } from '@aahar/api-client';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { atLocation, ppg } from '@/test/location';
import { RoomDeliveriesPageClient } from './room-deliveries-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/test/location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: { listRoomDeliveries: vi.fn(), setOrderSteward: vi.fn() },
}));

const api = mockedApi(organizationApi);

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const order = (patch: Partial<RoomDelivery>): RoomDelivery => ({
  bedNumber: 'B',
  billNumber: null,
  channel: 'ROOM',
  hospitalId: 'h-ppg',
  id: 'o-1',
  instructions: null,
  items: [
    { name: 'Veg thali', quantity: 2 },
    { name: 'Masala chai', quantity: 1 },
  ],
  orderNumber: '1042',
  placedAt: minutesAgo(20),
  readyAt: null,
  restaurantName: 'Cafe Max',
  roomNumber: '304',
  source: 'POS',
  status: 'PREPARING',
  stewardId: null,
  stewardName: null,
  tableName: null,
  undeliveredReason: null,
  ...patch,
});

const deliveries = (patch: Partial<RoomDeliveries> = {}): RoomDeliveries => ({
  deliveredToday: 37,
  orders: [
    order({ id: 'o-1', orderNumber: '1042', status: 'READY', readyAt: minutesAgo(4) }),
    order({
      id: 'o-2',
      orderNumber: '1045',
      roomNumber: '210',
      undeliveredReason: 'Patient not in room',
    }),
    order({
      id: 'o-3',
      orderNumber: '1038',
      roomNumber: '512',
      status: 'READY',
      readyAt: minutesAgo(6),
      stewardId: 's-ravi',
      stewardName: 'Ravi Kumar',
    }),
    order({ id: 'o-4', orderNumber: '1040', stewardId: 's-sunil', stewardName: 'Sunil' }),
  ],
  stewards: [
    { employeeCode: 'EMP221', hospitalIds: ['h-ppg'], id: 's-ravi', name: 'Ravi Kumar' },
    { employeeCode: 'EMP230', hospitalIds: ['h-ppg'], id: 's-sunil', name: 'Sunil' },
    // Works at another location: an order here is not theirs to take.
    { employeeCode: 'EMP300', hospitalIds: ['h-skt'], id: 's-amit', name: 'Amit' },
  ],
  ...patch,
});

const waiting = () => within(screen.getByRole('region', { name: /Waiting for a steward/ }));
const withSteward = () => within(screen.getByRole('region', { name: /With a steward/ }));

beforeEach(() => {
  vi.clearAllMocks();
  atLocation(ppg);
  signedIn(['ORDER_VIEW', 'ORDER_STEWARD_ASSIGN']);
  api.listRoomDeliveries.mockImplementation(() => reply(deliveries()));
  api.setOrderSteward.mockImplementation(() => reply(order({ stewardId: 's-ravi' })));
});

describe('room deliveries, for those who run them', () => {
  it("shows the header location's open room orders: waiting ones first, then each steward's", async () => {
    renderScreen(<RoomDeliveriesPageClient />);

    expect(await screen.findByRole('heading', { name: 'Room deliveries' })).toBeInTheDocument();
    expect(api.listRoomDeliveries).toHaveBeenCalledWith('h-ppg');

    expect(await screen.findByRole('region', { name: /Waiting for a steward/ })).toBeVisible();
    expect(waiting().getByText('1042')).toBeInTheDocument();
    expect(waiting().getByText(/Room 304 · Bed B/)).toBeInTheDocument();
    expect(waiting().getByText('Ready 4 min ago')).toBeInTheDocument();
    // A steward gave it back from the bed: why, until someone gives it again.
    expect(waiting().getByText('Couldn’t deliver: Patient not in room')).toBeInTheDocument();

    const ravi = within(withSteward().getByRole('group', { name: 'Ravi Kumar (EMP221)' }));
    expect(ravi.getByText('1038')).toBeInTheDocument();
    expect(ravi.getByText('Ready 6 min ago')).toBeInTheDocument();
    const sunil = within(withSteward().getByRole('group', { name: 'Sunil (EMP230)' }));
    expect(sunil.getByText('1040')).toBeInTheDocument();
    expect(sunil.getByText('In kitchen')).toBeInTheDocument();

    expect(screen.getByText('Delivered today:')).toHaveTextContent('Delivered today: 37');
  });

  it('gives a waiting order to one of its own location’s stewards', async () => {
    const { user } = renderScreen(<RoomDeliveriesPageClient />);
    const picker = await screen.findByRole('combobox', { name: 'Steward for order 1042' });

    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['None', 'Ravi Kumar (EMP221)', 'Sunil (EMP230)']);
    await user.selectOptions(picker, 's-ravi');

    expect(api.setOrderSteward).toHaveBeenCalledWith('o-1', 's-ravi');
  });

  it('shows who has each order, with no picker, to someone who may not give orders out', async () => {
    signedIn(['ORDER_VIEW']);
    renderScreen(<RoomDeliveriesPageClient />);

    expect(await screen.findByRole('group', { name: 'Ravi Kumar (EMP221)' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Steward for order/ })).not.toBeInTheDocument();
  });

  it('asks for every location the user has when the header shows All locations', async () => {
    atLocation(null);
    renderScreen(<RoomDeliveriesPageClient />);

    await screen.findByRole('heading', { name: 'Room deliveries' });
    expect(api.listRoomDeliveries).toHaveBeenCalledWith(undefined);
  });

  it('says when no room order is open, with the day’s deliveries still counted', async () => {
    api.listRoomDeliveries.mockImplementation(() =>
      reply(deliveries({ deliveredToday: 5, orders: [] })),
    );
    renderScreen(<RoomDeliveriesPageClient />);

    expect(await screen.findByText('No room orders open right now')).toBeInTheDocument();
    expect(screen.getByText('Delivered today:')).toHaveTextContent('Delivered today: 5');
  });
});
