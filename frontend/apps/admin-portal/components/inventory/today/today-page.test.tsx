import { screen, within } from '@testing-library/react';
import type { Grn, StockBalance, StoreStockLevel, Transfer } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { TodayPageClient } from './today-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    listGrns: vi.fn(),
    listRestaurantStock: vi.fn(),
    listStoreStockLevels: vi.fn(),
    listStoreStockMovements: vi.fn(),
    listTransfers: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

function inDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('en-CA');
}

const level = (patch: Partial<StoreStockLevel>) =>
  ({
    batches: [],
    coverDays: 20,
    itemCode: 'RICE',
    itemId: 'item-rice',
    itemName: 'Rice',
    level: 'OK',
    onHand: 40,
    storeId: 'store-1',
    storeName: 'Main Store',
    ...patch,
  }) as StoreStockLevel;

const levels = [
  level({
    batches: [
      { availableQty: 6, batchNumber: 'M-1', expiryDate: inDays(1), receivedOn: inDays(-5) },
    ],
    itemCode: 'MILK',
    itemId: 'item-milk',
    itemName: 'Milk',
  }),
  level({
    coverDays: 1.4,
    itemCode: 'OIL',
    itemId: 'item-oil',
    itemName: 'Oil',
    level: 'LOW',
    onHand: 3,
  }),
  level({ itemCode: 'SALT', itemId: 'item-salt', itemName: 'Salt', level: 'OUT', onHand: 0 }),
];

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/today');
  atLocation(ppg);
  signedIn(['STOCK_VIEW', 'RESTAURANT_STOCK_VIEW', 'GRN_VIEW', 'TRANSFER_VIEW']);
  api.listStoreStockLevels.mockReturnValue(
    reply({ items: levels, lowCoverDays: 3, windowDays: 28 }),
  );
  api.listStoreStockMovements.mockReturnValue(
    reply({
      days: [
        { date: inDays(-1), qtyIn: 20, qtyOut: 5 },
        { date: inDays(0), qtyIn: 2.5, qtyOut: 1 },
      ],
    }),
  );
  api.listRestaurantStock.mockReturnValue(
    page([
      {
        id: 'sb-1',
        item: { itemName: 'Water bottle' },
        location: { name: 'Cafeteria' },
      } as StockBalance,
    ]),
  );
  api.listGrns.mockReturnValue(
    page([
      {
        grnNumber: 'GRN-007',
        id: 'grn-7',
        receivedDate: `${inDays(0)}T04:30:00.000Z`,
        status: 'DRAFT',
        store: { storeName: 'Main Store' },
        vendorName: 'Fresh Farms',
      } as Grn,
    ]),
  );
  api.listTransfers.mockReturnValue(
    page([
      {
        id: 'tr-3',
        lines: [{}, {}],
        status: 'PENDING_ACKNOWLEDGEMENT',
        transferDate: `${inDays(0)}T05:30:00.000Z`,
        transferNumber: 'TR-003',
      } as unknown as Transfer,
    ]),
  );
});

describe('the store’s day', () => {
  it('sums up what needs the store keeper today', async () => {
    renderScreen(<TodayPageClient />);

    expect(
      await screen.findByText(
        'Needs you today: 2 items running low or out, 1 batch close to expiry, 1 restaurant shelf empty.',
      ),
    ).toBeInTheDocument();
    expect(api.listStoreStockLevels).toHaveBeenCalledWith({ hospitalId: ppg.id });
  });

  it('lists the items running low with what is left, and the batches about to expire', async () => {
    renderScreen(<TodayPageClient />);

    const low = within(await screen.findByRole('region', { name: 'Running low' }));
    expect(await low.findByRole('link', { name: 'Oil' })).toHaveAttribute(
      'href',
      '/inventory/stock-levels?item=store-1:item-oil',
    );
    expect(low.getByText('3 · ~1 day')).toBeInTheDocument();
    expect(low.getByText('Out of stock')).toBeInTheDocument();

    const expiring = within(screen.getByRole('region', { name: 'Expiring soon' }));
    expect(expiring.getByText('Milk')).toBeInTheDocument();
    expect(expiring.getByText('Tomorrow')).toBeInTheDocument();
    expect(expiring.getByText('1 this week')).toBeInTheDocument();
  });

  it('shows restaurants that have run out, to someone who may see restaurant stock', async () => {
    renderScreen(<TodayPageClient />);

    const shelves = within(await screen.findByRole('region', { name: 'Restaurants need stock' }));
    expect(await shelves.findByText('Water bottle')).toBeInTheDocument();
    expect(shelves.getByText('Run out at Cafeteria')).toBeInTheDocument();
    expect(api.listRestaurantStock).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalId: ppg.id, status: 'OUT_OF_STOCK' }),
    );
  });

  it('leaves out what the user may not see', async () => {
    signedIn(['STOCK_VIEW']);
    renderScreen(<TodayPageClient />);

    await screen.findByRole('region', { name: 'Running low' });
    expect(screen.queryByRole('region', { name: 'Restaurants need stock' })).toBeNull();
    expect(api.listRestaurantStock).not.toHaveBeenCalled();
    expect(api.listGrns).not.toHaveBeenCalled();
    expect(api.listTransfers).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /receive/i })).toBeNull();
    expect(await screen.findByText('No GRN or transfer yet today.')).toBeInTheDocument();
  });

  it('lists today’s GRNs and transfers, newest first, and the fortnight’s movement', async () => {
    renderScreen(<TodayPageClient />);

    const today = within(screen.getByRole('region', { name: 'Today' }));
    const links = await today.findAllByRole('link', { name: /GRN-007|TR-003/ });
    expect(links.map((link) => link.textContent)).toEqual(['TR-003', 'GRN-007']);
    expect(today.getByText(/from Fresh Farms/)).toBeInTheDocument();
    expect(today.getByText(/· 2 lines/)).toBeInTheDocument();

    const moves = within(screen.getByRole('region', { name: 'Stock in and out' }));
    expect(await moves.findByText('22.500')).toBeInTheDocument();
    expect(moves.getByText('6')).toBeInTheDocument();
  });

  it('says when nothing needs doing', async () => {
    api.listStoreStockLevels.mockReturnValue(
      reply({ items: [level({})], lowCoverDays: 3, windowDays: 28 }),
    );
    api.listRestaurantStock.mockReturnValue(page([]));
    renderScreen(<TodayPageClient />);

    expect(
      await screen.findByText(
        'Nothing needs you right now: stock is healthy and nothing expires this week.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Every store item has more than 3 days of stock.')).toBeInTheDocument();
    expect(screen.getByText('No batch expires in the next 7 days.')).toBeInTheDocument();
  });

  it('shows why stock levels did not load', async () => {
    api.listStoreStockLevels.mockRejectedValue(new Error('Levels are down'));
    renderScreen(<TodayPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Levels are down');
  });
});
