import { ApiClientError, type PosBill, type PosBillSummary } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayInIndia } from '@/lib/today-in-india';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { at } from '@/test/next-navigation';
import { ppg } from '@/test/location';
import { BillHistoryPageClient } from './bill-history-page';
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
  cancelPosBill: vi.fn<Client['cancelPosBill']>(),
  getPosBill: vi.fn<Client['getPosBill']>(),
  getPosDaySummary: vi.fn<Client['getPosDaySummary']>(),
  listPosBills: vi.fn<Client['listPosBills']>(),
  listPosCounters: vi.fn<Client['listPosCounters']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const summary = (patch: Partial<PosBillSummary> = {}) =>
  ({
    billNumber: 'PPG/2026/0042',
    complimentaryReason: null,
    counter: { counterCode: 'C1', counterName: 'Counter 1', id: 'counter-1' },
    customerMobile: '9876543210',
    customerName: 'Ravi',
    discountPercent: null,
    discountTotal: 0,
    grandTotal: 210,
    id: 'bill-1',
    isComplimentary: false,
    itemCount: 3,
    items: [
      { name: 'Veg Sandwich', quantity: 2 },
      { name: 'Masala Chai', quantity: 1 },
    ],
    orderNumber: '0042',
    paymentMode: 'UPI',
    paymentReference: 'UTR123',
    placedAt: '2026-11-19T05:00:00.000Z',
    restaurant: { id: 'r1', restaurantName: 'Cafe Max' },
    roomNumber: '412',
    status: 'COLLECTED',
    ...patch,
  }) as PosBillSummary;

const bill = (patch: Partial<PosBill> = {}) =>
  ({
    bedNumber: null,
    billNumber: 'PPG/2026/0042',
    cancelReason: null,
    cancelledAt: null,
    cashierCode: 'E7',
    cashierName: 'Asha',
    channel: 'COUNTER',
    complimentaryReason: null,
    counter: { counterCode: 'C1', counterName: 'Counter 1', id: 'counter-1' },
    customerMobile: null,
    customerName: null,
    discountPercent: null,
    discountTotal: 0,
    employeeCode: null,
    grandTotal: 210,
    gstTotal: 10,
    id: 'bill-1',
    instructions: null,
    isComplimentary: false,
    kotNumber: 'C1/261119/0042',
    lines: [
      {
        discountAmount: 0,
        gstAmount: 10,
        gstPercent: 5,
        id: 'l1',
        itemName: 'Veg Sandwich',
        lineTotal: 210,
        note: 'No onion',
        quantity: 2,
        taxableAmount: 200,
        unitPrice: 100,
      },
    ],
    orderNumber: '0042',
    paymentMode: 'CASH',
    paymentReference: null,
    placedAt: '2026-11-19T05:00:00.000Z',
    restaurant: { restaurantName: 'Cafe Max' },
    roomNumber: null,
    roundOff: 0,
    status: 'PLACED',
    subtotal: 200,
    ...patch,
  }) as PosBill;

const list = (items: PosBillSummary[], meta: Record<string, unknown> = {}) =>
  reply({ items, meta: { limit: 25, page: 1, total: items.length, totalPages: 1, ...meta } });

beforeEach(() => {
  vi.clearAllMocks();
  at('/pos/history');
  signedIn([]);
  api.listPosCounters.mockImplementation(() => reply([]));
  api.listPosBills.mockImplementation((query) =>
    query?.statusCounts
      ? list([], { complimentaryCount: 1, statusCounts: { CANCELLED: 2 }, total: 12 })
      : list([summary()]),
  );
  api.getPosBill.mockImplementation(() => reply(bill()));
});

