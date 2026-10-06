'use client';

import Link from 'next/link';
import { LoadingSkeleton } from '@/components/design-system';
import { useAuth } from '@/components/auth-provider';
import { createCommands } from '@/components/command-palette';
import { SortableTable, type SortableColumn } from '@/components/dashboard/sortable-table';
import type { DashboardStats } from '@/hooks/use-dashboard-stats';
import {
  WASTAGE_LIMIT,
  formatMinutes,
  formatPercent,
  type LocationRow,
} from '@/lib/dashboard-stats';
import { cn } from '@/lib/utils';
import { CardError, InlineLink } from '@/components/organization/dashboard/dashboard-card';
import { tones } from '@/components/organization/dashboard/format';
import {
  MasterDataCard,
  QuickCreateCard,
} from '@/components/organization/dashboard/master-data-card';

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
export function LocationsRow({ stats }: Readonly<{ stats: DashboardStats }>) {
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
