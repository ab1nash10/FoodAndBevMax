'use client';

import type { Hospital } from '@aahar/api-client';
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
import { usePreferences } from '@/components/preferences/use-preferences';
import { organizationApi } from '@/lib/api';

const LOCATION_STORAGE_KEY = 'aahar.location-context';
const allLocationsValue = 'all';

type LocationSelectionValue = string;

interface LocationContextValue {
  availableLocations: Hospital[];
  canSelectAllLocations: boolean;
  isAllLocations: boolean;
  isLocationSelectorLocked: boolean;
  isLoadingLocations: boolean;
  locationLabel: string;
  scopedHospitalId: string | undefined;
  selectedLocation: Hospital | null;
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

function isSuperAdminRole(roles: string[]): boolean {
  return roles.some((role) => role.trim().toLowerCase() === 'super admin');
}

function getLocationTitle(location: Hospital): string {
  return location.displayName || location.title || location.hospitalName || 'Location';
}

function getLocationCode(location: Hospital): string {
  return location.locationCode || location.hospitalCode || '';
}

export function formatGlobalLocationLabel(location: Hospital): string {
  const code = getLocationCode(location);
  const cityState = [location.city, location.state].filter(Boolean).join(', ');
  const postal = location.postalCode ? `-${location.postalCode}` : '';
  const details = `${cityState}${postal}`;

  return [code ? `${code} - ${getLocationTitle(location)}` : getLocationTitle(location), details]
    .filter(Boolean)
    .join(', ');
}

export function LocationProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { currentUser, isAuthenticated, roles } = useAuth();
  const [selectedLocationValue, setSelectedLocationValue] =
    useState<LocationSelectionValue>(allLocationsValue);
  const assignedLocationId = currentUser?.hospitalId ?? null;
  const canSelectAllLocations = isSuperAdminRole(roles) || !assignedLocationId;

  const locationsQuery = useQuery({
    enabled: isAuthenticated,
    queryFn: async () => {
      const response = await organizationApi.listHospitals({
        isActive: true,
        limit: 100,
        sortBy: 'displayName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['global-location-context', 'active-locations'],
    staleTime: 60_000,
  });
  const preferencesQuery = usePreferences();
  const preferredLocationId = preferencesQuery.data?.defaultLocationId ?? null;

  const availableLocations = useMemo(() => {
    const locations = locationsQuery.data ?? [];

    if (canSelectAllLocations || !assignedLocationId) {
      return locations;
    }

    return locations.filter((location) => location.id === assignedLocationId);
  }, [assignedLocationId, canSelectAllLocations, locationsQuery.data]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSelectedLocationValue(allLocationsValue);
      removeStoredLocationValue();
      return;
    }

    // Wait for the saved preferences too, so the first pick after sign-in can honour them; a
    // failed preferences request just falls through to the usual default.
    if (locationsQuery.isLoading || locationsQuery.isError || preferencesQuery.isLoading) {
      return;
    }

    const locationIds = new Set(availableLocations.map((location) => location.id));
    const storedLocationValue = readStoredLocationValue();
    // The Preferences default applies at sign-in (the stored pick is cleared on sign-out); a
    // location chosen in the header during the session still wins over it. A saved location
    // the user can no longer reach is ignored.
    const preferredLocationValue =
      preferredLocationId === allLocationsValue
        ? canSelectAllLocations
          ? allLocationsValue
          : null
        : preferredLocationId && locationIds.has(preferredLocationId)
          ? preferredLocationId
          : null;
    const defaultLocationValue =
      preferredLocationValue ??
      (canSelectAllLocations
        ? allLocationsValue
        : assignedLocationId && locationIds.has(assignedLocationId)
          ? assignedLocationId
          : (availableLocations[0]?.id ?? allLocationsValue));
    const nextLocationValue =
      storedLocationValue === allLocationsValue && canSelectAllLocations
        ? allLocationsValue
        : storedLocationValue && locationIds.has(storedLocationValue)
          ? storedLocationValue
          : defaultLocationValue;

    setSelectedLocationValue(nextLocationValue);
    saveStoredLocationValue(nextLocationValue);
  }, [
    assignedLocationId,
    availableLocations,
    canSelectAllLocations,
    isAuthenticated,
    locationsQuery.isError,
    locationsQuery.isLoading,
    preferencesQuery.isLoading,
    preferredLocationId,
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
      isLoadingLocations: locationsQuery.isLoading,
      locationLabel: selectedLocation
        ? formatGlobalLocationLabel(selectedLocation)
        : 'All Locations',
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
      locationsQuery.isLoading,
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
