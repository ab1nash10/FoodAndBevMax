import type { LegalEntity } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen, reply } from '@/test/harness';
import { router } from '@/test/next-navigation';
import { HospitalCreatePageClient } from './hospital-create-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  createHospital: vi.fn<Client['createHospital']>(),
  listLegalEntities: vi.fn<Client['listLegalEntities']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const entity = {
  entityAddress: 'Press Enclave Road, Saket, New Delhi',
  entityName: 'Max Super Speciality Hospital Ltd',
  gstNumber: '07AABCM1234A1Z5',
  id: 'e1',
  isActive: true,
  locationName: 'MSSH SKT',
} as LegalEntity;

// Filling a whole form types many keys: on a busy machine that takes longer than the default 5 s.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  vi.clearAllMocks();
  api.listLegalEntities.mockImplementation(() => page([entity]));
});

describe('Add Location', () => {
  it('names what is missing and sends nothing', async () => {
    const { user } = renderScreen(<HospitalCreatePageClient />);

    await user.click(screen.getByRole('button', { name: 'Save Location' }));

    expect(await screen.findByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByText('Location code is required.')).toBeInTheDocument();
    expect(screen.getByText('State is required.')).toBeInTheDocument();
    expect(screen.getByText('City is required.')).toBeInTheDocument();
    expect(api.createHospital).not.toHaveBeenCalled();
  });

  it('fills the title and address from the entity picked', async () => {
    const { user } = renderScreen(<HospitalCreatePageClient />);

    await screen.findByRole('option', { name: 'MSSH SKT · Max Super Speciality Hospital Ltd' });
    await user.selectOptions(screen.getByLabelText('Entity'), 'e1');

    expect(screen.getByLabelText(/Title/)).toHaveValue('MSSH SKT');
    expect(screen.getByLabelText('Address')).toHaveValue('Press Enclave Road, Saket, New Delhi');
  });

  it('creates the location with blanks cleared, then goes back to the list', async () => {
    api.createHospital.mockImplementation(() =>
      reply({ hospitalCode: 'SKT', hospitalName: 'Saket', id: 'h9' } as never),
    );
    const { user } = renderScreen(<HospitalCreatePageClient />);

    await user.type(screen.getByLabelText(/Title/), 'Saket');
    await user.type(screen.getByLabelText(/Location Code/), 'skt');
    await user.selectOptions(screen.getByLabelText(/State/), 'Delhi');
    await user.selectOptions(screen.getByLabelText(/City/), 'Saket');
    await user.type(screen.getByLabelText('Postal Code'), '110017');
    await user.click(screen.getByRole('radio', { name: 'RazorPay' }));
    // The location's own gateway account; the secret is a password box.
    await user.type(screen.getByLabelText('Key ID'), 'rzp_live_1');
    await user.type(screen.getByLabelText('Key Secret'), 'secret-1');
    await user.click(screen.getByRole('button', { name: 'Save Location' }));

    await waitFor(() =>
      expect(api.createHospital).toHaveBeenCalledWith(
        expect.objectContaining({
          address: null,
          city: 'Saket',
          displayName: 'Saket',
          hospitalCode: 'SKT',
          hospitalName: 'Saket',
          isActive: true,
          legalEntityId: null,
          locationCode: 'SKT',
          onlinePaymentOption: 'RAZORPAY',
          postalCode: '110017',
          razorpayKeyId: 'rzp_live_1',
          razorpayKeySecret: 'secret-1',
          state: 'Delhi',
          title: 'Saket',
        }),
      ),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/masters/locations'));
  });

  it('rejects a postal code that is not 6 digits', async () => {
    const { user } = renderScreen(<HospitalCreatePageClient />);

    await user.type(screen.getByLabelText('Postal Code'), '1100');
    await user.click(screen.getByRole('button', { name: 'Save Location' }));

    expect(await screen.findByText('Postal code must be 6 digits.')).toBeInTheDocument();
  });

  it('shows why the API refused the location', async () => {
    api.createHospital.mockRejectedValue(new Error('Location code SKT is already taken'));
    const { user } = renderScreen(<HospitalCreatePageClient />);

    await user.type(screen.getByLabelText(/Title/), 'Saket');
    await user.type(screen.getByLabelText(/Location Code/), 'SKT');
    await user.selectOptions(screen.getByLabelText(/State/), 'Delhi');
    await user.selectOptions(screen.getByLabelText(/City/), 'Saket');
    await user.click(screen.getByRole('button', { name: 'Save Location' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Location code SKT is already taken',
    );
    expect(router.push).not.toHaveBeenCalled();
  });
});
