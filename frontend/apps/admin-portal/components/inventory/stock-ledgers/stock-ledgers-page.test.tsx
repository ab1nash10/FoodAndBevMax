import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { StockLedger } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { StockLedgersPageClient } from './stock-ledgers-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    listKitchens: vi.fn(),
    listRestaurants: vi.fn(),
    listStockLedgers: vi.fn(),
    listStores: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

const ledger = (patch: Partial<StockLedger>): StockLedger =>
  ({
    balanceAfter: 40,
    batchNumber: 'R-1',
    businessDate: '2026-11-18',
    id: 'ledger-1',
    item: { id: 'item-1', itemCode: 'RICE', itemName: 'Rice' },
    location: { code: 'MS', id: 'store-1', name: 'Main Store', type: 'STORE' },
    locationType: 'STORE',
    qtyIn: 40,
    qtyOut: 0,
    referenceDocument: { id: 'grn-1', number: 'GRN000002', type: 'GRN' },
    referenceType: 'GRN',
    transactionDateTime: '2026-11-18T09:00:00.000Z',
    transactionType: 'GRN_IN',
    ...patch,
  }) as StockLedger;

const receipt = ledger({});
const discard = ledger({
  balanceAfter: 37.5,
  batchNumber: null,
  id: 'ledger-2',
  qtyIn: 0,
  qtyOut: 2.5,
  referenceDocument: null,
  referenceType: null,
  transactionType: 'DISCARD_OUT',
});

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/stock-ledgers');
  atLocation(ppg);
  signedIn(['STOCK_VIEW', 'GRN_VIEW']);
  api.listStores.mockReturnValue(page([{ id: 'store-1', storeName: 'Main Store' }]) as never);
  api.listKitchens.mockReturnValue(page([]));
  api.listRestaurants.mockReturnValue(page([]));
  api.listStockLedgers.mockImplementation(((query: { referenceTypeCounts?: boolean }) =>
    query.referenceTypeCounts
      ? reply({
          items: [],
          meta: {
            limit: 0,
            page: 1,
            referenceTypeCounts: { GRN: 5, TRANSFER: 3 },
            total: 9,
            totalPages: 1,
          },
        })
      : page([receipt, discard])) as never);
});

const listRequests = () =>
  api.listStockLedgers.mock.calls
    .map(([query]) => query)
    .filter((query) => !query?.referenceTypeCounts);

describe('stock ledgers', () => {
  it('shows each movement with its quantities in, out and the balance after', async () => {
    renderScreen(<StockLedgersPageClient />);

    const inRow = (await screen.findByRole('link', { name: 'GRN000002' })).closest('tr')!;
    expect(within(inRow).getByText('GRN receipt')).toBeInTheDocument();
    expect(within(inRow).getAllByText('40.000')).toHaveLength(2);
    expect(within(inRow).getByText('0.000')).toBeInTheDocument();
    // The document opens where it lives.
    expect(within(inRow).getByRole('link', { name: 'GRN000002' })).toHaveAttribute(
      'href',
      '/inventory/grns?id=grn-1',
    );

    const outRow = screen.getByText('Discarded').closest('tr')!;
    expect(within(outRow).getByText('2.500')).toBeInTheDocument();
    expect(within(outRow).getByText('37.500')).toBeInTheDocument();
  });

  it('shows a document number without a link to someone who cannot open it', async () => {
    signedIn(['STOCK_VIEW']);
    renderScreen(<StockLedgersPageClient />);

    expect(await screen.findByText('GRN000002')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'GRN000002' })).toBeNull();
  });

  it('counts the movements by document in the strip, and shows one kind when picked', async () => {
    const { user } = renderScreen(<StockLedgersPageClient />);
    const strip = within(screen.getByRole('group', { name: 'Stock movements at a glance' }));

    expect(await strip.findByText('9')).toBeInTheDocument();
    expect(strip.getByText('5')).toBeInTheDocument();
    await user.click(strip.getByRole('button', { name: /Transfers dispatched/ }));

    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ referenceType: 'TRANSFER' }));
  });

  it('filters by transaction, a store and dates', async () => {
    const { user } = renderScreen(<StockLedgersPageClient />);
    await screen.findByText('Discarded');

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Transaction type' }),
      'SALE_OUT',
    );
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Location type' }), 'STORE');
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Store / kitchen / restaurant' }),
      await screen.findByRole('option', { name: 'Main Store' }),
    );
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-18' } });

    await waitFor(() =>
      expect(listRequests().at(-1)).toMatchObject({
        fromDate: '2026-11-01',
        hospitalId: ppg.id,
        locationId: 'store-1',
        locationType: 'STORE',
        toDate: '2026-11-18',
        transactionType: 'SALE_OUT',
      }),
    );
  });

  it('searches by what is typed', async () => {
    const { user } = renderScreen(<StockLedgersPageClient />);
    await screen.findByText('Discarded');

    await user.type(screen.getByRole('searchbox', { name: 'Search stock ledgers' }), 'rice');

    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ page: 1, search: 'rice' }));
  });

  it('says so when nothing has moved, and why a load failed', async () => {
    api.listStockLedgers.mockReturnValue(page([]));
    const { unmount } = renderScreen(<StockLedgersPageClient />);
    expect(await screen.findByText('No stock ledgers at Patparganj')).toBeInTheDocument();
    unmount();

    api.listStockLedgers.mockRejectedValue(new Error('Ledger is down'));
    renderScreen(<StockLedgersPageClient />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Ledger is down');
  });
});
