import { expect, test } from 'vitest';
import { createBoardSimulation, MOCK_STEP_MS } from './mock';
import { boardView } from './rules';

// Deterministic randomness, so the run is the same every time.
function seeded(seed = 7) {
  let state = seed;
  return () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
}

test('the simulation moves: orders turn ready, are collected and new ones arrive', () => {
  const start = Date.parse('2026-10-15T07:00:00Z');
  const simulation = createBoardSimulation(start, seeded());
  const first = boardView(simulation.feed(start).orders, start);
  expect(first.nowReady).not.toBeNull();
  expect(first.ready.some((order) => order.collectSoon)).toBe(true);

  const later = start + 10 * MOCK_STEP_MS;
  const next = boardView(simulation.feed(later).orders, later);
  expect(next.nowReady?.orderNumber).not.toBe(first.nowReady?.orderNumber);
});

test('two hours of orders stay bounded (no growth on a TV left running)', () => {
  const start = Date.parse('2026-10-15T07:00:00Z');
  const simulation = createBoardSimulation(start, seeded(11));
  let largest = 0;
  let sawMore = false;
  for (let at = start; at <= start + 2 * 60 * 60_000; at += 30_000) {
    const feed = simulation.feed(at);
    largest = Math.max(largest, feed.orders.length);
    sawMore ||= boardView(feed.orders, at).preparingMore > 0;
  }
  expect(largest).toBeLessThan(40);
  expect(sawMore).toBe(true);
});
