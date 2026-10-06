'use client';

import Link from 'next/link';
import type { KitchenProduction, Transfer } from '@aahar/api-client';
import { EmptyState, LoadingSkeleton, StatusChip } from '@/components/design-system';
import { useAuth } from '@/components/auth-provider';
import { useLocationNames } from '@/components/inventory/use-locations';
import { RecordLink } from '@/components/record-link';
import { WorkQueueCard } from '@/components/dashboard/work-queue-card';
import type { DashboardStats } from '@/hooks/use-dashboard-stats';
import { recordHref } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@aahar/ui';
import { ArrowRightLeft, Check, ClipboardCheck, CookingPot, type LucideIcon } from 'lucide-react';
import {
  CardError,
  DashboardCard,
  SectionLink,
} from '@/components/organization/dashboard/dashboard-card';
import {
  formatAge,
  grnVerbs,
  minute,
  pendingHref,
  plural,
  tones,
} from '@/components/organization/dashboard/format';

type Tone = keyof typeof tones;

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

function activityTime(iso: string): string {
  const date = new Date(iso);

  return date.toDateString() === new Date().toDateString()
    ? timeFormatter.format(date)
    : dayFormatter.format(date);
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

const productionVerbs: Record<KitchenProduction['status'], string> = {
  CANCELLED: 'cancelled',
  DRAFT: 'drafted',
  POSTED: 'posted',
};

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
export function WorkQueue({
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
export function WorkRow({ stats }: Readonly<{ stats: DashboardStats }>) {
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
