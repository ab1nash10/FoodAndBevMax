import { screen, waitFor, within } from '@testing-library/react';
import type { KitchenProduction } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at, router } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { ProductionEntryPageClient } from './production-entry-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    cancelKitchenProduction: vi.fn(),
    createKitchenProduction: vi.fn(),
    getKitchenProduction: vi.fn(),
    listKitchenItems: vi.fn(),
    listKitchenProductions: vi.fn(),
    listKitchens: vi.fn(),
    postKitchenProduction: vi.fn(),
    updateKitchenProduction: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

// The form checks ids are UUIDs, as the server does.
const hospitalId = '11111111-1111-4111-8111-111111111111';
const kitchenId = '22222222-2222-4222-8222-222222222222';
const dalId = '33333333-3333-4333-8333-333333333333';
const location = { ...ppg, id: hospitalId };

const mapping = (itemId: string, itemName: string, itemType = 'READYMADE') => ({
  id: `map-${itemId}`,
  item: { id: itemId, itemCode: itemName.toUpperCase(), itemName, itemType },
  itemId,
});

const saved = (patch: Partial<KitchenProduction> = {}): KitchenProduction =>
  ({
    businessDate: '2026-11-18',
    chef: { id: 'u-1', name: 'Ravi Kumar' },
    createdAt: '2026-11-18T05:00:00.000Z',
    hospital: location,
    hospitalId,
    id: 'kp-1',
    kitchen: { id: kitchenId, kitchenCode: 'MK', kitchenName: 'Main Kitchen' },
    kitchenId,
    lines: [
      {
        acceptedQty: 9,
        item: { id: dalId, itemCode: 'DAL', itemName: 'Dal' },
        itemId: dalId,
        producedQty: 10,
        remarks: null,
        wastageQty: 1,
      },
    ],
    productionDate: '2026-11-18T05:00:00.000Z',
    productionNumber: 'KP-001',
    remarks: null,
    status: 'DRAFT',
    updatedAt: '2026-11-18T05:00:00.000Z',
    ...patch,
  }) as KitchenProduction;

beforeEach(() => {
  vi.clearAllMocks();
  at('/kitchen/productions/new');
  atLocation(location, [location]);
  signedIn(['KITCHEN_PRODUCTION_VIEW', 'KITCHEN_PRODUCTION_CREATE', 'KITCHEN_PRODUCTION_POST']);
  api.listKitchens.mockReturnValue(page([{ id: kitchenId, kitchenName: 'Main Kitchen' }]) as never);
  // A store item mapped to the kitchen is not produced there, so it is not offered.
  api.listKitchenItems.mockReturnValue(
    page([mapping(dalId, 'Dal'), mapping('item-water', 'Water', 'MRP')]) as never,
  );
  api.listKitchenProductions.mockReturnValue(page([]));
  api.createKitchenProduction.mockReturnValue(reply(saved()));
  api.postKitchenProduction.mockReturnValue(reply(saved({ status: 'POSTED' })));
});

type User = ReturnType<typeof renderScreen>['user'];

async function recordDal(user: User, produced: string, wasted: string) {
  await user.selectOptions(
    screen.getByRole('combobox', { name: /^Kitchen/ }),
    await screen.findByRole('option', { name: 'Main Kitchen' }),
  );
  await user.click(screen.getByRole('button', { name: 'Continue to items' }));
  await user.click(await screen.findByRole('button', { name: 'Dal' }));
  await user.type(screen.getByRole('spinbutton', { name: 'Produced quantity for Dal' }), produced);
  if (wasted) await user.type(screen.getByRole('spinbutton', { name: 'Wastage for Dal' }), wasted);
}

