import type {
  Hospital,
  Item,
  ItemCategory,
  Kitchen,
  KitchenItem,
  KitchenItemListQuery,
} from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import type * as LocationModule from '@/components/location-context';
import { page, renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { atLocation, ppg } from '@/test/location';
import { KitchenItemsPageClient } from './kitchen-items-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', async () => {
  const { getLocationTitle } = await vi.importActual<typeof LocationModule>(
    '@/components/location-context',
  );
  return { ...(await import('@/test/location')), getLocationTitle };
});
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  createKitchenItem: vi.fn<OrganizationApi['createKitchenItem']>(),
  listHospitals: vi.fn<OrganizationApi['listHospitals']>(),
  listItemCategories: vi.fn<OrganizationApi['listItemCategories']>(),
  listItems: vi.fn<OrganizationApi['listItems']>(),
  listKitchenItems: vi.fn<OrganizationApi['listKitchenItems']>(),
  listKitchens: vi.fn<OrganizationApi['listKitchens']>(),
  updateKitchenItem: vi.fn<OrganizationApi['updateKitchenItem']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
}));

// The form checks ids are UUIDs, as the server's are.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mainKitchen = {
  hospital: ppg,
  id: id(1),
  kitchenCode: 'KIT01',
  kitchenName: 'Main Kitchen',
} as Kitchen;
const counterKitchen = {
  hospital: ppg,
  id: id(2),
  kitchenCode: 'KIT02',
  kitchenName: 'Counter Kitchen',
} as Kitchen;
const tandoor = {
  hospital: ppg,
  id: id(3),
  kitchenCode: 'KIT03',
  kitchenName: 'Tandoor',
} as Kitchen;
const thali = {
  id: id(11),
  itemCode: 'ITM0001',
  itemName: 'Veg Thali',
  itemType: 'READYMADE',
  type: 'VEG',
} as Item;
const dosa = {
  id: id(12),
  itemCode: 'ITM0002',
  itemName: 'Masala Dosa',
  itemType: null,
  type: 'VEG',
} as Item;
const chips = {
  id: id(13),
  itemCode: 'ITM0003',
  itemName: 'Potato Chips',
  itemType: 'MRP',
  type: 'VEG',
} as Item;
const meals = { categoryName: 'Meals', id: id(21), isActive: true } as ItemCategory;
const snacks = { categoryName: 'Snacks', id: id(22), isActive: true } as ItemCategory;

const mapping = (patch: Partial<KitchenItem> = {}): KitchenItem => ({
  category: meals,
  categoryId: meals.id,
  createdAt: '2026-10-01T00:00:00Z',
  deletedAt: null,
  id: id(31),
  isActive: true,
  item: thali,
  itemId: thali.id,
  kitchen: { ...mainKitchen, isActive: true },
  kitchenId: mainKitchen.id,
  updatedAt: '2026-11-01T00:00:00Z',
  ...patch,
});

const listQueries = () =>
  vi
    .mocked(organizationApi.listKitchenItems)
    .mock.calls.map(([query]) => query)
    .filter((query) => !query?.itemId);
const lastListQuery = () => listQueries().at(-1);

function serve(mappings: KitchenItem[], taken: KitchenItem[] = []) {
  organizationApi.listKitchenItems.mockImplementation((query?: KitchenItemListQuery) =>
    query?.itemId ? page(taken) : page(mappings),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/masters/item-mapping?tab=kitchen');
  atLocation(ppg);
  signedIn(['KITCHEN_ITEM_VIEW', 'KITCHEN_ITEM_CREATE', 'KITCHEN_ITEM_UPDATE', 'ITEM_VIEW']);
  serve([mapping()]);
  organizationApi.listHospitals.mockReturnValue(page([ppg as Hospital]));
  organizationApi.listKitchens.mockReturnValue(page([mainKitchen, counterKitchen, tandoor]));
  organizationApi.listItems.mockReturnValue(page([thali, dosa, chips]));
  organizationApi.listItemCategories.mockReturnValue(page([meals, snacks]));
  organizationApi.createKitchenItem.mockImplementation(() => reply(mapping()));
  organizationApi.updateKitchenItem.mockImplementation(() => reply(mapping()));
});

