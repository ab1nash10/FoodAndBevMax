'use client';

import { useQuery } from '@tanstack/react-query';
import type { UseFormReturn } from 'react-hook-form';
import type { FoodType, ItemCategory } from '@aahar/api-client';
import { Field, FieldError, Input, RequiredMark, Skeleton } from '@/components/ui';
import { organizationApi } from '@/lib/api';
import { CheckboxLine } from '@/components/master-data/shared/components';
import { lazyValue } from '@/lib/lazy-value';
import { queryKeys } from '@/lib/query-keys';

export const foodTypeValues = ['VEG', 'NON_VEG', 'EGGETARIAN'] as const;

export type FoodTypeFilter = '' | FoodType;

export interface ItemFormValues {
  hsnCode: string;
  isActive: boolean;
  itemCode: string;
  itemName: string;
  preparationTimeMinutes: string;
  type: FoodTypeFilter;
}

/** The server's answer when the name (ignoring case, spaces and punctuation) is taken. */
export const similarItemError = 'An item with this name already exists';

export function useItemCategoryOptions() {
  return useQuery<ItemCategory[]>({
    queryFn: async () => {
      const response = await organizationApi.listItemCategories({
        isActive: true,
        limit: 100,
        sortBy: 'categoryName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.itemCategoryOptions(),
  });
}

export function emptyItemFormValues(): ItemFormValues {
  return {
    hsnCode: '',
    isActive: true,
    itemCode: '',
    itemName: '',
    preparationTimeMinutes: '',
    type: '',
  };
}

export const foodTypeFormLabels: Record<(typeof foodTypeValues)[number], string> = {
  EGGETARIAN: 'Egg',
  NON_VEG: 'Non-veg',
  VEG: 'Veg',
};

export function ItemFormFields({ form }: Readonly<{ form: UseFormReturn<ItemFormValues> }>) {
  // At most two columns, so the same fields fit the create page and the side panel.
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.itemName?.message}
          label="Item name"
          name="item-name"
          required
        >
          {/* A name field: the shared Input applies the naming convention (lib/names.ts). */}
          <Input id="item-name" placeholder="e.g. Veg Thali" {...form.register('itemName')} />
        </Field>
        <Field label="Item code" name="item-code">
          <Input
            disabled
            id="item-code"
            readOnly
            value={form.watch('itemCode') || 'Auto-generated after save'}
          />
        </Field>
      </div>
      <p className="rounded-md border border-ds-border bg-ds-subtle px-3 py-2 text-[13px] text-ds-muted">
        Category and item type are set when the item is mapped: to a store (Store Items) it becomes
        MRP, to a kitchen (Kitchen Items) Readymade.
      </p>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-semibold leading-none text-ds-text-2">
          Food type
          <RequiredMark />
          <span className="sr-only"> (required)</span>
        </legend>
        <div className="grid grid-cols-3 gap-2 pt-2">
          {foodTypeValues.map((type) => (
            <label
              className="flex min-h-control cursor-pointer items-center gap-2 rounded-control border border-ds-input bg-ds-surface px-3 text-sm font-medium text-ds-text-2 transition has-checked:border-ds-primary has-checked:bg-ds-primary-soft has-checked:text-ds-link has-focus-visible:ring-2 has-focus-visible:ring-ds-primary"
              key={type}
            >
              <input className="h-4 w-4" type="radio" value={type} {...form.register('type')} />
              {foodTypeFormLabels[type]}
            </label>
          ))}
        </div>
        <FieldError>{form.formState.errors.type?.message}</FieldError>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.preparationTimeMinutes?.message}
          label="Preparation time"
          name="item-preparation-time"
        >
          <Input
            id="item-preparation-time"
            min={0}
            placeholder="Minutes"
            type="number"
            {...form.register('preparationTimeMinutes')}
          />
        </Field>
        <Field error={form.formState.errors.hsnCode?.message} label="HSN code" name="item-hsn-code">
          <Input id="item-hsn-code" {...form.register('hsnCode')} />
        </Field>
      </div>
      <CheckboxLine
        input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
      >
        Active
      </CheckboxLine>
    </>
  );
}

export const rupees = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  maximumFractionDigits: 2,
  style: 'currency',
});

export function todayValue(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function LoadingRows() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-2/3" />
    </div>
  );
}

// The item form's zod schema, loaded after the list renders (only a save needs it).
export const itemSchemaLoader = lazyValue(() =>
  import('@/components/master-data/items/item-schema').then((module) => module.itemSchema),
);
