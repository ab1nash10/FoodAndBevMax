import { expect, test } from 'vitest';
import { isTillScreen } from './pos-paths';

test('the till screens are the POS pages, except the back-office ones', () => {
  expect(isTillScreen('/pos')).toBe(true);
  expect(isTillScreen('/pos/billing')).toBe(true);
  expect(isTillScreen('/pos/day')).toBe(true);
  // A restaurant admin or Supervisor at a desk: no till, and the 8-hour idle sign-out applies.
  expect(isTillScreen('/pos/reconciliation')).toBe(false);
  expect(isTillScreen('/pos/approvals')).toBe(false);
  expect(isTillScreen('/dashboard')).toBe(false);
  expect(isTillScreen('/position')).toBe(false);
});
