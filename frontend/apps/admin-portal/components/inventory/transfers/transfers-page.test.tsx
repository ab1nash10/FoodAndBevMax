import { screen, waitFor, within } from '@testing-library/react';
import type { Transfer } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { downloadCsv } from '@/lib/csv';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { TransfersPageClient } from './transfers-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/csv', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  downloadCsv: vi.fn(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    cancelTransfer: vi.fn(),
    dispatchTransfer: vi.fn(),
    getLocationNames: vi.fn(),
    getTransfer: vi.fn(),
    listKitchens: vi.fn(),
    listRestaurants: vi.fn(),
    listStores: vi.fn(),
    listTransfers: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

const line = (patch: Partial<Transfer['lines'][number]>) =>
  ({
    acceptedQty: 0,
    batchNumber: 'R-1',
    expiryDate: null,
    id: 'line-1',
    item: { id: 'item-1', itemName: 'Rice' },
    rejectedQty: 0,
    rejectionReason: null,
    sentQty: 10,
    ...patch,
  }) as Transfer['lines'][number];

const transfer = (patch: Partial<Transfer>): Transfer =>
  ({
    businessDate: '2026-11-18',
    createdAt: '2026-11-18T09:00:00.000Z',
    destinationId: 'rest-1',
    destinationType: 'RESTAURANT',
    hospital: ppg,
    hospitalId: ppg.id,
    id: 'tr-1',
    lines: [line({})],
    remarks: null,
    sourceId: 'store-1',
    sourceType: 'STORE',
    status: 'DRAFT',
    transferDate: '2026-11-18T09:00:00.000Z',
    transferNumber: 'TR-001',
    updatedAt: '2026-11-18T09:00:00.000Z',
    ...patch,
  }) as Transfer;

const draft = transfer({});
const pending = transfer({
  id: 'tr-2',
  status: 'PENDING_ACKNOWLEDGEMENT',
  transferNumber: 'TR-002',
});
const partial = transfer({
  id: 'tr-3',
  lines: [
    line({ acceptedQty: 10 }),
    line({ acceptedQty: 0, id: 'line-2', rejectedQty: 4, rejectionReason: 'Spoilt', sentQty: 4 }),
  ],
  status: 'ACKNOWLEDGED',
  transferNumber: 'TR-003',
});

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/transfers');
  atLocation(ppg);
  signedIn([
    'TRANSFER_VIEW',
    'TRANSFER_CREATE',
    'TRANSFER_ACKNOWLEDGE',
    'STORE_VIEW',
    'RESTAURANT_VIEW',
  ]);
  api.getLocationNames.mockReturnValue(
    reply({
      counters: [],
      kitchens: [],
      restaurants: [{ id: 'rest-1', restaurantCode: 'CAF', restaurantName: 'Cafeteria' }],
      stores: [{ id: 'store-1', storeCode: 'MS', storeName: 'Main Store' }],
    }) as never,
  );
  api.listStores.mockReturnValue(page([{ id: 'store-1', storeName: 'Main Store' }]) as never);
  api.listKitchens.mockReturnValue(page([]));
  api.listRestaurants.mockReturnValue(
    page([{ id: 'rest-1', restaurantName: 'Cafeteria' }]) as never,
  );
  api.listTransfers.mockImplementation(((query: { statusCounts?: boolean }) =>
    query.statusCounts
      ? reply({
          items: [],
          meta: {
            limit: 0,
            page: 1,
            statusCounts: { ACKNOWLEDGED: 4, DRAFT: 2, PENDING_ACKNOWLEDGEMENT: 1 },
            total: 7,
            totalPages: 1,
          },
        })
      : page([draft, pending, partial])) as never);
});

const listRequests = () =>
  api.listTransfers.mock.calls.map(([query]) => query).filter((query) => !query?.statusCounts);
const table = () => within(screen.getByRole('table'));
const rowOf = (number: string) => table().getByRole('link', { name: number }).closest('tr')!;

