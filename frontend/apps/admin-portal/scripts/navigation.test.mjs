// Breadcrumb trails come from one registry, so a wrong entry silently breaks every crumb,
// sidebar highlight and record link that reads it. Run with node's type stripping so the
// check reads the real module.
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canOpenPath,
  findPage,
  getActiveNavHref,
  getBreadcrumbTrail,
  locationHref,
  navigationGroups,
  notificationHref,
  recordHref,
  subRoutes,
} from '../lib/navigation.ts';

const id = '59d5180d-54d2-46c7-a9ff-3e72a354588f';
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-/i;
const all = () => true;
const none = () => false;
const params = (query) => new URLSearchParams(query);
const show = (trail) =>
  trail
    .map((crumb) => {
      const label = crumb.loading ? '…' : crumb.label;
      return crumb.group ? `[${label}]` : crumb.href ? `${label}(${crumb.href})` : label;
    })
    .join(' › ');

// Every sidebar page: [group] › page, the page being the current crumb.
for (const group of navigationGroups) {
  for (const page of group.items) {
    const trail = getBreadcrumbTrail(page.href, null, all);
    assert.equal(show(trail), `[${group.label}] › ${page.label}`, page.href);
    assert.equal(trail.at(-1).current, true, page.href);
    assert.equal(trail[0].group, group.label, page.href);
  }
}

// Every sub-route: [group] › parent page (link) › [record] › sub-page.
for (const route of subRoutes) {
  const parent = findPage(route.parent);
  assert.ok(parent, `${route.pattern} has a parent page`);
  const path = route.pattern.replace('[id]', id);
  const named = getBreadcrumbTrail(path, null, all, { [id]: 'Max Healthcare' });
  const unnamed = getBreadcrumbTrail(path, null, all);
  const record = route.pattern.includes('[id]')
    ? parent.record === 'q'
      ? ` › Max Healthcare(${parent.href}?q=Max%20Healthcare)`
      : ` › Max Healthcare(${parent.href}?id=${id})`
    : '';
  assert.equal(
    show(named),
    `[${parent.group}] › ${parent.label}(${parent.href})${record} › ${route.label}`,
  );
  assert.equal(named.at(-1).current, true, path);
  // Until the page names its record the crumb is a placeholder, never the id.
  if (route.pattern.includes('[id]')) {
    assert.equal(unnamed[2].loading, true, path);
    assert.equal(unnamed[2].label, '', path);
  }
}

// Spec trails.
assert.equal(
  show(getBreadcrumbTrail('/inventory/transfers', params(`id=${id}`), all, { [id]: 'TRF0043' })),
  '[Inventory] › Transfers(/inventory/transfers) › TRF0043',
);
assert.equal(
  show(
    getBreadcrumbTrail(`/inventory/transfers/${id}/acknowledge`, null, all, { [id]: 'TRF0043' }),
  ),
  `[Inventory] › Transfers(/inventory/transfers) › TRF0043(/inventory/transfers?id=${id}) › Acknowledge`,
);
assert.equal(
  show(
    getBreadcrumbTrail('/inventory/grns', params(`id=${id}&view=DRAFT`), all, {
      [id]: 'GRN000123',
    }),
  ),
  '[Inventory] › GRNs(/inventory/grns) › GRN000123',
);
assert.equal(
  show(getBreadcrumbTrail('/masters/items', params(`id=${id}`), all, { [id]: 'Masala chai' })),
  '[Item & Menu Setup] › Items(/masters/items) › Masala chai',
);
assert.equal(
  show(
    getBreadcrumbTrail(`/masters/hospitals/${id}/locations`, null, all, { [id]: 'Max Healthcare' }),
  ),
  '[Organization] › Hospitals(/masters/hospitals) › Max Healthcare(/masters/hospitals?q=Max%20Healthcare) › Locations',
);

// A record crumb on a list is the current crumb: a placeholder until named, then the label.
const loading = getBreadcrumbTrail('/kitchen/productions', params(`id=${id}`), all);
assert.deepEqual(loading.at(-1), { current: true, label: '', loading: true });
// ?id= on a page without a detail view is ignored; ?q= never adds a crumb.
assert.equal(
  show(getBreadcrumbTrail('/masters/stores', params(`id=${id}`), all)),
  '[Organization] › Stores',
);
assert.equal(
  show(getBreadcrumbTrail('/inventory/transfers', params('q=TRF'), all)),
  '[Inventory] › Transfers',
);

// Unknown paths fall back to the nearest known parent; a UUID segment reads "Details".
assert.equal(show(getBreadcrumbTrail('/', null, all)), '[Overview] › Dashboard');
assert.equal(
  show(getBreadcrumbTrail('/nope/x', null, all)),
  '[Overview] › Dashboard(/dashboard) › X',
);
assert.equal(
  show(getBreadcrumbTrail('/inventory/nope', null, all)),
  '[Overview] › Dashboard(/dashboard) › Nope',
);
assert.equal(
  show(getBreadcrumbTrail('/masters/stores/abc/stock-history', null, all)),
  '[Organization] › Stores(/masters/stores) › Stock History',
);
assert.equal(
  show(getBreadcrumbTrail(`/inventory/transfers/${id}`, null, all)),
  '[Inventory] › Transfers(/inventory/transfers) › Details',
);
// A trailing slash is the same page.
assert.equal(show(getBreadcrumbTrail('/inventory/grns/', null, all)), '[Inventory] › GRNs');

