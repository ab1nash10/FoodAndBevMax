import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { StockBalance } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { KitchenStockPageClient } from './kitchen-stock-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: { discardStock: vi.fn(), listKitchens: vi.fn(), listKitchenStock: vi.fn() },
}));

const api = mockedApi(organizationApi);

const stock = (patch: Partial<StockBalance>): StockBalance =>
  ({
    availableQty: 12.5,
    batchNumber: null,
    businessDate: '2026-11-18',
    createdAt: '2026-11-18T05:00:00.000Z',
    expiryDate: null,
    id: 'ks-1',
    item: { id: 'i-1', itemCode: 'DAL', itemName: 'Dal', type: 'VEG' },
    location: { code: 'MK', id: 'k-1', name: 'Main Kitchen', type: 'KITCHEN' },
    reservedQty: 2,
    status: 'AVAILABLE',
    updatedAt: '2026-11-18T06:00:00.000Z',
    ...patch,
  }) as StockBalance;

const dal = stock({});
const rice = stock({
  availableQty: 0,
  id: 'ks-2',
  item: { id: 'i-2', itemCode: 'RICE', itemName: 'Rice' } as StockBalance['item'],
  reservedQty: 0,
  status: 'OUT_OF_STOCK',
});

beforeEach(() => {
  vi.clearAllMocks();
  at('/kitchen/stock');
  atLocation(ppg);
  signedIn(['KITCHEN_STOCK_VIEW']);
  api.listKitchens.mockReturnValue(page([{ id: 'k-1', kitchenName: 'Main Kitchen' }]) as never);
  api.listKitchenStock.mockImplementation(((query: { statusCounts?: boolean }) =>
    query.statusCounts
      ? reply({
          items: [],
          meta: {
            limit: 0,
            page: 1,
            statusCounts: { AVAILABLE: 3, LOW_STOCK: 2, OUT_OF_STOCK: 1 },
            total: 6,
            totalPages: 1,
          },
        })
      : page([dal, rice])) as never);
});

const listRequests = () =>
  api.listKitchenStock.mock.calls.map(([query]) => query).filter((query) => !query?.statusCounts);

describe('kitchen stock', () => {
  it('shows each ready-made line with its kitchen, quantities and status', async () => {
    renderScreen(<KitchenStockPageClient />);

    const dalRow = (await screen.findByText('Dal')).closest('tr')!;
    expect(within(dalRow).getAllByText('Main Kitchen')[0]).toBeInTheDocument();
    expect(within(dalRow).getByText('12.500')).toBeInTheDocument();
    expect(within(dalRow).getByText('2.000')).toBeInTheDocument();
    expect(within(dalRow).getByText('Available')).toBeInTheDocument();
    expect(
      within(screen.getByText('Rice').closest('tr')!).getByText('Out of stock'),
    ).toBeInTheDocument();
    expect(listRequests()[0]).toMatchObject({ hospitalId: ppg.id, itemType: 'READYMADE' });
  });

  it('counts the stock lines by status in the strip', async () => {
    renderScreen(<KitchenStockPageClient />);
    const strip = within(screen.getByRole('group', { name: 'Kitchen stock at a glance' }));

    expect(await strip.findByText('6')).toBeInTheDocument();
    expect(strip.getByRole('button', { name: /Low stock/ })).toHaveTextContent('2');
  });

  it('searches, and filters by status, kitchen and business date', async () => {
    const { user } = renderScreen(<KitchenStockPageClient />);
    await screen.findByText('Dal');

    await user.type(screen.getByRole('searchbox', { name: 'Search kitchen stock' }), 'dal');
    await user.click(screen.getByRole('button', { name: /^Low stock/ }));
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Kitchen' }),
      await screen.findByRole('option', { name: 'Main Kitchen' }),
    );
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    fireEvent.change(screen.getByLabelText('Business date'), { target: { value: '2026-11-17' } });

    await waitFor(() =>
      expect(listRequests().at(-1)).toMatchObject({
        businessDate: '2026-11-17',
        locationId: 'k-1',
        search: 'dal',
        status: 'LOW_STOCK',
      }),
    );
  });

  it('offers Discard only on lines with stock, to someone who may discard', async () => {
    const { unmount } = renderScreen(<KitchenStockPageClient />);
    await screen.findByText('Dal');
    expect(screen.queryByRole('button', { name: /^Discard from/ })).toBeNull();
    unmount();

    signedIn(['KITCHEN_STOCK_VIEW', 'STOCK_DISCARD']);
    const { user } = renderScreen(<KitchenStockPageClient />);
    await user.click(await screen.findByRole('button', { name: 'Discard from Dal' }));

    expect(screen.queryByRole('button', { name: 'Discard from Rice' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Discard stock' })).toHaveTextContent(
      'Dal · Main Kitchen',
    );
  });

  it('says so when the kitchen holds nothing, and why a load failed', async () => {
    api.listKitchenStock.mockReturnValue(page([]));
    const { unmount } = renderScreen(<KitchenStockPageClient />);
    expect(await screen.findByText('No kitchen stock at Patparganj')).toBeInTheDocument();
    unmount();

    api.listKitchenStock.mockRejectedValue(new Error('Kitchen stock is down'));
    renderScreen(<KitchenStockPageClient />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Kitchen stock is down');
  });
});
