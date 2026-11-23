import type {
  Item,
  ItemCategory,
  KitchenItem,
  Restaurant,
  RestaurantMenu,
  RestaurantMenuListQuery,
  StoreItem,
} from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CsvModule from '@/lib/csv';
import type * as ApiModule from '@/lib/api';
import type * as LocationModule from '@/components/location-context';
import { page, renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { atLocation, ppg, saket } from '@/test/location';
import { downloadCsv } from '@/lib/csv';
import { RestaurantMenusPageClient } from './restaurant-menus-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', async () => {
  const { getLocationTitle } = await vi.importActual<typeof LocationModule>(
    '@/components/location-context',
  );
  return { ...(await import('@/test/location')), getLocationTitle };
});
vi.mock('@/lib/csv', async (importOriginal) => ({
  ...(await importOriginal<typeof CsvModule>()),
  downloadCsv: vi.fn(),
}));
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  createRestaurantMenu: vi.fn<OrganizationApi['createRestaurantMenu']>(),
  importRestaurantMenus: vi.fn<OrganizationApi['importRestaurantMenus']>(),
  listItemCategories: vi.fn<OrganizationApi['listItemCategories']>(),
  listItems: vi.fn<OrganizationApi['listItems']>(),
  listKitchenItems: vi.fn<OrganizationApi['listKitchenItems']>(),
  listRestaurantMenus: vi.fn<OrganizationApi['listRestaurantMenus']>(),
  listRestaurants: vi.fn<OrganizationApi['listRestaurants']>(),
  listStoreItems: vi.fn<OrganizationApi['listStoreItems']>(),
  updateRestaurantMenu: vi.fn<OrganizationApi['updateRestaurantMenu']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
}));

// The form checks ids are UUIDs, as the server's are.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cafe = {
  hospital: ppg,
  hospitalId: 'h-ppg',
  id: id(1),
  restaurantCode: 'RES01',
  restaurantName: 'Cafe Max',
} as Restaurant;
const dosa = {
  id: id(11),
  itemCode: 'ITM0002',
  itemName: 'Masala Dosa',
  itemType: 'READYMADE',
  preparationTimeMinutes: 12,
  type: 'VEG',
} as Item;
const chips = {
  id: id(12),
  itemCode: 'ITM0003',
  itemName: 'Potato Chips',
  itemType: 'MRP',
  preparationTimeMinutes: null,
  type: 'VEG',
} as Item;
const snacks = { categoryName: 'Snacks', id: id(21), isActive: true } as ItemCategory;
const packaged = { categoryName: 'Packaged', id: id(22), isActive: true } as ItemCategory;
const mainKitchen = {
  id: id(31),
  isActive: true,
  kitchenCode: 'KIT01',
  kitchenName: 'Main Kitchen',
};
const mainStore = { id: id(32), isActive: true, storeCode: 'STR01', storeName: 'Main Store' };

const dosaMenu: RestaurantMenu = {
  accompaniments: null,
  addOn: null,
  availableFrom: '07:00',
  availableTo: '10:30',
  category: snacks,
  categoryId: snacks.id,
  createdAt: '2026-10-01T00:00:00Z',
  daysOfWeek: ['MONDAY', 'WEDNESDAY'],
  deletedAt: null,
  displayOrder: 1,
  gstPercent: 5,
  hospitalId: 'h-ppg',
  id: id(51),
  isActive: true,
  isAvailable: true,
  isDiscountable: false,
  isFeatured: false,
  isGstInclusive: false,
  item: dosa,
  itemId: dosa.id,
  kitchen: mainKitchen,
  kitchenId: mainKitchen.id,
  menuItemCode: 'RMI0001',
  preparationTimeMinutes: 12,
  price: 80,
  restaurant: { ...cafe, isActive: true },
  restaurantId: cafe.id,
  roomPrice: null,
  serveAt: 'BOTH',
  serves: 1,
  store: null,
  storeId: null,
  subCode: null,
  updatedAt: '2026-11-01T00:00:00Z',
};

function serveMenus(menus: RestaurantMenu[]) {
  organizationApi.listRestaurantMenus.mockImplementation((query?: RestaurantMenuListQuery) =>
    query?.limit === 0
      ? reply({
          items: [],
          meta: { limit: 0, page: 1, total: query.isAvailable === false ? 0 : 1, totalPages: 1 },
        })
      : page(menus),
  );
}

