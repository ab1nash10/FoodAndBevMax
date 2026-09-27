/**
 * Self-check for the in-process store that stands in for Redis while it is commented out.
 *
 *   pnpm exec tsx backend/services/auth-service/src/common/redis/redis.service.check.ts
 *
 * Expiry is the part worth checking: a Map has no TTL of its own, so an OTP or a refresh
 * token that outlived its window has to read back as absent. Real Redis did that for us.
 * Delete when Redis comes back.
 */
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { RedisService } from './redis.service';

async function main(): Promise<void> {
  const store = new RedisService();

  await store.setWithExpiry('otp:9876543210', '123456', 60);
  assert.equal(await store.get('otp:9876543210'), '123456', 'a stored value reads back');

  assert.equal(await store.get('otp:absent'), null, 'an unknown key is null, not undefined');

  await store.delete('otp:9876543210');
  assert.equal(await store.get('otp:9876543210'), null, 'a deleted key is gone');

  // A logout deletes a key that was never written when the token had already expired; that
  // must not throw, because revokeRefreshToken awaits it.
  await store.delete('auth:refresh:never-existed');

  // Sub-second TTL so the check stays fast. 0 would be ambiguous at the boundary.
  await store.setWithExpiry('auth:refresh:short', 'user-1', 0.05);
  assert.equal(await store.get('auth:refresh:short'), 'user-1', 'still live before the TTL');
  await sleep(120);
  assert.equal(await store.get('auth:refresh:short'), null, 'expired after the TTL');

  // Overwriting must reset the window, or a re-issued token would inherit the old expiry.
  await store.setWithExpiry('auth:refresh:reset', 'user-2', 0.05);
  await sleep(30);
  await store.setWithExpiry('auth:refresh:reset', 'user-2', 60);
  await sleep(60);
  assert.equal(await store.get('auth:refresh:reset'), 'user-2', 'a rewrite extends the TTL');

  store.onModuleDestroy();
  console.log('redis.service in-memory store: all checks passed');
}

void main();
