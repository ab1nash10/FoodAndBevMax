'use client';

import { pillLabel } from '@/components/admin-shell/top-nav';
import { findPage, getActiveNavHref, navigationGroups } from '@/lib/navigation';
import { usePathname } from 'next/navigation';

/** The open page's module, over its title (Item & menu, Inventory…); nothing outside the menu. */
export function ModuleEyebrow() {
  const href = getActiveNavHref(usePathname() ?? '');
  const page = href ? findPage(href) : undefined;
  const group = page && navigationGroups.find((each) => each.label === page.group);

  return group && group.label !== 'Dashboard' ? (
    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ds-link">
      {pillLabel(group)}
    </p>
  ) : null;
}
