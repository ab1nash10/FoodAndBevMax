'use client';

import { Button } from '@aahar/ui';
import { AlertTriangle, ChevronDown, LogOut, Menu, Search, Settings, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, ViewTransition, type ReactNode } from 'react';
import { MobileTabBar } from '@/components/admin-shell/mobile-tab-bar';
import { AccountMenu, SidebarActions } from '@/components/admin-shell/sidebar-actions';
import { CommandPalette, type PalettePage } from '@/components/command-palette';
import { BrandMark, EmptyState } from '@/components/design-system';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuth } from '@/components/auth-provider';
import { useLocationContext } from '@/components/location-context';
import { PreferencesDialog } from '@/components/preferences/preferences-dialog';
import { useApplyThemePreference } from '@/components/preferences/use-preferences';
import { Skeleton } from '@/components/ui';
import { openCommandPalette } from '@/lib/command-palette-events';
import { canOpenPath, getPermittedPages } from '@/lib/navigation';
import { HeaderLocationSelector } from '@/components/admin-shell/header-location-selector';
import { SidebarContent, useNavCounts } from '@/components/admin-shell/sidebar-content';
import { ModulePills, ModuleTabs } from '@/components/admin-shell/top-nav';

function LoadingShell({ onRetry }: Readonly<{ onRetry?: () => void }>) {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        {onRetry ? (
          <EmptyState
            action={
              <Button onClick={onRetry} size="sm" type="button" variant="outline">
                Try again
              </Button>
            }
            description="AAHAR services are not answering yet. They may be starting; try again in a moment."
            icon={AlertTriangle}
            title="Could not load your locations"
          />
        ) : (
          <>
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-72 w-full" />
          </>
        )}
      </div>
    </div>
  );
}

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const { currentUser, hasPermission, isAuthenticated, isReady, logout, roles } = useAuth();
  const { isLoadingLocations, locationsFailed, retryLocations } = useLocationContext();
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

  // Pages mount once the user's location has settled, so their first requests already ask
  // for it rather than for every location.
  if (!isReady || !isAuthenticated || !isPermitted || isLoadingLocations) {
    return <LoadingShell onRetry={locationsFailed ? retryLocations : undefined} />;
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
  const openPalette = openCommandPalette;
  const account = (compact = false) => (
    <AccountMenu
      compact={compact}
      displayName={displayName}
      initials={initials}
      onLogout={() => {
        void logout().then(() => router.replace('/auth/login'));
      }}
      onPreferences={() => setIsPreferencesOpen(true)}
      roleLabel={roleLabel}
    />
  );
  // Where you are and what you can start: the location, search and "+ New", above the modules.
  const sidebarTop = (
    <div className="flex flex-col gap-2 px-3 pb-3">
      <HeaderLocationSelector wide />
      <SidebarActions onOpenPalette={openPalette} />
    </div>
  );

  return (
    <div className="min-h-screen bg-ds-page text-ds-text">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-70 focus:rounded-control focus:bg-ds-surface focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:text-ds-link focus:shadow-xl focus:outline-hidden focus:ring-2 focus:ring-ds-primary"
        href="#main-content"
      >
        Skip to content
      </a>
      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-40 nav:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-ds-overlay backdrop-blur-xs"
            onClick={() => setIsMobileMenuOpen(false)}
            type="button"
          />
          <aside className="nav-scope relative flex h-full w-[min(17rem,86vw)] flex-col bg-ds-surface text-ds-text shadow-xl">
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
            {sidebarTop}
            <SidebarContent
              counts={navCounts}
              footer={account()}
              hasPermission={hasPermission}
              onNavigate={() => setIsMobileMenuOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div>
        {/* Desktop: the logo and location, the module pills and search, theme and account, with
            the module's pages as tabs underneath. Phones: the menu button and the same tools.
            Its height is --app-header-h (globals.css), for panels that stick below it. */}
        <header className="sticky top-0 z-30 border-b border-ds-border bg-ds-surface/90 backdrop-blur-xl">
          <div className="mx-auto flex min-h-16 max-w-[1440px] items-center gap-3 px-4 py-3 nav:h-16 nav:gap-4 nav:px-8 nav:py-0">
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
            <Link
              aria-label="AAHAR dashboard"
              className="hidden shrink-0 rounded-control-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary nav:block"
              href="/dashboard"
            >
              <BrandMark className="2xl:hidden" collapsed />
              <BrandMark className="hidden 2xl:flex" />
            </Link>
            <div className="hidden shrink-0 nav:block">
              <HeaderLocationSelector />
            </div>
            <ModulePills
              className="hidden min-w-0 flex-1 justify-center overflow-x-auto [scrollbar-width:none] nav:flex"
              counts={navCounts}
              hasPermission={hasPermission}
            />
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 nav:ml-0">
              <Button
                aria-keyshortcuts="Control+K"
                aria-label="Search"
                onClick={openPalette}
                size="icon"
                title="Search (Ctrl K)"
                type="button"
                variant="outline"
              >
                <Search className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </Button>
              <div className="nav:hidden">
                <HeaderLocationSelector />
              </div>
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
                  <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ds-muted" />
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
          <div className="hidden border-t border-ds-divider nav:block">
            <ModuleTabs
              className="mx-auto h-11 max-w-[1440px] px-6"
              counts={navCounts}
              hasPermission={hasPermission}
            />
          </div>
        </header>
        <main
          // pb-24 below nav: room for the phone tab bar, so it never hides the last row.
          className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-5 focus:outline-hidden nav:px-8 nav:pb-12 nav:pt-8"
          id="main-content"
          tabIndex={-1}
        >
          {/* A new screen fades in and rises a little while the old one fades out; the header
                stays still (globals.css, "Screen changes"). Keyed by path, so
                filters and tabs within a screen don't animate. */}
          <ViewTransition
            default="none"
            enter="screen-enter"
            exit="screen-exit"
            // A list and its /new or /:id/edit panel are one screen: only the panel moves.
            key={pathname.replace(/\/(new|[^/]+\/edit)$/, '')}
          >
            <div>{children}</div>
          </ViewTransition>
        </main>
      </div>
      <MobileTabBar
        onMore={() => setIsMobileMenuOpen(true)}
        pages={palettePages}
        pathname={pathname}
      />
      <CommandPalette pages={palettePages} />
      {isPreferencesOpen ? <PreferencesDialog onClose={() => setIsPreferencesOpen(false)} /> : null}
    </div>
  );
}
