import type { Hospital, LegalEntity, Restaurant } from '@aahar/api-client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { router } from '@/test/next-navigation';
import { RestaurantCreatePageClient, RestaurantEditPageClient } from './restaurant-form-pages';

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
  createRestaurant: vi.fn<Client['createRestaurant']>(),
  getRestaurant: vi.fn<Client['getRestaurant']>(),
  listHospitals: vi.fn<Client['listHospitals']>(),
  listLegalEntities: vi.fn<Client['listLegalEntities']>(),
  updateRestaurant: vi.fn<Client['updateRestaurant']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

// The form checks the location is a real id (a UUID).
const patparganj = {
  ...ppg,
  city: 'New Delhi',
  hospitalCode: 'PPG',
  id: '11111111-1111-4111-8111-111111111111',
  legalEntityId: 'e1',
  locationCode: 'PPG',
  title: 'Patparganj',
} as unknown as Hospital;
const entity = {
  entityAddress: '108A, IP Extension, New Delhi',
  entityName: 'Balaji Medical and Diagnostic Research Centre',
  gstNumber: '07AABCB1234A1Z5',
  id: 'e1',
  isActive: true,
  locationName: 'MSSH PPG',
} as LegalEntity;
const cafe = {
  accountNumber: null,
  address: null,
  coverImageUrl: null,
  email: 'cafe@max.test',
  gstAddress: null,
  gstNumber: null,
  hospital: patparganj,
  hospitalId: patparganj.id,
  id: 'rest-1',
  isActive: true,
  isAtTableDiningEnabled: false,
  isDeliveryEnabled: false,
  isHomeDeliveryEnabled: false,
  isIhcOnly: false,
  isInCarDiningEnabled: false,
  isInRoomDiningEnabled: true,
  isInventoryEnabled: false,
  isOffline: false,
  isOnlineOrdersEnabled: true,
  isOpen24x7: false,
  isPosOrdersEnabled: true,
  isRegisteredInGst: false,
  isTakeawayEnabled: false,
  isVegOnly: false,
  legalEntityId: null,
  mobile: '9876543210',
  restaurantCode: 'RST-0001',
  restaurantName: 'Cafe Max',
  thumbnailUrl: '/uploads/cafe.png',
} as unknown as Restaurant;

// Filling a whole form types many keys: on a busy machine that takes longer than the default 5 s.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  vi.clearAllMocks();
  atLocation(patparganj, [patparganj]);
  signedIn(['RESTAURANT_VIEW', 'RESTAURANT_CREATE', 'RESTAURANT_UPDATE']);
  api.listHospitals.mockImplementation(() => page([patparganj]));
  api.listLegalEntities.mockImplementation(() => page([entity]));
});

