'use client';

import type { SortOrder } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FilterSelect } from '@/components/ui-controls';
import { sortChoices } from '@/lib/sort-choices';

// One short row above a list: search, a Filters button whose panel holds the filters, sort,
// refresh and clear. Usage:
//   <ListToolbar>
//     <SearchInput … />
//     <FiltersMenu activeCount={n}><FilterField label="Status"><Select …/></FilterField></FiltersMenu>
//     <SortControl … />
//     <RefreshButton onClick={…} />
//     <ClearFiltersButton … />
//   </ListToolbar>

/**
 * The toolbar row; its first child (the search) takes the free width, and a compact field placed
 * directly in it (a FilterSearch or FilterSelect) is brought to the buttons' height.
 */
export function ListToolbar({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ds-divider p-3 [&>*:first-child]:min-w-[12rem] [&>*:first-child]:flex-1 [&>label]:h-10">
      {children}
    </div>
  );
}

/** The Filters button, with how many filters are set, and the panel holding them. */
export function FiltersMenu({
  activeCount,
  children,
}: Readonly<{ activeCount: number; children: ReactNode }>) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Wherever the button sits, keep the open panel at least 8px inside the window.
  useLayoutEffect(() => {
    const panel = panelRef.current;

    if (!isOpen || !panel) {
      return;
    }

    panel.style.transform = '';
    const margin = 8;
    const { left, right } = panel.getBoundingClientRect();
    const shift =
      right > window.innerWidth - margin
        ? window.innerWidth - margin - right
        : left < margin
          ? margin - left
          : 0;

    panel.style.transform = shift ? `translateX(${Math.round(shift)}px)` : '';
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        rootRef.current?.querySelector('button')?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={rootRef}>
      <Button
        aria-controls={panelId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
        variant="outline"
      >
        <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
        Filters
        {activeCount > 0 ? (
          <span className="rounded-full bg-ds-primary px-1.5 text-[11px] font-bold leading-[18px] text-white">
            {activeCount}
            <span className="sr-only"> set</span>
          </span>
        ) : null}
      </Button>
      {isOpen ? (
        <div
          aria-label="Filters"
          // Opens inwards from the button's right edge on wider screens; the effect above
          // nudges it back inside the window wherever it would overflow.
          className="absolute left-0 top-full z-30 mt-2 grid sm:left-auto sm:right-0 w-[min(20rem,calc(100vw-2rem))] gap-3 rounded-tile border border-ds-border bg-ds-surface p-4 shadow-xl shadow-black/10"
          id={panelId}
          ref={panelRef}
          role="dialog"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One filter inside the Filters panel: its name above the control. `group` is for a set of
 * buttons (a <label> would pass a click on the name to the first button).
 */
export function FilterField({
  children,
  group = false,
  label,
}: Readonly<{ children: ReactNode; group?: boolean; label: string }>) {
  const labelId = useId();

  return group ? (
    <div aria-labelledby={labelId} className="grid gap-1.5" role="group">
      <span className="text-xs font-semibold text-ds-muted" id={labelId}>
        {label}
      </span>
      {children}
    </div>
  ) : (
    <label className="grid gap-1.5 text-xs font-semibold text-ds-muted">
      {label}
      {children}
    </label>
  );
}

/** What the list is sorted by, and a button flipping the direction. */
/**
 * Every list's sort: one "Sort" menu of plain choices, the direction in words ("Newest first",
 * "Name A–Z"; lib/sort-choices.ts). `options` are the fields the list can sort by.
 */
export function SortControl({
  onChange,
  onOrderChange,
  onSortByChange,
  options,
  order,
  sortBy,
}: Readonly<{
  /** Both at once, for a list that keeps them as one value; else the two callbacks below. */
  onChange?: (sortBy: string, order: SortOrder) => void;
  onOrderChange?: (order: SortOrder) => void;
  onSortByChange?: (sortBy: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  order: SortOrder;
  sortBy: string;
}>) {
  return (
    <FilterSelect
      label="Sort"
      onChange={(value) => {
        const [field = sortBy, direction] = value.split(':');
        const nextOrder: SortOrder = direction === 'asc' ? 'asc' : 'desc';

        if (onChange) {
          onChange(field, nextOrder);
          return;
        }

        if (field !== sortBy) onSortByChange?.(field);
        if (nextOrder !== order) onOrderChange?.(nextOrder);
      }}
      value={`${sortBy}:${order}`}
    >
      {sortChoices(options).map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </FilterSelect>
  );
}

/** Reloads the list. */
export function RefreshButton({ onClick }: Readonly<{ onClick: () => void }>) {
  return (
    <Button
      aria-label="Refresh"
      onClick={onClick}
      size="icon"
      title="Refresh"
      type="button"
      variant="outline"
    >
      <RefreshCw aria-hidden="true" className="h-4 w-4" />
    </Button>
  );
}
