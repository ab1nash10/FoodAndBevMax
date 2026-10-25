'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { getActiveNavHref, navigationGroups, type NavBadge, type NavGroup } from '@/lib/navigation';
import { usePrefetchOnIntent } from '@/lib/prefetch';
import { cn } from '@/lib/utils';

type Counts = Partial<Record<NavBadge, number>>;
type HasPermission = (permission: string | string[]) => boolean;

// Pills are short; the full names stay in the menu, the command palette and the page titles.
const pillLabels: Partial<Record<NavGroup['label'], string>> = {
  'Item & Menu Setup': 'Item & Menu',
  'Kitchen Operations': 'Kitchen',
  Overview: 'Dashboard',
  'Point of Sale': 'POS',
};

const focusRing =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface';

/** The modules this user may open (a module shows when one of its pages may be opened). */
export function useModules(hasPermission: HasPermission) {
  const activeHref = getActiveNavHref(usePathname());
  const modules = navigationGroups
    .map((group) => ({
      group,
      pages: group.items.filter(
        (item) => !item.hidden && (!item.permissions || hasPermission(item.permissions)),
      ),
    }))
    .filter((module) => module.pages.length > 0);
  const active = modules.find((module) => module.pages.some((page) => page.href === activeHref));

  return { active, activeHref, modules };
}

export function pillLabel(group: NavGroup): string {
  return pillLabels[group.label] ?? group.label;
}

/** Until the clicked link's page arrives, it already shows as the chosen one. */
function Pending({ className }: Readonly<{ className: string }>) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={cn(
        className,
        'transition-opacity duration-150',
        pending ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}

function Count({ value }: Readonly<{ value: number }>) {
  return (
    <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ds-status-pending-bg px-1.5 text-[11px] font-bold tabular-nums text-ds-status-pending-fg">
      {value}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

/** The top bar's module pills: one per module, opening its first page. */
export function ModulePills({
  className,
  counts,
  hasPermission,
}: Readonly<{ className?: string; counts: Counts; hasPermission: HasPermission }>) {
  const { active, modules } = useModules(hasPermission);
  const prefetchProps = usePrefetchOnIntent();

  return (
    <nav aria-label="Modules" className={className}>
      <ul className="flex items-center gap-1">
        {modules.map(({ group, pages }) => {
          const isActive = active?.group === group;
          const waiting = pages.reduce(
            (total, page) => total + (page.badge ? (counts[page.badge] ?? 0) : 0),
            0,
          );
          const first = pages[0];

          return first ? (
            <li key={group.label}>
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative isolate flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13.5px] transition-colors duration-150',
                  focusRing,
                  isActive
                    ? 'bg-ds-primary-soft font-semibold text-ds-link'
                    : 'font-medium text-ds-text-3 hover:bg-ds-subtle hover:text-ds-text',
                )}
                href={first.href}
                title={group.label}
                {...prefetchProps(first.href)}
              >
                {isActive ? null : (
                  <Pending className="absolute inset-0 -z-10 rounded-lg bg-ds-primary-soft" />
                )}
                {pillLabel(group)}
                {waiting > 0 ? <Count value={waiting} /> : null}
              </Link>
            </li>
          ) : null;
        })}
      </ul>
    </nav>
  );
}

/** The second row: the current module's pages, one click apart. Wraps rather than scrolling, so
 *  no page is ever hidden past the edge. */
export function ModuleTabs({
  className,
  counts,
  hasPermission,
}: Readonly<{ className?: string; counts: Counts; hasPermission: HasPermission }>) {
  const { active, activeHref } = useModules(hasPermission);
  const prefetchProps = usePrefetchOnIntent();

  // A module of one page (Dashboard, Reports) needs no tabs.
  if (!active || active.pages.length < 2) {
    return null;
  }

  return (
    <nav aria-label={`${active.group.label} pages`} className={className}>
      {/* -ml-3: the first tab's text lines up with the logo and the page title. */}
      <ul className="-ml-3 flex flex-wrap *:shrink-0">
        {active.pages.map((page) => {
          const isActive = page.href === activeHref;
          const count = page.badge ? (counts[page.badge] ?? 0) : 0;

          return (
            <li className="flex" key={page.href}>
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex h-10 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary',
                  'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full',
                  isActive
                    ? 'font-semibold text-ds-text after:bg-ds-primary'
                    : 'font-medium text-ds-muted hover:text-ds-text',
                )}
                href={page.href}
                {...prefetchProps(page.href)}
              >
                {page.label}
                {isActive ? null : (
                  <Pending className="absolute inset-x-3 bottom-0 z-1 h-0.5 rounded-full bg-ds-primary" />
                )}
                {count > 0 ? <Count value={count} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
