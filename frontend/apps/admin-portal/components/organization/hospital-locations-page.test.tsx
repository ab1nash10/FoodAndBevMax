import type { Hospital } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen, reply } from '@/test/harness';
import { router } from '@/test/next-navigation';
import { HospitalLocationsPageClient } from './hospital-locations-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  getHospital: vi.fn<Client['getHospital']>(),
  listLegalEntities: vi.fn<Client['listLegalEntities']>(),
  updateHospital: vi.fn<Client['updateHospital']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const patparganj = {
  address: '108A, IP Extension',
  area: null,
  billPrefix: 'PPG',
  city: 'New Delhi',
  displayName: 'Patparganj',
  hospitalCode: 'PPG',
  hospitalName: 'Patparganj',
  id: 'h-ppg',
  invoicePrefix: 'PPG',
  ipAddress: null,
  isActive: true,
  latitude: null,
  legalEntityId: null,
  locationCode: 'PPG',
  longitude: null,
  onlinePaymentOption: 'RAZORPAY',
  payuClientId: null,
  payuClientSecret: null,
  payuMerchantId: null,
  postalCode: '110092',
  razorpayKeyId: 'rzp_live_ppg',
  razorpayKeySecret: '••••9f2a',
  state: 'Delhi',
  title: 'Patparganj',
  visitingCardAddress: null,
} as Hospital;

beforeEach(() => {
  vi.clearAllMocks();
  api.listLegalEntities.mockImplementation(() => page([]));
});

describe('Edit location', () => {
  it('fills the form with the location, saying its gateway secret is saved but not showing it', async () => {
    api.getHospital.mockImplementation(() => reply(patparganj));
    renderScreen(<HospitalLocationsPageClient hospitalId="h-ppg" />);

    expect(await screen.findByRole('dialog', { name: 'Edit Patparganj' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Title/)).toHaveValue('Patparganj'));
    // An edit, not a create: no note about what creating sets up, no "Add/Update" heading.
    expect(screen.queryByText(/Creating a Location/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Add\/Update/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Location code/)).toHaveValue('PPG');
    expect(screen.getByLabelText(/City/)).toHaveValue('New Delhi');
    expect(screen.getByLabelText('Key ID')).toHaveValue('rzp_live_ppg');
    const secret = screen.getByLabelText('Key secret');
    expect(secret).toHaveValue('');
    expect(secret).toHaveAttribute(
      'placeholder',
      'Saved (••••9f2a). Type a new one to replace it.',
    );
  });

  it('saves the changes, keeping the saved secret, and goes back to the list', async () => {
    api.getHospital.mockImplementation(() => reply(patparganj));
    api.updateHospital.mockImplementation(() => reply(patparganj));
    const { user } = renderScreen(<HospitalLocationsPageClient hospitalId="h-ppg" />);

    const displayName = await screen.findByLabelText('Display name');
    await waitFor(() => expect(displayName).toHaveValue('Patparganj'));
    await user.clear(displayName);
    await user.type(displayName, 'Max Patparganj');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.updateHospital).toHaveBeenCalled());
    const [id, body] = api.updateHospital.mock.calls[0]!;
    expect(id).toBe('h-ppg');
    expect(body).toMatchObject({ displayName: 'Max Patparganj', razorpayKeyId: 'rzp_live_ppg' });
    // Left empty, the secret is not sent, so the saved one stays.
    expect(body).not.toHaveProperty('razorpayKeySecret');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/masters/locations'));
  });

  it('shows why a save failed', async () => {
    api.getHospital.mockImplementation(() => reply(patparganj));
    api.updateHospital.mockRejectedValue(new Error('Invoice prefix PPG is already used'));
    const { user } = renderScreen(<HospitalLocationsPageClient hospitalId="h-ppg" />);

    await waitFor(() => expect(screen.getByLabelText(/Title/)).toHaveValue('Patparganj'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invoice prefix PPG is already used',
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('says so when the location cannot be loaded', async () => {
    api.getHospital.mockRejectedValue(new Error('Location not found'));
    renderScreen(<HospitalLocationsPageClient hospitalId="h-gone" />);

    expect(await screen.findByText('Location not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });
});
