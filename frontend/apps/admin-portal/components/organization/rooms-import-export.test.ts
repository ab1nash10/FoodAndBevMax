import type { Restaurant, Room, RoomInput } from '@aahar/api-client';
import { describe, expect, test } from 'vitest';
import {
  startRoomImport,
  startTableImport,
  type RoomImportApi,
  type TableImportApi,
} from './rooms-import-export';

const page = <T>(items: T[]) => ({
  data: { items, meta: { limit: 100, page: 1, total: items.length, totalPages: 1 } },
  message: '',
  success: true,
});
const ppg = { hospitalCode: 'PPG', hospitalName: 'Patparganj', id: 'h-ppg', isActive: true };
const saket = { hospitalCode: 'SKT', hospitalName: 'Saket', id: 'h-skt', isActive: true };
const bed = {
  hospital: ppg,
  hospitalId: ppg.id,
  id: 'r1',
  isActive: true,
  roomCode: 'R-000001',
  roomName: 'PG-ECO-06 (EWS)',
} as Room;

function fakeApi() {
  const calls: Array<[string, unknown]> = [];
  const api: RoomImportApi = {
    createRoom: (body: RoomInput) => {
      calls.push(['create', body]);
      return Promise.resolve({ data: { ...bed, ...body, id: `new-${calls.length}` } });
    },
    listHospitals: () => Promise.resolve(page([ppg, saket])),
    listRooms: () => Promise.resolve(page([bed])),
    updateRoom: (id, body) => {
      calls.push(['update', { id, ...body }]);
      return Promise.resolve();
    },
  };
  return { api, calls };
}

const row = (values: Record<string, string>) => (header: string) => values[header] ?? '';

test('a code updates its room; the same name at the location updates it too', async () => {
  const { api, calls } = fakeApi();
  const importRow = await startRoomImport(api, undefined);

  expect(
    await importRow(
      row({ 'Room code': 'r-000001', 'Room name': 'PG-ECO-06', 'Room status': 'Inactive' }),
    ),
  ).toBe('updated');
  expect(await importRow(row({ 'Location code': 'ppg', 'Room name': 'pg-eco-06 (ews)' }))).toBe(
    'updated',
  );
  expect(calls).toEqual([
    ['update', { id: 'r1', isActive: false, roomName: 'PG-ECO-06' }],
    ['update', { id: 'r1', isActive: true, roomName: 'pg-eco-06 (ews)' }],
  ]);
});

test('a new name is added at the row’s location, else the one chosen at the top, once', async () => {
  const { api, calls } = fakeApi();
  const importRow = await startRoomImport(api, ppg.id);

  expect(await importRow(row({ 'Room name': 'PG-ECO-07 (EWS)' }))).toBe('created');
  expect(await importRow(row({ 'Room name': 'PG-ECO-07 (EWS)', 'Room status': 'Inactive' }))).toBe(
    'updated',
  );
  expect(await importRow(row({ 'Location code': 'SKT', 'Room name': 'Table 1' }))).toBe('created');
  expect(calls[0]).toEqual([
    'create',
    { hospitalId: ppg.id, isActive: true, roomName: 'PG-ECO-07 (EWS)' },
  ]);
  expect(calls[1]?.[0]).toBe('update');
  expect(calls[2]).toEqual([
    'create',
    { hospitalId: saket.id, isActive: true, roomName: 'Table 1' },
  ]);
});

test('bad rows say what is wrong', async () => {
  const { api } = fakeApi();
  const unscoped = await startRoomImport(api, undefined);

  await expect(unscoped(row({ 'Room name': 'Bed 9' }))).rejects.toThrow(/Location code/);
  await expect(unscoped(row({ 'Room code': 'R-9', 'Room name': 'Bed 9' }))).rejects.toThrow(
    /No room has code R-9/,
  );
  await expect(unscoped(row({ 'Location code': 'XYZ', 'Room name': 'Bed 9' }))).rejects.toThrow(
    /No location/,
  );
  await expect(
    unscoped(row({ 'Room code': 'R-000001', 'Location code': 'SKT', 'Room name': 'x' })),
  ).rejects.toThrow(/stays at its location/);
});

