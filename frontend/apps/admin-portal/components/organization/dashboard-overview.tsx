'use client';

import Link from 'next/link';
import type { Grn, KitchenProduction, Transfer } from '@aahar/api-client';
import {
  ChartCard,
  EmptyState,
  KeyboardHint,
  LoadingSkeleton,
  StatusChip,
} from '@/components/design-system';
import { useAuth } from '@/components/auth-provider';
import { createCommands } from '@/components/command-palette';
import { useLocationNames } from '@/components/inventory/use-locations';
import { useLocationContext } from '@/components/location-context';
import { IfCanOpen, RecordLink } from '@/components/record-link';
import { Skeleton } from '@/components/ui';
import { SegmentedControl } from '@/components/ui-controls';
import { DonutChart } from '@/components/charts/donut-chart';
import { HorizontalBarList } from '@/components/charts/horizontal-bar-list';
import { Sparkline } from '@/components/charts/sparkline';
import { SplitBar } from '@/components/charts/split-bar';
import { StackedBarChart } from '@/components/charts/stacked-bar-chart';
import { TrendLine } from '@/components/charts/trend-line';
import { InsightCard } from '@/components/dashboard/insight-card';
import { WorkQueueCard } from '@/components/dashboard/work-queue-card';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { SetupChecklist } from '@/components/dashboard/setup-checklist';
import { SortableTable, type SortableColumn } from '@/components/dashboard/sortable-table';
import { useDashboardStats, type DashboardStats } from '@/hooks/use-dashboard-stats';
import {
  VENDOR_REJECT_LIMIT,
  WASTAGE_LIMIT,
  formatMinutes,
  formatPercent,
  percentDelta,
  pointsDelta,
  type LocationRow,
  type Period,
} from '@/lib/dashboard-stats';
import { recordHref } from '@/lib/navigation';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { Button } from '@aahar/ui';
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronRight,
  Check,
  ClipboardCheck,
  CookingPot,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

function greeting(): string {
  const hour = new Date().getHours();

  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

const tones = {
  bad: 'bg-ds-status-bad-bg text-ds-status-bad-fg',
  employees: 'bg-ds-tile-employees-bg text-ds-tile-employees-fg',
  info: 'bg-ds-status-info-bg text-ds-status-info-fg',
  items: 'bg-ds-tile-items-bg text-ds-tile-items-fg',
  kitchens: 'bg-ds-tile-kitchens-bg text-ds-tile-kitchens-fg',
  locations: 'bg-ds-tile-locations-bg text-ds-tile-locations-fg',
  neutral: 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
  ok: 'bg-ds-status-ok-bg text-ds-status-ok-fg',
  pending: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
  restaurants: 'bg-ds-tile-restaurants-bg text-ds-tile-restaurants-fg',
  stores: 'bg-ds-tile-stores-bg text-ds-tile-stores-fg',
};
type Tone = keyof typeof tones;

const minute = 60_000;

function formatAge(sinceIso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(sinceIso).getTime()) / minute));

  if (minutes < 1) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    const rest = minutes % 60;

    return rest ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

function daysUntil(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateIso);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * minute));
}

const expiryWindowDays = 7;

const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
});
const dayFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const headerDateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  weekday: 'long',
  year: 'numeric',
});

