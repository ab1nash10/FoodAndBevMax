'use client';

// The Dashboard (Service Desk layout, 2026-11-22: "I like service desk previous dashboard and I
// want that comparison feature"): one header row (the day, what it is compared with, live,
// export), six number tiles, sales by hour beside the channel mix, the counters right now beside
// what needs action, then the kitchen queue. One request (GET /dashboard/service) for a day and
// its comparison; the waiting counts are the nav badges' query, already loaded by the shell.
// Hover details are CSS only.

import type { DashboardChannel, DashboardServiceDay } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  CalendarDays,
  ChefHat,
  ChevronDown,
  ClipboardCheck,
  Download,
  Gauge,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useNavCounts } from '@/components/admin-shell/sidebar-content';
import { useAuth } from '@/components/auth-provider';
import { tableStyles } from '@/components/design-system';
import { foodIcon } from '@/components/food-art';
import { useLocationContext } from '@/components/location-context';
import { pendingHref } from '@/components/organization/dashboard/format';
import { IfCanOpen } from '@/components/record-link';
import { SegmentedControl } from '@/components/ui-controls';
import { organizationApi } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { canOpenPath } from '@/lib/navigation';
import { queryKeys } from '@/lib/query-keys';
import { todayInIndia } from '@/lib/today-in-india';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

type Sales = NonNullable<DashboardServiceDay['sales']>;
type Metric = 'average' | 'bills' | 'sales';
type CompareWith = 'day' | 'week';

const rupees = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  maximumFractionDigits: 0,
  style: 'currency',
});
const count = new Intl.NumberFormat('en-IN');
const formatRupees = (value: number) => rupees.format(value);
const formatCount = (value: number) => count.format(value);
const clock = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});
const dayParts = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', ...options }).format(date);

  return {
    day: part({ day: 'numeric' }),
    long: part({ weekday: 'long' }),
    month: part({ month: 'short' }),
    short: part({ weekday: 'short' }),
  };
};

const channelLabels: Record<DashboardChannel, string> = {
  COUNTER: 'Counter',
  KIOSK: 'Kiosk',
  QR: 'QR pickup',
  ROOM: 'Room delivery',
  TABLE: 'At table',
};
// Max blue and its lighter shades for the counter, kiosk and rooms; teal and amber for the rest.
const channelColors: Record<DashboardChannel, string> = {
  COUNTER: '#0b57a4',
  KIOSK: '#3b8be0',
  QR: '#0f7b63',
  ROOM: '#7fb6ee',
  TABLE: '#f59e0b',
};
const lanes = {
  COLLECTED: { dot: 'bg-ds-primary', label: 'Collected' },
  PLACED: { dot: 'bg-slate-400', label: 'Queued' },
  PREPARING: { dot: 'bg-amber-500', label: 'Preparing' },
  READY: { dot: 'bg-emerald-600', label: 'Ready' },
} as const;
const panel = 'min-w-0 rounded-[16px] border border-ds-border bg-ds-surface shadow-card';
const chip =
  'inline-flex h-9 items-center gap-2 rounded-[10px] border border-ds-border bg-ds-surface px-3 text-[13px] font-medium text-ds-text transition-colors duration-150 hover:border-ds-primary-border focus-within:ring-2 focus-within:ring-ds-primary';

const hourLabel = (hour: number) =>
  hour === 0 ? '12 am' : hour < 12 ? `${hour} am` : hour === 12 ? '12 pm' : `${hour - 12} pm`;
const hourTick = (hour: number) =>
  hour === 0 ? '12a' : hour < 12 ? `${hour}a` : hour === 12 ? '12p' : `${hour - 12}p`;

/** A moment as a time of day; nothing for a value that is not one. */
const timeOf = (at: string | number) => {
  const date = new Date(at);

  return Number.isNaN(date.getTime()) ? '' : clock.format(date);
};

/** The change against the day compared with: "▲ 14%", "▼ 2%", "Same" or "New". */
function change(today: number, before: number) {
  if (Math.round(today) === Math.round(before)) return { tone: 'same', text: 'Same' } as const;
  if (before === 0) return { tone: 'up', text: 'New' } as const;
  const percent = Math.round(((today - before) / before) * 100);

  if (percent === 0) return { tone: 'same', text: 'Same' } as const;

  return percent > 0
    ? ({ tone: 'up', text: `▲ ${percent}%` } as const)
    : ({ tone: 'down', text: `▼ ${-percent}%` } as const);
}
const toneText = {
  down: 'text-ds-status-bad-fg',
  same: 'text-ds-muted',
  up: 'text-ds-status-ok-fg',
} as const;

