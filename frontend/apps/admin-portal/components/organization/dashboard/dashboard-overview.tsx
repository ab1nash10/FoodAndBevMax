'use client';

import Link from 'next/link';
import { EmptyState, HeroHeader, QuickTiles, type QuickTile } from '@/components/design-system';
import { useNavCounts } from '@/components/admin-shell/sidebar-content';
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
import { ArrowRightLeft, ChefHat, ClipboardCheck, Gauge, Plus } from 'lucide-react';
import { canOpenPath } from '@/lib/navigation';
import { pendingHref } from '@/components/organization/dashboard/format';
import { CountersRow } from '@/components/organization/dashboard/counters-row';
import { KpiRow, NewKpiRow } from '@/components/organization/dashboard/kpi-row';
import { LocationsRow } from '@/components/organization/dashboard/locations-card';
import {
  MasterDataCard,
  QuickCreateCard,
} from '@/components/organization/dashboard/master-data-card';
import { OutcomeRow } from '@/components/organization/dashboard/outcome-row';
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

// The day's usual first stops, as the hero's tiles.
const dashboardTiles: QuickTile[] = [
  {
    detail: 'Waiting on restaurants',
    href: pendingHref,
    icon: ArrowRightLeft,
    title: 'Transfers to acknowledge',
    tone: 'blue',
  },
  {
    detail: 'Check and add to stock',
    href: '/inventory/grns?view=DRAFT',
    icon: ClipboardCheck,
    title: 'Deliveries to verify',
    tone: 'violet',
  },
  {
    detail: 'Running low and expiring',
    href: '/inventory/stock-levels',
    icon: Gauge,
    title: 'Stock levels',
    tone: 'green',
  },
  {
    detail: 'What the kitchens made',
    href: '/kitchen/productions',
    icon: ChefHat,
    title: 'Kitchen production',
    tone: 'rose',
  },
];

export function DashboardOverview() {
  const greeting = useGreeting();
  const { isAllLocations, locationLabel } = useLocationContext();
  const { currentUser, hasPermission } = useAuth();
  const [days, setDays] = useUrlParam<PeriodValue>('days', '7', periodValues);
  const stats = useDashboardStats(Number(days) as Period);
  // The sidebar badges' counts (one shared request): what each tile has waiting right now.
  const navCounts = useNavCounts(hasPermission);
  const tileCounts: Record<string, Pick<QuickTile, 'count' | 'countLabel'>> = {
    '/inventory/grns?view=DRAFT': { count: navCounts.grns, countLabel: 'to verify' },
    '/kitchen/productions': { count: navCounts.productions, countLabel: 'to post' },
    [pendingHref]: { count: navCounts.transfers, countLabel: 'waiting' },
  };
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
      <HeroHeader
        action={
          <>
            {showOperations ? (
              <SegmentedControl<PeriodValue>
                className="bg-ds-surface"
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
                <Button
                  asChild
                  className="bg-white px-4 text-ds-link shadow-black/20 hover:bg-white/90"
                >
                  <Link href="/inventory/transfers/new">
                    <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                    New transfer
                  </Link>
                </Button>
              </IfCanOpen>
            ) : can.transfers ? (
              <Button
                asChild
                className="bg-white px-4 text-ds-link shadow-black/20 hover:bg-white/90"
              >
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
        description={
          !stats.isModeKnown ? (
            <span
              aria-hidden="true"
              className="skeleton inline-block h-[18px] w-[min(26rem,100%)] rounded-md align-middle"
            />
          ) : (
            'What needs you today, how the last days went, and where to start.'
          )
        }
        eyebrow={
          <>
            {headerDateFormatter.format(new Date())} · Max Healthcare ·{' '}
            <span className="font-semibold text-white">
              {isAllLocations ? 'All locations' : locationLabel}
            </span>
          </>
        }
        title={userName ? `${greeting}, ${userName}` : 'Dashboard'}
      >
        <QuickTiles
          label="Go to"
          tiles={dashboardTiles
            .filter((tile) => canOpenPath(tile.href, hasPermission))
            .map((tile) => ({ ...tile, ...tileCounts[tile.href] }))}
        />
      </HeroHeader>

      {isNew ? (
        <>
          <NewKpiRow stats={stats} />
          <NewWorkspaceRow stats={stats} />
        </>
      ) : (
        <>
          <KpiRow stats={stats} />
          <CountersRow />
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
