'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocationContext } from '@/components/location-context';
import { organizationApi } from '@/lib/api';
import { getActiveNavHref, navigationGroups, type NavBadge } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';

type NavCounts = Partial<Record<NavBadge, number>>;

/**
 * Work waiting in each queue, for the sidebar badges: transfers awaiting acknowledgement,
 * draft GRNs (not yet verified and posted) and draft productions, in one request (GET
 * /dashboard/nav-counts) instead of three. Keyed under ['dashboard'], so the existing query
 * invalidation refreshes them after every GRN, transfer or production change; a count the user
 * may not view comes back undefined.
 */
export function useNavCounts(hasPermission: (permission: string | string[]) => boolean): NavCounts {
  // Called by the shell before it waits for the location, so the counts wait for it here.
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const scope = scopedHospitalId ?? 'all';
  const refresh = { refetchInterval: 60_000, staleTime: 30_000 };
  const counts = useQuery({
    ...refresh,
    enabled:
      !isLoadingLocations &&
      hasPermission([
        'TRANSFER_VIEW',
        'KITCHEN_TRANSFER_VIEW',
        'GRN_VIEW',
        'KITCHEN_PRODUCTION_VIEW',
      ]),
    queryFn: async () =>
      (await organizationApi.getDashboardNavCounts({ hospitalId: scopedHospitalId })).data,
    queryKey: queryKeys.dashboardNavCounts('all', scope),
  });

  return useMemo(
    () => ({
      grns: counts.data?.grns,
      productions: counts.data?.productions,
      transfers: counts.data?.transfers,
    }),
    [counts.data],
  );
}

function CountBadge({ count, label }: Readonly<{ count: number; label: string }>) {
  return (
    <span className="rounded-full bg-ds-status-pending-bg px-[7px] py-px text-[11px] font-bold tabular-nums text-ds-status-pending-fg">
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

export function SidebarContent({
  counts,
  footer,
  hasPermission,
  note,
  onNavigate,
  sections = false,
}: Readonly<{
  counts: NavCounts;
  /** Under the modules: the signed-in account. */
  footer?: ReactNode;
  hasPermission: (permission: string | string[]) => boolean;
  /** Above the account: a short tip (the desktop sidebar). */
  note?: ReactNode;
  onNavigate?: () => void;
  /** Section labels (Setup / Operations / Admin) above their modules: the desktop sidebar. */
  sections?: boolean;
}>) {
  const pathname = usePathname();
  // Same rule as the breadcrumbs and the palette: the deepest registered page the path sits under.
  const activeHref = getActiveNavHref(pathname);
  const activeGroup =
    navigationGroups.find((group) => group.items.some((item) => item.href === activeHref))?.label ??
    null;
  // Only the module you are in starts open; the others fold away until you open them.
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(activeGroup ? [activeGroup] : []),
  );

  useEffect(() => {
    if (activeGroup) {
      setOpenGroups(new Set([activeGroup]));
    }
  }, [activeGroup]);

  function toggleGroup(label: string) {
    setOpenGroups((current) => {
      const next = new Set(current);

      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }

      return next;
    });
  }

  const focusRing =
    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary';
  let shownSection: string | undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav
        aria-label="Modules"
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3 pt-1 *:shrink-0"
      >
        {navigationGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.hidden && (!item.permissions || hasPermission(item.permissions)),
          );

          if (visibleItems.length === 0) {
            return null;
          }

          const groupId = `sidebar-group-${group.label.toLowerCase().replaceAll(' ', '-')}`;
          const ModuleIcon = group.icon;
          const isGroupActive = visibleItems.some((item) => item.href === activeHref);
          const groupCount = visibleItems.reduce(
            (total, item) => total + (item.badge ? (counts[item.badge] ?? 0) : 0),
            0,
          );

          // Overview holds only the Dashboard, a plain link.
          // A section holding one page of the same name is that page: one link, not a
          // header over a duplicate entry.
          const singleItem =
            group.label === 'Overview' ||
            (visibleItems.length === 1 && visibleItems[0]?.label === group.label)
              ? visibleItems[0]
              : undefined;

          if (singleItem) {
            const isActive = singleItem.href === activeHref;

            return (
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors duration-150',
                  focusRing,
                  isActive
                    ? 'bg-ds-primary font-semibold text-white shadow-[0_6px_16px_rgb(11_87_164/0.28)]'
                    : 'font-medium text-ds-text-2 hover:bg-ds-subtle hover:text-ds-text',
                )}
                href={singleItem.href}
                key={group.label}
                onClick={onNavigate}
              >
                <ModuleIcon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
                {singleItem.label}
              </Link>
            );
          }

          const isOpen = openGroups.has(group.label);
          const sectionLabel =
            sections && group.section && group.section !== shownSection ? group.section : null;
          shownSection = group.section ?? shownSection;

          return (
            <div className="flex flex-col gap-px pt-1" key={group.label}>
              {sectionLabel ? (
                <div className="px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ds-muted">
                  {sectionLabel}
                </div>
              ) : null}
              <button
                aria-controls={groupId}
                aria-expanded={isOpen}
                className={cn(
                  'flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors duration-150 hover:bg-ds-subtle',
                  focusRing,
                  isGroupActive ? 'font-semibold text-ds-text' : 'font-medium text-ds-text-2',
                )}
                onClick={() => toggleGroup(group.label)}
                type="button"
              >
                <ModuleIcon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                {!isOpen && groupCount > 0 ? (
                  <CountBadge count={groupCount} label="waiting" />
                ) : null}
                {isOpen ? (
                  <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ds-muted" />
                ) : (
                  <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ds-muted" />
                )}
              </button>
              {isOpen ? (
                <div
                  className="mb-1 ml-[21px] flex flex-col gap-px border-l border-ds-divider pl-2.5"
                  id={groupId}
                >
                  {visibleItems.map((item) => {
                    const isActive = item.href === activeHref;
                    const count = item.badge ? (counts[item.badge] ?? 0) : 0;

                    return (
                      <Link
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex h-10 shrink-0 items-center justify-between gap-2 rounded-xl px-3 text-sm transition-colors duration-150',
                          focusRing,
                          isActive
                            ? 'bg-ds-primary font-semibold text-white shadow-[0_6px_16px_rgb(11_87_164/0.28)]'
                            : 'font-medium text-ds-text-3 hover:bg-ds-subtle hover:text-ds-text',
                        )}
                        href={item.href}
                        key={item.href}
                        onClick={onNavigate}
                      >
                        <span className="truncate">{item.label}</span>
                        {count > 0 ? <CountBadge count={count} label="waiting" /> : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      {note ? <div className="px-3 pb-3">{note}</div> : null}
      {footer ? <div className="border-t border-ds-border p-2">{footer}</div> : null}
    </div>
  );
}
