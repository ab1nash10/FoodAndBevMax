// Self-check for stored-preference parsing: `pnpm exec tsx backend/services/user-service/src/common/preferences.check.ts`
import { strict as assert } from 'node:assert';
import { parsePreferences } from './preferences';

const unset = {
  defaultLocationId: null,
  mutedNotificationCategories: [],
  startPage: null,
  theme: null,
};

assert.deepEqual(
  parsePreferences(null),
  unset,
  'a user who never saved anything gets every default',
);
assert.deepEqual(parsePreferences('junk'), unset, 'a malformed value never breaks a request');
assert.deepEqual(parsePreferences([1, 2]), unset);

assert.deepEqual(
  parsePreferences({
    defaultLocationId: 'all',
    mutedNotificationCategories: ['GRN', 'TRANSFER'],
    startPage: '/inventory/grns',
    theme: 'system',
  }),
  {
    defaultLocationId: 'all',
    mutedNotificationCategories: ['GRN', 'TRANSFER'],
    startPage: '/inventory/grns',
    theme: 'system',
  },
);

assert.equal(parsePreferences({ theme: 'neon' }).theme, null, 'an unknown theme falls back');
assert.deepEqual(
  parsePreferences({ mutedNotificationCategories: ['ACCESS', 'GRN', 7] })
    .mutedNotificationCategories,
  ['GRN'],
  'ACCESS can never be muted, even if it was stored',
);

console.log('preferences self-check passed');
