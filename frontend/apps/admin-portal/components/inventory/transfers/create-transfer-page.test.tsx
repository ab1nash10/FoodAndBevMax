import { screen, waitFor, within } from '@testing-library/react';
import type { StockBalance, Transfer } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at, router } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { CreateTransferPageClient } from './create-transfer-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    createTransfer: vi.fn(),
    dispatchTransfer: vi.fn(),
    listCounters: vi.fn(),
    listKitchens: vi.fn(),
    listRestaurants: vi.fn(),
    listRestaurantStock: vi.fn(),
    listStockBalances: vi.fn(),
    listStores: vi.fn(),
    listTransferReceivers: vi.fn(),
    listTransfers: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

// The route is checked for UUIDs, as the server does.
const hospitalId = '11111111-1111-4111-8111-111111111111';
const storeId = '22222222-2222-4222-8222-222222222222';
const cafeteriaId = '33333333-3333-4333-8333-333333333333';
const operatorId = '44444444-4444-4444-8444-444444444444';
const location = { ...ppg, id: hospitalId };

const batch = (patch: Partial<StockBalance>): StockBalance =>
  ({
    availableQty: 6,
    batchNumber: 'R-OLD',
    businessDate: null,
    expiryDate: '2099-01-10',
    id: 'sb-old',
    item: { id: 'item-rice', itemCode: 'RICE', itemName: 'Rice', type: 'VEG' },
    itemId: 'item-rice',
    status: 'AVAILABLE',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...patch,
  }) as StockBalance;

// Rice in two batches: the one expiring first goes first (FEFO).
const riceStock = [
  batch({ availableQty: 10, batchNumber: 'R-NEW', expiryDate: '2099-06-30', id: 'sb-new' }),
  batch({}),
];

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/transfers/new');
  atLocation(location, [location]);
  signedIn(['TRANSFER_VIEW', 'TRANSFER_CREATE']);
  api.listStores.mockReturnValue(page([{ id: storeId, storeName: 'Main Store' }]) as never);
  api.listKitchens.mockReturnValue(page([]));
  api.listRestaurants.mockReturnValue(
    page([{ id: cafeteriaId, restaurantName: 'Cafeteria' }]) as never,
  );
  api.listStockBalances.mockReturnValue(page(riceStock));
  api.listTransfers.mockReturnValue(page([]));
  api.listTransferReceivers.mockReturnValue(
    reply([
      { employeeCode: 'E-7', id: operatorId, name: 'Ravi Kumar' },
      { employeeCode: 'E-9', id: '55555555-5555-4555-8555-555555555555', name: 'Sita Rao' },
    ]),
  );
  api.createTransfer.mockReturnValue(
    reply({ id: 'tr-9', status: 'DRAFT', transferNumber: 'TR-009' } as Transfer),
  );
  api.dispatchTransfer.mockReturnValue(
    reply({
      id: 'tr-9',
      status: 'PENDING_ACKNOWLEDGEMENT',
      transferNumber: 'TR-009',
    } as Transfer),
  );
});

type User = ReturnType<typeof renderScreen>['user'];

async function chooseStoreAndRestaurant(user: User) {
  await user.selectOptions(
    screen.getByRole('combobox', { name: /^Store/ }),
    await screen.findByRole('option', { name: 'Main Store' }),
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: /^Restaurant/ }),
    await screen.findByRole('option', { name: 'Cafeteria' }),
  );
}

async function chooseRoute(user: User) {
  await chooseStoreAndRestaurant(user);
  await user.selectOptions(
    screen.getByRole('combobox', { name: /^Operator/ }),
    await screen.findByRole('option', { name: 'Ravi Kumar · E-7' }),
  );
  await user.click(screen.getByRole('button', { name: 'Next: items' }));
}

async function addRice(user: User, quantity: string) {
  await user.type(screen.getByRole('combobox', { name: 'Add an item' }), 'ric');
  await user.click(await screen.findByRole('option', { name: /Rice/ }));
  await user.type(screen.getByRole('spinbutton', { name: 'Send quantity for Rice' }), quantity);
}

