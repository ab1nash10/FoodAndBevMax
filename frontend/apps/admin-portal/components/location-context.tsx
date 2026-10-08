'use client';

import type { HospitalSummary } from '@aahar/api-client';
import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/components/auth-provider';
import { userApi } from '@/lib/api';

const LOCATION_STORAGE_KEY = 'aahar.location-context';
const allLocationsValue = 'all';
const myAccessQueryKey = ['my-access'] as const;

type LocationSelectionValue = string;

interface LocationContextValue {
  availableLocations: HospitalSummary[];
  canSelectAllLocations: boolean;
  isAllLocations: boolean;
  isLocationSelectorLocked: boolean;
  isLoadingLocations: boolean;
  locationLabel: string;
  scopedHospitalId: string | undefined;
  selectedLocation: HospitalSummary | null;
  selectedLocationId: string | null;
  selectedLocationValue: LocationSelectionValue;
  setSelectedLocation: (locationId: string | null) => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

function readStoredLocationValue(): LocationSelectionValue | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(LOCATION_STORAGE_KEY);
}

function saveStoredLocationValue(value: LocationSelectionValue): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LOCATION_STORAGE_KEY, value);
}

function removeStoredLocationValue(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(LOCATION_STORAGE_KEY);
}

function getLocationTitle(location: HospitalSummary): string {
  return location.displayName || location.title || location.hospitalName || 'Location';
}

function getLocationCode(location: HospitalSummary): string {
  return location.locationCode || location.hospitalCode || '';
}

export function formatGlobalLocationLabel(location: HospitalSummary): string {
  const code = getLocationCode(location);
  const cityState = [location.city, location.state].filter(Boolean).join(', ');
  const postal = location.postalCode ? `-${location.postalCode}` : '';
  const details = `${cityState}${postal}`;

  return [code ? `${code} - ${getLocationTitle(location)}` : getLocationTitle(location), details]
    .filter(Boolean)
    .join(', ');
}

export function LocationProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { isAuthenticated, isReady } = useAuth();
  const [selectedLocationValue, setSelectedLocationValue] =
    useState<LocationSelectionValue>(allLocationsValue);
  // Pages wait for this before treating the location as settled, so the switch from the
  // initial value to the user's starting location does not count as a change.
  const [isSelectionResolved, setIsSelectionResolved] = useState(false);

  // The access token carries no locations, so the reach, the default location and the locations
  // the user may pick come from the server. Only a user who reaches every location may look at
  // all of them together.
  const accessQuery = useQuery({
    enabled: isAuthenticated,
    queryFn: async () => (await userApi.getMyAccess()).data,
    queryKey: myAccessQueryKey,
    staleTime: 60_000,
  });
  const canSelectAllLocations = accessQuery.data?.locationScope === 'ALL';
  const defaultLocationId = accessQuery.data?.defaultLocationId ?? null;

  const availableLocations = useMemo(
    () => accessQuery.data?.locations ?? [],
    [accessQuery.data?.locations],
  );

  useEffect(() => {
    // Until the stored session is read back, a signed-in user still looks signed out; clearing
    // the pick then would lose the location chosen before a page reload.
    if (!isReady) {
      return;
    }

    if (!isAuthenticated) {
      setSelectedLocationValue(allLocationsValue);
      setIsSelectionResolved(false);
      removeStoredLocationValue();
      return;
    }

    if (accessQuery.isLoading) {
      return;
    }

    // Without the location list there is nothing to choose from; the server still limits every
    // request to the user's own locations.
    if (accessQuery.isError) {
      setIsSelectionResolved(true);
      return;
    }

    const locationIds = new Set(availableLocations.map((location) => location.id));
    const storedLocationValue = readStoredLocationValue();
    // A location chosen in the header during the session wins; at sign-in (the pick is cleared
    // on sign-out) the user starts at their default location. A location the user can no longer
    // reach is ignored, and "All" is kept only for users who reach every location.
    const sessionLocationValue =
      storedLocationValue === allLocationsValue
        ? canSelectAllLocations
          ? allLocationsValue
          : null
        : storedLocationValue && locationIds.has(storedLocationValue)
          ? storedLocationValue
          : null;
    const nextLocationValue =
      sessionLocationValue ??
      (defaultLocationId && locationIds.has(defaultLocationId)
        ? defaultLocationId
        : (availableLocations[0]?.id ?? allLocationsValue));

    setSelectedLocationValue(nextLocationValue);
    saveStoredLocationValue(nextLocationValue);
    setIsSelectionResolved(true);
  }, [
    accessQuery.isError,
    accessQuery.isLoading,
    availableLocations,
    canSelectAllLocations,
    defaultLocationId,
    isAuthenticated,
    isReady,
  ]);

  const selectedLocation = useMemo(
    () =>
      selectedLocationValue === allLocationsValue
        ? null
        : (availableLocations.find((location) => location.id === selectedLocationValue) ?? null),
    [availableLocations, selectedLocationValue],
  );
  const isAllLocations = selectedLocationValue === allLocationsValue;
  const isLocationSelectorLocked = !canSelectAllLocations && availableLocations.length <= 1;

  const setSelectedLocation = useCallback(
    (locationId: string | null) => {
      const nextLocationValue =
        !locationId || locationId === allLocationsValue ? allLocationsValue : locationId;

      if (nextLocationValue === allLocationsValue && !canSelectAllLocations) {
        return;
      }

      if (
        nextLocationValue !== allLocationsValue &&
        !availableLocations.some((location) => location.id === nextLocationValue)
      ) {
        return;
      }

      setSelectedLocationValue(nextLocationValue);
      saveStoredLocationValue(nextLocationValue);
    },
    [availableLocations, canSelectAllLocations],
  );

  const contextValue = useMemo<LocationContextValue>(
    () => ({
      availableLocations,
      canSelectAllLocations,
      isAllLocations,
      isLocationSelectorLocked,
      isLoadingLocations: !isSelectionResolved,
      locationLabel: selectedLocation
        ? formatGlobalLocationLabel(selectedLocation)
        : !isSelectionResolved || canSelectAllLocations
          ? 'All Locations'
          : 'No location assigned',
      scopedHospitalId: selectedLocation?.id,
      selectedLocation,
      selectedLocationId: selectedLocation?.id ?? null,
      selectedLocationValue,
      setSelectedLocation,
    }),
    [
      availableLocations,
      canSelectAllLocations,
      isAllLocations,
      isLocationSelectorLocked,
      isSelectionResolved,
      selectedLocation,
      selectedLocationValue,
      setSelectedLocation,
    ],
  );

  return <LocationContext.Provider value={contextValue}>{children}</LocationContext.Provider>;
}

export function useLocationContext(): LocationContextValue {
  const context = useContext(LocationContext);

  if (!context) {
    throw new Error('useLocationContext must be used within LocationProvider');
  }

  return context;
}
