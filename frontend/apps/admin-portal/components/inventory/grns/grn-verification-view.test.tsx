import { screen, waitFor, within } from '@testing-library/react';
import type { Grn, GrnBatch, GrnLine } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { ppg } from '@/test/location';
import { GrnVerificationView } from './grn-verification-view';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    cancelGrn: vi.fn(),
    getGrn: vi.fn(),
    postGrnToStock: vi.fn(),
    updateGrn: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

const batch = (patch: Partial<GrnBatch>) =>
  ({
    acceptedQty: 5,
    batchNumber: 'B-1',
    expiryDate: '2099-06-30T00:00:00.000Z',
    id: 'batch-1',
    manufacturingDate: null,
    receivedQty: 5,
    rejectedQty: 0,
    rejectionReason: null,
    ...patch,
  }) as GrnBatch;

const line = (patch: Partial<GrnLine>) =>
  ({
    acceptedQty: 10,
    batches: [],
    id: 'line-1',
    item: { id: 'item-1', itemCode: 'RICE', itemName: 'Rice' },
    itemId: 'item-1',
    orderedQty: null,
    receivedQty: 10,
    rejectedQty: 0,
    rejectionReason: null,
    remarks: null,
    ...patch,
  }) as GrnLine;

const rice = line({
  batches: [batch({ acceptedQty: 10, receivedQty: 10 })],
  orderedQty: 12,
});
const oil = line({
  acceptedQty: 8,
  batches: [
    batch({ acceptedQty: 5, batchNumber: 'OIL-A', id: 'batch-2', receivedQty: 5 }),
    batch({ acceptedQty: 3, batchNumber: 'OIL-B', id: 'batch-3', receivedQty: 3 }),
  ],
  id: 'line-2',
  item: { id: 'item-2', itemCode: 'OIL', itemName: 'Oil' } as GrnLine['item'],
  itemId: 'item-2',
  receivedQty: 8,
});

function grn(patch: Partial<Grn> = {}): Grn {
  return {
    createdAt: '2026-11-18T09:00:00.000Z',
    grnNumber: 'GRN-001',
    hospital: ppg,
    hospitalId: ppg.id,
    id: 'grn-1',
    invoiceNumber: 'INV-9',
    lines: [rice, oil],
    poNumber: 'PO-77',
    receivedBy: 'Ravi Kumar',
    receivedDate: '2026-11-18T09:00:00.000Z',
    remarks: null,
    status: 'DRAFT',
    store: {
      hospitalId: ppg.id,
      id: 'store-1',
      isActive: true,
      storeCode: 'MS',
      storeName: 'Main Store',
    },
    storeId: 'store-1',
    updatedAt: '2026-11-18T09:00:00.000Z',
    vendorName: 'Fresh Farms',
    ...patch,
  } as Grn;
}

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/grns', 'id=grn-1');
  signedIn(['GRN_VIEW', 'GRN_UPDATE', 'GRN_POST']);
  api.getGrn.mockReturnValue(reply(grn()));
  api.updateGrn.mockReturnValue(reply(grn()));
  api.postGrnToStock.mockReturnValue(reply(grn({ status: 'POSTED_TO_STOCK' })));
});

const accepted = (name: string) => screen.getByRole('spinbutton', { name });

