import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { ApprovalsPageClient } from './approvals-page';
import { matchedShift, reasonedShift, shortShift } from './fixtures';
import type * as ApiModule from '@/lib/api';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/test/location'));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  approveShift: vi.fn<Client['approveShift']>(),
  listShiftReconciliations: vi.fn<Client['listShiftReconciliations']>(),
  sendBackShift: vi.fn<Client['sendBackShift']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const approved = {
  ...matchedShift,
  cashierName: 'Farhan',
  decidedAt: '2026-11-25T10:40:00.000Z',
  decidedByName: 'Neha',
  shiftId: 's4',
  status: 'APPROVED' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  at('/pos/approvals', 'date=2026-11-25');
  atLocation(ppg);
  signedIn(['SHIFT_APPROVE'], ['Supervisor']);
  api.listShiftReconciliations.mockImplementation(() =>
    reply({
      date: '2026-11-25',
      items: [
        matchedShift,
        reasonedShift,
        approved,
        { ...shortShift, cashierName: 'Meena', shiftId: 's3' },
      ],
    }),
  );
  api.approveShift.mockImplementation(() => reply({ ...reasonedShift, status: 'APPROVED' }));
  api.sendBackShift.mockImplementation(() => reply({ ...reasonedShift, status: 'SENT_BACK' }));
});

describe('Approvals', () => {
  it('lists every shift waiting for approval, matched or not, with the reasons given', async () => {
    renderScreen(<ApprovalsPageClient />);

    expect(await screen.findByText('Ravi Kumar')).toBeInTheDocument();
    expect(api.listShiftReconciliations).toHaveBeenCalledWith({
      date: '2026-11-25',
      hospitalId: ppg.id,
    });
    const ravi = screen.getByText('Ravi Kumar').closest('tr')!;
    expect(ravi).toHaveTextContent('Cash −₹230.00 · UPI −₹160.00');
    expect(ravi).toHaveTextContent('Wrong change given · Guest did not pay');
    // Takings: the shift's bills, the opening cash left out.
    expect(ravi).toHaveTextContent('₹10,200.00');
    expect(screen.getByText('Asha').closest('tr')).toHaveTextContent('None');
    // Approved and still-unexplained shifts are not in the queue.
    expect(screen.queryByText('Farhan')).not.toBeInTheDocument();
    expect(screen.queryByText('Meena')).not.toBeInTheDocument();
    expect(
      screen.getByText(/1 shift still needs the restaurant admin’s reasons/),
    ).toBeInTheDocument();
  });

  it('shows the approved shifts in their own view, with who approved them', async () => {
    const { user } = renderScreen(<ApprovalsPageClient />);
    await screen.findByText('Ravi Kumar');

    await user.click(screen.getByRole('button', { name: 'Approved' }));

    expect(screen.getByText('Farhan').closest('tr')).toHaveTextContent('Neha');
    expect(screen.queryByText('Ravi Kumar')).not.toBeInTheDocument();
    // One list for the day: switching views asks the server nothing.
    expect(api.listShiftReconciliations).toHaveBeenCalledTimes(1);
  });

  it('approves a shift after reading the reasons given', async () => {
    const { user } = renderScreen(<ApprovalsPageClient />);
    await user.click(await screen.findByRole('button', { name: 'Review Ravi Kumar’s shift' }));
    const panel = await screen.findByRole('dialog', { name: 'Ravi Kumar’s shift' });

    expect(within(panel).getByText('A ₹500 note taken as ₹200 at lunch')).toBeInTheDocument();
    expect(within(panel).getByText(/Given by Priya/)).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Approve shift' }));

    await waitFor(() => expect(api.approveShift).toHaveBeenCalledWith('s2', ''));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sends a shift back only with a comment saying what to fix', async () => {
    const { user } = renderScreen(<ApprovalsPageClient />);
    await user.click(await screen.findByRole('button', { name: 'Review Ravi Kumar’s shift' }));
    const panel = await screen.findByRole('dialog', { name: 'Ravi Kumar’s shift' });
    const sendBack = within(panel).getByRole('button', { name: 'Send back' });

    expect(sendBack).toBeDisabled();
    await user.type(within(panel).getByLabelText(/Your comment/), 'Recount the cash');
    await user.click(sendBack);

    await waitFor(() => expect(api.sendBackShift).toHaveBeenCalledWith('s2', 'Recount the cash'));
  });

  it('a matched shift is approved as it is: nothing to explain', async () => {
    const { user } = renderScreen(<ApprovalsPageClient />);
    await user.click(await screen.findByRole('button', { name: 'Review Asha’s shift' }));
    const panel = await screen.findByRole('dialog', { name: 'Asha’s shift' });

    expect(within(panel).getByText('Everything matches. No reasons needed.')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Approve shift' }));

    await waitFor(() => expect(api.approveShift).toHaveBeenCalledWith('s1', ''));
  });
});
