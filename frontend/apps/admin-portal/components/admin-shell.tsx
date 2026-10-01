'use client';

import { Button } from '@aahar/ui';
import type { Hospital } from '@aahar/api-client';
import {
  ArrowRightLeft,
  Boxes,
  Building2,
  CalendarClock,
  ChefHat,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CookingPot,
  CreditCard,
  IndianRupee,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  ListChecks,
  LogOut,
  Menu,
  MapPin,
  NotebookText,
  Package,
  PackageOpen,
  PanelLeft,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Tags,
  Utensils,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BrandMark, MaxHealthcareMark } from '@/components/design-system';
import { NotificationBell } from '@/components/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuth } from '@/components/auth-provider';
import { formatGlobalLocationLabel, useLocationContext } from '@/components/location-context';
import { PreferencesDialog } from '@/components/preferences/preferences-dialog';
import { useApplyThemePreference } from '@/components/preferences/use-preferences';
import { Input, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

interface NavigationItem {
  href: string;
  icon: LucideIcon;
  label: string;
  permissions?: string[];
}

const navigationGroups: Array<{ items: NavigationItem[]; label: string }> = [
  {
    label: 'Overview',
    items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' }],
  },
  {
    label: 'Organization',
    items: [
      {
        href: '/masters/locations',
        icon: MapPin,
        label: 'Locations',
        permissions: ['HOSPITAL_VIEW'],
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
  },
  {
    label: 'Item & Menu Setup',
    items: [
      {
        href: '/masters/item-categories',
        icon: Tags,
        label: 'Item Categories',
        permissions: ['ITEM_CATEGORY_VIEW'],
      },
      { href: '/masters/items', icon: PackageOpen, label: 'Items', permissions: ['ITEM_VIEW'] },
      {
        href: '/masters/item-prices',
        icon: IndianRupee,
        label: 'Item Prices',
        permissions: ['ITEM_PRICE_VIEW'],
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
  },
  {
    label: 'Item Mapping',
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
  },
  {
    label: 'Inventory',
    items: [
      { href: '/inventory/grns', icon: ClipboardList, label: 'GRNs', permissions: ['GRN_VIEW'] },
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
        href: '/inventory/transfers',
        icon: ArrowRightLeft,
        label: 'Transfers',
        permissions: ['TRANSFER_VIEW', 'KITCHEN_TRANSFER_VIEW'],
      },
      {
        href: '/inventory/restaurant-stock',
        icon: Utensils,
        label: 'Restaurant Stock',
        permissions: ['RESTAURANT_STOCK_VIEW'],
      },
    ],
  },
  {
    label: 'Kitchen Operations',
    items: [
      {
        href: '/kitchen/productions',
        icon: CookingPot,
        label: 'Kitchen Production',
        permissions: ['KITCHEN_PRODUCTION_VIEW'],
      },
      {
        href: '/kitchen/stock',
        icon: ChefHat,
        label: 'Kitchen Stock',
        permissions: ['KITCHEN_STOCK_VIEW'],
      },
    ],
  },
  {
    label: 'Access',
    items: [
      { href: '/users', icon: UsersRound, label: 'Users / Roles', permissions: ['USER_VIEW'] },
    ],
  },
];

/**
 * Pages a user may choose as their start page: the sidebar's own entries, filtered by the same
 * permissions the sidebar uses, so a start page is always one the user can actually open.
 */
export function getStartPageOptions(
  hasPermission: (permission: string | string[]) => boolean,
): Array<{ group: string; href: string; label: string }> {
  return navigationGroups.flatMap((group) =>
    group.items
      .filter((item) => !item.permissions || hasPermission(item.permissions))
      .map((item) => ({ group: group.label, href: item.href, label: item.label })),
  );
}

const collapsedNavigationLabels: Record<(typeof navigationGroups)[number]['label'], string> = {
  Overview: 'OVR',
  Organization: 'ORG',
  'Item & Menu Setup': 'SET',
  'Item Mapping': 'MAP',
  Inventory: 'INV',
  'Kitchen Operations': 'KIT',
  Access: 'ACC',
};

// Module icons for the sidebar rows, as in the UI concepts.
const moduleIcons: Record<(typeof navigationGroups)[number]['label'], LucideIcon> = {
  Overview: LayoutGrid,
  Organization: Building2,
  'Item & Menu Setup': NotebookText,
  'Item Mapping': Link2,
  Inventory: Package,
  'Kitchen Operations': ChefHat,
  Access: ShieldCheck,
};

const breadcrumbLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  grns: 'GRNs',
  hospitals: 'Locations',
  inventory: 'Inventory',
  kitchen: 'Kitchen',
  locations: 'Locations',
  masters: 'Masters',
  new: 'New',
  pos: 'POS',
  stock: 'Stock',
};

function formatBreadcrumbSegment(segment: string): string {
  return (
    breadcrumbLabels[segment] ??
    segment
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

function getBreadcrumbs(pathname: string): string[] {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return ['Dashboard'];
  }

  return segments.map(formatBreadcrumbSegment);
}

function SidebarContent({
  collapsed,
  hasPermission,
  hideBrand = false,
  onNavigate,
}: Readonly<{
  collapsed?: boolean;
  hasPermission: (permission: string | string[]) => boolean;
  hideBrand?: boolean;
  onNavigate?: () => void;
}>) {
  const pathname = usePathname();
  const { availableLocations } = useLocationContext();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(() => {
    return (
      navigationGroups.find((group) =>
        group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)),
      )?.label ?? null
    );
  });

  useEffect(() => {
    const activeGroup = navigationGroups.find((group) =>
      group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)),
    );

    if (activeGroup) {
      setExpandedGroup(activeGroup.label);
    }
  }, [pathname]);

  return (
    <div className="flex min-h-full flex-col">
      {!hideBrand ? (
        <Link
          aria-label="AAHAR dashboard"
          className={cn('flex rounded-xl px-1 py-1', collapsed && 'justify-center')}
          href="/dashboard"
          onClick={onNavigate}
        >
          <BrandMark collapsed={collapsed} />
        </Link>
      ) : null}

      {!collapsed ? (
        <p
          className={cn(
            'px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-ds-muted',
            hideBrand ? 'mt-1' : 'mt-5',
          )}
        >
          Modules
        </p>
      ) : null}

      <nav
        aria-label="Modules"
        className={cn('flex flex-1 flex-col gap-1', collapsed ? 'mt-2 gap-3' : 'mt-2')}
      >
        {navigationGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.permissions || hasPermission(item.permissions),
          );

          if (visibleItems.length === 0) {
            return null;
          }

          const isItemActive = (item: NavigationItem) =>
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const isExpanded = expandedGroup === group.label;
          const isGroupActive = visibleItems.some(isItemActive);
          const groupId = `sidebar-group-${group.label.toLowerCase().replaceAll(' ', '-')}`;
          const ModuleIcon = moduleIcons[group.label] ?? LayoutGrid;
          const rowClass =
            'flex min-h-10 w-full items-center gap-3 rounded-control-lg px-3 text-left text-sm font-medium text-ds-text-2 transition hover:bg-ds-subtle hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary';

          if (collapsed) {
            // Collapsed rail: every page as an icon, grouped under the module's short label.
            return (
              <div className="flex flex-col items-center gap-1" key={group.label}>
                <div
                  aria-label={group.label}
                  className="mb-1 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-ds-muted"
                  title={group.label}
                >
                  {collapsedNavigationLabels[group.label]}
                </div>
                {visibleItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      aria-label={item.label}
                      className={cn(
                        'grid h-10 w-10 place-items-center rounded-control-lg text-ds-text-3 transition hover:bg-ds-subtle hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary',
                        isItemActive(item) &&
                          'bg-ds-primary text-white hover:bg-ds-primary hover:text-white',
                      )}
                      href={item.href}
                      key={item.href}
                      onClick={onNavigate}
                      title={item.label}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    </Link>
                  );
                })}
              </div>
            );
          }

          // Overview holds only the Dashboard, which the concepts show as a plain link.
          const singleItem = group.label === 'Overview' ? visibleItems[0] : undefined;

          if (singleItem) {
            return (
              <Link
                className={cn(
                  rowClass,
                  isItemActive(singleItem) &&
                    'bg-ds-primary font-semibold text-white shadow-sm shadow-ds-primary/20 hover:bg-ds-primary hover:text-white',
                )}
                href={singleItem.href}
                key={group.label}
                onClick={onNavigate}
              >
                <ModuleIcon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                <span className="truncate">{singleItem.label}</span>
              </Link>
            );
          }

          return (
            <div key={group.label}>
              <button
                aria-controls={groupId}
                aria-expanded={isExpanded}
                className={cn(
                  rowClass,
                  isGroupActive &&
                    'bg-ds-primary-soft font-semibold text-ds-link hover:bg-ds-primary-soft hover:text-ds-link',
                )}
                onClick={() =>
                  setExpandedGroup((current) => (current === group.label ? null : group.label))
                }
                type="button"
              >
                <ModuleIcon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    'h-4 w-4 shrink-0 text-ds-muted transition-transform duration-200',
                    isExpanded && 'rotate-90',
                  )}
                />
              </button>
              <div
                className={cn('mt-1 flex flex-col gap-0.5 pl-9', !isExpanded && 'hidden')}
                id={groupId}
              >
                {visibleItems.map((item) => (
                  <Link
                    aria-current={isItemActive(item) ? 'page' : undefined}
                    className={cn(
                      'flex min-h-9 items-center rounded-control px-3 text-sm font-medium text-ds-text-3 transition hover:bg-ds-subtle hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary',
                      isItemActive(item) &&
                        'bg-ds-primary font-semibold text-white hover:bg-ds-primary hover:text-white',
                    )}
                    href={item.href}
                    key={item.href}
                    onClick={onNavigate}
                  >
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {!collapsed ? (
        <div className="mt-6 flex items-center gap-3 rounded-tile border border-ds-teal-border bg-ds-teal-soft p-3">
          <MaxHealthcareMark />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ds-text">Max Healthcare</p>
            <p className="truncate text-xs text-ds-text-3">
              Client workspace
              {availableLocations.length
                ? ` · ${availableLocations.length} location${availableLocations.length === 1 ? '' : 's'}`
                : ''}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

function getLocationName(location: Hospital): string {
  return location.displayName || location.title || location.hospitalName || 'Location';
}

function getLocationMeta(location: Hospital): string {
  return [location.city, location.state].filter(Boolean).join(', ') || 'Location';
}

function HeaderLocationSelector() {
  const {
    availableLocations,
    canSelectAllLocations,
    isLoadingLocations,
    locationLabel,
    selectedLocationValue,
    setSelectedLocation,
  } = useLocationContext();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function selectLocation(locationId: string | null) {
    setSelectedLocation(locationId);
    setIsOpen(false);
  }

  const allLocationsSelected = selectedLocationValue === 'all';

  return (
    <div className="relative" ref={containerRef}>
      <Button
        aria-expanded={isOpen}
        aria-label={`Select Location. Current selection: ${locationLabel}`}
        className={cn(
          'w-11 px-0 text-ds-text-2 lg:w-auto lg:px-3.5',
          !allLocationsSelected && 'border-ds-teal-border bg-ds-teal-soft',
        )}
        disabled={isLoadingLocations}
        onClick={() => setIsOpen((current) => !current)}
        title={locationLabel}
        type="button"
        variant="outline"
      >
        <MapPin className="h-[18px] w-[18px] shrink-0 text-ds-teal-text" strokeWidth={1.8} />
        <span className="hidden max-w-40 truncate lg:inline">{locationLabel}</span>
        <ChevronDown
          aria-hidden="true"
          className="hidden h-4 w-4 shrink-0 text-ds-muted lg:block"
        />
      </Button>

      {isOpen ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-ds-border bg-ds-surface shadow-xl shadow-ds-text/10">
          <div className="border-b border-ds-divider px-4 py-3">
            <p className="text-sm font-bold text-ds-text">Select Location</p>
            <p className="mt-1 text-xs text-ds-muted">
              Choose a location to view location-specific data
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {canSelectAllLocations ? (
              <button
                className={cn(
                  'flex w-full items-center gap-3 rounded-control-lg px-3 py-3 text-left transition hover:bg-ds-subtle',
                  allLocationsSelected && 'bg-ds-teal-soft',
                )}
                onClick={() => selectLocation(null)}
                type="button"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-ds-primary-soft text-ds-link">
                  <MapPin className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ds-text">All Locations</span>
                  <span className="mt-0.5 block text-xs text-ds-muted">
                    View consolidated data across all locations
                  </span>
                </span>
                {allLocationsSelected ? (
                  <Check className="h-4 w-4 shrink-0 text-ds-teal-text" />
                ) : null}
              </button>
            ) : null}

            {availableLocations.map((location) => {
              const isSelected = selectedLocationValue === location.id;

              return (
                <button
                  className={cn(
                    'mt-1 flex w-full items-center gap-3 rounded-control-lg px-3 py-3 text-left transition hover:bg-ds-subtle',
                    isSelected && 'bg-ds-teal-soft',
                  )}
                  key={location.id}
                  onClick={() => selectLocation(location.id)}
                  title={formatGlobalLocationLabel(location)}
                  type="button"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-ds-tile-locations-bg text-ds-tile-locations-fg dark:bg-teal-950 dark:text-teal-300">
                    <MapPin className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ds-text">
                      {getLocationName(location)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ds-muted">
                      {getLocationMeta(location)}
                    </span>
                  </span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-ds-teal-text" /> : null}
                </button>
              );
            })}

            {!isLoadingLocations && availableLocations.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-ds-muted">
                No active locations available.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const { currentUser, hasPermission, isAuthenticated, isReady, logout, roles } = useAuth();
  useApplyThemePreference();
  const pathname = usePathname();
  const router = useRouter();
  const breadcrumbs = useMemo(() => getBreadcrumbs(pathname), [pathname]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDetailsElement>(null);

  // The profile menu is a <details>, which only closes from its own button; close it on any
  // click outside it too.
  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      const menu = profileMenuRef.current;

      if (menu?.open && !menu.contains(event.target as Node)) {
        menu.open = false;
      }
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);

    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, []);

  useEffect(() => {
    const storedPreference = window.localStorage.getItem('aahar-sidebar-collapsed');

    setIsCollapsed(storedPreference === 'true');
  }, []);

  useEffect(() => {
    window.localStorage.setItem('aahar-sidebar-collapsed', String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace('/auth/login');
    }
  }, [isAuthenticated, isReady, router]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  if (!isReady || !isAuthenticated) {
    return <LoadingShell />;
  }

  const displayName =
    currentUser?.name ?? currentUser?.email ?? currentUser?.mobile ?? 'AAHAR User';
  const initials = displayName
    .split(/[.@\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  const roleLabel = roles[0] ?? 'Active user';

  return (
    <div className="min-h-screen bg-ds-page text-ds-text">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 hidden overflow-y-auto border-r border-ds-border bg-ds-surface px-3 py-4 nav:block',
          isCollapsed ? 'w-24' : 'w-sidebar',
        )}
      >
        <div
          className={cn(
            'mb-4 flex items-center',
            isCollapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {isCollapsed ? (
            // Collapsed rail: the logo turns into the expand icon on hover or keyboard focus.
            <button
              aria-label="Expand sidebar"
              className="group relative grid h-11 w-11 place-items-center rounded-tile text-ds-text-3 transition hover:bg-ds-subtle hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary"
              onClick={() => setIsCollapsed(false)}
              title="Expand navigation"
              type="button"
            >
              <BrandMark
                className="transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0"
                collapsed
              />
              <PanelLeft className="absolute h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </button>
          ) : (
            <>
              <Link
                aria-label="AAHAR dashboard"
                className="min-w-0 flex-1 rounded-xl"
                href="/dashboard"
              >
                <BrandMark className="min-w-0" />
              </Link>
              <Button
                aria-label="Collapse sidebar"
                className="shrink-0 text-ds-text-3"
                onClick={() => setIsCollapsed(true)}
                size="icon"
                title="Collapse navigation"
                type="button"
                variant="outline"
              >
                <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </Button>
            </>
          )}
        </div>
        <SidebarContent collapsed={isCollapsed} hasPermission={hasPermission} hideBrand />
      </aside>

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-40 nav:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-ds-text/45 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
            type="button"
          />
          <aside className="relative h-full w-[min(18rem,86vw)] overflow-y-auto border-r border-ds-border bg-ds-surface px-4 py-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <BrandMark className="min-w-0" />
              <Button
                aria-label="Close navigation"
                className="shrink-0 text-ds-text-3"
                onClick={() => setIsMobileMenuOpen(false)}
                size="icon"
                type="button"
                variant="outline"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarContent
              hasPermission={hasPermission}
              hideBrand
              onNavigate={() => setIsMobileMenuOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div
        className={cn(
          'transition-[padding] duration-200',
          isCollapsed ? 'nav:pl-24' : 'nav:pl-sidebar',
        )}
      >
        <header className="sticky top-0 z-30 border-b border-ds-border bg-ds-surface/95 px-4 backdrop-blur-xl nav:px-8">
          <div className="flex min-h-16 items-center justify-between gap-3 lg:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                aria-label="Open navigation"
                className="shrink-0 nav:hidden"
                onClick={() => setIsMobileMenuOpen(true)}
                size="icon"
                type="button"
                variant="outline"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-ds-link">
                  {breadcrumbs.join(' / ')}
                </p>
                <p className="mt-0.5 truncate text-[15px] font-bold text-ds-text">Max Healthcare</p>
              </div>
            </div>

            <div className="hidden min-w-48 max-w-md flex-1 xl:block">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ds-muted"
                  strokeWidth={1.8}
                />
                <Input
                  aria-label="Search workspace"
                  className="border-ds-border bg-ds-subtle pl-11 focus:bg-ds-surface"
                  placeholder="Search locations, items, transfers..."
                  type="search"
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <HeaderLocationSelector />
              <NotificationBell />
              <ThemeToggle />
              <details className="relative" ref={profileMenuRef}>
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2.5 rounded-full border border-ds-border bg-ds-surface p-1 transition hover:border-ds-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary sm:pr-3.5 [&::-webkit-details-marker]:hidden">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ds-primary-soft text-xs font-bold text-ds-link">
                    {initials || 'AU'}
                  </span>
                  <span className="hidden min-w-0 text-left sm:block">
                    <span className="block max-w-40 truncate text-sm font-bold leading-4 text-ds-text">
                      {displayName}
                    </span>
                    <span className="block max-w-40 truncate text-xs text-ds-muted">
                      {roleLabel}
                    </span>
                  </span>
                </summary>
                <div className="absolute right-0 mt-2 w-56 rounded-card border border-ds-border bg-ds-surface p-2 shadow-xl shadow-ds-text/10">
                  <div className="px-3 py-2">
                    <p className="text-sm font-bold text-ds-text">{displayName}</p>
                    <p className="text-xs text-ds-muted">{roleLabel}</p>
                  </div>
                  <button
                    className="flex min-h-10 w-full items-center gap-2 rounded-control px-3 text-left text-sm text-ds-text-2 hover:bg-ds-subtle"
                    onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      setIsPreferencesOpen(true);
                    }}
                    type="button"
                  >
                    <Settings className="h-4 w-4" />
                    Preferences
                  </button>
                  <button
                    className="flex min-h-10 w-full items-center gap-2 rounded-control px-3 text-left text-sm text-ds-rejected-fg hover:bg-ds-rejected-bg dark:text-red-300 dark:hover:bg-red-950"
                    onClick={() => {
                      void logout().then(() => router.replace('/auth/login'));
                    }}
                    type="button"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              </details>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-content px-4 py-5 nav:px-6">{children}</main>
      </div>
      {isPreferencesOpen ? <PreferencesDialog onClose={() => setIsPreferencesOpen(false)} /> : null}
    </div>
  );
}
