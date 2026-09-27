'use client';

import { Button } from '@aahar/ui';
import type { Hospital } from '@aahar/api-client';
import {
  ArrowRightLeft,
  Boxes,
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
  ListChecks,
  LogOut,
  Menu,
  MapPin,
  PackageOpen,
  PanelLeft,
  Search,
  Settings,
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

const collapsedNavigationLabels: Record<(typeof navigationGroups)[number]['label'], string> = {
  Overview: 'OVR',
  Organization: 'ORG',
  'Item & Menu Setup': 'SET',
  'Item Mapping': 'MAP',
  Inventory: 'INV',
  'Kitchen Operations': 'KIT',
  Access: 'ACC',
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

      <nav className={cn('flex flex-1 flex-col gap-3', hideBrand ? 'mt-3' : 'mt-7')}>
        {navigationGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.permissions || hasPermission(item.permissions),
          );

          if (visibleItems.length === 0) {
            return null;
          }

          const isExpanded = expandedGroup === group.label;
          const groupId = `sidebar-group-${group.label.toLowerCase().replaceAll(' ', '-')}`;

          return (
            <div
              className="border-b border-slate-100 pb-3 last:border-b-0 dark:border-slate-800"
              key={group.label}
            >
              {!collapsed ? (
                <button
                  aria-controls={groupId}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center justify-between rounded-lg bg-slate-50/80 px-3 py-2 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 transition hover:bg-brand-mint hover:text-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/50 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-teal-950 dark:hover:text-teal-200"
                  onClick={() =>
                    setExpandedGroup((current) => (current === group.label ? null : group.label))
                  }
                  type="button"
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      'h-4 w-4 transition-transform duration-200',
                      !isExpanded && '-rotate-90',
                    )}
                  />
                </button>
              ) : (
                <div
                  aria-label={group.label}
                  className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500"
                  title={group.label}
                >
                  {collapsedNavigationLabels[group.label]}
                </div>
              )}
              <div
                className={cn(
                  'flex flex-col gap-1',
                  !collapsed && !isExpanded && 'hidden',
                  !collapsed && 'mt-1 border-l border-slate-200 pl-2 dark:border-slate-800',
                  collapsed && 'items-center',
                )}
                id={groupId}
              >
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      className={cn(
                        'group flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-600 transition hover:bg-brand-mint hover:text-brand-teal dark:text-slate-300 dark:hover:bg-teal-950 dark:hover:text-teal-200',
                        collapsed && 'justify-center px-2',
                        isActive &&
                          'bg-brand-blue text-white shadow-sm shadow-brand-blue/20 hover:bg-brand-blue hover:text-white dark:bg-sky-600 dark:text-white',
                      )}
                      href={item.href}
                      key={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {!collapsed ? (
        <div className="mt-6 rounded-lg border border-emerald-100 bg-brand-mint p-4 text-sm text-brand-navy dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100">
          <MaxHealthcareMark className="mb-3 w-full justify-center bg-white/85 dark:bg-slate-950/75" />
          <p className="font-semibold">AAHAR</p>
          <p className="mt-1 text-xs text-brand-teal dark:text-teal-300">
            Food & Cafeteria Management Platform
          </p>
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
          'relative border-slate-200 bg-white text-brand-teal hover:bg-brand-mint hover:text-brand-teal dark:border-slate-800 dark:bg-slate-950 dark:text-teal-300 dark:hover:bg-teal-950',
          !allLocationsSelected && 'border-teal-200 bg-brand-mint dark:border-teal-900',
        )}
        disabled={isLoadingLocations}
        onClick={() => setIsOpen((current) => !current)}
        size="icon"
        title={locationLabel}
        type="button"
        variant="outline"
      >
        <MapPin className="h-4 w-4" />
        {!allLocationsSelected ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-emerald" />
        ) : null}
      </Button>

      {isOpen ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/12 dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-950 dark:text-white">Select Location</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Choose a location to view location-specific data
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {canSelectAllLocations ? (
              <button
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900',
                  allLocationsSelected && 'bg-brand-mint text-brand-navy dark:bg-teal-950/70',
                )}
                onClick={() => selectLocation(null)}
                type="button"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-brand-blue shadow-sm dark:bg-slate-950 dark:text-sky-300">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-950 dark:text-white">
                    All Locations
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    View consolidated data across all locations
                  </span>
                </span>
                {allLocationsSelected ? (
                  <Check className="h-4 w-4 shrink-0 text-brand-teal" />
                ) : null}
              </button>
            ) : null}

            {availableLocations.map((location) => {
              const isSelected = selectedLocationValue === location.id;

              return (
                <button
                  className={cn(
                    'mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900',
                    isSelected && 'bg-brand-mint text-brand-navy dark:bg-teal-950/70',
                  )}
                  key={location.id}
                  onClick={() => selectLocation(location.id)}
                  title={formatGlobalLocationLabel(location)}
                  type="button"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-brand-teal dark:bg-teal-950 dark:text-teal-300">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-950 dark:text-white">
                      {getLocationName(location)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                      {getLocationMeta(location)}
                    </span>
                  </span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-brand-teal" /> : null}
                </button>
              );
            })}

            {!isLoadingLocations && availableLocations.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
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
  const pathname = usePathname();
  const router = useRouter();
  const breadcrumbs = useMemo(() => getBreadcrumbs(pathname), [pathname]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

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

  const displayName = currentUser?.email ?? currentUser?.mobile ?? 'AAHAR User';
  const initials = displayName
    .split(/[.@\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  const roleLabel = roles[0] ?? 'Active user';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 hidden overflow-y-auto border-r border-slate-200 bg-white/95 px-4 py-5 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:block',
          isCollapsed ? 'w-24' : 'w-72',
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
              className="group relative grid h-11 w-11 place-items-center rounded-lg text-slate-500 transition hover:bg-brand-mint hover:text-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/50 dark:hover:bg-teal-950 dark:hover:text-teal-200"
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
                className="shrink-0 text-slate-500 hover:bg-brand-mint hover:text-brand-teal"
                onClick={() => setIsCollapsed(true)}
                size="icon"
                title="Collapse navigation"
                type="button"
                variant="ghost"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        <SidebarContent collapsed={isCollapsed} hasPermission={hasPermission} hideBrand />
      </aside>

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
            type="button"
          />
          <aside className="relative h-full w-[min(22rem,86vw)] overflow-y-auto border-r border-slate-200 bg-white px-5 py-6 shadow-xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-6 flex items-center justify-between">
              <BrandMark />
              <Button
                aria-label="Close navigation"
                onClick={() => setIsMobileMenuOpen(false)}
                size="icon"
                type="button"
                variant="ghost"
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
        className={cn('transition-[padding] duration-200', isCollapsed ? 'lg:pl-24' : 'lg:pl-72')}
      >
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90 lg:px-6">
          <div className="flex min-h-12 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                aria-label="Open navigation"
                className="lg:hidden"
                onClick={() => setIsMobileMenuOpen(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {breadcrumbs.map((crumb, index) => (
                    <span className="inline-flex items-center gap-1" key={`${crumb}-${index}`}>
                      {index > 0 ? <ChevronRight className="h-3 w-3" /> : null}
                      <span
                        className={
                          index === breadcrumbs.length - 1
                            ? 'text-brand-blue dark:text-sky-300'
                            : ''
                        }
                      >
                        {crumb}
                      </span>
                    </span>
                  ))}
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-brand-navy dark:text-white">
                  Max Healthcare
                </p>
              </div>
            </div>

            <div className="hidden min-w-48 max-w-sm flex-1 lg:block">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  aria-label="Search workspace"
                  className="border-slate-200 bg-slate-50/80 pl-9 focus:bg-white dark:bg-slate-900/70"
                  placeholder="Search locations, items, transfers..."
                  type="search"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <HeaderLocationSelector />
              <NotificationBell />
              <ThemeToggle />
              <div className="hidden xl:block">
                <MaxHealthcareMark />
              </div>
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-sm shadow-slate-900/5 transition hover:border-brand-blue/30 hover:bg-brand-mint dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900 [&::-webkit-details-marker]:hidden">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-sm font-semibold text-brand-blue dark:bg-sky-950 dark:text-sky-300">
                    {initials || 'AU'}
                  </span>
                  <span className="hidden text-left sm:block">
                    <span className="block text-sm font-semibold leading-4 text-slate-900 dark:text-white">
                      {displayName}
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {roleLabel}
                    </span>
                  </span>
                </summary>
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-950">
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">
                      {displayName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{roleLabel}</p>
                  </div>
                  <Link
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                    href="/dashboard"
                  >
                    <Settings className="h-4 w-4" />
                    Preferences
                  </Link>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
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
        <main className="px-4 py-6 lg:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
