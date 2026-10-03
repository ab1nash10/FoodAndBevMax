// Self-check for the stored-password credential path: `pnpm -C packages/auth build && node dist/passwords.check.js`
import { strict as assert } from 'node:assert';
import { hashPassword, verifyPassword } from './passwords';

async function main(): Promise<void> {
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

  console.log('passwords self-check passed');
}

void main();
