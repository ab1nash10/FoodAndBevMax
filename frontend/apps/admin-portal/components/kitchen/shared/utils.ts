'use client';

import { useQuery } from '@tanstack/react-query';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export const listLimit = 10;

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }

  return dateFormatter.format(new Date(value));
}

export { useMyLocations as useHospitals } from '@/components/location-context';

export function useKitchens(hospitalId?: string) {
  return useQuery({
    enabled: Boolean(hospitalId),
    queryFn: async () => {
      const response = await organizationApi.listKitchens({
        hospitalId,
        isActive: true,
        limit: 100,
        sortBy: 'kitchenName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    // Master data: fresh 5 minutes, refreshed whenever a kitchen is edited.
    queryKey: queryKeys.kitchenOptions('kitchen', hospitalId),
  });
}
