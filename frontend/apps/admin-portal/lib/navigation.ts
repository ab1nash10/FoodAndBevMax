import {
  ArrowRightLeft,
  Boxes,
  Building2,
  CalendarClock,
  ChefHat,
  ClipboardList,
  CookingPot,
  CreditCard,
  IndianRupee,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  ListChecks,
  MapPin,
  NotebookText,
  Package,
  PackageOpen,
  ScrollText,
  ShieldCheck,
  Store,
  Tags,
  Utensils,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

/**
 * The portal's one list of routes. The sidebar, breadcrumbs, command palette and start-page
 * options are all derived from it, so a page is added (or renamed, or re-permissioned) here
 * and nowhere else. Kept free of React and `@/` imports: the login page and the node tests
 * import it too.
 */

export type NavBadge = 'grns' | 'productions' | 'transfers';

export type NavGroupLabel =
  | 'Access'
  | 'Inventory'
  | 'Item & Menu Setup'
  | 'Item Mapping'
  | 'Kitchen Operations'
  | 'Organization'
  | 'Overview';

export interface NavPage {
  /** Hidden pages highlight this sidebar entry instead (same screen under another URL). */
  activeAs?: string;
  /** Shows the count of work waiting in this queue. */
  badge?: NavBadge;
  /** Reachable by URL and breadcrumb, but not listed in the sidebar. */
  hidden?: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
  permissions?: string[];
  /**
   * How one record of this list is addressed: `id` lists open it from `?id=<uuid>`; `q`
   * lists have no detail view, so a record links to the list searched for its name.
   */
  record?: 'id' | 'q';
}

export interface NavGroup {
  icon: LucideIcon;
  items: NavPage[];
  label: NavGroupLabel;
  /**
   * The sidebar section the module sits in (a label when expanded, a divider on the rail).
   * Overview has none: the Dashboard stands above the sections.
   */
  section?: NavSection;
}

export type NavSection = 'Admin' | 'Operations' | 'Setup';

export interface SubRoute {
  label: string;
  /** The page it sits under; also where its record crumb links. */
  parent: string;
  /** Path with `[id]` standing for one record's id. */
  pattern: string;
  permissions?: string[];
}

export const navigationGroups: NavGroup[] = [
  {
    icon: LayoutGrid,
    items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' }],
    label: 'Overview',
  },
  {
    icon: Building2,
    items: [
      {
        href: '/masters/locations',
        icon: MapPin,
        label: 'Locations',
        permissions: ['HOSPITAL_VIEW'],
      },
      {
        activeAs: '/masters/locations',
        hidden: true,
        href: '/masters/hospitals',
        icon: Building2,
        label: 'Hospitals',
        permissions: ['HOSPITAL_VIEW'],
        record: 'q',
      },
      { href: '/masters/stores', icon: Store, label: 'Stores', permissions: ['STORE_VIEW'] },
      {
        href: '/masters/kitchens',
        icon: ChefHat,
        label: 'Kitchens',
        permissions: ['KITCHEN_VIEW'],
      },
      {
        href: '/masters/restaurants',
        icon: Utensils,
        label: 'Restaurants',
        permissions: ['RESTAURANT_VIEW'],
        record: 'q',
      },
      {
        href: '/masters/employees',
        icon: UsersRound,
        label: 'Employees',
        permissions: ['EMPLOYEE_VIEW'],
      },
      {
        href: '/masters/pos',
        icon: CreditCard,
        label: 'POS & Payment Machines',
        permissions: ['POS_DEVICE_VIEW', 'PAYMENT_MACHINE_VIEW'],
      },
    ],
    label: 'Organization',
    section: 'Setup',
  },
  {
    icon: NotebookText,
    items: [
      {
        href: '/masters/item-categories',
        icon: Tags,
        label: 'Item Categories',
        permissions: ['ITEM_CATEGORY_VIEW'],
      },
      {
        href: '/masters/items',
        icon: PackageOpen,
        label: 'Items',
        permissions: ['ITEM_VIEW'],
        record: 'id',
      },
      {
        href: '/masters/item-prices',
        icon: IndianRupee,
        label: 'Item Prices',
        permissions: ['ITEM_PRICE_VIEW'],
        record: 'q',
      },
      {
        href: '/masters/time-slots',
        icon: CalendarClock,
        label: 'Time Slots',
        permissions: ['TIME_SLOT_VIEW'],
      },
      {
        href: '/masters/restaurant-menus',
        icon: Utensils,
        label: 'Restaurant Menus',
        permissions: ['RESTAURANT_MENU_VIEW'],
      },
    ],
    label: 'Item & Menu Setup',
    section: 'Setup',
  },
  {
    icon: Link2,
    items: [
      {
        href: '/masters/store-items',
        icon: Store,
        label: 'Store Items',
        permissions: ['STORE_ITEM_VIEW'],
      },
      {
        href: '/masters/kitchen-items',
        icon: ChefHat,
        label: 'Kitchen Items',
        permissions: ['KITCHEN_ITEM_VIEW'],
      },
    ],
    label: 'Item Mapping',
    section: 'Setup',
  },
  {
    icon: Package,
    items: [
      {
        badge: 'grns',
        href: '/inventory/grns',
        icon: ClipboardList,
        label: 'GRNs',
        permissions: ['GRN_VIEW'],
        record: 'id',
      },
      {
        href: '/inventory/store-stock',
        icon: Boxes,
        label: 'Store Stock',
        permissions: ['STOCK_VIEW'],
      },
      {
        href: '/inventory/stock-ledgers',
        icon: ListChecks,
        label: 'Stock Ledgers',
        permissions: ['STOCK_VIEW'],
      },
      {
        badge: 'transfers',
        href: '/inventory/transfers',
        icon: ArrowRightLeft,
        label: 'Transfers',
        permissions: ['TRANSFER_VIEW', 'KITCHEN_TRANSFER_VIEW'],
        record: 'id',
      },
      {
        href: '/inventory/restaurant-stock',
        icon: Utensils,
        label: 'Restaurant Stock',
        permissions: ['RESTAURANT_STOCK_VIEW'],
      },
    ],
    label: 'Inventory',
    section: 'Operations',
  },
  {
    icon: ChefHat,
    items: [
      {
        badge: 'productions',
        href: '/kitchen/productions',
        icon: CookingPot,
        label: 'Kitchen Production',
        permissions: ['KITCHEN_PRODUCTION_VIEW'],
        record: 'id',
      },
      {
        href: '/kitchen/stock',
        icon: ChefHat,
        label: 'Kitchen Stock',
        permissions: ['KITCHEN_STOCK_VIEW'],
      },
    ],
    label: 'Kitchen Operations',
    section: 'Operations',
  },
  {
    icon: ShieldCheck,
    items: [
      { href: '/users', icon: UsersRound, label: 'Users / Roles', permissions: ['USER_VIEW'] },
      {
        activeAs: '/users',
        hidden: true,
        href: '/roles',
        icon: KeyRound,
        label: 'Roles',
        permissions: ['ROLE_VIEW'],
      },
      {
        activeAs: '/users',
        hidden: true,
        href: '/permissions',
        icon: ShieldCheck,
        label: 'Permissions',
        permissions: ['PERMISSION_VIEW'],
      },
      {
        hidden: true,
        href: '/reports/audit',
        icon: ScrollText,
        label: 'Audit Logs',
        permissions: ['AUDIT_LOG_VIEW'],
      },
    ],
    label: 'Access',
    section: 'Admin',
  },
];

export const subRoutes: SubRoute[] = [
  {
    label: 'New transfer',
    parent: '/inventory/transfers',
    pattern: '/inventory/transfers/new',
    permissions: ['TRANSFER_CREATE', 'KITCHEN_TRANSFER_CREATE'],
  },
  {
    label: 'Acknowledge',
    parent: '/inventory/transfers',
    pattern: '/inventory/transfers/[id]/acknowledge',
    // The page reads the transfer like the list does; acknowledging needs TRANSFER_ACKNOWLEDGE.
    permissions: ['TRANSFER_VIEW', 'KITCHEN_TRANSFER_VIEW'],
  },
  {
    label: 'New GRN',
    parent: '/inventory/grns',
    pattern: '/inventory/grns/new',
    permissions: ['GRN_CREATE'],
  },
  {
    label: 'New production',
    parent: '/kitchen/productions',
    pattern: '/kitchen/productions/new',
    permissions: ['KITCHEN_PRODUCTION_CREATE'],
  },
  {
    label: 'New location',
    parent: '/masters/locations',
    pattern: '/masters/locations/new',
    permissions: ['HOSPITAL_CREATE'],
  },
  {
    label: 'New hospital',
    parent: '/masters/hospitals',
    pattern: '/masters/hospitals/new',
    permissions: ['HOSPITAL_CREATE'],
  },
  {
    label: 'Locations',
    parent: '/masters/hospitals',
    pattern: '/masters/hospitals/[id]/locations',
    permissions: ['HOSPITAL_VIEW'],
  },
  {
    label: 'New store',
    parent: '/masters/stores',
    pattern: '/masters/stores/new',
    permissions: ['STORE_CREATE'],
  },
  {
    label: 'New kitchen',
    parent: '/masters/kitchens',
    pattern: '/masters/kitchens/new',
    permissions: ['KITCHEN_CREATE'],
  },
  {
    label: 'New restaurant',
    parent: '/masters/restaurants',
    pattern: '/masters/restaurants/new',
    permissions: ['RESTAURANT_CREATE'],
  },
  {
    label: 'Edit',
    parent: '/masters/restaurants',
    pattern: '/masters/restaurants/[id]/edit',
    permissions: ['RESTAURANT_UPDATE'],
  },
  {
    label: 'New employee',
    parent: '/masters/employees',
    pattern: '/masters/employees/new',
    permissions: ['EMPLOYEE_CREATE'],
  },
  {
    label: 'New category',
    parent: '/masters/item-categories',
    pattern: '/masters/item-categories/new',
    permissions: ['ITEM_CATEGORY_CREATE'],
  },
  {
    label: 'New item',
    parent: '/masters/items',
    pattern: '/masters/items/new',
    permissions: ['ITEM_CREATE'],
  },
  {
    label: 'New price',
    parent: '/masters/item-prices',
    pattern: '/masters/item-prices/new',
    permissions: ['ITEM_PRICE_CREATE'],
  },
  {
    label: 'Edit',
    parent: '/masters/item-prices',
    pattern: '/masters/item-prices/[id]/edit',
    permissions: ['ITEM_PRICE_UPDATE'],
  },
];

export interface Crumb {
  current?: boolean;
  /** A group crumb opens a menu of the group's pages instead of linking anywhere. */
  group?: NavGroupLabel;
  /** Set when the crumb is a link. */
  href?: string;
  label: string;
  /** The record's name is still loading; show a placeholder, never its id. */
  loading?: boolean;
}

type HasPermission = (permission: string | string[]) => boolean;
type SearchParamsLike = { get(name: string): string | null };

const allPages = navigationGroups.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.label })),
);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noParams: SearchParamsLike = { get: () => null };

