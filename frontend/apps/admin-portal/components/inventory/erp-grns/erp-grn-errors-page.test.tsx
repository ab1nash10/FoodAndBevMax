import { screen, waitFor, within } from '@testing-library/react';
import type { GrnRefusal } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { grnEntriesApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { ErpGrnErrorsPage } from './erp-grn-errors-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  grnEntriesApi: { listGrnRefusals: vi.fn() },
}));

const api = mockedApi(grnEntriesApi);

const line = (patch: Partial<GrnRefusal['rows'][number]>): GrnRefusal['rows'][number] => ({
  batch: 'B-1',
  flag: 1,
  grn_No: 'ERP-7',
  location: 'PPG',
  part_item_code: 'RICE',
  transaction_qty: 5,
  ...patch,
});

/** A return for more than the Main Store held: refused, nothing saved. */
const shortReturn: GrnRefusal = {
  errors: ['Batch B-1 of item RICE: the Main Store has only 4, not 5'],
  grn_No: 'ERP-7',
  hospital_id: ppg.id,
  id: 'refusal-1',
  location: 'PPG',
  location_name: 'Patparganj',
  received_at: '2026-11-20T10:00:00.000Z',
  rows: [line({})],
};

/** Goods for a location AAHAR does not know: no hospital, four rows. */
const unknownPlace: GrnRefusal = {
  ...shortReturn,
  errors: ['Location XYZ is not in AAHAR'],
  grn_No: 'ERP-8',
  hospital_id: null,
  id: 'refusal-2',
  location: 'XYZ',
  location_name: null,
  rows: ['B-1', 'B-2', 'B-3', 'B-4'].map((batch) =>
    line({ batch, flag: 0, grn_No: 'ERP-8', location: 'XYZ', transaction_qty: 3 }),
  ),
};

beforeEach(() => {
  vi.clearAllMocks();
  at('/logs/erp-grn-errors');
  atLocation(ppg);
  signedIn(['GRN_VIEW']);
  api.listGrnRefusals.mockReturnValue(page([shortReturn, unknownPlace]));
});

describe('ERP GRN errors', () => {
  it('lists each refused GRN with why, where, and what it asked for', async () => {
    renderScreen(<ErpGrnErrorsPage />);

    expect(await screen.findByRole('heading', { name: 'ERP GRN errors' })).toBeInTheDocument();
    const refused = (await screen.findByText('ERP-7')).closest('tr')!;
    expect(
      within(refused).getByText('Batch B-1 of item RICE: the Main Store has only 4, not 5'),
    ).toBeInTheDocument();
    expect(within(refused).getByText('Patparganj')).toBeInTheDocument();
    expect(within(refused).getByText('RICE · B-1 · return 5')).toBeInTheDocument();

    // A location AAHAR does not know shows as the ERP sent it; past three rows, the rest are counted.
    const elsewhere = screen.getByText('ERP-8').closest('tr')!;
    expect(within(elsewhere).getByText('XYZ')).toBeInTheDocument();
    expect(within(elsewhere).getByText('RICE · B-3 · in 3')).toBeInTheDocument();
    expect(within(elsewhere).queryByText('RICE · B-4 · in 3')).not.toBeInTheDocument();
    expect(within(elsewhere).getByText('+1 more')).toBeInTheDocument();

    expect(api.listGrnRefusals).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalId: ppg.id, page: 1 }),
    );
  });

  it('says so when nothing was refused', async () => {
    api.listGrnRefusals.mockReturnValue(page([]));
    renderScreen(<ErpGrnErrorsPage />);

    expect(await screen.findByText('No refused GRNs')).toBeInTheDocument();
  });

  it('shows why the list did not load', async () => {
    api.listGrnRefusals.mockRejectedValue(new Error('ERP link is down'));
    renderScreen(<ErpGrnErrorsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('ERP link is down');
  });

  it('searches by GRN number', async () => {
    const { user } = renderScreen(<ErpGrnErrorsPage />);
    await screen.findByText('ERP-7');

    await user.type(screen.getByRole('searchbox', { name: 'Search ERP GRN errors' }), 'ERP-9');
    await waitFor(() =>
      expect(api.listGrnRefusals).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'ERP-9' }),
      ),
    );
  });
});
