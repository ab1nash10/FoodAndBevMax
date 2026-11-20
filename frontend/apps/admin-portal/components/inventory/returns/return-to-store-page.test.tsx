import { screen, waitFor, within } from '@testing-library/react';
import type { StockBalance, Transfer } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { ReturnToStorePageClient } from './return-to-store-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    createTransfer: vi.fn(),
    dispatchTransfer: vi.fn(),
    listRestaurants: vi.fn(),
    listRestaurantStock: vi.fn(),
    listStores: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

const batch = (patch: Partial<StockBalance>): StockBalance =>
  ({
    availableQty: 12,
    batchNumber: 'W-1',
    expiryDate: '2099-03-01T00:00:00.000Z',
    id: 'sb-1',
    item: { id: 'item-1', itemCode: 'WTR', itemName: 'Water bottle', type: 'VEG' },
    itemId: 'item-1',
    itemType: 'MRP',
    locationId: 'rest-1',
    ...patch,
  }) as StockBalance;

const water = batch({});
const chips = batch({
  availableQty: 5,
  batchNumber: 'C-1',
  expiryDate: '2099-01-15T00:00:00.000Z',
  id: 'sb-2',
  item: { ...water.item, id: 'item-2', itemCode: 'CHP', itemName: 'Chips' },
  itemId: 'item-2',
});
// Used up: nothing to send back.
const empty = batch({ availableQty: 0, batchNumber: 'W-0', id: 'sb-0' });

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/returns/new', 'restaurant=rest-1');
  atLocation(ppg);
  signedIn(['RESTAURANT_TRANSFER_SEND', 'RESTAURANT_STOCK_VIEW', 'RESTAURANT_VIEW', 'STORE_VIEW']);
  api.listRestaurants.mockReturnValue(
    page([{ id: 'rest-1', restaurantName: 'Cafeteria' }]) as never,
  );
  api.listStores.mockReturnValue(
    page([
      { id: 'store-0', storeName: 'Cold Store' },
      { id: 'store-1', storeName: 'Main Store' },
    ]) as never,
  );
  api.listRestaurantStock.mockReturnValue(page([water, chips, empty]));
  api.createTransfer.mockReturnValue(
    reply({ id: 'tr-r1', status: 'DRAFT', transferNumber: 'TR-101' } as Transfer),
  );
  api.dispatchTransfer.mockReturnValue(
    reply({ id: 'tr-r1', status: 'PENDING_ACKNOWLEDGEMENT', transferNumber: 'TR-101' } as Transfer),
  );
});

const qty = (name: string) =>
  screen.getByRole('spinbutton', { name: `Return quantity of ${name}` });

describe('returning stock to the store', () => {
  it('lists the restaurant’s MRP stock by batch and sends back what is entered', async () => {
    const { user } = renderScreen(<ReturnToStorePageClient />);

    const stock = within(await screen.findByRole('region', { name: 'Stock at Cafeteria' }));
    expect(await stock.findByText('Water bottle')).toBeInTheDocument();
    expect(stock.getByText('C-1')).toBeInTheDocument();
    expect(stock.queryByText('W-0')).toBeNull();
    expect(api.listRestaurantStock).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: 'MRP', locationId: 'rest-1' }),
    );

    await user.type(qty('Water bottle, batch W-1'), '4');
    const cart = within(screen.getByRole('region', { name: 'To return' }));
    expect(cart.getByText('Water bottle')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Return to Main Store' }));

    await waitFor(() => expect(api.dispatchTransfer).toHaveBeenCalledWith('tr-r1'));
    expect(api.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationId: 'store-1',
        destinationType: 'STORE',
        hospitalId: ppg.id,
        items: [{ batchNumber: 'W-1', expiryDate: '2099-03-01', itemId: 'item-1', sentQty: 4 }],
        sourceId: 'rest-1',
        sourceType: 'RESTAURANT',
      }),
    );
    expect(await screen.findByText('Returned to the store')).toBeInTheDocument();
    expect(qty('Water bottle, batch W-1')).toHaveValue(null);
  });

  it('will not send back more than the restaurant holds', async () => {
    const { user } = renderScreen(<ReturnToStorePageClient />);
    await screen.findByText('Water bottle');

    await user.type(qty('Chips, batch C-1'), '9');

    expect(screen.getByRole('alert')).toHaveTextContent('Only 5 of this batch at Cafeteria.');
    expect(screen.getByRole('button', { name: 'Return to Main Store' })).toBeDisabled();
  });

  it('asks for the restaurant first and loads no stock until then', async () => {
    at('/inventory/returns/new');
    const { user } = renderScreen(<ReturnToStorePageClient />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Restaurant' }),
      await screen.findByRole('option', { name: 'Cafeteria' }),
    );
    expect(api.listRestaurantStock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Water bottle')).toBeInTheDocument();
  });

  it('shows why the return was not sent', async () => {
    api.createTransfer.mockRejectedValue(new Error('Line 1: batch W-1 has only 2 left'));
    const { user } = renderScreen(<ReturnToStorePageClient />);
    await screen.findByText('Water bottle');

    await user.type(qty('Water bottle, batch W-1'), '4');
    await user.click(screen.getByRole('button', { name: 'Return to Main Store' }));

    expect(await screen.findByText('Return was not sent')).toBeInTheDocument();
    expect(screen.getByText('Line 1: batch W-1 has only 2 left')).toBeInTheDocument();
    expect(qty('Water bottle, batch W-1')).toHaveValue(4);
  });

  it('says when the return was saved but the stock is still at the restaurant', async () => {
    api.dispatchTransfer.mockRejectedValue(new Error('Stock changed, try again'));
    const { user } = renderScreen(<ReturnToStorePageClient />);
    await screen.findByText('Water bottle');

    await user.type(qty('Water bottle, batch W-1'), '4');
    await user.click(screen.getByRole('button', { name: 'Return to Main Store' }));

    expect(await screen.findByText('Saved, but not sent')).toBeInTheDocument();
    expect(
      screen.getByText(
        'TR-101 is saved as a draft and the stock is still at the restaurant. Stock changed, try again',
      ),
    ).toBeInTheDocument();
  });

  it('says so when the location has no Main Store to return to', async () => {
    api.listStores.mockReturnValue(page([]));
    renderScreen(<ReturnToStorePageClient />);

    expect(
      await screen.findByText('This location has no Main Store to return stock to.'),
    ).toBeInTheDocument();
  });
});
