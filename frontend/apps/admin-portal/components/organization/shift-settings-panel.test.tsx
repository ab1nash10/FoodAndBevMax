import type { Restaurant } from '@aahar/api-client';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { ShiftSettingsPanel } from './shift-settings-panel';

vi.mock('@/components/auth-provider', () => import('@/test/auth'));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  getRestaurant: vi.fn<Client['getRestaurant']>(),
  updateRestaurant: vi.fn<Client['updateRestaurant']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const cafe = { id: 'rest-1', restaurantName: 'Cafe Max' };
const saved = (shiftMode: 'CASHIER' | 'FIXED', shiftTimings: Restaurant['shiftTimings'] = []) =>
  reply({ ...cafe, shiftMode, shiftTimings } as Restaurant);

beforeEach(() => {
  vi.clearAllMocks();
  signedIn(['RESTAURANT_UPDATE']);
});

describe('the shift settings panel', () => {
  it('switches to fixed shift times, starting from Morning and Evening, and saves them', async () => {
    api.getRestaurant.mockImplementation(() => saved('CASHIER'));
    api.updateRestaurant.mockImplementation(() => saved('FIXED'));
    const onClose = vi.fn();
    const { user } = renderScreen(<ShiftSettingsPanel onClose={onClose} restaurant={cafe} />);
    const dialog = screen.getByRole('dialog', { name: 'Shifts' });

    const modes = await within(dialog).findByRole('group', { name: 'Shift mode' });
    expect(within(modes).getByRole('button', { name: 'Cashier opens and closes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(modes).getByRole('button', { name: 'Fixed shift times' }));
    expect(
      within(dialog)
        .getAllByLabelText('Name')
        .map((box) => (box as HTMLInputElement).value),
    ).toEqual(['Morning', 'Evening']);
    await user.click(within(dialog).getByRole('button', { name: 'Remove Evening' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.updateRestaurant).toHaveBeenCalledWith('rest-1', {
        shiftMode: 'FIXED',
        shiftTimings: [{ endTime: '15:00', name: 'Morning', startTime: '07:00' }],
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('will not save a shift without a name or one that ends when it starts', async () => {
    api.getRestaurant.mockImplementation(() =>
      saved('FIXED', [{ endTime: '15:00', name: 'Morning', startTime: '07:00' }]),
    );
    const { user } = renderScreen(<ShiftSettingsPanel onClose={vi.fn()} restaurant={cafe} />);

    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give every shift a name.');

    await user.type(name, 'Morning');
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '07:00' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A shift must end at a different time from when it starts.',
    );
    expect(api.updateRestaurant).not.toHaveBeenCalled();
  });

  it('shows why a save failed', async () => {
    api.getRestaurant.mockImplementation(() => saved('CASHIER'));
    api.updateRestaurant.mockRejectedValue(new Error('Close the open shifts first'));
    const { user } = renderScreen(<ShiftSettingsPanel onClose={vi.fn()} restaurant={cafe} />);

    await screen.findByRole('group', { name: 'Shift mode' });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Close the open shifts first');
  });

  it('only shows the settings to those who may not change the restaurant', async () => {
    signedIn(['RESTAURANT_VIEW']);
    api.getRestaurant.mockImplementation(() =>
      saved('FIXED', [{ endTime: '15:00', name: 'Morning', startTime: '07:00' }]),
    );
    const { user } = renderScreen(<ShiftSettingsPanel onClose={vi.fn()} restaurant={cafe} />);

    expect(await screen.findByLabelText('Name')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add shift/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cashier opens and closes' }));
    expect(screen.getByRole('button', { name: 'Fixed shift times' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows why the settings failed to load', async () => {
    api.getRestaurant.mockRejectedValue(new Error('Restaurant not found'));
    renderScreen(<ShiftSettingsPanel onClose={vi.fn()} restaurant={cafe} />);

    expect(await screen.findByText('Restaurant not found')).toBeInTheDocument();
  });
});
