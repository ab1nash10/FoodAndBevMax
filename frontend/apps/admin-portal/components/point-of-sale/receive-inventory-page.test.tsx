import {
  ApiClientError,
  type PosCounter,
  type Transfer,
  type TransferLine,
} from '@aahar/api-client';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { at } from '@/test/next-navigation';
import { ReceiveInventoryPageClient } from './receive-inventory-page';
import type * as ApiModule from '@/lib/api';
import type * as LocationModule from '@/components/location-context';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
// The location stand-in, with the module's own helpers (the empty list names the location).
vi.mock('@/components/location-context', async (importOriginal) => ({
  ...(await importOriginal<typeof LocationModule>()),
  ...(await import('@/test/location')),
}));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  createTransferAcknowledgement: vi.fn<Client['createTransferAcknowledgement']>(),
  getLocationNames: vi.fn<Client['getLocationNames']>(),
  listPosCounters: vi.fn<Client['listPosCounters']>(),
  listTransfers: vi.fn<Client['listTransfers']>(),
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

const line = (id: string, itemName: string, sentQty: number, patch = {}) =>
  ({
    acceptedQty: 0,
    batchNumber: null,
    expiryDate: null,
    id,
    item: { itemCode: `${id.toUpperCase()}-CODE`, itemName },
    itemId: `item-${id}`,
    rejectedQty: 0,
    rejectionReason: null,
    sentQty,
    ...patch,
  }) as TransferLine;

const transfer = (patch: Partial<Transfer> = {}) =>
  ({
    acknowledgedAt: null,
    createdByName: 'Store Keeper',
    id: 't1',
    lines: [
      line('l1', 'Samosa', 20, { batchNumber: 'B-7', expiryDate: '2026-11-21' }),
      line('l2', 'Paneer', 5),
    ],
    sourceId: 'kitchen-1',
    sourceType: 'KITCHEN',
    status: 'PENDING_ACKNOWLEDGEMENT',
    transferDate: '2026-11-19T04:00:00.000Z',
    transferNumber: 'TRF-0009',
    updatedAt: '2026-11-19T04:00:00.000Z',
    ...patch,
  }) as Transfer;

const list = (items: Transfer[]) =>
  reply({ items, meta: { limit: 25, page: 1, total: items.length, totalPages: 1 } });

beforeEach(() => {
  vi.clearAllMocks();
  at('/pos/receive');
  signedIn(['COUNTER_STOCK_RECEIVE', 'KITCHEN_VIEW']);
  api.listPosCounters.mockImplementation(() => reply([counter]));
  api.getLocationNames.mockImplementation(() =>
    reply({
      counters: [],
      kitchens: [{ id: 'kitchen-1', kitchenName: 'Main Kitchen' }],
      restaurants: [],
      stores: [],
    } as never),
  );
  api.listTransfers.mockImplementation(() => list([transfer()]));
});

