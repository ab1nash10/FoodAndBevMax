'use client';

import { ClearFiltersButton } from '@/components/clear-filters-button';
import { FilterField, FiltersMenu, ListToolbar, RefreshButton } from '@/components/list-toolbar';
import { FilterSearch, Toggle } from '@/components/ui-controls';
import { Select } from '@/components/ui';
import type { ActiveFilter } from '@/components/pos/shared/types';
import { ListPager } from '@/components/design-system';
import { pageLimitOptions } from '@/components/pos/shared/utils';

export { QueryState as TableState } from '@/components/location-empty-states';
/** The shared list footer, with the POS page sizes. */
export function PaginationControls(
  props: Readonly<{
    limit: number;
    onLimitChange: (limit: number) => void;
    onPageChange: (page: number) => void;
    page: number;
    total: number;
    totalPages: number;
  }>,
) {
  return <ListPager pageSizes={pageLimitOptions} {...props} />;
}

export function FilterBar({
  activeFilter,
  onActiveFilterChange,
  onClear,
  onRefresh,
  onSearchChange,
  search,
  searchLabel,
  searchPlaceholder,
}: Readonly<{
  activeFilter: ActiveFilter;
  onActiveFilterChange: (value: ActiveFilter) => void;
  /** Puts the search and status back to their defaults. */
  onClear: () => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  search: string;
  /** "Search POS devices": what a screen reader announces for the box. */
  searchLabel: string;
  /** The fields the search matches. */
  searchPlaceholder: string;
}>) {
  return (
    <ListToolbar>
      <FilterSearch
        label={searchLabel}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        value={search}
      />
      <FiltersMenu activeCount={activeFilter ? 1 : 0}>
        <FilterField label="Status">
          <Select
            onChange={(event) => onActiveFilterChange(event.target.value as ActiveFilter)}
            value={activeFilter}
          >
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </FilterField>
      </FiltersMenu>
      <RefreshButton onClick={onRefresh} />
      <ClearFiltersButton active={Boolean(search || activeFilter)} onClear={onClear} />
    </ListToolbar>
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
