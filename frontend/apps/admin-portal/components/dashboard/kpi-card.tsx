// Usage:
//   <KpiCard delta={{ text: '▲ 12%', tone: 'info' }} foot="vs previous period" href="/inventory/transfers?date=7d"
//     label="Transfers" scope="Last 7 days" sparkline={<Sparkline … />} value="75" />
// A key number that links to the list behind it. `loading` keeps the card's final height
// (value, sparkline row and footer), so nothing shifts when the data lands.

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
  error = false,
  foot,
  href,
  label,
  loading = false,
  scope,
  sparkline,
  value,
}: Readonly<{
  delta?: { text: string; tone: DeltaTone } | null;
  /** The source failed: the value reads "—" and the footer says so (same height). */
  error?: boolean;
  foot: ReactNode;
  href: string;
  label: string;
  loading?: boolean;
  scope: string;
  /** Omit for a card without a trend (pending now, or a new workspace). */
  sparkline?: ReactNode;
  value: string;
}>) {
  return (
    <Link
      className="flex flex-col gap-2 rounded-card border border-ds-border bg-ds-surface px-[18px] pb-3.5 pt-4 text-ds-text shadow-card transition hover:border-ds-primary/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
      href={href}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ds-text-3">{label}</span>
        <span className="whitespace-nowrap text-[11px] font-bold text-ds-muted">{scope}</span>
      </span>
      {loading ? (
        <Skeleton className="h-[34px] w-20" />
      ) : (
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-[28px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">
            {error ? '—' : value}
          </span>
          {delta && !error ? (
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
        ) : error ? (
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
