import { screen, waitFor, within } from '@testing-library/react';
import type { Grn } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { GrnsPageClient } from './grns-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    deleteGrn: vi.fn(),
    getGrn: vi.fn(),
    listGrns: vi.fn(),
    listStores: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

function grn(patch: Partial<Grn>): Grn {
  return {
    createdAt: '2026-11-18T09:00:00.000Z',
    grnNumber: 'GRN-001',
    hospital: ppg,
    hospitalId: ppg.id,
    id: 'grn-1',
    invoiceNumber: 'INV-9',
    lines: [],
    poNumber: 'PO-77',
    receivedBy: 'Ravi',
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

const line = (id: string, receivedQty: number, acceptedQty: number) =>
  ({
    acceptedQty,
    batches: [],
    id,
    item: { id: `item-${id}`, itemName: `Item ${id}` },
    orderedQty: null,
    receivedQty,
  }) as unknown as Grn['lines'][number];

const draft = grn({ lines: [line('a', 10, 10), line('b', 5, 5)] });
const posted = grn({
  grnNumber: 'GRN-002',
  id: 'grn-2',
  lines: [line('c', 10, 7)],
  status: 'POSTED_TO_STOCK',
  vendorName: null,
  poNumber: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/grns');
  atLocation(ppg);
  signedIn(['GRN_VIEW', 'GRN_CREATE']);
  api.listStores.mockReturnValue(page([]));
  api.listGrns.mockImplementation(((query: { statusCounts?: boolean }) =>
    query.statusCounts
      ? reply({
          items: [],
          meta: {
            limit: 0,
            page: 1,
            statusCounts: { CANCELLED: 1, DRAFT: 3, POSTED_TO_STOCK: 8 },
            total: 12,
            totalPages: 1,
          },
        })
      : page([draft, posted])) as never);
});

/** The list's own requests (not the strip's status counts). */
const listRequests = () =>
  api.listGrns.mock.calls.map(([query]) => query).filter((query) => !query?.statusCounts);

describe('the GRN list', () => {
  it('lists each delivery with its store, vendor, PO, status and line count', async () => {
    renderScreen(<GrnsPageClient />);

    const row = (await screen.findByRole('link', { name: 'GRN-001' })).closest('tr')!;
    expect(within(row).getByText('Main Store')).toBeInTheDocument();
    expect(within(row).getByText('Fresh Farms')).toBeInTheDocument();
    expect(within(row).getByText('PO-77')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();

    const postedRow = screen.getByRole('link', { name: 'GRN-002' }).closest('tr')!;
    expect(within(postedRow).getByText('No PO')).toBeInTheDocument();
    // Of 10 received, 7 were accepted.
    expect(within(postedRow).getByText('70% accepted')).toBeInTheDocument();
  });

  it('counts the deliveries by status in the strip', async () => {
    renderScreen(<GrnsPageClient />);
    const strip = screen.getByRole('group', { name: 'GRNs at a glance' });

    expect(await within(strip).findByText('12')).toBeInTheDocument();
    expect(within(strip).getByText('3')).toBeInTheDocument();
    expect(within(strip).getByText('8')).toBeInTheDocument();
  });

  it('asks only for the location in the header', async () => {
    renderScreen(<GrnsPageClient />);

    await screen.findByRole('link', { name: 'GRN-001' });
    expect(listRequests()[0]).toMatchObject({
      hospitalId: ppg.id,
      page: 1,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('says so when there are no deliveries', async () => {
    api.listGrns.mockReturnValue(page([]));
    renderScreen(<GrnsPageClient />);

    expect(await screen.findByText('No deliveries at Patparganj')).toBeInTheDocument();
  });

  it('shows why the list did not load', async () => {
    api.listGrns.mockRejectedValue(new Error('GRN service is down'));
    renderScreen(<GrnsPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('GRN service is down');
  });

  it('offers Receive a delivery only to someone who may create GRNs', () => {
    renderScreen(<GrnsPageClient />);
    expect(screen.getByRole('link', { name: /receive a delivery/i })).toHaveAttribute(
      'href',
      '/inventory/grns/new',
    );
  });

  it('hides Receive a delivery from someone who may only view GRNs', () => {
    signedIn(['GRN_VIEW']);
    renderScreen(<GrnsPageClient />);

    expect(screen.queryByRole('link', { name: /receive a delivery/i })).toBeNull();
  });

  it('searches by what is typed', async () => {
    const { user } = renderScreen(<GrnsPageClient />);
    await screen.findByRole('link', { name: 'GRN-001' });

    await user.type(screen.getByRole('searchbox', { name: 'Search GRNs' }), 'fresh');

    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ page: 1, search: 'fresh' }));
  });

  it('shows drafts alone when that stat is picked, and sorts oldest first on request', async () => {
    const { user } = renderScreen(<GrnsPageClient />);
    await screen.findByRole('link', { name: 'GRN-001' });

    await user.click(screen.getByRole('button', { name: /drafts to verify/i }));
    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ status: 'DRAFT' }));

    const sort = screen.getByRole('combobox', { name: 'Sort' });
    await user.selectOptions(sort, within(sort).getByRole('option', { name: /oldest/i }));
    await waitFor(() =>
      expect(listRequests().at(-1)).toMatchObject({ sortOrder: 'asc', status: 'DRAFT' }),
    );
  });

  it('filters by status from the Filters panel', async () => {
    const { user } = renderScreen(<GrnsPageClient />);
    await screen.findByRole('link', { name: 'GRN-001' });

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'CANCELLED');

    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ status: 'CANCELLED' }));
  });

  it('offers Delete on a draft only to someone who may delete GRNs', async () => {
    renderScreen(<GrnsPageClient />);
    await screen.findByRole('link', { name: 'GRN-001' });

    // The server refuses a delete without GRN_DELETE.
    expect(screen.queryByRole('button', { name: 'Delete GRN-001' })).toBeNull();
  });

  it('deletes a draft once confirmed, and offers no delete on a posted GRN', async () => {
    signedIn(['GRN_VIEW', 'GRN_DELETE']);
    api.deleteGrn.mockReturnValue(reply(null) as never);
    const { user } = renderScreen(<GrnsPageClient />);
    await screen.findByRole('link', { name: 'GRN-001' });

    expect(screen.queryByRole('button', { name: 'Delete GRN-002' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Delete GRN-001' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete GRN-001?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteGrn).toHaveBeenCalledWith('grn-1'));
    expect(await screen.findByText('GRN-001 deleted')).toBeInTheDocument();
  });

  it('opens a GRN for verification from its row', async () => {
    api.getGrn.mockReturnValue(reply(draft));
    const { user } = renderScreen(<GrnsPageClient />);
    await screen.findByRole('link', { name: 'GRN-001' });

    await user.click(screen.getByRole('button', { name: 'Verify GRN-001' }));

    expect(await screen.findByRole('heading', { name: 'GRN-001', level: 1 })).toBeInTheDocument();
    expect(api.getGrn).toHaveBeenCalledWith('grn-1');
  });
});
