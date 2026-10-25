// Usage:
//   <KpiCard delta={{ text: '▲ 12%', tone: 'info' }} foot="vs previous period" href="/inventory/transfers?date=7d"
//     label="Transfers" scope="Last 7 days" sparkline={<Sparkline … />} value="75" />
//   <KpiCard foot="…" href="…" label="GRNs to verify" scope="Right now" status="waiting" value="3" />
// A key number that links to the list behind it. `loading` keeps the card's final height
// (value, sparkline row and footer), so nothing shifts when the data lands.

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui';
import type { DeltaTone } from '@/lib/dashboard-stats';
import { cn } from '@/lib/utils';

const deltaTones: Record<DeltaTone, string> = {
  bad: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
  good: 'bg-ds-status-ok-bg text-ds-status-ok-fg',
  info: 'bg-ds-status-info-bg text-ds-status-info-fg',
  neutral: 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
};

export function KpiCard({
  delta,
  empty,
  error = false,
  foot,
  href,
  icon: Icon,
  label,
  loading = false,
  scope,
  sparkline,
  status,
  value,
}: Readonly<{
  delta?: { text: string; tone: DeltaTone } | null;
  /** Nothing to count yet: says so in words ("All clear", "No transfers yet") instead of a
   * bare 0 or dash, with no delta or trend. The card keeps its height. */
  empty?: string | null;
  /** The source failed: the value reads "—" and the footer says so (same height). */
  error?: boolean;
  foot: ReactNode;
  href: string;
  /** What the number counts, in a tinted chip (blue; green when clear, amber when waiting). */
  icon?: LucideIcon;
  label: string;
  loading?: boolean;
  scope: string;
  /** Omit for a card without a trend (pending now, or a new workspace). */
  sparkline?: ReactNode;
  /** For a "needs you" number: a green dot when it is clear, amber when something waits. */
  status?: 'clear' | 'waiting';
  value: string;
}>) {
  return (
    <Link
      className="group flex flex-col gap-3 rounded-card border border-ds-border bg-ds-surface px-[18px] pb-4 pt-4 text-ds-text shadow-card transition duration-200 hover:border-ds-primary/30 hover:shadow-card-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary motion-safe:hover:-translate-y-0.5"
      href={href}
    >
      {/* The same head as a list page's stat strip: a dot and the label, then the scope under
          it, so a long label keeps the full width and every value starts at the same height.
          The dot is green when nothing waits, amber when something does, and blue otherwise. */}
      <span className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <span
            aria-hidden="true"
            className={cn(
              'grid h-11 w-11 shrink-0 place-items-center rounded-[14px]',
              !status || loading || error
                ? 'bg-ds-status-info-bg text-ds-status-info-fg'
                : status === 'clear'
                  ? 'bg-ds-status-ok-bg text-ds-status-ok-fg'
                  : 'bg-ds-status-pending-bg text-ds-status-pending-fg',
            )}
          >
            <Icon className="h-[22px] w-[22px]" strokeWidth={1.9} />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              !status || loading || error
                ? 'bg-ds-primary'
                : status === 'clear'
                  ? 'bg-ds-status-ok-fg'
                  : 'bg-ds-status-pending-fg',
            )}
          />
        )}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13.5px] font-semibold text-ds-text" title={label}>
            {label}
          </span>
          <span className="text-[11.5px] text-ds-muted">{scope}</span>
        </span>
      </span>
      {loading ? (
        <Skeleton className="h-[36px] w-20" />
      ) : (
        <span className="flex flex-wrap items-baseline gap-2">
          {/* Sans, not mono: Geist Mono's slashed zero reads as "Ø" this large. */}
          {empty && !error ? (
            <span className="flex min-h-8 items-center text-[19px] font-bold text-ds-text-2">
              {empty}
            </span>
          ) : (
            <span className="text-[36px] font-bold leading-none tracking-[-0.035em] tabular-nums">
              {error ? '—' : value}
            </span>
          )}
          {delta && !error && !empty ? (
            <span
              className={cn(
                'rounded-full px-[7px] py-0.5 text-[11.5px] font-extrabold tabular-nums',
                deltaTones[delta.tone],
              )}
            >
              {delta.text}
            </span>
          ) : null}
        </span>
      )}
      {sparkline !== undefined ? (
        loading ? (
          <Skeleton className="h-8 w-full" />
        ) : error || empty ? (
          <span aria-hidden="true" className="block h-8" />
        ) : (
          sparkline
        )
      ) : null}
      {/* Pinned to the bottom, so footers line up across a row of cards. */}
      <span
        className={cn(
          'mt-auto min-h-[18px] text-xs',
          error ? 'text-ds-status-bad-fg' : 'text-ds-muted',
        )}
      >
        {loading ? ' ' : error ? 'Could not load. Refresh to try again.' : foot}
      </span>
    </Link>
  );
}
