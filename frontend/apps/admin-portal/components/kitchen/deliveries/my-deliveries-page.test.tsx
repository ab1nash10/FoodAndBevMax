import { act, screen, waitFor, within } from '@testing-library/react';
import type { Delivery } from '@aahar/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { renderScreen, reply } from '@/test/harness';
import { at } from '@/test/next-navigation';
import { MyDeliveriesPageClient, UNDO_MS, newAlerts } from './my-deliveries-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    listMyDeliveries: vi.fn(),
    markOrderDelivered: vi.fn(),
    markOrderNotDelivered: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const order = (patch: Partial<Delivery>): Delivery => ({
  bedNumber: 'B',
  billNumber: null,
  channel: 'ROOM',
  deliveredAt: null,
  needsCode: false,
  id: 'o-1',
  instructions: null,
  items: [
    { name: 'Veg thali', quantity: 2 },
    { name: 'Masala chai', note: 'less sugar', quantity: 1 },
  ],
  orderNumber: '0142',
  placedAt: minutesAgo(20),
  readyAt: minutesAgo(6),
  restaurantName: 'BLK Main Restaurant',
  roomNumber: '304',
  source: 'COUNTER',
  status: 'READY',
  stewardAssignedAt: minutesAgo(19),
  tableName: null,
  undeliveredAt: null,
  undeliveredReason: null,
  ...patch,
});

const ready = order({ instructions: 'Leave with the nurse if the patient is asleep.' });
const cooking = order({
  bedNumber: '2',
  id: 'o-2',
  items: [{ name: 'Idli sambar', quantity: 1 }],
  orderNumber: '0147',
  readyAt: null,
  roomNumber: '412',
  status: 'PREPARING',
});

beforeEach(() => {
  vi.clearAllMocks();
  at('/deliveries');
  api.listMyDeliveries.mockReturnValue(reply([ready, cooking]));
  api.markOrderDelivered.mockReturnValue(reply({}) as never);
  api.markOrderNotDelivered.mockReturnValue(reply({}) as never);
});

afterEach(() => vi.useRealTimers());

const section = (name: string) => within(screen.getByRole('region', { name }));

