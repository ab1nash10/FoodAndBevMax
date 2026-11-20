import { ApiClientError } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { renderScreen, reply } from '@/test/harness';
import { at, router } from '@/test/next-navigation';
import { ItemCategoryCreatePageClient } from './item-category-create-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  createItemCategory: vi.fn<OrganizationApi['createItemCategory']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
}));

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/item-categories/new');
});

describe('the new category form', () => {
  it('needs a name before it can be created', async () => {
    const { user } = renderScreen(<ItemCategoryCreatePageClient />);
    const submit = screen.getByRole('button', { name: 'Create Category' });

    expect(submit).toHaveAccessibleDescription('Category name is required.');
    await user.type(screen.getByLabelText(/^Category Name/), 'Snacks');
    expect(submit).toBeEnabled();
  });

  it('creates the category, inactive when unticked, and shows it in the list', async () => {
    organizationApi.createItemCategory.mockReturnValue(
      reply({ categoryName: 'Snacks', id: 'c-snacks' } as never),
    );
    const { user } = renderScreen(<ItemCategoryCreatePageClient />);

    await user.type(screen.getByLabelText(/^Category Name/), '  Snacks ');
    await user.click(screen.getByRole('checkbox', { name: 'Active' }));
    await user.click(screen.getByRole('button', { name: 'Create Category' }));

    await waitFor(() =>
      expect(organizationApi.createItemCategory).toHaveBeenCalledWith({
        categoryName: 'Snacks',
        isActive: false,
      }),
    );
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(expect.stringContaining('/masters/item-categories')),
    );
  });

  it('marks the name when a similar category exists', async () => {
    organizationApi.createItemCategory.mockRejectedValue(
      new ApiClientError(409, 'Similar category already exists'),
    );
    const { user } = renderScreen(<ItemCategoryCreatePageClient />);

    await user.type(screen.getByLabelText(/^Category Name/), 'snacks!');
    await user.click(screen.getByRole('button', { name: 'Create Category' }));

    expect(
      await screen.findByText('Similar category already exists', { selector: 'p.font-medium' }),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});
