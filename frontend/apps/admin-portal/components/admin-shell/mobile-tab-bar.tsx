'use client';

import {
  ChefHat,
  LayoutGrid,
  MoreHorizontal,
  Package,
  Receipt,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Pending } from '@/components/admin-shell/top-nav';
import { getActiveNavHref } from '@/lib/navigation';
import { usePrefetchOnIntent } from '@/lib/prefetch';
import { cn } from '@/lib/utils';

interface TabPage {
  group: string;
  href: string;
}

const tabs: Array<{ group: string; icon: LucideIcon; label: string }> = [
  { group: 'Overview', icon: LayoutGrid, label: 'Today' },
  { group: 'Point of Sale', icon: Receipt, label: 'POS' },
  { group: 'Inventory', icon: Package, label: 'Inventory' },
  { group: 'Kitchen Operations', icon: ChefHat, label: 'Kitchen' },
];

/**
 * Phone navigation within thumb reach, below the nav breakpoint: the day-to-day sections (each
 * opening its first page this user may see; hidden when they may see none) and More for the
 * full menu.
 */
export function MobileTabBar({
  onMore,
  pages,
  pathname,
}: Readonly<{ onMore: () => void; pages: TabPage[]; pathname: string }>) {
  const activeHref = getActiveNavHref(pathname);
  const prefetchProps = usePrefetchOnIntent();
  const activeGroup = pages.find((page) => page.href === activeHref)?.group;
  const items = tabs.flatMap((tab) => {
    const first = pages.find((page) => page.group === tab.group);

    return first ? [{ ...tab, href: first.href }] : [];
  });
  const itemClass =
    'relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary';

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-ds-border bg-ds-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl nav:hidden"
    >
      {items.map(({ group, href, icon: Icon, label }) => {
        const isActive = group === activeGroup;

        return (
          <Link
            aria-current={isActive ? 'page' : undefined}
            className={cn(itemClass, isActive ? 'text-ds-link' : 'text-ds-muted')}
            href={href}
            key={group}
            {...prefetchProps(href)}
          >
            <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={isActive ? 2.2 : 1.8} />
            {label}
            {isActive ? null : (
              <Pending className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-ds-primary" />
            )}
          </Link>
        );
      })}
      <button className={cn(itemClass, 'text-ds-muted')} onClick={onMore} type="button">
        <MoreHorizontal aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
        More
      </button>
    </nav>
  );
}
