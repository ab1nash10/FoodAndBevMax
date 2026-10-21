'use client';

import { ChevronsUpDown, LogOut, Search, Settings } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { KeyboardHint } from '@/components/design-system';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const focusRing =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary-border';

/** A <details> menu that also closes on a click outside it or on Esc. */
function useClosingDetails() {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (event: Event) => {
      const menu = ref.current;

      if (!menu?.open) return;
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !menu.contains(event.target as Node)
      ) {
        menu.open = false;
      }
    };

    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);

    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  return ref;
}

/** Search (the command palette). */
export function SidebarActions({ onOpenPalette }: Readonly<{ onOpenPalette: () => void }>) {
  return (
    <div className="flex">
      <button
        className={cn(
          'flex h-10 min-w-0 flex-1 items-center gap-2 rounded-control border border-ds-border bg-ds-subtle px-3 text-[13px] text-ds-muted transition hover:text-ds-text',
          focusRing,
        )}
        onClick={onOpenPalette}
        type="button"
      >
        <Search aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.8} />
        <span className="flex-1 truncate text-left">Search</span>
        <KeyboardHint keys={['Ctrl', 'K']} />
      </button>
    </div>
  );
}

/** Who is signed in, at the foot of the sidebar: preferences, theme and sign out. */
export function AccountMenu({
  compact = false,
  displayName,
  initials,
  onLogout,
  onPreferences,
  roleLabel,
}: Readonly<{
  /** The collapsed rail: the avatar alone, its menu opening beside it. */
  compact?: boolean;
  displayName: string;
  initials: string;
  onLogout: () => void;
  onPreferences: () => void;
  roleLabel: string;
}>) {
  const menuRef = useClosingDetails();
  const row =
    'flex min-h-10 w-full items-center gap-2.5 rounded-control px-2.5 text-left text-[13.5px] transition';

  return (
    <details className="relative" ref={menuRef}>
      <summary
        aria-label={`Account menu: ${displayName}`}
        className={cn(
          'flex cursor-pointer list-none items-center gap-2.5 rounded-control-lg p-2 transition hover:bg-ds-subtle [&::-webkit-details-marker]:hidden',
          focusRing,
        )}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ds-primary-soft text-xs font-semibold text-ds-link">
          {initials || 'AU'}
        </span>
        {compact ? null : (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold text-ds-text">{displayName}</span>
              <span className="truncate text-[12px] text-ds-muted">{roleLabel}</span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ds-muted" />
          </>
        )}
      </summary>
      <div
        className={cn(
          'absolute z-50 min-w-56 rounded-card border border-ds-border bg-ds-surface p-1.5 shadow-xl shadow-black/30',
          compact ? 'bottom-0 left-full ml-2' : 'bottom-full left-0 mb-2 w-full',
        )}
        role="menu"
      >
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
          <span className="text-[12px] text-ds-muted">Theme</span>
          <ThemeToggle />
        </div>
        <button
          className={cn(row, 'text-ds-text-2 hover:bg-ds-subtle hover:text-ds-text', focusRing)}
          onClick={() => {
            menuRef.current?.removeAttribute('open');
            onPreferences();
          }}
          role="menuitem"
          type="button"
        >
          <Settings aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
          Preferences
        </button>
        <button
          className={cn(row, 'text-red-200 hover:bg-ds-subtle hover:text-white', focusRing)}
          onClick={onLogout}
          role="menuitem"
          type="button"
        >
          <LogOut aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
          Log out
        </button>
      </div>
    </details>
  );
}
