import { ApiClientError, type PosCounter, type PosDaySummary } from '@aahar/api-client';
import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { at } from '@/test/next-navigation';
import { DaySummaryPageClient } from './day-summary-page';
import type * as ApiModule from '@/lib/api';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/test/location'));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  getPosDaySummary: vi.fn<Client['getPosDaySummary']>(),
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

const summary = {
  bills: 9,
  byPaymentMode: [
    { amount: 1200, count: 6, mode: 'CASH' },
    { amount: 450.5, count: 3, mode: 'UPI' },
  ],
  cancelled: { amount: 80, count: 1 },
  complimentary: { amount: 150, count: 2 },
  counter,
  date: '2026-11-18',
  dayClose: null,
  sales: 1650.5,
  shifts: [],
} as unknown as PosDaySummary;

beforeEach(() => {
  vi.clearAllMocks();
  at('/pos/day', 'date=2026-11-18');
  signedIn([]);
  api.listPosCounters.mockImplementation(() => reply([counter]));
  api.getPosDaySummary.mockImplementation(() => reply(summary));
});

const rowOf = (name: string) => screen.getByRole('cell', { name }).closest('tr')!;

describe('the day summary', () => {
  it('splits the day’s sales by payment mode, every mode listed', async () => {
    renderScreen(<DaySummaryPageClient />);

    expect(await screen.findByRole('cell', { name: 'Cash' })).toBeInTheDocument();
    expect(api.getPosDaySummary).toHaveBeenCalledWith('counter-1', '2026-11-18');
    expect(rowOf('Cash')).toHaveTextContent('6₹1,200.00');
    expect(rowOf('UPI')).toHaveTextContent('3₹450.50');
    expect(rowOf('Card')).toHaveTextContent('0₹0.00');
    expect(rowOf('Sales')).toHaveTextContent('9₹1,650.50');
    const stats = screen.getByRole('group', { name: 'The day at a glance' });
    expect(stats).toHaveTextContent('₹1,650.50');
  });

  it('keeps complimentary and cancelled bills out of sales', async () => {
    renderScreen(<DaySummaryPageClient />);

    await screen.findByRole('cell', { name: 'Cash' });
    expect(rowOf('Complimentary')).toHaveTextContent('2₹150.00');
    expect(rowOf('Cancelled')).toHaveTextContent('1₹80.00');
  });

  it('links to that day’s bills at the counter', async () => {
    renderScreen(<DaySummaryPageClient />);

    expect(await screen.findByRole('link', { name: 'View bills' })).toHaveAttribute(
      'href',
      '/pos/history?counter=counter-1&from=2026-11-18&to=2026-11-18',
    );
    expect(screen.getByRole('button', { name: 'Print summary' })).toBeEnabled();
  });

  it('prints the summary on the till’s printer', async () => {
    const { user } = renderScreen(<DaySummaryPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Print summary' }));
    // The slip is written into a hidden frame and printed from there.
    const slip = document.querySelector('iframe')!.contentDocument!.body;
    expect(slip).toHaveTextContent('Cafe Max');
    expect(slip).toHaveTextContent('Day summary · 2026-11-18');
    expect(slip).toHaveTextContent('Sales9₹1,650.50');
  });

  it('shows the day’s shifts under the takings', async () => {
    renderScreen(<DaySummaryPageClient />);

    expect(
      await screen.findByText('No shift was opened at this counter on this day.'),
    ).toBeInTheDocument();
  });

  it('shows why the summary could not be read', async () => {
    api.getPosDaySummary.mockRejectedValue(new ApiClientError(403, 'Not your counter.'));
    renderScreen(<DaySummaryPageClient />);

    expect(await screen.findByText('Not your counter.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('says when there is no counter to show', async () => {
    api.listPosCounters.mockImplementation(() => reply([]));
    renderScreen(<DaySummaryPageClient />);

    expect(await screen.findByText('No counter to bill at')).toBeInTheDocument();
    expect(api.getPosDaySummary).not.toHaveBeenCalled();
  });
});