function canOpen(permissions: string[] | undefined, hasPermission: HasPermission): boolean {
  return !permissions || permissions.length === 0 || hasPermission(permissions);
}

export function findPage(href: string) {
  return allPages.find((page) => page.href === href);
}

export function findSubRoute(pattern: string): SubRoute | undefined {
  return subRoutes.find((route) => route.pattern === pattern);
}

/** Sidebar pages the user may open, in sidebar order, with their group. */
export function getPermittedPages(hasPermission: HasPermission) {
  return allPages.filter((page) => !page.hidden && canOpen(page.permissions, hasPermission));
}

/**
 * Pages a user may choose as their start page: the sidebar's own entries, filtered by the same
 * permissions the sidebar uses, so a start page is always one the user can actually open.
 */
export function getStartPageOptions(
  hasPermission: HasPermission,
): Array<{ group: string; href: string; label: string }> {
  return getPermittedPages(hasPermission).map((page) => ({
    group: page.group,
    href: page.href,
    label: page.label,
  }));
}

/** Whether the user may open this in-app path (an unknown path is not blocked). */
export function canOpenPath(href: string, hasPermission: HasPermission): boolean {
  const path = href.split('?')[0]?.replace(/\/+$/, '') || '/';
  const page = findPage(path);

  if (page) {
    return canOpen(page.permissions, hasPermission);
  }

  const route = subRoutes.find((candidate) => matchPattern(candidate.pattern, path));

  return route ? canOpen(route.permissions, hasPermission) : true;
}

