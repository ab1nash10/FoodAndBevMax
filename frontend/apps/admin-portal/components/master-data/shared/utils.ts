'use client';

import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import type { ZodError } from 'zod';
import type { ActiveFilter } from '@/components/master-data/shared/types';

export const listLimit = 10;

export const skeletonRows = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'];

export const itemTypeValues = ['MRP', 'READYMADE', 'LIVE'] as const;

export const rateTypeValues = ['NORMAL', 'STAFF', 'ROOM', 'COUNTER'] as const;

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateOnlyFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
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

export function formatDateOnly(value: string | null): string {
  return value ? dateOnlyFormatter.format(new Date(value)) : 'Open ended';
}

export function formatEnum(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0)}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

export function optionalValue(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
}
