/**
 * Signing out after 8 hours without activity (the user, 2026-11-23); the POS till is exempt.
 * Activity is the person at the screen (mouse, keyboard, touch, wheel), never the portal's own
 * background requests. The time of the last input sits in localStorage, so every tab of the
 * browser shares it (and a browser opened again after 8 hours reads it before anything shows).
 */
export const IDLE_LIMIT_MS = 8 * 60 * 60 * 1000;
export const LAST_ACTIVITY_KEY = 'aahar.last-activity';
/** How often an open tab looks at the clock. */
const CHECK_EVERY_MS = 60_000;
/** Mouse moves come many a second: write the time at most this often. */
const WRITE_EVERY_MS = 30_000;
const INPUTS = ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const;

type ActivityStore = Pick<Storage, 'getItem' | 'setItem'>;

interface Listeners {
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: () => void, options?: EventListenerOptions): void;
}

/** The parts of `window` used here (a test passes a fake). */
interface WatchedWindow extends Listeners {
  clearInterval(id: number): void;
  document: Listeners;
  localStorage: ActivityStore;
  setInterval(callback: () => void, ms: number): number;
}

/** The browser's last input was 8 hours or more ago. Nothing recorded yet is not idle. */
export function idleTooLong(storage: ActivityStore, now: number): boolean {
  const last = storage.getItem(LAST_ACTIVITY_KEY);

  return last !== null && now - Number(last) >= IDLE_LIMIT_MS;
}

/**
 * Calls `onIdle` once 8 hours pass with no input in any tab, checking every minute and whenever
 * the tab comes back (a computer that slept). While `isExempt()` (the POS till), the tab counts as
 * active instead. Returns the unsubscribe; it unsubscribes itself before calling `onIdle`.
 */
export function watchIdle(
  onIdle: () => void,
  {
    isExempt,
    now = Date.now,
    win = window,
  }: { isExempt: () => boolean; now?: () => number; win?: WatchedWindow },
): () => void {
  const storage = win.localStorage;
  let lastWrite = Number.NEGATIVE_INFINITY;
  const record = () => {
    lastWrite = now();
    storage.setItem(LAST_ACTIVITY_KEY, String(lastWrite));
  };
  const onInput = () => {
    if (now() - lastWrite >= WRITE_EVERY_MS) record();
  };
  const check = () => {
    if (isExempt()) {
      record();
    } else if (idleTooLong(storage, now())) {
      stop();
      onIdle();
    }
  };
  const timer = win.setInterval(check, CHECK_EVERY_MS);
  const stop = () => {
    win.clearInterval(timer);
    for (const type of INPUTS) win.removeEventListener(type, onInput, { capture: true });
    win.removeEventListener('focus', check);
    win.document.removeEventListener('visibilitychange', check);
  };

  for (const type of INPUTS) win.addEventListener(type, onInput, { capture: true, passive: true });
  win.addEventListener('focus', check);
  win.document.addEventListener('visibilitychange', check);
  if (storage.getItem(LAST_ACTIVITY_KEY) === null) record();
  check();

  return stop;
}
