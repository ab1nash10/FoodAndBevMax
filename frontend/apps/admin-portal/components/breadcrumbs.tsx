'use client';

import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useAuth } from '@/components/auth-provider';
import {
  getActiveNavHref,
  getBreadcrumbTrail,
  getPermittedPages,
  navigationGroups,
  type Crumb,
  type NavGroupLabel,
} from '@/lib/navigation';
import { cn } from '@/lib/utils';

type LabelMap = Record<string, string | undefined>;

const BreadcrumbLabelsContext = createContext<{
  labels: LabelMap;
  setLabel: (id: string, label: string) => void;
}>({ labels: {}, setLabel: () => undefined });

/** Holds the names pages give their records, so crumbs never show an id. */
export function BreadcrumbLabelsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [labels, setLabels] = useState<LabelMap>({});
  const setLabel = useCallback((id: string, label: string) => {
    setLabels((current) => (current[id] === label ? current : { ...current, [id]: label }));
  }, []);
  const value = useMemo(() => ({ labels, setLabel }), [labels, setLabel]);

  return (
    <BreadcrumbLabelsContext.Provider value={value}>{children}</BreadcrumbLabelsContext.Provider>
  );
}

/**
 * Names the record a page shows (`useBreadcrumbLabel(transfer?.id, transfer?.transferNumber)`).
 * Until a label arrives the crumb shows a short placeholder.
 */
export function useBreadcrumbLabel(
  id: string | null | undefined,
  label: string | null | undefined,
) {
  const { setLabel } = useContext(BreadcrumbLabelsContext);

  useEffect(() => {
    if (id && label) {
      setLabel(id, label);
    }
  }, [id, label, setLabel]);
}

const crumbText = 'block max-w-[16rem] truncate';

function CrumbLabel({ crumb }: Readonly<{ crumb: Crumb }>) {
  return crumb.loading ? (
    <span
      aria-label="Loading"
      className="block h-3 w-16 animate-pulse rounded-sm bg-ds-divider"
      role="img"
    />
  ) : (
    <span className={crumbText} title={crumb.label}>
      {crumb.label}
    </span>
  );
}

/** The group crumb: a menu of the group's pages the user may open, as in the sidebar. */
function GroupMenu({ compact, group }: Readonly<{ compact: boolean; group: NavGroupLabel }>) {
  const { hasPermission } = useAuth();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pages = getPermittedPages(hasPermission).filter((page) => page.group === group);
  const activeHref = getActiveNavHref(pathname);
  const GroupIcon = navigationGroups.find((candidate) => candidate.label === group)?.icon;
  const menuId = `breadcrumb-menu-${group.toLowerCase().replace(/[^a-z]+/g, '-')}`;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    (items.find((item) => item.getAttribute('aria-current') === 'page') ?? items[0])?.focus();

    const closeOnOutside = (event: PointerEvent) => {
      if (
        !menuRef.current?.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutside);

    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [isOpen]);

  function close(returnFocus: boolean) {
    setIsOpen(false);

    if (returnFocus) {
      buttonRef.current?.focus();
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') {
      close(false);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    }
  }

  return (
    <span className="relative">
      <button
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex max-w-[16rem] items-center gap-1 rounded-sm px-1 py-0.5 font-medium text-ds-muted transition hover:bg-ds-subtle hover:text-ds-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !isOpen) {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        ref={buttonRef}
        title={`${group} pages`}
        type="button"
      >
        {compact && GroupIcon ? (
          <>
            <GroupIcon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span className="sr-only">{group}</span>
          </>
        ) : (
          <span className="truncate">{group}</span>
        )}
        <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0" strokeWidth={2.2} />
      </button>
      {isOpen ? (
        <div
          aria-label={`${group} pages`}
          className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-card border border-ds-border bg-ds-surface p-1.5 shadow-xl shadow-ds-text/10"
          id={menuId}
          onKeyDown={onMenuKeyDown}
          ref={menuRef}
          role="menu"
        >
          {pages.length === 0 ? (
            <p className="px-2.5 py-2 text-[13px] text-ds-muted">No pages you can open here.</p>
          ) : (
            pages.map((page) => {
              const Icon = page.icon;
              const isCurrent = page.href === activeHref;

              return (
                <Link
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    'flex min-h-9 items-center gap-2.5 rounded-control px-2.5 text-[13px] outline-hidden transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary',
                    isCurrent
                      ? 'bg-ds-primary-soft font-bold text-ds-link'
                      : 'font-medium text-ds-text-2 hover:bg-ds-subtle',
                  )}
                  href={page.href}
                  key={page.href}
                  onClick={() => close(false)}
                  role="menuitem"
                >
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                  <span className="flex-1 truncate">{page.label}</span>
                  {isCurrent ? (
                    <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
                  ) : null}
                </Link>
              );
            })
          )}
        </div>
      ) : null}
    </span>
  );
}

/**
 * Where the user is: [group menu] › [page] › [record or sub-page]. Below the `nav`
 * breakpoint it collapses to one "‹ Parent" link.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const { labels } = useContext(BreadcrumbLabelsContext);
  const trail = getBreadcrumbTrail(pathname, searchParams, hasPermission, labels);
  const current = trail.at(-1);
  const parent = [...trail.slice(0, -1)].reverse().find((crumb) => crumb.href);
  // Four-step trails (edit pages) show the group as its sidebar icon to leave room for names.
  const compact = trail.length >= 4;

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 shrink items-center text-[13px]">
      <ol className="hidden min-w-0 items-center gap-1 nav:flex">
        {trail.map((crumb, index) => (
          <li className="flex min-w-0 items-center gap-1" key={`${index}-${crumb.label}`}>
            {index > 0 ? (
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ds-muted" />
            ) : null}
            {crumb.group ? (
              <GroupMenu compact={compact} group={crumb.group} />
            ) : crumb.current ? (
              <span aria-current="page" className="min-w-0 font-bold text-ds-text">
                <CrumbLabel crumb={crumb} />
              </span>
            ) : crumb.href ? (
              <Link
                className="min-w-0 rounded-sm px-1 py-0.5 font-medium text-ds-muted transition hover:bg-ds-subtle hover:text-ds-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                href={crumb.href}
              >
                <CrumbLabel crumb={crumb} />
              </Link>
            ) : (
              <span className="min-w-0 px-1 font-medium text-ds-muted">
                <CrumbLabel crumb={crumb} />
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* Phones and tablets: one step back up the trail. */}
      <div className="min-w-0 nav:hidden">
        {parent?.href ? (
          <Link
            className="flex min-w-0 items-center gap-0.5 rounded-sm font-bold text-ds-link focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
            href={parent.href}
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="sr-only">Back to </span>
            <CrumbLabel crumb={parent} />
          </Link>
        ) : current ? (
          <span aria-current="page" className="min-w-0 font-bold text-ds-text">
            <CrumbLabel crumb={current} />
          </span>
        ) : null}
      </div>
    </nav>
  );
}