async function openCreate(user: ReturnType<typeof renderScreen>['user']) {
  await user.click(screen.getByRole('button', { name: 'Map item' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Map item to kitchen' }));
  await dialog.findByRole('option', { name: 'Main Kitchen (KIT01)' });
  await dialog.findByRole('option', { name: /Masala Dosa/ });
  return dialog;
}

describe('Kitchen items', () => {
  it('lists the mappings at the location with type, kitchen and category', async () => {
    renderScreen(<KitchenItemsPageClient />);

    const row = within(await screen.findByRole('row', { name: /Veg Thali/ }));
    expect(row.getByRole('link', { name: 'Veg Thali' })).toHaveAttribute(
      'href',
      `/masters/items?id=${thali.id}`,
    );
    expect(row.getByText('Readymade')).toBeInTheDocument();
    expect(row.getByText('Main Kitchen')).toBeInTheDocument();
    expect(row.getByText('Meals')).toBeInTheDocument();
    expect(row.getByRole('switch', { name: 'Veg Thali in Main Kitchen active' })).toBeChecked();
    expect(lastListQuery()).toMatchObject({ hospitalId: 'h-ppg', page: 1, sortBy: 'createdAt' });
  });

  it('says there are none at the location', async () => {
    serve([]);
    renderScreen(<KitchenItemsPageClient />);

    expect(await screen.findByText('No kitchen item mappings at Patparganj')).toBeInTheDocument();
  });

  it('shows why the list could not be loaded', async () => {
    organizationApi.listKitchenItems.mockRejectedValue(
      new ApiClientError(500, 'Mappings are unavailable'),
    );
    renderScreen(<KitchenItemsPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Mappings are unavailable');
  });

  it('filters by type and kitchen, the location fixed by the header', async () => {
    const { user } = renderScreen(<KitchenItemsPageClient />);
    await screen.findByRole('row', { name: /Veg Thali/ });

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('combobox', { name: /^Location/ })).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: /^Type/ }), 'LIVE');
    await waitFor(() =>
      expect(lastListQuery()).toMatchObject({ hospitalId: 'h-ppg', itemType: 'LIVE' }),
    );

    await user.click(screen.getByRole('button', { name: /Filters/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: /^Kitchen/ }), tandoor.id);
    await waitFor(() =>
      expect(lastListQuery()).toMatchObject({ itemType: 'LIVE', kitchenId: tandoor.id }),
    );
    // Each filter in use is named under the toolbar.
    expect(screen.getByText('Tandoor', { selector: '*:not(option)' })).toBeInTheDocument();
  });

  describe('mapping an item', () => {
    it('puts a Readymade item in the Main Kitchen, the only kitchen allowed', async () => {
      const { user } = renderScreen(<KitchenItemsPageClient />);
      const dialog = await openCreate(user);

      expect(dialog.getByRole('combobox', { name: /^Location/ })).toBeDisabled();
      expect(dialog.getByRole('radio', { name: /Readymade/ })).toBeChecked();
      expect(dialog.getByRole('combobox', { name: /^Kitchen/ })).toHaveValue(mainKitchen.id);
      expect(dialog.getByRole('option', { name: 'Tandoor (KIT03)' })).toBeDisabled();

      await user.selectOptions(dialog.getByRole('combobox', { name: /^Item/ }), dosa.id);
      expect(dialog.getByText('First mapping: the item becomes Readymade.')).toBeInTheDocument();
      await user.selectOptions(dialog.getByRole('combobox', { name: /^Category/ }), snacks.id);
      await user.click(dialog.getByRole('button', { name: 'Create kitchen item' }));

      await waitFor(() =>
        expect(organizationApi.createKitchenItem).toHaveBeenCalledWith({
          categoryId: snacks.id,
          isActive: true,
          itemId: dosa.id,
          itemType: 'READYMADE',
          kitchenId: mainKitchen.id,
        }),
      );
    });

    it('moves a Live item to the counter kitchen', async () => {
      const { user } = renderScreen(<KitchenItemsPageClient />);
      const dialog = await openCreate(user);

      await user.click(dialog.getByRole('radio', { name: /Live/ }));

      expect(dialog.getByRole('combobox', { name: /^Kitchen/ })).toHaveValue(counterKitchen.id);
      expect(dialog.getByRole('option', { name: 'Tandoor (KIT03)' })).toBeEnabled();
    });

    it('greys out an item already packaged for stores', async () => {
      const { user } = renderScreen(<KitchenItemsPageClient />);
      const dialog = await openCreate(user);

      expect(
        dialog.getByRole('option', { name: 'Potato Chips (ITM0003) - packaged, mapped to stores' }),
      ).toBeDisabled();
      expect(
        dialog.getByRole('option', { name: 'Masala Dosa (ITM0002) - not mapped yet' }),
      ).toBeEnabled();
    });

    it('greys out a category the kitchen already has the item under', async () => {
      serve([mapping()], [mapping()]);
      const { user } = renderScreen(<KitchenItemsPageClient />);
      const dialog = await openCreate(user);

      await user.selectOptions(dialog.getByRole('combobox', { name: /^Item/ }), thali.id);

      expect(await dialog.findByRole('option', { name: 'Meals (already mapped)' })).toBeDisabled();
    });

    it('asks for an item and a category before sending', async () => {
      const { user } = renderScreen(<KitchenItemsPageClient />);
      const dialog = await openCreate(user);

      await user.click(dialog.getByRole('button', { name: 'Create kitchen item' }));

      expect(await dialog.findByText('Select an item.')).toBeInTheDocument();
      expect(dialog.getByText('Select a category.')).toBeInTheDocument();
      expect(organizationApi.createKitchenItem).not.toHaveBeenCalled();
    });

    it('says why the mapping was not created', async () => {
      organizationApi.createKitchenItem.mockRejectedValue(
        new ApiClientError(409, 'Already mapped'),
      );
      const { user } = renderScreen(<KitchenItemsPageClient />);
      const dialog = await openCreate(user);
      await user.selectOptions(dialog.getByRole('combobox', { name: /^Item/ }), dosa.id);
      await user.selectOptions(dialog.getByRole('combobox', { name: /^Category/ }), snacks.id);

      await user.click(dialog.getByRole('button', { name: 'Create kitchen item' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Kitchen item was not created');
      expect(screen.getByRole('alert')).toHaveTextContent('Already mapped');
    });

    it('says when the location has no kitchen to map to', async () => {
      organizationApi.listKitchens.mockReturnValue(page([]));
      const { user } = renderScreen(<KitchenItemsPageClient />);

      await user.click(screen.getByRole('button', { name: 'Map item' }));

      expect(await screen.findByText(/Patparganj has no kitchen yet/)).toBeInTheDocument();
    });
  });

  it('edits a mapping in its own form', async () => {
    const { user } = renderScreen(<KitchenItemsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Edit Veg Thali in Main Kitchen' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit kitchen item' }));
    await dialog.findByRole('option', { name: 'Snacks' });
    await user.selectOptions(dialog.getByRole('combobox', { name: /^Category/ }), snacks.id);
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(organizationApi.updateKitchenItem).toHaveBeenCalledWith(id(31), {
        categoryId: snacks.id,
        isActive: true,
        itemId: thali.id,
        itemType: 'READYMADE',
        kitchenId: mainKitchen.id,
      }),
    );
  });

  it('deactivates a mapping once confirmed', async () => {
    const { user } = renderScreen(<KitchenItemsPageClient />);

    await user.click(
      await screen.findByRole('switch', { name: 'Veg Thali in Main Kitchen active' }),
    );
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    expect(organizationApi.updateKitchenItem).toHaveBeenCalledWith(id(31), { isActive: false });
  });

  it('gives a view-only user nothing to change', async () => {
    signedIn(['KITCHEN_ITEM_VIEW']);
    renderScreen(<KitchenItemsPageClient />);
    await screen.findByRole('row', { name: /Veg Thali/ });

    // The server refuses these without KITCHEN_ITEM_CREATE / KITCHEN_ITEM_UPDATE.
    expect(screen.queryByRole('button', { name: 'Map item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Veg Thali in Main Kitchen active' })).toBeDisabled();
  });
});
