'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { z, type ZodError } from 'zod';
import type { ApiList, ApiResponse, Hospital, Item, ItemType, ListQuery } from '@aahar/api-client';
import { organizationApi } from '@/lib/api';
import type { ActiveFilter, MappingFormValues } from '@/components/mapping-foundation/shared/types';
import { queryKeys } from '@/lib/query-keys';

export const listLimit = 10;

export const skeletonRows = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'];

export const mappingSchema = z.object({
  isActive: z.boolean(),
  itemId: z.string().uuid('Select an item.'),
  parentId: z.string().uuid('Select a parent.'),
});

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function activeFilterToBoolean(value: ActiveFilter): boolean | undefined {
  if (value === 'active') {
    return true;
  }

  if (value === 'inactive') {
    return false;
  }

  return undefined;
}

export function applyValidationErrors<TFormValues extends FieldValues>(
  form: UseFormReturn<TFormValues>,
  error: ZodError,
) {
  form.clearErrors();

  error.issues.forEach((issue) => {
    const fieldName = issue.path[0];

    if (typeof fieldName === 'string') {
      form.setError(fieldName as Path<TFormValues>, {
        message: issue.message,
      });
    }
  });
}

export function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

export function useEntityList<TItem, TQuery extends ListQuery>(
  entityKey: string,
  query: TQuery,
  list: (query: TQuery) => Promise<ApiResponse<ApiList<TItem>>>,
) {
  return useQuery({
    queryFn: async () => {
      const response = await list(query);

      return response.data;
    },
    queryKey: [entityKey, query],
  });
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
    queryKey: queryKeys.mappingHospitalOptions(),
  });
}

export function useItemOptions(itemType?: ItemType) {
  return useQuery<Item[]>({
    queryFn: async () => {
      const response = await organizationApi.listItems({
        isActive: true,
        itemType,
        limit: 100,
        sortBy: 'itemName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.itemOptions(itemType ?? 'all'),
  });
}

export function emptyMappingFormValues(): MappingFormValues {
  return {
    isActive: true,
    itemId: '',
    parentId: '',
  };
}

export function useInvalidateMappingQueries(entityKey: string, optionKey: string) {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: [entityKey] });
    void queryClient.invalidateQueries({ queryKey: [optionKey] });
  };
}
