/**
 * How often an open tab asks whether its session still stands. Switching back to the tab checks
 * at once, so the timer only covers a tab left in view; at 30 s it was 15% of all requests with
 * 1,000 users signed in (scripts/loadtest).
 */
const CHECK_EVERY_MS = 120_000;
/** focus and visibilitychange often fire together on a switch back: one check for both. */
const SETTLE_MS = 2_000;

interface Listeners {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** The parts of `window` used here (a test passes a fake). */
interface WatchedWindow extends Listeners {
  clearInterval(id: number): void;
  document: Listeners & { visibilityState: string };
  setInterval(callback: () => void, ms: number): number;
}

/**
 * Calls `check` when the tab comes back into view (another window or tab was in front) and every
 * 2 minutes while it is in view, so a session ended elsewhere (a sign-in on another browser) signs this
 * one out without waiting for a click. Returns the unsubscribe.
 */
export function watchSession(
  check: () => void,
  { now = Date.now, win = window }: { now?: () => number; win?: WatchedWindow } = {},
): () => void {
  let lastCheck = Number.NEGATIVE_INFINITY;
  const checkIfVisible = () => {
    if (win.document.visibilityState !== 'visible' || now() - lastCheck < SETTLE_MS) {
      return;
    }

    lastCheck = now();
    check();
  };
  const timer = win.setInterval(checkIfVisible, CHECK_EVERY_MS);

  win.addEventListener('focus', checkIfVisible);
  win.document.addEventListener('visibilitychange', checkIfVisible);

  return () => {
    win.clearInterval(timer);
    win.removeEventListener('focus', checkIfVisible);
    win.document.removeEventListener('visibilitychange', checkIfVisible);
  };
}
