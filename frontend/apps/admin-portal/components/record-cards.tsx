'use client';

import type { FoodType } from '@aahar/api-client';
import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { FoodTypeMarker, RowAction } from '@/components/design-system';
import { Skeleton } from '@/components/ui';
import { SegmentedControl } from '@/components/ui-controls';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

export type ListView = 'cards' | 'list';

/** A list's Cards / List choice, in the URL (?view=) like its filters, so a reload keeps it. */
export function useListView(fallback: ListView) {
  return useUrlParam<ListView>('view', fallback, ['cards', 'list']);
}

export function ListViewSwitch({
  label,
  onChange,
  value,
}: Readonly<{ label: string; onChange: (value: ListView) => void; value: ListView }>) {
  return (
    <SegmentedControl<ListView>
      // Same 36px height as the search and selects beside it.
      className="p-0.5 [&>button]:h-7.5"
      label={label}
      onChange={onChange}
      options={[
        { label: 'Cards', value: 'cards' },
        { label: 'List', value: 'list' },
      ]}
      value={value}
    />
  );
}

/** The cards' grid; skeleton cards while the first page loads. */
export function RecordCardGrid({
  children,
  isLoading = false,
}: Readonly<{ children?: ReactNode; isLoading?: boolean }>) {
  return isLoading ? (
    <div
      aria-hidden="true"
      className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-4 p-4"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton className="h-[188px] rounded-[20px]" key={index} />
      ))}
    </div>
  ) : (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-4 p-4">{children}</ul>
  );
}

// The cards' pastel tops, picked by name so a record keeps its colour.
const tiles = ['tile-blue', 'tile-violet', 'tile-green', 'tile-rose', 'tile-amber'];

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join('') || '?'
  );
}

/**
 * A record as a card: a pastel top with the food mark, a badge and the name's initials, then
 * the name, a code line, any details, and a footer of switches. The card opens the record,
 * as a row does; the footer's own clicks (switches, edit) do not.
 */
export function RecordCard({
  badge,
  children,
  edit,
  footer,
  foodType,
  id,
  meta,
  name,
  onOpen,
  subtitle,
}: Readonly<{
  badge?: ReactNode;
  children?: ReactNode;
  edit?: { id?: string; label: string };
  footer?: ReactNode;
  foodType?: FoodType | null;
  id: string;
  /** A short note at the footer's end, before the edit button (e.g. "5 min prep"). */
  meta?: ReactNode;
  name: string;
  onOpen?: () => void;
  subtitle?: ReactNode;
}>) {
  return (
    <li
      className={cn(
        'group flex flex-col overflow-hidden rounded-[20px] border border-ds-border bg-ds-surface shadow-card transition-shadow duration-150',
        onOpen && 'cursor-pointer hover:shadow-card-hover',
      )}
      data-record-id={id}
      onClick={onOpen}
    >
      <div
        className={cn(
          'relative flex h-[104px] items-start justify-between gap-2 overflow-hidden p-3.5',
          tiles[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % tiles.length],
        )}
      >
        {foodType ? (
          <span className="rounded-[5px] bg-ds-surface p-px shadow-xs">
            <FoodTypeMarker type={foodType} />
          </span>
        ) : (
          <span />
        )}
        {badge}
        <span
          aria-hidden="true"
          className="absolute -bottom-3.5 right-3.5 text-[64px] font-semibold leading-none tracking-[-0.03em] text-ds-text opacity-[0.12]"
        >
          {initialsOf(name)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ds-text">{name}</h2>
          {subtitle ? <p className="truncate font-mono text-xs text-ds-muted">{subtitle}</p> : null}
        </div>
        {children}
        <div
          className="mt-auto flex flex-wrap items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          {footer}
          <span className="ml-auto flex min-w-0 items-center gap-2">
            {meta ? <span className="truncate text-xs text-ds-muted">{meta}</span> : null}
            {edit && onOpen ? (
              <RowAction icon={Pencil} id={edit.id} label={edit.label} onClick={onOpen} />
            ) : null}
          </span>
        </div>
      </div>
    </li>
  );
}
