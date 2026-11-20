import type { PosDevice, Restaurant } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen, reply } from '@/test/harness';
import { RestaurantAccessibilityModal } from './restaurant-accessibility-modal';

type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  listRestaurants: vi.fn<Client['listRestaurants']>(),
  updatePosDevice: vi.fn<Client['updatePosDevice']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const till = {
  code: 'POS-01',
  hospitalId: 'h-ppg',
  id: 'pd-1',
  restaurantIds: ['r1'],
} as PosDevice;
const restaurants = [
  { id: 'r1', restaurantName: 'Cafe Max' },
  { id: 'r2', restaurantName: 'Food Court' },
] as Restaurant[];

beforeEach(() => {
  vi.clearAllMocks();
  api.listRestaurants.mockImplementation(() => page(restaurants));
});

describe("a POS device's restaurant accessibility", () => {
  it("ticks the restaurants the device reaches among its location's active ones", async () => {
    renderScreen(<RestaurantAccessibilityModal device={till} onClose={vi.fn()} />);

    expect(
      screen.getByRole('dialog', { name: "Restaurant's Accessibility - POS-01" }),
    ).toBeVisible();
    expect(await screen.findByRole('checkbox', { name: 'Cafe Max' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Food Court' })).not.toBeChecked();
    expect(api.listRestaurants).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalId: 'h-ppg', isActive: true }),
    );
  });

  it('saves the restaurants ticked', async () => {
    api.updatePosDevice.mockImplementation(() => reply(till));
    const onClose = vi.fn();
    const { user } = renderScreen(<RestaurantAccessibilityModal device={till} onClose={onClose} />);

    await user.click(await screen.findByRole('checkbox', { name: 'Food Court' }));
    await user.click(screen.getByRole('checkbox', { name: 'Cafe Max' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(api.updatePosDevice).toHaveBeenCalledWith('pd-1', { restaurantIds: ['r2'] }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('says when the location has no active restaurants', async () => {
    api.listRestaurants.mockImplementation(() => page([]));
    renderScreen(<RestaurantAccessibilityModal device={till} onClose={vi.fn()} />);

    expect(
      await screen.findByText('No active restaurants found for this location.'),
    ).toBeInTheDocument();
  });

  it('shows why a save failed', async () => {
    api.updatePosDevice.mockRejectedValue(new Error('Restaurant is at another location'));
    const { user } = renderScreen(<RestaurantAccessibilityModal device={till} onClose={vi.fn()} />);

    await screen.findByRole('checkbox', { name: 'Cafe Max' });
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Restaurant is at another location');
  });
});
