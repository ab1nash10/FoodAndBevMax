import { screen, within } from '@testing-library/react';
import type { Transfer } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { StoreReturnsPageClient } from './store-returns-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    getLocationNames: vi.fn(),
    listTransfers: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

const storeReturn = {
  destinationId: 'store-1',
  destinationType: 'STORE',
  id: 'tr-r1',
  lines: [
    { id: 'l1', sentQty: 4 },
    { id: 'l2', sentQty: 2.5 },
  ],
  sourceId: 'rest-1',
  sourceType: 'RESTAURANT',
  status: 'PENDING_ACKNOWLEDGEMENT',
  transferNumber: 'TR-101',
  updatedAt: '2026-11-19T10:00:00.000Z',
} as Transfer;

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/returns');
  atLocation(ppg);
  signedIn(['GRN_POST', 'TRANSFER_VIEW', 'RESTAURANT_VIEW']);
  api.getLocationNames.mockReturnValue(
    reply({
      restaurants: [{ id: 'rest-1', restaurantCode: 'CAF', restaurantName: 'Cafeteria' }],
    }) as never,
  );
  api.listTransfers.mockReturnValue(page([storeReturn]));
});

describe('returns waiting to be counted', () => {
  it('lists the restaurants’ returns to the store, each opening its count', async () => {
    renderScreen(<StoreReturnsPageClient />);

    const row = (await screen.findByRole('link', { name: 'Count TR-101' })).closest('tr')!;
    expect(screen.getByRole('link', { name: 'Count TR-101' })).toHaveAttribute(
      'href',
      '/inventory/transfers/tr-r1/acknowledge',
    );
    expect(await within(row).findByText('Cafeteria')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByText('6.500')).toBeInTheDocument();
    expect(api.listTransfers).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationType: 'STORE',
        hospitalId: ppg.id,
        status: 'PENDING_ACKNOWLEDGEMENT',
      }),
    );
  });

  it('says when nothing is waiting', async () => {
    api.listTransfers.mockReturnValue(page([]));
    renderScreen(<StoreReturnsPageClient />);

    expect(await screen.findByText('No returns to count at Patparganj')).toBeInTheDocument();
  });

  it('says why the list did not load', async () => {
    api.listTransfers.mockRejectedValue(new Error('You may not view transfers'));
    renderScreen(<StoreReturnsPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('You may not view transfers');
  });
});
