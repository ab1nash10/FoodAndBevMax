import { screen, waitFor, within } from '@testing-library/react';
import type { GrnEntry, GrnEntryQuery, GrnEntryRow } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { grnEntriesApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { ErpGrnsPageClient } from './erp-grns-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  grnEntriesApi: {
    closeGrnEntry: vi.fn(),
    listGrnEntries: vi.fn(),
    runGrnEntry: vi.fn(),
    setGrnEntryRerun: vi.fn(),
  },
}));

const api = mockedApi(grnEntriesApi);

const row = (patch: Partial<GrnEntryRow>): GrnEntryRow => ({
  'Discount/Extra Charges': null,
  'HSN No': '1006',
  MRP: 60,
  'Tax Rate': '5%',
  'Total Value': 500,
  UOM: 'KG',
  'Unit Rate': 50,
  accepted_qty: 10,
  batch: 'B-1',
  date: '2026-11-18T09:00:00.000Z',
  expiry_date: '2099-06-30',
  flag: 0,
  grn_No: 'ERP-2',
  issued_by: 'Store HQ',
  item_name: 'Rice',
  location: 'PPG',
  part_item_code: 'RICE',
  pending_qty: 0,
  purchase_order: 'PO-5',
  rejected_qty: 0,
  rejection_reason: null,
  requisition: null,
  row_id: 'row-1',
  supplier: 'V-100',
  transaction_number: 'TX-2',
  transaction_qty: 10,
  ...patch,
});

/** Goods in: in the store the moment the ERP sent them. */
const done: GrnEntry = {
  grn_No: 'ERP-2',
  hospital_id: ppg.id,
  location: 'PPG',
  location_name: 'Patparganj',
  received_at: '2026-11-18T09:00:00.000Z',
  rerun_active: true,
  rows: [row({})],
  status: 'VERIFIED',
  store_code: 'MS',
  store_id: 'store-1',
  store_name: 'Main Store',
  totals: { accepted_qty: 10, pending_qty: 0, rejected_qty: 0, transaction_qty: 10 },
  transaction_number: 'TX-2',
  verified_at: '2026-11-18T09:00:00.000Z',
  verified_by: null,
};

/** A reverse: 4 taken from the store, 6 still out in the restaurants. */
const waiting: GrnEntry = {
  ...done,
  grn_No: 'ERP-1',
  rows: [row({ accepted_qty: 4, flag: 1, grn_No: 'ERP-1', pending_qty: 6, row_id: 'row-2' })],
  status: 'PENDING',
  totals: { accepted_qty: 4, pending_qty: 6, rejected_qty: 0, transaction_qty: 10 },
  transaction_number: 'TX-1',
  verified_at: null,
};

const closed: GrnEntry = {
  ...waiting,
  grn_No: 'ERP-3',
  rows: [
    row({
      accepted_qty: 3,
      flag: 1,
      grn_No: 'ERP-3',
      rejected_qty: 2,
      rejection_reason: 'Sold at the café',
      row_id: 'row-3',
      transaction_qty: 5,
    }),
  ],
  status: 'CLOSED',
  totals: { accepted_qty: 3, pending_qty: 0, rejected_qty: 2, transaction_qty: 5 },
  verified_at: '2026-11-19T10:00:00.000Z',
  verified_by: { employeeCode: 'E1', name: 'Asha' },
};

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/erp-grns');
  atLocation(ppg);
  signedIn(['GRN_VIEW', 'GRN_POST']);
  api.listGrnEntries.mockReturnValue(page([waiting, done, closed]));
  api.runGrnEntry.mockReturnValue(reply(waiting));
  api.setGrnEntryRerun.mockReturnValue(reply({ ...waiting, rerun_active: false }));
  api.closeGrnEntry.mockReturnValue(reply(closed));
});

const open = async (grnNumber: string) => {
  const screenUser = renderScreen(<ErpGrnsPageClient />);
  await screenUser.user.click(await screen.findByRole('button', { name: grnNumber }));
  return { panel: within(screen.getByRole('dialog', { name: `GRN ${grnNumber}` })), ...screenUser };
};

