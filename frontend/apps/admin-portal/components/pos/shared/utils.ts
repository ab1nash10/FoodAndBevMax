'use client';

import { useQuery } from '@tanstack/react-query';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { z, type ZodError } from 'zod';
import type { Hospital } from '@aahar/api-client';
import { organizationApi } from '@/lib/api';
import type { ActiveFilter } from '@/components/pos/shared/types';
import { queryKeys } from '@/lib/query-keys';

// The spec caps a page at 20 records; the grid also offers the other sizes shown in the mockups.
export const defaultPageLimit = 20;

export const pageLimitOptions = [10, 20, 25, 50];

export const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength, `Use ${maxLength} characters or fewer.`);

export function activeFilterToBoolean(value: ActiveFilter): boolean | undefined {
  if (value === 'active') return true;
  if (value === 'inactive') return false;
  return undefined;
}

export function applyValidationErrors<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  error: ZodError,
) {
  form.clearErrors();
  error.issues.forEach((issue) => {
    const fieldName = issue.path[0];

    if (typeof fieldName === 'string') {
      form.setError(fieldName as Path<TValues>, { message: issue.message });
    }
  });
}

export function optionalValue(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function formatLocationOption(hospital: Hospital): string {
  const details = [hospital.city, hospital.state, hospital.address].filter(Boolean).join(', ');

  return `${hospital.hospitalCode} - ${hospital.hospitalName}${
    details ? `, ${details}` : ''
  } (${hospital.hospitalCode})`;
}

export function useHospitalOptions() {
  return useQuery({
    queryFn: async () =>
      (
        await organizationApi.listHospitals({
          isActive: true,
          limit: 100,
          sortBy: 'hospitalName',
          sortOrder: 'asc',
        })
      ).data.items,
    queryKey: queryKeys.posLocationOptions(),
  });
}

export function useRestaurantOptions(hospitalId?: string) {
  return useQuery({
    enabled: Boolean(hospitalId),
    queryFn: async () =>
      (
        await organizationApi.listRestaurants({
          hospitalId,
          isActive: true,
          limit: 100,
          sortBy: 'restaurantName',
          sortOrder: 'asc',
        })
      ).data.items,
    queryKey: queryKeys.posRestaurantOptions(hospitalId),
  });
}
