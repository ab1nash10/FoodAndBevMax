import type { ItemCategory, ListQuery } from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CsvModule from '@/lib/csv';
import type * as ApiModule from '@/lib/api';
import type * as LocationModule from '@/components/location-context';
import { page, renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { at } from '@/test/next-navigation';
import { downloadCsv } from '@/lib/csv';
import { ItemCategoriesPageClient } from './item-categories-page';

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
  createItemCategory: vi.fn<OrganizationApi['createItemCategory']>(),
  listItemCategories: vi.fn<OrganizationApi['listItemCategories']>(),
  reorderItemCategories: vi.fn<OrganizationApi['reorderItemCategories']>(),
  updateItemCategory: vi.fn<OrganizationApi['updateItemCategory']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
}));

const category = (id: string, categoryName: string, isActive = true): ItemCategory =>
  ({
    categoryName,
    createdAt: '2026-10-01T00:00:00Z',
    id,
    isActive,
    sortOrder: 0,
    updatedAt: '2026-11-01T00:00:00Z',
  }) as ItemCategory;
const snacks = category('c-snacks', 'Snacks');
const drinks = category('c-drinks', 'Soft Drinks');
const sweets = category('c-sweets', 'Sweets', false);

function serve(categories: ItemCategory[]) {
  organizationApi.listItemCategories.mockImplementation((query?: ListQuery) =>
    query?.limit === 0
      ? reply({
          items: [],
          meta: { limit: 0, page: 1, total: query.isActive === false ? 1 : 3, totalPages: 1 },
        })
      : page(categories),
  );
}

const lastListQuery = () =>
  vi
    .mocked(organizationApi.listItemCategories)
    .mock.calls.map(([query]) => query)
    .filter((query) => query?.limit !== 0)
    .at(-1);
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/item-categories');
  window.history.replaceState(null, '', '/masters/item-categories');
  signedIn(['ITEM_CATEGORY_VIEW', 'ITEM_CATEGORY_CREATE', 'ITEM_CATEGORY_UPDATE']);
  serve([snacks, drinks, sweets]);
  organizationApi.updateItemCategory.mockImplementation((id) => reply({ ...snacks, id }));
  organizationApi.createItemCategory.mockImplementation((body) =>
    reply({ ...snacks, ...body, id: 'c-new' }),
  );
});

