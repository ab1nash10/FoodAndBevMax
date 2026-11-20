import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import { atLocation, ppg, saket } from '@/test/location';
import { HeaderLocationSelector } from './header-location-selector';

// The stand-in, with the switch recorded and the user's reach set per test.
const override = vi.hoisted(() => ({ location: {} }));

vi.mock('@/components/location-context', async () => {
  const location = await import('@/test/location');
  const { formatGlobalLocationLabel, getLocationTitle } = await vi.importActual<
    typeof LocationModule
  >('@/components/location-context');
  return {
    ...location,
    formatGlobalLocationLabel,
    getLocationTitle,
    useLocationContext: () => ({ ...location.useLocationContext(), ...override.location }),
  };
});

const setSelectedLocation = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  atLocation(ppg);
  override.location = { setSelectedLocation };
});

describe('the header location', () => {
  it('names the current location', () => {
    render(<HeaderLocationSelector />);

    expect(
      screen.getByRole('button', { name: 'Select Location. Current selection: Patparganj' }),
    ).toBeInTheDocument();
  });

  it('lists the user’s locations, the current one ticked, and switches on a pick', async () => {
    const user = userEvent.setup();
    render(<HeaderLocationSelector />);

    await user.click(screen.getByRole('button', { name: /^Select Location/ }));
    expect(screen.getByRole('button', { name: /^Select Location/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await user.click(screen.getByRole('button', { name: /^Saket/ }));

    expect(setSelectedLocation).toHaveBeenCalledWith('h-skt');
    expect(screen.queryByRole('button', { name: /^Saket/ })).not.toBeInTheDocument();
  });

  it('offers All Locations only to a user who reaches every location', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<HeaderLocationSelector />);
    await user.click(screen.getByRole('button', { name: /^Select Location/ }));
    await user.click(screen.getByRole('button', { name: /^All Locations/ }));
    expect(setSelectedLocation).toHaveBeenCalledWith(null);
    unmount();

    override.location = { canSelectAllLocations: false, setSelectedLocation };
    render(<HeaderLocationSelector />);
    await user.click(screen.getByRole('button', { name: /^Select Location/ }));
    expect(screen.queryByRole('button', { name: /^All Locations/ })).not.toBeInTheDocument();
  });

  it('closes on Esc without changing the location', async () => {
    const user = userEvent.setup();
    render(<HeaderLocationSelector />);
    await user.click(screen.getByRole('button', { name: /^Select Location/ }));

    await user.keyboard('{Escape}');

    expect(
      screen.queryByText('Choose a location to view location-specific data'),
    ).not.toBeInTheDocument();
    expect(setSelectedLocation).not.toHaveBeenCalled();
  });

  it('shows a single-location user where they are, with nothing to pick', async () => {
    const user = userEvent.setup();
    atLocation(saket, [saket]);
    override.location = { isLocationSelectorLocked: true, setSelectedLocation };
    render(<HeaderLocationSelector />);

    const button = screen.getByRole('button', { name: 'Your location: Saket' });
    await user.click(button);

    expect(
      screen.queryByText('Choose a location to view location-specific data'),
    ).not.toBeInTheDocument();
  });

  it('says so when the user has no active location', async () => {
    const user = userEvent.setup();
    atLocation(null, []);
    override.location = { canSelectAllLocations: false, setSelectedLocation };
    render(<HeaderLocationSelector />);

    await user.click(screen.getByRole('button', { name: /^Select Location/ }));

    expect(screen.getByText('No active locations available.')).toBeInTheDocument();
  });
});
