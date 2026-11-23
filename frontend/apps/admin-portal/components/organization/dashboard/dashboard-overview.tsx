'use client';

import Link from 'next/link';
import { AppPageHeader, EmptyState } from '@/components/design-system';
import { useAuth } from '@/components/auth-provider';
import { useGreeting } from '@/lib/greeting';
import { createCommands } from '@/components/command-palette';
import { useLocationContext } from '@/components/location-context';
import { IfCanOpen } from '@/components/record-link';
import { SegmentedControl } from '@/components/ui-controls';
import { useDashboardStats, type DashboardStats } from '@/hooks/use-dashboard-stats';
import type { Period } from '@/lib/dashboard-stats';
import { useUrlParam } from '@/lib/use-url-state';
import { Button } from '@aahar/ui';
import { ArrowRightLeft, Plus } from 'lucide-react';
import { pendingHref } from '@/components/organization/dashboard/format';
import { KpiRow, NewKpiRow } from '@/components/organization/dashboard/kpi-row';
import { LocationsRow } from '@/components/organization/dashboard/locations-card';
import {
  MasterDataCard,
  QuickCreateCard,
} from '@/components/organization/dashboard/master-data-card';
import { OutcomeRow } from '@/components/organization/dashboard/outcome-row';
import { ServiceDay } from '@/components/organization/dashboard/service-day';
import { TrendsExplainer, TrendsRow } from '@/components/organization/dashboard/trends-row';
import { WorkQueue, WorkRow } from '@/components/organization/dashboard/work-queue';

const headerDateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  weekday: 'long',
  year: 'numeric',
});

const periodValues = ['7', '30', '90'] as const;

type PeriodValue = (typeof periodValues)[number];

/** A new workspace's lower half: what's coming and what happened, beside the create shortcuts. */
function NewWorkspaceRow({ stats }: Readonly<{ stats: DashboardStats }>) {
  const { can } = stats;
  const showQueue = can.transfers || can.grns || can.productions;

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-4">
        <TrendsExplainer />
        {showQueue ? <WorkQueue defaultTab="activity" stats={stats} /> : null}
      </div>
      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
        <QuickCreateCard />
        <MasterDataCard stats={stats} />
      </div>
    </div>
  );
}

/**
 * The Dashboard. A role that may see the counters' sales gets the day's service (Service Desk,
 * 2026-11-22): today beside the same weekday last week, the counters, what waits and the
 * kitchen. Any other role gets its stock and kitchen numbers over a period.
 */
export function DashboardOverview() {
  const { hasPermission } = useAuth();

  return hasPermission(['ORDER_REPORT_VIEW', 'POS_ORDER_VIEW']) ? (
    <ServiceDashboard />
  ) : (
    <StockDashboard />
  );
}

/** The day's service: its own header row (the day, what it is compared with, live, export). */
function ServiceDashboard() {
  return <ServiceDay />;
}

function StockDashboard() {
  const greeting = useGreeting();
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
      <AppPageHeader
        action={
          <>
            {showOperations ? (
              <SegmentedControl<PeriodValue>
                label="Stats period"
                onChange={setDays}
                options={periodValues.map((value) => ({ label: `${value} days`, value }))}
                value={days}
              />
            ) : null}
            {/* Like the description and the card, the button waits for the mode: "Review pending"
                on a new workspace would turn into "New transfer" a moment later. */}
            {!stats.isModeKnown ? null : isNew ? (
              <IfCanOpen href="/inventory/transfers/new">
                <Button asChild>
                  <Link href="/inventory/transfers/new">
                    <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                    New transfer
                  </Link>
                </Button>
              </IfCanOpen>
            ) : can.transfers ? (
              <Button asChild variant="outline">
                <Link href={pendingHref}>
                  <ArrowRightLeft aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                  Review pending
                  {pendingTotal > 0 ? (
                    <span className="rounded-full bg-ds-primary px-[7px] py-px text-[11.5px] font-extrabold tabular-nums text-white">
                      {pendingTotal}
                    </span>
                  ) : null}
                </Link>
              </Button>
            ) : null}
          </>
        }
        description={`${headerDateFormatter.format(new Date())} · ${
          isAllLocations ? 'All locations' : locationLabel
        }`}
        title={userName ? `${greeting}, ${userName}` : 'Dashboard'}
      />

      <ServiceDay />

      {isNew ? (
        <>
          <NewKpiRow stats={stats} />
          <NewWorkspaceRow stats={stats} />
        </>
      ) : (
        <>
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