describe('Item Categories', () => {
  it('lists the categories in menu order with their status', async () => {
    renderScreen(<ItemCategoriesPageClient />);

    expect(await screen.findByText('Snacks')).toBeInTheDocument();
    expect(within(row('Sweets')).getByRole('switch', { name: 'Sweets active' })).not.toBeChecked();
    expect(lastListQuery()).toMatchObject({ page: 1, sortBy: 'sortOrder', sortOrder: 'asc' });
    const stats = within(screen.getByRole('group', { name: 'Item categories at a glance' }));
    expect(await stats.findByRole('button', { name: /All categories\s*3/ })).toBeInTheDocument();
  });

  it('says there are none, without naming a location (categories are shared)', async () => {
    serve([]);
    renderScreen(<ItemCategoriesPageClient />);

    expect(await screen.findByText('No item categories found')).toBeInTheDocument();
  });

  it('shows why the list could not be loaded', async () => {
    organizationApi.listItemCategories.mockRejectedValue(
      new ApiClientError(500, 'Could not reach the catalogue'),
    );
    renderScreen(<ItemCategoriesPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the catalogue');
  });

  it('searches and sorts by name', async () => {
    const { user } = renderScreen(<ItemCategoriesPageClient />);
    await screen.findByText('Snacks');

    await user.type(screen.getByRole('searchbox', { name: 'Search categories' }), 'sna');
    await waitFor(() => expect(lastListQuery()).toMatchObject({ search: 'sna' }));

    await user.selectOptions(screen.getByRole('combobox', { name: /^Sort/ }), 'categoryName:desc');
    await waitFor(() =>
      expect(lastListQuery()).toMatchObject({ sortBy: 'categoryName', sortOrder: 'desc' }),
    );
  });

  it('renames a category', async () => {
    const { user } = renderScreen(<ItemCategoriesPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Edit Snacks' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit category' }));
    await user.clear(dialog.getByLabelText(/^Category Name/));
    await user.type(dialog.getByLabelText(/^Category Name/), 'Hot Snacks');
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(organizationApi.updateItemCategory).toHaveBeenCalledWith('c-snacks', {
        categoryName: 'Hot Snacks',
        isActive: true,
      }),
    );
  });

  it('marks the name when a similar category exists', async () => {
    organizationApi.updateItemCategory.mockRejectedValue(
      new ApiClientError(409, 'Similar category already exists'),
    );
    const { user } = renderScreen(<ItemCategoriesPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Edit Snacks' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const dialog = within(screen.getByRole('dialog', { name: 'Edit category' }));
    expect(await dialog.findByText('Similar category already exists')).toBeInTheDocument();
  });

  it('deactivates a category once confirmed', async () => {
    const { user } = renderScreen(<ItemCategoriesPageClient />);

    await user.click(await screen.findByRole('switch', { name: 'Snacks active' }));
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    expect(organizationApi.updateItemCategory).toHaveBeenCalledWith('c-snacks', {
      isActive: false,
    });
  });

  it('gives a view-only user nothing to change', async () => {
    signedIn(['ITEM_CATEGORY_VIEW']);
    renderScreen(<ItemCategoriesPageClient />);
    await screen.findByText('Snacks');

    expect(screen.queryByRole('link', { name: 'New category' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arrange order' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Snacks' })).not.toBeInTheDocument();
    // The server refuses a status change without ITEM_CATEGORY_UPDATE.
    expect(screen.getByRole('switch', { name: 'Snacks active' })).toBeDisabled();
  });

  it('exports name and status', async () => {
    const { user } = renderScreen(<ItemCategoriesPageClient />);
    await screen.findByText('Snacks');

    await user.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
    expect(vi.mocked(downloadCsv).mock.calls[0]![1]).toEqual([
      ['Category name', 'Status'],
      ['Snacks', 'Active'],
      ['Soft Drinks', 'Active'],
      ['Sweets', 'Inactive'],
    ]);
  });

  describe('importing a file', () => {
    async function importFile(csv: string) {
      const { user } = renderScreen(<ItemCategoriesPageClient />);
      await screen.findByText('Snacks');
      await user.click(screen.getByRole('button', { name: 'Import' }));
      const dialog = screen.getByRole('dialog', { name: 'Import item categories' });
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      await user.upload(input, new File([csv], 'categories.csv', { type: 'text/csv' }));
      return { dialog, user };
    }

    it('updates a category matched by name and adds the rest', async () => {
      await importFile('Category name,Status\nsoft-drinks,Inactive\nJuices,\nJuices,Active\n');

      expect(
        await screen.findByRole('dialog', { name: 'Imported item categories' }),
      ).toHaveTextContent('1 added, 2 updated of 3 rows.');
      // Matched ignoring case and punctuation, renamed to the file's spelling.
      expect(organizationApi.updateItemCategory).toHaveBeenCalledWith('c-drinks', {
        categoryName: 'soft-drinks',
        isActive: false,
      });
      expect(organizationApi.createItemCategory).toHaveBeenCalledTimes(1);
      expect(organizationApi.createItemCategory).toHaveBeenCalledWith({
        categoryName: 'Juices',
        isActive: true,
      });
      // The second "Juices" updates the one the file just added.
      expect(organizationApi.updateItemCategory).toHaveBeenCalledWith('c-new', {
        categoryName: 'Juices',
        isActive: true,
      });
    });

    it('lists the rows it could not import', async () => {
      await importFile('Category name,Status\n,Active\nBakery,Maybe\n');

      const result = await screen.findByRole('dialog', { name: 'Imported item categories' });
      expect(result).toHaveTextContent('Row 2: Category name is required');
      expect(result).toHaveTextContent('Row 3: Status must be Active or Inactive');
      expect(organizationApi.createItemCategory).not.toHaveBeenCalled();
    });

    it('refuses a file without the required column', async () => {
      await importFile('Name\nBakery\n');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Missing columns: Category name, Status.',
      );
      expect(organizationApi.createItemCategory).not.toHaveBeenCalled();
    });
  });
});
