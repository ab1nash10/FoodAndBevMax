'use client';

// Usage:
//   <StackedBarChart
//     ariaLabel="Transfers by outcome, last 7 days, 75 in total"
//     bars={[{ fullLabel: 'Wed, 30 Sept', label: 'Wed 30', values: { full: 8, partial: 1 } }]}
//     segments={[{ className: 'bg-ds-chart-full', key: 'full', label: 'Full' }]}
//     unit="transfers"
//   />
// Segments stack bottom-up in the order given. Every bar is a button: hover, focus or tap shows
// its breakdown in the detail line above the chart (announced politely); the newest bar is shown
// until then. The bars are one tab stop: arrow keys, Home and End move between them.

import { useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface StackSegment {
  className: string;
  key: string;
  label: string;
}

export interface StackBar {
  fullLabel: string;
  label: string;
  values: Record<string, number>;
}

export function StackedBarChart({
  ariaLabel,
  bars,
  emptyText = 'Nothing in this period yet.',
  segments,
  unit,
}: Readonly<{
  ariaLabel: string;
  bars: StackBar[];
  emptyText?: string;
  segments: StackSegment[];
  unit: string;
}>) {
  const [active, setActive] = useState<number | null>(null);
  const barRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const totals = bars.map((bar) =>
    segments.reduce((total, segment) => total + (bar.values[segment.key] ?? 0), 0),
  );
  const yMax = Math.max(5, Math.ceil(Math.max(0, ...totals) / 5) * 5);
  const shown = active !== null && active < bars.length ? active : bars.length - 1;
  const current = bars[shown];
  const isEmpty = totals.every((total) => total === 0);
  // Fewer, wider bars get more room between them.
  const gap = bars.length > 20 ? 'gap-[3px]' : bars.length > 10 ? 'gap-2' : 'gap-3.5';

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = bars.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? Math.min(last, shown + 1)
        : event.key === 'ArrowLeft'
          ? Math.max(0, shown - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;

    if (next !== null) {
      event.preventDefault();
      setActive(next);
      barRefs.current[next]?.focus();
    }
  }

  const describe = (bar: StackBar, total: number) =>
    `${bar.fullLabel}: ${total} ${unit}, ${segments
      .map((segment) => `${bar.values[segment.key] ?? 0} ${segment.label.toLowerCase()}`)
      .join(', ')}`;

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-live="polite"
        className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-control bg-ds-subtle px-3 py-2 text-[12.5px]"
      >
        {current ? (
          <>
            <span className="font-extrabold text-ds-text">{current.fullLabel}</span>
            <span className="text-ds-text-2">
              <strong className="tabular-nums">{totals[shown]}</strong> {unit}
            </span>
            <span aria-hidden="true" className="text-ds-muted">
              ·
            </span>
            <span className="text-ds-text-3">
              {segments.map((segment, index) => (
                <span key={segment.key}>
                  {index ? ' · ' : ''}
                  {segment.label}{' '}
                  <strong className="tabular-nums text-ds-text">
                    {current.values[segment.key] ?? 0}
                  </strong>
                </span>
              ))}
            </span>
          </>
        ) : null}
      </div>

      <div aria-label={ariaLabel} className="relative h-[200px] pl-[30px]" role="group">
        <div className="absolute left-[30px] right-0 top-0 border-t border-dashed border-ds-divider" />
        <div className="absolute left-[30px] right-0 top-1/2 border-t border-dashed border-ds-divider" />
        <span className="absolute left-0 top-[-7px] text-[11px] tabular-nums text-ds-muted">
          {yMax}
        </span>
        <span className="absolute left-0 top-[calc(50%-7px)] text-[11px] tabular-nums text-ds-muted">
          {Math.round(yMax / 2)}
        </span>
        <div
          className={cn('relative flex h-full items-end border-b border-ds-border', gap)}
          onKeyDown={onKeyDown}
        >
          {bars.map((bar, index) => (
            <button
              aria-label={describe(bar, totals[index] ?? 0)}
              aria-pressed={index === shown}
              className={cn(
                'flex h-full min-w-0 flex-1 items-end justify-center rounded-t-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
                bars.length > 20 ? 'px-px' : 'px-1.5',
                index === shown ? 'bg-ds-subtle' : 'bg-transparent',
              )}
              key={bar.fullLabel}
              onClick={() => setActive(index)}
              onFocus={() => setActive(index)}
              onMouseEnter={() => setActive(index)}
              ref={(element) => {
                barRefs.current[index] = element;
              }}
              tabIndex={index === shown ? 0 : -1}
              type="button"
            >
              <span
                className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t"
                style={{ height: `${((totals[index] ?? 0) / yMax) * 100}%` }}
              >
                {segments.map((segment) => (
                  <span
                    className={segment.className}
                    key={segment.key}
                    style={{ flex: `${bar.values[segment.key] ?? 0} 0 0` }}
                  />
                ))}
              </span>
            </button>
          ))}
        </div>
        {isEmpty ? (
          <p className="pointer-events-none absolute inset-x-[30px] top-[40%] text-center text-[12.5px] text-ds-muted">
            {emptyText}
          </p>
        ) : null}
      </div>

      <div aria-hidden="true" className={cn('flex pl-[30px]', gap)}>
        {bars.map((bar, index) => (
          <span
            className={cn(
              'min-w-0 flex-1 whitespace-nowrap text-center text-[11px]',
              index === shown ? 'font-extrabold text-ds-text' : 'font-medium text-ds-muted',
            )}
            key={bar.fullLabel}
          >
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}