/**
 * Where a record lives: `?id=` on a page with a detail view, else the list searched for its
 * name (`?q=`, every list reads it). Without either, the list itself.
 */
export function recordHref(pageHref: string, record: { id?: string; name?: string }): string {
  if (findPage(pageHref)?.record === 'id' && record.id) {
    return `${pageHref}?id=${encodeURIComponent(record.id)}`;
  }

  return record.name ? `${pageHref}?q=${encodeURIComponent(record.name)}` : pageHref;
}

const locationPages: Record<string, string> = {
  KITCHEN: '/masters/kitchens',
  RESTAURANT: '/masters/restaurants',
  STORE: '/masters/stores',
};

/** A store, kitchen or restaurant's list searched for it, by code (unique) or name; null for counters. */
export function locationHref(type: string, search: string | null | undefined): string | null {
  const page = locationPages[type];

  return page ? recordHref(page, { name: search ?? undefined }) : null;
}

/**
 * A notification's in-app link (the API stores list routes such as `/inventory/grns`),
 * pointed at its record when that page has a detail view. Off-site links are dropped.
 */
export function notificationHref(link: string | null, entityId: string | null): string | null {
  if (!link?.startsWith('/') || link.startsWith('//')) {
    return null;
  }

  return entityId && !link.includes('?') ? recordHref(link, { id: entityId }) : link;
}