describe('ERP GRNs', () => {
  it('under Logs it is the ERP GRN log', async () => {
    at('/logs/erp-grns');
    renderScreen(<ErpGrnsPageClient log />);

    expect(await screen.findByRole('heading', { name: 'ERP GRN log' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'ERP-1' })).toBeInTheDocument();
  });

  it('lists each GRN with its type, store, supplier, quantity and status', async () => {
    renderScreen(<ErpGrnsPageClient />);

    const reverse = (await screen.findByRole('button', { name: 'ERP-1' })).closest('tr')!;
    expect(within(reverse).getByText('1 batch · GRN reverse')).toBeInTheDocument();
    expect(within(reverse).getByText('Main Store')).toBeInTheDocument();
    expect(within(reverse).getByText('V-100')).toBeInTheDocument();
    expect(within(reverse).getByText('6 waiting')).toBeInTheDocument();
    expect(within(reverse).getByText('Pending')).toBeInTheDocument();

    const goodsIn = screen.getByRole('button', { name: 'ERP-2' }).closest('tr')!;
    expect(within(goodsIn).getByText('1 batch · GRN')).toBeInTheDocument();
    expect(within(goodsIn).getByText('Success')).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: 'ERP-3' }).closest('tr')!).getByText('Closed'),
    ).toBeInTheDocument();
    expect(api.listGrnEntries).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalId: ppg.id, page: 1 }),
    );
  });

  it('opens a GRN a link names, even when it is on another page of the list', async () => {
    const older: GrnEntry = { ...waiting, grn_No: 'ERP-0' };
    api.listGrnEntries.mockImplementation(((query: GrnEntryQuery) =>
      page(query.search === 'ERP-0' ? [older] : [waiting, done, closed])) as never);
    at('/inventory/erp-grns', 'grn=ERP-0');
    renderScreen(<ErpGrnsPageClient />);

    expect(await screen.findByRole('dialog', { name: 'GRN ERP-0' })).toBeInTheDocument();
    expect(api.listGrnEntries).toHaveBeenCalledWith({ hospitalId: ppg.id, search: 'ERP-0' });
  });

  it('says so when the ERP has sent nothing', async () => {
    api.listGrnEntries.mockReturnValue(page([]));
    renderScreen(<ErpGrnsPageClient />);

    expect(await screen.findByText('No GRNs from the ERP')).toBeInTheDocument();
  });

  it('shows why the list did not load', async () => {
    api.listGrnEntries.mockRejectedValue(new Error('ERP link is down'));
    renderScreen(<ErpGrnsPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('ERP link is down');
  });

  it('searches by GRN number and filters by status', async () => {
    const { user } = renderScreen(<ErpGrnsPageClient />);
    await screen.findByRole('button', { name: 'ERP-1' });

    await user.type(screen.getByRole('searchbox', { name: 'Search ERP GRNs' }), 'ERP-9');
    await waitFor(() =>
      expect(api.listGrnEntries).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'ERP-9' }),
      ),
    );

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'PENDING');
    await waitFor(() =>
      expect(api.listGrnEntries).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'ERP-9', status: 'PENDING' }),
      ),
    );
  });

  it('shows goods in as added to the store, with nothing for the store to do', async () => {
    const { panel } = await open('ERP-2');

    expect(panel.getByText(/Added to the store/)).toBeInTheDocument();
    expect(panel.queryByRole('button', { name: 'Run now' })).toBeNull();
    expect(panel.queryByRole('button', { name: 'Close reverse' })).toBeNull();
  });

  it('shows what a reverse has taken and what still waits, and runs it on request', async () => {
    const { panel, user } = await open('ERP-1');

    expect(panel.getByText('Waiting')).toBeInTheDocument();
    expect(within(panel.getByRole('listitem', { name: 'Batch B-1' })).getByText('6')).toBeVisible();
    expect(panel.getByText(/runs again by itself/i)).toBeInTheDocument();

    await user.click(panel.getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(api.runGrnEntry).toHaveBeenCalledWith('ERP-1'));
    expect(await screen.findByText('6 still waiting for stock')).toBeInTheDocument();
  });

  it('says when a run finishes the reverse', async () => {
    api.runGrnEntry.mockReturnValue(reply({ ...waiting, status: 'VERIFIED' }) as never);
    const { panel, user } = await open('ERP-1');

    await user.click(panel.getByRole('button', { name: 'Run now' }));
    expect(await screen.findByText('GRN ERP-1 is done')).toBeInTheDocument();
  });

  it('pauses and resumes the automatic rerun', async () => {
    const { panel, user } = await open('ERP-1');
    // The list reloads after the change, now with the rerun paused.
    api.listGrnEntries.mockReturnValue(page([{ ...waiting, rerun_active: false }, done, closed]));

    await user.click(panel.getByRole('button', { name: 'Pause automatic rerun' }));
    await waitFor(() => expect(api.setGrnEntryRerun).toHaveBeenCalledWith('ERP-1', false));
    expect(await screen.findByText('Automatic rerun paused')).toBeInTheDocument();

    const resume = await panel.findByRole('button', { name: 'Resume automatic rerun' });
    expect(panel.getByText(/is paused/)).toBeInTheDocument();
    await user.click(resume);
    await waitFor(() => expect(api.setGrnEntryRerun).toHaveBeenLastCalledWith('ERP-1', true));
  });

  it('closes a reverse that cannot finish, only with a reason', async () => {
    const { panel, user } = await open('ERP-1');

    await user.click(panel.getByRole('button', { name: 'Close reverse' }));
    const confirmClose = panel.getByRole('button', { name: 'Close it' });
    expect(confirmClose).toBeDisabled();

    await user.type(panel.getByRole('textbox', { name: 'Reason for closing' }), 'Sold at the café');
    await user.click(confirmClose);
    await waitFor(() =>
      expect(api.closeGrnEntry).toHaveBeenCalledWith('ERP-1', 'Sold at the café'),
    );
    expect(await screen.findByText('GRN ERP-1 closed')).toBeInTheDocument();
  });

  it('shows why running failed', async () => {
    api.runGrnEntry.mockRejectedValue(new Error('GRN ERP-1 has nothing waiting'));
    const { panel, user } = await open('ERP-1');

    await user.click(panel.getByRole('button', { name: 'Run now' }));
    expect(await screen.findByText('GRN ERP-1 has nothing waiting')).toBeInTheDocument();
  });

  it('shows a waiting reverse without the actions to someone who may not post GRNs', async () => {
    signedIn(['GRN_VIEW']);
    const { panel } = await open('ERP-1');

    expect(panel.queryByRole('button', { name: 'Run now' })).toBeNull();
    expect(panel.queryByRole('button', { name: 'Close reverse' })).toBeNull();
  });

  it('works as the ERP transaction log: transaction number, rerun state, date filters', async () => {
    api.listGrnEntries.mockReturnValue(page([{ ...waiting, rerun_active: false }, done]));
    const { user } = renderScreen(<ErpGrnsPageClient />);

    const reverse = (await screen.findByRole('button', { name: 'ERP-1' })).closest('tr')!;
    expect(within(reverse).getByText('TX-1')).toBeInTheDocument();
    expect(within(reverse).getByText('Rerun paused')).toBeInTheDocument();
    const goodsIn = screen.getByRole('button', { name: 'ERP-2' }).closest('tr')!;
    expect(within(goodsIn).queryByText(/Rerun/)).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.type(screen.getByLabelText('Received from'), '2026-11-01');
    await user.type(screen.getByLabelText('Received to'), '2026-11-30');
    await waitFor(() =>
      expect(api.listGrnEntries).toHaveBeenLastCalledWith(
        expect.objectContaining({ receivedFrom: '2026-11-01', receivedTo: '2026-11-30' }),
      ),
    );
    expect(screen.getByRole('searchbox', { name: 'Search ERP GRNs' })).toHaveAttribute(
      'placeholder',
      'GRN or transaction number',
    );
  });

  it('shows what a closed reverse wrote off, why and by whom', async () => {
    const { panel } = await open('ERP-3');

    expect(panel.getByText('Sold at the café')).toBeInTheDocument();
    expect(panel.getByText(/by Asha$/)).toBeInTheDocument();
  });
});
