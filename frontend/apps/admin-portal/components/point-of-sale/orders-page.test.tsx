import { ApiClientError, type PosCounter, type RestaurantOrder } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { at } from '@/test/next-navigation';
import { PosOrdersPageClient } from './orders-page';
import type * as ApiModule from '@/lib/api';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/test/location'));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  listPosCounters: vi.fn<Client['listPosCounters']>(),
  listRestaurantOrders: vi.fn<Client['listRestaurantOrders']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const counter = {
  counterName: 'Counter 1',
  id: 'counter-1',
  restaurant: { restaurantName: 'Cafe Max' },
  restaurantId: 'r1',
} as PosCounter;

const order = (orderNumber: string, patch: Partial<RestaurantOrder> = {}) =>
  ({
    bedNumber: null,
    billNumber: `PPG/${orderNumber}`,
    channel: 'COUNTER',
    id: orderNumber,
    instructions: null,
    items: [{ name: 'Veg Sandwich', quantity: 1 }],
    orderNumber,
    placedAt: new Date().toISOString(),
    readyAt: null,
    roomNumber: null,
    source: 'COUNTER',
    status: 'PLACED',
    tableName: null,
    ...patch,
  }) satisfies RestaurantOrder;

beforeEach(() => {
  vi.clearAllMocks();
  at('/pos/orders');
  signedIn([]);
  api.listPosCounters.mockImplementation(() => reply([counter]));
  api.listRestaurantOrders.mockImplementation(() =>
    reply([
      order('A-1'),
      order('A-2', { channel: 'ROOM', roomNumber: '412' }),
      order('A-3', { billNumber: null, channel: null, source: 'KIOSK' }),
    ]),
  );
});

describe('the till’s open orders', () => {
  it('counts the orders by where they came from', async () => {
    renderScreen(<PosOrdersPageClient />);

    expect(await screen.findByText('A-1')).toBeInTheDocument();
    expect(api.listRestaurantOrders).toHaveBeenCalledWith('r1');
    const tabs = within(screen.getByRole('group', { name: 'Order source' }));
    expect(tabs.getByRole('button', { name: /All/ })).toHaveTextContent('3');
    expect(tabs.getByRole('button', { name: /Counter/ })).toHaveTextContent('1');
    expect(tabs.getByRole('button', { name: /Room/ })).toHaveTextContent('1');
    expect(tabs.getByRole('button', { name: /Online & kiosk/ })).toHaveTextContent('1');
  });

  it('shows only room orders from the link that asks for them', async () => {
    at('/pos/orders', 'view=room');
    renderScreen(<PosOrdersPageClient />);

    expect(await screen.findByText('A-2')).toBeInTheDocument();
    expect(screen.queryByText('A-1')).not.toBeInTheDocument();
    expect(screen.queryByText('A-3')).not.toBeInTheDocument();
  });

  it('finds an order by its room', async () => {
    const { user } = renderScreen(<PosOrdersPageClient />);
    await screen.findByText('A-1');

    await user.type(screen.getByRole('searchbox', { name: 'Search orders' }), '412');

    await waitFor(() => expect(screen.queryByText('A-1')).not.toBeInTheDocument());
    expect(screen.getByText('A-2')).toBeInTheDocument();
  });

  it('keeps dine-in table orders under Table, found by the table', async () => {
    api.listRestaurantOrders.mockImplementation(() =>
      reply([order('A-1'), order('A-4', { channel: 'TABLE', tableName: 'Window 2' })]),
    );
    const { user } = renderScreen(<PosOrdersPageClient />);

    await screen.findByText('A-4');
    const tabs = within(screen.getByRole('group', { name: 'Order source' }));
    expect(tabs.getByRole('button', { name: /Table/ })).toHaveTextContent('1');
    expect(tabs.getByRole('button', { name: /Counter/ })).toHaveTextContent('1');
    expect(screen.getByText('Table Window 2')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search orders' }), 'window');
    await waitFor(() => expect(screen.queryByText('A-1')).not.toBeInTheDocument());
    expect(screen.getByText('A-4')).toBeInTheDocument();
  });

  it('says when there are no open orders', async () => {
    api.listRestaurantOrders.mockImplementation(() => reply([]));
    renderScreen(<PosOrdersPageClient />);

    expect(await screen.findByText('No open orders')).toBeInTheDocument();
  });

  it('shows why the orders could not be read', async () => {
    api.listRestaurantOrders.mockRejectedValue(new ApiClientError(500, 'Orders are unavailable.'));
    renderScreen(<PosOrdersPageClient />);

    expect(await screen.findByText('Orders are unavailable.')).toBeInTheDocument();
  });
});
