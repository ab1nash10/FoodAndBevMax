import { strict as assert } from 'node:assert';
import { UnauthorizedException } from '@nestjs/common';
import { test } from 'vitest';
import { decodeJwtClaims, emailFromClaims, type MicrosoftIdClaims } from './microsoft.service';

const tenantId = '00000000-0000-0000-0000-000000000001';
const expected = { clientId: 'app-1', nonce: 'n-1', tenantId };
const now = Date.parse('2026-10-15T10:00:00Z');
const good: MicrosoftIdClaims = {
  aud: 'app-1',
  exp: now / 1000 + 600,
  iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  nonce: 'n-1',
  preferred_username: 'Asha.Rao@MaxHealthcare.com',
  tid: tenantId,
};
const refused = (claims: MicrosoftIdClaims) =>
  assert.throws(() => emailFromClaims(claims, expected, now), UnauthorizedException);

test('a token from our tenant and app, for this sign-in, gives the lower-cased email', () => {
  assert.equal(emailFromClaims(good, expected, now), 'asha.rao@maxhealthcare.com');
  assert.equal(
    emailFromClaims({ ...good, email: 'asha@max.in' }, expected, now),
    'asha@max.in',
    'email wins over the user name',
  );
});

test('another tenant, app or sign-in, an expired token, or no email is refused', () => {
  refused({ ...good, tid: 'other' });
  refused({ ...good, iss: 'https://login.microsoftonline.com/common/v2.0' });
  refused({ ...good, aud: 'other-app' });
  refused({ ...good, nonce: 'replayed' });
  refused({ ...good, exp: now / 1000 - 1 });
  refused({ ...good, email: undefined, preferred_username: 'no-at-sign' });
});

test('reads the claims of a JWT', () => {
  const token = `x.${Buffer.from(JSON.stringify(good)).toString('base64url')}.sig`;
  assert.deepEqual(decodeJwtClaims(token), good);
  assert.throws(() => decodeJwtClaims('nope'), UnauthorizedException);
});
