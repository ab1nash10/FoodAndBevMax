'use client';

import Link from 'next/link';
import { ChartCard, KeyboardHint } from '@/components/design-system';
import { useAuth } from '@/components/auth-provider';
import { createCommands } from '@/components/command-palette';
import { useLocationContext } from '@/components/location-context';
import { Skeleton } from '@/components/ui';
import type { DashboardStats } from '@/hooks/use-dashboard-stats';
import { cn } from '@/lib/utils';
import { ArrowRightLeft, CookingPot, Plus, type LucideIcon } from 'lucide-react';
import { tones } from '@/components/organization/dashboard/format';

const quickCreateIcons: Record<string, LucideIcon> = {
  '/inventory/grns/new': Plus,
  '/inventory/transfers/new': ArrowRightLeft,
  '/kitchen/productions/new': CookingPot,
};

/** The create pages the user may open, with their N-then-letter shortcuts. */
export function QuickCreateCard() {
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
export function MasterDataCard({ stats }: Readonly<{ stats: DashboardStats }>) {
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