describe('tables import', () => {
  const cafe = {
    hospitalId: ppg.id,
    id: 'rest-1',
    restaurantCode: 'RST-0001',
    restaurantName: 'Cafe Max',
  };
  const bistro = {
    hospitalId: saket.id,
    id: 'rest-2',
    restaurantCode: 'RST-0002',
    restaurantName: 'Cafe Max',
  };
  const t5 = {
    ...bed,
    id: 't1',
    restaurant: { ...cafe, atTableDining: true },
    restaurantId: cafe.id,
    roomCode: 'T-000001',
    roomName: 'T5',
  } as Room;

  function tablesApi() {
    const { api, calls } = fakeApi();
    const tables: TableImportApi = {
      ...api,
      listRestaurants: () => Promise.resolve(page([cafe, bistro] as Restaurant[])),
      listRooms: (query) => Promise.resolve(page(query.kind === 'TABLE' ? [t5] : [bed])),
    };
    return { api: tables, calls };
  }

  test('a table is found by code, or by name at its restaurant, and updated', async () => {
    const { api, calls } = tablesApi();
    const importRow = await startTableImport(api, ppg.id);

    expect(
      await importRow(
        row({
          Restaurant: 'Cafe Max',
          'Table code': 't-000001',
          'Table name': 'T5A',
          'Table status': 'Inactive',
        }),
      ),
    ).toBe('updated');
    expect(await importRow(row({ Restaurant: 'rst-0001', 'Table name': 't5' }))).toBe('updated');
    expect(calls).toEqual([
      ['update', { id: 't1', isActive: false, roomName: 'T5A' }],
      ['update', { id: 't1', isActive: true, roomName: 't5' }],
    ]);
  });

  test('a new name is added to its restaurant (by name at the location, or by code), once', async () => {
    const { api, calls } = tablesApi();
    const importRow = await startTableImport(api, ppg.id);

    expect(await importRow(row({ Restaurant: 'cafe max', 'Table name': 'Window 2' }))).toBe(
      'created',
    );
    expect(await importRow(row({ Restaurant: 'Cafe Max', 'Table name': 'Window 2' }))).toBe(
      'updated',
    );
    // Another location's restaurant of the same name, by its Location code.
    expect(
      await importRow(row({ 'Location code': 'SKT', Restaurant: 'Cafe Max', 'Table name': 'T1' })),
    ).toBe('created');
    expect(calls[0]).toEqual([
      'create',
      { hospitalId: ppg.id, isActive: true, restaurantId: cafe.id, roomName: 'Window 2' },
    ]);
    expect(calls[1]?.[0]).toBe('update');
    expect(calls[2]).toEqual([
      'create',
      { hospitalId: saket.id, isActive: true, restaurantId: bistro.id, roomName: 'T1' },
    ]);
  });

  test('bad table rows say what is wrong', async () => {
    const { api } = tablesApi();
    const unscoped = await startTableImport(api, undefined);

    await expect(unscoped(row({ 'Table name': 'T9' }))).rejects.toThrow(/Restaurant is required/);
    await expect(unscoped(row({ Restaurant: 'Cafe Max', 'Table name': 'T9' }))).rejects.toThrow(
      /More than one restaurant is named Cafe Max/,
    );
    await expect(unscoped(row({ Restaurant: 'Nowhere', 'Table name': 'T9' }))).rejects.toThrow(
      /No restaurant Nowhere/,
    );
    await expect(
      unscoped(row({ Restaurant: 'RST-0001', 'Table code': 'T-9', 'Table name': 'T9' })),
    ).rejects.toThrow(/No table has code T-9/);
    await expect(
      unscoped(row({ Restaurant: 'RST-0002', 'Table code': 'T-000001', 'Table name': 'T5' })),
    ).rejects.toThrow(/stays at its restaurant/);
  });
});
