'use client';

import { Button } from '@aahar/ui';
import { AlertTriangle, Menu, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MobileTabBar } from '@/components/admin-shell/mobile-tab-bar';
import { AccountMenu, SidebarActions } from '@/components/admin-shell/sidebar-actions';
import { CommandPalette, type PalettePage } from '@/components/command-palette';
import { BrandMark, EmptyState } from '@/components/design-system';
import { useAuth } from '@/components/auth-provider';
import { useLocationContext } from '@/components/location-context';
import { PreferencesDialog } from '@/components/preferences/preferences-dialog';
import { useApplyThemePreference } from '@/components/preferences/use-preferences';
import { Skeleton } from '@/components/ui';
import { openCommandPalette } from '@/lib/command-palette-events';
import { canOpenPath, getPermittedPages } from '@/lib/navigation';
import { useApplyDensity } from '@/lib/use-density';
import { usePhoneCardLabels } from '@/lib/use-phone-card-labels';
import { HeaderLocationSelector } from '@/components/admin-shell/header-location-selector';
import { SidebarContent, useNavCounts } from '@/components/admin-shell/sidebar-content';
import { ModulePills, ModuleTabs, pillLabel, useModules } from '@/components/admin-shell/top-nav';

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

/**
 * Keeps --app-header-h (globals.css) at the header's real height, for panels that stick below
 * it: the page tabs wrap to a second line on narrow windows rather than scroll out of sight.
 */
function trackHeaderHeight(header: HTMLElement | null) {
  if (!header) return;

  const observer = new ResizeObserver(() => {
    document.documentElement.style.setProperty('--app-header-h', `${header.offsetHeight}px`);
  });

  observer.observe(header);

  return () => observer.disconnect();
}

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const { currentUser, hasPermission, isAuthenticated, isReady, logout, roles } = useAuth();
  const { isLoadingLocations, locationsFailed, retryLocations } = useLocationContext();
  useApplyThemePreference();
  usePhoneCardLabels();
  useApplyDensity();
  const pathname = usePathname();
  const router = useRouter();
  const navCounts = useNavCounts(hasPermission);
  const { active: activeModule } = useModules(hasPermission);
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
  // Where a swipe on the phone menu began; a swipe left of 60px closes it.
  const swipeStartX = useRef<number | null>(null);

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
  const account = (below = false) => (
    <AccountMenu
      below={below}
      displayName={displayName}
      initials={initials}
      onLogout={() => {
        void logout().then(() => router.replace('/auth/login'));
      }}
      onPreferences={() => setIsPreferencesOpen(true)}
      roleLabel={roleLabel}
    />
  );

  return (
    <div className="relative isolate min-h-screen bg-ds-page text-ds-text">
      {/* v3: a soft blue wash across the top of every page, behind the header and title. */}
      <div aria-hidden="true" className="shell-wash" />
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-70 focus:rounded-control focus:bg-ds-surface focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:text-ds-link focus:shadow-xl focus:outline-hidden focus:ring-2 focus:ring-ds-primary"
        href="#main-content"
      >
        Skip to content
      </a>
      {/* Below xl the module pills don't fit: the menu button opens every module here. */}
      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-ds-overlay backdrop-blur-xs"
            onClick={() => setIsMobileMenuOpen(false)}
            type="button"
          />
          <aside
            className="nav-scope drawer-in relative flex h-full w-[min(17rem,86vw)] flex-col bg-ds-surface text-ds-text shadow-xl"
            onTouchEnd={(event) => {
              const startX = swipeStartX.current;
              swipeStartX.current = null;
              if (startX !== null && (event.changedTouches[0]?.clientX ?? startX) - startX < -60) {
                setIsMobileMenuOpen(false);
              }
            }}
            onTouchStart={(event) => {
              swipeStartX.current = event.touches[0]?.clientX ?? null;
            }}
          >
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
            <div className="flex flex-col gap-2 px-3 pb-3 nav:hidden">
              <SidebarActions onOpenPalette={openPalette} />
            </div>
            <SidebarContent
              counts={navCounts}
              footer={account()}
              hasPermission={hasPermission}
              onNavigate={() => setIsMobileMenuOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      {/* The logo, the module pills, then location, search and account; the module's pages as
          tabs underneath. Below xl a menu button stands in for the pills. */}
      <header
        className="sticky top-0 z-30 border-b border-ds-border/70 bg-ds-surface/80 backdrop-blur-xl"
        ref={trackHeaderHeight}
      >
        {/* The same width as <main>, so the logo, the modules, the tabs and the page title share
            one left edge. */}
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 nav:gap-4 nav:px-8 min-[1800px]:max-w-[1760px]">
          <Button
            aria-label="Open navigation"
            className="shrink-0 xl:hidden nav:w-auto nav:gap-2 nav:px-3.5"
            onClick={() => setIsMobileMenuOpen(true)}
            size="icon"
            type="button"
            variant="outline"
          >
            <Menu className="h-5 w-5" />
            {activeModule ? (
              <span className="hidden text-[13.5px] font-semibold text-ds-link nav:inline">
                {pillLabel(activeModule.group)}
              </span>
            ) : null}
          </Button>
          <Link
            aria-label="AAHAR dashboard"
            className="hidden shrink-0 rounded-control-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary nav:block"
            href="/dashboard"
          >
            <BrandMark className="2xl:hidden" collapsed />
            <BrandMark className="hidden 2xl:flex" />
          </Link>
          <div className="min-w-0 flex-1 nav:hidden">
            <HeaderLocationSelector inHeader wide />
          </div>
          <ModulePills
            className="hidden min-w-0 flex-1 xl:flex"
            counts={navCounts}
            hasPermission={hasPermission}
          />
          <div className="hidden flex-1 nav:block xl:hidden" />
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden nav:block">
              <HeaderLocationSelector />
            </div>
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
            {account(true)}
          </div>
        </div>
        <ModuleTabs
          className="mx-auto hidden max-w-[1440px] px-4 nav:block nav:px-8 min-[1800px]:max-w-[1760px]"
          counts={navCounts}
          hasPermission={hasPermission}
        />
      </header>
      <main
        // pb-24 below nav: room for the phone tab bar, so it never hides the last row.
        className="mx-auto w-full max-w-[1440px] min-[1800px]:max-w-[1760px] px-4 pb-24 pt-5 focus:outline-hidden nav:px-8 nav:pb-12 nav:pt-8"
        id="main-content"
        tabIndex={-1}
      >
        {/* No screen-change animation: a React ViewTransition waits for the whole new screen
            before it starts, which held each click for ~0.9 s on a revisited page (measured
            2026-10-22: 850–880 ms with it, 130–160 ms without). A screen shows the moment it
            is ready. */}
        {children}
      </main>
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