function activityTime(iso: string): string {
  const date = new Date(iso);

  return date.toDateString() === new Date().toDateString()
    ? timeFormatter.format(date)
    : dayFormatter.format(date);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

type TaskKind = 'grn' | 'production' | 'transfer';

const kindTiles: Record<TaskKind, { icon: LucideIcon; tone: Tone }> = {
  grn: { icon: ClipboardCheck, tone: 'stores' },
  production: { icon: CookingPot, tone: 'kitchens' },
  transfer: { icon: ArrowRightLeft, tone: 'info' },
};

interface Task {
  action: string;
  createdAt: string;
  description: string;
  href: string;
  id: string;
  kind: TaskKind;
  recordHref: string;
  reference: string;
  status: string;
}

interface Activity {
  at: string;
  detail: string;
  href: string;
  id: string;
  kind: TaskKind;
  reference: string;
  verb: string;
}

const transferVerbs: Record<Transfer['status'], string> = {
  ACKNOWLEDGED: 'acknowledged',
  CANCELLED: 'cancelled',
  DRAFT: 'drafted',
  PENDING_ACKNOWLEDGEMENT: 'sent',
};
const grnVerbs: Record<Grn['status'], string> = {
  ACCEPTED: 'accepted',
  CANCELLED: 'cancelled',
  DRAFT: 'drafted',
  PARTIALLY_ACCEPTED: 'partially accepted',
  POSTED_TO_STOCK: 'posted to stock',
  REJECTED: 'rejected',
  UNDER_VERIFICATION: 'received',
};
const productionVerbs: Record<KitchenProduction['status'], string> = {
  CANCELLED: 'cancelled',
  DRAFT: 'drafted',
  POSTED: 'posted',
};

const periodValues = ['7', '30', '90'] as const;
type PeriodValue = (typeof periodValues)[number];
const pendingHref = '/inventory/transfers?view=PENDING_ACKNOWLEDGEMENT';

/** "What changed": up to three cards from the numbers, once every source they read is in. */
function InsightsRow({ stats }: Readonly<{ stats: DashboardStats }>) {
  const { can } = stats;
  const loading =
    (can.transfers && (stats.transfers.isLoading || stats.pending.isLoading)) ||
    (can.productions && stats.productions.isLoading) ||
    (can.grns && stats.grns.isLoading);
  // One column below 1100px, one row above: a wrapped card never sits alone beside a gap.
  const grid = 'flex flex-col gap-3 min-[1100px]:flex-row *:min-w-0 *:flex-1';

  if (loading) {
    return (
      <div aria-hidden="true" className={grid}>
        {[0, 1, 2].map((index) => (
          <Skeleton className="h-rail rounded-tile" key={index} />
        ))}
      </div>
    );
  }

  return stats.insights.length ? (
    <section aria-label="What changed" className={grid}>
      {stats.insights.map((insight) => (
        <InsightCard key={insight.title} {...insight} />
      ))}
    </section>
  ) : null;
}

/** The four key numbers, each linking to the list behind it; hidden without the permission. */
const dayMonthFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

/** A new workspace's key numbers: no trends to show yet, so each footer names the last record. */
function NewKpiRow({ stats }: Readonly<{ stats: DashboardStats }>) {
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

  return (
    <section
      aria-label="Key numbers"
      className="flex flex-wrap gap-3.5 *:min-w-0 *:grow *:basis-full sm:*:basis-[calc(50%-7px)] xl:*:basis-0"
    >
      {can.transfers ? (
        <>
          <KpiCard
            foot={
              lastTransfer
                ? `Your last transfer, ${lastTransfer.transferNumber}, was on ${dayMonthFormatter.format(new Date(lastTransfer.transferDate))}`
                : 'No transfers sent yet'
            }
            href={`/inventory/transfers?date=${period}d`}
            label="Transfers"
            error={stats.transfers.isError}
            loading={stats.transfers.isLoading || loadingRecent}
            scope={scope}
            value={String(stats.transfers.stats?.count ?? 0)}
          />
          <KpiCard
            foot={
              stats.pending.stats?.total
                ? 'Waiting on restaurants'
                : 'Nothing waiting on restaurants'
            }
            href={pendingHref}
            label="Pending acknowledgement"
            error={stats.pending.isError}
            loading={stats.pending.isLoading}
            scope="Right now"
            value={String(stats.pending.stats?.total ?? 0)}
          />
        </>
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
          label="GRNs to verify"
          error={stats.queue.grns.isError}
          loading={stats.queue.grns.isLoading || loadingRecent}
          scope="Right now"
          value={String(stats.queue.grns.data?.meta.total ?? 0)}
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
          label="Kitchen production"
          error={stats.productions.isError}
          loading={stats.productions.isLoading || loadingRecent}
          scope={scope}
          value={String(stats.wastage?.posted ?? 0)}
        />
      ) : null}
    </section>
  );
}

function KpiRow({ stats }: Readonly<{ stats: DashboardStats }>) {
  const { can, period } = stats;
  const transfers = stats.transfers.stats;
  const pending = stats.pending.stats;
  const wastage = stats.wastage;
  const scope = `Last ${period} days`;
  const per = period === 90 ? 'week' : 'day';
  const acked = transfers
    ? transfers.outcomes.full + transfers.outcomes.partial + transfers.outcomes.rejected
    : 0;
  const lowerBound = stats.transfers.truncated ? 'from the newest 1,000' : null;
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
            delta={pending?.overHour ? { text: `${pending.overHour} over 1 h`, tone: 'bad' } : null}
            foot={
              oldest
                ? `Oldest: ${oldest.transferNumber} · ${formatAge(oldest.updatedAt, Date.now())} · ${
                    oldest.hospital.displayName || oldest.hospital.hospitalName
                  }`
                : 'Nothing waiting on restaurants'
            }
            href={pendingHref}
            label="Pending acknowledgement"
            error={stats.pending.isError}
            loading={stats.pending.isLoading}
            scope="Right now"
            value={String(pending?.total ?? 0)}
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

/** A dashboard card: heading, optional subtitle and action, then a body that fills the card. */
function DashboardCard({
  action,
  children,
  className,
  id,
  subtitle,
  title,
}: Readonly<{
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id: string;
  subtitle?: ReactNode;
  title: string;
}>) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-card border border-ds-border bg-ds-surface px-[18px] py-4 shadow-card',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-[15px] font-extrabold text-ds-text" id={id}>
            {title}
          </h2>
          {subtitle ? <p className="text-[12.5px] text-ds-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A failed source: what happened and a way to try again. */
function CardError({ onRetry }: Readonly<{ onRetry: () => unknown }>) {
  return (
    <EmptyState
      action={
        <Button onClick={() => void onRetry()} size="sm" type="button" variant="outline">
          Try again
        </Button>
      }
      description="The numbers could not be loaded. Check the connection and try again."
      icon={AlertTriangle}
      title="Could not load this"
    />
  );
}

/** A whole card whose source failed. */
function ErrorCard({ onRetry, title }: Readonly<{ onRetry: () => unknown; title: string }>) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-3 rounded-card border border-ds-border bg-ds-surface px-[18px] py-4 shadow-card"
    >
      <h2 className="text-[15px] font-extrabold text-ds-text">{title}</h2>
      <CardError onRetry={onRetry} />
    </section>
  );
}

/** A link inside running text (counts in subtitles): looks like text, underlines on hover. */
function InlineLink({ children, href }: Readonly<{ children: ReactNode; href: string }>) {
  return (
    <Link
      className="rounded-sm font-bold text-ds-link underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
      href={href}
    >
      {children}
    </Link>
  );
}

const outcomeSegments = [
  { className: 'bg-ds-chart-full', key: 'full', label: 'Full' },
  { className: 'bg-ds-chart-partial', key: 'partial', label: 'Partial' },
  { className: 'bg-ds-chart-rejected', key: 'rejected', label: 'Rejected' },
  { className: 'bg-ds-chart-pending', key: 'pending', label: 'Pending' },
];
const outcomeLegend = [
  { className: 'bg-ds-chart-full', label: 'Accepted in full' },
  { className: 'bg-ds-chart-partial', label: 'Partial' },
  { className: 'bg-ds-chart-rejected', label: 'Rejected' },
  { className: 'bg-ds-chart-pending', label: 'Pending' },
];

function Swatch({ className }: Readonly<{ className: string }>) {
  return (
    <span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', className)} />
  );
}

/** Transfers by outcome (stacked bars) beside acknowledgement quality (donut). */
function OutcomeRow({ stats }: Readonly<{ stats: DashboardStats }>) {
  const { period, window } = stats;
  const transfers = stats.transfers.stats;
  const scope = `Last ${period} days`;
  const dateQuery = `date=${period}d`;

  if (!stats.can.transfers) {
    return null;
  }

  if (stats.transfers.isError) {
    return <ErrorCard onRetry={stats.transfers.refetch} title="Transfers by outcome" />;
  }

  if (!transfers) {
    return (
      <div aria-hidden="true" className="flex flex-wrap items-stretch gap-5">
        <Skeleton className="h-[364px] min-w-0 flex-[2_1_560px] rounded-card" />
        <Skeleton className="h-[364px] min-w-0 flex-[1_1_300px] rounded-card" />
      </div>
    );
  }

  const { full, partial, rejected } = transfers.outcomes;
  const acked = full + partial + rejected;
  const share = (count: number) => (acked ? `${Math.round((count / acked) * 100)}%` : '—');

  return (
    <div className="flex flex-wrap items-stretch gap-5">
      <DashboardCard
        className="flex-[2_1_560px]"
        id="dashboard-outcomes"
        subtitle={
          <>
            {scope} ·{' '}
            <InlineLink href={`/inventory/transfers?${dateQuery}`}>
              {plural(transfers.count, 'transfer')}
            </InlineLink>{' '}
            · hover or focus a bar for details
          </>
        }
        title="Transfers by outcome"
        action={
          <ul className="flex flex-wrap gap-3 text-xs text-ds-text-3">
            {outcomeLegend.map((entry) => (
              <li className="flex items-center gap-1.5" key={entry.label}>
                <Swatch className={entry.className} />
                {entry.label}
              </li>
            ))}
          </ul>
        }
      >
        <StackedBarChart
          ariaLabel={`Stacked bar chart of transfers by outcome, ${scope.toLowerCase()}, ${transfers.count} in total`}
          bars={window.buckets.map((bucket, index) => ({
            fullLabel: bucket.fullLabel,
            label: bucket.label,
            values: { ...transfers.outcomeSeries[index] },
          }))}
          emptyText="No transfers were sent in this period."
          segments={outcomeSegments}
          unit="transfers"
        />
      </DashboardCard>

      <DashboardCard
        className="flex-[1_1_300px] gap-3.5"
        id="dashboard-quality"
        subtitle={
          <>
            {scope} ·{' '}
            <InlineLink href={`/inventory/transfers?view=ACKNOWLEDGED&${dateQuery}`}>
              {acked} acknowledged
            </InlineLink>
          </>
        }
        title="Acknowledgement quality"
      >
        <div className="flex flex-wrap items-center gap-[18px]">
          <DonutChart
            ariaLabel={
              acked
                ? `Acknowledgement outcomes: ${share(full)} in full, ${share(partial)} partial, ${share(rejected)} rejected`
                : 'No acknowledgements in this period'
            }
            centerLabel="in full"
            centerValue={share(full)}
            segments={[
              { className: 'stroke-ds-chart-full', key: 'full', value: full },
              { className: 'stroke-ds-chart-partial', key: 'partial', value: partial },
              { className: 'stroke-ds-chart-rejected', key: 'rejected', value: rejected },
            ]}
          />
          <ul className="flex min-w-[120px] flex-1 flex-col gap-2 text-[12.5px]">
            {[
              { className: 'bg-ds-chart-full', count: full, label: 'Full' },
              { className: 'bg-ds-chart-partial', count: partial, label: 'Partial' },
              { className: 'bg-ds-chart-rejected', count: rejected, label: 'Rejected' },
            ].map((entry) => (
              <li className="flex items-center gap-2" key={entry.label}>
                <Swatch className={entry.className} />
                <span className="flex-1 text-ds-text-2">{entry.label}</span>
                <strong className="tabular-nums text-ds-text">
                  {entry.count} · {share(entry.count)}
                </strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5 rounded-control-lg bg-ds-subtle px-3 py-2.5">
            <span className="text-[11.5px] text-ds-muted">Acknowledged within 1 h</span>
            <span className="text-[17px] font-extrabold tabular-nums text-ds-text">
              {transfers.ackWithinHour === null
                ? '—'
                : `${Math.round(transfers.ackWithinHour * 100)}%`}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 rounded-control-lg bg-ds-subtle px-3 py-2.5">
            <span className="text-[11.5px] text-ds-muted">Top rejection reason</span>
            <span
              className="truncate text-[13.5px] font-extrabold text-ds-text"
              title={transfers.topRejectionReason ?? undefined}
            >
              {transfers.topRejectionReason ?? 'None recorded'}
            </span>
          </div>
        </div>
      </DashboardCard>
    </div>
  );
}

const shortDay = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });

/** Kitchen wastage trend, most transferred items and GRN acceptance by vendor. */
function TrendsRow({ stats }: Readonly<{ stats: DashboardStats }>) {
  const { can, period, window } = stats;
  const scope = `Last ${period} days`;
  const wastage = stats.wastage;
  const transfers = stats.transfers.stats;
  const vendors = stats.vendors;
  const unit = period === 90 ? 'week' : 'day';

  if (!can.productions && !can.transfers && !can.grns) {
    return null;
  }

  const placeholder = (failed: boolean, title: string, retry: () => unknown) =>
    failed ? (
      <ErrorCard onRetry={retry} title={title} />
    ) : (
      <Skeleton className="h-[330px] rounded-card" />
    );

  return (
    <div className="flex flex-col gap-5 min-[1100px]:flex-row *:min-w-0 *:flex-1">
      {can.productions ? (
        wastage ? (
          <DashboardCard
            action={
              <span
                className={cn(
                  'whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold',
                  wastage.overLimit ? tones.pending : tones.ok,
                )}
              >
                {wastage.overLimit
                  ? `${plural(wastage.overLimit, unit)} over limit`
                  : 'Within limit'}
              </span>
            }
            className="gap-2.5"
            id="dashboard-wastage"
            subtitle={
              <>
                Average{' '}
                <InlineLink href="/kitchen/productions?view=POSTED">
                  {formatPercent(wastage.avgPercent)}
                </InlineLink>{' '}
                · limit {WASTAGE_LIMIT}%
              </>
            }
            title="Kitchen wastage"
          >
            <TrendLine
              ariaLabel={`Kitchen wastage trend, average ${formatPercent(wastage.avgPercent)}, ${plural(wastage.overLimit, unit)} above the ${WASTAGE_LIMIT}% limit`}
              firstLabel={window.buckets[0]?.fullLabel ?? ''}
              lastLabel={window.buckets.at(-1)?.fullLabel ?? ''}
              threshold={WASTAGE_LIMIT}
              thresholdLabel={`${WASTAGE_LIMIT}% limit`}
              values={wastage.series}
            />
            <p className="mt-auto text-[12.5px] text-ds-text-2">
              {wastage.highest ? (
                <>
                  Highest:{' '}
                  <RecordLink
                    className="font-bold text-ds-text"
                    href={recordHref('/kitchen/productions', { id: wastage.highest.productionId })}
                  >
                    {wastage.highest.itemName}
                  </RecordLink>{' '}
                  · {formatPercent(wastage.highest.percent)} on{' '}
                  {shortDay.format(wastage.highest.when)}, {wastage.highest.kitchenName}
                </>
              ) : (
                'Nothing posted in this period.'
              )}
            </p>
          </DashboardCard>
        ) : (
          placeholder(stats.productions.isError, 'Kitchen wastage', stats.productions.refetch)
        )
      ) : null}

      {can.transfers ? (
        transfers ? (
          <DashboardCard
            className="gap-2.5"
            id="dashboard-items"
            subtitle={`Times sent · ${scope}`}
            title="Most transferred items"
          >
            {transfers.topItems.length ? (
              <HorizontalBarList
                ariaLabel={`Most transferred items, times sent, ${scope.toLowerCase()}`}
                items={transfers.topItems.map((item) => ({
                  href: recordHref('/masters/items', { id: item.id }),
                  key: item.id,
                  label: item.name,
                  value: item.count,
                }))}
              />
            ) : (
              <EmptyState
                description="Items appear here once transfers are sent."
                title="No transfers yet"
              />
            )}
          </DashboardCard>
        ) : (
          placeholder(stats.transfers.isError, 'Most transferred items', stats.transfers.refetch)
        )
      ) : null}

      {can.grns ? (
        vendors ? (
          <DashboardCard
            className="gap-2.5"
            id="dashboard-vendors"
            subtitle={`Accepted vs rejected quantity · ${scope}`}
            title="GRN acceptance by vendor"
          >
            {vendors.length ? (
              <ul className="flex flex-col gap-3">
                {vendors.map((vendor) => {
                  const rejectedPercent = 100 - vendor.acceptedPercent;

                  return (
                    <li className="flex flex-col gap-1" key={vendor.name}>
                      <span className="flex justify-between gap-2 text-[12.5px]">
                        <RecordLink
                          className="min-w-0 truncate font-bold text-ds-text"
                          href={`/inventory/grns?view=POSTED_TO_STOCK&q=${encodeURIComponent(vendor.name)}`}
                        >
                          {vendor.name}
                        </RecordLink>
                        <span
                          className={cn(
                            'font-extrabold tabular-nums',
                            vendor.flagged ? 'text-ds-status-pending-fg' : 'text-ds-status-ok-fg',
                          )}
                        >
                          {Math.round(vendor.acceptedPercent)}%
                        </span>
                      </span>
                      <SplitBar
                        ariaLabel={`${Math.round(vendor.acceptedPercent)}% accepted, ${Math.round(rejectedPercent)}% rejected`}
                        parts={[
                          {
                            className: 'bg-ds-chart-full',
                            key: 'accepted',
                            value: vendor.accepted,
                          },
                          {
                            className: 'bg-ds-chart-rejected',
                            key: 'rejected',
                            value: vendor.rejected,
                          },
                        ]}
                      />
                      <span className="text-[11.5px] text-ds-muted">
                        {plural(vendor.grns, 'GRN')} · {Math.round(rejectedPercent)}% rejected
                        {vendor.flagged ? ` · above ${VENDOR_REJECT_LIMIT}% tolerance` : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                description="Vendors appear here once GRNs are posted to stock."
                title="No GRNs posted"
              />
            )}
          </DashboardCard>
        ) : (
          placeholder(stats.grns.isError, 'GRN acceptance by vendor', stats.grns.refetch)
        )
      ) : null}
    </div>
  );
}

function SectionLink({ children, href }: Readonly<{ children: ReactNode; href: string }>) {
  return (
    <Link
      className="inline-flex min-h-8 items-center gap-1 rounded-control px-2 text-[12.5px] font-bold text-ds-link hover:bg-ds-primary-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
      href={href}
    >
      {children}
      <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
    </Link>
  );
}

const kindAbbr: Record<TaskKind, string> = { grn: 'GRN', production: 'PRD', transfer: 'TRF' };
const taskListHref: Record<TaskKind, string> = {
  grn: '/inventory/grns',
  production: '/kitchen/productions',
  transfer: '/inventory/transfers',
};
// The list filtered to the same queue the tasks count.
const taskQueueHref: Record<TaskKind, string> = {
  grn: '/inventory/grns?view=DRAFT',
  production: '/kitchen/productions?view=DRAFT',
  transfer: pendingHref,
};
const TASK_LIMIT = 6;

function KindTile({ kind, size }: Readonly<{ kind: TaskKind; size: 'md' | 'sm' }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-control text-[10.5px] font-extrabold',
        size === 'md' ? 'h-[34px] w-[34px]' : 'h-8 w-8',
        tones[kindTiles[kind].tone],
      )}
    >
      {kindAbbr[kind]}
    </span>
  );
}

/** "Needs your action" (oldest first) and "Recent activity" in one tabbed card. */
function WorkQueue({
  defaultTab = 'todo',
  stats,
}: Readonly<{ defaultTab?: 'activity' | 'todo'; stats: DashboardStats }>) {
  const { hasPermission } = useAuth();
  const locationName = useLocationNames(hasPermission);
  const { activity: activityQuery, can, queue } = stats;
  const now = Date.now();
  const transferRoute = (transfer: Transfer) =>
    `${locationName(transfer.sourceType, transfer.sourceId)} → ${locationName(
      transfer.destinationType,
      transfer.destinationId,
    )}`;
  const totals = {
    grn: queue.grns.data?.meta.total ?? 0,
    production: queue.productions.data?.meta.total ?? 0,
    transfer: queue.transfers.data?.meta.total ?? 0,
  };
  const tasks: Task[] = [
    ...(queue.transfers.data?.items ?? []).map((transfer): Task => ({
      action: 'Acknowledge',
      // A pending transfer's updatedAt is its dispatch: that is how long it has waited.
      createdAt: transfer.updatedAt,
      description: `${transferRoute(transfer)} · ${plural(transfer.lines.length, 'item')} · ${transfer.hospital.hospitalName}`,
      href: `/inventory/transfers/${transfer.id}/acknowledge`,
      id: transfer.id,
      kind: 'transfer',
      recordHref: recordHref(taskListHref.transfer, { id: transfer.id }),
      reference: transfer.transferNumber,
      status: transfer.status,
    })),
    ...(queue.grns.data?.items ?? []).map((grn): Task => ({
      action: 'Verify',
      createdAt: grn.createdAt,
      description: [grn.vendorName, plural(grn.lines.length, 'line'), grn.store.storeName]
        .filter(Boolean)
        .join(' · '),
      href: recordHref(taskListHref.grn, { id: grn.id }),
      id: grn.id,
      kind: 'grn',
      recordHref: recordHref(taskListHref.grn, { id: grn.id }),
      reference: grn.grnNumber,
      status: grn.status,
    })),
    ...(queue.productions.data?.items ?? []).map((production): Task => ({
      action: 'Post',
      createdAt: production.createdAt,
      description: [
        production.kitchen.kitchenName,
        plural(production.lines.length, 'item'),
        production.chef ? `chef ${production.chef.name}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      href: recordHref(taskListHref.production, { id: production.id }),
      id: production.id,
      kind: 'production',
      recordHref: recordHref(taskListHref.production, { id: production.id }),
      reference: production.productionNumber,
      status: production.status,
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const oldestTaskId = tasks[0]?.id;
  const isQueueLoading =
    queue.transfers.isLoading || queue.grns.isLoading || queue.productions.isLoading;
  const queueFailed = queue.transfers.isError || queue.grns.isError || queue.productions.isError;
  const retryQueue = () =>
    Promise.all([queue.transfers.refetch(), queue.grns.refetch(), queue.productions.refetch()]);
  const activity: Activity[] = activityQuery.data
    ? [
        ...activityQuery.data.transfers.map((transfer): Activity => ({
          at: transfer.updatedAt,
          detail: `${transferRoute(transfer)} · ${plural(transfer.lines.length, 'item')}`,
          href: recordHref(taskListHref.transfer, { id: transfer.id }),
          id: transfer.id,
          kind: 'transfer',
          reference: transfer.transferNumber,
          verb: transferVerbs[transfer.status],
        })),
        ...activityQuery.data.grns.map((grn): Activity => ({
          at: grn.updatedAt,
          detail: [grn.vendorName, plural(grn.lines.length, 'line'), grn.store.storeName]
            .filter(Boolean)
            .join(' · '),
          href: recordHref(taskListHref.grn, { id: grn.id }),
          id: grn.id,
          kind: 'grn',
          reference: grn.grnNumber,
          verb: grnVerbs[grn.status],
        })),
        ...activityQuery.data.productions.map((production): Activity => ({
          at: production.updatedAt,
          detail: `${production.kitchen.kitchenName} · ${plural(production.lines.length, 'item')}`,
          href: recordHref(taskListHref.production, { id: production.id }),
          id: production.id,
          kind: 'production',
          reference: production.productionNumber,
          verb: productionVerbs[production.status],
        })),
      ]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 6)
    : [];
  // "View all" opens the list the most work is waiting in.
  const busiest = (['transfer', 'grn', 'production'] as const)
    .filter((kind) =>
      kind === 'transfer' ? can.transfers : kind === 'grn' ? can.grns : can.productions,
    )
    .sort((a, b) => totals[b] - totals[a])[0];
  const viewAll = (href: string) => <SectionLink href={href}>View all</SectionLink>;

  const todoPanel = isQueueLoading ? (
    <div className="px-[18px] py-3">
      <LoadingSkeleton rows={4} />
    </div>
  ) : queueFailed && tasks.length === 0 ? (
    <div className="p-4">
      <CardError onRetry={retryQueue} />
    </div>
  ) : tasks.length === 0 ? (
    <div className="flex items-center gap-3.5 px-[18px] py-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ds-status-ok-bg text-ds-status-ok-fg">
        <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.4} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[13.5px] font-extrabold text-ds-text">You’re all caught up</span>
        <span className="text-[12.5px] text-ds-muted">
          Transfers to acknowledge, GRNs to verify and draft productions will show up here.
        </span>
      </span>
    </div>
  ) : (
    <ul>
      {tasks.slice(0, TASK_LIMIT).map((task) => (
        <li
          className="flex items-center gap-3.5 border-b border-ds-divider px-[18px] py-3"
          key={`${task.kind}-${task.id}`}
        >
          <KindTile kind={task.kind} size="md" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <RecordLink
                className="text-[13.5px] font-extrabold tabular-nums text-ds-text"
                href={task.recordHref}
              >
                {task.reference}
              </RecordLink>
              <StatusChip status={task.status} />
            </span>
            <span className="truncate text-[12.5px] text-ds-text-3">{task.description}</span>
          </div>
          <span
            className={cn(
              'hidden whitespace-nowrap text-xs font-semibold tabular-nums sm:inline',
              task.id === oldestTaskId ? 'text-ds-status-pending-fg' : 'text-ds-muted',
            )}
            title={`Waiting since ${new Date(task.createdAt).toLocaleString('en-IN')}`}
          >
            {formatAge(task.createdAt, now)}
          </span>
          <Link
            aria-label={`${task.action} ${task.reference}`}
            className="inline-flex h-[34px] shrink-0 items-center whitespace-nowrap rounded-lg border border-ds-border bg-ds-surface px-3 text-[12.5px] font-bold text-ds-link transition hover:bg-ds-primary-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
            href={task.href}
          >
            {task.action}
          </Link>
        </li>
      ))}
    </ul>
  );

  const activityPanel = activityQuery.isLoading ? (
    <div className="px-[18px] py-3">
      <LoadingSkeleton rows={4} />
    </div>
  ) : activityQuery.isError ? (
    <div className="p-4">
      <CardError onRetry={activityQuery.refetch} />
    </div>
  ) : activity.length === 0 ? (
    <div className="p-4">
      <EmptyState
        description="Transfers, GRNs and productions show here as they change."
        title="No activity yet"
      />
    </div>
  ) : (
    <ul>
      {activity.map((entry) => (
        <li
          className="flex gap-3 border-b border-ds-divider px-[18px] py-3"
          key={`${entry.kind}-${entry.id}`}
        >
          <KindTile kind={entry.kind} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] text-ds-text-2">
              <RecordLink className="font-extrabold text-ds-text" href={entry.href}>
                {entry.reference}
              </RecordLink>{' '}
              {entry.verb}
            </span>
            <span className="truncate text-xs text-ds-muted">{entry.detail}</span>
          </div>
          <span className="whitespace-nowrap text-xs tabular-nums text-ds-muted">
            {activityTime(entry.at)}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <WorkQueueCard
      defaultTab={defaultTab}
      tabs={[
        {
          action: busiest ? viewAll(taskQueueHref[busiest]) : undefined,
          count: totals.grn + totals.production + totals.transfer,
          id: 'todo',
          label: 'Needs your action',
          panel: todoPanel,
        },
        {
          action: busiest ? viewAll(taskListHref[busiest]) : undefined,
          count: activity.length,
          id: 'activity',
          label: 'Recent activity',
          panel: activityPanel,
        },
      ]}
    />
  );
}

/** Store stock expiring in the next week, soonest first. */
function ExpiringCard({ stats }: Readonly<{ stats: DashboardStats }>) {
  const query = stats.expiring;

  return (
    <DashboardCard
      action={
        <span className="rounded-full bg-ds-status-bad-bg px-2 py-0.5 text-[11.5px] font-bold text-ds-status-bad-fg">
          Next {expiryWindowDays} days
        </span>
      }
      className="flex-1 gap-1.5"
      id="dashboard-expiring"
      title="Expiring soon"
    >
      {query.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : query.isError ? (
        <CardError onRetry={query.refetch} />
      ) : query.data?.length ? (
        <ul>
          {query.data.slice(0, 5).map((balance) => {
            const days = daysUntil(balance.expiryDate);

            return (
              <li
                className="flex items-center gap-3 border-t border-ds-divider py-[9px] first:border-t-0"
                key={balance.id}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px]">
                    <RecordLink
                      className="font-bold text-ds-text"
                      href={recordHref('/masters/items', { id: balance.item.id })}
                    >
                      {balance.item.itemName}
                    </RecordLink>{' '}
                    <span className="font-semibold text-ds-muted">· {balance.availableQty}</span>
                  </span>
                  <span className="truncate text-xs text-ds-muted">
                    {[balance.batchNumber, balance.location.name].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <span
                  className={cn(
                    'whitespace-nowrap rounded-full px-2 py-[3px] text-[11.5px] font-bold',
                    days <= 2 ? tones.bad : tones.pending,
                  )}
                >
                  {days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          description={`No stock expires in the next ${expiryWindowDays} days.`}
          title="Nothing expiring"
        />
      )}
      <Button asChild className="mt-auto h-9 w-full text-[12.5px]" variant="outline">
        <Link href="/inventory/store-stock?view=NEAR_EXPIRY">Open store stock</Link>
      </Button>
    </DashboardCard>
  );
}

/** Work queue beside expiring stock; both stretch to the row's height. */
function WorkRow({ stats }: Readonly<{ stats: DashboardStats }>) {
  const { can } = stats;
  const showQueue = can.transfers || can.grns || can.productions;

  if (!showQueue && !can.stock) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-stretch gap-5">
      {showQueue ? (
        <div className="flex min-w-0 flex-[2_1_560px] flex-col">
          <WorkQueue stats={stats} />
        </div>
      ) : null}
      {can.stock ? (
        <div className="flex min-w-0 flex-[1_1_300px] flex-col">
          <ExpiringCard stats={stats} />
        </div>
      ) : null}
    </div>
  );
}

const quickCreateIcons: Record<string, LucideIcon> = {
  '/inventory/grns/new': Plus,
  '/inventory/transfers/new': ArrowRightLeft,
  '/kitchen/productions/new': CookingPot,
};

/** The create pages the user may open, with their N-then-letter shortcuts. */
function QuickCreateCard() {
  const { hasPermission } = useAuth();
  const commands = createCommands.filter((command) => hasPermission(command.permissions));

  return commands.length ? (
    <ChartCard title="Quick create">
      <div className="-mt-1.5 flex flex-col gap-2.5">
        {commands.map((command) => {
          const Icon = quickCreateIcons[command.href] ?? Plus;

          return (
            <Link
              className="flex min-h-12 items-center gap-3 rounded-xl border border-ds-border px-3 text-[13px] font-bold text-ds-text transition hover:border-ds-primary/30 hover:bg-ds-subtle focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
              href={command.href}
              key={command.href}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg',
                  tones[command.tone],
                )}
              >
                <Icon className="h-[15px] w-[15px]" strokeWidth={1.8} />
              </span>
              <span className="flex-1">{command.label}</span>
              {command.keys ? (
                <KeyboardHint
                  className="hidden sm:inline-flex"
                  keys={[command.keys.replace(' ', ' then ')]}
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    </ChartCard>
  ) : null;
}

/** Master data totals: unchanged from the previous dashboard. */
function MasterDataCard({ stats }: Readonly<{ stats: DashboardStats }>) {
  const { isAllLocations } = useLocationContext();
  const { can, masters } = stats;
  const masterData = [
    {
      abbr: 'LO',
      href: '/masters/locations',
      label: 'Locations',
      query: masters.hospitals,
      tone: 'locations' as const,
      valueOverride: isAllLocations ? undefined : 1,
      visible: can.hospitals,
    },
    {
      abbr: 'ST',
      href: '/masters/stores',
      label: 'Stores',
      query: masters.stores,
      tone: 'stores' as const,
      visible: can.stores,
    },
    {
      abbr: 'KI',
      href: '/masters/kitchens',
      label: 'Kitchens',
      query: masters.kitchens,
      tone: 'kitchens' as const,
      visible: can.kitchens,
    },
    {
      abbr: 'RE',
      href: '/masters/restaurants',
      label: 'Restaurants',
      query: masters.restaurants,
      tone: 'restaurants' as const,
      visible: can.restaurants,
    },
    {
      abbr: 'IT',
      href: '/masters/items',
      label: 'Items',
      query: masters.items,
      tone: 'items' as const,
      visible: can.items,
    },
    {
      abbr: 'EM',
      href: '/masters/employees',
      label: 'Employees',
      query: masters.employees,
      tone: 'employees' as const,
      visible: can.employees,
    },
  ].filter((card) => card.visible);

  return masterData.length > 0 ? (
    <ChartCard title="Master data">
      <div className="-mt-1 grid grid-cols-2 gap-2">
        {masterData.map((card) => (
          <Link
            className="flex items-center gap-2.5 rounded-xl border border-ds-border bg-ds-subtle p-2.5 transition hover:border-ds-primary/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
            href={card.href}
            key={card.href}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg text-[11px] font-extrabold',
                tones[card.tone],
              )}
            >
              {card.abbr}
            </span>
            <span className="flex min-w-0 flex-col">
              {card.query.isLoading ? (
                <Skeleton className="h-5 w-8" />
              ) : (
                <span className="text-base font-extrabold tabular-nums text-ds-text">
                  {card.valueOverride ?? card.query.data ?? 0}
                </span>
              )}
              <span className="truncate text-[11.5px] font-semibold text-ds-muted">
                {card.label}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </ChartCard>
  ) : null;
}

/** Two letters for a location tile: "Max Shalimar Bagh" → "SB", "Max Saket" → "SA". */
function locationInitials(name: string): string {
  const words = name
    .replace(/^max\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);

  return (
    words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '').slice(0, 2)
  ).toUpperCase();
}

/** Amber and bold when a value needs attention. */
const attention = (flag: boolean) =>
  flag ? 'font-extrabold text-ds-status-pending-fg' : 'font-semibold text-ds-text-2';
const SLOW_ACK_MINUTES = 60;
const NEAR_WASTAGE_LIMIT = WASTAGE_LIMIT * 0.9;
const locationColumns = 'minmax(160px,1.3fr) minmax(130px,1fr) 80px 104px 84px';

/** Per-location transfers, pending, time to acknowledge and wastage, with an all-locations row. */
function LocationsCard({ stats }: Readonly<{ stats: DashboardStats }>) {
  const { can, period } = stats;
  const { rows, totals } = stats.locations;
  const loading = stats.transfers.isLoading || stats.pending.isLoading;
  const date = `date=${period}d`;
  const maxTransfers = Math.max(1, ...rows.map((row) => row.transfers));
  const busiest = [...rows].sort((a, b) => b.transfers - a.transfers)[0];
  const transfersOf = (id: string, query: string) =>
    `/inventory/transfers?hospital=${encodeURIComponent(id)}&${query}`;
  const columns: Array<SortableColumn<LocationRow>> = [
    {
      key: 'name',
      label: 'Location',
      render: (row) => (
        <Link
          className="flex min-w-0 items-center gap-2.5 rounded-sm text-ds-text hover:text-ds-link focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
          href={transfersOf(row.id, date)}
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg text-[11px] font-extrabold',
              tones.locations,
            )}
          >
            {locationInitials(row.name)}
          </span>
          <span className="truncate font-bold">{row.name}</span>
        </Link>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: 'transfers',
      label: 'Transfers',
      render: (row) => (
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 flex-1 overflow-hidden rounded-full bg-ds-status-neutral-bg"
          >
            <span
              className="block h-full rounded-full bg-ds-chart-series"
              style={{ width: `${(row.transfers / maxTransfers) * 100}%` }}
            />
          </span>
          <InlineLink href={transfersOf(row.id, date)}>
            <span className="inline-block min-w-7 text-right text-ds-text">{row.transfers}</span>
          </InlineLink>
        </span>
      ),
      sortValue: (row) => row.transfers,
    },
    {
      align: 'end',
      key: 'pending',
      label: 'Pending',
      render: (row) => (
        <Link
          className={cn(
            'rounded-full px-2 py-0.5 font-bold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
            row.pending > 0 ? tones.pending : tones.neutral,
          )}
          href={transfersOf(row.id, 'view=PENDING_ACKNOWLEDGEMENT')}
        >
          {row.pending}
        </Link>
      ),
      sortValue: (row) => row.pending,
    },
    {
      align: 'end',
      key: 'ack',
      label: 'Avg ack time',
      render: (row) => (
        <Link
          className={cn(
            'rounded-sm hover:underline',
            attention((row.ackAvgMinutes ?? 0) > SLOW_ACK_MINUTES),
          )}
          href={transfersOf(row.id, `view=ACKNOWLEDGED&${date}`)}
        >
          {formatMinutes(row.ackAvgMinutes)}
        </Link>
      ),
      sortValue: (row) => row.ackAvgMinutes,
    },
    {
      align: 'end',
      key: 'waste',
      label: 'Wastage',
      render: (row) =>
        can.productions && row.wastagePercent !== null ? (
          <Link
            className={cn(
              'rounded-sm hover:underline',
              attention(row.wastagePercent > NEAR_WASTAGE_LIMIT),
            )}
            href={`/kitchen/productions?hospital=${encodeURIComponent(row.id)}&view=POSTED`}
          >
            {formatPercent(row.wastagePercent)}
          </Link>
        ) : (
          <span className="text-ds-muted">—</span>
        ),
      sortValue: (row) => row.wastagePercent,
    },
  ];

  return (
    <section
      aria-labelledby="dashboard-locations"
      className="flex flex-1 flex-col overflow-hidden rounded-card border border-ds-border bg-ds-surface shadow-card"
    >
      <div className="flex flex-col gap-0.5 px-[18px] pb-3 pt-4">
        <h2 className="text-[15px] font-extrabold text-ds-text" id="dashboard-locations">
          Locations at a glance
        </h2>
        <p className="text-[12.5px] text-ds-muted">Last {period} days · click a column to sort</p>
      </div>
      {loading ? (
        <div className="flex-1 px-[18px] pb-4">
          <LoadingSkeleton rows={5} />
        </div>
      ) : stats.transfers.isError || stats.pending.isError ? (
        <div className="flex-1 px-[18px] pb-4">
          <CardError
            onRetry={() => Promise.all([stats.transfers.refetch(), stats.pending.refetch()])}
          />
        </div>
      ) : (
        <SortableTable<LocationRow>
          caption="Locations at a glance"
          columns={columns}
          defaultSort={{ dir: 'desc', key: 'transfers' }}
          emptyText="No transfers, pending work or production in this period."
          footer={[
            <span className="flex flex-col gap-0.5" key="name">
              <span className="font-extrabold text-ds-text">All locations</span>
              <InlineLink href={`/inventory/transfers?${date}`}>Open full report →</InlineLink>
            </span>,
            <span className="flex items-center gap-2" key="transfers">
              <span className="flex-1 text-xs text-ds-muted">
                {busiest && totals.transfers
                  ? `${busiest.name.replace(/^max\s+/i, '')} handles ${Math.round((busiest.transfers / totals.transfers) * 100)}%`
                  : ''}
              </span>
              <strong className="min-w-7 text-right text-ds-text">{totals.transfers}</strong>
            </span>,
            <span className="font-extrabold text-ds-status-pending-fg" key="pending">
              {totals.pending}
            </span>,
            <span className="font-extrabold text-ds-text" key="ack">
              {formatMinutes(totals.ackAvgMinutes)}
            </span>,
            <span className="font-extrabold text-ds-text" key="waste">
              {can.productions ? formatPercent(totals.wastagePercent) : '—'}
            </span>,
          ]}
          rowKey={(row) => row.id}
          rows={rows}
          template={locationColumns}
        />
      )}
    </section>
  );
}

/** Locations beside Quick create over Master data; the table grows to the column's height. */
function LocationsRow({ stats }: Readonly<{ stats: DashboardStats }>) {
  const { hasPermission } = useAuth();
  const { can } = stats;
  const hasQuickCreate = createCommands.some((command) => hasPermission(command.permissions));
  const hasMasters =
    can.hospitals || can.stores || can.kitchens || can.restaurants || can.items || can.employees;

  if (!can.transfers) {
    return hasQuickCreate || hasMasters ? (
      <div className="flex flex-col gap-5 min-[1100px]:flex-row *:min-w-0 *:flex-1">
        <QuickCreateCard />
        <MasterDataCard stats={stats} />
      </div>
    ) : null;
  }

  return (
    <div className="flex flex-wrap items-stretch gap-5">
      <div className="flex min-w-0 flex-[2_1_560px] flex-col">
        <LocationsCard stats={stats} />
      </div>
      {hasQuickCreate || hasMasters ? (
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          <QuickCreateCard />
          <MasterDataCard stats={stats} />
        </div>
      ) : null}
    </div>
  );
}

const ghostBars = [35, 55, 25, 70, 60, 80, 45];

/** Stands in for the trend charts until there is a busy week to draw. */
function TrendsExplainer() {
  return (
    <section
      aria-labelledby="dashboard-trends-soon"
      className="flex flex-wrap items-center gap-6 rounded-card border border-ds-border bg-ds-surface px-5 py-[18px] shadow-card"
    >
      <div
        aria-hidden="true"
        className="flex h-[140px] min-w-0 flex-[1_1_320px] items-end gap-2.5 border-b border-ds-border px-1"
      >
        {ghostBars.map((height, index) => (
          <span
            className="flex-1 rounded-t bg-ds-status-neutral-bg"
            key={index}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-2">
        <h2 className="text-[15px] font-extrabold text-ds-text" id="dashboard-trends-soon">
          Trends appear after your first busy week
        </h2>
        <p className="text-[13px] text-ds-text-3">
          Transfers by outcome, acknowledgement quality, kitchen wastage, top items and vendor
          acceptance fill in automatically once transfers, GRNs and productions are recorded.
        </p>
        <IfCanOpen href="/inventory/transfers/new">
          <Link
            className="mt-1 inline-flex h-9 items-center self-start rounded-[9px] border border-ds-border px-3 text-[12.5px] font-bold text-ds-link transition hover:bg-ds-primary-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
            href="/inventory/transfers/new"
          >
            Record a transfer
          </Link>
        </IfCanOpen>
      </div>
    </section>
  );
}

/** A new workspace's lower half: what's coming and what happened, beside the create shortcuts. */
function NewWorkspaceRow({ stats }: Readonly<{ stats: DashboardStats }>) {
  const { can } = stats;
  const showQueue = can.transfers || can.grns || can.productions;

  return (
    <div className="flex flex-wrap items-stretch gap-5">
      <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-5">
        <TrendsExplainer />
        {showQueue ? <WorkQueue defaultTab="activity" stats={stats} /> : null}
      </div>
      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
        <QuickCreateCard />
        <MasterDataCard stats={stats} />
      </div>
    </div>
  );
}

export function DashboardOverview() {
  const { isAllLocations, locationLabel } = useLocationContext();
  const { currentUser, hasPermission } = useAuth();
  const [days, setDays] = useUrlParam<PeriodValue>('days', '7', periodValues);
  const stats = useDashboardStats(Number(days) as Period);
  const { can } = stats;
  const pendingTotal = stats.pending.data?.meta.total ?? 0;
  const showOperations = can.transfers || can.grns || can.productions;
  const hasQuickCreate = createCommands.some((command) => hasPermission(command.permissions));
  const hasMasters =
    can.hospitals || can.stores || can.kitchens || can.restaurants || can.items || can.employees;
  const userName = currentUser?.name?.trim();
  // A new workspace (nothing sent in the period, setup unfinished) gets the setup view; until
  // the mode is known the live layout's skeletons hold the space.
  const isNew = stats.isModeKnown && stats.mode === 'new';

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[12.5px] font-semibold text-ds-muted">
            {headerDateFormatter.format(new Date())} · Max Healthcare ·{' '}
            {isAllLocations ? 'All locations' : locationLabel}
          </p>
          {/* The full name always shows: a long one wraps, it is never cut off. */}
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-ds-text wrap-anywhere">
            {userName ? `${greeting()}, ${userName}` : 'Dashboard'}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {showOperations ? (
            <SegmentedControl<PeriodValue>
              className="bg-ds-surface"
              label="Stats period"
              onChange={setDays}
              options={periodValues.map((value) => ({ label: `${value} days`, value }))}
              value={days}
            />
          ) : null}
          {isNew ? (
            <IfCanOpen href="/inventory/transfers/new">
              <Button asChild className="px-3.5">
                <Link href="/inventory/transfers/new">
                  <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                  Create first transfer of the week
                </Link>
              </Button>
            </IfCanOpen>
          ) : can.transfers ? (
            <Button asChild className="px-3.5">
              <Link href={pendingHref}>
                <ArrowRightLeft aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                Review pending
                {pendingTotal > 0 ? (
                  <span className="rounded-full bg-white px-[7px] py-px text-[11.5px] font-extrabold tabular-nums text-ds-primary">
                    {pendingTotal}
                  </span>
                ) : null}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {isNew ? (
        <>
          <SetupChecklist steps={stats.setup.steps} />
          <NewKpiRow stats={stats} />
          <NewWorkspaceRow stats={stats} />
        </>
      ) : (
        <>
          {showOperations ? <InsightsRow stats={stats} /> : null}
          <KpiRow stats={stats} />
          <OutcomeRow stats={stats} />
          <TrendsRow stats={stats} />
          <WorkRow stats={stats} />
          <LocationsRow stats={stats} />
        </>
      )}
      {!showOperations && !can.stock && !hasQuickCreate && !hasMasters ? (
        <EmptyState
          description="Your role has no dashboard data yet. Ask an administrator if you expected to see something here."
          title="Nothing to show on your dashboard"
        />
      ) : null}
    </section>
  );
}
