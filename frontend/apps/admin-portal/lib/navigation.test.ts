import { expect, test } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { canOpenPath, homeHref } from './navigation';

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

test('a user with no permissions can open no screen but the dashboard, typed URLs included', () => {
  const root = join(__dirname, '..', 'app', '(dashboard)');
  const routes = (readdirSync(root, { recursive: true }) as string[])
    .filter((file) => file.endsWith(`${sep}page.tsx`))
    .map((file) => `/${file.split(sep).slice(0, -1).join('/')}`.replace(/\[[^\]]+\]/g, 'x1'));

  expect(routes.length).toBeGreaterThan(50);
  expect(routes.filter((route) => canOpenPath(route, () => false))).toEqual(['/dashboard']);
});
