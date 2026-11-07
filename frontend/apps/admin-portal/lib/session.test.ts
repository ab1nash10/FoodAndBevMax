import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { isAccessTokenExpired, sessionUserFromAccessToken } from './session';

// A token as the server signs it: header.payload.signature, the payload base64url without padding.
const token = (payload: object) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
const now = Date.parse('2026-10-26T06:30:00Z');
const inSeconds = (seconds: number) => Math.floor(now / 1000) + seconds;

beforeEach(() => {
  vi.stubGlobal('window', { atob });
  vi.useFakeTimers({ now });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('the user is read from the token, with missing fields as null', () => {
  assert.deepEqual(
    sessionUserFromAccessToken(
      token({
        email: 'cashier@max.in',
        hospital_id: 'h1',
        permissions: ['POS_BILL_CREATE', 7, null],
        roles: ['Cashier'],
        sub: 'u1',
      }),
    ),
    {
      email: 'cashier@max.in',
      hospitalId: 'h1',
      id: 'u1',
      mobile: null,
      name: null,
      permissions: ['POS_BILL_CREATE'],
      roles: ['Cashier'],
    },
  );
});

test('hospitalId wins over hospital_id, and lists that are not arrays read as empty', () => {
  const user = sessionUserFromAccessToken(
    token({ hospitalId: 'new', hospital_id: 'old', permissions: 'ALL', sub: 'u1' }),
  );
  assert.equal(user?.hospitalId, 'new');
  assert.deepEqual(user?.permissions, []);
  assert.deepEqual(user?.roles, []);
});

test('a name in Hindi or with accents reads back as written', () => {
  assert.equal(sessionUserFromAccessToken(token({ name: 'जतिन ग्रोवर', sub: 'u1' }))?.name, 'जतिन ग्रोवर');
  assert.equal(sessionUserFromAccessToken(token({ name: 'Zoë Müller', sub: 'u1' }))?.name, 'Zoë Müller');
});

test('no subject, no payload or a garbled payload is no user', () => {
  assert.equal(sessionUserFromAccessToken(token({ name: 'Nobody' })), null);
  assert.equal(sessionUserFromAccessToken('just-one-part'), null);
  assert.equal(sessionUserFromAccessToken('h.!!!not-json!!!.s'), null);
});

test('on the server (no window) there is never a user', () => {
  vi.stubGlobal('window', undefined);
  assert.equal(sessionUserFromAccessToken(token({ sub: 'u1' })), null);
});

test('a token counts as expired 30 seconds early, or as asked', () => {
  assert.equal(isAccessTokenExpired(token({ exp: inSeconds(31) })), false);
  assert.equal(isAccessTokenExpired(token({ exp: inSeconds(30) })), true);
  assert.equal(isAccessTokenExpired(token({ exp: inSeconds(-5) })), true);
  assert.equal(isAccessTokenExpired(token({ exp: inSeconds(10) }), 0), false);
});

test('a token with no expiry, or one that cannot be read, is not treated as expired', () => {
  assert.equal(isAccessTokenExpired(token({ sub: 'u1' })), false);
  assert.equal(isAccessTokenExpired('garbage'), false);
});
