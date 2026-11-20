import type { Store } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg, saket } from '@/test/location';
import { at } from '@/test/next-navigation';
import { StoresPageClient } from './stores-page';

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
  listStores: vi.fn<Client['listStores']>(),
  updateStore: vi.fn<Client['updateStore']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const store = (overrides: Partial<Store> = {}): Store => ({
  address: null,
  createdAt: '2026-11-19T05:00:00Z',
  deletedAt: null,
  hospital: ppg,
  hospitalId: ppg.id,
  id: 's1',
  isActive: true,
  location: null,
  locationId: null,
  storeCode: 'STR-0001',
  storeName: 'Main Store',
  storeType: null,
  updatedAt: '2026-11-19T05:00:00Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/stores');
  atLocation(ppg);
  signedIn(['STORE_VIEW', 'STORE_CREATE', 'STORE_UPDATE']);
  api.listHospitals.mockImplementation(() => page([ppg, saket] as never));
});

describe('Stores', () => {
  it('lists the stores at the header location, with an empty state when there are none', async () => {
    api.listStores.mockImplementation(() => page([store()]));
    const first = renderScreen(<StoresPageClient />);

    expect(await screen.findByText('Main Store')).toBeInTheDocument();
    expect(screen.getByText('STR-0001')).toBeInTheDocument();
    expect(api.listStores).toHaveBeenCalledWith(expect.objectContaining({ hospitalId: 'h-ppg' }));
    first.unmount();

    api.listStores.mockImplementation(() => page([]));
    renderScreen(<StoresPageClient />);
    expect(await screen.findByText('No stores at Patparganj')).toBeInTheDocument();
  });

  it('shows why the list failed to load', async () => {
    api.listStores.mockRejectedValue(new Error('Stores could not be loaded'));
    renderScreen(<StoresPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Stores could not be loaded');
  });

  it('searches through the API', async () => {
    api.listStores.mockImplementation(() => page([]));
    const { user } = renderScreen(<StoresPageClient />);

    await user.type(await screen.findByRole('searchbox', { name: 'Search stores' }), 'dry');
    await waitFor(() =>
      expect(api.listStores).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'dry' })),
    );
  });

  it('offers New store, editing and the status switch only to those allowed to', async () => {
    signedIn(['STORE_VIEW']);
    api.listStores.mockImplementation(() => page([store()]));
    renderScreen(<StoresPageClient />);

    await screen.findByText('Main Store');
    expect(screen.queryByRole('link', { name: /New store/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Main Store' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Set inactive' })).toBeDisabled();
  });

  it('renames a store and shows a refusal from the API', async () => {
    api.listStores.mockImplementation(() => page([store()]));
    api.updateStore.mockRejectedValueOnce(new Error('Store name already exists'));
    const { user } = renderScreen(<StoresPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Edit Main Store' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit store' });
    const name = within(dialog).getByLabelText(/Store name/);
    await user.clear(name);
    await user.type(name, 'Dry Store');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Active' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(api.updateStore).toHaveBeenCalledWith('s1', {
        isActive: false,
        storeName: 'Dry Store',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Store name already exists');
  });

  it('activates a store once confirmed', async () => {
    api.listStores.mockImplementation(() => page([store({ isActive: false })]));
    api.updateStore.mockImplementation(() => reply(store()));
    const { user } = renderScreen(<StoresPageClient />);

    await user.click(await screen.findByRole('switch', { name: 'Set active' }));
    await user.click(screen.getByRole('button', { name: 'Activate' }));

    await waitFor(() => expect(api.updateStore).toHaveBeenCalledWith('s1', { isActive: true }));
  });
});
