import { strict as assert } from 'node:assert';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { hashPassword } from '@aahar/auth';
import { test } from 'vitest';
import { assertCredentialsUnlocked, assertOwnCurrentPassword } from './users.service';

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

test('changing your own password, email or mobile needs your current password', async () => {
  const self = { actorId: 'user-1' };
  const withPassword = { ...user, passwordHash: await hashPassword('Old-pass1') };

  for (const dto of [
    { password: 'N3w-password!' },
    { email: 'new@max.in' },
    { mobile: '9000000000' },
  ]) {
    await assert.rejects(assertOwnCurrentPassword(withPassword, dto, self), BadRequestException);
    await assert.rejects(
      assertOwnCurrentPassword(withPassword, { ...dto, currentPassword: 'wrong-1' }, self),
      BadRequestException,
    );
    await assertOwnCurrentPassword(withPassword, { ...dto, currentPassword: 'Old-pass1' }, self);
  }

  // Not a credential change, or someone else's record (the other rules cover that).
  await assertOwnCurrentPassword(withPassword, { name: 'Asha K', email: 'asha@max.in' }, self);
  await assertOwnCurrentPassword(withPassword, { password: 'N3w-password!' }, admin);
  await assert.rejects(
    assertOwnCurrentPassword({ ...user, passwordHash: null }, { mobile: '9000000000' }, self),
    BadRequestException,
  );
});
