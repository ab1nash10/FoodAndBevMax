'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/components/auth-provider';

export type Density = 'comfortable' | 'compact';

// Per user on this device. Deliberately not aahar.*: sign-out clears those, and a layout choice
// should outlive a sign-in (it holds nothing private). The account's preferences have no field
// for it; adding one is a server change.
const storageKey = (userId: string) => `portal-density.${userId}`;
const changeEvent = 'aahar-density-change';

function read(userId: string): Density {
  try {
    return window.localStorage.getItem(storageKey(userId)) === 'compact'
      ? 'compact'
      : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(changeEvent, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The signed-in user's list density, and a setter that saves it. */
export function useDensity(): [Density, (density: Density) => void] {
  const userId = useAuth().currentUser?.id ?? '';
  const density = useSyncExternalStore<Density>(
    subscribe,
    () => (userId ? read(userId) : 'comfortable'),
    () => 'comfortable',
  );
  const setDensity = useCallback(
    (next: Density) => {
      if (!userId) return;
      try {
        window.localStorage.setItem(storageKey(userId), next);
      } catch {
        // Blocked storage: the choice lasts until the page reloads.
      }
      window.dispatchEvent(new Event(changeEvent));
    },
    [userId],
  );

  return [density, setDensity];
}

/** Puts the density on <html data-density>, where globals.css tightens every list's rows. */
export function useApplyDensity() {
  const [density] = useDensity();

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);
}
