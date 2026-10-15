import { strict as assert } from 'node:assert';
import {
  AccessResolver,
  CREDENTIAL_LOCK_MS,
  credentialsLockedUntil,
  isSessionCurrent,
  mergePermissionCodes,
} from './access-resolver';
import { test } from 'node:test';

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
