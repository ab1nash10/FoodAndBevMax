'use client';

import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Field, Input } from '@/components/ui';
import { CheckboxLine } from '@/components/master-data/shared/components';
import { MasterLocationSelect } from '@/components/master-location';

export const categorySchema = z.object({
  categoryName: z.string().trim().min(1, 'Category name is required.').max(255),
  /** Empty shares the category with every location. */
  hospitalId: z.string(),
  isActive: z.boolean(),
});

export type ItemCategoryFormValues = z.infer<typeof categorySchema>;

export const similarCategoryError = 'Similar category already exists';

export function CategoryFormFields({
  form,
}: Readonly<{ form: UseFormReturn<ItemCategoryFormValues> }>) {
  return (
    <>
      <Field
        error={form.formState.errors.categoryName?.message}
        label="Category Name"
        name="category-name"
      >
        <Input id="category-name" {...form.register('categoryName')} />
      </Field>
      <Field label="Location" name="category-location">
        <MasterLocationSelect id="category-location" {...form.register('hospitalId')} />
      </Field>
      <CheckboxLine
        input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
      >
        Active
      </CheckboxLine>
    </>
  );
}