/** The main list's requests: not the counts, not the form's own list of the restaurant's items. */
const listQueries = () =>
  vi
    .mocked(organizationApi.listRestaurantMenus)
    .mock.calls.map(([query]) => query)
    .filter((query) => query?.limit !== 0 && query?.page);
const lastListQuery = () => listQueries().at(-1);
const goTo = (url: string) => act(() => window.history.replaceState(null, '', url));

beforeEach(() => {
  vi.clearAllMocks();
  goTo('/masters/restaurant-menus');
  atLocation(ppg);
  signedIn(['RESTAURANT_MENU_VIEW', 'RESTAURANT_MENU_CREATE', 'RESTAURANT_MENU_UPDATE']);
  serveMenus([dosaMenu]);
  organizationApi.listRestaurants.mockReturnValue(page([cafe]));
  organizationApi.listItems.mockReturnValue(page([dosa, chips]));
  organizationApi.listItemCategories.mockReturnValue(page([snacks, packaged]));
  organizationApi.listKitchenItems.mockReturnValue(
    page([
      {
        category: snacks,
        item: dosa,
        itemId: dosa.id,
        kitchen: mainKitchen,
        kitchenId: mainKitchen.id,
      } as unknown as KitchenItem,
    ]),
  );
  organizationApi.listStoreItems.mockReturnValue(
    page([
      {
        category: packaged,
        item: chips,
        itemId: chips.id,
        store: mainStore,
        storeId: mainStore.id,
      } as unknown as StoreItem,
    ]),
  );
  organizationApi.createRestaurantMenu.mockImplementation(() => reply(dosaMenu));
  organizationApi.updateRestaurantMenu.mockImplementation(() => reply(dosaMenu));
});

async function openNew(user: ReturnType<typeof renderScreen>['user']) {
  await user.click(await screen.findByRole('button', { name: 'New menu item' }));
  const dialog = within(screen.getByRole('dialog', { name: 'New Menu Item' }));
  await user.selectOptions(await dialog.findByRole('combobox', { name: /^Restaurant/ }), cafe.id);
  await dialog.findByRole('option', { name: 'Potato Chips - Packaged · Main Store' });
  return dialog;
}

