import { strict as assert } from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { ShortCache } from './short-cache';

afterEach(() => {
  vi.useRealTimers();
});

test('one load per key while fresh, shared by callers that arrive together', async () => {
  vi.useFakeTimers();
  const cache = new ShortCache(30_000);
  let loads = 0;
  const load = () => Promise.resolve(++loads);

  assert.deepEqual(await Promise.all([cache.get('a', load), cache.get('a', load)]), [1, 1]);
  vi.advanceTimersByTime(29_000);
  assert.equal(await cache.get('a', load), 1);
  assert.equal(await cache.get('b', load), 2, 'another key loads on its own');

  vi.advanceTimersByTime(2_000);
  assert.equal(await cache.get('a', load), 3, 'stale after the time to live');
});

test('a failed load is not kept: the next caller tries again', async () => {
  const cache = new ShortCache(30_000);

  await assert.rejects(cache.get('a', () => Promise.reject(new Error('db down'))));
  assert.equal(await cache.get('a', () => Promise.resolve('ok')), 'ok');
});