const metrics: Record<
  Metric,
  {
    axis: (value: number) => string;
    format: (value: number) => string;
    hour: (row: Sales['byHour'][number]) => { before: number; now: number };
    label: string;
    noun: (value: number) => string;
  }
> = {
  average: {
    axis: (value) => rupees.format(value),
    format: formatRupees,
    hour: (row) => ({
      before: row.compareBills ? row.compareSales / row.compareBills : 0,
      now: row.bills ? row.sales / row.bills : 0,
    }),
    label: 'Average bill',
    noun: formatRupees,
  },
  bills: {
    axis: formatCount,
    format: formatCount,
    hour: (row) => ({ before: row.compareBills, now: row.bills }),
    label: 'Bills',
    noun: (value) => `${count.format(value)} ${value === 1 ? 'bill' : 'bills'}`,
  },
  sales: {
    axis: (value) =>
      value >= 1000 ? `₹${Number((value / 1000).toFixed(1))}k` : rupees.format(value),
    format: formatRupees,
    hour: (row) => ({ before: row.compareSales, now: row.sales }),
    label: 'Sales',
    noun: formatRupees,
  },
};

/** A tile's trend through the day: a thin line. */
function Spark({ points }: Readonly<{ points: number[] }>) {
  const top = Math.max(1, ...points);
  const line = points
    .map(
      (value, index) =>
        `${index ? 'L' : 'M'}${((index / Math.max(1, points.length - 1)) * 80).toFixed(1)} ${(21 - (value / top) * 18).toFixed(1)}`,
    )
    .join(' ');

  return (
    <svg
      aria-hidden="true"
      className="h-6 w-20 shrink-0"
      preserveAspectRatio="none"
      viewBox="0 0 80 24"
    >
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Tile({
  delta,
  label,
  onSelect,
  selected,
  spark,
  value,
}: Readonly<{
  delta: ReturnType<typeof change>;
  label: string;
  onSelect?: () => void;
  selected?: boolean;
  spark?: number[];
  value: string;
}>) {
  const body = (
    <>
      <span className="truncate text-[12.5px] font-medium text-ds-muted">{label}</span>
      <span className="mt-1 text-[22px] font-semibold leading-7 tracking-[-0.02em] text-ds-text tabular-nums">
        {value}
      </span>
      <span className="mt-1 flex items-center justify-between gap-2">
        <span className={cn('text-[12px] font-semibold', toneText[delta.tone])}>{delta.text}</span>
        {spark ? (
          <span className={delta.tone === 'down' ? 'text-ds-status-bad-fg/80' : 'text-ds-primary'}>
            <Spark points={spark} />
          </span>
        ) : null}
      </span>
    </>
  );
  const box = cn(panel, 'flex flex-col px-4 py-3 text-left');

  return onSelect ? (
    <button
      aria-pressed={selected}
      className={cn(
        box,
        'cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-ds-primary-border focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
        selected && 'border-ds-primary ring-1 ring-ds-primary',
      )}
      onClick={onSelect}
      type="button"
    >
      {body}
    </button>
  ) : (
    <div className={box}>{body}</div>
  );
}

function WaitingTile({
  href,
  label,
  note,
  waiting,
}: Readonly<{ href: string; label: string; note: string; waiting: number }>) {
  return (
    <Link
      className={cn(
        panel,
        'flex flex-col px-4 py-3 transition-[border-color,box-shadow] duration-150 hover:border-ds-primary-border focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
      )}
      href={href}
    >
      <span className="truncate text-[12.5px] font-medium text-ds-muted">{label}</span>
      <span className="mt-1 text-[22px] font-semibold leading-7 tracking-[-0.02em] text-ds-text tabular-nums">
        {count.format(waiting)}
      </span>
      <span
        className={cn(
          'mt-1 truncate text-[12px] font-semibold',
          waiting ? 'text-ds-status-pending-fg' : 'text-ds-status-ok-fg',
        )}
      >
        {waiting ? note : 'Nothing waiting'}
      </span>
    </Link>
  );
}

function Panel({
  action,
  children,
  className,
  title,
}: Readonly<{ action?: ReactNode; children: ReactNode; className?: string; title: string }>) {
  return (
    <section aria-label={title} className={cn(panel, 'flex flex-col', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-divider px-4 py-3">
        <h2 className="text-[14px] font-semibold text-ds-text">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function HourChart({
  currentHour,
  metric,
  sales,
  versus,
}: Readonly<{ currentHour: number | null; metric: Metric; sales: Sales; versus: string }>) {
  const [view, setView] = useState<'hourly' | 'running'>('hourly');
  const { axis, format, hour, label, noun } = metrics[metric];
  const active = sales.byHour.filter((row) => row.bills > 0 || row.compareBills > 0);
  // Service hours: 7 am to 10 pm, widened to any hour that billed.
  const from = Math.min(7, ...active.map((row) => row.hour));
  const to = Math.max(22, ...active.map((row) => row.hour));
  const rows = sales.byHour
    .filter((row) => row.hour >= from && row.hour <= to)
    .map((row) => ({ hour: row.hour, ...hour(row) }));
  const busiest = rows.reduce((best, row) => (row.now > best.now ? row : best), rows[0]!);
  const busiestChange = change(busiest.now, busiest.before);
  // The running totals: what the day has built up by each hour.
  const totals = rows.map((point) => {
    const upTo = sales.byHour.filter((row) => row.hour <= point.hour);
    const sum = (pick: (row: Sales['byHour'][number]) => number) =>
      upTo.reduce((total, row) => total + pick(row), 0);

    if (metric === 'average') {
      const bills = sum((row) => row.bills);
      const billsBefore = sum((row) => row.compareBills);

      return {
        before: billsBefore ? sum((row) => row.compareSales) / billsBefore : 0,
        hour: point.hour,
        now: bills ? sum((row) => row.sales) / bills : 0,
      };
    }

    return {
      before: sum((row) => hour(row).before),
      hour: point.hour,
      now: sum((row) => hour(row).now),
    };
  });
  const shown = view === 'hourly' ? rows : totals;
  const peak = Math.max(1, ...shown.map((row) => Math.max(row.now, row.before)));
  // A round top for the axis: the peak to two significant figures.
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(peak)) - 1);
  const top = Math.ceil(peak / magnitude) * magnitude;
  const ticks = [top, (top * 2) / 3, top / 3, 0];
  const last = totals.at(-1) ?? { before: 0, now: 0 };
  const gap = Math.round(last.now) - Math.round(last.before);
  const summary =
    view === 'running'
      ? gap === 0
        ? `Level with ${versus}`
        : `${noun(Math.abs(gap))} ${gap > 0 ? 'ahead of' : 'behind'} ${versus}`
      : busiest.now > 0
        ? `Busiest ${hourLabel(busiest.hour)} · ${format(busiest.now)}, ${
            busiestChange.tone === 'same'
              ? 'same as'
              : busiestChange.text === 'New'
                ? 'none'
                : `${busiestChange.text} vs`
          } ${versus}`
        : 'Nothing billed yet';
  const line = (pick: (row: { before: number; now: number }) => number) =>
    totals
      .map(
        (row, index) =>
          `${index ? 'L' : 'M'}${((index / Math.max(1, totals.length - 1)) * 600).toFixed(1)} ${(200 - (pick(row) / top) * 200).toFixed(1)}`,
      )
      .join(' ');

  return (
    <Panel
      action={
        <span className="flex flex-wrap items-center gap-4">
          <span className="flex gap-3 text-[12px] text-ds-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-ds-primary" />
              Today
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-ds-primary/25" />
              {versus.charAt(0).toUpperCase() + versus.slice(1)}
            </span>
          </span>
          <SegmentedControl<'hourly' | 'running'>
            label="Show"
            onChange={setView}
            options={[
              { label: 'By hour', value: 'hourly' },
              { label: 'Running total', value: 'running' },
            ]}
            value={view}
          />
        </span>
      }
      className="lg:col-span-8"
      title={`${label} by hour`}
    >
      <p className="px-4 pt-3 text-[12.5px] text-ds-muted">{summary}</p>
      <div className="flex gap-2 px-4 pb-3 pt-4">
        <div
          aria-hidden="true"
          className="flex h-52 flex-col justify-between pb-0 text-right text-[11px] text-ds-muted tabular-nums"
        >
          {ticks.map((tick) => (
            <span className="-translate-y-1/2 first:translate-y-0 last:translate-y-0" key={tick}>
              {tick === 0 ? '0' : axis(tick)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-52 border-b border-ds-border">
            {/* Gridlines at the axis ticks. */}
            {[0, 1, 2].map((line) => (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-dashed border-ds-divider"
                key={line}
                style={{ top: `${(line / 3) * 100}%` }}
              />
            ))}
            {view === 'hourly' ? (
              <div className="absolute inset-0 flex items-end gap-1.5">
                {rows.map((row) => {
                  const now = (row.now / top) * 100;
                  const before = (row.before / top) * 100;

                  return (
                    <div
                      className="group relative flex h-full flex-1 items-end gap-0.5"
                      key={row.hour}
                    >
                      <span
                        className="flex-1 rounded-t-[4px] bg-ds-primary/22"
                        style={{ height: `${before}%` }}
                      />
                      <span
                        className={cn(
                          'flex-1 rounded-t-[4px] transition-[filter] duration-150 group-hover:brightness-110',
                          row.hour === currentHour ? 'bg-amber-500' : 'bg-ds-primary',
                        )}
                        style={{ height: `${now}%` }}
                      />
                      {/* The hour's numbers, shown on hover. */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-[#0b1730] px-2.5 py-1.5 text-[11.5px] leading-4 text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100"
                        style={{ bottom: `calc(${Math.min(Math.max(now, before), 70)}% + 8px)` }}
                      >
                        <span className="block font-semibold">
                          {hourLabel(row.hour)} · {format(row.now)}
                        </span>
                        <span className="block text-white/70">
                          {format(row.before)} {versus} · {change(row.now, row.before).text}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <svg
                aria-hidden="true"
                className="absolute inset-0 h-full w-full text-ds-primary"
                preserveAspectRatio="none"
                viewBox="0 0 600 200"
              >
                <path
                  d={`${line((row) => row.now)} L600 200 L0 200 Z`}
                  fill="currentColor"
                  fillOpacity="0.1"
                />
                <path
                  d={line((row) => row.before)}
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray="5 5"
                  strokeOpacity="0.45"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={line((row) => row.now)}
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
          </div>
          <div aria-hidden="true" className="mt-1.5 flex gap-1.5 text-[11px] text-ds-muted">
            {rows.map((row) => (
              <span className="flex-1 text-center" key={row.hour}>
                {hourTick(row.hour)}
              </span>
            ))}
          </div>
        </div>
      </div>
      {/* The chart in words, for screen readers. */}
      <ul aria-label={`${label} by hour, today and ${versus}`} className="sr-only">
        {shown.map((row) => (
          <li key={row.hour}>
            {hourLabel(row.hour)}: {format(row.now)} today, {format(row.before)} {versus}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ChannelMix({ sales }: Readonly<{ sales: Sales }>) {
  const used = sales.channels.filter((row) => row.bills > 0);
  const total = used.reduce((sum, row) => sum + row.bills, 0);

  return (
    <Panel
      action={
        <span className="text-[12.5px] text-ds-muted tabular-nums">
          {count.format(total)} bills
        </span>
      }
      className="lg:col-span-4"
      title="Channel mix"
    >
      <div className="px-4 pt-4">
        <div
          aria-hidden="true"
          className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-ds-divider"
        >
          {used.map((row) => (
            <span
              key={row.key}
              style={{ background: channelColors[row.key], width: `${(row.bills / total) * 100}%` }}
            />
          ))}
        </div>
      </div>
      {used.length ? (
        <div className="overflow-x-auto pt-2">
          <table className={tableStyles.table}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={tableStyles.th}>Channel</th>
                <th className={cn(tableStyles.th, 'text-right')}>Bills</th>
                <th className={cn(tableStyles.th, 'text-right')}>Sales</th>
              </tr>
            </thead>
            <tbody>
              {used.map((row) => (
                <tr className="border-t border-ds-divider" key={row.key}>
                  <td className={tableStyles.td}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-[3px]"
                        style={{ background: channelColors[row.key] }}
                      />
                      {channelLabels[row.key]}
                    </span>
                  </td>
                  <td className={cn(tableStyles.td, 'text-right tabular-nums')}>
                    {count.format(row.bills)}
                  </td>
                  <td className={cn(tableStyles.td, 'text-right font-semibold tabular-nums')}>
                    {rupees.format(row.sales)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-5 text-[13px] text-ds-muted">No bills on this day.</p>
      )}
    </Panel>
  );
}

function CountersNow({ sales }: Readonly<{ sales: Sales }>) {
  return (
    <Panel
      action={
        <Link className="text-[13px] font-semibold text-ds-link hover:underline" href="/pos/day">
          Day summary
        </Link>
      }
      className="lg:col-span-8"
      title="Counters right now"
    >
      {sales.counters.length ? (
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'min-w-[620px]')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={tableStyles.th}>Counter</th>
                <th className={tableStyles.th}>Restaurant</th>
                <th className={tableStyles.th}>Cashier</th>
                <th className={tableStyles.th}>Shift since</th>
                <th className={cn(tableStyles.th, 'text-right')}>Bills</th>
                <th className={cn(tableStyles.th, 'text-right')}>Sales</th>
                <th className={tableStyles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.counters.map((counter) => (
                <tr className="border-t border-ds-divider" key={counter.counterId}>
                  <td className={cn(tableStyles.td, 'font-semibold text-ds-text')}>
                    {counter.counterName}
                  </td>
                  <td className={cn(tableStyles.td, 'text-ds-text-2')}>{counter.restaurantName}</td>
                  <td className={cn(tableStyles.td, 'text-ds-text-2')}>{counter.cashier ?? '–'}</td>
                  <td className={cn(tableStyles.td, 'text-ds-muted tabular-nums')}>
                    {counter.openedAt ? timeOf(counter.openedAt) : '–'}
                  </td>
                  <td className={cn(tableStyles.td, 'text-right tabular-nums')}>
                    {count.format(counter.bills)}
                  </td>
                  <td className={cn(tableStyles.td, 'text-right font-semibold tabular-nums')}>
                    {rupees.format(counter.sales)}
                  </td>
                  <td className={tableStyles.td}>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold',
                        counter.open
                          ? 'bg-ds-status-ok-bg text-ds-status-ok-fg'
                          : 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
                      )}
                    >
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                      {counter.open ? 'Open' : 'Closed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-5 text-[13px] text-ds-muted">
          No counter opened a shift on this day.
        </p>
      )}
    </Panel>
  );
}

function NeedsAction({
  className,
  showEmpty,
}: Readonly<{ className?: string; showEmpty: boolean }>) {
  const { hasPermission } = useAuth();
  const counts = useNavCounts(hasPermission);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const items = [
    counts.transfers
      ? {
          dot: 'bg-amber-500',
          href: pendingHref,
          icon: ArrowRightLeft,
          sub: 'Sent, not yet counted in',
          title: `${plural(counts.transfers, 'transfer', 'transfers')} to acknowledge`,
        }
      : null,
    counts.grns
      ? {
          dot: 'bg-amber-500',
          href: '/inventory/erp-grns?view=PENDING',
          icon: ClipboardCheck,
          sub: 'Returns waiting on the store',
          title: `${plural(counts.grns, 'ERP GRN', 'ERP GRNs')} waiting`,
        }
      : null,
    counts.productions
      ? {
          dot: 'bg-ds-primary',
          href: '/kitchen/productions',
          icon: ChefHat,
          sub: 'Drafts not yet posted',
          title: `${plural(counts.productions, 'production', 'productions')} to post`,
        }
      : null,
    canOpenPath('/inventory/stock-levels', hasPermission)
      ? {
          dot: 'bg-ds-muted',
          href: '/inventory/stock-levels',
          icon: Gauge,
          sub: 'Running low and expiring',
          title: 'Stock levels',
        }
      : null,
  ].filter((item) => item !== null);
  const waiting = (counts.transfers ?? 0) + (counts.grns ?? 0) + (counts.productions ?? 0);

  if (!items.length && !showEmpty) return null;

  return (
    <Panel
      action={
        waiting ? (
          <span className="rounded-full bg-ds-status-pending-bg px-2 py-0.5 text-[12px] font-semibold text-ds-status-pending-fg tabular-nums">
            {waiting}
          </span>
        ) : null
      }
      className={className}
      title="Needs action"
    >
      {items.length ? (
        <ul>
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <li className="border-t border-ds-divider first:border-t-0" key={item.href}>
                <Link
                  className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-ds-selected focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary"
                  href={item.href}
                >
                  <span
                    aria-hidden="true"
                    className={cn('h-2 w-2 shrink-0 rounded-full', item.dot)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ds-text">
                      {item.title}
                    </span>
                    <span className="block text-[12px] text-ds-muted">{item.sub}</span>
                  </span>
                  <Icon
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-ds-muted"
                    strokeWidth={1.9}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-5 text-[13px] text-ds-muted">Nothing waits on you.</p>
      )}
    </Panel>
  );
}

function KitchenQueue({
  kitchen,
}: Readonly<{ kitchen: NonNullable<DashboardServiceDay['kitchen']> }>) {
  return (
    <Panel
      action={
        <Link
          className="text-[13px] font-semibold text-ds-link hover:underline"
          href="/kitchen/tablet"
        >
          Open kitchen tablet
        </Link>
      }
      title="Kitchen queue"
    >
      <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
        {kitchen.lanes.map((lane) => {
          const look = lanes[lane.status];

          return (
            <div
              aria-label={`${look.label} ${lane.count}`}
              className="flex flex-col gap-2 rounded-[12px] bg-ds-subtle p-2.5"
              key={lane.status}
              role="group"
            >
              <span className="flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-ds-text">
                  <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', look.dot)} />
                  {look.label}
                </span>
                <span className="rounded-full bg-ds-surface px-2 text-[12px] font-semibold text-ds-text tabular-nums">
                  {count.format(lane.count)}
                </span>
              </span>
              {lane.orders.map((order) => {
                const Icon = foodIcon(order.items);

                return (
                  <span
                    className="flex items-center gap-2.5 rounded-[10px] border border-ds-border bg-ds-surface px-2.5 py-2"
                    key={order.id}
                  >
                    <Icon
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-ds-link"
                      strokeWidth={1.8}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ds-text">
                        {order.items || `Order ${order.number}`}
                      </span>
                      <span className="block truncate text-[11.5px] text-ds-muted">
                        {order.where} · #{order.number}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11.5px] text-ds-muted tabular-nums">
                      {timeOf(order.at)}
                    </span>
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function ServiceDay() {
  const { hasPermission } = useAuth();
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const waiting = useNavCounts(hasPermission);
  const today = todayInIndia();
  const [compare, setCompare] = useUrlParam<CompareWith>('compare', 'week', ['day', 'week']);
  const [dayParam, setDayParam] = useUrlParam('date');
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayParam) && dayParam < today ? dayParam : today;
  const isToday = day === today;
  const [metric, setMetric] = useState<Metric>('sales');
  const mayAsk = hasPermission(['ORDER_REPORT_VIEW', 'POS_ORDER_VIEW', 'ORDER_VIEW']);
  const service = useQuery({
    enabled: mayAsk && !isLoadingLocations,
    // Keeps the day on screen while another day or comparison loads, so nothing jumps.
    placeholderData: (previous) => previous,
    queryFn: async () =>
      (
        await organizationApi.getDashboardService({
          compare,
          ...(isToday ? {} : { date: day }),
          hospitalId: scopedHospitalId,
        })
      ).data,
    queryKey: queryKeys.dashboardService(scopedHospitalId ?? 'all', compare, day),
    refetchInterval: isToday ? 60_000 : false,
    staleTime: 15_000,
  });
  const { kitchen, sales } = service.data ?? {};
  const shownDay = dayParts(day);
  const compared = sales ? dayParts(sales.compareDate) : null;
  // "last Sun" in the tiles and the chart; "last Sunday" in the header.
  const versus =
    compare === 'day'
      ? isToday
        ? 'yesterday'
        : 'the day before'
      : `last ${compared?.short ?? ''}`;
  const versusLong =
    compare === 'day' ? (isToday ? 'yesterday' : 'the day before') : `last ${compared?.long ?? ''}`;
  const hours = sales?.byHour.filter((row) => row.hour >= 7) ?? [];
  const nowHour = isToday
    ? Number(
        new Intl.DateTimeFormat('en-GB', {
          hour: 'numeric',
          hour12: false,
          timeZone: 'Asia/Kolkata',
        }).format(new Date()),
      )
    : null;

  function exportDay() {
    if (!sales || !service.data) return;
    downloadCsv(`sales-${service.data.date}.csv`, [
      ['Hour', 'Bills', 'Sales', `Bills on ${sales.compareDate}`, `Sales on ${sales.compareDate}`],
      ...sales.byHour.map((row) => [
        hourLabel(row.hour),
        row.bills,
        row.sales,
        row.compareBills,
        row.compareSales,
      ]),
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="mr-1.5 text-[26px] font-bold tracking-[-0.03em] text-ds-text">
          {isToday ? 'Today' : `${shownDay.short} ${shownDay.day} ${shownDay.month}`}
        </h1>
        <label className={cn(chip, 'cursor-pointer')}>
          <CalendarDays aria-hidden="true" className="h-4 w-4 text-ds-muted" strokeWidth={1.9} />
          <input
            aria-label="Day"
            className="w-[7.5rem] bg-transparent text-[13px] font-medium text-ds-text outline-hidden"
            max={today}
            onChange={(event) =>
              setDayParam(event.target.value === today ? '' : event.target.value)
            }
            type="date"
            value={day}
          />
        </label>
        <label className={cn(chip, 'relative pr-8')}>
          <span className="sr-only">Compare with</span>
          <select
            aria-label="Compare with"
            className="cursor-pointer appearance-none bg-transparent text-[13px] font-medium text-ds-text outline-hidden"
            onChange={(event) => setCompare(event.target.value as CompareWith)}
            value={compare}
          >
            <option value="week">vs same day last week</option>
            <option value="day">vs the day before</option>
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 h-4 w-4 text-ds-muted"
          />
        </label>
        {sales ? (
          <span className="text-[13px] text-ds-muted">compared with {versusLong}</span>
        ) : null}
        <span className="flex-1" />
        {sales && isToday ? (
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ds-status-ok-fg">
            <span aria-hidden="true" className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live · {timeOf(service.dataUpdatedAt || Date.now())}
          </span>
        ) : null}
        {sales ? (
          <Button onClick={exportDay} size="sm" type="button" variant="outline">
            <Download aria-hidden="true" className="h-4 w-4" strokeWidth={1.9} />
            Export
          </Button>
        ) : null}
        <IfCanOpen href="/inventory/transfers/new">
          <Button asChild size="sm">
            <Link href="/inventory/transfers/new">
              <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              New transfer
            </Link>
          </Button>
        </IfCanOpen>
      </div>

      {sales ? (
        <div
          aria-label="Today in numbers"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
          role="group"
        >
          <Tile
            delta={change(sales.today.sales, sales.compare.sales)}
            label="Sales"
            onSelect={() => setMetric('sales')}
            selected={metric === 'sales'}
            spark={hours.map((row) => row.sales)}
            value={rupees.format(sales.today.sales)}
          />
          <Tile
            delta={change(sales.today.bills, sales.compare.bills)}
            label="Bills"
            onSelect={() => setMetric('bills')}
            selected={metric === 'bills'}
            spark={hours.map((row) => row.bills)}
            value={count.format(sales.today.bills)}
          />
          <Tile
            delta={change(sales.today.averageBill, sales.compare.averageBill)}
            label="Average bill"
            onSelect={() => setMetric('average')}
            selected={metric === 'average'}
            spark={hours.map((row) => (row.bills ? row.sales / row.bills : 0))}
            value={rupees.format(sales.today.averageBill)}
          />
          <Tile
            delta={change(sales.today.roomOrders, sales.compare.roomOrders)}
            label="Room orders"
            value={count.format(sales.today.roomOrders)}
          />
          {waiting.transfers !== undefined ? (
            <WaitingTile
              href={pendingHref}
              label="Waiting to acknowledge"
              note={`${waiting.transfers} ${waiting.transfers === 1 ? 'transfer' : 'transfers'}`}
              waiting={waiting.transfers}
            />
          ) : null}
          {waiting.grns !== undefined ? (
            <WaitingTile
              href="/inventory/erp-grns?view=PENDING"
              label="ERP GRNs waiting"
              note="Returns waiting on the store"
              waiting={waiting.grns}
            />
          ) : null}
        </div>
      ) : null}

      {sales ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <HourChart currentHour={nowHour} metric={metric} sales={sales} versus={versus} />
          <ChannelMix sales={sales} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        {sales ? <CountersNow sales={sales} /> : null}
        <NeedsAction
          className={sales ? 'lg:col-span-4' : 'lg:col-span-12'}
          showEmpty={Boolean(sales)}
        />
      </div>

      {kitchen ? <KitchenQueue kitchen={kitchen} /> : null}
    </div>
  );
}
