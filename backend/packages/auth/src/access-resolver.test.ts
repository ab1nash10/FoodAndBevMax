import { strict as assert } from 'node:assert';
import {
  ACCESS_CACHE_MS,
  AccessResolver,
  CREDENTIAL_LOCK_MS,
  credentialsLockedUntil,
  isSessionCurrent,
  mergePermissionCodes,
} from './access-resolver';
import { mock, test } from 'node:test';

void test('permission merging and session versions', () => {
  const inherited = ['USER_VIEW', 'USER_UPDATE'];

  assert.deepEqual(mergePermissionCodes(inherited, []), inherited, 'no overrides changes nothing');

  assert.deepEqual(
    mergePermissionCodes(inherited, [{ code: 'ROLE_VIEW', granted: true }]),
    ['USER_VIEW', 'USER_UPDATE', 'ROLE_VIEW'],
    'a granting override adds a permission the roles do not carry',
  );

  assert.deepEqual(
    mergePermissionCodes(inherited, [{ code: 'USER_UPDATE', granted: false }]),
    ['USER_VIEW'],
    'a revoking override must beat an inherited grant',
  );

  assert.deepEqual(
    mergePermissionCodes(inherited, [
      { code: 'USER_UPDATE', granted: true },
      { code: 'USER_UPDATE', granted: false },
    ]),
    ['USER_VIEW'],
    'the last override wins',
  );

  assert.deepEqual(
    mergePermissionCodes(['USER_VIEW', 'USER_VIEW'], []),
    ['USER_VIEW'],
    'duplicates from overlapping roles collapse',
  );

  assert.deepEqual(
    mergePermissionCodes([], [{ code: 'USER_VIEW', granted: false }]),
    [],
    'revoking something never held is harmless',
  );

  assert.ok(
    isSessionCurrent(undefined, 0),
    'a token from before session versions survives until the first bump',
  );
  assert.ok(isSessionCurrent(2, 2), 'a token at the current version is valid');
  assert.ok(!isSessionCurrent(undefined, 1), 'an unversioned token dies once the user is changed');
  assert.ok(!isSessionCurrent(1, 2), 'a token from an older session is rejected');
});

void test('credentials stay locked for 8 hours after the last activity', () => {
  const now = Date.parse('2026-10-15T10:00:00Z');

  assert.equal(credentialsLockedUntil(null, now), null, 'never active (or signed out): unlocked');
  assert.equal(
    credentialsLockedUntil(new Date(now - CREDENTIAL_LOCK_MS - 1), now),
    null,
    'more than 8 hours idle: unlocked',
  );
  assert.deepEqual(
    credentialsLockedUntil(new Date(now - 60_000), now),
    new Date(now - 60_000 + CREDENTIAL_LOCK_MS),
    'active a minute ago: locked until 8 hours after that',
  );
});

void test('activity is written at most once a minute per user', async () => {
  const writes: unknown[] = [];
  const prisma = {
    $executeRaw: (_sql: TemplateStringsArray, ...values: unknown[]) => {
      writes.push(values[0]);
      return Promise.resolve(1);
    },
  };
  const resolver = new AccessResolver(prisma as never);

  resolver.recordActivity('a', 0);
  resolver.recordActivity('a', 30_000);
  resolver.recordActivity('b', 30_000);
  resolver.recordActivity('a', 60_000);
  await Promise.resolve();

  assert.deepEqual(writes, ['a', 'b', 'a']);
});

void test('access is looked up once per user per window, and again after forget()', async () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  try {
    let lookups = 0;
    const prisma = {
      $queryRaw: () => {
        lookups++;
        return Promise.resolve([
          {
            assignedHospitalIds: [],
            hospitalId: null,
            inheritedCodes: ['USER_VIEW'],
            overrides: [],
            roles: [{ locationScope: 'ALL', name: 'Super Admin' }],
            sessionVersion: lookups,
          },
        ]);
      },
    };
    const resolver = new AccessResolver(prisma as never);

    // A page's requests arrive together: they share the one lookup in flight.
    const burst = await Promise.all([
      resolver.resolve('a'),
      resolver.resolve('a'),
      resolver.resolve('a'),
    ]);
    assert.equal(lookups, 1);
    assert.deepEqual(
      burst.map((access) => access?.sessionVersion),
      [1, 1, 1],
    );

    await resolver.resolve('b');
    assert.equal(lookups, 2, 'each user has their own entry');

    mock.timers.tick(ACCESS_CACHE_MS - 1);
    await resolver.resolve('a');
    assert.equal(lookups, 2, 'still inside the window');

    mock.timers.tick(1);
    assert.equal((await resolver.resolve('a'))?.sessionVersion, 3, 'the window has passed');

    resolver.forget('a');
    await resolver.resolve('a');
    assert.equal(lookups, 4, 'a write that changed access is seen at once');

    resolver.forget();
    await resolver.resolve('b');
    assert.equal(lookups, 5, 'forget() with no user clears everyone');
  } finally {
    mock.timers.reset();
  }
});
