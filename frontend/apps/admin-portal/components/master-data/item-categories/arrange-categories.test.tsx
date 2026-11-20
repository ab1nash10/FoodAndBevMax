import type { ItemCategory } from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen, reply } from '@/test/harness';
import { ArrangeCategories } from './arrange-categories';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  listItemCategories: vi.fn<OrganizationApi['listItemCategories']>(),
  reorderItemCategories: vi.fn<OrganizationApi['reorderItemCategories']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
}));

const category = (id: string, categoryName: string, isActive = true) =>
  ({ categoryName, id, isActive }) as ItemCategory;
const onClose = vi.fn();

const order = () =>
  within(screen.getByRole('list', { name: 'Category order' }))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.truncate')?.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  organizationApi.listItemCategories.mockReturnValue(
    page([category('c-1', 'Snacks'), category('c-2', 'Drinks'), category('c-3', 'Sweets', false)]),
  );
  organizationApi.reorderItemCategories.mockReturnValue(reply(undefined) as never);
});

describe('arranging categories', () => {
  it('starts from the saved menu order, with nothing to save yet', async () => {
    renderScreen(<ArrangeCategories onClose={onClose} open />);

    expect(await screen.findByRole('list', { name: 'Category order' })).toBeInTheDocument();
    expect(order()).toEqual(['Snacks', 'Drinks', 'Sweets']);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save order' })).toBeDisabled();
    expect(organizationApi.listItemCategories).toHaveBeenCalledWith({
      limit: 100,
      page: 1,
      sortBy: 'sortOrder',
      sortOrder: 'asc',
    });
  });

  it('moves categories with the arrows and saves the whole order', async () => {
    const { user } = renderScreen(<ArrangeCategories onClose={onClose} open />);
    await screen.findByRole('list', { name: 'Category order' });

    expect(screen.getByRole('button', { name: 'Move Snacks up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Sweets down' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move Sweets to the top' }));
    await user.click(screen.getByRole('button', { name: 'Move Snacks down' }));
    expect(order()).toEqual(['Sweets', 'Drinks', 'Snacks']);

    await user.click(screen.getByRole('button', { name: 'Save order' }));

    expect(organizationApi.reorderItemCategories).toHaveBeenCalledWith(['c-3', 'c-2', 'c-1']);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('moves a category by dragging it over another', async () => {
    renderScreen(<ArrangeCategories onClose={onClose} open />);
    await screen.findByRole('list', { name: 'Category order' });
    const [snacks, , sweets] = within(
      screen.getByRole('list', { name: 'Category order' }),
    ).getAllByRole('listitem');

    fireEvent.dragStart(snacks!, { dataTransfer: { effectAllowed: '' } });
    fireEvent.dragOver(sweets!);
    fireEvent.dragEnd(sweets!);

    expect(order()).toEqual(['Drinks', 'Sweets', 'Snacks']);
  });

  it('keeps the order and says why when it could not be saved', async () => {
    organizationApi.reorderItemCategories.mockRejectedValue(new ApiClientError(403, 'Not allowed'));
    const { user } = renderScreen(<ArrangeCategories onClose={onClose} open />);
    await screen.findByRole('list', { name: 'Category order' });

    await user.click(screen.getByRole('button', { name: 'Move Drinks up' }));
    await user.click(screen.getByRole('button', { name: 'Save order' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Category order was not saved');
    expect(onClose).not.toHaveBeenCalled();
    expect(order()).toEqual(['Drinks', 'Snacks', 'Sweets']);
  });

  it('asks for nothing while closed', () => {
    renderScreen(<ArrangeCategories onClose={onClose} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(organizationApi.listItemCategories).not.toHaveBeenCalled();
  });
});
