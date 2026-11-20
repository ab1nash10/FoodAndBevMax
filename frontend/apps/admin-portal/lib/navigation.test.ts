import { expect, test } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import {
  canOpenPath,
  findPage,
  findSubRoute,
  getStartPageOptions,
  homeHref,
  navigationGroups,
} from './navigation';

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
  // A steward (Delivery Operator) opens on the room orders given to them.
  expect(homeHref(holding('ORDER_DELIVER', 'RESTAURANT_VIEW'))).toBe('/deliveries');
  expect(canOpenPath('/deliveries', holding('ORDER_DELIVER'))).toBe(true);
  expect(canOpenPath('/deliveries', holding('ORDER_VIEW', 'ORDER_UPDATE'))).toBe(false);
});

test('a saved start page wins only while the user may still open it', () => {
  const cashier = holding('POS_ORDER_CREATE', 'POS_ORDER_VIEW');

  expect(homeHref(cashier, '/pos/history')).toBe('/pos/history');
  expect(homeHref(cashier, '/dashboard')).toBe('/dashboard');
  expect(homeHref(cashier, '/inventory/grns')).toBe('/pos/billing');
  expect(homeHref(cashier, null)).toBe('/pos/billing');
});

test('the installed POS app opens Billing for anyone who may bill, whatever their start page', () => {
  const posApp = true;

  expect(homeHref(holding('POS_ORDER_CREATE', 'GRN_VIEW'), '/dashboard', posApp)).toBe(
    '/pos/billing',
  );
  // Someone who may not bill gets their usual screen rather than a page that refuses them.
  expect(homeHref(holding('USER_VIEW'), null, posApp)).toBe('/dashboard');
});

test('a user with no permissions can open no screen but the dashboard, typed URLs included', () => {
  const root = join(__dirname, '..', 'app', '(dashboard)');
  const routes = (readdirSync(root, { recursive: true }) as string[])
    .filter((file) => file.endsWith(`${sep}page.tsx`))
    .map((file) => `/${file.split(sep).slice(0, -1).join('/')}`.replace(/\[[^\]]+\]/g, 'x1'));

  expect(routes.length).toBeGreaterThan(50);
  expect(routes.filter((route) => canOpenPath(route, () => false))).toEqual(['/dashboard']);
});

test('Time Slots is no longer a screen: no tab, no new-slot page, nothing to open', () => {
  const everything = () => true;

  expect(findPage('/masters/time-slots')).toBeUndefined();
  expect(findSubRoute('/masters/time-slots/new')).toBeUndefined();
  expect(canOpenPath('/masters/time-slots', everything)).toBe(false);
});

test('an edit form opens only for someone who may save it', () => {
  expect(canOpenPath('/masters/locations/h1/edit', holding('HOSPITAL_VIEW'))).toBe(false);
  expect(
    canOpenPath('/masters/locations/h1/edit', holding('HOSPITAL_VIEW', 'HOSPITAL_UPDATE')),
  ).toBe(true);
  expect(canOpenPath('/masters/restaurants/r1/edit', holding('RESTAURANT_VIEW'))).toBe(false);
});

test('Access has an Admins screen and an Operators screen, both for whoever may view users', () => {
  expect(findPage('/users')?.label).toBe('Admins');
  expect(findPage('/operators')?.label).toBe('Operators');
  expect(canOpenPath('/operators', holding('USER_VIEW'))).toBe(true);
  expect(canOpenPath('/operators', holding('ITEM_VIEW'))).toBe(false);
});

test('a restaurant returns stock to the store, and the store team counts it in', () => {
  expect(findPage('/inventory/returns/new')?.label).toBe('Return to Store');
  expect(canOpenPath('/inventory/returns/new', holding('RESTAURANT_TRANSFER_SEND'))).toBe(true);
  expect(canOpenPath('/inventory/returns/new', holding('TRANSFER_CREATE'))).toBe(true);
  expect(canOpenPath('/inventory/returns/new', holding('RESTAURANT_STOCK_VIEW'))).toBe(false);
  expect(findPage('/inventory/returns')?.label).toBe('Count Returns');
  expect(canOpenPath('/inventory/returns', holding('GRN_POST'))).toBe(true);
  expect(canOpenPath('/inventory/returns', holding('TRANSFER_VIEW'))).toBe(false);
  // Counting one in opens the acknowledge page, with GRN_POST alone.
  expect(canOpenPath('/inventory/transfers/t1/acknowledge', holding('GRN_POST'))).toBe(true);
});

test('Logs lists the ERP GRN log (the ERP GRNs page) for whoever may view GRNs', () => {
  const logs = navigationGroups.find((group) => group.label === 'Logs');

  expect(logs?.items.map((item) => item.label)).toEqual([
    'ERP Posting',
    'ERP GRN log',
    'ERP GRN errors',
    'Activity Logs',
  ]);
  // The same screen as Inventory's ERP GRNs, at an address of its own so its crumbs say Logs.
  expect(logs?.items[1]).toMatchObject({ href: '/logs/erp-grns', permissions: ['GRN_VIEW'] });
  expect(canOpenPath('/logs/erp-grns', holding('GRN_VIEW'))).toBe(true);
  // GRNs AAHAR refused, for the same people.
  expect(logs?.items[2]).toMatchObject({
    href: '/logs/erp-grn-errors',
    permissions: ['GRN_VIEW'],
  });
  expect(canOpenPath('/logs/erp-grn-errors', holding('GRN_VIEW'))).toBe(true);
  expect(canOpenPath('/logs/erp-grn-errors', holding('TRANSFER_VIEW'))).toBe(false);
  expect(
    getStartPageOptions(() => true).filter((page) => page.href.endsWith('/erp-grns')),
  ).toHaveLength(2);
});