describe('receiving stock at the counter', () => {
  it('lists the transfers waiting at this counter, oldest first', async () => {
    renderScreen(<ReceiveInventoryPageClient />);

    const row = (await screen.findByText('TRF-0009')).closest('tr')!;
    expect(row).toHaveTextContent('2 lines');
    expect(await within(row).findByText('Main Kitchen')).toBeInTheDocument();
    expect(row).toHaveTextContent(/Waiting since/);
    expect(row).toHaveTextContent('Store Keeper');
    expect(api.listTransfers).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationId: 'counter-1',
        destinationType: 'COUNTER',
        sortOrder: 'asc',
        status: 'PENDING_ACKNOWLEDGEMENT',
      }),
    );
  });

  it('shows what a transfer carried', async () => {
    const { user } = renderScreen(<ReceiveInventoryPageClient />);

    await user.click(await screen.findByRole('button', { name: 'View items' }));

    const panel = screen.getByRole('dialog', { name: 'Items in TRF-0009' });
    expect(within(panel).getByText('Samosa').closest('tr')).toHaveTextContent('B-7');
    expect(within(panel).getByText('Paneer').closest('tr')).toHaveTextContent('No batch');
  });

  it('accepts every line in full unless told otherwise', async () => {
    api.createTransferAcknowledgement.mockImplementation(() => reply({} as never));
    const { user } = renderScreen(<ReceiveInventoryPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Receive' }));
    await user.click(screen.getByRole('button', { name: 'Receive stock' }));

    expect(api.createTransferAcknowledgement).toHaveBeenCalledWith({
      items: [
        {
          acceptedQty: 20,
          batchNumber: 'B-7',
          expiryDate: '2026-11-21',
          itemId: 'item-l1',
          rejectedQty: 0,
          rejectionReason: undefined,
          sentQty: 20,
          transferLineId: 'l1',
        },
        expect.objectContaining({ acceptedQty: 5, rejectedQty: 0, transferLineId: 'l2' }),
      ],
      transferId: 't1',
    });
    expect(await screen.findByText('Stock received')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Receive TRF-0009' })).not.toBeInTheDocument();
  });

  it('sends the rest back only with a reason', async () => {
    api.createTransferAcknowledgement.mockImplementation(() => reply({} as never));
    const { user } = renderScreen(<ReceiveInventoryPageClient />);
    await user.click(await screen.findByRole('button', { name: 'Receive' }));
    const panel = screen.getByRole('dialog', { name: 'Receive TRF-0009' });
    const samosa = within(panel).getByText('Samosa').closest('li')!;

    await user.clear(within(samosa).getByLabelText('Accepted'));
    await user.type(within(samosa).getByLabelText('Accepted'), '18');
    expect(within(samosa).getByText('Rejected').lastElementChild).toHaveTextContent('2');
    await user.click(within(panel).getByRole('button', { name: 'Receive stock' }));
    expect(within(samosa).getByRole('alert')).toHaveTextContent('Say why the rest is sent back.');
    expect(api.createTransferAcknowledgement).not.toHaveBeenCalled();

    await user.type(within(samosa).getByLabelText('Why Samosa is sent back'), 'Damaged');
    await user.click(within(panel).getByRole('button', { name: 'Receive stock' }));

    expect(api.createTransferAcknowledgement).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            acceptedQty: 18,
            rejectedQty: 2,
            rejectionReason: 'Damaged',
            transferLineId: 'l1',
          }),
        ]) as unknown,
      }),
    );
  });

  it('will not accept more than was sent', async () => {
    const { user } = renderScreen(<ReceiveInventoryPageClient />);
    await user.click(await screen.findByRole('button', { name: 'Receive' }));
    const paneer = screen.getByText('Paneer', { selector: 'p' }).closest('li')!;

    await user.clear(within(paneer).getByLabelText('Accepted'));
    await user.type(within(paneer).getByLabelText('Accepted'), '6');
    await user.click(screen.getByRole('button', { name: 'Receive stock' }));

    expect(within(paneer).getByRole('alert')).toHaveTextContent('Accept between 0 and 5.');
    expect(api.createTransferAcknowledgement).not.toHaveBeenCalled();
  });

  it('shows why the stock was not received', async () => {
    api.createTransferAcknowledgement.mockRejectedValue(
      new ApiClientError(409, 'Already received.'),
    );
    const { user } = renderScreen(<ReceiveInventoryPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Receive' }));
    await user.click(screen.getByRole('button', { name: 'Receive stock' }));

    expect(await screen.findByText('Already received.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Receive TRF-0009' })).toBeInTheDocument();
  });

  it('lets only someone allowed check stock in', async () => {
    signedIn(['KITCHEN_VIEW']);
    renderScreen(<ReceiveInventoryPageClient />);

    expect(await screen.findByRole('button', { name: 'View items' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Receive' })).not.toBeInTheDocument();
  });

  it('lists received transfers, newest first, with when they were checked in', async () => {
    at('/pos/receive', 'view=ACKNOWLEDGED');
    api.listTransfers.mockImplementation(() =>
      list([
        transfer({
          acknowledgedAt: '2026-11-19T05:00:00.000Z',
          lines: [
            line('l1', 'Samosa', 20, {
              acceptedQty: 18,
              rejectedQty: 2,
              rejectionReason: 'Damaged',
            }),
          ],
          status: 'ACKNOWLEDGED',
        }),
      ]),
    );
    const { user } = renderScreen(<ReceiveInventoryPageClient />);

    const row = (await screen.findByText('TRF-0009')).closest('tr')!;
    expect(row).toHaveTextContent(/Acknowledged at/);
    expect(within(row).queryByRole('button', { name: 'Receive' })).not.toBeInTheDocument();
    expect(api.listTransfers).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 'desc', status: 'ACKNOWLEDGED' }),
    );

    await user.click(within(row).getByRole('button', { name: 'View items' }));
    const samosa = within(screen.getByRole('dialog')).getByText('Samosa').closest('tr')!;
    expect(samosa).toHaveTextContent('Damaged');
    expect(samosa).toHaveTextContent('2018');
  });

  it('says when nothing is on its way', async () => {
    api.listTransfers.mockImplementation(() => list([]));
    renderScreen(<ReceiveInventoryPageClient />);

    expect(await screen.findByText('No transfers waiting found')).toBeInTheDocument();
  });
});