describe('bill history', () => {
  it('lists today’s bills at the location with what a reviewer scans for', async () => {
    renderScreen(<BillHistoryPageClient />);

    const row = (await screen.findByRole('link', { name: 'PPG/2026/0042' })).closest('tr')!;
    expect(row).toHaveTextContent('0042 · Room 412 · Ravi · 9876543210');
    expect(row).toHaveTextContent('Cafe MaxCounter 1');
    expect(row).toHaveTextContent('3 items2 × Veg Sandwich, 1 × Masala Chai');
    expect(row).toHaveTextContent('₹210.00');
    expect(row).toHaveTextContent('UPIUTR123');
    const today = todayInIndia();
    expect(api.listPosBills).toHaveBeenCalledWith(
      expect.objectContaining({ from: today, hospitalId: ppg.id, page: 1, to: today }),
    );
  });

  it('names the table of a dine-in bill, and filters to table bills', async () => {
    api.listPosBills.mockImplementation((query) =>
      query?.statusCounts
        ? list([])
        : list([summary({ channel: 'TABLE', roomNumber: null, tableName: 'Window 2' })]),
    );
    const { user } = renderScreen(<BillHistoryPageClient />);

    const row = (await screen.findByRole('link', { name: 'PPG/2026/0042' })).closest('tr')!;
    expect(row).toHaveTextContent('0042 · Table Window 2 · Ravi');

    await user.click(screen.getByRole('button', { name: /Filters/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: /Channel/ }), 'Table');
    await waitFor(() =>
      expect(api.listPosBills).toHaveBeenLastCalledWith(
        expect.objectContaining({ channel: 'TABLE' }),
      ),
    );
  });

  it('counts all, cancelled and complimentary bills', async () => {
    renderScreen(<BillHistoryPageClient />);

    const stats = within(await screen.findByRole('group', { name: 'Bills at a glance' }));
    expect(await stats.findByRole('button', { name: /All bills/ })).toHaveTextContent('12');
    expect(stats.getByRole('button', { name: /Cancelled/ })).toHaveTextContent('2');
    expect(stats.getByText('Complimentary').parentElement).toHaveTextContent('1');
  });

  it('shows the discount under the total and strikes out a cancelled bill', async () => {
    api.listPosBills.mockImplementation(() =>
      list([
        summary({ discountPercent: 10, discountTotal: 20, grandTotal: 189, status: 'CANCELLED' }),
      ]),
    );
    renderScreen(<BillHistoryPageClient />);

    const total = await screen.findByText('₹189.00');
    expect(total).toHaveClass('line-through');
    expect(screen.getByText('−₹20.00 · 10%')).toBeInTheDocument();
  });

  it('shows the reason in place of payment on the complimentary page', async () => {
    api.listPosBills.mockImplementation(() =>
      list([
        summary({ complimentaryReason: 'Duty doctor', isComplimentary: true, paymentMode: null }),
      ]),
    );
    renderScreen(<BillHistoryPageClient complimentary />);

    expect(await screen.findByRole('heading', { name: 'Complimentary' })).toBeInTheDocument();
    expect(await screen.findByText('Duty doctor')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Reason' })).toBeInTheDocument();
    expect(api.listPosBills).toHaveBeenCalledWith(
      expect.objectContaining({ isComplimentary: true, paymentMode: undefined }),
    );
  });

  it('adds the day’s sales for one counter on one day', async () => {
    at('/pos/history', 'counter=counter-1&from=2026-11-18&to=2026-11-18');
    api.getPosDaySummary.mockImplementation(() =>
      reply({ complimentary: { amount: 0, count: 0 }, sales: 4321 } as never),
    );
    renderScreen(<BillHistoryPageClient />);

    expect(await screen.findByText('₹4,321.00')).toBeInTheDocument();
    expect(api.getPosDaySummary).toHaveBeenCalledWith('counter-1', '2026-11-18');
  });

  it('says when no bill matches', async () => {
    api.listPosBills.mockImplementation(() => list([]));
    renderScreen(<BillHistoryPageClient />);

    expect(await screen.findByText('No bills at Patparganj')).toBeInTheDocument();
  });

  it('shows why the bills could not be read', async () => {
    api.listPosBills.mockRejectedValue(new ApiClientError(500, 'Bills are unavailable.'));
    renderScreen(<BillHistoryPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Bills are unavailable.');
  });
});

describe('a bill’s panel', () => {
  it('shows the bill, its lines and totals', async () => {
    at('/pos/history', 'id=bill-1');
    renderScreen(<BillHistoryPageClient />);

    const panel = await screen.findByRole('dialog', { name: 'Bill PPG/2026/0042' });
    expect(api.getPosBill).toHaveBeenCalledWith('bill-1');
    expect(within(panel).getByText('Cashier').nextElementSibling).toHaveTextContent('Asha (E7)');
    expect(within(panel).getByText('Payment').nextElementSibling).toHaveTextContent('Cash');
    expect(within(panel).getByRole('cell', { name: /Veg Sandwich/ })).toHaveTextContent('No onion');
    expect(within(panel).getByText('Grand total').nextElementSibling).toHaveTextContent('₹210.00');
    expect(within(panel).getByRole('button', { name: 'Print bill' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Cancel bill' })).not.toBeInTheDocument();
  });

  it('cancels a bill with a reason, for someone allowed to', async () => {
    signedIn(['POS_ORDER_CANCEL']);
    at('/pos/history', 'id=bill-1');
    api.cancelPosBill.mockImplementation(() => reply(bill({ status: 'CANCELLED' })));
    const { user } = renderScreen(<BillHistoryPageClient />);

    const panel = await screen.findByRole('dialog', { name: 'Bill PPG/2026/0042' });
    await user.click(within(panel).getByRole('button', { name: 'Cancel bill' }));
    const submit = within(panel).getByRole('button', { name: 'Cancel bill' });
    expect(submit).toBeDisabled();
    await user.type(within(panel).getByLabelText(/Why is it cancelled\?/), ' Wrong item billed ');
    await user.click(submit);

    expect(api.cancelPosBill).toHaveBeenCalledWith('bill-1', 'Wrong item billed');
    expect(await screen.findByText('PPG/2026/0042 cancelled')).toBeInTheDocument();
  });

  it('shows why a bill could not be cancelled', async () => {
    signedIn(['POS_ORDER_CANCEL']);
    at('/pos/history', 'id=bill-1');
    api.cancelPosBill.mockRejectedValue(new ApiClientError(409, 'The day is closed.'));
    const { user } = renderScreen(<BillHistoryPageClient />);

    const panel = await screen.findByRole('dialog', { name: 'Bill PPG/2026/0042' });
    await user.click(within(panel).getByRole('button', { name: 'Cancel bill' }));
    await user.type(within(panel).getByLabelText(/Why is it cancelled\?/), 'Late');
    await user.click(within(panel).getByRole('button', { name: 'Cancel bill' }));

    expect(await screen.findByText('The day is closed.')).toBeInTheDocument();
  });

  it('offers no cancel on a bill already cancelled', async () => {
    signedIn(['POS_ORDER_CANCEL']);
    at('/pos/history', 'id=bill-1');
    api.getPosBill.mockImplementation(() =>
      reply(
        bill({
          cancelReason: 'Wrong item',
          cancelledAt: '2026-11-19T06:00:00.000Z',
          status: 'CANCELLED',
        }),
      ),
    );
    renderScreen(<BillHistoryPageClient />);

    const panel = await screen.findByRole('dialog', { name: 'Bill PPG/2026/0042' });
    // The status chip says Cancelled too; the fact under it gives the when and why.
    expect(within(panel).getByText(/· Wrong item$/)).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Cancel bill' })).not.toBeInTheDocument();
  });
});
