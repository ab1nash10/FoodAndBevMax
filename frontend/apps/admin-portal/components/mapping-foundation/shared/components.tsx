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
  LIVE: 'live item',
  MRP: 'packaged, mapped to stores',
  READYMADE: 'prepared, mapped to kitchens',
};

export function MappingFormFields({
  categories,
  editingId,
  existingMappings,
  form,
  itemLabel,
  items,
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
  /** The type mapping here gives an item; items already of another type can't be chosen. */
  mapsAs: ItemType;
  parentLabel: string;
  parents: Array<{ code: string; id: string; name: string }> | undefined;
  /** The type mapping here gives an item, e.g. "MRP". */
  typeLabel: string;
}>) {
  const itemId = form.watch('itemId');
  const selectedItem = items?.find((item) => item.id === itemId);
  // Every catalogue item is listed; one already packaged (stores) or prepared (kitchens) can
  // only be mapped that way, so it shows greyed with the reason.
  const usable = (items ?? []).filter((item) => !item.itemType || item.itemType === mapsAs);
  const usedElsewhere = (items ?? []).filter((item) => item.itemType && item.itemType !== mapsAs);
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.parentId?.message}
          label={parentLabel}
          name="parent-id"
          required
        >
          <Select id="parent-id" {...form.register('parentId')}>
            <option value="">Select {parentLabel.toLowerCase()}</option>
            {parents?.map((parent) => (
              <option key={parent.id} value={parent.id}>
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
          <Select id="item-id" {...form.register('itemId')}>
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
