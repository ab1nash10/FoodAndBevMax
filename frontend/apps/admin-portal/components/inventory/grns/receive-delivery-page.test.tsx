import { screen, waitFor } from '@testing-library/react';
import type { Grn } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { ReceiveDeliveryPageClient } from './receive-delivery-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    createGrn: vi.fn(),
    listGrns: vi.fn(),
    listStoreItems: vi.fn(),
    listStores: vi.fn(),
    postGrnToStock: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

// The form checks ids are UUIDs, as the server does.
const hospitalId = '11111111-1111-4111-8111-111111111111';
const storeId = '22222222-2222-4222-8222-222222222222';
const riceId = '33333333-3333-4333-8333-333333333333';
const oilId = '44444444-4444-4444-8444-444444444444';
const location = { ...ppg, id: hospitalId };

const storeItem = (itemId: string, itemName: string, itemCode: string) => ({
  item: { id: itemId, itemCode, itemName },
  itemId,
});

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/grns/new');
  atLocation(location, [location]);
  signedIn(['GRN_VIEW', 'GRN_CREATE', 'GRN_POST']);
  api.listStores.mockReturnValue(page([{ id: storeId, storeName: 'Main Store' }]) as never);
  api.listStoreItems.mockReturnValue(
    page([storeItem(riceId, 'Rice', 'RICE'), storeItem(oilId, 'Oil', 'OIL')]) as never,
  );
  api.listGrns.mockReturnValue(page([]));
  api.createGrn.mockReturnValue(
    reply({ grnNumber: 'GRN-010', id: 'grn-10', status: 'DRAFT' } as Grn),
  );
  api.postGrnToStock.mockReturnValue(
    reply({ grnNumber: 'GRN-010', id: 'grn-10', status: 'POSTED_TO_STOCK' } as Grn),
  );
});

/** Vendor, store and one line of rice: batch R-1, 10 received. */
async function fillDelivery(user: ReturnType<typeof renderScreen>['user']) {
  await user.type(screen.getByLabelText(/^From/), 'Fresh Farms');
  await user.selectOptions(
    await screen.findByLabelText(/^Into/),
    await screen.findByRole('option', { name: 'Main Store' }),
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Add an item' }),
    await screen.findByRole('option', { name: 'Rice · RICE' }),
  );
  await user.type(screen.getByLabelText(/^Batch/), 'R-1');
  await user.type(screen.getByLabelText(/^Expiry/), '2099-06-30');
  await user.type(screen.getByRole('spinbutton', { name: 'Rice received' }), '10');
}