describe('the transfer list', () => {
  it('shows each transfer’s route, lines and where it stands', async () => {
    renderScreen(<TransfersPageClient />);
    await table().findByRole('link', { name: 'TR-001' });

    const draftRow = within(rowOf('TR-001'));
    expect(await draftRow.findByText('Main Store')).toBeInTheDocument();
    expect(draftRow.getByText('Cafeteria')).toBeInTheDocument();
    expect(draftRow.getByText('Not dispatched')).toBeInTheDocument();

    expect(within(rowOf('TR-002')).getByText('Waiting on restaurant')).toBeInTheDocument();

    const partialRow = within(rowOf('TR-003'));
    expect(partialRow.getByText('Accepted partially')).toBeInTheDocument();
    expect(partialRow.getByText('1 of 2 received')).toBeInTheDocument();
  });

  it('says which operator a pending transfer waits on', async () => {
    api.listTransfers.mockImplementation(((query: { statusCounts?: boolean }) =>
      query.statusCounts
        ? reply({ items: [], meta: { limit: 0, page: 1, total: 1, totalPages: 1 } })
        : page([{ ...pending, receiverId: 'user-ravi', receiverName: 'Ravi Kumar' }])) as never);
    renderScreen(<TransfersPageClient />);
    await table().findByRole('link', { name: 'TR-002' });

    expect(within(rowOf('TR-002')).getByText('Waiting on Ravi Kumar')).toBeInTheDocument();
  });

  it('counts the transfers by status', async () => {
    renderScreen(<TransfersPageClient />);
    const strip = within(screen.getByRole('group', { name: 'Transfers by status' }));

    expect(await strip.findByRole('button', { name: /^2\s*Draft/ })).toBeInTheDocument();
    expect(strip.getByRole('button', { name: /^1\s*Pending acknowledgement/ })).toBeInTheDocument();
    expect(strip.getByRole('button', { name: /^4\s*Acknowledged/ })).toBeInTheDocument();
  });

  it('offers Acknowledge on a pending transfer only to someone who may acknowledge', async () => {
    const { unmount } = renderScreen(<TransfersPageClient />);
    expect(await table().findByRole('link', { name: 'Acknowledge TR-002' })).toHaveAttribute(
      'href',
      '/inventory/transfers/tr-2/acknowledge',
    );
    unmount();

    signedIn(['TRANSFER_VIEW']);
    renderScreen(<TransfersPageClient />);
    await table().findByRole('link', { name: 'TR-002' });
    expect(screen.queryByRole('link', { name: 'Acknowledge TR-002' })).toBeNull();
    expect(screen.queryByRole('link', { name: /new transfer/i })).toBeNull();
  });

  it('asks for the location in the header, then by status, source and date', async () => {
    const { user } = renderScreen(<TransfersPageClient />);
    await table().findByRole('link', { name: 'TR-001' });
    expect(listRequests()[0]).toMatchObject({ hospitalId: ppg.id, page: 1, sortOrder: 'desc' });

    await user.click(screen.getByRole('button', { name: /Pending acknowledgement/ }));
    await waitFor(() =>
      expect(listRequests().at(-1)).toMatchObject({ status: 'PENDING_ACKNOWLEDGEMENT' }),
    );

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'From' }), 'STORE');
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Store' }), 'store-1');
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Date' }), '7d');

    await waitFor(() =>
      expect(listRequests().at(-1)).toMatchObject({
        sourceId: 'store-1',
        sourceType: 'STORE',
        status: 'PENDING_ACKNOWLEDGEMENT',
      }),
    );
    // From the start of the day a week ago.
    expect(listRequests().at(-1)?.fromDate).toBeTruthy();
  });

  it('searches by what is typed', async () => {
    const { user } = renderScreen(<TransfersPageClient />);
    await table().findByRole('link', { name: 'TR-001' });

    await user.type(screen.getByRole('searchbox', { name: 'Search transfers' }), 'rice');

    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ search: 'rice' }));
  });

  it('exports the ticked transfers as CSV', async () => {
    const { user } = renderScreen(<TransfersPageClient />);
    await table().findByRole('link', { name: 'TR-001' });

    await user.click(table().getByRole('checkbox', { name: 'Select TR-003' }));
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    const [, rows] = vi.mocked(downloadCsv).mock.calls[0]!;
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(
      expect.arrayContaining(['TR-003', 'STORE', 'Main Store', 'Cafeteria', 2, 'Acknowledged']),
    );
  });

  it('says so when there are no transfers, and why a load failed', async () => {
    api.listTransfers.mockReturnValue(page([]));
    const { unmount } = renderScreen(<TransfersPageClient />);
    expect(await screen.findByText('No transfers at Patparganj')).toBeInTheDocument();
    unmount();

    api.listTransfers.mockRejectedValue(new Error('Transfers are down'));
    renderScreen(<TransfersPageClient />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Transfers are down');
  });
});

