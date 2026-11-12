'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, type MouseEvent, type ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { Hospital, Item, ItemCategory, ItemType } from '@aahar/api-client';
import { AppPageHeader } from '@/components/design-system';
import { Badge, Field, Select } from '@/components/ui';
import { Toggle } from '@/components/ui-controls';
import { cn } from '@/lib/utils';
import type {
  ActiveFilter,
  MappingFormValues,
  PageHeaderProps,
} from '@/components/mapping-foundation/shared/types';

export function StatusBadge({ isActive }: Readonly<{ isActive: boolean }>) {
  return (
    <Badge variant={isActive ? 'success' : 'danger'}>{isActive ? 'Active' : 'Inactive'}</Badge>
  );
}

export function BooleanBadge({
  falseLabel,
  trueLabel,
  value,
}: Readonly<{
  falseLabel: string;
  trueLabel: string;
  value: boolean;
}>) {
  return <Badge variant={value ? 'success' : 'neutral'}>{value ? trueLabel : falseLabel}</Badge>;
}

export function PageHeader({ subtitle, title }: PageHeaderProps) {
  return <AppPageHeader description={subtitle} title={title} />;
}

export { FilterSearch as SearchInput } from '@/components/ui-controls';

export function ActiveFilterSelect({
  onChange,
  value,
}: Readonly<{
  onChange: (value: ActiveFilter) => void;
  value: ActiveFilter;
}>) {
  return (
    <Select onChange={(event) => onChange(event.target.value as ActiveFilter)} value={value}>
      <option value="">All status</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </Select>
  );
}

export function HospitalFilterSelect({
  disabled = false,
  hospitals,
  onChange,
  value,
}: Readonly<{
  disabled?: boolean;
  hospitals: Hospital[];
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <Select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="">All locations</option>
      {hospitals.map((hospital) => (
        <option key={hospital.id} value={hospital.id}>
          {hospital.displayName || hospital.hospitalName}
        </option>
      ))}
    </Select>
  );
}

/**
 * A switch in a list row with its state beside it ("Active" / "Inactive"). Its cell keeps the
 * click to itself, so switching it does not open the row's record.
 */
export function RowSwitch({
  ariaLabel,
  checked,
  disabled,
  offLabel,
  onChange,
  onLabel,
}: Readonly<{
  ariaLabel: string;
  checked: boolean;
  disabled?: boolean;
  offLabel: string;
  onChange: () => void;
  onLabel: string;
}>) {
  return (
    <span className="flex items-center gap-2">
      <Toggle ariaLabel={ariaLabel} checked={checked} disabled={disabled} onChange={onChange} />
      <span className={cn('text-xs font-bold', checked ? 'text-ds-status-ok-fg' : 'text-ds-muted')}>
        {checked ? onLabel : offLabel}
      </span>
    </span>
  );
}

/** For a cell holding a record link inside a row that opens on click: the link wins. */
export function keepLinkClicks(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('a')) {
    event.stopPropagation();
  }
}

export { QueryState } from '@/components/location-empty-states';
/** The shared list footer (design-system ListPager). */
export { ListPager as PaginationControls } from '@/components/design-system';

export function CheckboxLine({
  children,
  input,
}: Readonly<{
  children: ReactNode;
  input: ReactNode;
}>) {
  return (
    <label className="flex min-h-10 items-center gap-3 rounded-md border bg-white px-3 text-sm font-medium text-ds-text-2 shadow-xs">
      {input}
      {children}
    </label>
  );
}

const usedAs: Record<ItemType, string> = {
  LIVE: 'live, mapped to kitchens',
  MRP: 'packaged, mapped to stores',
  READYMADE: 'readymade, mapped to kitchens',
};

const kitchenTypes = [
  { hint: 'made ahead in batches, in the Main Kitchen', label: 'Readymade', value: 'READYMADE' },
  { hint: 'made to order, in the counter kitchen', label: 'Live', value: 'LIVE' },
] as const;

/**
 * The Main Kitchen (where a Readymade item must be made), or the counter kitchen (where a Live
 * item starts). ponytail: matched by name (kitchens have no kind); add a kind to kitchens if names vary.
 */