describe('receiving a delivery', () => {
  it('starts with the signed-in person as receiver and nothing counted', () => {
    renderScreen(<ReceiveDeliveryPageClient />);

    expect(screen.getByLabelText(/^By/)).toHaveValue('Test Admin');
    expect(screen.getByText('Nothing counted yet')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Add an item' })).toBeDisabled();
  });

  it('lists the store’s items once the store is chosen, and asks only its location', async () => {
    const { user } = renderScreen(<ReceiveDeliveryPageClient />);

    await user.selectOptions(
      await screen.findByLabelText(/^Into/),
      await screen.findByRole('option', { name: 'Main Store' }),
    );

    expect(await screen.findByRole('option', { name: 'Oil · OIL' })).toBeInTheDocument();
    expect(api.listStores).toHaveBeenCalledWith(expect.objectContaining({ hospitalId }));
    expect(api.listStoreItems).toHaveBeenCalledWith(expect.objectContaining({ storeId }));
  });

  it('says what is missing instead of posting an incomplete delivery', async () => {
    const { user } = renderScreen(<ReceiveDeliveryPageClient />);

    await user.click(screen.getByRole('button', { name: 'Post to stock' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Select a store.');
    expect(screen.getByText('Vendor name is required.')).toBeInTheDocument();
    expect(api.createGrn).not.toHaveBeenCalled();
  });

  it('needs a reason for anything rejected', async () => {
    const { user } = renderScreen(<ReceiveDeliveryPageClient />);
    await fillDelivery(user);
    const acceptedBox = screen.getByRole('spinbutton', { name: 'Rice accepted' });

    // Accepted follows received until part of it is rejected.
    expect(acceptedBox).toHaveValue(10);
    await user.clear(acceptedBox);
    await user.type(acceptedBox, '8');
    expect(screen.getByText('Why were 2 rejected?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Post to stock' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Line 1: Enter a rejection reason for each batch with a rejected quantity.',
    );
    expect(api.createGrn).not.toHaveBeenCalled();
  });

  it('creates the GRN and posts it to stock with the counted quantities', async () => {
    const { user } = renderScreen(<ReceiveDeliveryPageClient />);
    await fillDelivery(user);
    const acceptedBox = screen.getByRole('spinbutton', { name: 'Rice accepted' });
    await user.clear(acceptedBox);
    await user.type(acceptedBox, '8');
    await user.click(screen.getByRole('button', { name: 'Damaged' }));
    await user.type(screen.getByLabelText(/^Invoice/), 'INV-9');

    await user.click(screen.getByRole('button', { name: 'Post to stock' }));

    await waitFor(() => expect(api.postGrnToStock).toHaveBeenCalledWith('grn-10'));
    expect(api.createGrn).toHaveBeenCalledWith(
      expect.objectContaining({
        hospitalId,
        invoiceNumber: 'INV-9',
        items: [
          {
            acceptedQty: 8,
            batches: [
              {
                acceptedQty: 8,
                batchNumber: 'R-1',
                expiryDate: '2099-06-30',
                manufacturingDate: undefined,
                receivedQty: 10,
                rejectedQty: 2,
                rejectionReason: 'Damaged',
              },
            ],
            itemId: riceId,
            orderedQty: undefined,
            receivedQty: 10,
            rejectedQty: 2,
            rejectionReason: undefined,
            remarks: undefined,
          },
        ],
        poNumber: undefined,
        receivedBy: 'Test Admin',
        storeId,
        vendorName: 'Fresh Farms',
      }),
    );
    expect(await screen.findByRole('heading', { name: /Posted\s+GRN-010/ })).toBeInTheDocument();
    expect(screen.getByText(/8 units added to Main Store/)).toBeInTheDocument();
  });

  it('saves a draft without posting it to stock', async () => {
    const { user } = renderScreen(<ReceiveDeliveryPageClient />);
    await fillDelivery(user);

    await user.click(screen.getByRole('button', { name: 'Save as draft' }));

    expect(
      await screen.findByRole('heading', { name: /Saved as draft\s+GRN-010/ }),
    ).toBeInTheDocument();
    expect(api.postGrnToStock).not.toHaveBeenCalled();
  });

  it('keeps the form and shows why when the delivery is not saved', async () => {
    api.createGrn.mockRejectedValue(new Error('Batch R-1 already exists.'));
    const { user } = renderScreen(<ReceiveDeliveryPageClient />);
    await fillDelivery(user);

    await user.click(screen.getByRole('button', { name: 'Post to stock' }));

    expect(await screen.findByText('Batch R-1 already exists.')).toBeInTheDocument();
    expect(screen.getByText('Delivery not saved')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Batch/)).toHaveValue('R-1');
  });

  it('warns about a batch that has already expired', async () => {
    const { user } = renderScreen(<ReceiveDeliveryPageClient />);
    await fillDelivery(user);
    const expiry = screen.getByLabelText(/^Expiry/);

    await user.clear(expiry);
    await user.type(expiry, '2020-01-01');

    expect(screen.getByText('Already expired: it cannot be accepted')).toBeInTheDocument();
  });

  it('offers only Save as draft to someone who may create but not post GRNs', () => {
    signedIn(['GRN_VIEW', 'GRN_CREATE']);
    renderScreen(<ReceiveDeliveryPageClient />);

    expect(screen.queryByRole('button', { name: 'Post to stock' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save as draft' })).toBeInTheDocument();
  });

  it('starts from the store and items in a Receive a delivery link', async () => {
    at('/inventory/grns/new', `hospital=${hospitalId}&store=${storeId}&items=${oilId}`);
    renderScreen(<ReceiveDeliveryPageClient />);

    expect(await screen.findByRole('spinbutton', { name: 'Oil received' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Rice received' })).toBeNull();
    expect(screen.getByLabelText(/^Into/)).toHaveValue(storeId);
  });
});
