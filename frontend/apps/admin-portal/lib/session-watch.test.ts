import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { watchSession } from './session-watch';

/** A window with listeners, a visibility flag and a hand-driven clock. */
function fakeWindow() {
  const listeners = new Map<string, Set<() => void>>();
  const on = (type: string, listener: () => void) =>
    listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
  const off = (type: string, listener: () => void) => listeners.get(type)?.delete(listener);
  let tick: (() => void) | null = null;
  let everyMs = 0;
  const win = {
    addEventListener: on,
    clearInterval: () => (tick = null),
    document: { addEventListener: on, removeEventListener: off, visibilityState: 'visible' },
    now: 0,
    removeEventListener: off,
    setInterval: (callback: () => void, ms: number) => ((tick = callback), (everyMs = ms), 1),
  };

  return {
    everyMs: () => everyMs,
    fire: (type: string) => listeners.get(type)?.forEach((listener) => listener()),
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    tick: () => tick?.(),
    win,
  };
}

test('an open tab checks every 2 minutes, not every 30 s (the load test: 15% of all requests)', () => {
  const { everyMs, win } = fakeWindow();
  watchSession(() => undefined, { now: () => win.now, win })();
  assert.equal(everyMs(), 120_000);
});

test('checks when the tab comes back into view and on a timer while it is in view', () => {
  const { fire, listenerCount, tick, win } = fakeWindow();
  let checks = 0;
  const stop = watchSession(() => (checks += 1), { now: () => win.now, win });

  fire('focus');
  assert.equal(checks, 1, 'switching back to this browser checks at once');
  fire('visibilitychange');
  assert.equal(checks, 1, 'focus and visibilitychange together check once');

  win.now = 5_000;
  fire('visibilitychange');
  assert.equal(checks, 2);

  win.now = 125_000;
  tick();
  assert.equal(checks, 3, 'an open tab checks on the timer');

  win.document.visibilityState = 'hidden';
  win.now = 245_000;
  tick();
  fire('visibilitychange');
  assert.equal(checks, 3, 'a hidden tab does not check');

  stop();
  assert.equal(listenerCount(), 0);
});
