import { expect, test } from 'vitest';
import { homeHref } from './navigation';

const holding =
  (...codes: string[]) =>
  (permission: string | string[]) =>
    (Array.isArray(permission) ? permission : [permission]).some((code) => codes.includes(code));

test('lands each role on the screen its permissions point to', () => {
  expect(homeHref(holding('POS_ORDER_CREATE', 'POS_ORDER_VIEW'))).toBe('/pos/billing');
  expect(homeHref(holding('STOCK_VIEW', 'STORE_VIEW'))).toBe('/inventory/today');
  // Anyone the dashboard has data for keeps the dashboard.
  expect(homeHref(holding('POS_ORDER_CREATE', 'GRN_VIEW'))).toBe('/dashboard');
  expect(homeHref(holding('STOCK_VIEW', 'TRANSFER_VIEW'))).toBe('/dashboard');
  expect(homeHref(holding('USER_VIEW'))).toBe('/dashboard');
});

test('a saved start page wins only while the user may still open it', () => {
  const cashier = holding('POS_ORDER_CREATE', 'POS_ORDER_VIEW');

  expect(homeHref(cashier, '/pos/history')).toBe('/pos/history');
  expect(homeHref(cashier, '/dashboard')).toBe('/dashboard');
  expect(homeHref(cashier, '/inventory/grns')).toBe('/pos/billing');
  expect(homeHref(cashier, null)).toBe('/pos/billing');
});
