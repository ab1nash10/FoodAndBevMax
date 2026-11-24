import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { idleTooLong, LAST_ACTIVITY_KEY, watchIdle } from './idle-sign-out';

const HOUR = 3_600_000;

/** A window with listeners, a shared localStorage and a hand-driven interval. */
function fakeWindow(storage = new Map<string, string>()) {
  const listeners = new Map<string, Set<() => void>>();
  const on = (type: string, listener: () => void) =>
    listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
  const off = (type: string, listener: () => void) => listeners.get(type)?.delete(listener);
  let tick: (() => void) | null = null;
  const win = {
    addEventListener: on,
    clearInterval: () => (tick = null),
    document: { addEventListener: on, removeEventListener: off },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    },
    now: 0,
    removeEventListener: off,
    setInterval: (callback: () => void) => ((tick = callback), 1),
  };

  return {
    fire: (type: string) => listeners.get(type)?.forEach((listener) => listener()),
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    storage,
    tick: () => tick?.(),
    win,
  };
}

function watch(fake: ReturnType<typeof fakeWindow>, onPos = () => false) {
  let signedOut = 0;
  const stop = watchIdle(() => (signedOut += 1), {
    isExempt: onPos,
    now: () => fake.win.now,
    win: fake.win,
  });
  return { signedOut: () => signedOut, stop };
}

test('signs out once 8 hours pass with no mouse, keyboard or touch, and not before', () => {
  const fake = fakeWindow();
  const { signedOut } = watch(fake);

  fake.win.now = 8 * HOUR - 60_000;
  fake.tick();
  assert.equal(signedOut(), 0, '7 h 59 min idle: still signed in');

  fake.win.now = 8 * HOUR;
  fake.tick();
  assert.equal(signedOut(), 1, '8 hours idle: signed out');
  assert.equal(fake.listenerCount(), 0, 'and it stops watching');
});

test('any input restarts the 8 hours; the background session check does not count', () => {
  const fake = fakeWindow();
  const { signedOut } = watch(fake);

  fake.win.now = 7 * HOUR;
  fake.fire('keydown');
  fake.win.now = 14 * HOUR;
  fake.tick();
  assert.equal(signedOut(), 0, 'typed at 7 h, so 7 h idle at 14 h');

  fake.win.now = 15 * HOUR;
  fake.tick();
  assert.equal(signedOut(), 1);
});

test('input in another tab of the browser counts for this one too', () => {
  const fake = fakeWindow();
  const { signedOut } = watch(fake);

  // The other tab writes the same localStorage entry.
  fake.win.now = 6 * HOUR;
  fake.storage.set(LAST_ACTIVITY_KEY, String(6 * HOUR));
  fake.win.now = 9 * HOUR;
  fake.tick();
  assert.equal(signedOut(), 0);
});

test('a computer that slept past 8 hours signs out as soon as the tab is back', () => {
  const fake = fakeWindow();
  const { signedOut } = watch(fake);

  fake.win.now = 10 * HOUR;
  fake.fire('visibilitychange');
  assert.equal(signedOut(), 1);
});

test('the POS till never signs out, and keeps the browser active for its other tabs', () => {
  const shared = new Map<string, string>();
  const till = fakeWindow(shared);
  const tillWatch = watch(till, () => true);

  till.win.now = 20 * HOUR;
  till.tick();
  assert.equal(tillWatch.signedOut(), 0, 'nobody touched the till for 20 hours');

  const dashboard = fakeWindow(shared);
  dashboard.win.now = 20 * HOUR;
  const dashboardWatch = watch(dashboard);
  dashboard.tick();
  assert.equal(dashboardWatch.signedOut(), 0, 'an open till keeps its browser signed in');
});

test('a browser opened again after 8 idle hours is idle too long; a new session is not', () => {
  const storage = fakeWindow().win.localStorage;
  assert.equal(idleTooLong(storage, 9 * HOUR), false, 'nothing recorded yet: not idle');

  storage.setItem(LAST_ACTIVITY_KEY, String(HOUR));
  assert.equal(idleTooLong(storage, 8 * HOUR), false);
  assert.equal(idleTooLong(storage, 9 * HOUR), true);
});
