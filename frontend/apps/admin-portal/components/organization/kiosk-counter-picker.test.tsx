import type { Counter, Restaurant } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { KioskCounterPicker } from './kiosk-counter-picker';

vi.mock('@/components/auth-provider', () => import('@/test/auth'));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  listCounters: vi.fn<Client['listCounters']>(),
  setRestaurantKioskCounter: vi.fn<Client['setRestaurantKioskCounter']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const cafe = { id: 'rest-1', kioskCounterId: null, restaurantName: 'Cafe Max' } as Restaurant;
const counters = [
  { counterCode: 'C-01', counterName: 'Billing 1', id: 'c1' },
  { counterCode: 'C-02', counterName: 'Billing 2', id: 'c2' },
] as Counter[];

beforeEach(() => {
  vi.clearAllMocks();
  signedIn(['RESTAURANT_UPDATE']);
  api.listCounters.mockImplementation(() => page(counters));
});

describe('the kiosk counter picker', () => {
  it("offers the restaurant's active counters, the kiosk being off without one", async () => {
    renderScreen(<KioskCounterPicker restaurant={cafe} />);

    const picker = screen.getByLabelText('Kiosk orders are billed at');
    expect(await screen.findByRole('option', { name: 'Billing 2 (C-02)' })).toBeInTheDocument();
    expect(picker).toHaveValue('');
    expect(api.listCounters).toHaveBeenCalledWith({
      isActive: true,
      limit: 100,
      restaurantId: 'rest-1',
    });
  });

  it('saves the counter picked, and turning it off sends no counter', async () => {
    api.setRestaurantKioskCounter.mockImplementation(() => reply(cafe));
    const { user } = renderScreen(<KioskCounterPicker restaurant={cafe} />);

    await screen.findByRole('option', { name: 'Billing 1 (C-01)' });
    await user.selectOptions(screen.getByLabelText('Kiosk orders are billed at'), 'c1');
    await waitFor(() => expect(api.setRestaurantKioskCounter).toHaveBeenCalledWith('rest-1', 'c1'));
    expect(await screen.findByText('Kiosk counter saved')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Kiosk orders are billed at'), '');
    await waitFor(() => expect(api.setRestaurantKioskCounter).toHaveBeenCalledWith('rest-1', null));
    expect(await screen.findByText('Kiosk turned off')).toBeInTheDocument();
  });

  it('puts the counter back and says why when the save fails', async () => {
    api.setRestaurantKioskCounter.mockRejectedValue(new Error('Counter has no card machine'));
    const { user } = renderScreen(
      <KioskCounterPicker restaurant={{ ...cafe, kioskCounterId: 'c2' }} />,
    );

    await screen.findByRole('option', { name: 'Billing 1 (C-01)' });
    const picker = screen.getByLabelText('Kiosk orders are billed at');
    await user.selectOptions(picker, 'c1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Counter has no card machine');
    expect(picker).toHaveValue('c2');
  });

  it('cannot be changed without RESTAURANT_UPDATE', async () => {
    signedIn(['RESTAURANT_VIEW']);
    renderScreen(<KioskCounterPicker restaurant={cafe} />);

    await screen.findByRole('option', { name: 'Billing 1 (C-01)' });
    expect(screen.getByLabelText('Kiosk orders are billed at')).toBeDisabled();
  });
});
