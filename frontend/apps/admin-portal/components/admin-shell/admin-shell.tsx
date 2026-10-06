'use client';

import { Button } from '@aahar/ui';
import { ChevronDown, LogOut, Menu, PanelLeftClose, Plus, Search, Settings, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BreadcrumbLabelsProvider, Breadcrumbs } from '@/components/breadcrumbs';
import { CommandPalette, type PalettePage } from '@/components/command-palette';
import { BrandMark, KeyboardHint } from '@/components/design-system';
import { NotificationBell } from '@/components/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuth } from '@/components/auth-provider';
import { PreferencesDialog } from '@/components/preferences/preferences-dialog';
import { SidebarRail } from '@/components/sidebar-rail';
import { useApplyThemePreference } from '@/components/preferences/use-preferences';
import { Skeleton } from '@/components/ui';
import { openCommandPalette } from '@/lib/command-palette-events';
import { canOpenPath, getPermittedPages } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { HeaderLocationSelector } from '@/components/admin-shell/header-location-selector';
import { SidebarContent, useNavCounts } from '@/components/admin-shell/sidebar-content';

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

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const { currentUser, hasPermission, isAuthenticated, isReady, logout, roles } = useAuth();
  useApplyThemePreference();
  const pathname = usePathname();
  const router = useRouter();
  const navCounts = useNavCounts(hasPermission);
  const palettePages = useMemo(
    () =>
      getPermittedPages(hasPermission).map((page): PalettePage => ({
        count: page.badge ? navCounts[page.badge] : undefined,
        group: page.group,
        href: page.href,
        label: page.label,
      })),
    [hasPermission, navCounts],
  );
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
    const toggleOnBracket = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName ?? '');

      if (
        event.key !== '[' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.defaultPrevented ||
        typing ||
        document.querySelector('[aria-modal="true"]')
      ) {
        return;
      }

      event.preventDefault();
      setIsCollapsed((collapsed) => !collapsed);
    };

    document.addEventListener('keydown', toggleOnBracket);

    return () => document.removeEventListener('keydown', toggleOnBracket);
  }, []);

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace('/auth/login');
    }
  }, [isAuthenticated, isReady, router]);

  // A page the user's permissions do not cover (typed, bookmarked or linked from elsewhere)
  // goes to /forbidden before it mounts, so it never shows its chrome or fires refused requests.
  const isPermitted = canOpenPath(pathname, hasPermission);

  useEffect(() => {
    if (isReady && isAuthenticated && !isPermitted) {
      router.replace('/forbidden');
    }
  }, [isAuthenticated, isPermitted, isReady, router]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', closeOnEscape);

    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isMobileMenuOpen]);

  if (!isReady || !isAuthenticated || !isPermitted) {
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
  const canCreateTransfer = hasPermission(['TRANSFER_CREATE', 'KITCHEN_TRANSFER_CREATE']);
  const openPalette = openCommandPalette;

  return (
    <BreadcrumbLabelsProvider>
      <div className="min-h-screen bg-ds-page text-ds-text">
        <a
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-70 focus:rounded-control focus:bg-ds-surface focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:text-ds-link focus:shadow-xl focus:outline-hidden focus:ring-2 focus:ring-ds-primary"
          href="#main-content"
        >
          Skip to content
        </a>
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-ds-border bg-ds-surface nav:flex',
            isCollapsed ? 'w-rail' : 'w-sidebar',
          )}
        >
          {isCollapsed ? (
            <SidebarRail
              counts={navCounts}
              hasPermission={hasPermission}
              onExpand={() => setIsCollapsed(false)}
              onOpenPalette={openPalette}
            />
          ) : (
            <>
              <div className="flex items-center gap-2.5 pb-3.5 pl-4 pr-3.5 pt-4">
                <Link
                  aria-label="AAHAR dashboard"
                  className="min-w-0 flex-1 rounded-control-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                  href="/dashboard"
                >
                  <BrandMark className="min-w-0" />
                </Link>
                <button
                  aria-expanded
                  aria-keyshortcuts="["
                  aria-label="Collapse sidebar"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-control border border-ds-border text-ds-text-3 transition hover:bg-ds-subtle hover:text-ds-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                  onClick={() => setIsCollapsed(true)}
                  title="Collapse sidebar ( [ )"
                  type="button"
                >
                  <PanelLeftClose aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
              <SidebarContent
                counts={navCounts}
                hasPermission={hasPermission}
                onOpenPalette={openPalette}
                sections
              />
            </>
          )}
        </aside>

        {isMobileMenuOpen ? (
          <div className="fixed inset-0 z-40 nav:hidden">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-ds-overlay backdrop-blur-xs"
              onClick={() => setIsMobileMenuOpen(false)}
              type="button"
            />
            <aside className="relative flex h-full w-[min(17rem,86vw)] flex-col border-r border-ds-border bg-ds-surface shadow-xl">
              <div className="flex items-center justify-between gap-3 pb-3.5 pl-4 pr-3.5 pt-4">
                <BrandMark className="min-w-0" />
                <Button
                  aria-label="Close navigation"
                  className="h-8 w-8 shrink-0 text-ds-text-3"
                  onClick={() => setIsMobileMenuOpen(false)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <SidebarContent
                counts={navCounts}
                hasPermission={hasPermission}
                onNavigate={() => setIsMobileMenuOpen(false)}
                onOpenPalette={() => {
                  setIsMobileMenuOpen(false);
                  openPalette();
                }}
              />
            </aside>
          </div>
        ) : null}

        <div
          className={cn(
            'transition-[padding] duration-200',
            isCollapsed ? 'nav:pl-rail' : 'nav:pl-sidebar',
          )}
        >
          <header className="sticky top-0 z-30 border-b border-ds-border bg-ds-surface/95 backdrop-blur-xl">
            <div className="flex min-h-16 items-center gap-3 px-4 py-3 nav:gap-4 nav:px-6">
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
              {/* useSearchParams (record crumbs) needs a Suspense boundary under the layout. */}
              <Suspense fallback={<span className="min-w-0 flex-1" />}>
                <Breadcrumbs />
              </Suspense>
              <button
                className="mx-auto hidden h-10 max-w-[460px] min-w-28 flex-1 basis-0 items-center gap-2.5 rounded-control border border-ds-border bg-ds-subtle pl-3 pr-2 text-left text-[13px] text-ds-muted transition hover:border-ds-primary/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary md:flex"
                onClick={openPalette}
                type="button"
              >
                <Search aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                <span className="min-w-0 flex-1 truncate">Search transfers, items, GRNs…</span>
                <KeyboardHint keys={['Ctrl', 'K']} />
              </button>
              <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 md:ml-0">
                <Button
                  aria-label="Search"
                  className="md:hidden"
                  onClick={openPalette}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <Search className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </Button>
                <HeaderLocationSelector />
                {canCreateTransfer ? (
                  <Button asChild className="hidden w-10 px-0 sm:inline-flex xl:w-auto xl:px-3.5">
                    <Link href="/inventory/transfers/new">
                      <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                      <span className="sr-only xl:not-sr-only">New transfer</span>
                    </Link>
                  </Button>
                ) : null}
                <NotificationBell />
                {/* Phones reach the theme from Preferences. */}
                <div className="hidden sm:block">
                  <ThemeToggle />
                </div>
                <details className="relative" ref={profileMenuRef}>
                  <summary
                    aria-label={`Account menu: ${displayName}`}
                    className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-ds-border bg-ds-surface pl-1 pr-2.5 transition hover:border-ds-primary/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary [&::-webkit-details-marker]:hidden"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ds-primary-soft text-xs font-extrabold text-ds-link">
                      {initials || 'AU'}
                    </span>
                    <span className="hidden max-w-36 truncate text-[13px] font-bold text-ds-text xl:block">
                      {displayName}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 text-ds-muted"
                    />
                  </summary>
                  <div className="absolute right-0 mt-2 w-56 rounded-card border border-ds-border bg-ds-surface p-2 shadow-xl shadow-ds-text/10">
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-bold text-ds-text">{displayName}</p>
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
                      className="flex min-h-10 w-full items-center gap-2 rounded-control px-3 text-left text-sm text-ds-status-bad-fg hover:bg-ds-status-bad-bg"
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
          <main
            className="mx-auto w-full max-w-content px-4 py-5 focus:outline-hidden nav:px-6"
            id="main-content"
            tabIndex={-1}
          >
            {children}
          </main>
        </div>
        <CommandPalette pages={palettePages} />
        {isPreferencesOpen ? (
          <PreferencesDialog onClose={() => setIsPreferencesOpen(false)} />
        ) : null}
      </div>
    </BreadcrumbLabelsProvider>
  );
}