describe('a steward’s deliveries on the phone', () => {
  it('lists what is ready to take, with room, bed, items and notes, then what is being made', async () => {
    renderScreen(<MyDeliveriesPageClient />);

    const readyList = await waitFor(() => section('Ready to take'));
    expect(await readyList.findByText('Room 304 · Bed B')).toBeInTheDocument();
    expect(readyList.getByText('Pick up at BLK Main Restaurant')).toBeInTheDocument();
    expect(readyList.getByText(/Veg thali/).closest('li')).toHaveTextContent('2 × Veg thali');
    expect(readyList.getByText(/Masala chai/).closest('li')).toHaveTextContent('less sugar');
    expect(
      readyList.getByText('Leave with the nurse if the patient is asleep.'),
    ).toBeInTheDocument();
    expect(readyList.getByText('Ready 6 min ago')).toBeInTheDocument();
    expect(readyList.getByRole('button', { name: 'Delivered' })).toBeInTheDocument();

    const coming = section('Being made');
    expect(coming.getByText('Room 412 · Bed 2')).toBeInTheDocument();
    // Nothing to hand over while it is still in the kitchen.
    expect(coming.queryByRole('button', { name: 'Delivered' })).toBeNull();
  });

  it('marks one delivered after a moment to undo it, and Undo keeps it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderScreen(<MyDeliveriesPageClient />);

    await user.click(
      within(await screen.findByRole('region', { name: 'Ready to take' })).getByRole('button', {
        name: 'Delivered',
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('#0142 delivered');
    expect(screen.queryByText('Room 304 · Bed B')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Room 304 · Bed B')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(UNDO_MS + 100);
    });
    expect(api.markOrderDelivered).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delivered' }));
    act(() => {
      vi.advanceTimersByTime(UNDO_MS + 100);
    });
    await waitFor(() => expect(api.markOrderDelivered).toHaveBeenCalledWith('o-1'));
  });

  it('sends a delivery waiting out its undo at once when the screen closes', async () => {
    const { unmount, user } = renderScreen(<MyDeliveriesPageClient />);

    await user.click(
      within(await screen.findByRole('region', { name: 'Ready to take' })).getByRole('button', {
        name: 'Delivered',
      }),
    );
    unmount();

    expect(api.markOrderDelivered).toHaveBeenCalledWith('o-1');
  });

  it("delivers a phone order with the guest's six digits, sent at once", async () => {
    api.listMyDeliveries.mockReturnValue(reply([{ ...ready, needsCode: true }]));
    const { user } = renderScreen(<MyDeliveriesPageClient />);

    await user.click(
      within(await screen.findByRole('region', { name: 'Ready to take' })).getByRole('button', {
        name: 'Delivered',
      }),
    );
    await user.type(screen.getByRole('textbox', { name: 'Guest’s 6-digit code' }), '482913');
    await user.click(screen.getByRole('button', { name: 'Confirm delivery' }));

    await waitFor(() => expect(api.markOrderDelivered).toHaveBeenCalledWith('o-1', '482913'));
  });

  it("says when the guest's code does not match, and keeps the order", async () => {
    api.listMyDeliveries.mockReturnValue(reply([{ ...ready, needsCode: true }]));
    api.markOrderDelivered.mockRejectedValue(new Error('That code doesn’t match this order.'));
    const { user } = renderScreen(<MyDeliveriesPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Delivered' }));
    await user.type(screen.getByRole('textbox', { name: 'Guest’s 6-digit code' }), '000000');
    await user.click(screen.getByRole('button', { name: 'Confirm delivery' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code doesn’t match this order.',
    );
    expect(screen.getByText('Room 304 · Bed B')).toBeInTheDocument();
  });

  it('gives an order back with why it could not be delivered', async () => {
    const { user } = renderScreen(<MyDeliveriesPageClient />);

    await user.click(await screen.findByRole('link', { name: 'Open order #0142' }));
    expect(screen.getByRole('heading', { name: 'Order #0142' })).toBeInTheDocument();
    expect(screen.getByText('Take to')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Couldn’t deliver' }));
    await user.click(screen.getByRole('button', { name: 'Patient discharged' }));

    await waitFor(() =>
      expect(api.markOrderNotDelivered).toHaveBeenCalledWith('o-1', 'Patient discharged'),
    );
    expect(await screen.findByRole('heading', { name: 'My deliveries' })).toBeInTheDocument();
  });

  it('rings for an order newly given to them, and again when it turns ready', async () => {
    api.listMyDeliveries.mockReturnValue(reply([ready]));
    const { queryClient, user } = renderScreen(<MyDeliveriesPageClient />);
    await screen.findByText('Room 304 · Bed B');
    // What was already there when the screen opened does not ring.
    expect(screen.queryByRole('alertdialog')).toBeNull();

    api.listMyDeliveries.mockReturnValue(reply([ready, cooking]));
    await act(() => queryClient.refetchQueries());
    const given = await screen.findByRole('alertdialog', { name: 'New delivery for you' });
    expect(given).toHaveTextContent('Room 412 · Bed 2');
    expect(given).toHaveTextContent('Order #0147 · 1 item');
    await user.click(within(given).getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    api.listMyDeliveries.mockReturnValue(reply([ready, { ...cooking, status: 'READY' }]));
    await act(() => queryClient.refetchQueries());
    expect(await screen.findByRole('alertdialog', { name: 'Ready to take' })).toHaveTextContent(
      'Pick up at BLK Main Restaurant',
    );
  });

  it('lists what was delivered and given back today', async () => {
    api.listMyDeliveries.mockReturnValue(
      reply([
        order({ deliveredAt: minutesAgo(3), status: 'COLLECTED' }),
        order({
          id: 'o-3',
          orderNumber: '0127',
          roomNumber: '402',
          undeliveredAt: minutesAgo(30),
          undeliveredReason: 'Patient discharged',
        }),
      ]),
    );
    const { user } = renderScreen(<MyDeliveriesPageClient />);

    await user.click(await screen.findByRole('link', { name: 'Delivered today 1' }));
    const done = section('Delivered today');
    expect(done.getByText('Room 304 · Bed B')).toBeInTheDocument();
    expect(done.getByText('Room 402 · Bed B').closest('li')).toHaveTextContent(
      'couldn’t deliver · Patient discharged',
    );
  });

  it('says so when nothing is given to them', async () => {
    api.listMyDeliveries.mockReturnValue(reply([]));
    renderScreen(<MyDeliveriesPageClient />);

    expect(await screen.findByText('No deliveries for you right now')).toBeInTheDocument();
  });

  it('turns alerts on with a tap, as phones only let a page ring after one', async () => {
    const { user } = renderScreen(<MyDeliveriesPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Turn on alerts' }));
    expect(screen.getByRole('button', { name: 'Alerts on' })).toBeInTheDocument();
  });
});

describe('when to ring', () => {
  it('rings for a new order and for one turning ready, never for what was already known', () => {
    expect(newAlerts(undefined, [ready])).toEqual([]);
    expect(newAlerts([ready], [ready])).toEqual([]);
    expect(newAlerts([ready], [ready, cooking])).toEqual([{ kind: 'new', order: cooking }]);

    const nowReady = { ...cooking, status: 'READY' as const };
    expect(newAlerts([cooking], [nowReady])).toEqual([{ kind: 'ready', order: nowReady }]);
    // Given to them already cooked: one ring, to go and take it.
    expect(newAlerts([], [ready])).toEqual([{ kind: 'ready', order: ready }]);
    // Given back, then given to them again.
    const givenBack = { ...ready, undeliveredReason: 'Patient not in room' };
    expect(newAlerts([givenBack], [ready])).toEqual([{ kind: 'ready', order: ready }]);
  });
});
