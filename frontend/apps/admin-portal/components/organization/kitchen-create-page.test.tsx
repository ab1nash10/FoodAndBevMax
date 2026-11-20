import type { Hospital } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg, saket } from '@/test/location';
import { router } from '@/test/next-navigation';
import { KitchenCreatePageClient } from './kitchen-create-page';

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
  createKitchen: vi.fn<Client['createKitchen']>(),
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

describe('Create Kitchen', () => {
  it('creates the kitchen at the header location and goes back to the list', async () => {
    api.createKitchen.mockImplementation(() =>
      reply({ id: 'k9', kitchenCode: 'KIT-0009', kitchenName: 'Live Kitchen' } as never),
    );
    const { user } = renderScreen(<KitchenCreatePageClient />);

    const location = screen.getByLabelText(/Location/);
    await waitFor(() => expect(location).toHaveValue(patparganj.id));
    // The header decides the location here.
    expect(location).toBeDisabled();
    const create = screen.getByRole('button', { name: 'Create Kitchen' });
    expect(create).toBeDisabled();
    expect(screen.getByText('Kitchen name is required.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Kitchen Name/), 'live kitchen');
    await user.click(create);

    await waitFor(() =>
      expect(api.createKitchen).toHaveBeenCalledWith({
        hospitalId: patparganj.id,
        isActive: true,
        kitchenName: 'Live Kitchen',
      }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/masters/kitchens'));
  });

  it('asks for a location first when the header shows all locations', async () => {
    atLocation(null, [patparganj, saketHospital]);
    const { user } = renderScreen(<KitchenCreatePageClient />);

    const location = screen.getByLabelText(/Location/);
    await user.type(screen.getByLabelText(/Kitchen Name/), 'Main Kitchen');
    expect(screen.getByText('Select a location.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Kitchen' })).toBeDisabled();

    await waitFor(() => expect(location).toBeEnabled());
    await user.selectOptions(location, saketHospital.id);
    expect(screen.getByRole('button', { name: 'Create Kitchen' })).toBeEnabled();
  });

  it('shows why the API refused the kitchen', async () => {
    api.createKitchen.mockRejectedValue(new Error('Kitchen name already exists at Patparganj'));
    const { user } = renderScreen(<KitchenCreatePageClient />);

    await user.type(screen.getByLabelText(/Kitchen Name/), 'Main Kitchen');
    await user.click(screen.getByRole('button', { name: 'Create Kitchen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kitchen name already exists at Patparganj',
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('warns when the locations could not be loaded', async () => {
    api.listHospitals.mockRejectedValue(new Error('Locations could not be loaded'));
    renderScreen(<KitchenCreatePageClient />);

    expect(await screen.findByText('Locations could not be loaded')).toBeInTheDocument();
  });
});
