'use client';

import type { ReactNode } from 'react';
import { AppPageHeader } from '@/components/design-system';
import { Badge, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import { inactiveLocationMessage } from '@/components/organization/shared/locations';
import type { ActiveFilter, PageHeaderProps } from '@/components/organization/shared/types';

export function StatusBadge({ isActive }: Readonly<{ isActive: boolean }>) {
  return (
    <Badge variant={isActive ? 'success' : 'danger'}>{isActive ? 'Active' : 'Inactive'}</Badge>
  );
}

export function PageHeader({ action, count, subtitle, title }: PageHeaderProps) {
  return <AppPageHeader action={action} count={count} description={subtitle} title={title} />;
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
        'inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary/40 disabled:cursor-not-allowed disabled:opacity-60',
        isActive ? 'border-ds-primary bg-ds-primary' : 'border-ds-input bg-ds-divider',
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
      {/* The switch, then its state in words, as on the other lists. */}
      <div className="flex items-center gap-2">
        <StatusToggleButton disabled={disabled} isActive={isActive} onToggle={onToggle} />
        <span
          className={cn('text-xs font-bold', isActive ? 'text-ds-status-ok-fg' : 'text-ds-muted')}
        >
          {isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      {showFrozenMessage ? (
        <p className="max-w-xs text-xs font-medium text-ds-status-pending-fg">
          {inactiveLocationMessage}
        </p>
      ) : null}
    </div>
  );
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

export function SectionHeading({ title }: Readonly<{ title: string }>) {
  return <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-ds-link">{title}</h2>;
}
