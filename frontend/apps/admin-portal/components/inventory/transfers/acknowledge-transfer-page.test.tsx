import { screen, waitFor, within } from '@testing-library/react';
import type { Transfer } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at, router } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { ppg } from '@/test/location';
import { AcknowledgeTransferPageClient } from './acknowledge-transfer-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    createTransferAcknowledgement: vi.fn(),
    getLocationNames: vi.fn(),
    getTransfer: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

const line = (patch: Partial<Transfer['lines'][number]>) =>
  ({
    acceptedQty: 0,
    batchNumber: 'R-1',
    expiryDate: '2099-01-10',
    id: 'line-1',
    item: { id: 'item-rice', itemCode: 'RICE', itemName: 'Rice' },
    itemId: 'item-rice',
    rejectedQty: 0,
    rejectionReason: null,
    sentQty: 10,
    ...patch,
  }) as Transfer['lines'][number];

const transfer = (patch: Partial<Transfer> = {}): Transfer =>
  ({
    destinationId: 'rest-1',
    destinationType: 'RESTAURANT',
    hospital: ppg,
    id: 'tr-2',
    lines: [
      line({}),
      line({
        batchNumber: null,
        expiryDate: null,
        id: 'line-2',
        item: {
          id: 'item-oil',
          itemCode: 'OIL',
          itemName: 'Oil',
        } as Transfer['lines'][number]['item'],
        itemId: 'item-oil',
        sentQty: 4,
      }),
    ],
    remarks: 'Lunch top-up',
    sourceId: 'store-1',
    sourceType: 'STORE',
    status: 'PENDING_ACKNOWLEDGEMENT',
    transferNumber: 'TR-002',
    updatedAt: new Date().toISOString(),
    ...patch,
  }) as Transfer;

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/transfers/tr-2/acknowledge');
  signedIn(['TRANSFER_VIEW', 'TRANSFER_ACKNOWLEDGE', 'STORE_VIEW', 'RESTAURANT_VIEW']);
  api.getLocationNames.mockReturnValue(
    reply({
      counters: [],
      kitchens: [],
      restaurants: [{ id: 'rest-1', restaurantCode: 'CAF', restaurantName: 'Cafeteria' }],
      stores: [{ id: 'store-1', storeCode: 'MS', storeName: 'Main Store' }],
    }) as never,
  );
  api.getTransfer.mockReturnValue(reply(transfer()));
  api.createTransferAcknowledgement.mockReturnValue(reply({}) as never);
});

const accepted = (item: string) =>
  screen.getByRole('spinbutton', { name: `accepted quantity of ${item}` });

