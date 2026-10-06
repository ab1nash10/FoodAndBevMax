'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/design-system';
import { IfCanOpen, RecordLink } from '@/components/record-link';
import { Skeleton } from '@/components/ui';
import { HorizontalBarList } from '@/components/charts/horizontal-bar-list';
import { SplitBar } from '@/components/charts/split-bar';
import { TrendLine } from '@/components/charts/trend-line';
import type { DashboardStats } from '@/hooks/use-dashboard-stats';
import { VENDOR_REJECT_LIMIT, WASTAGE_LIMIT, formatPercent } from '@/lib/dashboard-stats';
import { recordHref } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import {
  DashboardCard,
  ErrorCard,
  InlineLink,
} from '@/components/organization/dashboard/dashboard-card';
import { plural, tones } from '@/components/organization/dashboard/format';

const shortDay = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });

/** Kitchen wastage trend, most transferred items and GRN acceptance by vendor. */
export function TrendsRow({ stats }: Readonly<{ stats: DashboardStats }>) {
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

const ghostBars = [35, 55, 25, 70, 60, 80, 45];

/** Stands in for the trend charts until there is a busy week to draw. */
export function TrendsExplainer() {
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
