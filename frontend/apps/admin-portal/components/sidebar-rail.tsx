'use client';

// The collapsed sidebar (72px): one icon per module with dividers between the sections
// (Overview | Setup | Operations | Admin) and a pending-count badge per module. Hover, focus or
// click on a module opens a flyout menu of its pages (role="menu", the current page marked):
// arrow keys, Home and End move through it, Enter or ArrowDown on the icon moves into it, and
// Esc, Tab, a click outside or moving the pointer away closes it (Esc returns focus to the
// icon). The Dashboard is a plain link. "[" (handled by the shell) expands the sidebar.

import { PanelLeftOpen, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { BrandMark } from '@/components/design-system';
import { withBasePath } from '@/lib/base-path';
import {
  getActiveNavHref,
  navigationGroups,
  type NavBadge,
  type NavGroup,
  type NavPage,
} from '@/lib/navigation';
import { cn } from '@/lib/utils';

type Counts = Partial<Record<NavBadge, number>>;

interface RailModule {
  count: number;
  group: NavGroup;
  isActive: boolean;
  pages: NavPage[];
}

const focusRing = 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary';
const badgeText = (count: number) => (count > 99 ? '99+' : String(count));

export function SidebarRail({
  counts,
  hasPermission,
  onExpand,
  onOpenPalette,
}: Readonly<{
  counts: Counts;
  hasPermission: (permission: string | string[]) => boolean;
  onExpand: () => void;
  onOpenPalette: () => void;
}>) {
  const pathname = usePathname();
  const activeHref = getActiveNavHref(pathname);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  // Focus handed back to an icon (Esc, Tab out of the menu) must not reopen its menu.
  const skipFocusOpen = useRef(false);
  const [open, setOpen] = useState<{
    focus: 'first' | 'last' | null;
    label: string;
    top: number;
  } | null>(null);

  // The same RBAC filter as the expanded sidebar: only pages the user may open.
  const modules: RailModule[] = navigationGroups
    .map((group) => {
      const pages = group.items.filter(
        (item) => !item.hidden && (!item.permissions || hasPermission(item.permissions)),
      );

      return {
        count: pages.reduce(
          (total, page) => total + (page.badge ? (counts[page.badge] ?? 0) : 0),
          0,
        ),
        group,
        isActive: pages.some((page) => page.href === activeHref),
        pages,
      };
    })
    .filter((module) => module.pages.length > 0);
  const openModule = modules.find((module) => module.group.label === open?.label);

  function show(label: string, focus: 'first' | 'last' | null = null) {
    const button = buttonRefs.current.get(label);
    const root = rootRef.current;

    if (!button || !root) {
      return;
    }

    // Level with the icon, 6px higher so the menu's first row lines up with it.
    const top = button.getBoundingClientRect().top - root.getBoundingClientRect().top - 6;

    setOpen((current) =>
      current?.label === label && current.top === top && !focus ? current : { focus, label, top },
    );
  }

  function close(returnFocus = false) {
    const label = open?.label;

    setOpen(null);

    if (returnFocus && label) {
      skipFocusOpen.current = true;
      buttonRefs.current.get(label)?.focus();
      skipFocusOpen.current = false;
    }
  }

  // Keep the menu inside the window, then move focus into it when asked (Enter / arrows).
  useLayoutEffect(() => {
    const menu = menuRef.current;

    if (!open || !menu) {
      return;
    }

    const overflow = menu.getBoundingClientRect().bottom - (window.innerHeight - 8);

    if (overflow > 0) {
      menu.style.top = `${Math.max(8, open.top - overflow)}px`;
    }

    if (open.focus) {
      const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      const current = items.find((item) => item.getAttribute('aria-current') === 'page');

      (open.focus === 'last' ? items.at(-1) : (current ?? items[0]))?.focus();
    }
  }, [open]);

  // A route change or a click elsewhere closes the menu.
  useEffect(() => setOpen(null), [pathname]);
  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(null);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);

    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>, label: string) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      show(label, 'first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      show(label, 'last');
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      close(true);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % items.length
        : event.key === 'ArrowUp'
          ? (index - 1 + items.length) % items.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : -1;

    if (next >= 0) {
      event.preventDefault();
      items[next]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') {
      // Tab leaves the menu: go on from its icon, as if the menu were not there.
      close(true);
    }
  }

  let previousSection: string | undefined = 'start';

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(null);
        }
      }}
      onMouseLeave={() => setOpen(null)}
      ref={rootRef}
    >
      <div className="flex flex-col items-center gap-2.5 pb-3 pt-3.5">
        <Link
          aria-label="AAHAR dashboard"
          className={cn('rounded-control-lg', focusRing)}
          href="/dashboard"
          onFocus={() => setOpen(null)}
          onMouseEnter={() => setOpen(null)}
        >
          <BrandMark collapsed />
        </Link>
        <button
          aria-expanded={false}
          aria-keyshortcuts="["
          aria-label="Expand sidebar"
          className={cn(
            'grid h-8 w-8 place-items-center rounded-control border border-ds-border bg-ds-surface text-ds-text-3 transition hover:bg-ds-subtle hover:text-ds-text',
            focusRing,
          )}
          onClick={onExpand}
          onFocus={() => setOpen(null)}
          onMouseEnter={() => setOpen(null)}
          title="Expand sidebar ( [ )"
          type="button"
        >
          <PanelLeftOpen aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>

      <nav
        aria-label="Modules"
        className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1"
      >
        {modules.map((module) => {
          const { count, group, isActive } = module;
          const Icon = group.icon;
          const section = group.section;
          const divider = previousSection !== 'start' && section !== previousSection;
          previousSection = section;
          const label = `${group.label}${count ? `, ${count} pending` : ''}${isActive ? ', current section' : ''}`;
          const tile = cn(
            'relative grid h-11 w-11 shrink-0 place-items-center rounded-control-lg transition',
            focusRing,
            isActive
              ? 'bg-ds-primary-soft text-ds-link'
              : open?.label === group.label
                ? 'bg-ds-subtle text-ds-text'
                : 'text-ds-text-3 hover:bg-ds-subtle hover:text-ds-text',
          );
          const badge = count ? (
            <span
              aria-hidden="true"
              className="absolute right-0 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-ds-surface bg-ds-status-pending-bg px-1 text-[10px] font-extrabold tabular-nums text-ds-status-pending-fg"
            >
              {badgeText(count)}
            </span>
          ) : null;

          return (
            <div className="flex flex-col items-center" key={group.label}>
              {divider ? (
                <span aria-hidden="true" className="my-1.5 h-px w-7 bg-ds-border" />
              ) : null}
              {module.pages.length === 1 && !section ? (
                // Overview holds only the Dashboard: a plain link, no menu.
                <Link
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={module.pages[0]!.label}
                  className={tile}
                  href={module.pages[0]!.href}
                  onFocus={() => setOpen(null)}
                  onMouseEnter={() => setOpen(null)}
                  title={module.pages[0]!.label}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
                </Link>
              ) : (
                <button
                  aria-controls={open?.label === group.label ? menuId : undefined}
                  aria-current={isActive ? 'true' : undefined}
                  aria-expanded={open?.label === group.label}
                  aria-haspopup="menu"
                  aria-label={label}
                  className={tile}
                  onClick={() => show(group.label)}
                  onFocus={() => {
                    if (!skipFocusOpen.current) show(group.label);
                  }}
                  onKeyDown={(event) => onButtonKeyDown(event, group.label)}
                  onMouseEnter={() => show(group.label)}
                  ref={(element) => {
                    if (element) buttonRefs.current.set(group.label, element);
                    else buttonRefs.current.delete(group.label);
                  }}
                  type="button"
                >
                  <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
                  {badge}
                </button>
              )}
            </div>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-2 border-t border-ds-border pb-3.5 pt-3">
        <button
          aria-keyshortcuts="Control+K"
          aria-label="Search and shortcuts (Ctrl K)"
          className={cn(
            'grid h-11 w-11 place-items-center rounded-control-lg text-ds-text-3 transition hover:bg-ds-subtle hover:text-ds-text',
            focusRing,
          )}
          onClick={onOpenPalette}
          onFocus={() => setOpen(null)}
          onMouseEnter={() => setOpen(null)}
          title="Search & shortcuts (Ctrl K)"
          type="button"
        >
          <Search aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <span
          className="grid h-8 w-12 place-items-center rounded-control border border-ds-border bg-ds-logo-chip"
          title="Max Healthcare · Hospital workspace"
        >
          <Image
            alt="Max Healthcare"
            className="h-auto w-[38px]"
            height={58}
            src={withBasePath('/brand/max-logo.svg')}
            width={168}
          />
        </span>
      </div>

      {openModule && open ? (
        <div
          aria-label={openModule.group.label}
          className="absolute left-[calc(100%+8px)] z-50 flex w-sidebar flex-col gap-0.5 rounded-tile border border-ds-border bg-ds-surface p-2 shadow-xl shadow-black/15 dark:shadow-black/50"
          id={menuId}
          onKeyDown={onMenuKeyDown}
          ref={menuRef}
          role="menu"
          style={{ top: open.top }}
        >
          {/* Bridges the gap to the rail, so moving the pointer across it keeps the menu open. */}
          <span aria-hidden="true" className="absolute left-[-9px] top-0 h-full w-[9px]" />
          <div className="flex items-center justify-between px-2 pb-2 pt-1.5">
            <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-ds-muted">
              {openModule.group.label}
            </span>
            {openModule.count ? (
              <span className="rounded-full bg-ds-status-pending-bg px-[7px] py-px text-[11px] font-bold tabular-nums text-ds-status-pending-fg">
                {openModule.count} pending
              </span>
            ) : null}
          </div>
          {openModule.pages.map((page) => {
            const isCurrent = page.href === activeHref;
            const count = page.badge ? (counts[page.badge] ?? 0) : 0;

            return (
              <Link
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'flex min-h-9 items-center justify-between gap-2 rounded-control px-2.5 text-[13px] transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary',
                  isCurrent
                    ? 'bg-ds-primary-soft font-bold text-ds-link'
                    : 'font-medium text-ds-text-3 hover:bg-ds-subtle hover:text-ds-text focus-visible:bg-ds-subtle',
                )}
                href={page.href}
                key={page.href}
                onClick={() => setOpen(null)}
                role="menuitem"
                tabIndex={-1}
              >
                <span className="truncate">{page.label}</span>
                {count ? (
                  <span className="rounded-full bg-ds-status-pending-bg px-[7px] py-px text-[11px] font-bold tabular-nums text-ds-status-pending-fg">
                    {count}
                    <span className="sr-only"> pending</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
          <div className="mt-1 border-t border-ds-divider pt-1" role="none">
            <button
              className="flex min-h-8 w-full items-center justify-between gap-2 rounded-control px-2.5 text-[11.5px] font-medium text-ds-muted transition hover:bg-ds-subtle hover:text-ds-text focus-visible:bg-ds-subtle focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary"
              onClick={onExpand}
              role="menuitem"
              tabIndex={-1}
              type="button"
            >
              Expand sidebar
              <kbd className="font-sans font-extrabold text-ds-text-3">[</kbd>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
