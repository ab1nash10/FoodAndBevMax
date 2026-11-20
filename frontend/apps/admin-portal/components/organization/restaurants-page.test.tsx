import type { Restaurant } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { at, router } from '@/test/next-navigation';
import { RestaurantsPageClient } from './restaurants-page';

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
  getRestaurantBoardLink: vi.fn<Client['getRestaurantBoardLink']>(),
  getStaffDiscounts: vi.fn<Client['getStaffDiscounts']>(),
  listEmployeeDiscounts: vi.fn<Client['listEmployeeDiscounts']>(),
  listRestaurants: vi.fn<Client['listRestaurants']>(),
  updateRestaurant: vi.fn<Client['updateRestaurant']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));
// jsdom has no canvas to draw a QR on.
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,QR')) },
}));

const restaurant = (overrides: Partial<Restaurant> = {}) =>
  ({
    hospital: ppg,
    hospitalId: ppg.id,
    id: 'rest-1',
    isActive: true,
    isInRoomDiningEnabled: true,
    isOffline: false,
    isOnlineOrdersEnabled: true,
    isPosOrdersEnabled: true,
    restaurantCode: 'RST-0001',
    restaurantName: 'Cafe Max',
    thumbnailUrl: null,
    updatedAt: '2026-11-19T05:00:00Z',
    ...overrides,
  }) as Restaurant;

