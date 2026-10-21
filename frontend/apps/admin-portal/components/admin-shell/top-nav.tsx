'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { getActiveNavHref, navigationGroups, type NavBadge, type NavGroup } from '@/lib/navigation';
import { usePrefetchOnIntent } from '@/lib/prefetch';
import { cn } from '@/lib/utils';

type Counts = Partial<Record<NavBadge, number>>;
type HasPermission = (permission: string | string[]) => boolean;

// Pills are short; the full names stay in the tabs, the command palette and the page titles.
const pillLabels: Partial<Record<NavGroup['label'], string>> = {
  'Item & Menu Setup': 'Menus & Items',
  'Kitchen Operations': 'Kitchen',
  Overview: 'Dashboard',
  'Point of Sale': 'POS',
};

const focusRing =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface';

/** The modules this user may open (a module shows when one of its pages may be opened). */
function useModules(hasPermission: HasPermission) {
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

/** Until the clicked link's page arrives, it already shows as the chosen one. */
export function Pending({ className }: Readonly<{ className: string }>) {
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
    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ds-status-pending-bg px-1.5 text-[11px] font-bold tabular-nums text-ds-status-pending-fg">
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
      <ul className="flex items-center gap-0.5 rounded-full border border-ds-border bg-ds-subtle-2 p-1 2xl:gap-1">
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
                  'relative isolate flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[13px] transition-colors duration-150 xl:px-2.5 2xl:px-3.5 2xl:text-[13.5px]',
                  focusRing,
                  isActive
                    ? 'bg-ds-surface font-semibold text-ds-link shadow-sm ring-1 ring-ds-border'
                    : 'font-medium text-ds-text-3 hover:bg-ds-surface/70 hover:text-ds-text',
                )}
                href={first.href}
                title={group.label}
                {...prefetchProps(first.href)}
              >
                {isActive ? null : (
                  <Pending className="absolute inset-0 -z-10 rounded-full bg-ds-surface shadow-sm ring-1 ring-ds-border" />
                )}
                {pillLabels[group.label] ?? group.label}
                {!isActive && waiting > 0 ? <Count value={waiting} /> : null}
              </Link>
            </li>
          ) : null;
        })}
      </ul>
    </nav>
  );
}

/** The second row: the current module's pages, one click apart. */
export function ModuleTabs({
  className,
  counts,
  hasPermission,
}: Readonly<{ className?: string; counts: Counts; hasPermission: HasPermission }>) {
  const { active, activeHref } = useModules(hasPermission);
  const prefetchProps = usePrefetchOnIntent();

  if (!active) {
    return <div className={className} />;
  }

  return (
    <nav aria-label={`${active.group.label} pages`} className={className}>
      <ul className="flex h-full items-stretch gap-1 overflow-x-auto">
        {active.pages.map((page) => {
          const isActive = page.href === activeHref;
          const Icon = page.icon;
          const count = page.badge ? (counts[page.badge] ?? 0) : 0;

          return (
            <li className="flex" key={page.href}>
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-2 whitespace-nowrap rounded-t-md px-2.5 text-[13.5px] xl:px-3 transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary',
                  'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-transform after:duration-200',
                  isActive
                    ? 'font-semibold text-ds-text after:scale-x-100 after:bg-ds-primary'
                    : 'font-medium text-ds-muted after:scale-x-0 after:bg-ds-border hover:text-ds-text hover:after:scale-x-100',
                )}
                href={page.href}
                {...prefetchProps(page.href)}
              >
                {/* Below xl the icons go, so a module with many pages (POS) still fits. */}
                <Icon
                  aria-hidden="true"
                  className="hidden h-4 w-4 shrink-0 xl:block"
                  strokeWidth={1.8}
                />
                {page.label}
                {isActive ? null : (
                  <Pending className="absolute inset-x-2 bottom-0 z-1 h-0.5 rounded-full bg-ds-primary" />
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
