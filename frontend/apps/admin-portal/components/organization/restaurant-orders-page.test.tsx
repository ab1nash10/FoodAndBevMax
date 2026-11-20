import type { Restaurant, RestaurantOrder } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { RestaurantOrdersPageClient } from './restaurant-orders-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  getRestaurant: vi.fn<Client['getRestaurant']>(),
  getRestaurantBoardLink: vi.fn<Client['getRestaurantBoardLink']>(),
  listCounters: vi.fn<Client['listCounters']>(),
  listOrderStewards: vi.fn<Client['listOrderStewards']>(),
  listRestaurantOrders: vi.fn<Client['listRestaurantOrders']>(),
  setOrderSteward: vi.fn<Client['setOrderSteward']>(),
  setRestaurantOrderStatus: vi.fn<Client['setRestaurantOrderStatus']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const order = (overrides: Partial<RestaurantOrder> = {}): RestaurantOrder => ({
  bedNumber: null,
  billNumber: 'PPG/25-26/000123',
  channel: null,
  id: 'o1',
  instructions: 'Less spicy',
  items: [{ name: 'Veg Thali', quantity: 2 }],
  orderNumber: '101',
  placedAt: new Date().toISOString(),
  readyAt: null,
  roomNumber: null,
  source: 'QR',
  status: 'PLACED',
  tableName: null,
  ...overrides,
});
const roomOrder = order({
  bedNumber: 'b',
  channel: 'ROOM',
  id: 'o2',
  orderNumber: '102',
  roomNumber: '2220',
  status: 'READY',
});

const all = ['ORDER_VIEW', 'ORDER_UPDATE', 'ORDER_STEWARD_ASSIGN', 'RESTAURANT_UPDATE'];

beforeEach(() => {
  vi.clearAllMocks();
  signedIn(all);
  api.getRestaurant.mockImplementation(() =>
    reply({ id: 'rest-1', kioskCounterId: null, restaurantName: 'Cafe Max' } as Restaurant),
  );
  api.getRestaurantBoardLink.mockImplementation(() => reply({ boardToken: 'tok-1' }));
  api.listCounters.mockImplementation(() => page([]));
  api.listOrderStewards.mockImplementation(() =>
    reply([{ employeeCode: 'E100', id: 'st1', name: 'Ravi Kumar' }]),
  );
});

