'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppPageHeader } from '@/components/design-system';
import { FormPanel } from '@/components/ui-controls';
import { Badge, Select } from '@/components/ui';
import type { ActiveFilter, PageHeaderProps } from '@/components/master-data/shared/types';

export function StatusBadge({ isActive }: Readonly<{ isActive: boolean }>) {
  return (
    <Badge variant={isActive ? 'success' : 'danger'}>{isActive ? 'Active' : 'Inactive'}</Badge>
  );
}

export function PageHeader({ action, subtitle, title }: PageHeaderProps) {
  return <AppPageHeader action={action} description={subtitle} title={title} />;
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

// One submit button for every record form.
export { SubmitButton } from '@/components/organization/shared/form-controls';

/** A create/edit form: the side panel over its list (`backHref`), as every record edit opens. */
export function FormShell({
  backHref,
  children,
  subtitle,
  title,
}: Readonly<{
  backHref: string;
  children: ReactNode;
  /** Older call sites pass an icon; the panel shows none. */
  icon?: LucideIcon;
  subtitle: string;
  title: string;
}>) {
  return (
    <FormPanel backHref={backHref} subtitle={subtitle} title={title}>
      {children}
    </FormPanel>
  );
}
