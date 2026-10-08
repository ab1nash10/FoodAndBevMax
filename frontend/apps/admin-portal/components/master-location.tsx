'use client';

import type { HospitalSummary, LocationOwned } from '@aahar/api-client';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { useLocationContext } from '@/components/location-context';
import { Badge, Select } from '@/components/ui';

/**
 * Items, item categories, time slots and employees belong to one location or, with no location,
 * are shared by every location. In forms the shared choice is the empty value.
 */
export const SHARED_LOCATION = '';

/** A master list's Location column. */
export function MasterLocationCell({ hospital }: Readonly<{ hospital: HospitalSummary | null }>) {
  return hospital ? (
    <span className="text-ds-text-3">{hospital.hospitalName}</span>
  ) : (
    <Badge variant="neutral">All locations</Badge>
  );
}

/**
 * A Super Admin may change any of these records; everyone else only their own locations' ones
 * (the server refuses the rest). New records start at the header's location, or shared for a
 * Super Admin looking at All Locations.
 */
export function useMasterEditing() {
  const { availableLocations, canSelectAllLocations, scopedHospitalId } = useLocationContext();

  return {
    canEdit: (record: LocationOwned) => canSelectAllLocations || record.hospitalId !== null,
    defaultHospitalId:
      scopedHospitalId ??
      (canSelectAllLocations ? SHARED_LOCATION : (availableLocations[0]?.id ?? SHARED_LOCATION)),
  };
}

/** A master's Location field: one of the user's locations, or every location (Super Admin). */
export const MasterLocationSelect = forwardRef<
  HTMLSelectElement,
  ComponentPropsWithoutRef<'select'>
>((props, ref) => {
  const { availableLocations, canSelectAllLocations } = useLocationContext();

  return (
    <Select ref={ref} {...props}>
      {canSelectAllLocations ? (
        <option value={SHARED_LOCATION}>All locations (shared)</option>
      ) : null}
      {availableLocations.map((location) => (
        <option key={location.id} value={location.id}>
          {location.displayName || location.hospitalName}
        </option>
      ))}
    </Select>
  );
});

MasterLocationSelect.displayName = 'MasterLocationSelect';