describe('verifying a GRN', () => {
  it('shows the delivery, its lines and how much was received and accepted', async () => {
    renderScreen(<GrnVerificationView grnId="grn-1" />);

    expect(await screen.findByRole('heading', { name: 'GRN-001', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Fresh Farms → Main Store/)).toBeInTheDocument();
    expect(screen.getByText('2 short against PO')).toBeInTheDocument();
    expect(accepted('Accepted quantity for Rice')).toHaveValue(10);
    // Oil came in two batches, so it is accepted per batch.
    expect(accepted('Accepted quantity for Oil batch OIL-A')).toHaveValue(5);
    expect(accepted('Accepted quantity for Oil batch OIL-B')).toHaveValue(3);
    expect(screen.getByText('Accepted', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept & post to stock/i })).toBeInTheDocument();
  });

  it('turns what is not accepted into a rejection that needs a reason', async () => {
    const { user } = renderScreen(<GrnVerificationView grnId="grn-1" />);
    const rice = await screen.findByRole('spinbutton', { name: 'Accepted quantity for Rice' });

    await user.clear(rice);
    await user.type(rice, '7');

    expect(screen.getByText('Partially accepted', { selector: 'dd' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save verification' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose why the rest is rejected.');
    expect(api.updateGrn).not.toHaveBeenCalled();
  });

  it('will not accept more than was received', async () => {
    const { user } = renderScreen(<GrnVerificationView grnId="grn-1" />);
    const rice = await screen.findByRole('spinbutton', { name: 'Accepted quantity for Rice' });

    await user.clear(rice);
    await user.type(rice, '11');

    expect(screen.getByRole('alert')).toHaveTextContent('Accept between 0 and 10.');
  });

  it('will not accept an expired batch', async () => {
    api.getGrn.mockReturnValue(
      reply(
        grn({
          lines: [
            line({
              batches: [batch({ acceptedQty: 10, expiryDate: '2020-01-01', receivedQty: 10 })],
            }),
          ],
        }),
      ),
    );
    renderScreen(<GrnVerificationView grnId="grn-1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Batch B-1 has expired and can't be accepted.",
    );
  });

  it('saves the accepted and rejected quantities with the reason', async () => {
    const { user } = renderScreen(<GrnVerificationView grnId="grn-1" />);
    const rice = await screen.findByRole('spinbutton', { name: 'Accepted quantity for Rice' });

    await user.clear(rice);
    await user.type(rice, '7');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Rejection reason for Rice' }),
      'Damaged packs',
    );
    await user.click(screen.getByRole('button', { name: 'Save verification' }));

    await waitFor(() => expect(api.updateGrn).toHaveBeenCalled());
    const [id, body] = api.updateGrn.mock.calls[0]!;
    expect(id).toBe('grn-1');
    expect(body.items?.[0]).toMatchObject({
      acceptedQty: 7,
      batches: [
        {
          acceptedQty: 7,
          batchNumber: 'B-1',
          expiryDate: '2099-06-30',
          receivedQty: 10,
          rejectedQty: 3,
          rejectionReason: 'Damaged packs',
        },
      ],
      itemId: 'item-1',
      orderedQty: 12,
      receivedQty: 10,
      rejectedQty: 3,
      rejectionReason: 'Damaged packs',
    });
    expect(body.items?.[1]).toMatchObject({ acceptedQty: 8, rejectedQty: 0 });
    expect(api.postGrnToStock).not.toHaveBeenCalled();
    expect(await screen.findByText('Verification saved')).toBeInTheDocument();
  });

  it('asks before posting with checks unticked, then posts to stock', async () => {
    const { user } = renderScreen(<GrnVerificationView grnId="grn-1" />);
    await user.click(await screen.findByRole('button', { name: /accept & post to stock/i }));

    const dialog = screen.getByRole('dialog', { name: 'Post with checks unticked?' });
    expect(within(dialog).getByText('Invoice matches PO')).toBeInTheDocument();
    expect(api.updateGrn).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Post anyway' }));

    await waitFor(() => expect(api.postGrnToStock).toHaveBeenCalledWith('grn-1'));
    expect(await screen.findByText('GRN posted to stock')).toBeInTheDocument();
  });

  it('posts without asking once every check is ticked', async () => {
    const { user } = renderScreen(<GrnVerificationView grnId="grn-1" />);
    const checks = within(await screen.findByRole('region', { name: 'Before you post' }));

    for (const box of checks.getAllByRole('checkbox')) await user.click(box);
    await user.click(screen.getByRole('button', { name: /accept & post to stock/i }));

    await waitFor(() => expect(api.postGrnToStock).toHaveBeenCalledWith('grn-1'));
    expect(screen.queryByRole('dialog', { name: 'Post with checks unticked?' })).toBeNull();
  });

  it('rejects the whole GRN once confirmed', async () => {
    api.cancelGrn.mockReturnValue(reply(grn({ status: 'CANCELLED' })));
    const { user } = renderScreen(<GrnVerificationView grnId="grn-1" />);

    await user.click(await screen.findByRole('button', { name: 'Reject GRN' }));
    const dialog = screen.getByRole('dialog', { name: 'Reject GRN-001?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reject GRN' }));

    await waitFor(() => expect(api.cancelGrn).toHaveBeenCalledWith('grn-1'));
    expect(await screen.findByText('GRN rejected')).toBeInTheDocument();
  });

  it('shows the reason when saving fails', async () => {
    api.updateGrn.mockRejectedValue(new Error('This GRN was already posted.'));
    const { user } = renderScreen(<GrnVerificationView grnId="grn-1" />);

    await user.click(await screen.findByRole('button', { name: 'Save verification' }));

    expect(await screen.findByText('This GRN was already posted.')).toBeInTheDocument();
    expect(screen.getByText('GRN was not saved')).toBeInTheDocument();
  });

  it('is read only without permission to update GRNs', async () => {
    signedIn(['GRN_VIEW']);
    renderScreen(<GrnVerificationView grnId="grn-1" />);

    await screen.findByRole('heading', { name: 'GRN-001', level: 1 });
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save verification' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject GRN' })).toBeNull();
  });

  it('can be saved but not posted without permission to post', async () => {
    signedIn(['GRN_VIEW', 'GRN_UPDATE']);
    renderScreen(<GrnVerificationView grnId="grn-1" />);

    expect(await screen.findByRole('button', { name: 'Save verification' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /post/i })).toBeNull();
  });

  it('shows a posted GRN as values, with nothing to edit', async () => {
    api.getGrn.mockReturnValue(reply(grn({ status: 'POSTED_TO_STOCK' })));
    renderScreen(<GrnVerificationView grnId="grn-1" />);

    await screen.findByRole('heading', { name: 'GRN-001', level: 1 });
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Before you post' })).toBeNull();
  });

  it('says the GRN was not found when it cannot be loaded', async () => {
    api.getGrn.mockRejectedValue(new Error('Not found'));
    renderScreen(<GrnVerificationView grnId="grn-1" />);

    expect(await screen.findByText('GRN not found')).toBeInTheDocument();
  });
});
