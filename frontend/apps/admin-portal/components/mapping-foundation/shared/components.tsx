'use client';

import { Button } from '@aahar/ui';
import { Loader2, Plus, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { Hospital, Item, SortOrder } from '@aahar/api-client';
import { AppPageHeader } from '@/components/design-system';
import { Badge, Field, Input, Select } from '@/components/ui';
import type {
  ActiveFilter,
  MappingFormValues,
  PageHeaderProps,
  PaginationControlsProps,
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
  return <AppPageHeader description={subtitle} eyebrow="Item Mapping" title={title} />;
}

export function SearchInput({
  onChange,
  value,
}: Readonly<{
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-muted" />
      <Input
        className="pl-9"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search"
        type="search"
        value={value}
      />
    </div>
  );
}

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

export function SortOrderSelect({
  onChange,
  value,
}: Readonly<{
  onChange: (value: SortOrder) => void;
  value: SortOrder;
}>) {
  return (
    <Select onChange={(event) => onChange(event.target.value as SortOrder)} value={value}>
      <option value="desc">Newest first</option>
      <option value="asc">Oldest first</option>
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

export { QueryState } from '@/components/location-empty-states';
export function PaginationControls({
  limit,
  onPageChange,
  page,
  total,
  totalPages,
}: PaginationControlsProps) {
  const safeTotalPages = Math.max(totalPages, 1);

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-ds-text-3 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Page {page} of {safeTotalPages} - {total} records - {limit} per page
      </span>
      <div className="flex gap-2">
        <Button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={page >= safeTotalPages}
          onClick={() => onPageChange(page + 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

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

export function SubmitButton({
  isPending,
  label,
}: Readonly<{
  isPending: boolean;
  label: string;
}>) {
  return (
    <Button disabled={isPending} type="submit">
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {label}
    </Button>
  );
}

export function MappingFormFields({
  form,
  itemLabel,
  items,
  parentLabel,
  parents,
}: Readonly<{
  form: UseFormReturn<MappingFormValues>;
  itemLabel: string;
  items: Item[] | undefined;
  parentLabel: string;
  parents: Array<{ code: string; id: string; name: string }> | undefined;
}>) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field error={form.formState.errors.parentId?.message} label={parentLabel} name="parent-id">
          <Select id="parent-id" {...form.register('parentId')}>
            <option value="">Select {parentLabel.toLowerCase()}</option>
            {parents?.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name} ({parent.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field error={form.formState.errors.itemId?.message} label={itemLabel} name="item-id">
          <Select id="item-id" {...form.register('itemId')}>
            <option value="">Select item</option>
            {items?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.itemName} ({item.itemCode})
              </option>
            ))}
          </Select>
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
