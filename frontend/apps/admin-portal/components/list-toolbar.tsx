'use client';

import type { SortOrder } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

// A filter that is set (a select not on its "All …" choice) is outlined in blue in the panel.
const setField =
  "[&_select:not(:disabled):not(:has(option[value='']:checked))]:border-ds-primary [&_select:not(:disabled):not(:has(option[value='']:checked))]:shadow-[0_0_0_1px_var(--color-ds-primary)]";

/**
 * The Filters button, with how many filters are set, and the panel holding them. Picking a
 * choice in a dropdown applies it and closes the panel, back to the button. Dates and text
 * apply as typed, and Done (or a click outside, or Esc) closes; Clear all (given `onClear`)
 * puts every filter back and closes.
 */
export function FiltersMenu({
  activeCount,
  children,
  onClear,
}: Readonly<{ activeCount: number; children: ReactNode; onClear?: () => void }>) {
  const [isOpen, setIsOpen] = useState(false);
  // Closing: the panel fades back into the button (globals.css .filters-leave), then goes.
  const [isLeaving, setIsLeaving] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  // The panel lives on <body> (a list card clips what overflows it), fixed under the button:
  // right edges lined up on wider screens, left edges on phones, flipped above when there is
  // more room there, at least 8px inside the window, and scrolling when taller than the room.
  useLayoutEffect(() => {
    const button = rootRef.current;
    const panel = panelRef.current;

    if (!isOpen || !button || !panel) {
      return undefined;
    }

    const place = () => {
      const margin = 8;
      const gap = 8;
      const anchor = button.getBoundingClientRect();
      const width = panel.offsetWidth;
      const preferred = window.innerWidth >= 640 ? anchor.right - width : anchor.left;
      const below = window.innerHeight - anchor.bottom - gap - margin;
      const above = anchor.top - gap - margin;
      const flip = below < 240 && above > below;

      panel.style.left = `${Math.max(margin, Math.min(preferred, window.innerWidth - margin - width))}px`;
      panel.style.top = flip ? '' : `${anchor.bottom + gap}px`;
      panel.style.bottom = flip ? `${window.innerHeight - anchor.top + gap}px` : '';
      panel.style.maxHeight = `${flip ? above : below}px`;
    };

    place();
    panel.querySelector<HTMLElement>('select, input, button, [tabindex]')?.focus();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { capture: true, passive: true });

    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, { capture: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        close(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  function open() {
    clearTimeout(leaveTimer.current);
    setIsLeaving(false);
    setIsOpen(true);
  }

  function close(refocus = true) {
    if (refocus) rootRef.current?.querySelector('button')?.focus();
    setIsLeaving(true);
    clearTimeout(leaveTimer.current);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    leaveTimer.current = setTimeout(
      () => {
        setIsOpen(false);
        setIsLeaving(false);
      },
      reduced ? 0 : 120,
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <Button
        aria-controls={panelId}
        aria-expanded={isOpen && !isLeaving}
        onClick={() => (isOpen && !isLeaving ? close() : open())}
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
      {isOpen
        ? createPortal(
            <div
              aria-label="Filters"
              className={`fixed z-40 grid w-[min(20rem,calc(100vw-1rem))] content-start gap-3 overflow-y-auto overscroll-contain rounded-tile border border-ds-border bg-ds-surface p-4 shadow-xl shadow-black/10 ${setField} ${isLeaving ? 'filters-leave' : ''}`}
              inert={isLeaving}
              id={panelId}
              // A dropdown pick is a finished choice: close. Dates and text are still being typed.
              onChange={(event) => {
                if (event.target instanceof HTMLSelectElement) close();
              }}
              ref={panelRef}
              role="dialog"
            >
              {children}
              <div className="sticky -bottom-4 -mx-4 -mb-4 flex items-center justify-between gap-2 border-t border-ds-divider bg-ds-surface px-4 py-3">
                {onClear && activeCount > 0 ? (
                  <Button
                    onClick={() => {
                      onClear();
                      close();
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Clear all
                  </Button>
                ) : (
                  <span />
                )}
                <Button onClick={() => close()} size="sm" type="button">
                  Done
                </Button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** A filter in use, shown as a chip under the toolbar: "Type: Live ✕". */
export interface FilterChip {
  label: string;
  onRemove: () => void;
  value: string;
}

/**
 * The filters in use, under the toolbar, so the list says why rows are missing without opening
 * the panel: one removable chip each, and Clear all. Shows nothing when none is set.
 */
export function FilterChips({
  chips,
  onClearAll,
}: Readonly<{ chips: FilterChip[]; onClearAll: () => void }>) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Filters in use"
      className="flex flex-wrap items-center gap-2 border-b border-ds-divider px-3 py-2"
      role="group"
    >
      {chips.map((chip) => (
        <button
          aria-label={`Remove filter ${chip.label}: ${chip.value}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-ds-primary-border bg-ds-primary-soft px-2.5 py-1 text-xs font-medium text-ds-text transition-colors hover:border-ds-primary"
          key={chip.label}
          onClick={chip.onRemove}
          type="button"
        >
          <span className="text-ds-muted">{chip.label}:</span>
          <span className="truncate">{chip.value}</span>
          <X aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        </button>
      ))}
      <button
        className="text-xs font-semibold text-ds-link hover:underline"
        onClick={onClearAll}
        type="button"
      >
        Clear all
      </button>
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
