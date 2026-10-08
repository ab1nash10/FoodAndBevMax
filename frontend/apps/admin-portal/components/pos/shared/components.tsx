'use client';

import { Button } from '@aahar/ui';
import { RefreshCw, Search } from 'lucide-react';
import { Toggle } from '@/components/ui-controls';
import { Input, Select } from '@/components/ui';
import type { ActiveFilter } from '@/components/pos/shared/types';
import { pageLimitOptions } from '@/components/pos/shared/utils';

export { QueryState as TableState } from '@/components/location-empty-states';
export function PaginationControls({
  limit,
  onLimitChange,
  onPageChange,
  page,
  total,
  totalPages,
}: Readonly<{
  limit: number;
  onLimitChange: (limit: number) => void;
  onPageChange: (page: number) => void;
  page: number;
  total: number;
  totalPages: number;
}>) {
  const safeTotalPages = Math.max(totalPages, 1);

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-ds-text-3 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Page {page} of {safeTotalPages} · {total} records
      </span>
      <div className="flex items-center gap-2">
        <Select
          aria-label="Records per page"
          className="h-9 w-20"
          onChange={(event) => onLimitChange(Number(event.target.value))}
          value={limit}
        >
          {pageLimitOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
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

export function FilterBar({
  activeFilter,
  onActiveFilterChange,
  onRefresh,
  onSearchChange,
  search,
}: Readonly<{
  activeFilter: ActiveFilter;
  onActiveFilterChange: (value: ActiveFilter) => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  search: string;
}>) {
  return (
    <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_160px_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-muted" />
        <Input
          className="pl-9"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search"
          type="search"
          value={search}
        />
      </div>
      <Select
        onChange={(event) => onActiveFilterChange(event.target.value as ActiveFilter)}
        value={activeFilter}
      >
        <option value="">All status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </Select>
      <Button onClick={onRefresh} type="button" variant="outline">
        <RefreshCw className="h-4 w-4" />
        Refresh
      </Button>
    </div>
  );
}

export function ToggleField({
  description,
  label,
  onChange,
  value,
}: Readonly<{
  description?: string;
  label: string;
  onChange: (checked: boolean) => void;
  value: boolean;
}>) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border bg-white px-3 py-2 shadow-xs">
      <div>
        <p className="text-sm font-medium text-ds-text-2">{label}</p>
        {description ? <p className="text-xs text-ds-muted">{description}</p> : null}
      </div>
      <Toggle checked={value} onChange={onChange} />
    </div>
  );
}