describe('Restaurant menus', () => {
  it('lists what each restaurant sells, from where, when and at what price', async () => {
    renderScreen(<RestaurantMenusPageClient />);

    const row = within(await screen.findByRole('row', { name: /Masala Dosa/ }));
    expect(row.getByText('RMI0001')).toBeInTheDocument();
    expect(row.getByText('Cafe Max')).toBeInTheDocument();
    expect(row.getByText('Main Kitchen')).toBeInTheDocument();
    expect(row.getByText('07:00 – 10:30')).toBeInTheDocument();
    expect(row.getByText('Mon, Wed')).toBeInTheDocument();
    expect(row.getByText(/^₹80(\.00)?$/)).toBeInTheDocument();
    // Served in rooms too, but with no room price yet.
    expect(row.getByText('Price not set')).toBeInTheDocument();
    expect(row.getByRole('switch', { name: 'Masala Dosa in Cafe Max available' })).toBeChecked();
    expect(lastListQuery()).toMatchObject({ hospitalId: 'h-ppg', page: 1, sortBy: 'displayOrder' });
  });

  it('says there are none at the location', async () => {
    serveMenus([]);
    renderScreen(<RestaurantMenusPageClient />);

    expect(await screen.findByText('No menu items at Patparganj')).toBeInTheDocument();
  });

  it('says when the location has no restaurant to put a menu on', async () => {
    organizationApi.listRestaurants.mockReturnValue(page([]));
    renderScreen(<RestaurantMenusPageClient />);

    expect(await screen.findByText(/Patparganj has no restaurant yet/)).toBeInTheDocument();
  });

  it('shows why the menu could not be loaded', async () => {
    organizationApi.listRestaurantMenus.mockRejectedValue(
      new ApiClientError(500, 'Menus are unavailable'),
    );
    renderScreen(<RestaurantMenusPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Menus are unavailable');
  });

  it('keeps the page from the link when it opens', async () => {
    goTo('/masters/restaurant-menus?page=2');
    renderScreen(<RestaurantMenusPageClient />);
    await screen.findByRole('row', { name: /Masala Dosa/ });

    // A refresh or a shared link lands on the same page, as on every other list.
    expect(listQueries().every((query) => query?.page === 2)).toBe(true);
    expect(window.location.search).toBe('?page=2');
  });

  it('starts again at page 1 when the header location changes', async () => {
    goTo('/masters/restaurant-menus?page=2');
    const { rerender } = renderScreen(<RestaurantMenusPageClient />);
    await screen.findByRole('row', { name: /Masala Dosa/ });

    atLocation(saket);
    rerender(<RestaurantMenusPageClient />);

    await waitFor(() => expect(lastListQuery()).toMatchObject({ hospitalId: 'h-skt', page: 1 }));
  });

  it('filters by restaurant, day and availability', async () => {
    const { user } = renderScreen(<RestaurantMenusPageClient />);
    await screen.findByRole('row', { name: /Masala Dosa/ });

    for (const [filter, value] of [
      [/^Restaurant/, cafe.id],
      [/^Day/, 'FRIDAY'],
      [/^Available/, 'unavailable'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: /^Filters/ }));
      await user.selectOptions(screen.getByRole('combobox', { name: filter }), value);
    }

    await waitFor(() =>
      expect(lastListQuery()).toMatchObject({
        dayOfWeek: 'FRIDAY',
        isAvailable: false,
        restaurantId: cafe.id,
      }),
    );
  });

  describe('adding an item to a menu', () => {
    it('offers the items mapped at the restaurant’s location, and sends the menu entry', async () => {
      const { user } = renderScreen(<RestaurantMenusPageClient />);
      const dialog = await openNew(user);

      await user.selectOptions(
        dialog.getByRole('combobox', { name: /^Food item/ }),
        dialog.getByRole('option', { name: 'Potato Chips - Packaged · Main Store' }),
      );
      expect(dialog.getByLabelText('Store / Kitchen')).toHaveValue('Main Store (store)');
      expect(dialog.getByLabelText('Food category')).toHaveValue('Packaged');
      await user.type(dialog.getByLabelText(/^Price/), '20');
      await user.type(dialog.getByLabelText(/^In-Room Price/), '25.5');
      await user.click(dialog.getByRole('button', { name: 'Add to menu' }));

      await waitFor(() => expect(organizationApi.createRestaurantMenu).toHaveBeenCalled());
      expect(organizationApi.createRestaurantMenu.mock.calls[0]![0]).toEqual({
        accompaniments: null,
        addOn: null,
        availableFrom: null,
        availableTo: null,
        categoryId: packaged.id,
        daysOfWeek: [],
        gstPercent: 0,
        isActive: true,
        isAvailable: true,
        isDiscountable: false,
        isFeatured: false,
        isGstInclusive: false,
        itemId: chips.id,
        kitchenId: null,
        positionType: 'LAST',
        preparationTimeMinutes: null,
        price: 20,
        restaurantId: cafe.id,
        roomPrice: 25.5,
        serveAt: 'BOTH',
        serves: 1,
        storeId: mainStore.id,
      });
    });

    it('greys out an item the restaurant already sells under that category', async () => {
      const { user } = renderScreen(<RestaurantMenusPageClient />);
      const dialog = await openNew(user);

      expect(
        await dialog.findByRole('option', {
          name: 'Masala Dosa - Snacks · Main Kitchen (already on menu)',
        }),
      ).toBeDisabled();
    });

    it('asks for the prices it is served at, and a whole time window', async () => {
      const { user } = renderScreen(<RestaurantMenusPageClient />);
      const dialog = await openNew(user);
      await user.selectOptions(
        dialog.getByRole('combobox', { name: /^Food item/ }),
        dialog.getByRole('option', { name: 'Potato Chips - Packaged · Main Store' }),
      );
      await user.type(dialog.getByLabelText('Available from'), '09:00');

      await user.click(dialog.getByRole('button', { name: 'Add to menu' }));

      expect(await dialog.findByText('Enter the price.')).toBeInTheDocument();
      expect(dialog.getByText('Enter the in-room price.')).toBeInTheDocument();
      expect(
        dialog.getByText('Set both times, or leave both empty for all day.'),
      ).toBeInTheDocument();
      expect(organizationApi.createRestaurantMenu).not.toHaveBeenCalled();
    });

    it('needs only the counter price for counter-only items', async () => {
      const { user } = renderScreen(<RestaurantMenusPageClient />);
      const dialog = await openNew(user);
      await user.selectOptions(
        dialog.getByRole('combobox', { name: /^Food item/ }),
        dialog.getByRole('option', { name: 'Potato Chips - Packaged · Main Store' }),
      );

      await user.click(dialog.getByRole('radio', { name: 'Counter only' }));
      expect(dialog.queryByLabelText(/^In-Room Price/)).not.toBeInTheDocument();
      await user.type(dialog.getByLabelText(/^Price/), '20');
      await user.click(dialog.getByRole('button', { name: 'Add to menu' }));

      await waitFor(() =>
        expect(organizationApi.createRestaurantMenu).toHaveBeenCalledWith(
          expect.objectContaining({ price: 20, roomPrice: null, serveAt: 'COUNTER' }),
        ),
      );
    });

    it('starts the preparation time from the item’s own', async () => {
      serveMenus([]);
      const { user } = renderScreen(<RestaurantMenusPageClient />);
      const dialog = await openNew(user);

      await user.selectOptions(
        dialog.getByRole('combobox', { name: /^Food item/ }),
        dialog.getByRole('option', { name: 'Masala Dosa - Snacks · Main Kitchen' }),
      );

      expect(dialog.getByLabelText('Preparation Time (In Minutes)')).toHaveValue(12);
    });
  });

  it('moves an item after another, which must then be picked', async () => {
    const coffee = {
      ...dosaMenu,
      id: id(52),
      item: { ...chips, itemName: 'Filter Coffee' },
      menuItemCode: 'RMI0002',
    };
    serveMenus([dosaMenu, coffee]);
    const { user } = renderScreen(<RestaurantMenusPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Edit Masala Dosa' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit Menu Item' }));
    expect(dialog.getByLabelText('Menu item code')).toHaveValue('RMI0001');
    await user.type(dialog.getByLabelText(/^In-Room Price/), '90');
    await user.selectOptions(
      dialog.getByRole('combobox', { name: 'Position in menu' }),
      'AFTER_ITEM',
    );
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));
    expect(await dialog.findByText('Select a menu item for this position.')).toBeInTheDocument();

    // The item being edited is not offered as its own reference.
    expect(
      dialog.queryByRole('option', { name: /Masala Dosa \(ITM0002\)/ }),
    ).not.toBeInTheDocument();
    await user.selectOptions(dialog.getByRole('combobox', { name: /^Reference item/ }), id(52));
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(organizationApi.updateRestaurantMenu).toHaveBeenCalledWith(
        id(51),
        expect.objectContaining({
          positionType: 'AFTER_ITEM',
          price: 80,
          referenceMenuId: id(52),
          roomPrice: 90,
        }),
      ),
    );
  });

  it('marks an item sold out once confirmed', async () => {
    const { user } = renderScreen(<RestaurantMenusPageClient />);

    await user.click(
      await screen.findByRole('switch', { name: 'Masala Dosa in Cafe Max available' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Make Masala Dosa in Cafe Max unavailable?' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Make unavailable' }));

    expect(organizationApi.updateRestaurantMenu).toHaveBeenCalledWith(id(51), {
      isAvailable: false,
    });
  });

  it('gives a view-only user nothing to change', async () => {
    signedIn(['RESTAURANT_MENU_VIEW']);
    renderScreen(<RestaurantMenusPageClient />);
    await screen.findByRole('row', { name: /Masala Dosa/ });

    expect(screen.queryByRole('button', { name: 'New menu item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Masala Dosa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Masala Dosa in Cafe Max available' }),
    ).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Masala Dosa in Cafe Max active' })).toBeDisabled();
  });

  it('exports each menu entry with the codes an import reads back', async () => {
    const { user } = renderScreen(<RestaurantMenusPageClient />);
    await screen.findByRole('row', { name: /Masala Dosa/ });

    await user.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
    const [header, first] = vi.mocked(downloadCsv).mock.calls[0]![1];
    const cell = (name: string) => first![header!.indexOf(name)];
    expect(cell('Menu code')).toBe('RMI0001');
    expect(cell('Restaurant code')).toBe('RES01');
    expect(cell('Item code')).toBe('ITM0002');
    expect(cell('Kitchen code')).toBe('KIT01');
    expect(cell('Store / Kitchen')).toBe('Main Kitchen (kitchen)');
    expect(cell('Days')).toBe('Monday, Wednesday');
    expect(cell('Price')).toBe(80);
    expect(cell('In-room price')).toBe('');
    expect(cell('Status')).toBe('Active');
  });
});
