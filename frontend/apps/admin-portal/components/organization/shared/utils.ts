'use client';

import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import type { ZodError } from 'zod';
import type { ActiveFilter } from '@/components/organization/shared/types';
import { lazyValue } from '@/lib/lazy-value';

export const listLimit = 10;

export const skeletonRows = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'];

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

export function optionalValue(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
}

export function hasRequiredText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function nullableText(value: string | null | undefined): string {
  return value || 'Not set';
}

// The organization forms' zod schemas, for screens that only need them to save.
export const organizationSchemas = lazyValue(
  () => import('@/components/organization/shared/schemas'),
);
