'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/design-system';
import { useAuth } from '@/components/auth-provider';
import { createCommands } from '@/components/command-palette';
import { useLocationContext } from '@/components/location-context';
import { IfCanOpen } from '@/components/record-link';
import { SegmentedControl } from '@/components/ui-controls';
import { SetupChecklist } from '@/components/dashboard/setup-checklist';
import { useDashboardStats, type DashboardStats } from '@/hooks/use-dashboard-stats';
import type { Period } from '@/lib/dashboard-stats';
import { useUrlParam } from '@/lib/use-url-state';
import { Button } from '@aahar/ui';
import { ArrowRightLeft, Plus } from 'lucide-react';
import { pendingHref } from '@/components/organization/dashboard/format';
import { InsightsRow, KpiRow, NewKpiRow } from '@/components/organization/dashboard/kpi-row';
import { LocationsRow } from '@/components/organization/dashboard/locations-card';
import {
  MasterDataCard,
  QuickCreateCard,
} from '@/components/organization/dashboard/master-data-card';
import { OutcomeRow } from '@/components/organization/dashboard/outcome-row';
import { TrendsExplainer, TrendsRow } from '@/components/organization/dashboard/trends-row';
import { WorkQueue, WorkRow } from '@/components/organization/dashboard/work-queue';

function greeting(): string {
  const hour = new Date().getHours();

  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

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
