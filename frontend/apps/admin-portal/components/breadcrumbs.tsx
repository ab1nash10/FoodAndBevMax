'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/components/auth-provider';
import { getBreadcrumbTrail, getPermittedPages, type Crumb } from '@/lib/navigation';

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

/**
 * Above the page title. A top-level page shows its sidebar section as a small label (none when
 * the section has only that page, as the sidebar shows no heading for it). A deeper page shows
 * the way back instead: its parent pages, then itself. The sidebar already lists every page, so
 * the section is not a menu. Below the `nav` breakpoint a deeper page collapses to "‹ Parent".
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const { labels } = useContext(BreadcrumbLabelsContext);
  const trail = getBreadcrumbTrail(pathname, searchParams, hasPermission, labels);
  const group = trail.find((crumb) => crumb.group)?.group;
  const steps = trail.filter((crumb) => !crumb.group);
  const parent = [...steps.slice(0, -1)].reverse().find((crumb) => crumb.href);

  if (steps.length <= 1) {
    const sectionPages = getPermittedPages(hasPermission).filter((page) => page.group === group);

    return group && sectionPages.length > 1 ? (
      // -mb-1.5 pulls the title up under its label; ml-1 undoes the shell's hover-padding offset.
      <p className="-mb-1.5 ml-1 text-[11.5px] font-bold uppercase tracking-[0.08em] text-ds-muted">
        {group}
      </p>
    ) : null;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 shrink items-center text-[13px]">
      <ol className="hidden min-w-0 items-center gap-1 nav:flex">
        {steps.map((crumb, index) => (
          <li className="flex min-w-0 items-center gap-1" key={`${index}-${crumb.label}`}>
            {index > 0 ? (
              <ChevronRight
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-ds-muted/60"
                strokeWidth={2}
              />
            ) : null}
            {crumb.current ? (
              <span aria-current="page" className="min-w-0 px-1 font-semibold text-ds-text">
                <CrumbLabel crumb={crumb} />
              </span>
            ) : crumb.href ? (
              <Link
                className="min-w-0 rounded-sm px-1 py-0.5 font-medium text-ds-link transition hover:bg-ds-subtle hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
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
        ) : null}
      </div>
    </nav>
  );
}
