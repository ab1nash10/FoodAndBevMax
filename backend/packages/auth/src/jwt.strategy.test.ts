import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type { AccessResolver, ResolvedAccess } from './access-resolver';
import { JwtStrategy } from './jwt.strategy';

const config = { getOrThrow: () => 'test-secret' } as unknown as ConfigService;

/** A resolver whose cache still holds `cached` until forget() drops it; the database has `stored`. */
function resolverWith(cached: number, stored: number) {
  let version = cached;
  const access = (sessionVersion: number) =>
    ({
      allowedHospitalIds: [],
      locationScope: 'ALL',
      permissions: [],
      roles: [],
      sessionVersion,
    }) as unknown as ResolvedAccess;

  return {
    forget: () => (version = stored),
    recordActivity: () => undefined,
    resolve: () => Promise.resolve(access(version)),
  } as unknown as AccessResolver;
}

void test('a sign-in newer than the cached access is let in, not bounced by the cache', async () => {
  // Browser B signed in (version 3) moments after browser A's request cached version 2.
  const strategy = new JwtStrategy(config, resolverWith(2, 3));

  const user = await strategy.validate({ sub: 'user-1', sv: 3 });

  assert.equal(user.id, 'user-1');
});

void test('a token older than the session is still refused', async () => {
  // Browser A after browser B signed in: the cache and the database both say 3.
  const strategy = new JwtStrategy(config, resolverWith(3, 3));

  await assert.rejects(strategy.validate({ sub: 'user-1', sv: 2 }), {
    message: 'Your account was updated. Please sign in again.',
  });
});
