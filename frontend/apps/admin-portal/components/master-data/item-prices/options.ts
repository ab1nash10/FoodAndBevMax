'use client';

import { useQuery } from '@tanstack/react-query';
import type { Hospital, RateType, Restaurant } from '@aahar/api-client';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export type RateTypeFilter = '' | RateType;

export function formatLocationOption(hospital: Hospital): string {
  const code = hospital.locationCode || hospital.hospitalCode;
  const name = hospital.displayName || hospital.title || hospital.hospitalName;
  const locality = [hospital.city, hospital.state].filter(Boolean).join(', ');
  const suffix = hospital.postalCode ? `${locality}-${hospital.postalCode}` : locality;

  return [code, [name, suffix].filter(Boolean).join(', ')].filter(Boolean).join(' - ');
}

export function useHospitalOptions() {
  return useQuery<Hospital[]>({
    queryFn: async () => {
      const response = await organizationApi.listHospitals({
        isActive: true,
        limit: 100,
        sortBy: 'hospitalName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.locationOptions(),
  });
}

export function useRestaurantOptions(hospitalId?: string) {
  return useQuery<Restaurant[]>({
    enabled: Boolean(hospitalId),
    queryFn: async () => {
      const response = await organizationApi.listRestaurants({
        hospitalId,
        isActive: true,
        limit: 100,
        sortBy: 'restaurantName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.restaurantOptions(hospitalId),
  });
}
