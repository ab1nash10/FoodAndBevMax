import { ApiClientError } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { renderScreen, reply } from '@/test/harness';
import { at, router } from '@/test/next-navigation';
import { ItemCreatePageClient } from './item-create-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  createItem: vi.fn<OrganizationApi['createItem']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
}));

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/items/new');
});

describe('the new item form', () => {
  it('says what is missing until a name and food type are given', async () => {
    const { user } = renderScreen(<ItemCreatePageClient />);
    const submit = screen.getByRole('button', { name: 'Create item' });

    expect(submit).toHaveAccessibleDescription('Item name is required.');
    await user.type(screen.getByLabelText(/^Item name/), 'masala dosa');
    expect(submit).toHaveAccessibleDescription('Choose a food type.');
    await user.click(screen.getByRole('radio', { name: 'Veg' }));
    expect(submit).toBeEnabled();
    expect(screen.getByLabelText('Item code')).toHaveValue('Auto-generated after save');
  });

  it('creates the item and opens it in the list', async () => {
    organizationApi.createItem.mockReturnValue(
      reply({ id: 'i-dosa', itemCode: 'ITM0042', itemName: 'Masala Dosa' } as never),
    );
    const { user } = renderScreen(<ItemCreatePageClient />);

    await user.type(screen.getByLabelText(/^Item name/), 'masala dosa');
    await user.click(screen.getByRole('radio', { name: 'Veg' }));
    await user.type(screen.getByLabelText('Preparation time'), '12');
    await user.click(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() =>
      expect(organizationApi.createItem).toHaveBeenCalledWith({
        hsnCode: undefined,
        isActive: true,
        itemName: 'Masala Dosa',
        preparationTimeMinutes: 12,
        type: 'VEG',
      }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/masters/items?id=i-dosa'));
  });

  it('marks the name when a similar item exists', async () => {
    organizationApi.createItem.mockRejectedValue(
      new ApiClientError(409, 'An item with this name already exists'),
    );
    const { user } = renderScreen(<ItemCreatePageClient />);

    await user.type(screen.getByLabelText(/^Item name/), 'masala dosa');
    await user.click(screen.getByRole('radio', { name: 'Veg' }));
    await user.click(screen.getByRole('button', { name: 'Create item' }));

    expect(
      await screen.findByText('An item with this name already exists', {
        selector: 'p.font-medium',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Item was not created');
    expect(router.push).not.toHaveBeenCalled();
  });
});
