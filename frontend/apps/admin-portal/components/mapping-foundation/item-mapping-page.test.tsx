import type { ListQuery } from '@aahar/api-client';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import type * as LocationModule from '@/components/location-context';
import { page, renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { atLocation, ppg } from '@/test/location';
import { ItemMappingPageClient } from './item-mapping-page';

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
  listHospitals: vi.fn<OrganizationApi['listHospitals']>(),
  listItemCategories: vi.fn<OrganizationApi['listItemCategories']>(),
  listItems: vi.fn<OrganizationApi['listItems']>(),
  listKitchenItems: vi.fn<OrganizationApi['listKitchenItems']>(),
  listKitchens: vi.fn<OrganizationApi['listKitchens']>(),
  listStoreItems: vi.fn<OrganizationApi['listStoreItems']>(),
  listStores: vi.fn<OrganizationApi['listStores']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
}));

/** Counts per side: all, and inactive. */
const counted = (all: number, inactive: number) => (query?: ListQuery) =>
  query?.limit === 0
    ? reply({
        items: [],
        meta: {
          limit: 0,
          page: 1,
          total: query.isActive === false ? inactive : all,
          totalPages: 1,
        },
      })
    : page([]);

const tabs = () => screen.queryByRole('tablist', { name: 'Mappings' });

beforeEach(() => {
  vi.clearAllMocks();
  act(() => window.history.replaceState(null, '', '/masters/item-mapping'));
  atLocation(ppg);
  signedIn(['STORE_ITEM_VIEW', 'KITCHEN_ITEM_VIEW']);
  organizationApi.listStoreItems.mockImplementation(counted(12, 2));
  organizationApi.listKitchenItems.mockImplementation(counted(30, 5));
  for (const list of [
    'listHospitals',
    'listItemCategories',
    'listItems',
    'listKitchens',
    'listStores',
  ] as const) {
    organizationApi[list].mockReturnValue(page([]));
  }
});

describe('Item Locations', () => {
  it('counts store and kitchen mappings at the location, with the total in the header', async () => {
    renderScreen(<ItemMappingPageClient />);

    const stats = within(screen.getByRole('group', { name: 'Item mappings at a glance' }));
    expect(await stats.findByRole('button', { name: /Store mappings\s*12/ })).toBeInTheDocument();
    expect(await stats.findByRole('button', { name: /Kitchen mappings\s*30/ })).toBeInTheDocument();
    expect(stats.getByRole('button', { name: /Inactive · stores\s*2/ })).toBeInTheDocument();
    expect(stats.getByRole('button', { name: /Inactive · kitchens\s*5/ })).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(organizationApi.listStoreItems).toHaveBeenCalledWith({
      hospitalId: 'h-ppg',
      isActive: false,
      limit: 0,
    });
  });

  it('opens on stores and switches to kitchens, starting that side clean', async () => {
    act(() =>
      window.history.replaceState(null, '', '/masters/item-mapping?q=chips&status=inactive'),
    );
    const { user } = renderScreen(<ItemMappingPageClient />);

    expect(within(tabs()!).getByRole('tab', { name: 'Store items' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: 'Kitchen items' }));

    expect(screen.getByRole('tab', { name: 'Kitchen items' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('searchbox', { name: 'Search kitchen items' })).toHaveValue('');
    expect(window.location.search).toBe('?tab=kitchen');
  });

  it('shows one side’s inactive mappings from its count', async () => {
    const { user } = renderScreen(<ItemMappingPageClient />);

    await user.click(await screen.findByRole('button', { name: /Inactive · kitchens/ }));

    expect(screen.getByRole('tab', { name: 'Kitchen items' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await waitFor(() =>
      expect(organizationApi.listKitchenItems).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: false, page: 1 }),
      ),
    );
  });

  it('shows only the side the user may see, without tabs or the other side’s counts', async () => {
    signedIn(['KITCHEN_ITEM_VIEW']);
    act(() => window.history.replaceState(null, '', '/masters/item-mapping?tab=store'));
    renderScreen(<ItemMappingPageClient />);

    expect(
      await screen.findByRole('searchbox', { name: 'Search kitchen items' }),
    ).toBeInTheDocument();
    expect(tabs()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Store mappings/ })).not.toBeInTheDocument();
    expect(organizationApi.listStoreItems).not.toHaveBeenCalled();
  });
});
