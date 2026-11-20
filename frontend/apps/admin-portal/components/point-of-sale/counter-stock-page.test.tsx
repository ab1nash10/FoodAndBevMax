import { ApiClientError, type PosCounter } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { at } from '@/test/next-navigation';
import { CounterStockPageClient } from './counter-stock-page';
import type * as ApiModule from '@/lib/api';
import type * as LocationModule from '@/components/location-context';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
// The location stand-in, with the module's own helpers (the empty list names the location).
vi.mock('@/components/location-context', async (importOriginal) => ({
  ...(await importOriginal<typeof LocationModule>()),
  ...(await import('@/test/location')),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  getPosStockSummary: vi.fn<Client['getPosStockSummary']>(),
  listCounterStock: vi.fn<Client['listCounterStock']>(),
  listCounterStockLedgers: vi.fn<Client['listCounterStockLedgers']>(),
  listCounterStockLevels: vi.fn<Client['listCounterStockLevels']>(),
  listPosCounters: vi.fn<Client['listPosCounters']>(),
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

const stockItem = (itemId: string, itemName: string, patch = {}) => ({
  available: 0,
  consumed: 0,
  isTracked: true,
  itemCode: `${itemId.toUpperCase()}-CODE`,
  itemId,
  itemName,
  received: 0,
  ...patch,
});

const page = <T,>(items: T[]) =>
  reply({ items, meta: { limit: 25, page: 1, total: items.length, totalPages: 1 } });

beforeEach(() => {
  vi.clearAllMocks();
  at('/pos/stock', 'date=2026-11-18');
  signedIn([]);
  api.listPosCounters.mockImplementation(() => reply([counter]));
  api.listCounterStockLevels.mockImplementation(() =>
    reply({ items: [], lowCoverDays: 3, windowDays: 28 }),
  );
  api.getPosStockSummary.mockImplementation(() =>
    reply({
      counter,
      date: '2026-11-18',
      items: [
        stockItem('i1', 'Samosa', { available: 12.5, consumed: 7.5, received: 20 }),
        stockItem('i2', 'Paneer'),
        stockItem('i3', 'Masala Chai', { isTracked: false }),
      ],
    } as never),
  );
});

describe('counter stock', () => {
  it('sums up the day per item: added, consumed and available', async () => {
    renderScreen(<CounterStockPageClient />);

    const samosa = (await screen.findByText('Samosa')).closest('tr')!;
    expect(api.getPosStockSummary).toHaveBeenCalledWith('counter-1', '2026-11-18');
    expect(samosa).toHaveTextContent('I1-CODE207.50012.500');
    expect(screen.getByText('Paneer').closest('tr')).toHaveTextContent('000');
    // Made to order: nothing to count.
    expect(screen.getByText('Masala Chai').closest('tr')).toHaveTextContent('Not tracked');
  });

  it('counts the items in stock and out of stock', async () => {
    renderScreen(<CounterStockPageClient />);
    await screen.findByText('Samosa');

    const stats = screen.getByRole('group', { name: 'Counter stock at a glance' });
    expect(within(stats).getByText('Items').parentElement).toHaveTextContent('3');
    expect(within(stats).getByText('In stock').parentElement).toHaveTextContent('1');
    // An untracked item is not out of stock.
    expect(within(stats).getByText('Out of stock').parentElement).toHaveTextContent('1');
  });

  it('finds an item by name or code', async () => {
    const { user } = renderScreen(<CounterStockPageClient />);
    await screen.findByText('Samosa');

    await user.type(screen.getByRole('searchbox', { name: 'Search counter stock' }), 'i2-code');

    // The list follows once typing pauses.
    await waitFor(() => expect(screen.queryByText('Samosa')).not.toBeInTheDocument());
    expect(screen.getByText('Paneer')).toBeInTheDocument();
  });

  it('flags items running low, with a transfer from the store for those who may send one', async () => {
    signedIn(['TRANSFER_CREATE']);
    api.listCounterStockLevels.mockImplementation(() =>
      reply({
        items: [
          {
            averageDailyIssue: 10,
            hospitalId: 'h-ppg',
            itemId: 'i2',
            level: 'OUT',
            locationId: 'counter-1',
            onHand: 0,
          },
        ],
        lowCoverDays: 3,
        windowDays: 28,
      } as never),
    );
    renderScreen(<CounterStockPageClient />);

    expect(await screen.findByText('1 item running low or out.')).toBeInTheDocument();
    const paneer = screen.getByText('Paneer').closest('tr')!;
    expect(within(paneer).getByText('Out of stock')).toBeInTheDocument();
    expect(within(paneer).getByRole('link', { name: 'Send from store' })).toHaveAttribute(
      'href',
      expect.stringContaining('/inventory/transfers/new'),
    );
    expect(screen.getByRole('link', { name: 'Send all from store' })).toBeInTheDocument();
  });

  it('lists the batches at the counter on the Batches tab', async () => {
    at('/pos/stock', 'tab=stock');
    api.listCounterStock.mockImplementation(() =>
      page([
        {
          availableQty: 8,
          batchNumber: 'B-7',
          expiryDate: '2026-11-21',
          id: 'sb1',
          item: { itemCode: 'I1-CODE', itemName: 'Samosa', type: 'VEG' },
          location: { name: 'Counter 1' },
          status: 'AVAILABLE',
        },
      ] as never),
    );
    renderScreen(<CounterStockPageClient />);

    const row = (await screen.findByText('Samosa')).closest('tr')!;
    expect(row).toHaveTextContent('B-7');
    expect(row).toHaveTextContent('8.000');
    expect(api.listCounterStock).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: 'counter-1', page: 1 }),
    );
    expect(api.getPosStockSummary).not.toHaveBeenCalled();
  });

  it('lists every movement on the Movements tab, named as the counter sees them', async () => {
    at('/pos/stock', 'tab=movements');
    api.listCounterStockLedgers.mockImplementation(() =>
      page([
        {
          balanceAfter: 20,
          batchNumber: null,
          id: 'sl1',
          item: { itemCode: 'I1-CODE', itemName: 'Samosa' },
          qtyIn: 20,
          qtyOut: 0,
          transactionDateTime: '2026-11-19T04:00:00.000Z',
          transactionType: 'COUNTER_RECEIVE_IN',
        },
        {
          balanceAfter: 18,
          batchNumber: null,
          id: 'sl2',
          item: { itemCode: 'I1-CODE', itemName: 'Samosa' },
          qtyIn: 0,
          qtyOut: 2,
          transactionDateTime: '2026-11-19T05:00:00.000Z',
          transactionType: 'SALE_OUT',
        },
      ] as never),
    );
    renderScreen(<CounterStockPageClient />);

    const [received, sold] = (await screen.findAllByText('Samosa')).map((name) =>
      name.closest('tr')!,
    );
    expect(received).toHaveTextContent('Received20.000—20.000');
    expect(sold).toHaveTextContent('Sold—2.00018.000');
    expect(api.listCounterStockLedgers).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'transactionDateTime', sortOrder: 'desc' }),
    );
  });

  it('shows why the stock could not be read', async () => {
    api.getPosStockSummary.mockRejectedValue(new ApiClientError(500, 'Stock is unavailable.'));
    renderScreen(<CounterStockPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Stock is unavailable.');
  });
});