const all = ['RESTAURANT_VIEW', 'RESTAURANT_CREATE', 'RESTAURANT_UPDATE', 'ORDER_VIEW'];

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/restaurants');
  atLocation(ppg);
  signedIn(all);
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ origin: 'https://aahar.test' }), ok: true }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('Restaurants', () => {
  it('lists each restaurant with its online ordering, availability and what it offers', async () => {
    api.listRestaurants.mockImplementation(() => page([restaurant()]));
    renderScreen(<RestaurantsPageClient />);

    const row = (await screen.findByText('Cafe Max')).closest('tr') as HTMLElement;
    expect(within(row).getByText(/RST-0001/)).toBeInTheDocument();
    expect(within(row).getByRole('switch', { name: 'Cafe Max online ordering' })).toBeChecked();
    expect(
      within(row).getByRole('switch', { name: 'Cafe Max restaurant availability' }),
    ).toBeChecked();
    expect(within(row).getByText('In Room Dining')).toBeInTheDocument();
    expect(within(row).getByText('POS Orders')).toBeInTheDocument();
    expect(api.listRestaurants).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalId: 'h-ppg', page: 1, sortBy: 'createdAt' }),
    );
  });

  it('says there are none at the location, or why the list failed', async () => {
    api.listRestaurants.mockImplementation(() => page([]));
    const first = renderScreen(<RestaurantsPageClient />);
    expect(await screen.findByText('No restaurants at Patparganj')).toBeInTheDocument();
    first.unmount();

    api.listRestaurants.mockRejectedValue(new Error('Restaurants could not be loaded'));
    renderScreen(<RestaurantsPageClient />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Restaurants could not be loaded');
  });

  it('searches and sorts through the API', async () => {
    api.listRestaurants.mockImplementation(() => page([]));
    const { user } = renderScreen(<RestaurantsPageClient />);

    await user.type(await screen.findByRole('searchbox', { name: 'Search restaurants' }), 'cafe');
    await waitFor(() =>
      expect(api.listRestaurants).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'cafe' }),
      ),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'Active first');
    await waitFor(() =>
      expect(api.listRestaurants).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'isActive', sortOrder: 'desc' }),
      ),
    );
  });

  it('opens the edit form and the activity page from a row', async () => {
    api.listRestaurants.mockImplementation(() => page([restaurant()]));
    const { user } = renderScreen(<RestaurantsPageClient />);

    expect(await screen.findByRole('link', { name: /New restaurant/ })).toHaveAttribute(
      'href',
      '/masters/restaurants/new',
    );
    await user.click(await screen.findByRole('button', { name: 'Edit Cafe Max' }));
    expect(router.push).toHaveBeenCalledWith('/masters/restaurants/rest-1/edit');
    await user.click(
      screen.getByRole('button', { name: 'Activity for Cafe Max: orders and TV board' }),
    );
    expect(router.push).toHaveBeenCalledWith('/masters/restaurants/rest-1/orders');
  });

  it('gives those who may only view no way to change a restaurant', async () => {
    signedIn(['RESTAURANT_VIEW']);
    api.listRestaurants.mockImplementation(() => page([restaurant()]));
    renderScreen(<RestaurantsPageClient />);

    await screen.findByText('Cafe Max');
    expect(screen.queryByRole('link', { name: /New restaurant/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Cafe Max' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Menu and ordering QR/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Activity for/ })).not.toBeInTheDocument();
    // The server refuses their change, so the switches are not offered.
    expect(screen.getByRole('switch', { name: 'Cafe Max online ordering' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Cafe Max restaurant availability' })).toBeDisabled();
  });

  it('turns online ordering off once confirmed', async () => {
    api.listRestaurants.mockImplementation(() => page([restaurant()]));
    api.updateRestaurant.mockImplementation(() => reply(restaurant()));
    const { user } = renderScreen(<RestaurantsPageClient />);

    await user.click(await screen.findByRole('switch', { name: 'Cafe Max online ordering' }));
    const confirm = screen.getByRole('dialog', { name: 'Turn off online ordering for Cafe Max?' });
    await user.click(within(confirm).getByRole('button', { name: 'Turn off' }));

    await waitFor(() =>
      expect(api.updateRestaurant).toHaveBeenCalledWith('rest-1', { isOnlineOrdersEnabled: false }),
    );
  });

  it('locks online ordering off while the restaurant is closed', async () => {
    api.listRestaurants.mockImplementation(() =>
      page([restaurant({ isActive: false, isOffline: true })]),
    );
    renderScreen(<RestaurantsPageClient />);

    const online = await screen.findByRole('switch', { name: 'Cafe Max online ordering' });
    expect(online).not.toBeChecked();
    expect(online).toBeDisabled();
  });

  it('deactivates a restaurant, taking it offline, and shows a refusal', async () => {
    api.listRestaurants.mockImplementation(() => page([restaurant()]));
    api.updateRestaurant.mockRejectedValue(new Error('Restaurant has an open shift'));
    const { user } = renderScreen(<RestaurantsPageClient />);

    await user.click(
      await screen.findByRole('switch', { name: 'Cafe Max restaurant availability' }),
    );
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() =>
      expect(api.updateRestaurant).toHaveBeenCalledWith('rest-1', {
        isActive: false,
        isOffline: true,
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Restaurant has an open shift');
  });

  it("shows the restaurant's ordering QR with its link", async () => {
    api.listRestaurants.mockImplementation(() => page([restaurant()]));
    api.getRestaurantBoardLink.mockImplementation(() => reply({ boardToken: 'tok-1' }));
    const { user } = renderScreen(<RestaurantsPageClient />);

    await user.click(
      await screen.findByRole('button', { name: 'Menu and ordering QR for Cafe Max' }),
    );

    expect(
      await screen.findByRole('img', { name: 'QR code for Cafe Max menu and ordering' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Ordering link' })).toHaveValue(
      'https://aahar.test/fandb/order/rest-1?token=tok-1',
    );
  });

  it('opens the staff discount panel for a restaurant', async () => {
    api.listRestaurants.mockImplementation(() => page([restaurant()]));
    api.getStaffDiscounts.mockImplementation(() =>
      reply({
        rates: [],
        restaurantId: 'rest-1',
        restaurantName: 'Cafe Max',
        staffDiscountApplicable: true,
      }),
    );
    const { user } = renderScreen(<RestaurantsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Staff discount for Cafe Max' }));

    expect(screen.getByRole('dialog', { name: 'Staff discount' })).toHaveTextContent('Cafe Max');
    expect(api.getStaffDiscounts).toHaveBeenCalledWith('rest-1');
  });
});
