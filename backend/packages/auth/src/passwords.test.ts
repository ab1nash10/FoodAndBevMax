import { strict as assert } from 'node:assert';
import { hashPassword, verifyPassword } from './passwords';
import { test } from 'node:test';

void test('stored-password hashing', async () => {
  const hash = await hashPassword('Aahar@123');

  assert.notEqual(hash, 'Aahar@123', 'password must not be stored in clear text');
  assert.equal(await verifyPassword('Aahar@123', hash), true, 'correct password must verify');
  assert.equal(await verifyPassword('aahar@123', hash), false, 'password check is case sensitive');
  assert.equal(await verifyPassword('wrong', hash), false, 'wrong password must be rejected');
  assert.equal(
    await verifyPassword('Aahar@123', 'garbage'),
    false,
    'malformed hash must be rejected',
  );
  assert.notEqual(await hashPassword('Aahar@123'), hash, 'each hash must use a fresh salt');
});
