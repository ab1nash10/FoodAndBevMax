'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import type { Hospital, Item, ItemPriceInput, RateType, Restaurant } from '@aahar/api-client';
import { Field, Input, Select } from '@/components/ui';
import { organizationApi } from '@/lib/api';
import { CheckboxLine } from '@/components/master-data/shared/components';
import type { ItemTypeFilter } from '@/components/master-data/shared/types';
import { formatEnum, optionalValue, rateTypeValues } from '@/components/master-data/shared/utils';
import { optionalText } from '@/components/master-data/shared/schemas';
import { queryKeys } from '@/lib/query-keys';
import {
  formatLocationOption,
  type RateTypeFilter,
} from '@/components/master-data/item-prices/options';
import { SetupNotice } from '@/components/location-empty-states';

const gstPercentValues = ['0', '5', '12', '18'] as const;

const rateTypeSchema = z.custom<RateType>((value) => rateTypeValues.includes(value as RateType), {
  message: 'Select rate type.',
});

export const itemPriceSchema = z
  .object({
    effectiveFrom: z.string().trim().min(1, 'Effective From is required.'),
    effectiveTo: optionalText(20),
    gstPercent: z.string().trim(),
    hospitalId: z.string().uuid('Select a location.'),
    isActive: z.boolean(),
    isTaxInclusive: z.boolean(),
    itemId: z.string().uuid('Select an item.'),
    price: z
      .string()
      .trim()
      .min(1, 'Price is required.')
      .refine((value) => Number(value) > 0, 'Price must be greater than 0.')
      .transform((value) => Number(value)),
    rateType: rateTypeSchema,
    restaurantId: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (values.isTaxInclusive && !values.gstPercent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select GST Percentage.',
        path: ['gstPercent'],
      });
    }

    if (
      values.gstPercent &&
      !gstPercentValues.includes(values.gstPercent as (typeof gstPercentValues)[number])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GST Percentage must be one of 0, 5, 12, or 18.',
        path: ['gstPercent'],
      });
    }

    if (
      values.effectiveTo &&
      new Date(values.effectiveTo).getTime() <= new Date(values.effectiveFrom).getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Effective To must be greater than Effective From.',
        path: ['effectiveTo'],
      });
    }
  });

type ItemPriceParsedValues = z.infer<typeof itemPriceSchema>;

type ItemPriceItemOption = Pick<Item, 'id' | 'itemCode' | 'itemName' | 'itemType'>;

export interface ItemPriceFormValues {
  effectiveFrom: string;
  effectiveTo: string;
  gstPercent: string;
  hospitalId: string;
  isActive: boolean;
  isTaxInclusive: boolean;
  itemId: string;
  price: string;
  rateType: RateTypeFilter;
  restaurantId: string;
}

export function toItemPricePayload(values: ItemPriceParsedValues): ItemPriceInput {
  return {
    effectiveFrom: values.effectiveFrom,
    effectiveTo: optionalValue(values.effectiveTo) ?? null,
    gstPercent: values.isTaxInclusive ? Number(values.gstPercent) : undefined,
    hospitalId: values.hospitalId,
    isActive: values.isActive,
    isTaxInclusive: values.isTaxInclusive,
    itemId: values.itemId,
    price: values.price,
    rateType: values.rateType,
    restaurantId: optionalValue(values.restaurantId) ?? null,
  };
}

export const overlappingItemPriceError =
  'An active price already exists for this item, rate type, and date range.';

