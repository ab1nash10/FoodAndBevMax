import { strict as assert } from 'node:assert';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { test } from 'vitest';
import { assertCredentialsUnlocked, assertNotOwnContact } from './users.service';

const user = {
  email: 'asha@max.in',
  id: 'user-1',
  lastActiveAt: new Date(Date.now() - 5 * 60_000),
  mobile: '9876543210',
  name: 'Asha',
} as Parameters<typeof assertCredentialsUnlocked>[0];
const admin = { actorId: 'admin-1' };

test('an admin cannot change a signed-in user’s email or mobile', () => {
  for (const dto of [{ email: 'new@max.in' }, { mobile: '9000000000' }]) {
    assert.throws(
      () => assertCredentialsUnlocked(user, dto, admin),
      (error: unknown) =>
        error instanceof ConflictException && /Asha is signed in/.test(error.message),
      JSON.stringify(dto),
    );
  }
});

test('everything else, the same values and idle users pass', () => {
  // The portal resends email and mobile on every save: unchanged values are not a change.
  assertCredentialsUnlocked(user, { email: 'ASHA@max.in', mobile: '9876543210', name: 'A' }, admin);
  assertCredentialsUnlocked(user, { designation: 'Chef' }, admin);
  assertCredentialsUnlocked(
    { ...user, lastActiveAt: new Date(Date.now() - 9 * 60 * 60_000) },
    { mobile: '9000000000' },
    admin,
  );
  assertCredentialsUnlocked({ ...user, lastActiveAt: null }, { mobile: '9000000000' }, admin);
});

test('your own email and mobile are changed by another administrator, never by you', () => {
  const self = { actorId: 'user-1' };

  // They are where your sign-in codes go: a stolen session must not be able to move them.
  for (const dto of [{ email: 'new@max.in' }, { mobile: '9000000000' }]) {
    assert.throws(
      () => assertNotOwnContact(user, dto, self),
      (error: unknown) =>
        error instanceof BadRequestException &&
        /another administrator changes them/.test(error.message),
      JSON.stringify(dto),
    );
  }
  // Your other details, the same values, or someone else's record (the other rules cover that).
  assertNotOwnContact(user, { email: 'asha@max.in', mobile: '9876543210', name: 'Asha K' }, self);
  assertNotOwnContact(user, { mobile: '9000000000' }, admin);
});
