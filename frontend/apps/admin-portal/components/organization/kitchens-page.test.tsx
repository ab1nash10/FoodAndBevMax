import type { Kitchen } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg, saket } from '@/test/location';
import { at } from '@/test/next-navigation';
import { KitchensPageClient } from './kitchens-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
// The real module's helpers (getLocationTitle…) with the header's location stood in.
vi.mock('@/components/location-context', async (importOriginal) => ({
  ...(await importOriginal<typeof LocationModule>()),
  ...(await import('@/test/location')),
}));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  listHospitals: vi.fn<Client['listHospitals']>(),
  listKitchens: vi.fn<Client['listKitchens']>(),
  updateKitchen: vi.fn<Client['updateKitchen']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const kitchen = (overrides: Partial<Kitchen> = {}): Kitchen => ({
  closingTime: null,
  createdAt: '2026-11-19T05:00:00Z',
  deletedAt: null,
  hospital: ppg,
  hospitalId: ppg.id,
  id: 'k1',
  isActive: true,
  kitchenCode: 'KIT-0001',
  kitchenName: 'Main Kitchen',
  location: null,
  locationId: null,
  openingTime: null,
  updatedAt: '2026-11-19T05:00:00Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/kitchens');
  atLocation(ppg);
  signedIn(['KITCHEN_VIEW', 'KITCHEN_CREATE', 'KITCHEN_UPDATE']);
  api.listHospitals.mockImplementation(() => page([ppg, saket] as never));
});

describe('Kitchens', () => {
  it('lists the kitchens at the header location', async () => {
    api.listKitchens.mockImplementation(() => page([kitchen()]));
    renderScreen(<KitchensPageClient />);

    expect(await screen.findByText('Main Kitchen')).toBeInTheDocument();
    expect(screen.getByText('KIT-0001')).toBeInTheDocument();
    expect(api.listKitchens).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalId: 'h-ppg', page: 1, sortBy: 'createdAt' }),
    );
  });

  it('says there are no kitchens at the location, or why the list failed', async () => {
    api.listKitchens.mockImplementation(() => page([]));
    const first = renderScreen(<KitchensPageClient />);
    expect(await screen.findByText('No kitchens at Patparganj')).toBeInTheDocument();
    first.unmount();

    api.listKitchens.mockRejectedValue(new Error('Kitchens could not be loaded'));
    renderScreen(<KitchensPageClient />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Kitchens could not be loaded');
  });

  it('searches and sorts through the API', async () => {
    api.listKitchens.mockImplementation(() => page([]));
    const { user } = renderScreen(<KitchensPageClient />);

    await user.type(await screen.findByRole('searchbox', { name: 'Search kitchens' }), 'main');
    await waitFor(() =>
      expect(api.listKitchens).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'main' }),
      ),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'Name Z–A');
    await waitFor(() =>
      expect(api.listKitchens).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'kitchenName', sortOrder: 'desc' }),
      ),
    );
  });

  it('offers New kitchen, Import, editing and the status switch only to those allowed to', async () => {
    signedIn(['KITCHEN_VIEW']);
    api.listKitchens.mockImplementation(() => page([kitchen()]));
    renderScreen(<KitchensPageClient />);

    await screen.findByText('Main Kitchen');
    expect(screen.queryByRole('link', { name: /New kitchen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Main Kitchen' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Set inactive' })).toBeDisabled();
  });

  it('links New kitchen to its form for those who may add one', async () => {
    api.listKitchens.mockImplementation(() => page([]));
    renderScreen(<KitchensPageClient />);

    expect(await screen.findByRole('link', { name: /New kitchen/ })).toHaveAttribute(
      'href',
      '/masters/kitchens/new',
    );
  });

  it('renames a kitchen and shows a refusal from the API', async () => {
    api.listKitchens.mockImplementation(() => page([kitchen()]));
    api.updateKitchen.mockRejectedValueOnce(new Error('Kitchen name already exists'));
    const { user } = renderScreen(<KitchensPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Edit Main Kitchen' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit kitchen' });
    expect(within(dialog).getByLabelText('Location')).toHaveValue('Patparganj');
    const name = within(dialog).getByLabelText(/Kitchen name/);
    await user.clear(name);
    await user.type(name, 'Live Kitchen');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(api.updateKitchen).toHaveBeenCalledWith('k1', {
        isActive: true,
        kitchenName: 'Live Kitchen',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Kitchen name already exists');
  });

  it('deactivates a kitchen once confirmed', async () => {
    api.listKitchens.mockImplementation(() => page([kitchen()]));
    api.updateKitchen.mockImplementation(() => reply(kitchen({ isActive: false })));
    const { user } = renderScreen(<KitchensPageClient />);

    await user.click(await screen.findByRole('switch', { name: 'Set inactive' }));
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(api.updateKitchen).toHaveBeenCalledWith('k1', { isActive: false }));
  });

  it('will not activate a kitchen at an inactive location', async () => {
    api.listKitchens.mockImplementation(() =>
      page([kitchen({ hospital: { ...ppg, isActive: false }, isActive: false })]),
    );
    const { user } = renderScreen(<KitchensPageClient />);

    await user.click(await screen.findByRole('switch', { name: 'Set active' }));

    expect(await screen.findByText('Location is inactive')).toBeInTheDocument();
    expect(api.updateKitchen).not.toHaveBeenCalled();
  });
});
