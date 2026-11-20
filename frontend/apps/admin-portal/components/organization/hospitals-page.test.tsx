import type { Hospital, LegalEntity } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { at, router } from '@/test/next-navigation';
import { HospitalsPageClient } from './hospitals-page';

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
  listLegalEntities: vi.fn<Client['listLegalEntities']>(),
  updateHospital: vi.fn<Client['updateHospital']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const entity: LegalEntity = {
  createdAt: '2026-01-01T00:00:00Z',
  entityAddress: 'Press Enclave Road, Saket',
  entityName: 'Max Super Speciality Hospital Ltd',
  gstNumber: '07AABCM1234A1Z5',
  id: 'e1',
  isActive: true,
  locationName: 'MSSH PPG',
  updatedAt: '2026-01-01T00:00:00Z',
};

const location = (overrides: Partial<Hospital> = {}) =>
  ({
    address: '108A, IP Extension',
    city: 'New Delhi',
    createdAt: '2026-01-01T00:00:00Z',
    displayName: 'Patparganj',
    hospitalCode: 'PPG',
    hospitalName: 'Patparganj',
    id: 'h-ppg',
    isActive: true,
    legalEntityId: 'e1',
    locationCode: 'PPG',
    onlinePaymentOption: 'RAZORPAY',
    postalCode: '110092',
    state: 'Delhi',
    title: 'Patparganj',
    updatedAt: '2026-11-19T05:00:00Z',
    ...overrides,
  }) as Hospital;

function listOf(locations: Hospital[]) {
  api.listHospitals.mockImplementation((query) =>
    query?.limit === 0
      ? page(
          locations.filter(
            (one) => query.isActive === undefined || one.isActive === query.isActive,
          ),
        )
      : page(locations),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/locations');
  signedIn(['HOSPITAL_VIEW', 'HOSPITAL_CREATE', 'HOSPITAL_UPDATE']);
  api.listLegalEntities.mockImplementation(() => page([entity]));
});

describe('Locations', () => {
  it('lists each location under its entity, with its address and payment option', async () => {
    listOf([
      location(),
      location({
        address: null,
        city: null,
        id: 'h-skt',
        isActive: false,
        legalEntityId: null,
        locationCode: 'SKT',
        postalCode: null,
        state: null,
        title: 'Saket',
      }),
    ]);
    renderScreen(<HospitalsPageClient />);

    // Named by its entity's Location column once the entities arrive.
    const ppgRow = (await screen.findByText('MSSH PPG')).closest('tr') as HTMLElement;
    expect(within(ppgRow).getByText('Max Super Speciality Hospital Ltd')).toBeInTheDocument();
    expect(within(ppgRow).getByText('108A, IP Extension')).toBeInTheDocument();
    expect(within(ppgRow).getByText('New Delhi, Delhi 110092')).toBeInTheDocument();
    expect(within(ppgRow).getByText('RAZORPAY')).toBeInTheDocument();

    // No entity or address yet; inactive, so its services are frozen.
    const saketRow = screen.getByText('Saket').closest('tr') as HTMLElement;
    expect(within(saketRow).getAllByText('Not set')).toHaveLength(3);
    expect(
      within(saketRow).getByText(/Services for this Location are currently frozen/),
    ).toBeVisible();
  });

  it('says when there are no locations, or why they failed to load', async () => {
    listOf([]);
    const first = renderScreen(<HospitalsPageClient />);
    expect(await screen.findByText('No locations found')).toBeInTheDocument();
    first.unmount();

    api.listHospitals.mockRejectedValue(new Error('Failed to fetch'));
    renderScreen(<HospitalsPageClient />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to connect to AAHAR services. Please check your network and try again.',
    );
  });

  it('asks the API for the search, state and city picked', async () => {
    listOf([]);
    const { user } = renderScreen(<HospitalsPageClient />);

    await user.type(await screen.findByRole('searchbox', { name: 'Search locations' }), 'ppg');
    await waitFor(() =>
      expect(api.listHospitals).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'ppg' }),
      ),
    );

    await user.click(screen.getByRole('button', { name: /Filters/ }));
    const filters = screen.getByRole('dialog', { name: 'Filters' });
    // No city until a state is picked: cities are listed per state.
    expect(within(filters).getByRole('combobox', { name: 'City' })).toBeDisabled();
    await user.selectOptions(within(filters).getByRole('combobox', { name: 'State' }), 'Delhi');
    await waitFor(() =>
      expect(api.listHospitals).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'ppg', state: 'Delhi' }),
      ),
    );
  });

  it('opens a location to edit, and offers New location only to those who may add one', async () => {
    listOf([location()]);
    const { user } = renderScreen(<HospitalsPageClient />);

    expect(await screen.findByRole('link', { name: /New location/ })).toHaveAttribute(
      'href',
      '/masters/locations/new',
    );
    await user.click(await screen.findByRole('button', { name: 'Edit MSSH PPG' }));
    expect(router.push).toHaveBeenCalledWith('/masters/locations/h-ppg/edit');
  });

  it('hides New location and Import from those who may only view', async () => {
    signedIn(['HOSPITAL_VIEW']);
    listOf([location()]);
    renderScreen(<HospitalsPageClient />);

    await screen.findByText('MSSH PPG');
    expect(screen.queryByRole('link', { name: /New location/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import/ })).not.toBeInTheDocument();
  });

  it('deactivates a location after warning that its services freeze', async () => {
    listOf([location()]);
    api.updateHospital.mockImplementation(() => reply(location({ isActive: false })));
    const { user } = renderScreen(<HospitalsPageClient />);

    await screen.findByText('MSSH PPG');
    await user.click(screen.getByRole('switch', { name: 'Set inactive' }));
    const confirm = screen.getByRole('dialog', { name: 'Deactivate Patparganj?' });
    expect(confirm).toHaveTextContent('Turning this off will freeze related services.');
    await user.click(within(confirm).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() =>
      expect(api.updateHospital).toHaveBeenCalledWith('h-ppg', { isActive: false }),
    );
  });

  it('shows the API refusal when a status change fails', async () => {
    listOf([location()]);
    api.updateHospital.mockRejectedValue(new Error('Location has open shifts'));
    const { user } = renderScreen(<HospitalsPageClient />);

    await screen.findByText('MSSH PPG');
    await user.click(screen.getByRole('switch', { name: 'Set inactive' }));
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Location has open shifts');
  });
});
