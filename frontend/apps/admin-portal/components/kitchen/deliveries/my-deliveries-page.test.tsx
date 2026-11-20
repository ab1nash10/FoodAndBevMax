import { screen, waitFor, within } from '@testing-library/react';
import type { RestaurantOrder } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { renderScreen, reply } from '@/test/harness';
import { MyDeliveriesPageClient } from './my-deliveries-page';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: { listMyDeliveries: vi.fn(), markOrderDelivered: vi.fn() },
}));

const api = mockedApi(organizationApi);

const order = (patch: Partial<RestaurantOrder>) =>
  ({
    bedNumber: 'B',
    id: 'o-1',
    instructions: null,
    items: [
      { name: 'Veg Thali', quantity: 2 },
      { name: 'Lassi', quantity: 1 },
    ],
    orderNumber: '1042',
    restaurantName: 'Cafeteria',
    roomNumber: '412',
    status: 'READY',
    ...patch,
  }) as RestaurantOrder & { restaurantName: string };

const ready = order({ instructions: 'No onion' });
const cooking = order({
  bedNumber: null,
  id: 'o-2',
  orderNumber: '1043',
  roomNumber: null,
  status: 'PREPARING',
});

beforeEach(() => {
  vi.clearAllMocks();
  api.listMyDeliveries.mockReturnValue(reply([ready, cooking]));
  api.markOrderDelivered.mockReturnValue(reply({}) as never);
});

const panel = (title: string) =>
  within(screen.getByRole('heading', { name: new RegExp(`^${title}`) }).parentElement!);

describe('a steward’s deliveries', () => {
  it('splits orders into ready to take and still in the kitchen, with bed and items', async () => {
    renderScreen(<MyDeliveriesPageClient />);
    await screen.findByText('1042');

    const readyPanel = panel('Ready to take');
    expect(readyPanel.getByText('1042')).toBeInTheDocument();
    expect(readyPanel.getByText('412 · Bed B')).toBeInTheDocument();
    expect(readyPanel.getByText('No onion')).toBeInTheDocument();
    expect(readyPanel.getByText(/Veg Thali/).closest('li')).toHaveTextContent('2 × Veg Thali');

    const cookingPanel = panel('In the kitchen');
    expect(cookingPanel.getByText('1043')).toBeInTheDocument();
    expect(cookingPanel.getByText('Room not given')).toBeInTheDocument();
    // Only a ready order can be marked delivered.
    expect(cookingPanel.queryByRole('button', { name: 'Delivered' })).toBeNull();
  });

  it('marks a ready order delivered and reloads the list', async () => {
    const { user } = renderScreen(<MyDeliveriesPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Delivered' }));

    await waitFor(() => expect(api.markOrderDelivered).toHaveBeenCalledWith('o-1'));
    await waitFor(() => expect(api.listMyDeliveries).toHaveBeenCalledTimes(2));
  });

  it('says why an order was not marked delivered', async () => {
    api.markOrderDelivered.mockRejectedValue(new Error('Order was cancelled'));
    const { user } = renderScreen(<MyDeliveriesPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Delivered' }));

    expect(await screen.findByText('Order was cancelled')).toBeInTheDocument();
    expect(screen.getByText('Not delivered')).toBeInTheDocument();
  });

  it('says when there is nothing to deliver, and why the list did not load', async () => {
    api.listMyDeliveries.mockReturnValue(reply([]));
    const { unmount } = renderScreen(<MyDeliveriesPageClient />);
    expect(await screen.findByText('No deliveries for you right now')).toBeInTheDocument();
    unmount();

    api.listMyDeliveries.mockRejectedValue(new Error('Orders are down'));
    renderScreen(<MyDeliveriesPageClient />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Orders are down');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
