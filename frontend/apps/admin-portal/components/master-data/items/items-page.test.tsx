import type { Item, ItemListQuery } from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CsvModule from '@/lib/csv';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { atLocation } from '@/test/location';
import { downloadCsv } from '@/lib/csv';
import { ItemsPageClient } from './items-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/test/location'));
vi.mock('@/lib/csv', async (importOriginal) => ({
  ...(await importOriginal<typeof CsvModule>()),
  downloadCsv: vi.fn(),
}));
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  getItem: vi.fn<OrganizationApi['getItem']>(),
  importItems: vi.fn<OrganizationApi['importItems']>(),
  listItems: vi.fn<OrganizationApi['listItems']>(),
  updateItem: vi.fn<OrganizationApi['updateItem']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
}));

const item = (patch: Partial<Item>): Item => ({
  createdAt: '2026-10-01T00:00:00Z',
  deletedAt: null,
  hsnCode: '2106',
  id: 'i-thali',
  isActive: true,
  itemCode: 'ITM0001',
  itemName: 'Veg Thali',
  itemType: null,
  preparationTimeMinutes: 15,
  type: 'VEG',
  updatedAt: '2026-11-01T10:00:00Z',
  ...patch,
});
const thali = item({});
const omelette = item({
  hsnCode: null,
  id: 'i-omelette',
  isActive: false,
  itemCode: 'ITM0002',
  itemName: 'Egg Omelette',
  preparationTimeMinutes: null,
  type: 'EGGETARIAN',
});

// Counts (limit 0): 2 items, 1 inactive; by where they are made, 1 live, 1 readymade, 0 store.
const counts: Record<string, number> = { LIVE: 1, MRP: 0, READYMADE: 1 };

function serve(items: Item[]) {
  organizationApi.listItems.mockImplementation((query?: ItemListQuery) =>
    query?.limit === 0
      ? reply({
          items: [],
          meta: {
            limit: 0,
            page: 1,
            total: query.itemType
              ? (counts[query.itemType] ?? 0)
              : query.isActive === false
                ? 1
                : 2,
            totalPages: 1,
          },
        })
      : page(items),
  );
}

const lastListQuery = () =>
  vi
    .mocked(organizationApi.listItems)
    .mock.calls.map(([query]) => query)
    .filter((query) => query?.limit !== 0)
    .at(-1);
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });
const goTo = (url: string) => act(() => window.history.replaceState(null, '', url));

beforeEach(() => {
  vi.clearAllMocks();
  goTo('/masters/items');
  atLocation(null);
  signedIn(['ITEM_VIEW', 'ITEM_CREATE', 'ITEM_UPDATE']);
  serve([thali, omelette]);
  organizationApi.updateItem.mockImplementation(() => reply(thali));
});

