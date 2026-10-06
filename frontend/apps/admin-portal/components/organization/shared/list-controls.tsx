'use client';

import { Button } from '@aahar/ui';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SortOrder } from '@aahar/api-client';
import { AppPageHeader } from '@/components/design-system';
import { Badge, Input, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { inactiveLocationMessage } from '@/components/organization/shared/locations';
import type {
  ActiveFilter,
  PageHeaderProps,
  PaginationControlsProps,
} from '@/components/organization/shared/types';
import { skeletonRows } from '@/components/organization/shared/utils';

export function StatusBadge({ isActive }: Readonly<{ isActive: boolean }>) {
  return (
    <Badge variant={isActive ? 'success' : 'danger'}>{isActive ? 'Active' : 'Inactive'}</Badge>
  );
}

export function PageHeader({ action, eyebrow, subtitle, title }: PageHeaderProps) {
  return <AppPageHeader action={action} description={subtitle} eyebrow={eyebrow} title={title} />;
}

export function ToolbarGrid({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // One wrapping row: search grows, filters keep a fixed width, buttons keep their own size.
    <div className="flex flex-wrap items-center gap-3 border-b border-ds-divider p-4 *:w-full sm:[&>*:first-child]:min-w-[200px] sm:[&>*:first-child]:flex-1 sm:*:w-36 [&>button]:w-auto sm:[&>*:first-child]:w-auto">
      {children}
    </div>
  );
}

export function FlexibleToolbar({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="grid gap-3 border-b border-ds-divider p-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(0,1fr)_150px_170px_170px_170px_150px_130px_auto]">
      {children}
    </div>
  );
}

function StatusToggleButton({
  disabled,
  isActive,
  onToggle,
}: Readonly<{
  disabled: boolean;
  isActive: boolean;
  onToggle: () => void;
}>) {
  return (
    <button
      aria-checked={isActive}
      aria-label={isActive ? 'Set inactive' : 'Set active'}
      className={cn(
        'inline-flex h-6 w-11 items-center rounded-full border p-0.5 transition focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary/40 disabled:cursor-not-allowed disabled:opacity-60',
        isActive ? 'border-ds-teal bg-ds-teal' : 'border-ds-input bg-ds-divider',
      )}
      disabled={disabled}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          'h-[18px] w-[18px] rounded-full bg-white shadow-xs transition',
          isActive ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

export function StatusToggleCell({
  disabled,
  isActive,
  onToggle,
  showFrozenMessage,
}: Readonly<{
  disabled: boolean;
  isActive: boolean;
  onToggle: () => void;
  showFrozenMessage?: boolean;
}>) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <StatusBadge isActive={isActive} />
        <StatusToggleButton disabled={disabled} isActive={isActive} onToggle={onToggle} />
      </div>
      {showFrozenMessage ? (
        <p className="max-w-xs text-xs font-medium text-ds-status-pending-fg">
          {inactiveLocationMessage}
        </p>
      ) : null}
    </div>
  );
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
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-muted" />
      <Input
        className="pl-10"
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

export function QueryState({
  colSpan,
  error,
  isError,
  isLoading,
  label,
}: Readonly<{
  colSpan: number;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  label: string;
}>) {
  if (isLoading) {
    return (
      <>
        {skeletonRows.map((row) => (
          <tr key={row}>
            <td className="px-4 py-3" colSpan={colSpan}>
              <Skeleton className="h-8 w-full" />
            </td>
          </tr>
        ))}
      </>
    );
  }

  if (isError) {
    return (
      <tr>
        <td className="px-4 py-12 text-center text-sm text-ds-status-bad-fg" colSpan={colSpan}>
          {getApiErrorMessage(error)}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-12 text-center" colSpan={colSpan}>
        <div className="mx-auto max-w-sm">
          <p className="text-sm font-bold text-ds-text">No {label} found</p>
          <p className="mt-1 text-sm text-ds-muted">Create a record or adjust the filters.</p>
        </div>
      </td>
    </tr>
  );
}

export function PaginationControls({
  limit,
  onPageChange,
  page,
  total,
  totalPages,
}: PaginationControlsProps) {
  const safeTotalPages = Math.max(totalPages, 1);

  return (
    <div className="flex flex-col gap-3 border-t border-ds-divider px-4 py-3 text-sm text-ds-text-3 sm:flex-row sm:items-center sm:justify-between">
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

export function SectionHeading({ title }: Readonly<{ title: string }>) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-ds-teal-text">{title}</h2>
  );
}
