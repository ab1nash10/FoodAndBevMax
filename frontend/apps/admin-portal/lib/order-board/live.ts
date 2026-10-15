'use client';

import { useEffect, useRef, useState } from 'react';

/** How long an order that has just turned ready stands out in the banner. */
export const HIGHLIGHT_MS = 10_000;

/**
 * Whether the banner's order has just turned ready (it was not ready before), for HIGHLIGHT_MS.
 * The banner moving back to an older order after a collection is not news. Calls `onReady` once
 * per newly ready order, never for what is already ready when the screen opens.
 */
export function useJustReady(
  bannerNumber: string | undefined,
  /** Undefined until the first feed arrives: what is ready then is not news. */
  readyNumbers: string[] | undefined,
  onReady?: () => void,
): boolean {
  const seen = useRef<Set<string> | null>(null);
  const [until, setUntil] = useState(0);
  const readyKey = readyNumbers?.join('|');

  useEffect(() => {
    if (!readyNumbers) return;
    const before = seen.current;
    seen.current = new Set(readyNumbers);
    if (before && bannerNumber && !before.has(bannerNumber)) {
      setUntil(Date.now() + HIGHLIGHT_MS);
      onReady?.();
    }
    // readyKey stands for readyNumbers; onReady only matters at the moment it fires.
  }, [bannerNumber, readyKey]);

  return Date.now() < until;
}

/** A short two-note chime, made in the browser (no audio file). Kiosk mode must allow autoplay. */
export function playChime(): void {
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  [880, 1320].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + index * 0.22;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.55);
  });
  window.setTimeout(() => void context.close(), 1500);
}

/** Keeps the TV from sleeping while the board is open, where the browser allows it. */
export function useWakeLock(): void {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    const acquire = () => {
      if (document.visibilityState === 'visible' && nav.wakeLock) {
        nav.wakeLock
          .request('screen')
          .then((sentinel) => {
            lock = sentinel;
          })
          .catch(() => undefined);
      }
    };
    acquire();
    // The browser drops the lock when the tab is hidden; take it again on return.
    document.addEventListener('visibilitychange', acquire);

    return () => {
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

/**
 * The board's own theme (light unless ?theme=dark), whatever the portal theme stored on this
 * device. Applied after the portal's ThemeProvider has set its own, and put back on leaving.
 */
export function useBoardTheme(theme: 'dark' | 'light'): void {
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    const apply = () => {
      root.classList.toggle('dark', theme === 'dark');
      root.style.colorScheme = theme;
    };
    // ThemeProvider applies the stored theme in its own effect, which runs after this one.
    const timer = window.setTimeout(apply, 0);
    apply();

    return () => {
      window.clearTimeout(timer);
      root.classList.toggle('dark', wasDark);
      root.style.colorScheme = wasDark ? 'dark' : 'light';
    };
  }, [theme]);
}
