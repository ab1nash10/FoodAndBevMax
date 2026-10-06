import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { RedisService } from './redis.service';
import { test } from 'vitest';

// Expiry, single-use deletes and the atomic claim/count are what sign-in relies on. With
// REDIS_URL set this runs against real Redis, otherwise against the in-process Map.
test(`RedisService (${process.env.REDIS_URL ? 'redis' : 'in-memory'})`, async () => {
  const store = new RedisService();
  const key = (name: string) => `check:${process.pid}:${name}`;

  await store.setWithExpiry(key('otp'), '123456', 60);
  assert.equal(await store.get(key('otp')), '123456', 'a stored value reads back');
  assert.equal(await store.get(key('absent')), null, 'an unknown key is null, not undefined');

  assert.equal(await store.delete(key('otp')), true, 'deleting a live key reports it');
  assert.equal(await store.get(key('otp')), null, 'a deleted key is gone');
  // A logout deletes a key that was never written when the token had already expired; that
  // must not throw, and must not claim to have consumed anything.
  assert.equal(await store.delete(key('never-existed')), false, 'deleting nothing is false');

  // Sub-second TTL so the check stays fast.
  await store.setWithExpiry(key('short'), 'user-1', 0.15);
  assert.equal(await store.get(key('short')), 'user-1', 'still live before the TTL');
  await sleep(300);
  assert.equal(await store.get(key('short')), null, 'expired after the TTL');

  // Overwriting must reset the window, or a re-issued token would inherit the old expiry.
  await store.setWithExpiry(key('reset'), 'user-2', 0.15);
  await sleep(50);
  await store.setWithExpiry(key('reset'), 'user-2', 60);
  await sleep(200);
  assert.equal(await store.get(key('reset')), 'user-2', 'a rewrite extends the TTL');

  // Only one of several concurrent claims wins the resend slot.
  const claims = await Promise.all(
    [1, 2, 3, 4, 5].map(() => store.setIfAbsent(key('slot'), '1', 60)),
  );
  assert.equal(claims.filter(Boolean).length, 1, 'exactly one concurrent claim succeeds');

  // Concurrent failed attempts are all counted, and the counter expires with its window.
  const counts = await Promise.all(
    [1, 2, 3, 4, 5].map(() => store.increment(key('attempts'), 0.3)),
  );
  assert.deepEqual(
    [...counts].sort((a, b) => a - b),
    [1, 2, 3, 4, 5],
    'every concurrent increment is counted',
  );
  await sleep(450);
  assert.equal(await store.increment(key('attempts'), 60), 1, 'the count restarts after expiry');

  // Two racing consumers of one code: only one may sign in.
  await store.setWithExpiry(key('race'), '654321', 60);
  const consumed = await Promise.all([store.delete(key('race')), store.delete(key('race'))]);
  assert.equal(consumed.filter(Boolean).length, 1, 'a code is consumed exactly once');

  for (const name of ['reset', 'slot', 'attempts']) {
    await store.delete(key(name));
  }

  await store.onModuleDestroy();
});
