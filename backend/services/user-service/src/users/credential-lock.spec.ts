import { strict as assert } from 'node:assert';
import { ConflictException } from '@nestjs/common';
import { test } from 'vitest';
import { assertCredentialsUnlocked } from './users.service';

const user = {
  email: 'asha@max.in',
  id: 'user-1',
  lastActiveAt: new Date(Date.now() - 5 * 60_000),
  mobile: '9876543210',
  name: 'Asha',
} as Parameters<typeof assertCredentialsUnlocked>[0];
const admin = { actorId: 'admin-1' };

test('an admin cannot change a signed-in user’s password, email or mobile', () => {
  for (const dto of [
    { password: 'N3w-password!' },
    { email: 'new@max.in' },
    { mobile: '9000000000' },
  ]) {
    assert.throws(
      () => assertCredentialsUnlocked(user, dto, admin),
      (error: unknown) =>
        error instanceof ConflictException && /Asha is signed in/.test(error.message),
      JSON.stringify(dto),
    );
  }
});

test('everything else, the same values, idle users and the user themself pass', () => {
  // The portal resends email and mobile on every save: unchanged values are not a change.
  assertCredentialsUnlocked(user, { email: 'ASHA@max.in', mobile: '9876543210', name: 'A' }, admin);
  assertCredentialsUnlocked(user, { designation: 'Chef' }, admin);
  assertCredentialsUnlocked(user, { password: 'N3w-password!' }, { actorId: 'user-1' });
  assertCredentialsUnlocked(
    { ...user, lastActiveAt: new Date(Date.now() - 9 * 60 * 60_000) },
    { password: 'N3w-password!' },
    admin,
  );
  assertCredentialsUnlocked({ ...user, lastActiveAt: null }, { password: 'N3w-password!' }, admin);
});
