'use client';

import { Button } from '@aahar/ui';
import { ArrowLeft, Loader2, Plus, Search, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { SortOrder } from '@aahar/api-client';
import { AppPageHeader } from '@/components/design-system';
import { Badge, Input, Panel, Select } from '@/components/ui';
import type {
  ActiveFilter,
  PageHeaderProps,
  PaginationControlsProps,
} from '@/components/master-data/shared/types';

export function StatusBadge({ isActive }: Readonly<{ isActive: boolean }>) {
  return (
    <Badge variant={isActive ? 'success' : 'danger'}>{isActive ? 'Active' : 'Inactive'}</Badge>
  );
}

export function PageHeader({ action, eyebrow, subtitle, title }: PageHeaderProps) {
  return <AppPageHeader action={action} description={subtitle} eyebrow={eyebrow} title={title} />;
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
  disabled = false,
  isPending,
  label,
}: Readonly<{
  disabled?: boolean;
  isPending: boolean;
  label: string;
}>) {
  return (
    <Button disabled={disabled || isPending} type="submit">
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {label}
    </Button>
  );
}

export function FormShell({
  backHref,
  children,
  icon,
  subtitle,
  title,
}: Readonly<{
  backHref: string;
  children: ReactNode;
  icon: LucideIcon;
  subtitle: string;
  title: string;
}>) {
  const Icon = icon;

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost">
        <Link href={backHref}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </Button>
      <PageHeader eyebrow="Master Data" icon={Icon} subtitle={subtitle} title={title} />
      <Panel className="p-4 sm:p-5">{children}</Panel>
    </section>
  );
}
