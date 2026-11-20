import type {
  Hospital,
  Item,
  ItemCategory,
  Store,
  StoreItem,
  StoreItemListQuery,
} from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import type * as LocationModule from '@/components/location-context';
import { page, renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { atLocation, ppg, saket } from '@/test/location';
import { at } from '@/test/next-navigation';
import { StoreItemsPageClient } from './store-items-page';

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
  createStoreItem: vi.fn<OrganizationApi['createStoreItem']>(),
  listHospitals: vi.fn<OrganizationApi['listHospitals']>(),
  listItemCategories: vi.fn<OrganizationApi['listItemCategories']>(),
  listItems: vi.fn<OrganizationApi['listItems']>(),
  listStoreItems: vi.fn<OrganizationApi['listStoreItems']>(),
  listStores: vi.fn<OrganizationApi['listStores']>(),
  updateStoreItem: vi.fn<OrganizationApi['updateStoreItem']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
}));

// The form checks ids are UUIDs, as the server's are.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mainStore = {
  hospital: ppg,
  id: id(1),
  storeCode: 'STR01',
  storeName: 'Main Store',
} as Store;
const saketStore = {
  hospital: saket,
  id: id(2),
  storeCode: 'STR02',
  storeName: 'Saket Store',
} as Store;
const chips = {
  id: id(11),
  itemCode: 'ITM0003',
  itemName: 'Potato Chips',
  itemType: 'MRP',
  type: 'VEG',
} as Item;
const thali = {
  id: id(12),
  itemCode: 'ITM0001',
  itemName: 'Veg Thali',
  itemType: 'READYMADE',
  type: 'VEG',
} as Item;
const packaged = { categoryName: 'Packaged', id: id(21), isActive: true } as ItemCategory;

const mapping: StoreItem = {
  category: packaged,
  categoryId: packaged.id,
  createdAt: '2026-10-01T00:00:00Z',
  deletedAt: null,
  id: id(31),
  isActive: true,
  item: chips,
  itemId: chips.id,
  store: { ...mainStore, isActive: true },
  storeId: mainStore.id,
  updatedAt: '2026-11-01T00:00:00Z',
};

const lastListQuery = () =>
  vi
    .mocked(organizationApi.listStoreItems)
    .mock.calls.map(([query]) => query)
    .filter((query) => !query?.itemId)
    .at(-1);

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/item-mapping');
  window.history.replaceState(null, '', '/masters/item-mapping');
  atLocation(ppg);
  signedIn(['STORE_ITEM_VIEW', 'STORE_ITEM_CREATE', 'STORE_ITEM_UPDATE']);
  organizationApi.listStoreItems.mockImplementation((query?: StoreItemListQuery) =>
    query?.itemId ? page([]) : page([mapping]),
  );
  organizationApi.listHospitals.mockReturnValue(page([ppg, saket] as Hospital[]));
  organizationApi.listStores.mockImplementation((query) =>
    page(
      [mainStore, saketStore].filter(
        (store) => !query?.hospitalId || store.hospital.id === query.hospitalId,
      ),
    ),
  );
  organizationApi.listItems.mockReturnValue(page([chips, thali]));
  organizationApi.listItemCategories.mockReturnValue(page([packaged]));
  organizationApi.createStoreItem.mockImplementation(() => reply(mapping));
});

describe('Store Items', () => {
  it('lists the stores’ packaged items at the location', async () => {
    renderScreen(<StoreItemsPageClient />);

    const row = within(await screen.findByRole('row', { name: /Potato Chips/ }));
    expect(row.getByText('Main Store')).toBeInTheDocument();
    expect(row.getByText('Packaged')).toBeInTheDocument();
    expect(lastListQuery()).toMatchObject({ hospitalId: 'h-ppg' });
  });

  it('maps an item to a store of the location picked in the form', async () => {
    atLocation(null);
    const { user } = renderScreen(<StoreItemsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Map item' }));
    const dialog = within(screen.getByRole('dialog', { name: /Map Item to Store/i }));
    // With All Locations in the header, the location is picked here first.
    expect(dialog.getByRole('combobox', { name: /^Store/ })).toBeDisabled();
    await user.selectOptions(await dialog.findByRole('combobox', { name: /^Location/ }), 'h-skt');
    await user.selectOptions(
      dialog.getByRole('combobox', { name: /^Store/ }),
      await dialog.findByRole('option', { name: 'Saket Store (STR02)' }),
    );
    expect(dialog.queryByRole('option', { name: 'Main Store (STR01)' })).not.toBeInTheDocument();
    // A kitchen's item can't be packaged as well.
    expect(
      dialog.getByRole('option', { name: /Veg Thali .* readymade, mapped to kitchens/ }),
    ).toBeDisabled();
    await user.selectOptions(dialog.getByRole('combobox', { name: /^Item/ }), chips.id);
    await user.selectOptions(dialog.getByRole('combobox', { name: /^Category/ }), packaged.id);
    await user.click(dialog.getByRole('button', { name: /^Create Store Item/i }));

    await waitFor(() =>
      expect(organizationApi.createStoreItem).toHaveBeenCalledWith({
        categoryId: packaged.id,
        isActive: true,
        itemId: chips.id,
        storeId: saketStore.id,
      }),
    );
  });

  it('gives a view-only user nothing to change', async () => {
    signedIn(['STORE_ITEM_VIEW']);
    renderScreen(<StoreItemsPageClient />);
    await screen.findByRole('row', { name: /Potato Chips/ });

    // The server refuses these without STORE_ITEM_CREATE / STORE_ITEM_UPDATE.
    expect(screen.queryByRole('button', { name: 'Map item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Potato Chips in Main Store active' }),
    ).toBeDisabled();
  });
});
