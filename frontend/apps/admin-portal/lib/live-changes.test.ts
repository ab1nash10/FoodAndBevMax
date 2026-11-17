import { strict as assert } from 'node:assert';
import { QueryClient } from '@tanstack/react-query';
import { test } from 'vitest';
import { applyChanges, reconnectDelay, refreshDelay, takeEvents } from './live-changes';
import { queryKeys } from './query-keys';

function clientWith(keys: readonly (readonly unknown[])[]) {
  const client = new QueryClient();
  for (const key of keys) client.setQueryData(key, 1);
  const invalidated = () =>
    keys.filter((key) => client.getQueryState(key)?.isInvalidated).map((key) => key[0]);
  return { client, invalidated };
}

const screens = [
  queryKeys.hospitals('list'),
  queryKeys.myAccess('user-1'),
  queryKeys.posMenu('counter-1'),
  queryKeys.posBills('today'),
  queryKeys.kioskMenu('restaurant-1'),
  queryKeys.orderBoard('restaurant-1', 'kiosk'),
  ['qr-menu', 'restaurant-1'],
  queryKeys.items('list'),
];

test('a setup change (a location, item, menu, user) refreshes everything on every screen', async () => {
  const { client, invalidated } = clientWith(screens);
  await applyChanges(client, ['hospitals']);
  assert.deepEqual(
    invalidated(),
    screens.map((key) => key[0]),
  );
});

test('a bill refreshes only what bills change: billing elsewhere does not reload setup lists', async () => {
  const { client, invalidated } = clientWith(screens);
  await applyChanges(client, ['pos']);
  assert.deepEqual(invalidated(), [
    'pos-menu',
    'pos-bills',
    'kiosk-menu',
    'order-board',
    'qr-menu',
  ]);
});

test('the stream is read event by event, keeping a partly received one for the next chunk', () => {
  assert.deepEqual(takeEvents(': connected\n\ndata: ["items"]\n\ndata: ["po'), {
    areas: ['items'],
    rest: 'data: ["po',
  });
  assert.deepEqual(takeEvents('data: ["pos","hospitals"]\n\n: ping\n\n'), {
    areas: ['pos', 'hospitals'],
    rest: '',
  });
  assert.deepEqual(takeEvents('data: not json\n\n'), { areas: [], rest: '' });
});

test('refreshes come at most once a second, however fast the saves (a bulk edit, an import)', () => {
  assert.equal(refreshDelay(10_000, 0), 100, 'the first one after the burst window only');
  assert.equal(refreshDelay(10_000, 9_500), 500, 'the next waits out the rest of the second');
  assert.equal(refreshDelay(10_000, 9_950), 950);
  assert.equal(refreshDelay(10_000, 8_000), 100);
});

test('screens cut off together (a deploy) come back spread out, not all at once', () => {
  assert.equal(reconnectDelay(1000, 0), 500);
  assert.equal(reconnectDelay(1000, 0.999), 1499);
  assert.equal(reconnectDelay(30_000, 0.5), 30_000);
});