describe('Create Restaurant', () => {
  it("starts at the header location, billing under that location's entity", async () => {
    renderScreen(<RestaurantCreatePageClient />);

    // Once its option has loaded, the select shows the location.
    await waitFor(() => expect(screen.getByLabelText(/Location/)).toHaveValue(patparganj.id));
    await waitFor(() => expect(screen.getByLabelText('Entity')).toHaveValue('e1'));
    expect(screen.getByLabelText('Legal Name')).toHaveValue(
      'Balaji Medical and Diagnostic Research Centre',
    );
    expect(screen.getByLabelText('GST Number')).toHaveValue('07AABCB1234A1Z5');
    expect(screen.getByLabelText('Registered in GST')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Create Restaurant' })).toBeDisabled();
    expect(screen.getByText('Restaurant name is required.')).toBeInTheDocument();
  });

  it('creates the restaurant with the options ticked and goes back to the list', async () => {
    api.createRestaurant.mockImplementation(() => reply(cafe));
    const { user } = renderScreen(<RestaurantCreatePageClient />);

    await waitFor(() => expect(screen.getByLabelText('Entity')).toHaveValue('e1'));
    await user.type(screen.getByLabelText(/^Name/), 'Cafe Max');
    await user.click(screen.getByRole('checkbox', { name: 'POS Orders' }));
    await user.click(screen.getByRole('checkbox', { name: 'Online Orders' }));
    // Its dine-in tables' QRs take orders.
    await user.click(screen.getByRole('checkbox', { name: 'At Table Dining' }));
    await user.click(screen.getByRole('button', { name: 'Create Restaurant' }));

    await waitFor(() => expect(api.createRestaurant).toHaveBeenCalled());
    expect(api.createRestaurant.mock.calls[0]![0]).toMatchObject({
      gstAddress: '108A, IP Extension, New Delhi',
      gstNumber: '07AABCB1234A1Z5',
      hospitalId: patparganj.id,
      isActive: true,
      isAtTableDiningEnabled: true,
      isOffline: false,
      isOnlineOrdersEnabled: true,
      isPosOrdersEnabled: true,
      legalEntityId: 'e1',
      mobile: null,
      restaurantName: 'Cafe Max',
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/masters/restaurants'));
  });

  it('checks the email, mobile and GST number before sending', async () => {
    const { user } = renderScreen(<RestaurantCreatePageClient />);

    await user.type(screen.getByLabelText(/^Name/), 'Cafe Max');
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Mobile'), '98765');
    await user.clear(screen.getByLabelText('GST Number'));
    await user.type(screen.getByLabelText('GST Number'), '07ABC');
    await user.click(screen.getByRole('button', { name: 'Create Restaurant' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid 10 digit mobile number.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid 15-character GST number.')).toBeInTheDocument();
    expect(api.createRestaurant).not.toHaveBeenCalled();
  });

  it('turns an image that is not JPG, PNG or WEBP away', () => {
    renderScreen(<RestaurantCreatePageClient />);

    fireEvent.change(screen.getByLabelText('Thumbnail upload'), {
      target: { files: [new File(['gif'], 'logo.gif', { type: 'image/gif' })] },
    });

    expect(screen.getByText('Choose a JPG, PNG, or WEBP image.')).toBeInTheDocument();
  });

  it('shows why the API refused the restaurant', async () => {
    api.createRestaurant.mockRejectedValue(new Error('Restaurant name already exists'));
    const { user } = renderScreen(<RestaurantCreatePageClient />);

    await waitFor(() => expect(screen.getByLabelText('Entity')).toHaveValue('e1'));
    await user.type(screen.getByLabelText(/^Name/), 'Cafe Max');
    await user.click(screen.getByRole('button', { name: 'Create Restaurant' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Restaurant name already exists');
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('Update Restaurant', () => {
  it('fills the form with the restaurant and saves it, keeping its saved images', async () => {
    api.getRestaurant.mockImplementation(() => reply(cafe));
    api.updateRestaurant.mockImplementation(() => reply(cafe));
    const { user } = renderScreen(<RestaurantEditPageClient restaurantId="rest-1" />);

    const name = await screen.findByLabelText(/^Name/);
    await waitFor(() => expect(name).toHaveValue('Cafe Max'));
    expect(screen.getByLabelText('Restaurant Code')).toHaveValue('RST-0001');
    expect(screen.getByLabelText('Mobile')).toHaveValue('9876543210');
    // Saved on their own, from their panels.
    expect(screen.getByRole('button', { name: /Staff discount/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Shift settings/ })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Email'));
    await user.click(screen.getByRole('button', { name: 'Update Restaurant' }));

    await waitFor(() => expect(api.updateRestaurant).toHaveBeenCalled());
    const [id, body] = api.updateRestaurant.mock.calls[0]!;
    expect(id).toBe('rest-1');
    // A box emptied on an edit is sent as null, so the saved value is removed.
    expect(body).toMatchObject({
      email: null,
      restaurantName: 'Cafe Max',
      thumbnailUrl: '/uploads/cafe.png',
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/masters/restaurants'));
  });

  it('says so when the restaurant cannot be loaded', async () => {
    api.getRestaurant.mockRejectedValue(new Error('Restaurant not found'));
    renderScreen(<RestaurantEditPageClient restaurantId="gone" />);

    expect(await screen.findByText('Restaurant not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update Restaurant' })).not.toBeInTheDocument();
  });
});