function defaultKitchen(
  kitchens: Array<{ id: string; name: string }> | undefined,
  type: 'LIVE' | 'READYMADE',
) {
  return kitchens?.find((kitchen) =>
    type === 'LIVE' ? /counter/i.test(kitchen.name) : /^main kitchen$/i.test(kitchen.name.trim()),
  )?.id;
}

export function MappingFormFields({
  categories,
  editingId,
  existingMappings,
  form,
  itemLabel,
  items,
  location,
  parentLabel,
  mapsAs,
  parents,
  typeLabel,
}: Readonly<{
  categories: ItemCategory[] | undefined;
  /** The mapping being edited, whose own category stays choosable. */
  editingId?: string;
  /**
   * The parent's mappings of an item (live, active or not), so the categories it already has
   * there can be greyed out; `key` starts with the mapping list's cache key.
   */
  existingMappings: {
    key: string;
    load: (
      parentId: string,
      itemId: string,
    ) => Promise<Array<{ categoryId: string | null; id: string }>>;
  };
  form: UseFormReturn<MappingFormValues>;
  itemLabel: string;
  items: Item[] | undefined;
  /**
   * The location whose stores or kitchens are offered: the header's location, fixed (`locked`),
   * or picked here when the header shows all locations. Nothing can be picked before it.
   */
  location: {
    hospitals: Hospital[] | undefined;
    locked: boolean;
    onChange: (hospitalId: string) => void;
    value: string;
  };
  /** The types mapping here can give an item; items already of another type can't be chosen. */
  mapsAs: readonly ItemType[];
  parentLabel: string;
  parents: Array<{ code: string; id: string; name: string }> | undefined;
  /** The type mapping here gives an item, e.g. "MRP". */
  typeLabel: string;
}>) {
  const itemId = form.watch('itemId');
  const selectedItem = items?.find((item) => item.id === itemId);
  // Every catalogue item is listed; one already packaged (stores) or prepared (kitchens) can
  // only be mapped that way, so it shows greyed with the reason.
  const usable = (items ?? []).filter((item) => !item.itemType || mapsAs.includes(item.itemType));
  const usedElsewhere = (items ?? []).filter(
    (item) => item.itemType && !mapsAs.includes(item.itemType),
  );
  // Kitchen Items: the item is Readymade or Live, and that picks its kitchen.
  const asksKitchenType = mapsAs.includes('LIVE');
  const kitchenType = form.watch('itemType') ?? 'READYMADE';

  const mainKitchen = defaultKitchen(parents, 'READYMADE');
  // A Readymade item is made only in the Main Kitchen (the server refuses any other).
  const mainOnly = asksKitchenType && kitchenType === 'READYMADE';

  /** Live moves out of the Main Kitchen to the counter kitchen, unless another was picked. */
  function chooseKitchenType(type: 'LIVE' | 'READYMADE') {
    const current = form.getValues('parentId');
    const counter = defaultKitchen(parents, 'LIVE');
    form.setValue('itemType', type);
    if (type === 'LIVE' && counter && (!current || current === mainKitchen)) {
      form.setValue('parentId', counter, { shouldValidate: true });
    }
  }

  // Readymade sits in the Main Kitchen; a new Live mapping starts in the counter kitchen.
  useEffect(() => {
    if (!asksKitchenType || !parents) return;
    const current = form.getValues('parentId');
    if (kitchenType === 'READYMADE' && current !== (mainKitchen ?? '')) {
      form.setValue('parentId', mainKitchen ?? '', { shouldValidate: Boolean(current) });
    } else if (kitchenType === 'LIVE' && !current) {
      form.setValue('parentId', defaultKitchen(parents, 'LIVE') ?? '');
    }
  }, [asksKitchenType, form, kitchenType, mainKitchen, parents]);
  const parentId = form.watch('parentId');
  const categoryId = form.watch('categoryId');
  // A parent may hold an item once per category: the ones it already has can't be picked again.
  const existingQuery = useQuery({
    enabled: Boolean(parentId && itemId),
    queryFn: () => existingMappings.load(parentId, itemId),
    queryKey: [existingMappings.key, 'taken-categories', parentId, itemId],
  });
  const takenCategoryIds = new Set(
    (existingQuery.data ?? [])
      .filter((mapping) => mapping.id !== editingId && mapping.categoryId)
      .map((mapping) => mapping.categoryId),
  );

  // Choosing another store or item can make the picked category one it already has.
  useEffect(() => {
    if (categoryId && takenCategoryIds.has(categoryId)) {
      form.setValue('categoryId', '', { shouldValidate: false });
    }
  });

  return (
    <>
      <Field label="Location" name="mapping-location-id" required>
        <Select
          disabled={location.locked}
          id="mapping-location-id"
          onChange={(event) => {
            location.onChange(event.target.value);
            // A store or kitchen belongs to one location: the one picked may not be in the new one.
            form.setValue('parentId', '');
          }}
          value={location.value}
        >
          <option value="">Select location</option>
          {location.hospitals?.map((hospital) => (
            <option key={hospital.id} value={hospital.id}>
              {hospital.displayName || hospital.hospitalName}
            </option>
          ))}
        </Select>
      </Field>
      {asksKitchenType ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-bold text-ds-text">
            Item type <span className="text-ds-status-bad-fg">*</span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {kitchenTypes.map((type) => (
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm shadow-xs',
                  kitchenType === type.value
                    ? 'border-ds-primary bg-ds-primary-soft'
                    : 'border-ds-border bg-ds-surface',
                )}
                key={type.value}
              >
                <input
                  checked={kitchenType === type.value}
                  className="mt-0.5 h-4 w-4"
                  name="mapping-item-type"
                  onChange={() => chooseKitchenType(type.value)}
                  type="radio"
                  value={type.value}
                />
                <span className="grid gap-0.5">
                  <span className="font-semibold text-ds-text">{type.label}</span>
                  <span className="text-xs text-ds-muted">{type.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-ds-muted">
            Applies to the item in every kitchen it is mapped to.
          </p>
        </fieldset>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.parentId?.message}
          label={parentLabel}
          name="parent-id"
          required
        >
          <Select disabled={!location.value} id="parent-id" {...form.register('parentId')}>
            <option value="">
              {mainOnly && parents && !mainKitchen
                ? 'This location has no Main Kitchen'
                : `Select ${parentLabel.toLowerCase()}`}
            </option>
            {/* Greyed, not hidden: switching to Live picks the counter kitchen in the same render. */}
            {parents?.map((parent) => (
              <option
                disabled={mainOnly && parent.id !== mainKitchen}
                key={parent.id}
                value={parent.id}
              >
                {parent.name} ({parent.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field
          error={form.formState.errors.itemId?.message}
          label={itemLabel}
          name="item-id"
          required
        >
          <Select
            id="item-id"
            {...form.register('itemId', {
              // An item already Readymade or Live is that type in every kitchen.
              onChange: (event: { target: { value: string } }) => {
                const type = items?.find((item) => item.id === event.target.value)?.itemType;
                if (asksKitchenType && (type === 'LIVE' || type === 'READYMADE')) {
                  chooseKitchenType(type);
                }
              },
            })}
          >
            <option value="">Select item</option>
            <optgroup label="Can be mapped here">
              {usable.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.itemName} ({item.itemCode}){item.itemType ? '' : ' - not mapped yet'}
                </option>
              ))}
            </optgroup>
            {usedElsewhere.length ? (
              <optgroup label="Already mapped the other way">
                {usedElsewhere.map((item) => (
                  <option disabled key={item.id} value={item.id}>
                    {item.itemName} ({item.itemCode}) - {usedAs[item.itemType!]}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
        </Field>
      </div>
      <Field
        error={form.formState.errors.categoryId?.message}
        label="Category"
        name="mapping-category-id"
        required
      >
        <Select id="mapping-category-id" {...form.register('categoryId')}>
          <option value="">Select category</option>
          {categories?.map((category) => (
            <option
              disabled={takenCategoryIds.has(category.id)}
              key={category.id}
              value={category.id}
            >
              {category.categoryName}
              {takenCategoryIds.has(category.id) ? ' (already mapped)' : ''}
            </option>
          ))}
        </Select>
        {selectedItem ? (
          <p className="mt-1.5 text-xs text-ds-muted">
            {selectedItem.itemType
              ? 'This category applies to this mapping only.'
              : `First mapping: the item becomes ${typeLabel}.`}
          </p>
        ) : null}
      </Field>
      <CheckboxLine
        input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
      >
        Active
      </CheckboxLine>
    </>
  );
}