// Without permission a page crumb is plain text, and so is a named record on it.
assert.equal(
  show(
    getBreadcrumbTrail(`/inventory/transfers/${id}/acknowledge`, null, none, { [id]: 'TRF0043' }),
  ),
  '[Inventory] › Transfers › TRF0043 › Acknowledge',
);
const onlyGrns = (permission) => [permission].flat().includes('GRN_VIEW');
assert.equal(
  show(getBreadcrumbTrail('/inventory/grns/new', null, onlyGrns)),
  '[Inventory] › GRNs(/inventory/grns) › New GRN',
);
assert.equal(
  show(getBreadcrumbTrail('/masters/stores/abc/def', null, none)),
  '[Organization] › Stores › Def',
);

// No trail ever shows an id, whatever the labels.
for (const path of [
  `/inventory/transfers/${id}/acknowledge`,
  `/masters/item-prices/${id}/edit`,
  `/masters/restaurants/${id}/edit`,
  `/masters/hospitals/${id}/locations`,
  `/inventory/transfers/${id}`,
  `/x/${id}`,
]) {
  for (const trail of [getBreadcrumbTrail(path, null, all), getBreadcrumbTrail(path, null, none)]) {
    assert.ok(!trail.some((crumb) => uuid.test(crumb.label)), path);
  }
}

// Every dashboard route on disk is a registry page or sub-route (redirect-only routes aside),
// so a new page cannot ship with a guessed breadcrumb.
const appDir = fileURLToPath(new URL('../app/(dashboard)', import.meta.url));
const redirects = new Set([
  '/masters/companies',
  '/masters/companies/new',
  '/masters/counters',
  '/masters/counters/new',
]);
const known = new Set([
  ...navigationGroups.flatMap((group) => group.items.map((page) => page.href)),
  ...subRoutes.map((route) => route.pattern),
]);
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : name === 'page.tsx' ? [full] : [];
  });
for (const file of walk(appDir)) {
  const route = `/${relative(appDir, file).split(sep).slice(0, -1).join('/')}`;
  if (!redirects.has(route)) {
    assert.ok(known.has(route), `${route} is in lib/navigation.ts`);
  }
}

// Sidebar highlight: the deepest page a path sits under, hidden pages highlight their stand-in.
assert.equal(getActiveNavHref('/inventory/transfers/new'), '/inventory/transfers');
assert.equal(getActiveNavHref(`/masters/hospitals/${id}/locations`), '/masters/locations');
assert.equal(getActiveNavHref('/roles'), '/users');
assert.equal(getActiveNavHref('/nope'), null);

// Record and location links.
assert.equal(recordHref('/inventory/grns', { id }), `/inventory/grns?id=${id}`);
assert.equal(
  recordHref('/masters/stores', { id, name: 'Main Store' }),
  '/masters/stores?q=Main%20Store',
);
assert.equal(recordHref('/masters/stores', {}), '/masters/stores');
assert.equal(locationHref('STORE', 'STR0001'), '/masters/stores?q=STR0001');
assert.equal(locationHref('RESTAURANT', 'RST0001'), '/masters/restaurants?q=RST0001');
assert.equal(locationHref('COUNTER', 'C1'), null);
assert.equal(notificationHref('/inventory/transfers', id), `/inventory/transfers?id=${id}`);
assert.equal(notificationHref('/dashboard', id), '/dashboard');
assert.equal(notificationHref('/inventory/grns?view=DRAFT', id), '/inventory/grns?view=DRAFT');
assert.equal(notificationHref('https://example.com', id), null);
assert.equal(notificationHref('//example.com', id), null);
assert.equal(notificationHref(null, id), null);

// Permission checks by path, with query strings and sub-routes.
assert.equal(canOpenPath('/inventory/grns?view=DRAFT', onlyGrns), true);
assert.equal(canOpenPath('/inventory/grns/new', onlyGrns), false);
assert.equal(canOpenPath(`/masters/restaurants/${id}/edit`, none), false);
// The shell sends users to /forbidden on these answers, so they must match the API: the
// acknowledge page reads a transfer like the list (TRANSFER_VIEW or KITCHEN_TRANSFER_VIEW).
const kitchenTransfers = (permission) => [permission].flat().includes('KITCHEN_TRANSFER_VIEW');
assert.equal(canOpenPath('/inventory/transfers', kitchenTransfers), true);
assert.equal(canOpenPath(`/inventory/transfers/${id}/acknowledge`, kitchenTransfers), true);
assert.equal(canOpenPath('/dashboard', none), true);
assert.equal(canOpenPath('/not/registered', none), true);

console.log('navigation ok');