describe('recording a production', () => {
  it('needs a kitchen before the items', async () => {
    const { user } = renderScreen(<ProductionEntryPageClient />);

    await user.click(screen.getByRole('button', { name: 'Continue to items' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Select a kitchen.');
    expect(screen.getByRole('region', { name: 'Kitchen and time' })).toBeInTheDocument();
  });

  it('offers only the kitchen’s ready-made items', async () => {
    const { user } = renderScreen(<ProductionEntryPageClient />);
    await recordDal(user, '10', '');

    expect(screen.queryByRole('button', { name: 'Water' })).toBeNull();
    expect(api.listKitchenItems).toHaveBeenCalledWith(expect.objectContaining({ kitchenId }));
  });

  it('works out the accepted quantity and flags wastage over the limit', async () => {
    const { user } = renderScreen(<ProductionEntryPageClient />);
    await recordDal(user, '10', '1');

    const lines = within(screen.getByRole('region', { name: /Produced items/ }));
    const row = lines.getByRole('spinbutton', { name: 'Produced quantity for Dal' }).closest('tr')!;
    expect(within(row).getByText('9')).toBeInTheDocument();
    expect(within(row).getByText('10.0%')).toBeInTheDocument();
    expect(lines.getByText('Above 5% limit').nextElementSibling).toHaveTextContent('1');
  });

  it('will not take more wastage than was produced', async () => {
    const { user } = renderScreen(<ProductionEntryPageClient />);
    await recordDal(user, '4', '6');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Wastage cannot be more than what was produced.',
    );
    await user.click(screen.getByRole('button', { name: 'Continue to check' }));
    expect(screen.getAllByRole('alert').at(-1)).toHaveTextContent(
      'Wastage quantity cannot exceed produced quantity.',
    );
  });

  it('needs at least one item before the check', async () => {
    const { user } = renderScreen(<ProductionEntryPageClient />);
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^Kitchen/ }),
      await screen.findByRole('option', { name: 'Main Kitchen' }),
    );
    await user.click(screen.getByRole('button', { name: 'Continue to items' }));

    await user.click(screen.getByRole('button', { name: 'Continue to check' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one production line.');
  });

  it('creates the production and posts it to kitchen stock', async () => {
    const { user } = renderScreen(<ProductionEntryPageClient />);
    await recordDal(user, '10', '1');
    await user.click(screen.getByRole('button', { name: 'Continue to check' }));

    await user.click(screen.getByRole('button', { name: 'Post to kitchen stock' }));

    await waitFor(() => expect(api.postKitchenProduction).toHaveBeenCalledWith('kp-1'));
    expect(api.createKitchenProduction).toHaveBeenCalledWith(
      expect.objectContaining({
        hospitalId,
        items: [
          { acceptedQty: 9, itemId: dalId, producedQty: 10, remarks: undefined, wastageQty: 1 },
        ],
        kitchenId,
      }),
    );
    expect(router.replace).toHaveBeenCalledWith('/kitchen/productions?id=kp-1');
    expect(await screen.findByText('Posted to kitchen stock')).toBeInTheDocument();
  });

  it('shows why the production was not saved', async () => {
    api.createKitchenProduction.mockRejectedValue(new Error('Dal is not mapped any more'));
    const { user } = renderScreen(<ProductionEntryPageClient />);
    await recordDal(user, '10', '');
    await user.click(screen.getByRole('button', { name: 'Continue to check' }));

    await user.click(screen.getByRole('button', { name: 'Post to kitchen stock' }));

    expect(await screen.findByText('Dal is not mapped any more')).toBeInTheDocument();
    expect(screen.getByText('Production was not saved')).toBeInTheDocument();
  });

  it('can be saved as a draft but not posted without permission to post', async () => {
    signedIn(['KITCHEN_PRODUCTION_VIEW', 'KITCHEN_PRODUCTION_CREATE']);
    const { user } = renderScreen(<ProductionEntryPageClient />);
    await recordDal(user, '10', '');
    await user.click(screen.getByRole('button', { name: 'Continue to check' }));

    expect(screen.queryByRole('button', { name: 'Post to kitchen stock' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(api.createKitchenProduction).toHaveBeenCalled());
    expect(api.postKitchenProduction).not.toHaveBeenCalled();
  });
});

describe('an existing production', () => {
  beforeEach(() => {
    at('/kitchen/productions', 'id=kp-1');
  });

  it('opens a draft at the check, and saves changes to it', async () => {
    signedIn(['KITCHEN_PRODUCTION_VIEW', 'KITCHEN_PRODUCTION_UPDATE']);
    api.getKitchenProduction.mockReturnValue(reply(saved()));
    api.updateKitchenProduction.mockReturnValue(reply(saved()));
    const { user } = renderScreen(<ProductionEntryPageClient productionId="kp-1" />);

    expect(await screen.findByRole('heading', { name: 'KP-001', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /What was made/ })).toHaveTextContent('Dal');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() =>
      expect(api.updateKitchenProduction).toHaveBeenCalledWith(
        'kp-1',
        expect.objectContaining({ items: [expect.objectContaining({ producedQty: 10 })] }),
      ),
    );
    // An existing production stays where it is.
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('offers Post on a draft only to someone who may also save it (posting saves it first)', async () => {
    signedIn(['KITCHEN_PRODUCTION_VIEW', 'KITCHEN_PRODUCTION_POST']);
    api.getKitchenProduction.mockReturnValue(reply(saved()));
    const { unmount } = renderScreen(<ProductionEntryPageClient productionId="kp-1" />);

    expect(await screen.findByRole('heading', { name: 'KP-001', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post to kitchen stock' })).toBeNull();
    unmount();

    signedIn(['KITCHEN_PRODUCTION_VIEW', 'KITCHEN_PRODUCTION_POST', 'KITCHEN_PRODUCTION_UPDATE']);
    renderScreen(<ProductionEntryPageClient productionId="kp-1" />);
    expect(
      await screen.findByRole('button', { name: 'Post to kitchen stock' }),
    ).toBeInTheDocument();
  });

  it('cancels a draft once confirmed', async () => {
    signedIn(['KITCHEN_PRODUCTION_VIEW', 'KITCHEN_PRODUCTION_UPDATE']);
    api.getKitchenProduction.mockReturnValue(reply(saved()));
    api.cancelKitchenProduction.mockReturnValue(reply(saved({ status: 'CANCELLED' })));
    const { user } = renderScreen(<ProductionEntryPageClient productionId="kp-1" />);

    await user.click(await screen.findByRole('button', { name: 'Cancel production' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Cancel KP-001?' })).getByRole('button', {
        name: 'Cancel production',
      }),
    );

    await waitFor(() => expect(api.cancelKitchenProduction).toHaveBeenCalledWith('kp-1'));
  });

  it('shows a posted production read only', async () => {
    signedIn(['KITCHEN_PRODUCTION_VIEW']);
    api.getKitchenProduction.mockReturnValue(reply(saved({ status: 'POSTED' })));
    renderScreen(<ProductionEntryPageClient productionId="kp-1" />);

    expect(
      await screen.findByText(/Posted: the accepted quantities are in Main Kitchen stock/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post to kitchen stock' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    // Someone who may only view productions is not offered a new one.
    expect(screen.queryByRole('link', { name: 'New production' })).toBeNull();
  });

  it('says it was not found when it cannot be loaded', async () => {
    api.getKitchenProduction.mockRejectedValue(new Error('Not found'));
    renderScreen(<ProductionEntryPageClient productionId="kp-1" />);

    expect(await screen.findByText('Production not found')).toBeInTheDocument();
  });
});