function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The sidebar entry to highlight for a path: the deepest page it sits under. */
export function getActiveNavHref(pathname: string): string | null {
  let best: (typeof allPages)[number] | undefined;

  for (const page of allPages) {
    if (isUnder(pathname, page.href) && (!best || page.href.length > best.href.length)) {
      best = page;
    }
  }

  return best ? (best.activeAs ?? best.href) : null;
}

function matchPattern(pattern: string, pathname: string): { id?: string } | null {
  const want = pattern.split('/');
  const have = pathname.split('/');

  if (want.length !== have.length) {
    return null;
  }

  let id: string | undefined;

  for (let index = 0; index < want.length; index += 1) {
    const part = want[index];
    const value = have[index] ?? '';

    if (part === '[id]') {
      if (!value) {
        return null;
      }

      id = value;
    } else if (part !== value) {
      return null;
    }
  }

  return { id };
}

function pageCrumb(page: (typeof allPages)[number], hasPermission: HasPermission): Crumb {
  return canOpen(page.permissions, hasPermission)
    ? { href: page.href, label: page.label }
    : { label: page.label };
}

function recordCrumb(
  id: string,
  page: (typeof allPages)[number],
  labels: Record<string, string | undefined>,
  hasPermission: HasPermission,
  current: boolean,
): Crumb {
  const label = labels[id];

  if (current) {
    return label ? { current: true, label } : { current: true, label: '', loading: true };
  }

  if (!label) {
    return { label: '', loading: true };
  }

  if (!canOpen(page.permissions, hasPermission)) {
    return { label };
  }

  return {
    href:
      page.record === 'q'
        ? `${page.href}?q=${encodeURIComponent(label)}`
        : `${page.href}?id=${encodeURIComponent(id)}`,
    label,
  };
}

function humanize(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function knownTrail(
  pathname: string,
  params: SearchParamsLike,
  hasPermission: HasPermission,
  labels: Record<string, string | undefined>,
): Crumb[] | null {
  const page = findPage(pathname);

  if (page) {
    const group: Crumb = { group: page.group, label: page.group };
    const id = page.record === 'id' ? params.get('id') : null;

    return id
      ? [group, pageCrumb(page, hasPermission), recordCrumb(id, page, labels, hasPermission, true)]
      : [group, { current: true, label: page.label }];
  }

  for (const route of subRoutes) {
    const match = matchPattern(route.pattern, pathname);
    const parent = match ? findPage(route.parent) : undefined;

    if (match && parent) {
      return [
        { group: parent.group, label: parent.group },
        pageCrumb(parent, hasPermission),
        ...(match.id ? [recordCrumb(match.id, parent, labels, hasPermission, false)] : []),
        { current: true, label: route.label },
      ];
    }
  }

  return null;
}

/**
 * Breadcrumbs for a path: [group] › [page] › [record or sub-page]. The group opens a menu,
 * pages the user may open are links, the last crumb is the current page, and records show
 * the label their page supplied (or a loading placeholder), never their id. An unknown path
 * falls back to its nearest known parent.
 */
export function getBreadcrumbTrail(
  pathname: string,
  searchParams: SearchParamsLike | null,
  hasPermission: HasPermission,
  labels: Record<string, string | undefined> = {},
): Crumb[] {
  const path = pathname.replace(/\/+$/, '') || '/';
  const params = searchParams ?? noParams;
  const trail = knownTrail(path, params, hasPermission, labels);

  if (trail) {
    return trail;
  }

  const segments = path.split('/').filter(Boolean);
  const dashboard = findPage('/dashboard');

  if (segments.length === 0) {
    return [
      { group: 'Overview', label: 'Overview' },
      { current: true, label: dashboard?.label ?? 'Dashboard' },
    ];
  }

  const last = segments.at(-1);
  const current: Crumb = {
    current: true,
    label: last && !uuidPattern.test(last) ? humanize(last) : 'Details',
  };

  for (let length = segments.length - 1; length > 0; length -= 1) {
    const parentPath = `/${segments.slice(0, length).join('/')}`;
    const parentTrail = knownTrail(parentPath, noParams, hasPermission, labels);

    if (parentTrail) {
      const parentCrumb = parentTrail.at(-1);
      const linked =
        parentCrumb && canOpenPath(parentPath, hasPermission)
          ? { href: parentPath, label: parentCrumb.label }
          : { label: parentCrumb?.label ?? '' };

      return [...parentTrail.slice(0, -1), linked, current];
    }
  }

  return [
    { group: 'Overview', label: 'Overview' },
    dashboard ? pageCrumb(dashboard, hasPermission) : { href: '/dashboard', label: 'Dashboard' },
    current,
  ];
}