describe('Items', () => {
  it('lists the catalogue with code, HSN, prep time and status', async () => {
    renderScreen(<ItemsPageClient />);

    expect(await screen.findByText('Veg Thali')).toBeInTheDocument();
    const thaliRow = within(row('Veg Thali'));
    expect(thaliRow.getByText('ITM0001')).toBeInTheDocument();
    expect(thaliRow.getByText('2106')).toBeInTheDocument();
    expect(thaliRow.getByText('15 min')).toBeInTheDocument();
    expect(thaliRow.getByText('Active')).toBeInTheDocument();
    expect(within(row('Egg Omelette')).getByText('Inactive')).toBeInTheDocument();
    expect(thaliRow.getByRole('button', { name: 'Edit Veg Thali' })).toHaveTextContent('Edit');
    // No Made at or Prices columns: the views say where items are made.
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())).toEqual(
      ['', 'Item', 'HSN', 'Prep time', 'Status', 'Updated', 'Actions'],
    );
    expect(lastListQuery()).toMatchObject({
      limit: 25,
      page: 1,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('lists one item type picked in Filters', async () => {
    const { user } = renderScreen(<ItemsPageClient />);

    await screen.findByText('Veg Thali');
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Item type' }), 'READYMADE');
    await waitFor(() => expect(lastListQuery()).toMatchObject({ itemType: 'READYMADE' }));
    expect(new URLSearchParams(window.location.search).get('made')).toBe('READYMADE');
  });

  it('deactivates the picked items together once confirmed', async () => {
    serve([thali, item({ id: 'i-dosa', itemCode: 'ITM0003', itemName: 'Masala Dosa' })]);
    const { user } = renderScreen(<ItemsPageClient />);

    await user.click(await screen.findByRole('checkbox', { name: 'Select Veg Thali' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Masala Dosa' }));
    const bar = within(screen.getByRole('region', { name: 'Bulk actions' }));
    expect(bar.getByText('2 selected')).toBeInTheDocument();
    await user.click(bar.getByRole('button', { name: 'Deactivate' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Deactivate 2 items?' })).getByRole(
        'button',
        { name: 'Deactivate' },
      ),
    );

    await waitFor(() =>
      expect(organizationApi.updateItem).toHaveBeenCalledWith('i-dosa', { isActive: false }),
    );
    expect(organizationApi.updateItem).toHaveBeenCalledWith('i-thali', { isActive: false });
  });

  it('invites the first item when the catalogue is empty', async () => {
    serve([]);
    renderScreen(<ItemsPageClient />);

    expect(await screen.findByText('No items yet')).toBeInTheDocument();
  });

  it('offers to clear the filters when nothing matches them', async () => {
    serve([]);
    goTo('/masters/items?food=NON_VEG');
    const { user } = renderScreen(<ItemsPageClient />);

    expect(await screen.findByText('No items match')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);

    await waitFor(() => expect(lastListQuery()).toMatchObject({ type: undefined }));
    expect(window.location.search).toBe('');
  });

  it('shows why the items could not be loaded', async () => {
    organizationApi.listItems.mockRejectedValue(
      new ApiClientError(503, 'Catalogue is unavailable'),
    );
    renderScreen(<ItemsPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Catalogue is unavailable');
  });

  it('searches, filters by food type and status, and sorts', async () => {
    const { user } = renderScreen(<ItemsPageClient />);
    await screen.findByText('Veg Thali');

    await user.type(screen.getByRole('searchbox', { name: 'Search items' }), 'thali');
    await waitFor(() => expect(lastListQuery()).toMatchObject({ search: 'thali' }));

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'Veg' }));
    await waitFor(() => expect(lastListQuery()).toMatchObject({ search: 'thali', type: 'VEG' }));

    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'inactive');
    await waitFor(() => expect(lastListQuery()).toMatchObject({ isActive: false, type: 'VEG' }));

    await user.selectOptions(screen.getByRole('combobox', { name: /^Sort/ }), 'itemName:asc');
    await waitFor(() =>
      expect(lastListQuery()).toMatchObject({ sortBy: 'itemName', sortOrder: 'asc' }),
    );
    expect(new URLSearchParams(window.location.search).get('sort')).toBe('itemName:asc');
  });

  it('shows the items as cards', async () => {
    const { user } = renderScreen(<ItemsPageClient />);
    await screen.findByText('Veg Thali');

    await user.click(screen.getByRole('button', { name: 'Cards' }));

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Veg Thali' })).toBeInTheDocument();
    expect(screen.getByText('ITM0001 · HSN 2106')).toBeInTheDocument();
  });

  it('offers New item and editing only with the permissions for them', async () => {
    signedIn(['ITEM_VIEW']);
    const { user } = renderScreen(<ItemsPageClient />);
    await screen.findByText('Veg Thali');

    expect(screen.queryByRole('link', { name: 'New item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Veg Thali' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
    // The server refuses a status change without ITEM_UPDATE: ticked rows offer no Activate.
    await user.click(screen.getByRole('checkbox', { name: 'Select Veg Thali' }));
    const bar = within(screen.getByRole('region', { name: 'Bulk actions' }));
    expect(bar.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
  });

  it('links New item to its form', async () => {
    renderScreen(<ItemsPageClient />);

    expect(await screen.findByRole('link', { name: 'New item' })).toHaveAttribute(
      'href',
      '/masters/items/new',
    );
  });

  it('opens an item from a link, with its details', async () => {
    goTo('/masters/items?id=i-thali');
    renderScreen(<ItemsPageClient />);

    const dialog = within(await screen.findByRole('dialog', { name: 'Veg Thali' }));
    expect(dialog.getByText('Food type').nextElementSibling).toHaveTextContent('Veg');
    expect(dialog.getByText('Preparation').nextElementSibling).toHaveTextContent('15 min');
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
  });

  it('fetches a linked item that is not on this page, and says when it is gone', async () => {
    organizationApi.getItem.mockRejectedValue(new ApiClientError(404, 'Item not found'));
    goTo('/masters/items?id=i-gone');
    renderScreen(<ItemsPageClient />);

    expect(await screen.findByRole('dialog', { name: 'Item not found' })).toBeInTheDocument();
    expect(organizationApi.getItem).toHaveBeenCalledWith('i-gone');
  });

  it('saves an edited item, clearing a blanked HSN code', async () => {
    const { user } = renderScreen(<ItemsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Edit Veg Thali' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit Veg Thali' }));
    expect(dialog.getByRole('radio', { name: 'Veg' })).toBeChecked();
    await user.clear(dialog.getByLabelText('HSN code'));
    await user.clear(dialog.getByLabelText(/^Item name/));
    await user.type(dialog.getByLabelText(/^Item name/), 'Deluxe Veg Thali');
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(organizationApi.updateItem).toHaveBeenCalledWith('i-thali', {
        hsnCode: null,
        isActive: true,
        itemName: 'Deluxe Veg Thali',
        preparationTimeMinutes: 15,
        type: 'VEG',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('marks the name when another item already has it', async () => {
    organizationApi.updateItem.mockRejectedValue(
      new ApiClientError(409, 'An item with this name already exists'),
    );
    const { user } = renderScreen(<ItemsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Edit Veg Thali' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const dialog = within(screen.getByRole('dialog', { name: 'Edit Veg Thali' }));
    expect(await dialog.findByText('An item with this name already exists')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Item was not updated');
  });

  it('rejects a name with no letter or number', async () => {
    const { user } = renderScreen(<ItemsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Edit Veg Thali' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit Veg Thali' }));
    await user.clear(dialog.getByLabelText(/^Item name/));
    await user.type(dialog.getByLabelText(/^Item name/), '***');
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));

    expect(
      await dialog.findByText('Item name must include at least one letter or number.'),
    ).toBeInTheDocument();
    expect(organizationApi.updateItem).not.toHaveBeenCalled();
  });

  it('activates an inactive item once confirmed', async () => {
    const { user } = renderScreen(<ItemsPageClient />);

    await user.click(await screen.findByRole('checkbox', { name: 'Select Egg Omelette' }));
    await user.click(
      within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole('button', {
        name: 'Activate',
      }),
    );
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Activate 1 item?' })).getByRole('button', {
        name: 'Activate',
      }),
    );

    await waitFor(() =>
      expect(organizationApi.updateItem).toHaveBeenCalledWith('i-omelette', { isActive: true }),
    );
  });

  it('exports the same columns the import reads', async () => {
    const { user } = renderScreen(<ItemsPageClient />);
    await screen.findByText('Veg Thali');

    await user.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
    const [, rows] = vi.mocked(downloadCsv).mock.calls[0]!;
    expect(rows).toEqual([
      ['Item code', 'Item name', 'Food type', 'HSN code', 'Prep time (min)', 'Status'],
      ['ITM0001', 'Veg Thali', 'Veg', '2106', 15, 'Active'],
      ['ITM0002', 'Egg Omelette', 'Egg', '', '', 'Inactive'],
    ]);
  });
});
