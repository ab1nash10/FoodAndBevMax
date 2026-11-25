import { screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { matchedShift, reasonedShift, shortShift } from './fixtures';
import { ReconciliationPageClient } from './reconciliation-page';
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
  listShiftReconciliations: vi.fn<Client['listShiftReconciliations']>(),
  saveShiftReasons: vi.fn<Client['saveShiftReasons']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const shiftsAre = (...items: Array<typeof matchedShift>) =>
  api.listShiftReconciliations.mockImplementation(() => reply({ date: '2026-11-25', items }));

beforeEach(() => {
  vi.clearAllMocks();
  at('/pos/reconciliation', 'date=2026-11-25');
  atLocation(ppg);
  signedIn(['SHIFT_RECONCILE', 'ORDER_REPORT_VIEW', 'ORDER_AMEND']);
  shiftsAre(matchedShift, shortShift);
  api.saveShiftReasons.mockImplementation((_, reasons) => reply({ ...reasonedShift, reasons }));
});

const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

describe('Reconciliation', () => {
  it('lists the day’s closed shifts with each payment mode’s difference', async () => {
    renderScreen(<ReconciliationPageClient />);

    expect(await screen.findByText('Ravi Kumar')).toBeInTheDocument();
    expect(api.listShiftReconciliations).toHaveBeenCalledWith({
      date: '2026-11-25',
      hospitalId: ppg.id,
    });
    expect(rowOf('Ravi Kumar')).toHaveTextContent('−₹230.00');
    expect(rowOf('Ravi Kumar')).toHaveTextContent('−₹160.00');
    expect(rowOf('Ravi Kumar')).toHaveTextContent('Needs a reason');
    expect(rowOf('Asha')).toHaveTextContent('Waiting for approval');
  });

  it('opens a shift from its Open button only: clicking the row does nothing', async () => {
    const { user } = renderScreen(<ReconciliationPageClient />);

    await user.click(await screen.findByText('Ravi Kumar'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open Ravi Kumar’s shift' }));
    const panel = await screen.findByRole('dialog', { name: 'Ravi Kumar’s shift' });
    expect(within(panel).getByText('Cash short by ₹230.00')).toBeInTheDocument();
    expect(
      within(panel).getByText(/Counted ₹3,330.00 at shift end against ₹3,560.00 expected/),
    ).toBeInTheDocument();
    expect(within(panel).getByText('Bill 0042 · ₹160.00')).toBeInTheDocument();
    // A wrong payment mode is fixed where payment modes are changed.
    expect(within(panel).getByRole('link', { name: /Order amendments/ })).toHaveAttribute(
      'href',
      '/masters/orders?tab=amendments',
    );
  });

  it('sends the shift for approval once every difference has a reason, Other with a note', async () => {
    const { user } = renderScreen(<ReconciliationPageClient />);
    await user.click(await screen.findByRole('button', { name: 'Open Ravi Kumar’s shift' }));
    const panel = await screen.findByRole('dialog', { name: 'Ravi Kumar’s shift' });
    const send = within(panel).getByRole('button', { name: 'Send for approval' });
    const cash = within(panel).getByRole('group', { name: 'Cash short by ₹230.00' });
    const upi = within(panel).getByRole('group', {
      name: 'UPI: 1 bill with no payment confirmed',
    });

    expect(send).toBeDisabled();
    await user.selectOptions(within(cash).getByLabelText('Reason'), 'Wrong change given');
    expect(send).toBeDisabled();
    await user.selectOptions(within(upi).getByLabelText('Reason'), 'Other');
    expect(send).toBeDisabled();
    await user.type(within(upi).getByLabelText('Note'), 'Paid at the next counter');
    expect(send).toBeEnabled();

    await user.click(send);

    await waitFor(() =>
      expect(api.saveShiftReasons).toHaveBeenCalledWith('s2', {
        CASH: { note: undefined, reason: 'Wrong change given' },
        UPI: { note: 'Paid at the next counter', reason: 'Other' },
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows why a shift was sent back, with its reasons ready to change', async () => {
    shiftsAre({
      ...reasonedShift,
      comment: 'Recount the cash with a second person',
      decidedByName: 'Neha',
      status: 'SENT_BACK',
    });
    const { user } = renderScreen(<ReconciliationPageClient />);
    await user.click(await screen.findByRole('button', { name: 'Open Ravi Kumar’s shift' }));
    const panel = await screen.findByRole('dialog', { name: 'Ravi Kumar’s shift' });

    expect(within(panel).getByText(/Recount the cash with a second person/)).toBeInTheDocument();
    expect(within(panel).getByText(/Sent back by Neha/)).toBeInTheDocument();
    const cash = within(panel).getByRole('group', { name: 'Cash short by ₹230.00' });
    expect(within(cash).getByLabelText('Reason')).toHaveValue('Wrong change given');
    expect(within(panel).getByRole('button', { name: 'Send for approval' })).toBeEnabled();
  });

  it('shows an approved shift as it was approved, with nothing left to change', async () => {
    shiftsAre({
      ...reasonedShift,
      decidedAt: '2026-11-25T16:10:00.000Z',
      decidedByName: 'Neha',
      status: 'APPROVED',
    });
    const { user } = renderScreen(<ReconciliationPageClient />);
    await user.click(await screen.findByRole('button', { name: 'Open Ravi Kumar’s shift' }));
    const panel = await screen.findByRole('dialog', { name: 'Ravi Kumar’s shift' });

    expect(within(panel).getByText(/Approved by Neha/)).toBeInTheDocument();
    expect(within(panel).getByText('Wrong change given')).toBeInTheDocument();
    expect(within(panel).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Send for approval' })).toBeNull();
  });
});
