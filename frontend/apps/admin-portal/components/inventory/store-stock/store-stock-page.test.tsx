import { screen, waitFor, within } from '@testing-library/react';
import type { StoreStockSummary } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { StoreStockPageClient } from './store-stock-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    discardStock: vi.fn(),
    listStores: vi.fn(),
    listStoreStockSummaries: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

const paneer: StoreStockSummary = {
  batchCount: 2,
  batches: [
    {
      availableQty: 7.5,
      batchNumber: 'P-1',
      expiryDate: '2099-01-10',
      reservedQty: 0,
      status: 'AVAILABLE',
      stockBalanceId: 'sb-1',
    },
    {
      availableQty: 0,
      batchNumber: 'P-0',
      expiryDate: '2099-01-01',
      reservedQty: 0,
      status: 'OUT_OF_STOCK',
      stockBalanceId: 'sb-0',
    },
  ],
  categoryName: 'Dairy',
  hospitalId: ppg.id,
  itemCode: 'PNR',
  itemId: 'item-1',
  itemName: 'Paneer',
  itemType: 'READYMADE',
  lastUpdatedOn: '2026-11-18T09:00:00.000Z',
  nearestExpiryDate: '2099-01-10',
  status: 'AVAILABLE',
  storeCode: 'MS',
  storeId: 'store-1',
  storeName: 'Main Store',
  totalAvailableQty: 7.5,
  totalReservedQty: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/store-stock');
  atLocation(ppg);
  signedIn(['STOCK_VIEW']);
  api.listStores.mockReturnValue(page([]));
  api.listStoreStockSummaries.mockImplementation(((query: { limit?: number }) =>
    query.limit === 0
      ? reply({
          items: [],
          meta: {
            limit: 0,
            page: 1,
            statusCounts: { EXPIRED: 2, NEAR_EXPIRY: 4, OUT_OF_STOCK: 1 },
            total: 30,
            totalPages: 1,
          },
        })
      : page([paneer])) as never);
});

const listRequests = () =>
  api.listStoreStockSummaries.mock.calls
    .map(([query]) => query)
    .filter((query) => query?.limit !== 0);

describe('store stock', () => {
  it('shows each item’s store, category, available and reserved quantity and status', async () => {
    renderScreen(<StoreStockPageClient />);

    const row = (await screen.findByText('Paneer')).closest('tr')!;
    expect(within(row).getAllByText('Main Store')[0]).toBeInTheDocument();
    expect(within(row).getByText('Dairy')).toBeInTheDocument();
    // A part quantity shows to three places.
    expect(within(row).getByText('7.500')).toBeInTheDocument();
    expect(within(row).getByText('Readymade')).toBeInTheDocument();
    expect(within(row).getByText('Available')).toBeInTheDocument();
    expect(listRequests()[0]).toMatchObject({ hospitalId: ppg.id, locationType: 'STORE' });
  });

  it('shows the batches of an item when its row is expanded', async () => {
    const { user } = renderScreen(<StoreStockPageClient />);
    await screen.findByText('Paneer');

    await user.click(screen.getByRole('button', { name: 'Expand batches' }));

    expect(screen.getByText('Batch-wise stock')).toBeInTheDocument();
    expect(screen.getByText('P-1')).toBeInTheDocument();
    expect(screen.getByText('P-0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse batches' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('offers Discard on a batch with stock, only to someone who may discard', async () => {
    signedIn(['STOCK_VIEW', 'STOCK_DISCARD']);
    const { user } = renderScreen(<StoreStockPageClient />);
    await screen.findByText('Paneer');
    await user.click(screen.getByRole('button', { name: 'Expand batches' }));

    expect(screen.queryByRole('button', { name: 'Discard from Paneer batch P-0' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Discard from Paneer batch P-1' }));

    expect(screen.getByRole('dialog', { name: 'Discard stock' })).toHaveTextContent(
      'Paneer · Main Store · Batch P-1',
    );
  });

  it('has no Discard for someone who may only view stock', async () => {
    const { user } = renderScreen(<StoreStockPageClient />);
    await screen.findByText('Paneer');
    await user.click(screen.getByRole('button', { name: 'Expand batches' }));

    expect(screen.queryByRole('button', { name: /^Discard from/ })).toBeNull();
  });

  it('searches, filters by status and item type, and sorts', async () => {
    const { user } = renderScreen(<StoreStockPageClient />);
    await screen.findByText('Paneer');

    await user.type(screen.getByRole('searchbox', { name: 'Search store stock' }), 'pan');
    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ search: 'pan' }));

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'NEAR_EXPIRY');
    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ status: 'NEAR_EXPIRY' }));

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Item type' }), 'LIVE');
    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ itemType: 'LIVE' }));

    const sort = screen.getByRole('combobox', { name: 'Sort' });
    await user.selectOptions(sort, within(sort).getAllByRole('option', { name: /available/i })[0]!);
    await waitFor(() =>
      expect(listRequests().at(-1)).toMatchObject({
        itemType: 'LIVE',
        search: 'pan',
        sortBy: 'availableQty',
        status: 'NEAR_EXPIRY',
      }),
    );
  });

  it('says so when the store holds nothing', async () => {
    api.listStoreStockSummaries.mockReturnValue(page([]));
    renderScreen(<StoreStockPageClient />);

    expect(await screen.findByText('No store stock at Patparganj')).toBeInTheDocument();
  });

  it('shows why stock did not load', async () => {
    api.listStoreStockSummaries.mockRejectedValue(new Error('Stock service is down'));
    renderScreen(<StoreStockPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Stock service is down');
  });
});
