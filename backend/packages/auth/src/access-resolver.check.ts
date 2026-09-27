// Self-check for permission merging: `pnpm -C backend/packages/auth build && node dist/access-resolver.check.js`
import { strict as assert } from 'node:assert';
import { mergePermissionCodes } from './access-resolver';

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

console.log('access-resolver self-check passed');
