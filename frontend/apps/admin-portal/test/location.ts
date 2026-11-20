// The location chosen in the header, for component tests. Use with
// vi.mock('@/components/location-context', () => import('@/test/location')) and pick one with
// atLocation(ppg) (or atLocation(null) for All locations).
import type { HospitalSummary } from '@aahar/api-client';
import { vi } from 'vitest';

export const ppg = {
  displayName: 'Patparganj',
  hospitalCode: 'PPG',
  hospitalName: 'Patparganj',
  id: 'h-ppg',
  isActive: true,
} as HospitalSummary;
export const saket = {
  displayName: 'Saket',
  hospitalCode: 'SKT',
  hospitalName: 'Saket',
  id: 'h-skt',
  isActive: true,
} as HospitalSummary;

const state = { locations: [ppg, saket], selected: ppg as HospitalSummary | null };

/** The header shows this location (null: All locations), out of these the user may pick. */
export function atLocation(selected: HospitalSummary | null, locations = [ppg, saket]) {
  state.selected = selected;
  state.locations = locations;
}

export function useLocationContext() {
  return {
    availableLocations: state.locations,
    canSelectAllLocations: true,
    employeeCode: 'E1001',
    isAllLocations: state.selected === null,
    isLoadingLocations: false,
    isLocationSelectorLocked: false,
    locationLabel: state.selected?.hospitalName ?? 'All locations',
    locationsFailed: false,
    retryLocations: vi.fn(),
    scopedHospitalId: state.selected?.id,
    selectedLocation: state.selected,
    selectedLocationId: state.selected?.id ?? null,
    selectedLocationValue: state.selected?.id ?? 'all',
    setSelectedLocation: vi.fn(),
  };
}

export function LocationProvider({ children }: { children: unknown }) {
  return children;
}
