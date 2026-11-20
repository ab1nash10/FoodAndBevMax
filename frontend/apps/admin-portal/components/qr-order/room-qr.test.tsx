import { ApiClientError, type QrOrderView, type QrRoom } from '@aahar/api-client';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, reply } from '@/test/harness';
import { RoomQr } from './room-qr';
import type * as ApiModule from '@/lib/api';

type Client = typeof ApiModule.publicOrganizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  getQrOrder: vi.fn<Client['getQrOrder']>(),
  getQrRoom: vi.fn<Client['getQrRoom']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  publicOrganizationApi: api,
}));

const room = (patch: Partial<QrRoom> = {}): QrRoom => ({
  locationAddress: 'Max Hospital, Patparganj, New Delhi',
  locationName: 'Patparganj',
  restaurants: [
    {
      id: 'r1',
      open: true,
      opensAt: '07:00',
      readyMinutes: { max: 40, min: 25 },
      restaurantName: 'Room Service',
      token: 'secret-1',
    },
    {
      id: 'r2',
      open: false,
      opensAt: '19:30',
      readyMinutes: null,
      restaurantName: 'Juice Bar',
      token: 'secret-2',
    },
  ],
  roomName: 'PG-ECO-06 (EWS)',
  ...patch,
});

const order = (patch: Partial<QrOrderView> = {}) =>
  ({
    channel: 'IN_ROOM',
    grandTotal: 210,
    id: 'order-1',
    kitchenStatus: 'PREPARING',
    lines: [],
    orderNumber: 'A-12',
    readyAt: null,
    readyBy: null,
    restaurantName: 'Room Service',
    roomNumber: 'PG-ECO-06 (EWS)',
    status: 'BILLED',
    ...patch,
  }) as unknown as QrOrderView;

beforeEach(() => {
  vi.clearAllMocks();
  api.getQrRoom.mockImplementation(() => reply(room()));
  api.getQrOrder.mockImplementation(() => reply(order()));
});

describe("a bed's QR page", () => {
  it('shows the bed the food goes to and where it is', async () => {
    renderScreen(<RoomQr roomId="bed-1" />);

    const where = await screen.findByRole('region', { name: 'Where your food goes' });
    expect(where).toHaveTextContent('PG-ECO-06 (EWS)');
    expect(where).toHaveTextContent('Max Hospital, Patparganj, New Delhi');
    expect(api.getQrRoom).toHaveBeenCalledWith('bed-1');
  });

  it('opens an open restaurant’s menu with the bed filled in', async () => {
    renderScreen(<RoomQr roomId="bed-1" />);

    const link = await screen.findByRole('link', { name: /Room Service/ });
    expect(link).toHaveTextContent('Open now');
    expect(link).toHaveTextContent('Ready in 25–40 min');
    const href = new URL(link.getAttribute('href')!, 'http://phone');
    expect(href.pathname).toBe('/fandb/order/r1');
    expect(Object.fromEntries(href.searchParams)).toEqual({
      room: 'PG-ECO-06 (EWS)',
      roomId: 'bed-1',
      token: 'secret-1',
    });
  });

  it('lists a closed restaurant with when it opens, and nothing to tap', async () => {
    renderScreen(<RoomQr roomId="bed-1" />);

    const closed = (await screen.findByText('Juice Bar')).closest('li')!;
    expect(closed).toHaveTextContent('Closed');
    expect(closed).toHaveTextContent('Opens at 7:30 pm');
    expect(within(closed).queryByRole('link')).not.toBeInTheDocument();
  });

  it('falls back to the location’s name when it has no address', async () => {
    api.getQrRoom.mockImplementation(() => reply(room({ locationAddress: null })));
    renderScreen(<RoomQr roomId="bed-1" />);

    expect(await screen.findByRole('region', { name: 'Where your food goes' })).toHaveTextContent(
      'Patparganj',
    );
  });

  it('says when no restaurant delivers to rooms', async () => {
    api.getQrRoom.mockImplementation(() => reply(room({ restaurants: [] })));
    renderScreen(<RoomQr roomId="bed-1" />);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'No restaurant here delivers to rooms right now.',
    );
  });

  it('turns a QR the server refuses into a plain message', async () => {
    api.getQrRoom.mockRejectedValue(new ApiClientError(404, 'Room not found.'));
    renderScreen(<RoomQr roomId="gone" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This QR code is not working' + 'Room not found. Please ask the ward staff for help.',
    );
  });

  it('shows the order this phone has in progress, and opens it', async () => {
    window.localStorage.setItem('aahar:qr-orders', JSON.stringify([{ id: 'order-1', key: 'k' }]));
    const { user } = renderScreen(<RoomQr roomId="bed-1" />);

    const card = await screen.findByRole('button', { name: /Your order A-12/ });
    expect(card).toHaveTextContent('Being prepared');
    expect(api.getQrOrder).toHaveBeenCalledWith('order-1', 'k');

    await user.click(card);
    expect(await screen.findByRole('heading', { name: 'Order A-12' })).toBeInTheDocument();
    // The arrow on top and the button at the bottom both go back to the bed's page.
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(2);
    await user.click(screen.getAllByRole('button', { name: 'Back' })[1]!);
    expect(await screen.findByRole('link', { name: /Room Service/ })).toBeInTheDocument();
  });

  it('leaves out an order that is already delivered', async () => {
    window.localStorage.setItem('aahar:qr-orders', JSON.stringify([{ id: 'order-1', key: 'k' }]));
    api.getQrOrder.mockImplementation(() => reply(order({ kitchenStatus: 'COLLECTED' })));
    const { queryClient } = renderScreen(<RoomQr roomId="bed-1" />);

    await screen.findByRole('link', { name: /Room Service/ });
    await waitFor(() =>
      expect(queryClient.getQueryState(['qr-order', 'order-1'])?.status).toBe('success'),
    );
    // React Query tells the screen a moment after the fetch ends.
    await act(() => new Promise((done) => setTimeout(done, 20)));
    expect(screen.queryByRole('button', { name: /Your order/ })).not.toBeInTheDocument();
  });

  it('opens every order from this phone under My orders', async () => {
    const { user } = renderScreen(<RoomQr roomId="bed-1" />);

    await user.click(screen.getByRole('button', { name: 'My orders' }));

    expect(screen.getByRole('heading', { name: 'My orders' })).toBeInTheDocument();
    expect(screen.getByText('No orders from this phone yet.')).toBeInTheDocument();
  });
});
