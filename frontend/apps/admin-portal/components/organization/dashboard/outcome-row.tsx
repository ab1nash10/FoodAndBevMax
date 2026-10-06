'use client';

import { Skeleton } from '@/components/ui';
import { DonutChart } from '@/components/charts/donut-chart';
import { StackedBarChart } from '@/components/charts/stacked-bar-chart';
import type { DashboardStats } from '@/hooks/use-dashboard-stats';
import { cn } from '@/lib/utils';
import {
  DashboardCard,
  ErrorCard,
  InlineLink,
} from '@/components/organization/dashboard/dashboard-card';
import { plural } from '@/components/organization/dashboard/format';

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
export function OutcomeRow({ stats }: Readonly<{ stats: DashboardStats }>) {
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