describe('acknowledging a transfer', () => {
  it('starts with everything accepted, and says the stock moves into the restaurant', async () => {
    renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);

    expect(await screen.findByRole('heading', { name: /Acknowledge TR-002/ })).toBeInTheDocument();
    expect(accepted('Rice')).toHaveValue(10);
    expect(accepted('Oil')).toHaveValue(4);
    const outcome = within(screen.getByRole('complementary', { name: 'Acknowledgement outcome' }));
    expect(outcome.getByText('Accepted in full')).toBeInTheDocument();
    expect(
      await outcome.findByText(
        'Everything arrived as sent. All 2 lines move into Cafeteria stock.',
      ),
    ).toBeInTheDocument();
  });

  it('accepts everything as sent', async () => {
    const { user } = renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);

    await user.click(await screen.findByRole('button', { name: 'Confirm — accept in full' }));

    await waitFor(() =>
      expect(api.createTransferAcknowledgement).toHaveBeenCalledWith({
        items: [
          {
            acceptedQty: 10,
            batchNumber: 'R-1',
            expiryDate: '2099-01-10',
            itemId: 'item-rice',
            rejectedQty: 0,
            rejectionReason: undefined,
            sentQty: 10,
            transferLineId: 'line-1',
          },
          {
            acceptedQty: 4,
            batchNumber: undefined,
            expiryDate: undefined,
            itemId: 'item-oil',
            rejectedQty: 0,
            rejectionReason: undefined,
            sentQty: 4,
            transferLineId: 'line-2',
          },
        ],
        remarks: undefined,
        transferId: 'tr-2',
      }),
    );
    expect(router.push).toHaveBeenCalledWith('/inventory/transfers?id=tr-2');
    expect(await screen.findByText('Transfer acknowledged')).toBeInTheDocument();
  });

  it('needs a reason for what is rejected, then sends the split with the remarks', async () => {
    const { user } = renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);
    await screen.findByRole('heading', { name: /Acknowledge TR-002/ });

    await user.clear(accepted('Rice'));
    await user.type(accepted('Rice'), '7');
    expect(screen.getByText('Accepted partially')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm partial acceptance' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Choose why the rest is rejected.');
    expect(api.createTransferAcknowledgement).not.toHaveBeenCalled();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Rejection reason for Rice' }),
      'Damaged in transit',
    );
    await user.type(screen.getByRole('textbox', { name: 'Remarks for the store' }), 'Bag torn');
    await user.click(screen.getByRole('button', { name: 'Confirm partial acceptance' }));

    await waitFor(() => expect(api.createTransferAcknowledgement).toHaveBeenCalled());
    const body = api.createTransferAcknowledgement.mock.calls[0]![0];
    expect(body.remarks).toBe('Bag torn');
    expect(body.items[0]).toMatchObject({
      acceptedQty: 7,
      rejectedQty: 3,
      rejectionReason: 'Damaged in transit',
    });
  });

  it('rejects everything at once', async () => {
    const { user } = renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);

    await user.click(await screen.findByRole('button', { name: 'Reject all' }));

    expect(accepted('Rice')).toHaveValue(0);
    expect(accepted('Oil')).toHaveValue(0);
    expect(screen.getByRole('button', { name: 'Confirm rejection' })).toBeInTheDocument();
    expect(
      await screen.findByText('Nothing is accepted. All quantities return to Main Store.'),
    ).toBeInTheDocument();
  });

  it('will not accept more than was sent', async () => {
    const { user } = renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);
    await screen.findByRole('heading', { name: /Acknowledge TR-002/ });

    await user.clear(accepted('Oil'));
    await user.type(accepted('Oil'), '9');

    expect(screen.getByRole('alert')).toHaveTextContent('Accept between 0 and 4.');
  });

  it('shows why the acknowledgement failed and stays on the page', async () => {
    api.createTransferAcknowledgement.mockRejectedValue(new Error('Already acknowledged'));
    const { user } = renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);

    await user.click(await screen.findByRole('button', { name: 'Confirm — accept in full' }));

    expect(await screen.findByText('Already acknowledged')).toBeInTheDocument();
    expect(screen.getByText('Transfer was not acknowledged')).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('lets someone who may only view a transfer look but not confirm', async () => {
    signedIn(['TRANSFER_VIEW']);
    renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);

    expect(await screen.findByRole('button', { name: 'Confirm — accept in full' })).toBeDisabled();
    expect(
      screen.getByText('Your role can view this transfer but not acknowledge it.'),
    ).toBeInTheDocument();
  });

  it('lets restaurant staff accept another restaurant’s leftovers', async () => {
    signedIn(['RESTAURANT_TRANSFER_RECEIVE']);
    api.getTransfer.mockReturnValue(reply(transfer({ sourceType: 'RESTAURANT' })));
    renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);

    expect(await screen.findByRole('button', { name: 'Confirm — accept in full' })).toBeEnabled();
  });

  it('has nothing to confirm on a transfer that is no longer pending', async () => {
    api.getTransfer.mockReturnValue(
      reply(
        transfer({
          lines: [line({ acceptedQty: 10 })],
          status: 'ACKNOWLEDGED',
        }),
      ),
    );
    renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);

    expect(
      await screen.findByText(
        'This transfer is not waiting for acknowledgement, so there is nothing to confirm here.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open the transfer' })).toHaveAttribute(
      'href',
      '/inventory/transfers?id=tr-2',
    );
  });

  describe('sent to a named operator', () => {
    const forRavi = transfer({ receiverId: 'user-ravi', receiverName: 'Ravi Kumar' });

    it('lets only that operator acknowledge it', async () => {
      api.getTransfer.mockReturnValue(reply(forRavi));
      renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);

      expect(
        await screen.findByText('Sent to Ravi Kumar: only they can acknowledge it'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('spinbutton')).toBeNull();
      expect(screen.queryByRole('button', { name: /^Confirm/ })).toBeNull();
    });

    it('is acknowledged by that operator as usual', async () => {
      api.getTransfer.mockReturnValue(reply({ ...forRavi, receiverId: 'user-1' }));
      renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);

      expect(await screen.findByRole('button', { name: 'Confirm — accept in full' })).toBeEnabled();
    });

    it('can be acknowledged by a Super Admin', async () => {
      signedIn(['TRANSFER_VIEW', 'TRANSFER_ACKNOWLEDGE'], ['Super Admin']);
      api.getTransfer.mockReturnValue(reply(forRavi));
      renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);

      expect(await screen.findByRole('button', { name: 'Confirm — accept in full' })).toBeEnabled();
    });
  });

  describe('a restaurant’s return to the store', () => {
    const storeReturn = transfer({
      destinationId: 'store-1',
      destinationType: 'STORE',
      sourceId: 'rest-1',
      sourceType: 'RESTAURANT',
    });

    beforeEach(() => {
      // A store keeper: may post GRNs, which is all counting a return in takes.
      signedIn(['GRN_POST', 'STORE_VIEW', 'RESTAURANT_VIEW']);
      api.getTransfer.mockReturnValue(reply(storeReturn));
    });

    it('is counted in: return count against actual count, a reason for anything missing', async () => {
      const { user } = renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);
      await screen.findByRole('heading', { name: /Acknowledge TR-002/ });

      const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
      expect(headers).toEqual([
        'Item · batch',
        'Return count',
        'Actual count',
        'Missing',
        'Reason',
      ]);
      const actual = screen.getByRole('spinbutton', { name: 'actual count of Rice' });
      await user.clear(actual);
      await user.type(actual, '7');
      expect(
        await screen.findByText(/Missing quantities go back to Cafeteria’s stock\./),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Confirm partial acceptance' }));

      expect(screen.getByRole('alert')).toHaveTextContent('Choose why it is missing.');
      expect(api.createTransferAcknowledgement).not.toHaveBeenCalled();

      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Why Rice is missing' }),
        'Short in the return',
      );
      await user.click(screen.getByRole('button', { name: 'Confirm partial acceptance' }));

      await waitFor(() => expect(api.createTransferAcknowledgement).toHaveBeenCalled());
      expect(api.createTransferAcknowledgement.mock.calls[0]![0].items[0]).toMatchObject({
        acceptedQty: 7,
        rejectedQty: 3,
        rejectionReason: 'Short in the return',
        transferLineId: 'line-1',
      });
      // Back to the returns waiting to be counted.
      expect(router.push).toHaveBeenCalledWith('/inventory/returns');
    });

    it('is counted only by store staff who post stock', async () => {
      signedIn(['TRANSFER_VIEW', 'TRANSFER_ACKNOWLEDGE']);
      renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);

      expect(
        await screen.findByRole('button', { name: 'Confirm — accept in full' }),
      ).toBeDisabled();
      expect(
        screen.getByText('Only store staff who may post stock (Post GRN) can count a return in.'),
      ).toBeInTheDocument();
    });
  });

  it('says the transfer was not found when it cannot be loaded', async () => {
    api.getTransfer.mockRejectedValue(new Error('Not found'));
    renderScreen(<AcknowledgeTransferPageClient transferId="tr-2" />);

    expect(await screen.findByText('Transfer not found')).toBeInTheDocument();
  });
});
