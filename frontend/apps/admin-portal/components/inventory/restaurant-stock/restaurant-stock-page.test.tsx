import { screen, waitFor, within } from '@testing-library/react';
import type { LocationStockLevel, StockBalance } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { RestaurantStockPageClient } from './restaurant-stock-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    discardStock: vi.fn(),
    listRestaurants: vi.fn(),
    listRestaurantStock: vi.fn(),
    listRestaurantStockLevels: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

const stock = (patch: Partial<StockBalance>): StockBalance =>
  ({
    availableQty: 12,
    batchNumber: 'W-1',
    businessDate: null,
    expiryDate: '2099-03-01',
    id: 'sb-1',
    item: { id: 'item-1', itemCode: 'WTR', itemName: 'Water bottle', type: 'VEG' },
    itemId: 'item-1',
    itemType: 'MRP',
    location: { code: 'CAF', id: 'rest-1', name: 'Cafeteria', type: 'RESTAURANT' },
    locationId: 'rest-1',
    status: 'AVAILABLE',
    ...patch,
  }) as StockBalance;

const water = stock({});
const curry = stock({
  availableQty: 0,
  batchNumber: null,
  businessDate: '2026-11-18',
  id: 'sb-2',
  item: { id: 'item-2', itemCode: 'CUR', itemName: 'Dal curry' } as StockBalance['item'],
  itemId: 'item-2',
  itemType: 'READYMADE',
  status: 'OUT_OF_STOCK',
});

const lowWater = {
  averageDailyIssue: 10,
  hospitalId: ppg.id,
  itemId: 'item-1',
  level: 'LOW',
  locationId: 'rest-1',
  locationName: 'Cafeteria',
  onHand: 12,
} as LocationStockLevel;

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/restaurant-stock');
  atLocation(ppg);
  signedIn(['RESTAURANT_STOCK_VIEW']);
  api.listRestaurants.mockReturnValue(page([]));
  api.listRestaurantStockLevels.mockReturnValue(
    reply({ items: [], lowCoverDays: 3, windowDays: 28 }),
  );
  api.listRestaurantStock.mockImplementation(((query: { statusCounts?: boolean }) =>
    query.statusCounts
      ? reply({
          items: [],
          meta: { limit: 0, page: 1, statusCounts: { OUT_OF_STOCK: 1 }, total: 2, totalPages: 1 },
        })
      : page([water, curry])) as never);
});

const listRequests = () =>
  api.listRestaurantStock.mock.calls
    .map(([query]) => query)
    .filter((query) => !query?.statusCounts);

describe('restaurant stock', () => {
  it('shows each batch with its restaurant, source, quantity and status', async () => {
    renderScreen(<RestaurantStockPageClient />);

    const waterRow = (await screen.findByText('Water bottle')).closest('tr')!;
    expect(within(waterRow).getByText('Cafeteria')).toBeInTheDocument();
    expect(within(waterRow).getByText('Store')).toBeInTheDocument();
    expect(within(waterRow).getByText('12.000')).toBeInTheDocument();
    expect(within(waterRow).getByText('Available')).toBeInTheDocument();

    const curryRow = screen.getByText('Dal curry').closest('tr')!;
    expect(within(curryRow).getByText('Kitchen')).toBeInTheDocument();
    expect(within(curryRow).getAllByText('No batch')[0]).toBeInTheDocument();
    expect(within(curryRow).getByText('Out of stock')).toBeInTheDocument();
  });

  it('offers Return to store to restaurant staff who may send stock', async () => {
    const { unmount } = renderScreen(<RestaurantStockPageClient />);
    await screen.findByText('Water bottle');
    expect(screen.queryByRole('link', { name: /Return to store/ })).toBeNull();
    unmount();

    signedIn(['RESTAURANT_STOCK_VIEW', 'RESTAURANT_TRANSFER_SEND']);
    renderScreen(<RestaurantStockPageClient />);
    expect(await screen.findByRole('link', { name: /Return to store/ })).toHaveAttribute(
      'href',
      '/inventory/returns/new',
    );
  });

  it('asks for Store items when the source is the store', async () => {
    const { user } = renderScreen(<RestaurantStockPageClient />);
    await screen.findByText('Water bottle');

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Source' }), 'STORE');

    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ itemType: 'MRP' }));
  });

  it('searches and shows one status from the strip', async () => {
    const { user } = renderScreen(<RestaurantStockPageClient />);
    await screen.findByText('Water bottle');

    await user.type(screen.getByRole('searchbox', { name: 'Search restaurant stock' }), 'wat');
    await user.click(screen.getByRole('button', { name: /^Out of stock/ }));

    await waitFor(() =>
      expect(listRequests().at(-1)).toMatchObject({ search: 'wat', status: 'OUT_OF_STOCK' }),
    );
  });

  it('flags items running low with a link to send more from the store', async () => {
    signedIn(['RESTAURANT_STOCK_VIEW', 'TRANSFER_CREATE']);
    api.listRestaurantStockLevels.mockReturnValue(
      reply({ items: [lowWater], lowCoverDays: 3, windowDays: 28 }),
    );
    renderScreen(<RestaurantStockPageClient />);

    expect(await screen.findByText('1 item running low or out.')).toBeInTheDocument();
    const waterRow = screen.getByText('Water bottle').closest('tr')!;
    expect(within(waterRow).getByText('Running low')).toBeInTheDocument();
    // Three days of 10 a day, less the 12 on hand.
    expect(within(waterRow).getByRole('link', { name: 'Send from store' })).toHaveAttribute(
      'href',
      `/inventory/transfers/new?hospital=${ppg.id}&to=RESTAURANT%3Arest-1&items=item-1%3A18`,
    );
  });

  it('offers no transfer link to someone who may not create transfers', async () => {
    api.listRestaurantStockLevels.mockReturnValue(
      reply({ items: [lowWater], lowCoverDays: 3, windowDays: 28 }),
    );
    renderScreen(<RestaurantStockPageClient />);

    expect(await screen.findByText('Running low')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /send/i })).toBeNull();
  });

  it('offers Discard only on batches with stock, to someone who may discard', async () => {
    signedIn(['RESTAURANT_STOCK_VIEW', 'STOCK_DISCARD']);
    renderScreen(<RestaurantStockPageClient />);

    expect(
      await screen.findByRole('button', { name: 'Discard from Water bottle batch W-1' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Discard from Dal curry/ })).toBeNull();
  });

  it('says so when a restaurant holds nothing, and why a load failed', async () => {
    api.listRestaurantStock.mockReturnValue(page([]));
    const { unmount } = renderScreen(<RestaurantStockPageClient />);
    expect(await screen.findByText('No restaurant stock at Patparganj')).toBeInTheDocument();
    unmount();

    api.listRestaurantStock.mockRejectedValue(new Error('Restaurant stock is down'));
    renderScreen(<RestaurantStockPageClient />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Restaurant stock is down');
  });
});
