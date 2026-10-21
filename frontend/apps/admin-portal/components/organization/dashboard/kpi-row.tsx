'use client';

import {
  ArrowRightLeft,
  CheckCircle2,
  ChefHat,
  ClipboardCheck,
  PackageCheck,
  Scale,
  Timer,
} from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { Sparkline } from '@/components/charts/sparkline';
import { InsightItem } from '@/components/dashboard/insight-card';
import { cn } from '@/lib/utils';
import { KpiCard } from '@/components/dashboard/kpi-card';
import type { DashboardStats } from '@/hooks/use-dashboard-stats';
import {
  WASTAGE_LIMIT,
  formatMinutes,
  formatPercent,
  percentDelta,
  pointsDelta,
} from '@/lib/dashboard-stats';
import {
  formatAge,
  grnVerbs,
  pendingHref,
  plural,
} from '@/components/organization/dashboard/format';

/**
 * "What changed", as the hero's floating card: up to three rows from the numbers, once every
 * source they read is in, or a line saying all is well.
 */
export function AttentionCard({ stats }: Readonly<{ stats: DashboardStats }>) {
  const { can } = stats;
  const loading =
    (can.transfers && (stats.transfers.isLoading || stats.pending.isLoading)) ||
    (can.productions && stats.productions.isLoading) ||
    (can.grns && stats.grns.isLoading);
  const toCheck = stats.insights.filter((insight) => insight.tone !== 'good').length;

  return (
    <section
      aria-labelledby="attention-title"
      className="rounded-card bg-ds-surface/95 p-2 shadow-[0_24px_48px_-20px_rgb(16_24_40/0.35)] ring-1 ring-ds-text/5 backdrop-blur-md"
    >
      <div className="flex items-center justify-between gap-3 px-3 pb-1.5 pt-2.5">
        <h2 className="text-[13px] font-semibold text-ds-text" id="attention-title">
          Worth a look
        </h2>
        {loading ? null : (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-semibold',
              toCheck
                ? 'bg-ds-status-bad-bg text-ds-status-bad-fg'
                : 'bg-ds-status-ok-bg text-ds-status-ok-fg',
            )}
          >
            {toCheck ? `${toCheck} to check` : 'All good'}
          </span>
        )}
      </div>
      {loading ? (
        <div aria-hidden="true" className="space-y-2 p-2">
          {[0, 1, 2].map((index) => (
            <Skeleton className="h-12 rounded-[12px]" key={index} />
          ))}
        </div>
      ) : stats.insights.length ? (
        <ul>
          {stats.insights.map((insight) => (
            <li key={insight.title}>
              <InsightItem {...insight} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-3 p-3 text-[13.5px] text-ds-text-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-ds-status-ok-bg text-ds-status-ok-fg">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          </span>
          Nothing stands out in this period.
        </p>
      )}
    </section>
  );
}

/** The four key numbers, each linking to the list behind it; hidden without the permission. */
const dayMonthFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

/** A new workspace's key numbers: no trends to show yet, so each footer names the last record. */
export function NewKpiRow({ stats }: Readonly<{ stats: DashboardStats }>) {
  const { can, period } = stats;
  const scope = `Last ${period} days`;
  const recent = stats.activity.data;
  const lastTransfer = [...(recent?.transfers ?? [])]
    .filter((transfer) => transfer.status !== 'DRAFT')
    .sort((a, b) => b.transferDate.localeCompare(a.transferDate))[0];
  const lastGrn = recent?.grns[0];
  const lastProduction = recent?.productions.find((production) => production.status === 'POSTED');
  const loadingRecent = stats.activity.isLoading;

  if (!can.transfers && !can.grns && !can.productions) {
    return null;
  }

  const pendingTotal = stats.pending.stats?.total ?? 0;
  const grnsToVerify = stats.queue.grns.data?.meta.total ?? 0;

  // What waits on the user leads (with a status dot); the period's activity follows.
  return (
    <section aria-labelledby="dashboard-needs-you" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold text-ds-text" id="dashboard-needs-you">
          Needs you today
        </h2>
        <p className="text-[12.5px] text-ds-muted">
          What waits on you first, then what moved in the last {period} days.
        </p>
      </div>
      <div className="flex flex-wrap gap-3.5 *:min-w-0 *:grow *:basis-full sm:*:basis-[calc(50%-7px)] xl:*:basis-0">
        {can.transfers ? (
          <KpiCard
            foot={pendingTotal ? 'Waiting on restaurants' : 'Nothing waiting on restaurants'}
            href={pendingHref}
            icon={ClipboardCheck}
            label="Pending acknowledgement"
            error={stats.pending.isError}
            loading={stats.pending.isLoading}
            scope="Right now"
            status={pendingTotal ? 'waiting' : 'clear'}
            value={String(pendingTotal)}
          />
        ) : null}
        {can.grns ? (
          <KpiCard
            foot={
              lastGrn
                ? lastGrn.status === 'POSTED_TO_STOCK'
                  ? `${lastGrn.grnNumber} posted to ${lastGrn.store.storeName}`
                  : `${lastGrn.grnNumber} ${grnVerbs[lastGrn.status]} · ${lastGrn.store.storeName}`
                : 'No GRNs yet'
            }
            href="/inventory/grns?view=DRAFT"
            icon={PackageCheck}
            label="GRNs to verify"
            error={stats.queue.grns.isError}
            loading={stats.queue.grns.isLoading || loadingRecent}
            scope="Right now"
            status={grnsToVerify ? 'waiting' : 'clear'}
            value={String(grnsToVerify)}
          />
        ) : null}
        {can.transfers ? (
          <KpiCard
            foot={
              lastTransfer
                ? `Your last transfer, ${lastTransfer.transferNumber}, was on ${dayMonthFormatter.format(new Date(lastTransfer.transferDate))}`
                : 'No transfers sent yet'
            }
            href={`/inventory/transfers?date=${period}d`}
            icon={ArrowRightLeft}
            label="Transfers"
            error={stats.transfers.isError}
            loading={stats.transfers.isLoading || loadingRecent}
            scope={scope}
            value={String(stats.transfers.stats?.count ?? 0)}
          />
        ) : null}
        {can.productions ? (
          <KpiCard
            foot={
              lastProduction
                ? `${lastProduction.productionNumber} posted on ${dayMonthFormatter.format(new Date(lastProduction.productionDate))}`
                : 'No production posted yet'
            }
            href="/kitchen/productions?view=POSTED"
            icon={ChefHat}
            label="Kitchen production"
            error={stats.productions.isError}
            loading={stats.productions.isLoading || loadingRecent}
            scope={scope}
            value={String(stats.wastage?.posted ?? 0)}
          />
        ) : null}
      </div>
    </section>
  );
}

export function KpiRow({ stats }: Readonly<{ stats: DashboardStats }>) {
  const { can, period } = stats;
  const transfers = stats.transfers.stats;
  const pending = stats.pending.stats;
  const wastage = stats.wastage;
  const scope = `Last ${period} days`;
  const per = period === 90 ? 'week' : 'day';
  const acked = transfers
    ? transfers.outcomes.full + transfers.outcomes.partial + transfers.outcomes.rejected
    : 0;
  const lowerBound = stats.transfers.truncated ? 'from the newest 5,000' : null;
  const ackDelta = transfers
    ? percentDelta(transfers.ackAvgMinutes, transfers.ackPrevAvgMinutes, 'down')
    : null;
  const oldest = pending?.oldest;

  if (!can.transfers && !can.productions) {
    return null;
  }

  return (
    <section
      aria-label="Key numbers"
      // Phones: one per row; tablets: two; from 1280px: all in one row. Cards grow to fill,
      // so an odd count never leaves a gap.
      className="flex flex-wrap gap-3.5 *:min-w-0 *:grow *:basis-full sm:*:basis-[calc(50%-7px)] xl:*:basis-0"
    >
      {can.transfers ? (
        <>
          <KpiCard
            delta={pending?.overHour ? { text: `${pending.overHour} over 1 h`, tone: 'bad' } : null}
            foot={
              oldest
                ? `Oldest: ${oldest.transferNumber} · ${formatAge(oldest.updatedAt, Date.now())} · ${
                    oldest.hospital.displayName || oldest.hospital.hospitalName
                  }`
                : 'Nothing waiting on restaurants'
            }
            href={pendingHref}
            icon={ClipboardCheck}
            label="Pending acknowledgement"
            error={stats.pending.isError}
            loading={stats.pending.isLoading}
            scope="Right now"
            status={pending?.total ? 'waiting' : 'clear'}
            value={String(pending?.total ?? 0)}
          />
          <KpiCard
            delta={transfers ? percentDelta(transfers.count, transfers.prevCount, 'none') : null}
            foot={[
              'vs previous period',
              acked
                ? `${Math.round((transfers!.outcomes.full / acked) * 100)}% accepted in full`
                : null,
              lowerBound,
            ]
              .filter(Boolean)
              .join(' · ')}
            href={`/inventory/transfers?date=${period}d`}
            icon={ArrowRightLeft}
            label="Transfers"
            error={stats.transfers.isError}
            loading={stats.transfers.isLoading}
            scope={scope}
            sparkline={
              <Sparkline
                label={`Transfers per ${per}, ${scope.toLowerCase()}`}
                tone="series"
                values={transfers?.countSeries ?? []}
              />
            }
            value={String(transfers?.count ?? 0)}
          />
          <KpiCard
            delta={ackDelta}
            foot={
              transfers?.ackAvgMinutes === null || !transfers
                ? 'Nothing acknowledged in this period'
                : ackDelta?.tone === 'good'
                  ? 'Faster than the previous period'
                  : ackDelta?.tone === 'bad'
                    ? 'Slower than the previous period'
                    : 'From sending to acknowledgement'
            }
            href={`/inventory/transfers?view=ACKNOWLEDGED&date=${period}d`}
            icon={Timer}
            label="Avg time to acknowledge"
            error={stats.transfers.isError}
            loading={stats.transfers.isLoading}
            scope={scope}
            sparkline={
              <Sparkline
                label={`Average time to acknowledge per ${per}, ${scope.toLowerCase()}`}
                tone="full"
                values={transfers?.ackSeries ?? []}
              />
            }
            value={formatMinutes(transfers?.ackAvgMinutes ?? null)}
          />
        </>
      ) : null}
      {can.productions ? (
        <KpiCard
          delta={wastage ? pointsDelta(wastage.avgPercent, wastage.prevAvgPercent) : null}
          foot={
            wastage?.kitchens
              ? `Target ${WASTAGE_LIMIT}% or less across ${plural(wastage.kitchens, 'kitchen')}`
              : `Target ${WASTAGE_LIMIT}% or less · nothing posted in this period`
          }
          href="/kitchen/productions?view=POSTED"
          icon={Scale}
          label="Kitchen wastage"
          error={stats.productions.isError}
          loading={stats.productions.isLoading}
          scope={scope}
          sparkline={
            <Sparkline
              label={`Kitchen wastage per ${per}, ${scope.toLowerCase()}`}
              tone="wastage"
              values={wastage?.series ?? []}
            />
          }
          value={formatPercent(wastage?.avgPercent ?? null)}
        />
      ) : null}
    </section>
  );
}