describe('a new transfer', () => {
  it('needs where the stock comes from and goes to before items', async () => {
    const { user } = renderScreen(<CreateTransferPageClient />);

    await user.click(screen.getByRole('button', { name: 'Next: items' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Select where the stock goes.');
    expect(screen.getByText('Select where the stock comes from.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Where from and to' })).toBeInTheDocument();
  });

  it('asks for the operators of the location only once the restaurant is chosen', async () => {
    const { user } = renderScreen(<CreateTransferPageClient />);
    await screen.findByRole('option', { name: 'Main Store' });

    expect(screen.getByRole('combobox', { name: /^Operator/ })).toBeDisabled();
    expect(api.listTransferReceivers).not.toHaveBeenCalled();

    await chooseStoreAndRestaurant(user);

    expect(await screen.findByRole('option', { name: 'Sita Rao · E-9' })).toBeInTheDocument();
    expect(api.listTransferReceivers).toHaveBeenCalledWith(hospitalId);
  });

  it('needs the operator who acknowledges stock sent from the store to a restaurant', async () => {
    const { user } = renderScreen(<CreateTransferPageClient />);
    await chooseStoreAndRestaurant(user);

    await user.click(screen.getByRole('button', { name: 'Next: items' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Choose the operator who acknowledges it.');
    expect(screen.getByRole('region', { name: 'Where from and to' })).toBeInTheDocument();
  });

  it('names no operator for a restaurant passing leftovers on', () => {
    signedIn(['RESTAURANT_TRANSFER_SEND']);
    renderScreen(<CreateTransferPageClient />);

    expect(screen.queryByRole('combobox', { name: /^Operator/ })).toBeNull();
  });

  it('lists only the items the store has, and sends the earliest expiry first', async () => {
    const { user } = renderScreen(<CreateTransferPageClient />);
    await chooseRoute(user);
    await addRice(user, '8');

    expect(api.listStockBalances).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: storeId, locationType: 'STORE' }),
    );
    // 6 from R-OLD, the other 2 from R-NEW.
    const items = within(screen.getByRole('region', { name: 'Items' }));
    expect(items.getByText(/R-OLD · exp .* \+1 more/)).toBeInTheDocument();
    expect(items.getByText('16')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('All lines are within available stock.');
  });

  it('will not send more than the store holds', async () => {
    const { user } = renderScreen(<CreateTransferPageClient />);
    await chooseRoute(user);
    await addRice(user, '20');

    expect(screen.getByRole('alert')).toHaveTextContent('Only 16 available. Reduce the quantity.');
    await user.click(screen.getByRole('button', { name: 'Next: check and send' }));
    expect(screen.getAllByRole('alert')[1]).toHaveTextContent('Available quantity for Rice is 16.');
    expect(api.createTransfer).not.toHaveBeenCalled();
  });

  it('creates the transfer batch by batch and submits it for acknowledgement', async () => {
    const { user } = renderScreen(<CreateTransferPageClient />);
    await chooseRoute(user);
    await addRice(user, '8');
    await user.click(screen.getByRole('button', { name: 'Next: check and send' }));

    const review = within(screen.getByRole('region', { name: 'Check and send' }));
    expect(review.getByText('Main Store')).toBeInTheDocument();
    expect(review.getByText('Cafeteria')).toBeInTheDocument();
    expect(review.getByText('Ravi Kumar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit for acknowledgement' }));

    await waitFor(() => expect(api.dispatchTransfer).toHaveBeenCalledWith('tr-9'));
    expect(api.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationId: cafeteriaId,
        destinationType: 'RESTAURANT',
        hospitalId,
        items: [
          expect.objectContaining({ batchNumber: 'R-OLD', expiryDate: '2099-01-10', sentQty: 6 }),
          expect.objectContaining({ batchNumber: 'R-NEW', expiryDate: '2099-06-30', sentQty: 2 }),
        ],
        receiverId: operatorId,
        sourceId: storeId,
        sourceType: 'STORE',
      }),
    );
    expect(router.push).toHaveBeenCalledWith('/inventory/transfers?id=tr-9');
    expect(await screen.findByText('Submitted for acknowledgement')).toBeInTheDocument();
  });

  it('sends from the batch chosen instead of FEFO', async () => {
    const { user } = renderScreen(<CreateTransferPageClient />);
    await chooseRoute(user);
    await addRice(user, '3');

    await user.click(screen.getByRole('button', { name: 'Change batch for Rice' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Batch for Rice' }), 'sb-new');
    await user.click(screen.getByRole('button', { name: 'Next: check and send' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(api.createTransfer).toHaveBeenCalled());
    expect(api.createTransfer.mock.calls[0]![0].items).toEqual([
      expect.objectContaining({ batchNumber: 'R-NEW', sentQty: 3 }),
    ]);
    // A draft is only saved, not sent.
    expect(api.dispatchTransfer).not.toHaveBeenCalled();
  });

  it('keeps the draft and says why when it could not be submitted', async () => {
    api.dispatchTransfer.mockRejectedValue(new Error('Rice ran out at Main Store'));
    const { user } = renderScreen(<CreateTransferPageClient />);
    await chooseRoute(user);
    await addRice(user, '2');
    await user.click(screen.getByRole('button', { name: 'Next: check and send' }));

    await user.click(screen.getByRole('button', { name: 'Submit for acknowledgement' }));

    expect(await screen.findByText('Saved, but not submitted')).toBeInTheDocument();
    expect(
      screen.getByText('TR-009 is saved as a draft. Rice ran out at Main Store'),
    ).toBeInTheDocument();
  });

  it('shows why the transfer was not saved', async () => {
    api.createTransfer.mockRejectedValue(new Error('Cafeteria is closed'));
    const { user } = renderScreen(<CreateTransferPageClient />);
    await chooseRoute(user);
    await addRice(user, '2');
    await user.click(screen.getByRole('button', { name: 'Next: check and send' }));

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Cafeteria is closed')).toBeInTheDocument();
    expect(screen.getByText('Transfer was not saved')).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('lets restaurant staff send only from a restaurant', () => {
    signedIn(['RESTAURANT_TRANSFER_SEND']);
    renderScreen(<CreateTransferPageClient />);

    const sources = within(screen.getByRole('group', { name: 'Source type' }));
    expect(sources.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Restaurant',
    ]);
    expect(sources.getByRole('button', { name: 'Restaurant' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('starts from the restaurant and quantities in a Send from store link', async () => {
    at(
      '/inventory/transfers/new',
      `hospital=${hospitalId}&to=RESTAURANT:${cafeteriaId}&items=item-rice:5`,
    );
    const { user } = renderScreen(<CreateTransferPageClient />);

    // The location's only store is picked for the person.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /^Store/ })).toHaveValue(storeId),
    );
    expect(screen.getByRole('combobox', { name: /^Restaurant/ })).toHaveValue(cafeteriaId);
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^Operator/ }),
      await screen.findByRole('option', { name: 'Ravi Kumar · E-7' }),
    );
    await user.click(screen.getByRole('button', { name: 'Next: items' }));
    expect(await screen.findByRole('spinbutton', { name: 'Send quantity for Rice' })).toHaveValue(
      5,
    );
  });
});
