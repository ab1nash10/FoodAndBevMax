// The header location for the inventory and kitchen screen tests: test/location plus the two
// helpers these screens also take from location-context. Use with
// vi.mock('@/components/location-context', () => import('@/components/inventory/test-location')).
import type { HospitalSummary } from '@aahar/api-client';
import { useLocationContext } from '@/test/location';

export * from '@/test/location';

export function useMyLocations() {
  return { data: useLocationContext().availableLocations, isLoading: false };
}

export function getLocationTitle(location: HospitalSummary): string {
  return location.title || location.hospitalName || location.displayName || 'Location';
}