export function useItemOptions(itemType?: ItemTypeFilter, search = '') {
  return useQuery<Item[]>({
    queryFn: async () => {
      const response = await organizationApi.listItems({
        isActive: true,
        itemType: itemType || undefined,
        limit: 100,
        search: optionalValue(search),
        sortBy: 'itemName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.itemOptions(itemType ?? 'all', search),
  });
}

export function emptyItemPriceFormValues(): ItemPriceFormValues {
  return {
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
    gstPercent: '',
    hospitalId: '',
    isActive: true,
    isTaxInclusive: true,
    itemId: '',
    price: '',
    rateType: '',
    restaurantId: '',
  };
}

export function getItemPriceItemOptions(
  items: Item[] | undefined,
  selectedItem?: ItemPriceItemOption,
): ItemPriceItemOption[] | undefined {
  if (!selectedItem) {
    return items;
  }

  if (items?.some((item) => item.id === selectedItem.id)) {
    return items;
  }

  return [selectedItem, ...(items ?? [])];
}

export function formatItemPriceItemLabel(item: ItemPriceItemOption): string {
  return `${item.itemName} (${item.itemCode}) - ${formatEnum(item.itemType)}`;
}

function ItemPriceItemCombobox({
  error,
  form,
  isLoading,
  items,
  onSearch,
  search,
}: Readonly<{
  error?: string;
  form: UseFormReturn<ItemPriceFormValues>;
  isLoading?: boolean;
  items: ItemPriceItemOption[] | undefined;
  onSearch: (value: string) => void;
  search: string;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedItemId = form.watch('itemId');
  const selectedItem = items?.find((item) => item.id === selectedItemId);
  const displayValue = search || (selectedItem ? formatItemPriceItemLabel(selectedItem) : '');
  const hasItems = Boolean(items?.length);

  function selectItem(item: ItemPriceItemOption): void {
    const label = formatItemPriceItemLabel(item);

    form.setValue('itemId', item.id, { shouldDirty: true, shouldValidate: true });
    onSearch(label);
    setIsOpen(false);
  }

  return (
    <Field error={error} label="Item *" name="price-item">
      <div className="relative">
        <Input
          aria-autocomplete="list"
          aria-controls="price-item-options"
          aria-expanded={isOpen}
          aria-label="Item"
          autoComplete="off"
          id="price-item"
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 120);
          }}
          onChange={(event) => {
            onSearch(event.target.value);
            form.setValue('itemId', '', { shouldDirty: true, shouldValidate: true });
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Type item name or code"
          role="combobox"
          value={displayValue}
        />
        <input type="hidden" {...form.register('itemId')} />
        {isOpen ? (
          <div
            className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-md border border-ds-border bg-white py-1 text-sm shadow-lg shadow-ds-text/10"
            id="price-item-options"
            role="listbox"
          >
            {isLoading ? (
              <div className="px-3 py-2 text-ds-muted">Loading active items...</div>
            ) : hasItems ? (
              items?.map((item) => (
                <button
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-ds-text-2 hover:bg-ds-teal-soft hover:text-ds-teal-text"
                  key={item.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectItem(item);
                  }}
                  role="option"
                  type="button"
                >
                  <span className="truncate">{formatItemPriceItemLabel(item)}</span>
                  {item.id === selectedItemId ? (
                    <span className="text-xs font-semibold text-ds-teal-text">Selected</span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-ds-muted">
                {search ? (
                  'No active items match your search.'
                ) : (
                  <SetupNotice href="/masters/items/new" linkLabel="Create an item">
                    There are no active items to price yet.
                  </SetupNotice>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Field>
  );
}

export function ItemPriceFormFields({
  form,
  hospitals,
  isLocationLocked,
  isItemsLoading,
  itemSearch,
  items,
  onItemSearch,
  restaurants,
}: Readonly<{
  form: UseFormReturn<ItemPriceFormValues>;
  hospitals: Hospital[] | undefined;
  isLocationLocked?: boolean;
  isItemsLoading?: boolean;
  itemSearch: string;
  items: ItemPriceItemOption[] | undefined;
  onItemSearch: (value: string) => void;
  restaurants: Restaurant[] | undefined;
}>) {
  const selectedHospitalId = form.watch('hospitalId');
  const isTaxInclusive = form.watch('isTaxInclusive');

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.hospitalId?.message}
          label="Location"
          name="price-location"
        >
          <Select
            disabled={isLocationLocked}
            id="price-location"
            onChange={(event) => {
              form.setValue('hospitalId', event.target.value, { shouldValidate: true });
              form.setValue('restaurantId', '', { shouldValidate: true });
            }}
            value={selectedHospitalId}
          >
            <option value="">Select location</option>
            {hospitals?.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>
                {formatLocationOption(hospital)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          error={form.formState.errors.restaurantId?.message}
          label="Restaurant"
          name="price-restaurant"
        >
          <Select
            disabled={!selectedHospitalId}
            id="price-restaurant"
            {...form.register('restaurantId')}
          >
            <option value="">All restaurants under location</option>
            {restaurants?.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.restaurantName} ({restaurant.restaurantCode})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ItemPriceItemCombobox
          error={form.formState.errors.itemId?.message}
          form={form}
          isLoading={isItemsLoading}
          items={items}
          onSearch={onItemSearch}
          search={itemSearch}
        />
        <Field
          error={form.formState.errors.rateType?.message}
          label="Rate Type"
          name="price-rate-type"
        >
          <Select id="price-rate-type" {...form.register('rateType')}>
            <option value="">Select rate type</option>
            {rateTypeValues.map((rateType) => (
              <option key={rateType} value={rateType}>
                {formatEnum(rateType)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field error={form.formState.errors.price?.message} label="Price" name="price-value">
          <Input
            id="price-value"
            min="0.01"
            placeholder="0.00"
            step="0.01"
            type="number"
            {...form.register('price')}
          />
        </Field>
        {isTaxInclusive ? (
          <Field
            error={form.formState.errors.gstPercent?.message}
            label="GST Percentage"
            name="price-gst-percent"
          >
            <Select id="price-gst-percent" {...form.register('gstPercent')}>
              <option value="">Select GST</option>
              {gstPercentValues.map((gstPercent) => (
                <option key={gstPercent} value={gstPercent}>
                  {gstPercent}%
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field
          error={form.formState.errors.effectiveFrom?.message}
          label="Effective From"
          name="price-effective-from"
        >
          <Input id="price-effective-from" type="date" {...form.register('effectiveFrom')} />
        </Field>
        <Field
          error={form.formState.errors.effectiveTo?.message}
          label="Effective To"
          name="price-effective-to"
        >
          <Input id="price-effective-to" type="date" {...form.register('effectiveTo')} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxLine
          input={<input className="h-4 w-4" type="checkbox" {...form.register('isTaxInclusive')} />}
        >
          Tax Inclusive
        </CheckboxLine>
        {isTaxInclusive ? (
          <p className="text-sm text-ds-muted">
            If Tax Inclusive is enabled, the entered price already includes GST.
          </p>
        ) : null}
        <CheckboxLine
          input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
        >
          Active
        </CheckboxLine>
      </div>
    </>
  );
}
