'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

// Dates are YYYY-MM-DD business days; the maths runs in UTC so the browser's zone never shifts them.
const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (day: string, days: number) => {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return toDay(date);
};

const fullLabel = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
  weekday: 'long',
});
const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const weekdayInitials = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

function shortLabel(day: string): string {
  const date = toDate(day);
  return `${ordinal(date.getUTCDate())} ${monthLabel.format(date)}`;
}

/**
 * A Sunday-to-Saturday day picker. It opens on the week holding `anchor`; the arrows move a
 * week at a time. Days after `today` can't be picked. `value` is the picked day, or null.
 */
export function WeekStrip({
  anchor,
  onSelect,
  today,
  value,
}: Readonly<{
  anchor: string;
  onSelect: (day: string) => void;
  today: string;
  value: string | null;
}>) {
  // The week offset belongs to the anchor it was moved from; a new anchor starts at offset 0.
  const [shown, setShown] = useState({ anchor, offset: 0 });
  const offset = shown.anchor === anchor ? shown.offset : 0;
  const weekStart = addDays(anchor, offset * 7 - toDate(anchor).getUTCDay());
  const days = weekdayInitials.map((_, index) => addDays(weekStart, index));
  const weekEnd = days[6] ?? weekStart;
  const isThisWeek = weekStart <= today && today <= weekEnd;
  const move = (step: number) => setShown({ anchor, offset: offset + step });
  const arrow =
    'inline-flex size-8 items-center justify-center rounded-full text-ds-text-3 transition hover:bg-ds-subtle disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="whitespace-nowrap text-[12.5px] text-ds-text-3">
        <span className="font-semibold text-ds-text-2">{isThisWeek ? 'This week' : 'Week'}</span> (
        {shortLabel(weekStart)} – {shortLabel(weekEnd)})
      </p>
      <div className="flex items-center gap-0.5">
        <button aria-label="Previous week" className={arrow} onClick={() => move(-1)} type="button">
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        {days.map((day, index) => {
          const isFuture = day > today;
          const isSelected = day === value;

          return (
            <button
              aria-label={fullLabel.format(toDate(day))}
              aria-pressed={isSelected}
              className={cn(
                'flex w-9 flex-col items-center gap-0.5 rounded-lg py-1 text-[11px] font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
                isFuture ? 'cursor-not-allowed text-ds-muted opacity-50' : 'text-ds-text-3',
                !isFuture && !isSelected && 'hover:bg-ds-subtle',
              )}
              disabled={isFuture}
              key={day}
              onClick={() => onSelect(day)}
              type="button"
            >
              {weekdayInitials[index]}
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-[13px] tabular-nums',
                  isSelected
                    ? 'bg-ds-primary text-white'
                    : day === today
                      ? 'text-ds-primary ring-1 ring-ds-primary'
                      : 'text-ds-text',
                )}
              >
                {toDate(day).getUTCDate()}
              </span>
            </button>
          );
        })}
        <button
          aria-label="Next week"
          className={arrow}
          disabled={weekEnd >= today}
          onClick={() => move(1)}
          type="button"
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
