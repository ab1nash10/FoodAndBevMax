import { screen, waitFor, within } from '@testing-library/react';
import type { StoreStockLevel } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { MovementBars } from './movement-bars';
import { StockLevelsPageClient } from './stock-levels-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: { listStoreStockLevels: vi.fn(), listStoreStockMovements: vi.fn() },
}));

const api = mockedApi(organizationApi);

/** YYYY-MM-DD this many days from today. */
function inDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const level = (patch: Partial<StoreStockLevel>): StoreStockLevel => ({
  averageDailyIssue: 2,
  batches: [],
  coverDays: 20,
  hospitalId: ppg.id,
  issuedLast28Days: 56,
  itemCode: 'RICE',
  itemId: 'item-rice',
  itemName: 'Rice',
  level: 'OK',
  nextExpiryDate: inDays(90),
  onHand: 40,
  storeCode: 'MS',
  storeId: 'store-1',
  storeName: 'Main Store',
  ...patch,
});

const rice = level({
  batches: [
    { availableQty: 40, batchNumber: 'R-1', expiryDate: inDays(90), receivedOn: '2026-11-01' },
  ],
});
const oil = level({
  coverDays: 1.5,
  itemCode: 'OIL',
  itemId: 'item-oil',
  itemName: 'Oil',
  level: 'LOW',
  nextExpiryDate: inDays(3),
  onHand: 3,
});
const salt = level({
  coverDays: 0,
  itemCode: 'SALT',
  itemId: 'item-salt',
  itemName: 'Salt',
  level: 'OUT',
  nextExpiryDate: null,
  onHand: 0,
});
const sugar = level({
  itemCode: 'SUG',
  itemId: 'item-sugar',
  itemName: 'Sugar',
  storeId: 'store-2',
  storeName: 'Cold Store',
});

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/stock-levels');
  atLocation(ppg);
  signedIn(['STOCK_VIEW']);
  api.listStoreStockLevels.mockReturnValue(
    reply({ items: [rice, oil, salt, sugar], lowCoverDays: 3, windowDays: 28 }),
  );
  api.listStoreStockMovements.mockReturnValue(
    reply({
      days: [
        { date: inDays(-1), qtyIn: 10, qtyOut: 2 },
        { date: inDays(0), qtyIn: 0, qtyOut: 4.5 },
      ],
    }),
  );
});

const itemRows = () => within(screen.getByRole('list', { name: 'Store items' }));

describe('stock levels', () => {
  it('shows each store item with what is on hand, how long it lasts and when it expires', async () => {
    renderScreen(<StockLevelsPageClient />);

    const oilRow = await screen.findByRole('button', { name: /^Oil/ });
    expect(oilRow).toHaveTextContent('OIL · Main Store');
    expect(oilRow).toHaveTextContent('~2 days');
    expect(oilRow).toHaveTextContent('In 3 days');
    expect(itemRows().getByRole('button', { name: /^Salt/ })).toHaveTextContent('Out');
    expect(api.listStoreStockLevels).toHaveBeenCalledWith({ hospitalId: ppg.id });
  });

  it('counts and shows the items running low, expiring or out', async () => {
    const { user } = renderScreen(<StockLevelsPageClient />);
    const tabs = within(screen.getByRole('group', { name: 'Show' }));
    await screen.findByRole('list', { name: 'Store items' });

    expect(tabs.getByRole('button', { name: /Running low/ })).toHaveTextContent('1');
    await user.click(tabs.getByRole('button', { name: /Running low/ }));
    expect(itemRows().getAllByRole('button')).toHaveLength(1);
    expect(itemRows().getByRole('button', { name: /^Oil/ })).toBeInTheDocument();

    await user.click(tabs.getByRole('button', { name: /Out of stock/ }));
    expect(itemRows().getByRole('button', { name: /^Salt/ })).toBeInTheDocument();
    expect(itemRows().queryByRole('button', { name: /^Oil/ })).toBeNull();
  });

  it('finds items by name or code, and narrows to one store', async () => {
    const { user } = renderScreen(<StockLevelsPageClient />);
    await screen.findByRole('list', { name: 'Store items' });

    await user.type(screen.getByRole('searchbox', { name: 'Search items' }), 'sug');
    await waitFor(() => expect(itemRows().getAllByRole('button')).toHaveLength(1));
    await user.clear(screen.getByRole('searchbox', { name: 'Search items' }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Store' }), 'store-2');
    await waitFor(() => expect(itemRows().getAllByRole('button')).toHaveLength(1));
    expect(itemRows().getByRole('button', { name: /^Sugar/ })).toBeInTheDocument();
  });

  it('opens the first item’s batches and 14 days of movement beside the list', async () => {
    renderScreen(<StockLevelsPageClient />);
    const detail = within(await screen.findByRole('region', { name: 'Rice' }));

    expect(detail.getByText('In stock')).toBeInTheDocument();
    expect(detail.getByText('R-1')).toBeInTheDocument();
    expect(detail.getByText('56')).toBeInTheDocument();
    expect(
      await detail.findByRole('img', { name: 'Over 2 days: 10 in, 6.500 out' }),
    ).toBeInTheDocument();
    expect(api.listStoreStockMovements).toHaveBeenCalledWith({
      days: 14,
      itemId: 'item-rice',
      storeId: 'store-1',
    });
  });

  it('shows the item picked from the list', async () => {
    const { user } = renderScreen(<StockLevelsPageClient />);

    await user.click(await screen.findByRole('button', { name: /^Salt/ }));

    const detail = within(screen.getByRole('region', { name: 'Salt' }));
    expect(detail.getByText('Nothing on hand in this store.')).toBeInTheDocument();
    expect(detail.getByText('Out of stock')).toBeInTheDocument();
  });

  it('points low and out stock to the ERP GRNs, for someone who may view them', async () => {
    signedIn(['STOCK_VIEW', 'GRN_VIEW']);
    renderScreen(<StockLevelsPageClient />);

    expect(await screen.findByText('2 items running low or out.')).toBeInTheDocument();
    // Stock comes in from the ERP: no delivery is received here, item by item or otherwise.
    const links = screen.getAllByRole('link', { name: 'ERP GRNs' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/inventory/erp-grns');
    expect(screen.queryByRole('link', { name: /receive/i })).toBeNull();
  });

  it('offers no delivery or transfer to someone who may only view stock', async () => {
    renderScreen(<StockLevelsPageClient />);
    await screen.findByRole('list', { name: 'Store items' });

    expect(screen.queryByRole('link', { name: /ERP GRNs/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /send to restaurant/i })).toBeNull();
  });

  it('says when a store holds nothing, and why levels did not load', async () => {
    api.listStoreStockLevels.mockReturnValue(reply({ items: [], lowCoverDays: 3, windowDays: 28 }));
    const { unmount } = renderScreen(<StockLevelsPageClient />);
    expect(await screen.findByText('No store stock yet')).toBeInTheDocument();
    unmount();

    api.listStoreStockLevels.mockRejectedValue(new Error('Levels are down'));
    renderScreen(<StockLevelsPageClient />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Levels are down');
  });
});

describe('the movement bars', () => {
  it('says in words how much came in and went out', () => {
    renderScreen(
      <MovementBars
        days={[
          { date: '2026-11-17', qtyIn: 3, qtyOut: 0 },
          { date: '2026-11-18', qtyIn: 0.25, qtyOut: 1 },
        ]}
      />,
    );

    expect(screen.getByRole('img')).toHaveAccessibleName('Over 2 days: 3.250 in, 1 out');
  });
});
