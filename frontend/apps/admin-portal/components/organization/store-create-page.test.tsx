import type { Hospital } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg, saket } from '@/test/location';
import { router } from '@/test/next-navigation';
import { StoreCreatePageClient } from './store-create-page';

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
  createStore: vi.fn<Client['createStore']>(),
  listHospitals: vi.fn<Client['listHospitals']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

// The form checks the location is a real id (a UUID).
const patparganj = { ...ppg, id: '11111111-1111-4111-8111-111111111111' };
const saketHospital = { ...saket, id: '22222222-2222-4222-8222-222222222222' };

beforeEach(() => {
  vi.clearAllMocks();
  atLocation(patparganj, [patparganj, saketHospital]);
  api.listHospitals.mockImplementation(() =>
    page([patparganj, saketHospital] as unknown as Hospital[]),
  );
});

describe('Create Store', () => {
  it('creates the store at the header location and goes back to the list', async () => {
    api.createStore.mockImplementation(() =>
      reply({ id: 's9', storeCode: 'STR-0009', storeName: 'Dry Store' } as never),
    );
    const { user } = renderScreen(<StoreCreatePageClient />);

    const location = screen.getByLabelText(/Location/);
    await waitFor(() => expect(location).toHaveValue(patparganj.id));
    // The header decides the location here.
    expect(location).toBeDisabled();
    const create = screen.getByRole('button', { name: 'Create Store' });
    expect(create).toBeDisabled();
    expect(screen.getByText('Store name is required.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Store Name/), 'dry store');
    await user.click(create);

    await waitFor(() =>
      expect(api.createStore).toHaveBeenCalledWith({
        hospitalId: patparganj.id,
        isActive: true,
        storeName: 'Dry Store',
      }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/masters/stores'));
  });

  it('asks for a location first when the header shows all locations', async () => {
    atLocation(null, [patparganj, saketHospital]);
    const { user } = renderScreen(<StoreCreatePageClient />);

    const location = screen.getByLabelText(/Location/);
    await user.type(screen.getByLabelText(/Store Name/), 'Main Store');
    expect(screen.getByText('Select a location.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Store' })).toBeDisabled();

    await waitFor(() => expect(location).toBeEnabled());
    await user.selectOptions(location, saketHospital.id);
    expect(screen.getByRole('button', { name: 'Create Store' })).toBeEnabled();
  });

  it('shows why the API refused the store', async () => {
    api.createStore.mockRejectedValue(new Error('Store name already exists at Patparganj'));
    const { user } = renderScreen(<StoreCreatePageClient />);

    await user.type(screen.getByLabelText(/Store Name/), 'Main Store');
    await user.click(screen.getByRole('button', { name: 'Create Store' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Store name already exists at Patparganj',
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('warns when the locations could not be loaded', async () => {
    api.listHospitals.mockRejectedValue(new Error('Locations could not be loaded'));
    renderScreen(<StoreCreatePageClient />);

    expect(await screen.findByText('Locations could not be loaded')).toBeInTheDocument();
  });
});
