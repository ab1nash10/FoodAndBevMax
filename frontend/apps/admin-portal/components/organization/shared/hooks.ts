'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiList, ApiResponse, Hospital as HospitalRecord } from '@aahar/api-client';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useHospitalOptions() {
  return useQuery<HospitalRecord[]>({
    queryFn: async () => {
      const response = await organizationApi.listHospitals({
        isActive: true,
        limit: 100,
        sortBy: 'title',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.hospitalOptions(),
  });
}

export function useEntityTotal(
  queryKey: string | readonly unknown[],
  queryFn: () => Promise<ApiResponse<ApiList<unknown>>>,
  enabled = true,
) {
  const queryKeyParts = typeof queryKey === 'string' ? [queryKey] : queryKey;

  return useQuery({
    enabled,
    queryFn: async () => {
      const response = await queryFn();

      return response.data.meta.total;
    },
    queryKey: queryKeys.dashboard(...queryKeyParts),
  });
}
