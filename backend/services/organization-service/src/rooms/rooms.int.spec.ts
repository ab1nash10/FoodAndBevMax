// Rooms, beds and tables over HTTP: codes in order, a name once per location (names kept as
// typed), the location's own status, edits, search, the audit trail, the ROOM_* gate and
// location reach; then the bed's QR, public, which stops working once the bed is inactive.
// Runs only with DATABASE_URL_TEST.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl, run, startHarness, type Body, type Harness } from '../testing/int-harness.js';

describe.skipIf(!databaseUrl)('rooms and tables (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  const fx = { closingHospitalId: '', hospitalId: '', otherHospitalId: '' };
  const items = (data: Body) => data.items as Body[];
  const codeNumber = (room: Body) => Number((room.roomCode as string).slice(2));

  /** A location of this run's own. */
  async function location(name: string) {
    const [row] = await h.rawQuery<{ id: string }>(
      `INSERT INTO hospitals (id, hospital_code, hospital_name, address, city, state, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Int Road', 'New Delhi', 'Delhi', now()) RETURNING id`,
      `RM${randomUUID().slice(0, 6)}`.toUpperCase(),
      `Int Rooms ${name} ${run}`,
    );
    return row!.id;
  }

  /** A signed-in user of one location holding just these permissions. */
  async function userWith(hospitalId: string, permissions: string[]): Promise<string> {
    const [role] = await h.rawQuery<{ id: string }>(
      `INSERT INTO roles (id, name, location_scope, updated_at)
       VALUES (gen_random_uuid(), $1, 'SINGLE', now()) RETURNING id`,
      `Int Rooms ${run} ${randomUUID().slice(0, 8)}`,
    );
    await h.rawQuery(
      `INSERT INTO role_permissions (id, role_id, permission_id, updated_at)
       SELECT gen_random_uuid(), $1::uuid, id, now() FROM permissions WHERE code = ANY($2::text[])`,
      role!.id,
      permissions,
    );
    const [user] = await h.rawQuery<{ id: string; sessionVersion: number }>(
      `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, 'Rooms Clerk', $2, $3::uuid, now())
       RETURNING id, session_version AS "sessionVersion"`,
      `RM${randomUUID().slice(0, 8)}`,
      `7${String(Date.now()).slice(-9)}`,
      hospitalId,
    );
    await h.rawQuery(
      `INSERT INTO user_roles (id, user_id, role_id, updated_at) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
      user!.id,
      role!.id,
    );
    await h.rawQuery(
      `INSERT INTO user_hospitals (id, user_id, hospital_id, updated_at) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
      user!.id,
      hospitalId,
    );
    return h.signFor(user!);
  }

  beforeAll(async () => {
    h = await startHarness();
    fx.hospitalId = await location('PPG');
    fx.otherHospitalId = await location('Saket');
    fx.closingHospitalId = await location('Closing');
  }, 60_000);

  afterAll(() => h?.app.close());

  it('create: codes in order, names kept as typed, each name once per location', async () => {
    const first = await h.ok('POST', '/rooms', {
      hospitalId: fx.hospitalId,
      roomName: `PG-ECO-06 (EWS) ${run}`,
    });
    expect(first).toMatchObject({
      hospital: { id: fx.hospitalId, isActive: true },
      isActive: true,
      roomCode: expect.stringMatching(/^R-\d{6}$/) as unknown,
      roomName: `PG-ECO-06 (EWS) ${run}`,
    });
    // Kept as typed: no Title Case ("2220 b" stays "2220 b").
    const second = await h.ok('POST', '/rooms', {
      hospitalId: fx.hospitalId,
      isActive: false,
      roomName: `2220 b ${run}`,
    });
    expect(second).toMatchObject({ isActive: false, roomName: `2220 b ${run}` });
    expect(codeNumber(second)).toBeGreaterThan(codeNumber(first));

    // The same name at the same location, in any case, is refused; another location may use it.
    const twice = await h.api('POST', '/rooms', {
      hospitalId: fx.hospitalId,
      roomName: `pg-eco-06 (ews) ${run}`,
    });
    expect([twice.status, twice.body.message]).toEqual([
      409,
      `pg-eco-06 (ews) ${run} already exists at this location (${first.roomCode as string}).`,
    ]);
    expect(
      (
        await h.api('POST', '/rooms', {
          hospitalId: fx.otherHospitalId,
          roomName: `PG-ECO-06 (EWS) ${run}`,
        })
      ).status,
    ).toBe(201);

    // Every new room is in the audit trail.
    const [audit] = await h.rawQuery<{ action: string }>(
      `SELECT action FROM audit_logs WHERE entity_id = $1::uuid`,
      first.id,
    );
    expect(audit?.action).toBe('ROOM_CREATE');
  });

  it('create: refuses a bad body, an unknown location and an inactive one', async () => {
    const refused = async (body: Body) => {
      const response = await h.api('POST', '/rooms', body);
      return [response.status, response.body.message];
    };

    expect(await refused({ hospitalId: fx.hospitalId, roomName: '' })).toEqual([
      400,
      expect.stringContaining('roomName') as unknown,
    ]);
    expect(await refused({ hospitalId: fx.hospitalId, roomName: 'x'.repeat(51) })).toEqual([
      400,
      expect.stringContaining('roomName must be shorter than or equal to 50 characters') as unknown,
    ]);
    expect(await refused({ hospitalId: 'not-a-location', roomName: 'Bed 1' })).toEqual([
      400,
      expect.stringContaining('hospitalId') as unknown,
    ]);
    expect(await refused({ hospitalId: randomUUID(), roomName: 'Bed 1' })).toEqual([
      400,
      'Location not found or inactive',
    ]);
    await h.rawQuery(
      `UPDATE hospitals SET is_active = false WHERE id = $1::uuid`,
      fx.closingHospitalId,
    );
    expect(await refused({ hospitalId: fx.closingHospitalId, roomName: 'Bed 1' })).toEqual([
      400,
      'Location not found or inactive',
    ]);
    await h.rawQuery(
      `UPDATE hospitals SET is_active = true WHERE id = $1::uuid`,
      fx.closingHospitalId,
    );
  });

  it('edit: rename (never onto another room), switch off and on, not on under an inactive location', async () => {
    const bed = await h.ok('POST', '/rooms', {
      hospitalId: fx.closingHospitalId,
      roomName: `Bed 1 ${run}`,
    });
    const other = await h.ok('POST', '/rooms', {
      hospitalId: fx.closingHospitalId,
      roomName: `Bed 2 ${run}`,
    });
    const id = bed.id as string;

    expect(await h.ok('PUT', `/rooms/${id}`, { roomName: `Bed 1A ${run}` })).toMatchObject({
      roomCode: bed.roomCode,
      roomName: `Bed 1A ${run}`,
    });
    // Its own name again, in another case: fine. Another room's: refused.
    expect((await h.api('PUT', `/rooms/${id}`, { roomName: `BED 1A ${run}` })).status).toBe(200);
    const clash = await h.api('PUT', `/rooms/${id}`, { roomName: `bed 2 ${run}` });
    expect([clash.status, clash.body.message]).toEqual([
      409,
      `bed 2 ${run} already exists at this location (${other.roomCode as string}).`,
    ]);

    expect((await h.ok('PUT', `/rooms/${id}`, { isActive: false })).isActive).toBe(false);
    await h.rawQuery(
      `UPDATE hospitals SET is_active = false WHERE id = $1::uuid`,
      fx.closingHospitalId,
    );
    const reopen = await h.api('PUT', `/rooms/${id}`, { isActive: true });
    expect([reopen.status, reopen.body.message]).toEqual([
      400,
      'Location is inactive. Room cannot be activated.',
    ]);
    await h.rawQuery(
      `UPDATE hospitals SET is_active = true WHERE id = $1::uuid`,
      fx.closingHospitalId,
    );
    expect((await h.ok('PUT', `/rooms/${id}`, { isActive: true })).isActive).toBe(true);

    const trail = await h.rawQuery<{ action: string }>(
      `SELECT action FROM audit_logs WHERE entity_id = $1::uuid ORDER BY created_at`,
      id,
    );
    expect(trail.map((entry) => entry.action)).toEqual([
      'ROOM_CREATE',
      'ROOM_UPDATE',
      'ROOM_UPDATE',
      'ROOM_STATUS_CHANGE',
      'ROOM_STATUS_CHANGE',
    ]);

    // One room by id; an unknown one is not found.
    expect((await h.ok('GET', `/rooms/${id}`)).roomName).toBe(`BED 1A ${run}`);
    expect((await h.api('GET', `/rooms/${randomUUID()}`)).status).toBe(404);
    expect((await h.api('PUT', `/rooms/${randomUUID()}`, { isActive: false })).status).toBe(404);
  });

  it('list: search by code, name or location; filter by location and status', async () => {
    const list = async (query: string) => items(await h.ok('GET', `/rooms?limit=100&${query}`));
    const names = (rooms: Body[]) => rooms.map((room) => room.roomName).sort();

    expect(names(await list(`hospitalId=${fx.hospitalId}`))).toEqual([
      `2220 b ${run}`,
      `PG-ECO-06 (EWS) ${run}`,
    ]);
    expect(names(await list(`hospitalId=${fx.hospitalId}&isActive=true`))).toEqual([
      `PG-ECO-06 (EWS) ${run}`,
    ]);
    expect(names(await list(`search=${encodeURIComponent(`ews) ${run}`)}`))).toEqual([
      `PG-ECO-06 (EWS) ${run}`,
      `PG-ECO-06 (EWS) ${run}`,
    ]);
    const [byLocation] = await list(`search=${encodeURIComponent(`Int Rooms Saket ${run}`)}`);
    expect(byLocation?.hospital).toMatchObject({ id: fx.otherHospitalId });
    const code = byLocation!.roomCode as string;
    expect((await list(`search=${code}`)).map((room) => room.roomCode)).toEqual([code]);
    expect(
      (await list(`hospitalId=${fx.hospitalId}&sortBy=roomName&sortOrder=asc`)).map(
        (room) => room.roomName,
      ),
    ).toEqual([`2220 b ${run}`, `PG-ECO-06 (EWS) ${run}`]);
  });

  it('permissions: view, add and edit each need their own; another location is out of reach', async () => {
    const viewer = await userWith(fx.hospitalId, ['ROOM_VIEW']);
    const seen = await h.api('GET', '/rooms?limit=100', undefined, viewer);
    expect(seen.status).toBe(200);
    // Only their own location's rooms, even without asking for it.
    expect(new Set(items(seen.data).map((room) => (room.hospital as Body).id))).toEqual(
      new Set([fx.hospitalId]),
    );
    expect(
      (await h.api('GET', `/rooms?hospitalId=${fx.otherHospitalId}`, undefined, viewer)).status,
    ).toBe(403);
    expect(
      (await h.api('POST', '/rooms', { hospitalId: fx.hospitalId, roomName: 'X' }, viewer)).status,
    ).toBe(403);

    const [room] = items(await h.ok('GET', `/rooms?hospitalId=${fx.hospitalId}&limit=1`));
    expect(
      (await h.api('PUT', `/rooms/${room!.id as string}`, { isActive: true }, viewer)).status,
    ).toBe(403);
    const editor = await userWith(fx.hospitalId, ['ROOM_VIEW', 'ROOM_UPDATE']);
    expect(
      (await h.api('PUT', `/rooms/${room!.id as string}`, { isActive: true }, editor)).status,
    ).toBe(200);
    expect((await h.api('GET', '/rooms', undefined, '')).status).toBe(401);
  });

  it("a bed's QR: no sign-in, its location, and no longer valid once the bed is off", async () => {
    const bed = await h.ok('POST', '/rooms', {
      hospitalId: fx.hospitalId,
      roomName: `QR Bed ${run}`,
    });
    const qr = (id: string) => h.api('GET', `/qr/rooms/${id}`, undefined, '');

    const opened = await qr(bed.id as string);
    expect(opened.status).toBe(200);
    // This location has no restaurant with In Room Dining: nothing is offered.
    expect(opened.data).toEqual({
      locationAddress: 'Int Road, New Delhi, Delhi',
      locationName: `Int Rooms PPG ${run}`,
      restaurants: [],
      roomName: `QR Bed ${run}`,
    });

    await h.ok('PUT', `/rooms/${bed.id as string}`, { isActive: false });
    const off = await qr(bed.id as string);
    expect([off.status, off.body.message]).toEqual([404, 'This QR code is no longer valid.']);
    expect((await qr(randomUUID())).status).toBe(404);
    expect((await qr('not-a-room')).status).toBe(400);
  });

  it("tables: a restaurant's own, T- codes, a name once per restaurant, listed apart from rooms", async () => {
    // A location of its own, so the room lists above stay as they are.
    const hospitalId = await location('Tables');
    const restaurant = await h.ok('POST', '/restaurants', {
      hospitalId,
      restaurantName: `Int Tables ${run}`,
    });
    const second = await h.ok('POST', '/restaurants', {
      hospitalId,
      restaurantName: `Int Tables Two ${run}`,
    });
    const table = (restaurantId: string | undefined, roomName: string) =>
      h.api('POST', '/rooms', { hospitalId, restaurantId, roomName });

    const t5 = (await table(restaurant.id as string, 'T5')).data;
    expect(t5).toMatchObject({
      hospital: { id: hospitalId },
      restaurant: {
        atTableDining: false,
        id: restaurant.id,
        restaurantName: restaurant.restaurantName,
      },
      roomCode: expect.stringMatching(/^T-\d{6}$/) as unknown,
      roomName: 'T5',
    });
    // Once per restaurant; another restaurant there has its own T5, and so may a bed.
    const twice = await table(restaurant.id as string, 't5');
    expect([twice.status, twice.body.message]).toEqual([
      409,
      `t5 already exists at this restaurant (${t5.roomCode as string}).`,
    ]);
    expect((await table(second.id as string, 'T5')).status).toBe(201);
    const bed = (await table(undefined, 'T5')).data;
    expect(bed).toMatchObject({
      restaurant: null,
      roomCode: expect.stringMatching(/^R-/) as unknown,
    });

    // A restaurant must be at the table's location, and active.
    const elsewhere = await h.ok('POST', '/restaurants', {
      hospitalId: fx.otherHospitalId,
      restaurantName: `Int Tables Elsewhere ${run}`,
    });
    for (const restaurantId of [elsewhere.id as string, randomUUID()]) {
      const refused = await table(restaurantId, 'T9');
      expect([refused.status, refused.body.message]).toEqual([
        400,
        'Restaurant not found at this location or inactive',
      ]);
    }

    // Rooms and tables are listed apart; tables by restaurant too.
    const names = async (query: string) =>
      items(await h.ok('GET', `/rooms?limit=100&hospitalId=${hospitalId}&${query}`))
        .map((row) => `${row.roomName as string}@${(row.restaurantId as string | null) ?? '-'}`)
        .sort();
    expect(await names('kind=ROOM')).toEqual(['T5@-']);
    expect(await names('kind=TABLE')).toEqual(
      [`T5@${restaurant.id as string}`, `T5@${second.id as string}`].sort(),
    );
    expect(await names(`kind=TABLE&restaurantId=${second.id as string}`)).toEqual([
      `T5@${second.id as string}`,
    ]);
    expect((await h.api('GET', '/rooms?kind=DESK')).status).toBe(400);

    // Its QR: the restaurant's ordering, only while At Table Dining is on.
    const qr = (id: string) => h.api('GET', `/qr/tables/${id}`, undefined, '');
    const off = await qr(t5.id as string);
    expect([off.status, off.body.message]).toEqual([
      400,
      `${restaurant.restaurantName as string} does not take orders at the table. Please order at the counter.`,
    ]);
    await h.rawQuery(
      `UPDATE restaurants SET at_table_dining = true WHERE id = $1::uuid`,
      restaurant.id,
    );
    const opened = await qr(t5.id as string);
    expect([opened.status, opened.data]).toEqual([
      200,
      {
        restaurantId: restaurant.id,
        restaurantName: restaurant.restaurantName,
        tableName: 'T5',
        token: expect.any(String) as unknown,
      },
    ]);
    // A table is no bed and a bed no table; an inactive table's QR stops working.
    expect((await qr(bed.id as string)).status).toBe(404);
    expect((await h.api('GET', `/qr/rooms/${t5.id as string}`, undefined, '')).status).toBe(404);
    await h.ok('PUT', `/rooms/${t5.id as string}`, { isActive: false });
    expect((await qr(t5.id as string)).status).toBe(404);
  });
});