describe("a restaurant's live orders", () => {
  it('shows each order in its column with its items, notes and room', async () => {
    api.listRestaurantOrders.mockImplementation(() => reply([order(), roomOrder]));
    renderScreen(<RestaurantOrdersPageClient restaurantId="rest-1" />);

    const active = (await screen.findByRole('heading', { name: /Active/ })).closest(
      'div',
    ) as HTMLElement;
    expect(within(active).getByText('101')).toBeInTheDocument();
    expect(within(active).getByText('Veg Thali')).toBeInTheDocument();
    expect(within(active).getByText('Less spicy')).toBeInTheDocument();
    expect(within(active).getByText('QR')).toBeInTheDocument();

    const ready = screen
      .getByRole('heading', { name: /Ready \/ delivery/ })
      .closest('div') as HTMLElement;
    expect(within(ready).getByText('Room 2220 · Bed b')).toBeInTheDocument();
    expect(screen.getByText('Cafe Max')).toBeInTheDocument();
  });

  it('says there are no open orders, or why they failed to load', async () => {
    api.listRestaurantOrders.mockImplementation(() => reply([]));
    const first = renderScreen(<RestaurantOrdersPageClient restaurantId="rest-1" />);
    expect(await screen.findByText('No open orders at Cafe Max')).toBeInTheDocument();
    first.unmount();

    api.listRestaurantOrders.mockRejectedValue(new Error('Orders could not be loaded'));
    renderScreen(<RestaurantOrdersPageClient restaurantId="rest-1" />);
    expect(await screen.findByText('Orders could not be loaded')).toBeInTheDocument();
  });

  it('sends a new order to the kitchen', async () => {
    api.listRestaurantOrders.mockImplementation(() => reply([order()]));
    api.setRestaurantOrderStatus.mockImplementation(() => reply(order({ status: 'PREPARING' })));
    const { user } = renderScreen(<RestaurantOrdersPageClient restaurantId="rest-1" />);

    await user.click(await screen.findByRole('button', { name: 'Send to kitchen' }));

    await waitFor(() =>
      expect(api.setRestaurantOrderStatus).toHaveBeenCalledWith('o1', 'PREPARING'),
    );
  });

  it('cancels an app order once confirmed, but leaves counter bills to Bill History', async () => {
    api.listRestaurantOrders.mockImplementation(() =>
      reply([order(), order({ id: 'o3', orderNumber: '103', source: 'COUNTER' })]),
    );
    api.setRestaurantOrderStatus.mockImplementation(() => reply(order({ status: 'CANCELLED' })));
    const { user } = renderScreen(<RestaurantOrdersPageClient restaurantId="rest-1" />);

    // One Cancel: the counter bill has none.
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Cancel order 101?' })).getByRole('button', {
        name: 'Cancel order',
      }),
    );

    await waitFor(() =>
      expect(api.setRestaurantOrderStatus).toHaveBeenCalledWith('o1', 'CANCELLED'),
    );
  });

  it('names the table of a dine-in order, and any staff member marks it served', async () => {
    const tableOrder = order({
      channel: 'TABLE',
      id: 'o3',
      orderNumber: '103',
      status: 'READY',
      tableName: 'Window 2',
    });
    api.listRestaurantOrders.mockImplementation(() => reply([tableOrder]));
    api.setRestaurantOrderStatus.mockImplementation(() =>
      reply({ ...tableOrder, status: 'COLLECTED' }),
    );
    const { user } = renderScreen(<RestaurantOrdersPageClient restaurantId="rest-1" />);

    expect(await screen.findByText('Table Window 2')).toBeInTheDocument();
    expect(screen.getByText('Table')).toBeInTheDocument();
    // No steward to choose: whoever is on the floor takes it over.
    expect(screen.queryByRole('combobox', { name: /Steward/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Served' }));

    await waitFor(() =>
      expect(api.setRestaurantOrderStatus).toHaveBeenCalledWith('o3', 'COLLECTED'),
    );
  });

  it('holds a room delivery until a steward is chosen', async () => {
    api.listRestaurantOrders.mockImplementation(() => reply([roomOrder]));
    api.setOrderSteward.mockImplementation(() => reply(roomOrder));
    const { user } = renderScreen(<RestaurantOrdersPageClient restaurantId="rest-1" />);

    expect(await screen.findByRole('button', { name: 'Delivered' })).toBeDisabled();
    expect(
      screen.getByText('Choose a steward first: they take it to the room.'),
    ).toBeInTheDocument();

    const steward = screen.getByRole('combobox', { name: 'Steward for order 102' });
    await screen.findByRole('option', { name: 'Ravi Kumar (E100)' });
    await user.selectOptions(steward, 'st1');

    await waitFor(() => expect(api.setOrderSteward).toHaveBeenCalledWith('o2', 'st1'));
  });

  it('shows the board to those who may only view orders, without controls', async () => {
    signedIn(['ORDER_VIEW']);
    api.listRestaurantOrders.mockImplementation(() =>
      reply([order(), { ...roomOrder, stewardId: 'st1', stewardName: 'Ravi Kumar' }]),
    );
    renderScreen(<RestaurantOrdersPageClient restaurantId="rest-1" />);

    await screen.findByText('101');
    expect(screen.queryByRole('button', { name: 'Send to kitchen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open TV board/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Kiosk orders are billed at')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Steward for order/ })).not.toBeInTheDocument();
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(api.listOrderStewards).not.toHaveBeenCalled();
  });

  it('makes a new TV and kiosk link once confirmed', async () => {
    api.listRestaurantOrders.mockImplementation(() => reply([]));
    const { user } = renderScreen(<RestaurantOrdersPageClient restaurantId="rest-1" />);

    const newLink = await screen.findByRole('button', { name: /New link/ });
    await waitFor(() => expect(newLink).toBeEnabled());
    await user.click(newLink);
    await user.click(screen.getByRole('button', { name: 'Make new link' }));

    await waitFor(() => expect(api.getRestaurantBoardLink).toHaveBeenCalledWith('rest-1', true));
    expect(await screen.findByText('New TV link ready')).toBeInTheDocument();
  });
});
