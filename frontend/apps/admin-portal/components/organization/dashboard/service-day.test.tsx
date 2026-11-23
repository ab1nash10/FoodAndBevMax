import type { DashboardServiceDay } from '@aahar/api-client';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CsvModule from '@/lib/csv';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { ServiceDay } from './service-day';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', async (importOriginal) => ({
  ...(await importOriginal<typeof LocationModule>()),
  ...(await import('@/test/location')),
}));
vi.mock('@/lib/csv', async (importOriginal) => ({
  ...(await importOriginal<typeof CsvModule>()),
  downloadCsv: vi.fn(),
}));
type Client = typeof ApiModule.organizationApi;
const api = vi.hoisted(() => ({
  getDashboardNavCounts: vi.fn<Client['getDashboardNavCounts']>(),
  getDashboardService: vi.fn<Client['getDashboardService']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

// Two busy hours: 9 am and 1 pm.
const hours = Array.from({ length: 24 }, (_, hour) => ({
  bills: hour === 13 ? 80 : hour === 9 ? 30 : 0,
  compareBills: hour === 13 ? 60 : hour === 9 ? 40 : 0,
  compareSales: hour === 13 ? 16000 : hour === 9 ? 12000 : 0,
  hour,
  sales: hour === 13 ? 24000 : hour === 9 ? 8000 : 0,
}));
const day: DashboardServiceDay = {
  date: '2026-11-22',
  kitchen: {
    lanes: [
      {
        count: 6,
        orders: [
          {
            at: '2026-11-22T07:00:00Z',
            id: 'o-1',
            items: 'Masala Dosa ×3',
            number: 'A214',
            where: 'Counter 1',
          },
        ],
        status: 'PLACED',
      },
      { count: 9, orders: [], status: 'PREPARING' },
      { count: 4, orders: [], status: 'READY' },
      { count: 31, orders: [], status: 'COLLECTED' },
    ],
  },
  sales: {
    byHour: hours,
    channels: [
      { bills: 248, key: 'COUNTER', sales: 71920 },
      { bills: 64, key: 'ROOM', sales: 22400 },
      { bills: 0, key: 'QR', sales: 0 },
      { bills: 0, key: 'KIOSK', sales: 0 },
      { bills: 0, key: 'TABLE', sales: 0 },
    ],
    compare: { averageBill: 280, bills: 100, roomOrders: 64, sales: 28000 },
    compareDate: '2026-11-15',
    counters: [
      {
        bills: 112,
        cashier: 'Ritu S.',
        counterId: 'c-1',
        counterName: 'Counter 1',
        open: true,
        openedAt: '2026-11-22T02:28:00Z',
        restaurantName: 'Cafe Max',
        sales: 31640,
      },
      {
        bills: 3,
        cashier: null,
        counterId: 'c-4',
        counterName: 'Counter 4',
        open: false,
        openedAt: null,
        restaurantName: 'Cafe Max',
        sales: 900,
      },
    ],
    today: { averageBill: 291, bills: 110, roomOrders: 64, sales: 32000 },
    truncated: false,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  at('/dashboard');
  atLocation(ppg);
  signedIn(['ORDER_REPORT_VIEW', 'ORDER_VIEW', 'TRANSFER_VIEW', 'GRN_VIEW']);
  api.getDashboardService.mockImplementation((query) =>
    reply(
      query?.compare === 'day'
        ? { ...day, sales: { ...day.sales!, compareDate: '2026-11-21' } }
        : day,
    ),
  );
  api.getDashboardNavCounts.mockImplementation(() => reply({ grns: 1, transfers: 2 }));
});

describe("the day's service", () => {
  it('sets each number beside the same day last week, in one row of tiles', async () => {
    renderScreen(<ServiceDay />);

    const numbers = within(await screen.findByRole('group', { name: 'Today in numbers' }));
    const sales = await numbers.findByRole('button', { name: /^Sales/ });
    expect(sales).toHaveTextContent('₹32,000');
    expect(sales).toHaveTextContent('▲ 14%');
    expect(numbers.getByRole('button', { name: /^Bills/ })).toHaveTextContent('▲ 10%');
    expect(numbers.getByRole('button', { name: /^Average bill/ })).toHaveTextContent('▲ 4%');
    expect(numbers.getByText('Room orders').closest('div')).toHaveTextContent('Same');
    expect(
      await numbers.findByRole('link', { name: /Waiting to acknowledge\s*2/ }),
    ).toHaveAttribute('href', '/inventory/transfers?view=PENDING_ACKNOWLEDGEMENT');
    expect(screen.getByText('compared with last Sunday')).toBeInTheDocument();
    expect(api.getDashboardService).toHaveBeenCalledWith({ compare: 'week', hospitalId: 'h-ppg' });
  });

  it('compares with yesterday instead, on request', async () => {
    const { user } = renderScreen(<ServiceDay />);
    await screen.findByRole('button', { name: /^Sales/ });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Compare with' }), 'day');

    await waitFor(() =>
      expect(api.getDashboardService).toHaveBeenLastCalledWith({
        compare: 'day',
        hospitalId: 'h-ppg',
      }),
    );
    expect(new URLSearchParams(window.location.search).get('compare')).toBe('day');
    expect(await screen.findByText('compared with yesterday')).toBeInTheDocument();
  });

  it('opens another day, its title saying which', async () => {
    renderScreen(<ServiceDay />);
    await screen.findByRole('button', { name: /^Sales/ });

    // A date input takes a whole date at once, as the browser's picker gives it.
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-11-15' } });

    await waitFor(() =>
      expect(api.getDashboardService).toHaveBeenLastCalledWith({
        compare: 'week',
        date: '2026-11-15',
        hospitalId: 'h-ppg',
      }),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sun 15 Nov');
  });

  it('charts the number picked by hour, or as a running total', async () => {
    const { user } = renderScreen(<ServiceDay />);

    const chart = within(await screen.findByRole('region', { name: 'Sales by hour' }));
    expect(chart.getByText('₹24k')).toBeInTheDocument();
    expect(chart.getByText('Busiest 1 pm · ₹24,000, ▲ 50% vs last Sun')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Bills/ }));
    expect(screen.getByRole('button', { name: /^Bills/ })).toHaveAttribute('aria-pressed', 'true');
    const bills = within(screen.getByRole('region', { name: 'Bills by hour' }));
    await user.click(bills.getByRole('button', { name: 'Running total' }));
    expect(bills.getByText('10 bills ahead of last Sun')).toBeInTheDocument();
  });

  it('splits the day by channel and lists the counters right now', async () => {
    renderScreen(<ServiceDay />);

    const mix = within(await screen.findByRole('region', { name: 'Channel mix' }));
    expect(mix.getByText('312 bills')).toBeInTheDocument();
    expect(mix.getByRole('row', { name: /Counter 248 ₹71,920/ })).toBeInTheDocument();
    expect(mix.getByRole('row', { name: /Room delivery 64 ₹22,400/ })).toBeInTheDocument();
    expect(mix.queryByRole('row', { name: /Kiosk/ })).not.toBeInTheDocument();

    const counters = within(screen.getByRole('region', { name: 'Counters right now' }));
    const [, first, second] = counters.getAllByRole('row');
    expect(first).toHaveTextContent('Counter 1');
    expect(first).toHaveTextContent('Ritu S.');
    expect(first).toHaveTextContent('₹31,640');
    expect(first).toHaveTextContent('Open');
    expect(second).toHaveTextContent('Closed');
  });

  it('exports the day by hour', async () => {
    const { user } = renderScreen(<ServiceDay />);
    await screen.findByRole('button', { name: /^Sales/ });

    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(downloadCsv).toHaveBeenCalledWith(
      'sales-2026-11-22.csv',
      expect.arrayContaining([
        ['Hour', 'Bills', 'Sales', 'Bills on 2026-11-15', 'Sales on 2026-11-15'],
        ['1 pm', 80, 24000, 60, 16000],
      ]),
    );
  });

  it('shows what needs action and the kitchen queue', async () => {
    renderScreen(<ServiceDay />);

    const waiting = within(await screen.findByRole('region', { name: 'Needs action' }));
    expect(
      await waiting.findByRole('link', { name: /2 transfers to acknowledge/ }),
    ).toBeInTheDocument();
    const kitchen = within(screen.getByRole('region', { name: 'Kitchen queue' }));
    expect(kitchen.getByRole('group', { name: 'Queued 6' })).toHaveTextContent('Masala Dosa ×3');
    expect(kitchen.getByRole('group', { name: 'Collected 31' })).toBeInTheDocument();
  });

  it('leaves out sales and the kitchen for a role that may see neither', async () => {
    signedIn(['TRANSFER_VIEW']);
    renderScreen(<ServiceDay />);

    expect(await screen.findByRole('region', { name: 'Needs action' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Sales/ })).not.toBeInTheDocument();
    expect(api.getDashboardService).not.toHaveBeenCalled();
  });
});
