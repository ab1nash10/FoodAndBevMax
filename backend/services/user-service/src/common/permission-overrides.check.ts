// Self-check: `pnpm -C backend/services/user-service build && node dist/common/permission-overrides.check.js`
import { strict as assert } from 'node:assert';
import { diffPermissionOverrides } from './permission-overrides';

const inherited = new Set(['USER_VIEW', 'USER_UPDATE']);

assert.deepEqual(
  diffPermissionOverrides(['USER_VIEW', 'USER_UPDATE'], inherited),
  { grants: [], revokes: [] },
  'asking for exactly what the roles give stores no override rows',
);

assert.deepEqual(
  diffPermissionOverrides(['USER_VIEW', 'USER_UPDATE', 'ROLE_VIEW'], inherited),
  { grants: ['ROLE_VIEW'], revokes: [] },
  'an extra permission becomes a grant',
);

assert.deepEqual(
  diffPermissionOverrides(['USER_VIEW'], inherited),
  { grants: [], revokes: ['USER_UPDATE'] },
  'dropping an inherited permission becomes an explicit revoke',
);

assert.deepEqual(
  diffPermissionOverrides([], inherited),
  { grants: [], revokes: ['USER_VIEW', 'USER_UPDATE'] },
  'clearing everything revokes each inherited permission',
);

assert.deepEqual(
  diffPermissionOverrides(['ROLE_VIEW'], new Set<string>()),
  { grants: ['ROLE_VIEW'], revokes: [] },
  'a user with no roles gets pure grants',
);

assert.deepEqual(
  diffPermissionOverrides(['ROLE_VIEW', 'ROLE_VIEW'], new Set<string>()),
  { grants: ['ROLE_VIEW'], revokes: [] },
  'a duplicated request does not write the same row twice',
);

console.log('permission-overrides self-check passed');