describe('an open transfer', () => {
  it('shows its lines, and dispatches a draft', async () => {
    api.dispatchTransfer.mockReturnValue(reply(draft));
    at('/inventory/transfers', 'id=tr-1');
    const { user } = renderScreen(<TransfersPageClient />);

    expect(await screen.findByRole('heading', { name: 'TR-001', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Main Store → Cafeteria/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dispatch' }));

    await waitFor(() => expect(api.dispatchTransfer).toHaveBeenCalledWith('tr-1'));
    expect(await screen.findByText('Transfer dispatched')).toBeInTheDocument();
  });

  it('cancels a draft once confirmed', async () => {
    api.cancelTransfer.mockReturnValue(reply(draft));
    at('/inventory/transfers', 'id=tr-1');
    const { user } = renderScreen(<TransfersPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Cancel transfer' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Cancel TR-001?' })).getByRole('button', {
        name: 'Cancel transfer',
      }),
    );

    await waitFor(() => expect(api.cancelTransfer).toHaveBeenCalledWith('tr-1'));
  });

  it('shows why dispatching failed', async () => {
    api.dispatchTransfer.mockRejectedValue(new Error('Not enough Rice in Main Store'));
    at('/inventory/transfers', 'id=tr-1');
    const { user } = renderScreen(<TransfersPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Dispatch' }));

    expect(await screen.findByText('Not enough Rice in Main Store')).toBeInTheDocument();
    expect(screen.getByText('Transfer was not dispatched')).toBeInTheDocument();
  });

  it('shows what was accepted and rejected, with the reason, once acknowledged', async () => {
    at('/inventory/transfers', 'id=tr-3');
    renderScreen(<TransfersPageClient />);

    await screen.findByRole('heading', { name: 'TR-003', level: 1 });
    const lines = within(screen.getByRole('region', { name: 'Lines · 2' }));
    expect(lines.getByText('Spoilt')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 lines · 1 reason')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dispatch' })).toBeNull();
  });

  it('names the operator it was sent to', async () => {
    api.getTransfer.mockReturnValue(
      reply({ ...pending, id: 'tr-9', receiverId: 'user-ravi', receiverName: 'Ravi Kumar' }),
    );
    at('/inventory/transfers', 'id=tr-9');
    renderScreen(<TransfersPageClient />);

    const details = within(await screen.findByRole('region', { name: 'Transfer details' }));
    expect(details.getByText('Operator').nextElementSibling).toHaveTextContent('Ravi Kumar');
    expect(screen.getByText('Acknowledgement by Ravi Kumar')).toBeInTheDocument();
  });

  it('fetches a linked transfer that is not on this page, or says it was not found', async () => {
    api.getTransfer.mockRejectedValue(new Error('Not found'));
    at('/inventory/transfers', 'id=tr-9');
    renderScreen(<TransfersPageClient />);

    expect(await screen.findByText('Transfer not found')).toBeInTheDocument();
    expect(api.getTransfer).toHaveBeenCalledWith('tr-9');
  });
});
