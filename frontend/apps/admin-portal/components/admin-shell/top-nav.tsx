'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type MouseEvent } from 'react';
import { SlideIndicator, useSlidingIndicator } from '@/components/swiss-motion';
import { getActiveNavHref, navigationGroups, type NavBadge, type NavGroup } from '@/lib/navigation';
import { usePrefetchOnIntent } from '@/lib/prefetch';
import { cn } from '@/lib/utils';

type Counts = Partial<Record<NavBadge, number>>;
type HasPermission = (permission: string | string[]) => boolean;

/** The chosen module or page: a pill in the F&B logo's blue. */
const chosenPill =
  'bg-linear-to-br from-[#2477cf] to-ds-primary shadow-[0_6px_14px_-8px_rgb(11_87_164/0.8)]';
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

/** A module's name: the same in the top bar, search, the phone menu and page eyebrows. */
export function pillLabel(group: NavGroup): string {
  return group.label;
}

/** A click that opens the link in this tab (not a new tab or window). */
const opensHere = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** Counts a link up while its page is on its way, down once it opens (or the click is replaced). */
export type OnPending = (change: 1 | -1) => void;

/** Inside a menu link: tells the shell while that link's page is still on its way. */
function LinkPending({ onPending }: Readonly<{ onPending?: OnPending }>) {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!pending || !onPending) return;
    onPending(1);
    return () => onPending(-1);
  }, [onPending, pending]);

  return null;
}

function Count({ value }: Readonly<{ value: number }>) {
  return (
    <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ds-status-pending-bg px-1.5 text-[11px] font-bold tabular-nums text-ds-status-pending-fg">
      {value}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

/**
 * The link just clicked shows as chosen at once (its pill or underline slides to it, Swiss
 * motion) until its page arrives; from then on the page's own link is chosen. aria-current stays
 * on the page actually shown.
 */
function usePicked(current: string | null | undefined) {
  const [picked, setPicked] = useState<{ from: string | null | undefined; to: string } | null>(
    null,
  );
  const chosen = picked && picked.from === current ? picked.to : current;

  return {
    chosen,
    pick: (event: MouseEvent, to: string) => {
      if (opensHere(event)) setPicked({ from: current, to });
    },
  };
}

/** The top bar's module pills: one per module, opening its first page. */
export function ModulePills({
  className,
  counts,
  hasPermission,
  onPending,
}: Readonly<{
  className?: string;
  counts: Counts;
  hasPermission: HasPermission;
  onPending?: OnPending;
}>) {
  const { active, modules } = useModules(hasPermission);
  const prefetchProps = usePrefetchOnIntent();
  const { chosen, pick } = usePicked(active?.group.label);
  const { box, rowRef, slides } = useSlidingIndicator<HTMLUListElement>('[data-chosen]', chosen);

  return (
    <nav aria-label="Modules" className={className}>
      {/* The chosen module sits on a pill in the logo's blue, as the page tabs below do (2026-11-23). */}
      <ul className="relative flex h-16 items-center gap-0.5" ref={rowRef}>
        <SlideIndicator box={box} className={cn('rounded-full', chosenPill)} slides={slides} />
        {modules.map(({ group, pages }) => {
          const isChosen = chosen === group.label;
          const waiting = pages.reduce(
            (total, page) => total + (page.badge ? (counts[page.badge] ?? 0) : 0),
            0,
          );
          const first = pages[0];

          return first ? (
            <li key={group.label}>
              <Link
                aria-current={active?.group === group ? 'page' : undefined}
                className={cn(
                  'relative isolate flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] transition-colors duration-150',
                  focusRing,
                  isChosen
                    ? cn('font-semibold text-white', !box && chosenPill)
                    : 'font-medium text-ds-text-3 hover:text-ds-text',
                )}
                data-chosen={isChosen ? '' : undefined}
                href={first.href}
                onClick={(event) => pick(event, group.label)}
                title={group.label}
                {...prefetchProps(first.href)}
              >
                {pillLabel(group)}
                {waiting > 0 ? <Count value={waiting} /> : null}
                <LinkPending onPending={onPending} />
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
  onPending,
}: Readonly<{
  className?: string;
  counts: Counts;
  hasPermission: HasPermission;
  onPending?: OnPending;
}>) {
  const { active, activeHref } = useModules(hasPermission);

  // A module of one page (Dashboard, Reports) needs no tabs.
  if (!active || active.pages.length < 2) {
    return null;
  }

  // Keyed by module: another module's row starts afresh, its underline placed without sliding.
  return (
    <ModuleTabRow
      activeHref={activeHref}
      className={className}
      counts={counts}
      key={active.group.label}
      label={active.group.label}
      onPending={onPending}
      pages={active.pages}
    />
  );
}

function ModuleTabRow({
  activeHref,
  className,
  counts,
  label,
  onPending,
  pages,
}: Readonly<{
  activeHref: string | null;
  className?: string;
  counts: Counts;
  label: string;
  onPending?: OnPending;
  pages: ReturnType<typeof useModules>['modules'][number]['pages'];
}>) {
  const prefetchProps = usePrefetchOnIntent();
  const { chosen, pick } = usePicked(activeHref);
  const { box, rowRef, slides } = useSlidingIndicator<HTMLUListElement>('[data-chosen]', chosen);

  return (
    <nav aria-label={`${label} pages`} className={className}>
      {/* -ml-3: the first tab's text lines up with the logo and the page title. */}
      <ul className="relative -ml-1 flex flex-wrap gap-0.5 *:shrink-0" ref={rowRef}>
        <SlideIndicator box={box} className={cn('rounded-full', chosenPill)} slides={slides} />
        {pages.map((page) => {
          const isChosen = page.href === chosen;
          const count = page.badge ? (counts[page.badge] ?? 0) : 0;

          return (
            <li className="flex" key={page.href}>
              <Link
                aria-current={page.href === activeHref ? 'page' : undefined}
                className={cn(
                  'relative flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px] transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
                  isChosen
                    ? cn('font-semibold text-white', !box && chosenPill)
                    : 'font-medium text-ds-text-3 hover:text-ds-text',
                )}
                data-chosen={isChosen ? '' : undefined}
                href={page.href}
                onClick={(event) => pick(event, page.href)}
                {...prefetchProps(page.href)}
              >
                {page.label}
                {count > 0 ? <Count value={count} /> : null}
                <LinkPending onPending={onPending} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
