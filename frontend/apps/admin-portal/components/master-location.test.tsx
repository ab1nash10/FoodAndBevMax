import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import { atLocation, ppg, saket } from '@/test/location';
import { MasterLocationCell, MasterLocationSelect, useMasterEditing } from './master-location';

// The stand-in, with a user's reach set per test.
const override = vi.hoisted(() => ({ location: {} }));

vi.mock('@/components/location-context', async () => {
  const location = await import('@/test/location');
  const { getLocationTitle } = await vi.importActual<typeof LocationModule>(
    '@/components/location-context',
  );
  return {
    ...location,
    getLocationTitle,
    useLocationContext: () => ({ ...location.useLocationContext(), ...override.location }),
  };
});

let editing: ReturnType<typeof useMasterEditing>;
function Editing() {
  editing = useMasterEditing();
  return null;
}

beforeEach(() => {
  override.location = {};
  atLocation(ppg);
});

describe('a master record’s location', () => {
  it('shows the location, or All locations for a shared record', () => {
    const { rerender } = render(<MasterLocationCell hospital={ppg} />);
    expect(screen.getByText('Patparganj')).toBeInTheDocument();

    rerender(<MasterLocationCell hospital={null} />);
    expect(screen.getByText('All locations')).toBeInTheDocument();
  });

  it('offers the shared choice only to a user who reaches every location', () => {
    const { unmount } = render(<MasterLocationSelect aria-label="Location" />);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All locations (shared)',
      'Patparganj',
      'Saket',
    ]);
    unmount();

    override.location = { canSelectAllLocations: false };
    render(<MasterLocationSelect aria-label="Location" />);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Patparganj',
      'Saket',
    ]);
  });

  it('lets a Super Admin change any record, others only their locations’ ones', () => {
    render(<Editing />);
    expect(editing.canEdit({ hospital: null, hospitalId: null })).toBe(true);

    override.location = { canSelectAllLocations: false };
    render(<Editing />);
    expect(editing.canEdit({ hospital: null, hospitalId: null })).toBe(false);
    expect(editing.canEdit({ hospital: ppg, hospitalId: 'h-ppg' })).toBe(true);
  });

  it('starts a new record at the header’s location, or shared for a Super Admin at All locations', () => {
    render(<Editing />);
    expect(editing.defaultHospitalId).toBe('h-ppg');

    atLocation(null);
    render(<Editing />);
    expect(editing.defaultHospitalId).toBe('');

    atLocation(null, [saket]);
    override.location = { canSelectAllLocations: false };
    render(<Editing />);
    expect(editing.defaultHospitalId).toBe('h-skt');
  });
});
