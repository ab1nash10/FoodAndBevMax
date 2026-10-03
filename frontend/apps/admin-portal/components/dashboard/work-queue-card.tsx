'use client';

// Usage:
//   <WorkQueueCard action={<Link href="/inventory/transfers">View all</Link>} defaultTab="todo"
//     tabs={[{ count: 14, id: 'todo', label: 'Needs your action', panel: <ul>…</ul> }]} />
// A card with tabs (ARIA tabs: arrow keys, Home and End move between them) over one panel.
// It grows to the height of its row, so it never sits shorter than its neighbour.

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface WorkQueueTab {
  /** Shown in the header while this tab is selected (falls back to the card's `action`). */
  action?: ReactNode;
  count: number;
  id: string;
  label: string;
  panel: ReactNode;
}

export function WorkQueueCard({
  action,
  defaultTab,
  label = 'Work queue',
  tabs,
}: Readonly<{ action?: ReactNode; defaultTab?: string; label?: string; tabs: WorkQueueTab[] }>) {
  const baseId = useId();
  const [selected, setSelected] = useState(defaultTab ?? tabs[0]?.id);
  const current = tabs.find((tab) => tab.id === selected) ?? tabs[0];

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === current?.id);
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;

    if (next >= 0) {
      event.preventDefault();
      setSelected(tabs[next]?.id);
      document.getElementById(`${baseId}-tab-${next}`)?.focus();
    }
  }

  return (
    <section
      aria-label={label}
      className="flex flex-1 flex-col overflow-hidden rounded-card border border-ds-border bg-ds-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-border px-[18px]">
        <div aria-label={label} className="flex gap-1" onKeyDown={onKeyDown} role="tablist">
          {tabs.map((tab, index) => {
            const isSelected = tab.id === current?.id;

            return (
              <button
                aria-controls={`${baseId}-panel`}
                aria-selected={isSelected}
                className={cn(
                  'flex h-12 items-center gap-2 border-b-2 px-2.5 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary',
                  isSelected
                    ? 'border-ds-primary font-extrabold text-ds-text'
                    : 'border-transparent font-semibold text-ds-text-3 hover:text-ds-text',
                )}
                id={`${baseId}-tab-${index}`}
                key={tab.id}
                onClick={() => setSelected(tab.id)}
                role="tab"
                tabIndex={isSelected ? 0 : -1}
                type="button"
              >
                {tab.label}
                <span
                  className={cn(
                    'rounded-full px-[7px] py-px text-[11px] font-bold tabular-nums',
                    isSelected
                      ? 'bg-ds-primary-soft text-ds-link'
                      : 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
        {current?.action ?? action}
      </div>
      <div
        aria-labelledby={`${baseId}-tab-${tabs.findIndex((tab) => tab.id === current?.id)}`}
        className="flex-1"
        id={`${baseId}-panel`}
        role="tabpanel"
      >
        {current?.panel}
      </div>
    </section>
  );
}
