'use client';

import { usePathname } from 'next/navigation';
import { findPage, getActiveNavHref } from '@/lib/navigation';

/** The open page's own navigation icon in a solid blue tile, beside its title (from sm up). */
export function PageIcon() {
  const href = getActiveNavHref(usePathname());
  const page = href ? findPage(href) : undefined;

  if (!page) return null;
  const Icon = page.icon;

  return (
    <span
      aria-hidden="true"
      className="hidden h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-ds-primary text-white shadow-lg shadow-ds-primary/30 sm:grid"
    >
      <Icon className="h-7 w-7" strokeWidth={1.8} />
    </span>
  );
}
