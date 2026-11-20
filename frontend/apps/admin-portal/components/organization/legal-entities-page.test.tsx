import type { LegalEntity } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { at } from '@/test/next-navigation';
import { LegalEntitiesPageClient } from './legal-entities-page';

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
  createLegalEntity: vi.fn<Client['createLegalEntity']>(),
  listLegalEntities: vi.fn<Client['listLegalEntities']>(),
  updateLegalEntity: vi.fn<Client['updateLegalEntity']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const entity = (overrides: Partial<LegalEntity> = {}): LegalEntity => ({
  createdAt: '2026-01-01T00:00:00Z',
  entityAddress: 'Press Enclave Road, Saket',
  entityName: 'Max Super Speciality Hospital Ltd',
  gstNumber: '07AABCM1234A1Z5',
  id: 'e1',
  isActive: true,
  locationName: 'MSSH SKT',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

function listOf(entities: LegalEntity[]) {
  api.listLegalEntities.mockImplementation((query) =>
    query?.limit === 0
      ? page(
          entities.filter((one) => query.isActive === undefined || one.isActive === query.isActive),
        )
      : page(entities),
  );
}

const superAdmin = () =>
  signedIn(['HOSPITAL_VIEW', 'HOSPITAL_CREATE', 'HOSPITAL_UPDATE'], ['Super Admin']);

// Filling a whole form types many keys: on a busy machine that takes longer than the default 5 s.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/entities');
  superAdmin();
});

describe('Entities', () => {
  it('lists each entity with its location, address, GST number and status', async () => {
    listOf([entity(), entity({ id: 'e2', isActive: false, locationName: null })]);
    renderScreen(<LegalEntitiesPageClient />);

    const row = (await screen.findByText('MSSH SKT')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Max Super Speciality Hospital Ltd')).toBeInTheDocument();
    expect(within(row).getByText('Press Enclave Road, Saket')).toBeInTheDocument();
    expect(within(row).getByText('07AABCM1234A1Z5')).toBeInTheDocument();
    expect(within(row).getByRole('switch', { checked: true })).toBeEnabled();
    // No location name yet: a dash.
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(api.listLegalEntities).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'locationName', sortOrder: 'asc' }),
    );
  });

  it('says how entities get here when there are none, and why a load failed', async () => {
    listOf([]);
    const first = renderScreen(<LegalEntitiesPageClient />);
    expect(await screen.findByText('No entities found')).toBeInTheDocument();
    expect(
      screen.getByText('Add the legal entities your locations and restaurants bill under.'),
    ).toBeInTheDocument();
    first.unmount();

    api.listLegalEntities.mockRejectedValue(new Error('Entities could not be loaded'));
    renderScreen(<LegalEntitiesPageClient />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Entities could not be loaded');
  });

  it('lets only a Super Admin add, edit or switch off an entity', async () => {
    // The permissions alone are not enough: an entity heads GST invoices.
    signedIn(['HOSPITAL_VIEW', 'HOSPITAL_CREATE', 'HOSPITAL_UPDATE'], ['Admin']);
    listOf([entity()]);
    renderScreen(<LegalEntitiesPageClient />);

    await screen.findByText('MSSH SKT');
    expect(screen.queryByRole('button', { name: /New entity/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit MSSH SKT' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Max Super Speciality Hospital Ltd active' }),
    ).toBeDisabled();
  });

  it('asks for every field and a valid GST number before adding an entity', async () => {
    listOf([]);
    const { user } = renderScreen(<LegalEntitiesPageClient />);

    await user.click(await screen.findByRole('button', { name: /New entity/ }));
    const dialog = screen.getByRole('dialog', { name: 'Add entity' });
    await user.type(within(dialog).getByLabelText(/GST number/), '07AABCM1234');
    await user.click(within(dialog).getByRole('button', { name: 'Add entity' }));

    expect(await within(dialog).findByText('Location name is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('Entity name is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('Entity address is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a valid 15-character GST number.')).toBeInTheDocument();
    expect(api.createLegalEntity).not.toHaveBeenCalled();
  });

  it('adds an entity with its GST number in capitals and without spaces', async () => {
    listOf([]);
    api.createLegalEntity.mockImplementation(() => reply(entity({ id: 'e9' })));
    const { user } = renderScreen(<LegalEntitiesPageClient />);

    await user.click(await screen.findByRole('button', { name: /New entity/ }));
    const dialog = screen.getByRole('dialog', { name: 'Add entity' });
    await user.type(within(dialog).getByLabelText(/Location name/), 'MSSH SKT');
    await user.type(
      within(dialog).getByLabelText(/Entity name/),
      'Max Super Speciality Hospital Ltd',
    );
    await user.type(within(dialog).getByLabelText(/Entity address/), 'Press Enclave Road, Saket');
    await user.type(within(dialog).getByLabelText(/GST number/), '07aabcm1234a1z5 ');
    await user.click(within(dialog).getByRole('button', { name: 'Add entity' }));

    await waitFor(() =>
      expect(api.createLegalEntity).toHaveBeenCalledWith({
        entityAddress: 'Press Enclave Road, Saket',
        entityName: 'Max Super Speciality Hospital Ltd',
        gstNumber: '07AABCM1234A1Z5',
        isActive: true,
        locationName: 'MSSH SKT',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add entity' })).not.toBeInTheDocument(),
    );
  });

  it('puts a GST refusal from the API on the GST field', async () => {
    listOf([entity()]);
    api.updateLegalEntity.mockRejectedValue(new Error('GST number is already used by MSSH PPG'));
    const { user } = renderScreen(<LegalEntitiesPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Edit MSSH SKT' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit entity' });
    expect(within(dialog).getByLabelText(/Entity name/)).toHaveValue(
      'Max Super Speciality Hospital Ltd',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(api.updateLegalEntity).toHaveBeenCalledWith('e1', {
        entityAddress: 'Press Enclave Road, Saket',
        entityName: 'Max Super Speciality Hospital Ltd',
        gstNumber: '07AABCM1234A1Z5',
        isActive: true,
        locationName: 'MSSH SKT',
      }),
    );
    expect(
      await within(dialog).findByText('GST number is already used by MSSH PPG'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Entity was not updated');
  });

  it('switches an entity off once confirmed', async () => {
    listOf([entity()]);
    api.updateLegalEntity.mockImplementation(() => reply(entity({ isActive: false })));
    const { user } = renderScreen(<LegalEntitiesPageClient />);

    await user.click(
      await screen.findByRole('switch', { name: 'Max Super Speciality Hospital Ltd active' }),
    );
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() =>
      expect(api.updateLegalEntity).toHaveBeenCalledWith('e1', { isActive: false }),
    );
  });
});
