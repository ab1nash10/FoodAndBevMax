'use client';

import { useQuery } from '@tanstack/react-query';
import type { Hospital as HospitalRecord } from '@aahar/api-client';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** Active legal entities to link a location or restaurant to, by name. */
export function useLegalEntityOptions() {
  return useQuery({
    queryFn: async () =>
      (
        await organizationApi.listLegalEntities({
          isActive: true,
          limit: 100,
          sortBy: 'locationName',
          sortOrder: 'asc',
        })
      ).data.items,
    queryKey: queryKeys.legalEntityOptions(),
  });
}

/** Every legal entity by id, inactive ones too, to name a record's entity in a list. */
export function useLegalEntityNames() {
  return useQuery({
    queryFn: async () => (await organizationApi.listLegalEntities({ limit: 100 })).data.items,
    queryKey: queryKeys.legalEntities('names'),
    select: (entities) => new Map(entities.map((entity) => [entity.id, entity])),
  });
}

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
