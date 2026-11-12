// Characterisation of the organization-setup masters over HTTP: legal entities, hospitals
// (locations), locations (areas), stores, kitchens, restaurants, counters, POS devices, payment
// machines, time slots, employees and employee discounts. For each it pins create / read back /
// update / status change or delete, the conflict and validation messages, 401, 403 and 404, and
// how a user limited to one hospital is kept away from another hospital's records.
//
// Runs only with DATABASE_URL_TEST (migrated and seeded). Every record is named with `run`, so
// the suite never touches existing data and needs no cleanup.
import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  databaseUrl,
  firstOf,
  run,
  shape,
  startHarness,
  type Body,
  type Harness,
} from './testing/int-harness.js';

process.env.TZ = 'UTC';

const items = (data: Body) => data.items as Body[];
const idOf = (data: Body) => data.id as string;
const err = (result: { body: Body; status: number }) => [result.status, result.body.message];
const RUN = run.toUpperCase();

/** Every permission code of the masters this suite covers. */
const setupCodes = [
  'COUNTER',
  'EMPLOYEE',
  'EMPLOYEE_DISCOUNT',
  'HOSPITAL',
  'KITCHEN',
  'LOCATION',
  'PAYMENT_MACHINE',
  'POS_DEVICE',
  'RESTAURANT',
  'STORE',
  'TIME_SLOT',
]
  .flatMap((master) => ['VIEW', 'CREATE', 'UPDATE', 'DELETE'].map((a) => `${master}_${a}`))
  .filter((code) => code !== 'EMPLOYEE_DISCOUNT_DELETE');

describe.skipIf(!databaseUrl)(
  'organization setup masters (integration)',
  { timeout: 30_000 },
  () => {
    let h: Harness;
    /** A SINGLE-scope user at hospital A holding every setup permission. */
    let scoped = '';
    /** A user at hospital A whose role grants nothing. */
    let noPerms = '';
    /** A user at hospital A who may only view stores. */
    let storeViewer = '';
    const fx = {
      entityId: '',
      hospitalA: '',
      hospitalB: '',
      kitchenA: '',
      kitchenB: '',
      restaurantA: '',
      restaurantB: '',
      storeA: '',
      storeB: '',
    };

    const ids = async (path: string, as?: string) =>
      items(await h.ok('GET', path, undefined, as)).map(idOf);
    // Its Main Store or Main Kitchen (a location also gets a Counter Kitchen).
    const mainOf = async (master: 'kitchens' | 'stores', hospitalId: string) =>
      idOf(
        firstOf(
          items(await h.ok('GET', `/${master}?hospitalId=${hospitalId}`)).filter((record) =>
            String(record.kitchenName ?? record.storeName).startsWith('Main '),
          ),
        ),
      );
    const hospitalBody = (label: string, extra: Body = {}) => ({
      city: 'New Delhi',
      invoicePrefix: `I${label}${RUN}`,
      locationCode: `i${label}${run}`,
      state: 'Delhi',
      title: `Int Hospital ${label} ${run}`,
      ...extra,
    });
    const entityBody = (label: string) => ({
      entityAddress: `${label} Int Road ${run}`,
      entityName: `Int Entity ${label} ${run}`,
      gstNumber: '07AADCM0815B1ZQ',
      locationName: `Int Site ${label} ${run}`,
    });

    /** A user at `hospitalId` holding a role of its own with exactly `codes`. */
    async function userWith(label: string, codes: string[], hospitalId: string): Promise<string> {
      const [role] = await h.rawQuery<{ id: string }>(
        `INSERT INTO roles (id, name, location_scope, updated_at)
       VALUES (gen_random_uuid(), $1, 'SINGLE', now()) RETURNING id`,
        `Int ${label} ${run}`,
      );
      const granted = await h.rawQuery<{ id: string }>(
        `INSERT INTO role_permissions (id, role_id, permission_id, updated_at)
       SELECT gen_random_uuid(), $1::uuid, id, now() FROM permissions
       WHERE code = ANY($2::text[]) AND deleted_at IS NULL RETURNING id`,
        role!.id,
        codes,
      );
      expect(granted).toHaveLength(codes.length);
      const [user] = await h.rawQuery<{ id: string; sessionVersion: number }>(
        `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, now())
       RETURNING id, session_version AS "sessionVersion"`,
        `INT${label}${RUN}`.toUpperCase(),
        `Int ${label} User`,
        `6${randomInt(100_000_000, 1_000_000_000)}`,
        hospitalId,
      );
      await h.rawQuery(
        `INSERT INTO user_roles (id, user_id, role_id, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
        user!.id,
        role!.id,
      );
      return h.signFor(user!);
    }

    beforeAll(async () => {
      h = await startHarness();
      fx.entityId = idOf(await h.ok('POST', '/legal-entities', entityBody('Main')));
      fx.hospitalA = idOf(
        await h.ok('POST', '/hospitals', hospitalBody('A', { legalEntityId: fx.entityId })),
      );
      fx.hospitalB = idOf(await h.ok('POST', '/hospitals', hospitalBody('B')));
      // A new hospital comes with a Main Store, a Main Kitchen and a Counter Kitchen.
      fx.storeA = await mainOf('stores', fx.hospitalA);
      fx.storeB = await mainOf('stores', fx.hospitalB);
      fx.kitchenA = await mainOf('kitchens', fx.hospitalA);
      fx.kitchenB = await mainOf('kitchens', fx.hospitalB);
      fx.restaurantA = idOf(
        await h.ok('POST', '/restaurants', {
          hospitalId: fx.hospitalA,
          kitchenIds: [fx.kitchenA],
          restaurantName: `Int Cafe A ${run}`,
          storeId: fx.storeA,
        }),
      );
      fx.restaurantB = idOf(
        await h.ok('POST', '/restaurants', {
          hospitalId: fx.hospitalB,
          restaurantName: `Int Cafe B ${run}`,
        }),
      );
      scoped = await userWith('Scoped', setupCodes, fx.hospitalA);
      noPerms = await userWith('None', [], fx.hospitalA);
      storeViewer = await userWith('Viewer', ['STORE_VIEW'], fx.hospitalA);
    }, 60_000);

    afterAll(async () => {
      await h?.app.close();
    });

    it('legal entities: create, read back, update, refuse a repeat, validate, delete', async () => {
      const created = await h.api('POST', '/legal-entities', {
        ...entityBody('Two'),
        entityAddress: `  2 Int Road ${run}  `,
        gstNumber: '07 aadcm0815b1zq',
      });
      expect(created.status).toBe(201);
      // The GST number is stored without spaces and in capitals; text is trimmed.
      expect(created.data).toMatchObject({
        entityAddress: `2 Int Road ${run}`,
        gstNumber: '07AADCM0815B1ZQ',
        isActive: true,
      });
      expect(shape(created.body)).toMatchSnapshot('legal entity');
      const id = idOf(created.data);

      expect(await ids(`/legal-entities?search=${run}&limit=100`)).toEqual(
        expect.arrayContaining([id, fx.entityId]),
      );
      expect(await h.ok('GET', `/legal-entities/${id}`)).toMatchObject({ id, isActive: true });

      const updated = await h.ok('PUT', `/legal-entities/${id}`, {
        isActive: false,
        locationName: `Int Site Renamed ${run}`,
      });
      expect(updated).toMatchObject({ isActive: false });
      expect(String(updated.locationName).toLowerCase()).toBe(`int site renamed ${run}`);
      const inactive = await ids(`/legal-entities?search=${run}&isActive=false&limit=100`);
      expect(inactive).toContain(id);
      expect(inactive).not.toContain(fx.entityId);
      expect(
        await h.rawQuery(
          `SELECT action FROM audit_logs WHERE entity_id = $1::uuid ORDER BY created_at`,
          id,
        ),
      ).toEqual([{ action: 'LEGAL_ENTITY_CREATE' }, { action: 'LEGAL_ENTITY_STATUS_CHANGE' }]);

      // An inactive entity cannot be linked.
      expect(err(await h.api('PUT', `/hospitals/${fx.hospitalB}`, { legalEntityId: id }))).toEqual([
        400,
        'Choose an active entity',
      ]);

      // Only the same GST number at the same address is a repeat.
      const repeat = await h.api('POST', '/legal-entities', {
        ...entityBody('Main'),
        gstNumber: '07aadcm0815b1zq',
      });
      expect(err(repeat)).toEqual([
        409,
        'An entity with this GST number and address already exists',
      ]);
      expect(
        err(await h.api('PUT', `/legal-entities/${id}`, { entityAddress: `Main Int Road ${run}` })),
      ).toEqual([409, 'An entity with this GST number and address already exists']);
      expect(
        (await h.api('POST', '/legal-entities', { ...entityBody('Three'), entityName: 'Other Co' }))
          .status,
      ).toBe(201);

      expect(
        err(await h.api('POST', '/legal-entities', { ...entityBody('Bad'), gstNumber: 'GST123' })),
      ).toEqual([400, 'Enter a valid 15-character GST number, e.g. 07AADCM0815B1ZQ']);
      expect(
        err(
          await h.api('POST', '/legal-entities', { ...entityBody('Blank'), entityAddress: '  ' }),
        ),
      ).toEqual([400, 'Entity address is required']);
      expect(err(await h.api('POST', '/legal-entities', {}))).toMatchInlineSnapshot(`
      [
        400,
        "locationName must be shorter than or equal to 100 characters, locationName must be a string, locationName should not be empty, entityName must be shorter than or equal to 255 characters, entityName must be a string, entityName should not be empty, entityAddress must be shorter than or equal to 500 characters, entityAddress must be a string, entityAddress should not be empty, gstNumber must be shorter than or equal to 20 characters, gstNumber must be a string, gstNumber should not be empty",
      ]
    `);

      // An entity in use cannot be deleted; an unused one can, and is then not found.
      expect(err(await h.api('DELETE', `/legal-entities/${fx.entityId}`))).toEqual([
        400,
        'This entity is linked to locations, restaurants or POS devices. Change their entity first.',
      ]);
      expect(await h.ok('DELETE', `/legal-entities/${id}`)).toEqual({ id });
      expect(err(await h.api('GET', `/legal-entities/${id}`))).toEqual([404, 'Entity not found']);
      expect(await ids(`/legal-entities?search=${run}&limit=100`)).not.toContain(id);
    });

    it('hospitals: create with a Main Store and Main Kitchen, update, conflicts, validation, delete', async () => {
      const created = await h.api(
        'POST',
        '/hospitals',
        hospitalBody('C', { postalCode: '226010' }),
      );
      expect(created.status).toBe(201);
      const id = idOf(created.data);
      // Codes are put in capitals; title/locationCode/invoicePrefix mirror the stored names.
      expect(created.data).toMatchObject({
        billPrefix: `IC${RUN}`,
        gstApplicable: true,
        hospitalCode: `IC${RUN}`,
        invoicePrefix: `IC${RUN}`,
        isActive: true,
        legalEntityId: null,
        locationCode: `IC${RUN}`,
        onlinePaymentOption: 'NONE',
      });
      expect(created.data.title).toBe(created.data.hospitalName);
      expect(created.data.displayName).toBe(created.data.hospitalName);
      expect(shape(created.body)).toMatchSnapshot('hospital');
      const mainStore = await h.ok('GET', `/stores?hospitalId=${id}`);
      expect(items(mainStore).map((store) => store.storeName)).toEqual(['Main Store']);
      expect(String(firstOf(items(mainStore)).storeCode)).toMatch(/^STR\d{4,}$/);
      const mainKitchen = await h.ok('GET', `/kitchens?hospitalId=${id}`);
      expect(
        items(mainKitchen)
          .map((kitchen) => kitchen.kitchenName)
          .sort(),
      ).toEqual(['Counter Kitchen', 'Main Kitchen']);
      for (const kitchen of items(mainKitchen)) {
        expect(String(kitchen.kitchenCode)).toMatch(/^KIT\d{4,}$/);
      }

      expect(await ids(`/hospitals?search=${run}&limit=100`)).toEqual(
        expect.arrayContaining([id, fx.hospitalA, fx.hospitalB]),
      );
      expect(await h.ok('GET', `/hospitals/${id}`)).toMatchObject({ id, postalCode: '226010' });

      const updated = await h.ok('PUT', `/hospitals/${id}`, {
        city: 'Lucknow',
        isActive: false,
        postalCode: null,
      });
      // A null optional field clears it.
      expect(updated).toMatchObject({ city: 'Lucknow', isActive: false, postalCode: null });
      expect(await ids(`/hospitals?search=${run}&isActive=false&limit=100`)).toEqual([id]);
      // Nothing new can be set up at an inactive hospital.
      expect(
        err(await h.api('POST', '/stores', { hospitalId: id, storeName: `Int Store ${run}` })),
      ).toEqual([400, 'Hospital not found or inactive']);

      const codeOfA = `IA${RUN}`;
      expect(
        err(await h.api('POST', '/hospitals', hospitalBody('D', { locationCode: codeOfA }))),
      ).toEqual([409, 'Location code already exists']);
      expect(
        err(await h.api('POST', '/hospitals', hospitalBody('D', { invoicePrefix: codeOfA }))),
      ).toEqual([409, 'Invoice prefix already exists']);
      expect(err(await h.api('PUT', `/hospitals/${id}`, { locationCode: codeOfA }))).toEqual([
        409,
        'Location code already exists',
      ]);

      // Every DTO field is optional; the service asks for title, code, city and state itself.
      expect(err(await h.api('POST', '/hospitals', {}))).toEqual([400, 'Title is required']);
      expect(err(await h.api('POST', '/hospitals', hospitalBody('D', { city: ' ' })))).toEqual([
        400,
        'City is required',
      ]);
      expect(
        err(
          await h.api(
            'POST',
            '/hospitals',
            hospitalBody('D', {
              ipAddress: 'not-an-ip',
              onlinePaymentOption: 'CASH',
              postalCode: '1',
            }),
          ),
        ),
      ).toMatchInlineSnapshot(`
      [
        400,
        "postalCode must be a postal code, ipAddress must be an ip address, onlinePaymentOption must be one of the following values: NONE, PAYU, RAZORPAY",
      ]
    `);

      expect(await h.ok('DELETE', `/hospitals/${id}`)).toEqual({ id });
      expect(err(await h.api('GET', `/hospitals/${id}`))).toEqual([404, 'Location not found']);
      // Its stores and kitchens go with it.
      expect(err(await h.api('GET', `/stores/${idOf(firstOf(items(mainStore)))}`))).toEqual([
        404,
        'Store not found',
      ]);
      expect(err(await h.api('GET', `/kitchens/${idOf(firstOf(items(mainKitchen)))}`))).toEqual([
        404,
        'Kitchen not found',
      ]);
      // A deleted hospital keeps its code: the database refuses it, with a different message.
      expect(err(await h.api('POST', '/hospitals', hospitalBody('C')))).toEqual([
        409,
        'Location already exists',
      ]);
    });

    it('locations (areas): create, read back, update, no name rule, validation, delete', async () => {
      const body = {
        building: 'Block A',
        floor: '2',
        hospitalId: fx.hospitalA,
        locationName: `Int Wing ${run}`,
      };
      const created = await h.api('POST', '/locations', body);
      expect(created.status).toBe(201);
      expect(created.data).toMatchObject({ building: 'Block A', floor: '2', isActive: true });
      expect(shape(created.body)).toMatchSnapshot('location');
      const id = idOf(created.data);

      expect(await ids(`/locations?hospitalId=${fx.hospitalA}&search=${run}`)).toContain(id);
      expect(await ids(`/locations?hospitalId=${fx.hospitalB}&search=${run}`)).not.toContain(id);
      expect(await h.ok('GET', `/locations/${id}`)).toMatchObject({ id });
      expect(await h.ok('PUT', `/locations/${id}`, { floor: '3', isActive: false })).toMatchObject({
        floor: '3',
        isActive: false,
      });
      expect(await ids(`/locations?search=${run}&isActive=false`)).toContain(id);

      // Nothing stops a second area of the same name at the same hospital.
      expect((await h.api('POST', '/locations', body)).status).toBe(201);

      expect(err(await h.api('POST', '/locations', { ...body, hospitalId: randomUUID() }))).toEqual(
        [400, 'Hospital not found or inactive'],
      );
      expect(err(await h.api('POST', '/locations', {}))).toMatchInlineSnapshot(`
      [
        400,
        "hospitalId must be a UUID, locationName must be shorter than or equal to 255 characters, locationName must be a string, locationName should not be empty",
      ]
    `);

      expect(await h.ok('DELETE', `/locations/${id}`)).toEqual({ id });
      expect(err(await h.api('GET', `/locations/${id}`))).toEqual([404, 'Location not found']);
    });

    it('stores: create with a generated code, read back, update, code conflict, validation, delete', async () => {
      const area = idOf(
        await h.ok('POST', '/locations', {
          hospitalId: fx.hospitalA,
          locationName: `Int Store Area ${run}`,
        }),
      );
      const created = await h.api('POST', '/stores', {
        hospitalId: fx.hospitalA,
        locationId: area,
        storeCode: 'IGNORED',
        storeName: `Int Store ${run}`,
        storeType: 'Dry',
      });
      expect(created.status).toBe(201);
      // The code is always generated; one sent on create is ignored.
      expect(String(created.data.storeCode)).toMatch(/^STR\d{4,}$/);
      expect(created.data).toMatchObject({
        hospitalId: fx.hospitalA,
        isActive: true,
        locationId: area,
        storeType: 'Dry',
      });
      expect(shape(created.body)).toMatchSnapshot('store');
      const id = idOf(created.data);

      expect(await ids(`/stores?hospitalId=${fx.hospitalA}&search=${run}`)).toEqual(
        expect.arrayContaining([id, fx.storeA]),
      );
      expect(await ids(`/stores?locationId=${area}`)).toEqual([id]);
      expect(await h.ok('GET', `/stores/${id}`)).toMatchObject({ id, storeType: 'Dry' });

      const updated = await h.ok('PUT', `/stores/${id}`, {
        isActive: false,
        storeCode: `s${run}`,
        storeType: 'Cold',
      });
      expect(updated).toMatchObject({ isActive: false, storeCode: `S${RUN}`, storeType: 'Cold' });
      expect(await ids(`/stores?hospitalId=${fx.hospitalA}&isActive=false`)).toContain(id);
      expect(await ids(`/stores?hospitalId=${fx.hospitalA}&isActive=true`)).not.toContain(id);

      // Store names are not unique; codes are, within a hospital.
      expect(
        (
          await h.api('POST', '/stores', {
            hospitalId: fx.hospitalA,
            storeName: `Int Store ${run}`,
          })
        ).status,
      ).toBe(201);
      const mainCode = (await h.ok('GET', `/stores/${fx.storeA}`)).storeCode;
      expect(err(await h.api('PUT', `/stores/${id}`, { storeCode: mainCode }))).toEqual([
        409,
        'Store code already exists within hospital',
      ]);
      expect(err(await h.api('PUT', `/stores/${id}`, { storeCode: ' ' }))).toMatchInlineSnapshot(`
      [
        400,
        "storeCode should not be empty",
      ]
    `);

      // An area of another hospital cannot be used.
      const areaB = idOf(
        await h.ok('POST', '/locations', {
          hospitalId: fx.hospitalB,
          locationName: `Int Area B ${run}`,
        }),
      );
      expect(
        err(
          await h.api('POST', '/stores', {
            hospitalId: fx.hospitalA,
            locationId: areaB,
            storeName: `Int Store ${run}`,
          }),
        ),
      ).toEqual([400, 'Location not found or inactive']);
      expect(err(await h.api('POST', '/stores', {}))).toMatchInlineSnapshot(`
      [
        400,
        "hospitalId must be a UUID, storeName must be shorter than or equal to 255 characters, storeName must be a string, storeName should not be empty",
      ]
    `);
      expect(
        err(await h.api('POST', '/stores', { hospitalId: fx.hospitalA, storeName: 'X', extra: 1 })),
      ).toEqual([400, 'property extra should not exist']);

      expect(await h.ok('DELETE', `/stores/${id}`)).toEqual({ id });
      expect(err(await h.api('GET', `/stores/${id}`))).toEqual([404, 'Store not found']);
      expect(await ids(`/stores?hospitalId=${fx.hospitalA}&search=${run}&limit=100`)).not.toContain(
        id,
      );
    });

    it('kitchens: create with a generated code, read back, update, code conflict, validation, delete', async () => {
      const created = await h.api('POST', '/kitchens', {
        closingTime: '22:00',
        hospitalId: fx.hospitalA,
        kitchenCode: 'IGNORED',
        kitchenName: `Int Kitchen ${run}`,
        openingTime: '06:00',
      });
      expect(created.status).toBe(201);
      expect(String(created.data.kitchenCode)).toMatch(/^KIT\d{4,}$/);
      expect(created.data).toMatchObject({
        closingTime: '22:00',
        isActive: true,
        openingTime: '06:00',
      });
      expect(shape(created.body)).toMatchSnapshot('kitchen');
      const id = idOf(created.data);

      expect(await ids(`/kitchens?hospitalId=${fx.hospitalA}&search=${run}`)).toEqual(
        expect.arrayContaining([id, fx.kitchenA]),
      );
      expect(await ids(`/kitchens?hospitalId=${fx.hospitalB}&search=${run}`)).not.toContain(id);
      expect(await h.ok('GET', `/kitchens/${id}`)).toMatchObject({ id });
      expect(
        await h.ok('PUT', `/kitchens/${id}`, { closingTime: '23:30', isActive: false }),
      ).toMatchObject({ closingTime: '23:30', isActive: false });
      expect(await ids(`/kitchens?hospitalId=${fx.hospitalA}&isActive=false`)).toContain(id);

      const mainCode = (await h.ok('GET', `/kitchens/${fx.kitchenA}`)).kitchenCode;
      expect(err(await h.api('PUT', `/kitchens/${id}`, { kitchenCode: mainCode }))).toEqual([
        409,
        'Kitchen code already exists within hospital',
      ]);
      expect(
        err(
          await h.api('POST', '/kitchens', {
            hospitalId: fx.hospitalA,
            kitchenName: 'X',
            openingTime: '7:00',
          }),
        ),
      ).toEqual([400, 'openingTime must use HH:mm format.']);
      expect(err(await h.api('POST', '/kitchens', {}))).toMatchInlineSnapshot(`
      [
        400,
        "hospitalId must be a UUID, kitchenName must be shorter than or equal to 255 characters, kitchenName must be a string, kitchenName should not be empty",
      ]
    `);

      expect(await h.ok('DELETE', `/kitchens/${id}`)).toEqual({ id });
      expect(err(await h.api('GET', `/kitchens/${id}`))).toEqual([404, 'Kitchen not found']);
    });

    it('restaurants: create with store, kitchens and entity, read back, update, conflicts, validation, delete', async () => {
      const created = await h.api('POST', '/restaurants', {
        gstNumber: ' 07aadcm0815b1zq ',
        hospitalId: fx.hospitalA,
        isTakeawayEnabled: true,
        kitchenIds: [fx.kitchenA],
        legalEntityId: fx.entityId,
        mobile: '9876543210',
        restaurantCode: 'IGNORED',
        restaurantName: `Int Restaurant ${run}`,
        shiftTimings: [{ endTime: '15:00', name: 'Morning', startTime: '07:00' }],
        storeId: fx.storeA,
      });
      expect(created.status).toBe(201);
      expect(String(created.data.restaurantCode)).toMatch(/^RST\d{4,}$/);
      // Old and new flag names are both returned and always agree.
      expect(created.data).toMatchObject({
        gstNumber: '07AADCM0815B1ZQ',
        hospitalId: fx.hospitalA,
        isActive: true,
        isTakeawayEnabled: true,
        kitchenId: fx.kitchenA,
        kitchenIds: [fx.kitchenA],
        legalEntityId: fx.entityId,
        shiftTimings: [{ endTime: '15:00', name: 'Morning', startTime: '07:00' }],
        storeId: fx.storeA,
        takeaway: true,
      });
      expect(shape(created.body)).toMatchSnapshot('restaurant');
      const id = idOf(created.data);

      expect(await ids(`/restaurants?search=${run}&limit=100`)).toEqual(
        expect.arrayContaining([id, fx.restaurantA, fx.restaurantB]),
      );
      expect(await ids(`/restaurants?hospitalId=${fx.hospitalA}&kitchenId=${fx.kitchenA}`)).toEqual(
        expect.arrayContaining([id, fx.restaurantA]),
      );
      expect(await ids(`/restaurants?storeId=${fx.storeA}`)).toEqual(
        expect.arrayContaining([id, fx.restaurantA]),
      );
      expect(await h.ok('GET', `/restaurants/${id}`)).toMatchObject({ id, mobile: '9876543210' });
      const counter = idOf(
        await h.ok('POST', '/counters', {
          counterCode: `RD${run}`,
          counterName: `Int Counter ${run}`,
          hospitalId: fx.hospitalA,
          restaurantId: id,
        }),
      );

      // An empty kitchen list unlinks every kitchen; null clears an optional text field.
      const updated = await h.ok('PUT', `/restaurants/${id}`, {
        isActive: false,
        kitchenIds: [],
        mobile: null,
      });
      expect(updated).toMatchObject({
        isActive: false,
        kitchenId: null,
        kitchenIds: [],
        mobile: null,
      });
      expect(await ids(`/restaurants?hospitalId=${fx.hospitalA}&isActive=false`)).toContain(id);

      const codeOfA = (await h.ok('GET', `/restaurants/${fx.restaurantA}`)).restaurantCode;
      expect(err(await h.api('PUT', `/restaurants/${id}`, { restaurantCode: codeOfA }))).toEqual([
        409,
        'Restaurant code already exists within hospital',
      ]);
      // Restaurant names are not unique.
      expect(
        (
          await h.api('POST', '/restaurants', {
            hospitalId: fx.hospitalA,
            restaurantName: `Int Restaurant ${run}`,
          })
        ).status,
      ).toBe(201);

      const base = { hospitalId: fx.hospitalA, restaurantName: `Int Bad ${run}` };
      expect(err(await h.api('POST', '/restaurants', { ...base, storeId: fx.storeB }))).toEqual([
        400,
        'Store not found or inactive',
      ]);
      expect(
        err(await h.api('POST', '/restaurants', { ...base, kitchenIds: [fx.kitchenB] })),
      ).toEqual([400, 'One or more kitchens were not found for selected hospital']);
      expect(
        err(
          await h.api('POST', '/restaurants', {
            ...base,
            gstNumber: 'GST123',
            ifscCode: 'HDFC1234',
            mobile: '12345',
            panNumber: 'X',
          }),
        ),
      ).toMatchInlineSnapshot(`
      [
        400,
        "mobile must be a 10 digit number., gstNumber must be a valid 15-character GSTIN., panNumber must be a valid 10-character PAN., ifscCode must be a valid 11-character IFSC code.",
      ]
    `);
      expect(err(await h.api('POST', '/restaurants', {}))).toMatchInlineSnapshot(`
      [
        400,
        "hospitalId must be a UUID, restaurantName must be shorter than or equal to 255 characters, restaurantName must be a string, restaurantName should not be empty",
      ]
    `);

      // Deleting a restaurant deletes its counters.
      expect(await h.ok('DELETE', `/restaurants/${id}`)).toEqual({ id });
      expect(err(await h.api('GET', `/restaurants/${id}`))).toEqual([404, 'Restaurant not found']);
      expect(err(await h.api('GET', `/counters/${counter}`))).toEqual([404, 'Counter not found']);
    });

    it('counters: create, read back, update, code unique per restaurant, validation, delete', async () => {
      const body = {
        counterCode: `c${run}`,
        counterName: `Int Counter ${run}`,
        hospitalId: fx.hospitalA,
        restaurantId: fx.restaurantA,
      };
      const created = await h.api('POST', '/counters', body);
      expect(created.status).toBe(201);
      expect(created.data).toMatchObject({ counterCode: `C${RUN}`, isActive: true });
      expect(shape(created.body)).toMatchSnapshot('counter');
      const id = idOf(created.data);

      expect(await ids(`/counters?restaurantId=${fx.restaurantA}&search=${run}`)).toEqual([id]);
      expect(await ids(`/counters?hospitalId=${fx.hospitalB}&search=${run}`)).toEqual([]);
      expect(await h.ok('GET', `/counters/${id}`)).toMatchObject({ id });
      expect(
        await h.ok('PUT', `/counters/${id}`, { isActive: false, posDeviceId: 'TILL-1' }),
      ).toMatchObject({ isActive: false, posDeviceId: 'TILL-1' });
      expect(await ids(`/counters?restaurantId=${fx.restaurantA}&isActive=false`)).toContain(id);

      // The code is unique within a restaurant, in any case; another restaurant may reuse it.
      expect(err(await h.api('POST', '/counters', { ...body, counterCode: `C${RUN}` }))).toEqual([
        409,
        'Counter code already exists within restaurant',
      ]);
      expect(
        (
          await h.api('POST', '/counters', {
            ...body,
            hospitalId: fx.hospitalB,
            restaurantId: fx.restaurantB,
          })
        ).status,
      ).toBe(201);
      // A restaurant of another hospital cannot be used.
      expect(
        err(await h.api('POST', '/counters', { ...body, restaurantId: fx.restaurantB })),
      ).toEqual([400, 'Restaurant not found or inactive']);
      expect(err(await h.api('POST', '/counters', {}))).toMatchInlineSnapshot(`
      [
        400,
        "hospitalId must be a UUID, restaurantId must be a UUID, counterCode must be shorter than or equal to 50 characters, counterCode must be a string, counterCode should not be empty, counterName must be shorter than or equal to 150 characters, counterName must be a string, counterName should not be empty",
      ]
    `);

      expect(await h.ok('DELETE', `/counters/${id}`)).toEqual({ id });
      expect(err(await h.api('GET', `/counters/${id}`))).toEqual([404, 'Counter not found']);
    });

    it('POS devices: create with restaurants, read back, update, code and host-name conflicts, entity rule, delete', async () => {
      const body = {
        code: `POS-${run}`,
        hospitalId: fx.hospitalA,
        hostName: `int-${run}`,
        isKotPrintEnabled: true,
        name: `Int Till ${run}`,
        restaurantIds: [fx.restaurantA],
      };
      const created = await h.api('POST', '/pos-devices', body);
      expect(created.status).toBe(201);
      expect(created.data).toMatchObject({
        code: `POS-${run}`,
        hostName: `int-${run}`,
        isActive: true,
        isInvoicePrintEnabled: false,
        isKotPrintEnabled: true,
        legalEntityId: null,
        restaurantIds: [fx.restaurantA],
      });
      expect(shape(created.body)).toMatchSnapshot('pos device');
      const id = idOf(created.data);
      const name = String(created.data.name);

      expect(await ids(`/pos-devices?restaurantId=${fx.restaurantA}&search=${run}`)).toEqual([id]);
      expect(await ids(`/pos-devices?hostName=int-${run}`)).toEqual([id]);
      expect(await h.ok('GET', `/pos-devices/${id}`)).toMatchObject({ id });
      expect(
        await h.ok('PUT', `/pos-devices/${id}`, { isActive: false, isInvoicePrintEnabled: true }),
      ).toMatchObject({ isActive: false, isInvoicePrintEnabled: true });
      expect(await ids(`/pos-devices?hospitalId=${fx.hospitalA}&isActive=false`)).toContain(id);

      // The code is unique per hospital; the host name across every hospital.
      expect(err(await h.api('POST', '/pos-devices', { ...body, hostName: undefined }))).toEqual([
        409,
        'POS device code already exists for this location',
      ]);
      const cafe = String((await h.ok('GET', `/restaurants/${fx.restaurantA}`)).restaurantName);
      expect(
        err(
          await h.api('POST', '/pos-devices', {
            ...body,
            code: `OTHER-${run}`,
            hospitalId: fx.hospitalB,
            restaurantIds: [],
          }),
        ),
      ).toEqual([409, `Host name int-${run} is already tagged to ${cafe} (POS device ${name})`]);
      expect(
        (
          await h.api('POST', '/pos-devices', {
            ...body,
            hospitalId: fx.hospitalB,
            hostName: undefined,
            restaurantIds: [],
          })
        ).status,
      ).toBe(201);

      expect(
        err(
          await h.api('POST', '/pos-devices', {
            ...body,
            code: `X-${run}`,
            hostName: undefined,
            restaurantIds: [fx.restaurantB],
          }),
        ),
      ).toEqual([400, 'One or more restaurants do not belong to selected location']);
      expect(
        err(
          await h.api('POST', '/pos-devices', { ...body, hostName: 'bad_host', name: 'Till #1' }),
        ),
      ).toMatchInlineSnapshot(`
      [
        400,
        "Use letters, numbers, spaces, dots, hyphens or underscores only., Enter a valid host name: letters, numbers and hyphens, with dots between parts (e.g. MAX-LKO-POS-01).",
      ]
    `);
      expect(err(await h.api('POST', '/pos-devices', {}))).toMatchInlineSnapshot(`
      [
        400,
        "hospitalId must be a UUID, name must be shorter than or equal to 150 characters, Use letters, numbers, spaces, dots, hyphens or underscores only., name must be a string, code must be shorter than or equal to 50 characters, Use letters, numbers, spaces, dots, hyphens or underscores only., code must be a string",
      ]
    `);

      // A device bills for one legal entity: it cannot serve a restaurant of another.
      const other = idOf(await h.ok('POST', '/legal-entities', entityBody('Pos')));
      const mismatch = await h.api('POST', '/pos-devices', {
        ...body,
        code: `ENT-${run}`,
        hostName: undefined,
        legalEntityId: other,
      });
      expect(mismatch.status).toBe(400);
      expect(String(mismatch.body.message)).toMatch(
        /bills under .* but .* belongs to .*A POS device can only serve restaurants of its own legal entity/,
      );

      expect(await h.ok('DELETE', `/pos-devices/${id}`)).toEqual({ id });
      expect(err(await h.api('GET', `/pos-devices/${id}`))).toEqual([404, 'POS device not found']);
    });

    it('payment machines: create, masked token, one default per device, update, validation, delete', async () => {
      const device = idOf(
        await h.ok('POST', '/pos-devices', {
          code: `PM-${run}`,
          hospitalId: fx.hospitalA,
          name: `Int Pay Till ${run}`,
        }),
      );
      const body = {
        hospitalId: fx.hospitalA,
        isDefault: true,
        name: `Int EDC One ${run}`,
        pinelabSecurityToken: 'secret-token-1234',
        posDeviceId: device,
        primaryUpi: 'PHONEPE',
        serialNumber: '12345',
      };
      const created = await h.api('POST', '/payment-machines', body);
      expect(created.status).toBe(201);
      // The token is never returned, only its last four characters.
      expect(created.data).toMatchObject({
        hasPinelabSecurityToken: true,
        isActive: true,
        isDefault: true,
        pinelabSecurityToken: '••••1234',
        posDeviceId: device,
        primaryUpi: 'PHONEPE',
        serialNumber: '12345',
      });
      expect(shape(created.body)).toMatchSnapshot('payment machine');
      const first = idOf(created.data);
      // ...but it is stored as sent (the DTO notes production should move it to a vault).
      expect(
        await h.rawQuery(
          `SELECT pinelab_security_token AS token FROM payment_machines WHERE id = $1::uuid`,
          first,
        ),
      ).toEqual([{ token: 'secret-token-1234' }]);

      // A second default takes over: the first one is demoted. Names need not be unique.
      const second = idOf(await h.ok('POST', '/payment-machines', body));
      expect((await h.ok('GET', `/payment-machines/${first}`)).isDefault).toBe(false);
      expect(await ids(`/payment-machines?posDeviceId=${device}&isDefault=true`)).toEqual([second]);
      expect(await ids(`/payment-machines?search=${run}&posDeviceId=${device}`)).toEqual(
        expect.arrayContaining([first, second]),
      );

      expect(
        await h.ok('PUT', `/payment-machines/${first}`, { isActive: false, serialNumber: '' }),
      ).toMatchObject({ isActive: false, serialNumber: '' });
      expect(await ids(`/payment-machines?posDeviceId=${device}&isActive=false`)).toEqual([first]);

      const deviceB = idOf(
        await h.ok('POST', '/pos-devices', {
          code: `PM-${run}`,
          hospitalId: fx.hospitalB,
          name: `Int Pay Till ${run}`,
        }),
      );
      expect(
        err(await h.api('POST', '/payment-machines', { ...body, posDeviceId: deviceB })),
      ).toEqual([400, 'POS device not found for selected location']);
      expect(
        err(
          await h.api('POST', '/payment-machines', {
            ...body,
            pinelabImei: 'IMEI 1',
            primaryUpi: 'CASH',
            serialNumber: 'AB12',
          }),
        ),
      ).toMatchInlineSnapshot(`
      [
        400,
        "Use digits only., Use letters, numbers or hyphens only., primaryUpi must be one of the following values: PHONEPE, UPI_PAYTM, UPI_SALE, UPI_BHARAT_QR, BHARATPE, GOOGLE_PAY, OTHER",
      ]
    `);
      expect(err(await h.api('POST', '/payment-machines', {}))).toMatchInlineSnapshot(`
      [
        400,
        "hospitalId must be a UUID, posDeviceId must be a UUID, name must be shorter than or equal to 150 characters, name must be a string, name should not be empty",
      ]
    `);

      expect(await h.ok('DELETE', `/payment-machines/${second}`)).toEqual({ id: second });
      expect(err(await h.api('GET', `/payment-machines/${second}`))).toEqual([
        404,
        'Payment machine not found',
      ]);
    });

    it('time slots: shared or per hospital, read back, update, name conflict, validation; delete fails', async () => {
      const created = await h.api('POST', '/time-slots', {
        endTime: '10:00',
        hospitalId: fx.hospitalA,
        slotName: `Int Breakfast ${run}`,
        startTime: '07:00',
      });
      expect(created.status).toBe(201);
      expect(created.data).toMatchObject({
        endTime: '10:00',
        hospitalId: fx.hospitalA,
        isActive: true,
        isAlwaysAvailable: false,
        startTime: '07:00',
      });
      expect(shape(created.body)).toMatchSnapshot('time slot');
      const id = idOf(created.data);
      // Always available: the times are dropped. No hospital: shared by every hospital.
      const shared = await h.ok('POST', '/time-slots', {
        endTime: '10:00',
        isAlwaysAvailable: true,
        slotName: `Int Anytime ${run}`,
        startTime: '07:00',
      });
      expect(shared).toMatchObject({
        endTime: null,
        hospital: null,
        hospitalId: null,
        startTime: null,
      });

      expect(await ids(`/time-slots?hospitalId=${fx.hospitalA}&search=${run}`)).toEqual(
        expect.arrayContaining([id, idOf(shared)]),
      );
      expect(await ids(`/time-slots?hospitalId=${fx.hospitalB}&search=${run}`)).toEqual([
        idOf(shared),
      ]);
      expect(await h.ok('GET', `/time-slots/${id}`)).toMatchObject({ id });
      expect(
        await h.ok('PUT', `/time-slots/${id}`, { endTime: '11:00', isActive: false }),
      ).toMatchObject({ endTime: '11:00', isActive: false });
      expect(await ids(`/time-slots?search=${run}&isActive=false`)).toEqual([id]);

      // The name is unique across every hospital, ignoring case.
      expect(
        err(
          await h.api('POST', '/time-slots', {
            isAlwaysAvailable: true,
            slotName: `INT BREAKFAST ${RUN}`,
          }),
        ),
      ).toEqual([409, 'Time slot already exists']);
      expect(
        err(
          await h.api('POST', '/time-slots', {
            endTime: '07:00',
            slotName: `Int Backwards ${run}`,
            startTime: '09:00',
          }),
        ),
      ).toEqual([400, 'End time must be after start time']);
      expect(err(await h.api('POST', '/time-slots', { slotName: `Int No Times ${run}` })))
        .toMatchInlineSnapshot(`
      [
        400,
        "startTime must use HH:mm format, startTime must be a string, startTime should not be empty, endTime must use HH:mm format, endTime must be a string, endTime should not be empty",
      ]
    `);
      expect(err(await h.api('POST', '/time-slots', {}))).toMatchInlineSnapshot(`
      [
        400,
        "slotName must be shorter than or equal to 100 characters, slotName must be a string, slotName should not be empty, startTime must use HH:mm format, startTime must be a string, startTime should not be empty, endTime must use HH:mm format, endTime must be a string, endTime should not be empty",
      ]
    `);

      // Menus keep their own on-sale times (20261009170000_restaurant_menu_own_times), so no menu
      // holds a slot back: a slot is deleted, and a shared one moved to a hospital, freely.
      expect(
        (await h.ok('PUT', `/time-slots/${idOf(shared)}`, { hospitalId: fx.hospitalA })).hospitalId,
      ).toBe(fx.hospitalA);
      expect(await h.ok('DELETE', `/time-slots/${id}`)).toEqual({ id });
      expect((await h.api('GET', `/time-slots/${id}`)).status).toBe(404);
    });

    it('employees: create, read back, validate by code, update, code conflict, validation, import, delete', async () => {
      const created = await h.api('POST', '/employees', {
        department: 'Nursing',
        employeeCode: `e${run}`,
        employeeName: `Int Nurse ${run}`,
        employmentType: 'ON_ROLL',
        hospitalId: fx.hospitalA,
      });
      expect(created.status).toBe(201);
      expect(created.data).toMatchObject({
        department: 'Nursing',
        eligibleForDiscount: true,
        employeeCode: `E${RUN}`,
        employmentType: 'ON_ROLL',
        hospitalId: fx.hospitalA,
        isActive: true,
      });
      expect(shape(created.body)).toMatchSnapshot('employee');
      const id = idOf(created.data);

      expect(await ids(`/employees?search=${run}`)).toContain(id);
      expect(await ids(`/employees?hospitalId=${fx.hospitalB}&search=${run}`)).not.toContain(id);
      expect(await h.ok('GET', `/employees/${id}`)).toMatchObject({ id });
      const validated = await h.ok('GET', `/employees/validate/E${RUN}`);
      expect(validated).toMatchObject({ employeeCode: `E${RUN}`, employeeId: id, isActive: true });
      expect(shape(validated)).toMatchSnapshot('employee validation');

      expect(
        await h.ok('PUT', `/employees/${id}`, { designation: 'Sister', isActive: false }),
      ).toMatchObject({ designation: 'Sister', isActive: false });
      expect(await ids(`/employees?search=${run}&isActive=false`)).toContain(id);
      expect(err(await h.api('GET', `/employees/validate/E${RUN}`))).toEqual([
        404,
        'Employee not found or inactive',
      ]);

      expect(
        err(
          await h.api('POST', '/employees', {
            employeeCode: `E${RUN}`,
            employeeName: 'Someone',
            employmentType: 'OUTSOURCED',
          }),
        ),
      ).toEqual([409, 'Employee code already exists']);

      // Left without a code, an employee gets the next free EMP code from the sequence.
      const uncoded = await h.ok('POST', '/employees', {
        birthDate: '1990-04-12',
        employeeName: `Int Uncoded ${run}`,
        employmentType: 'OUTSOURCED',
        gender: 'FEMALE',
        hospitalId: fx.hospitalA,
        officialEmail: `uncoded.${run}@example.com`,
        reportingManagerId: id,
      });
      expect(uncoded).toMatchObject({
        birthDate: '1990-04-12',
        employeeCode: expect.stringMatching(/^EMP\d{4,}$/) as unknown,
        gender: 'FEMALE',
        reportingManager: { id },
      });
      // Their manager cannot then report to them.
      expect(
        err(await h.api('PUT', `/employees/${id}`, { reportingManagerId: idOf(uncoded) })),
      ).toEqual([
        400,
        'An employee cannot report to themselves or to someone who reports to them.',
      ]);

      expect(
        err(
          await h.api('POST', '/employees', {
            employeeCode: `T${RUN}`,
            employeeName: 'Someone',
            employmentType: 'TEMP',
          }),
        ),
      ).toMatchInlineSnapshot(`
      [
        400,
        "employmentType must be one of the following values: ON_ROLL, OUTSOURCED",
      ]
    `);
      expect(err(await h.api('POST', '/employees', {}))).toMatchInlineSnapshot(`
        [
          400,
          "employeeName must be shorter than or equal to 255 characters, employeeName must be a string, employeeName should not be empty, employmentType must be one of the following values: ON_ROLL, OUTSOURCED",
        ]
      `);

      // Import: a dry run reports and saves nothing; a bad row stops the whole file.
      const rows = [
        {
          employeeCode: `IM${run}`,
          employeeName: `Int Imported ${run}`,
          employmentType: 'Outsourced',
          locationCode: `IA${RUN}`,
        },
      ];
      const dry = await h.ok('POST', '/employees/import', { dryRun: true, rows });
      expect(dry).toEqual({
        created: 1,
        imported: false,
        rows: [{ action: 'create', errors: [] }],
        skipped: 0,
        updated: 0,
      });
      expect(await ids(`/employees?search=IM${run}`)).toEqual([]);
      const refused = await h.ok('POST', '/employees/import', {
        dryRun: false,
        rows: [...rows, { employeeCode: `IN${run}`, employmentType: 'Temp' }],
      });
      expect(refused).toMatchObject({ created: 1, imported: false });
      expect(refused.rows).toMatchInlineSnapshot(`
      [
        {
          "action": "create",
          "errors": [],
        },
        {
          "action": "create",
          "errors": [
            "Employee name is required",
            "Employment type must be On-Role or Off-Role",
          ],
        },
      ]
    `);
      expect(await ids(`/employees?search=IM${run}`)).toEqual([]);
      expect(await h.ok('POST', '/employees/import', { dryRun: false, rows })).toMatchObject({
        created: 1,
        imported: true,
      });
      const imported = firstOf(items(await h.ok('GET', `/employees?search=IM${run}`)));
      expect(imported).toMatchObject({
        employeeCode: `IM${RUN}`,
        employmentType: 'OUTSOURCED',
        hospitalId: fx.hospitalA,
      });
      expect(err(await h.api('POST', '/employees/import', { dryRun: true, rows: [] }))).toEqual([
        400,
        'The file has no rows to import',
      ]);

      expect(await h.ok('DELETE', `/employees/${id}`)).toEqual({ id });
      expect(err(await h.api('GET', `/employees/${id}`))).toEqual([404, 'Employee not found']);
    });

    it('employee discounts: create, read back, update, archive and restore, validation (no delete)', async () => {
      const body = {
        daysOfWeek: ['MONDAY', 'FRIDAY'],
        discountPercent: 12.5,
        employmentType: 'ON_ROLL',
        endTime: '15:00',
        name: `Int Lunch Offer ${run}`,
        restaurantId: fx.restaurantA,
        startTime: '12:00',
      };
      const created = await h.api('POST', '/employee-discounts', body);
      expect(created.status).toBe(201);
      // The hospital comes from the restaurant.
      expect(created.data).toMatchObject({
        archivedAt: null,
        daysOfWeek: ['MONDAY', 'FRIDAY'],
        discountPercent: 12.5,
        hospitalId: fx.hospitalA,
        restaurantId: fx.restaurantA,
      });
      expect(shape(created.body)).toMatchSnapshot('employee discount');
      const id = idOf(created.data);

      expect(await ids(`/employee-discounts?restaurantId=${fx.restaurantA}&search=${run}`)).toEqual(
        [id],
      );
      expect(await ids(`/employee-discounts?hospitalId=${fx.hospitalB}&search=${run}`)).toEqual([]);
      expect(await h.ok('GET', `/employee-discounts/${id}`)).toMatchObject({ id });
      // Clearing both times makes it all day.
      expect(
        await h.ok('PUT', `/employee-discounts/${id}`, {
          discountPercent: 20,
          endTime: '',
          startTime: '',
        }),
      ).toMatchObject({ discountPercent: 20, endTime: null, startTime: null });

      const archived = await h.ok('PUT', `/employee-discounts/${id}`, { archived: true });
      expect(archived.archivedAt).not.toBeNull();
      expect(await ids(`/employee-discounts?search=${run}`)).not.toContain(id);
      expect(await ids(`/employee-discounts?search=${run}&archived=true`)).toEqual([id]);
      expect(
        (await h.ok('PUT', `/employee-discounts/${id}`, { archived: false })).archivedAt,
      ).toBeNull();

      // There is no duplicate rule, and no delete route.
      expect((await h.api('POST', '/employee-discounts', body)).status).toBe(201);
      expect((await h.api('DELETE', `/employee-discounts/${id}`)).status).toBe(404);

      // The DTO catches a lone start time before the service's own message can.
      expect(err(await h.api('POST', '/employee-discounts', { ...body, endTime: undefined })))
        .toMatchInlineSnapshot(`
      [
        400,
        "endTime must use HH:mm format",
      ]
    `);
      expect(
        err(await h.api('POST', '/employee-discounts', { ...body, endTime: '12:00' })),
      ).toEqual([400, 'The end time must differ from the start time.']);
      expect(
        err(await h.api('POST', '/employee-discounts', { ...body, restaurantId: randomUUID() })),
      ).toEqual([404, 'Restaurant not found']);
      expect(
        err(
          await h.api('POST', '/employee-discounts', {
            ...body,
            daysOfWeek: ['FUNDAY'],
            discountPercent: 101,
          }),
        ),
      ).toMatchInlineSnapshot(`
      [
        400,
        "discountPercent must not be greater than 100, each value in daysOfWeek must be one of the following values: FRIDAY, MONDAY, SATURDAY, SUNDAY, THURSDAY, TUESDAY, WEDNESDAY",
      ]
    `);
      expect(err(await h.api('POST', '/employee-discounts', {}))).toMatchInlineSnapshot(`
      [
        400,
        "name must be shorter than or equal to 100 characters, name should not be empty, name must be a string, restaurantId must be a UUID, discountPercent must not be greater than 100, discountPercent must be a positive number, discountPercent must be a number conforming to the specified constraints",
      ]
    `);
    });

    const masters = [
      'legal-entities',
      'hospitals',
      'locations',
      'stores',
      'kitchens',
      'restaurants',
      'counters',
      'pos-devices',
      'payment-machines',
      'time-slots',
      'employees',
      'employee-discounts',
    ];

    it('401 on every master without a token', async () => {
      for (const master of masters) {
        expect(err(await h.api('GET', `/${master}`, undefined, '')), master).toEqual([
          401,
          'Unauthorized',
        ]);
        expect(err(await h.api('POST', `/${master}`, {}, '')), master).toEqual([
          401,
          'Unauthorized',
        ]);
      }
    });

    it('403 on every master for a role without the permission', async () => {
      for (const master of masters) {
        for (const [method, path] of [
          ['GET', `/${master}`],
          ['GET', `/${master}/${randomUUID()}`],
          ['POST', `/${master}`],
          ['PUT', `/${master}/${randomUUID()}`],
        ] as const) {
          expect(
            err(await h.api(method, path, method === 'GET' ? undefined : {}, noPerms)),
            `${method} ${master}`,
          ).toEqual([403, 'Forbidden resource']);
        }
      }
      // Viewing is a permission of its own: a store viewer reads but cannot write.
      expect(
        (await h.api('GET', `/stores?hospitalId=${fx.hospitalA}`, undefined, storeViewer)).status,
      ).toBe(200);
      expect(
        err(
          await h.api(
            'POST',
            '/stores',
            { hospitalId: fx.hospitalA, storeName: `Int Store ${run}` },
            storeViewer,
          ),
        ),
      ).toEqual([403, 'Forbidden resource']);
      expect((await h.api('GET', '/kitchens', undefined, storeViewer)).status).toBe(403);
    });

    it('404 for an unknown id on read, update and delete; 400 for an id that is not a uuid', async () => {
      const notFound: Record<string, string> = {
        counters: 'Counter not found',
        'employee-discounts': 'Employee discount not found',
        employees: 'Employee not found',
        hospitals: 'Location not found',
        kitchens: 'Kitchen not found',
        'legal-entities': 'Entity not found',
        locations: 'Location not found',
        'payment-machines': 'Payment machine not found',
        'pos-devices': 'POS device not found',
        restaurants: 'Restaurant not found',
        stores: 'Store not found',
        'time-slots': 'Time slot not found',
      };
      for (const master of masters) {
        const path = `/${master}/${randomUUID()}`;
        const message = notFound[master];
        expect(err(await h.api('GET', path)), master).toEqual([404, message]);
        expect(err(await h.api('PUT', path, {})), master).toEqual([404, message]);
        // Employee discounts have no DELETE route, so theirs is a route 404.
        expect(err(await h.api('DELETE', path)), master).toEqual([
          404,
          master === 'employee-discounts' ? `Cannot DELETE /api/v1${path}` : message,
        ]);
      }
      expect(err(await h.api('GET', '/stores/not-a-uuid'))).toEqual([
        400,
        'Validation failed (uuid is expected)',
      ]);
    });

    it('location scoping: a one-hospital user sees and changes only its own stores', async () => {
      const own = await h.api(
        'POST',
        '/stores',
        { hospitalId: fx.hospitalA, storeName: `Int Scoped Store ${run}` },
        scoped,
      );
      expect(own.status).toBe(201);
      const ownId = idOf(own.data);

      // The admin sees both hospitals' stores; the scoped user only hospital A's.
      expect(await ids(`/stores?search=${run}&limit=100`)).toEqual(
        expect.arrayContaining([ownId, fx.storeA, fx.storeB]),
      );
      const seen = await ids(`/stores?search=${run}&limit=100`, scoped);
      expect(seen).toEqual(expect.arrayContaining([ownId, fx.storeA]));
      expect(seen).not.toContain(fx.storeB);

      // Another hospital's store is simply not found...
      expect(err(await h.api('GET', `/stores/${fx.storeB}`, undefined, scoped))).toEqual([
        404,
        'Store not found',
      ]);
      expect(
        err(await h.api('PUT', `/stores/${fx.storeB}`, { storeName: 'Taken Over' }, scoped)),
      ).toEqual([404, 'Store not found']);
      expect(err(await h.api('DELETE', `/stores/${fx.storeB}`, undefined, scoped))).toEqual([
        404,
        'Store not found',
      ]);
      expect(await h.ok('GET', `/stores/${fx.storeB}`)).toMatchObject({
        isActive: true,
        storeName: 'Main Store',
      });

      // ...and naming another hospital is refused outright.
      const outside = [403, 'This location is outside your assigned access'];
      expect(
        err(await h.api('GET', `/stores?hospitalId=${fx.hospitalB}`, undefined, scoped)),
      ).toEqual(outside);
      expect(
        err(
          await h.api(
            'POST',
            '/stores',
            { hospitalId: fx.hospitalB, storeName: `Int Scoped Store ${run}` },
            scoped,
          ),
        ),
      ).toEqual(outside);
      expect(
        err(await h.api('PUT', `/stores/${ownId}`, { hospitalId: fx.hospitalB }, scoped)),
      ).toEqual(outside);
      expect((await h.ok('GET', `/stores/${ownId}`)).hospitalId).toBe(fx.hospitalA);
    });

    it('location scoping: a one-hospital user sees and changes only its own restaurants and what hangs off them', async () => {
      const seen = await ids(`/restaurants?search=${run}&limit=100`, scoped);
      expect(seen).toContain(fx.restaurantA);
      expect(seen).not.toContain(fx.restaurantB);
      expect(err(await h.api('GET', `/restaurants/${fx.restaurantB}`, undefined, scoped))).toEqual([
        404,
        'Restaurant not found',
      ]);
      expect(
        err(await h.api('PUT', `/restaurants/${fx.restaurantB}`, { isActive: false }, scoped)),
      ).toEqual([404, 'Restaurant not found']);
      expect(
        err(await h.api('DELETE', `/restaurants/${fx.restaurantB}`, undefined, scoped)),
      ).toEqual([404, 'Restaurant not found']);
      expect((await h.ok('GET', `/restaurants/${fx.restaurantB}`)).isActive).toBe(true);
      expect(
        err(await h.api('GET', `/restaurants?hospitalId=${fx.hospitalB}`, undefined, scoped)),
      ).toEqual([403, 'This location is outside your assigned access']);

      // Its own restaurant cannot borrow another hospital's store or kitchen.
      const base = { hospitalId: fx.hospitalA, restaurantName: `Int Scoped Cafe ${run}` };
      expect(
        err(await h.api('POST', '/restaurants', { ...base, storeId: fx.storeB }, scoped)),
      ).toEqual([400, 'Store not found or inactive']);
      expect(
        err(await h.api('POST', '/restaurants', { ...base, kitchenIds: [fx.kitchenB] }, scoped)),
      ).toEqual([400, 'One or more kitchens were not found for selected hospital']);
      expect((await h.api('POST', '/restaurants', base, scoped)).status).toBe(201);

      // Counters and staff discounts of another hospital's restaurant are out of reach.
      expect(
        err(
          await h.api(
            'POST',
            '/counters',
            {
              counterCode: `SC${run}`,
              counterName: 'Scoped',
              hospitalId: fx.hospitalA,
              restaurantId: fx.restaurantB,
            },
            scoped,
          ),
        ),
      ).toEqual([400, 'Restaurant not found or inactive']);
      expect(await ids(`/counters?restaurantId=${fx.restaurantB}`, scoped)).toEqual([]);
      expect(
        err(
          await h.api(
            'POST',
            '/employee-discounts',
            { discountPercent: 5, name: 'Scoped', restaurantId: fx.restaurantB },
            scoped,
          ),
        ),
      ).toEqual([404, 'Restaurant not found']);
      const discountB = idOf(
        await h.ok('POST', '/employee-discounts', {
          discountPercent: 5,
          name: `Int B Offer ${run}`,
          restaurantId: fx.restaurantB,
        }),
      );
      expect(
        err(await h.api('GET', `/employee-discounts/${discountB}`, undefined, scoped)),
      ).toEqual([404, 'Employee discount not found']);
    });

    it('location scoping: hospitals, legal entities and the shared masters', async () => {
      expect(await ids(`/hospitals?search=${run}&limit=100`, scoped)).toEqual([fx.hospitalA]);
      expect(err(await h.api('GET', `/hospitals/${fx.hospitalB}`, undefined, scoped))).toEqual([
        404,
        'Location not found',
      ]);
      expect(
        err(await h.api('PUT', `/hospitals/${fx.hospitalB}`, { city: 'Elsewhere' }, scoped)),
      ).toEqual([404, 'Location not found']);

      // Legal entities have no hospital: everyone with the permission sees them, but only a Super
      // Admin adds, renames or removes one, as each heads the GST invoices of its locations.
      const entityB = idOf(await h.ok('POST', '/legal-entities', entityBody('B')));
      await h.ok('PUT', `/hospitals/${fx.hospitalB}`, { legalEntityId: entityB });
      expect(await ids(`/legal-entities?search=${run}&limit=100`, scoped)).toContain(entityB);
      for (const [method, path, body] of [
        ['POST', '/legal-entities', entityBody('By A')],
        ['PUT', `/legal-entities/${entityB}`, { entityName: `Int Renamed By A ${run}` }],
        ['DELETE', `/legal-entities/${entityB}`, undefined],
      ] as const) {
        expect(err(await h.api(method, path, body, scoped))).toEqual([403, 'Forbidden resource']);
      }

      // Time slots and employees: shared ones are seen by all but changed only by a Super Admin.
      const sharedSlot = idOf(
        await h.ok('POST', '/time-slots', {
          isAlwaysAvailable: true,
          slotName: `Int Shared ${run}`,
        }),
      );
      const slotB = idOf(
        await h.ok('POST', '/time-slots', {
          hospitalId: fx.hospitalB,
          isAlwaysAvailable: true,
          slotName: `Int Slot B ${run}`,
        }),
      );
      const slots = await ids(`/time-slots?search=${run}&limit=100`, scoped);
      expect(slots).toContain(sharedSlot);
      expect(slots).not.toContain(slotB);
      expect(err(await h.api('GET', `/time-slots/${slotB}`, undefined, scoped))).toEqual([
        404,
        'Time slot not found',
      ]);
      expect(
        err(
          await h.api(
            'POST',
            '/time-slots',
            { isAlwaysAvailable: true, slotName: `Int Scoped Shared ${run}` },
            scoped,
          ),
        ),
      ).toEqual([403, 'Only a Super Admin can change time slots shared by every location']);
      expect(
        err(await h.api('PUT', `/time-slots/${sharedSlot}`, { isActive: false }, scoped)),
      ).toEqual([403, 'Only a Super Admin can change time slots shared by every location']);
      expect(
        (
          await h.api(
            'POST',
            '/time-slots',
            { hospitalId: fx.hospitalA, isAlwaysAvailable: true, slotName: `Int Slot A ${run}` },
            scoped,
          )
        ).status,
      ).toBe(201);

      expect(
        err(
          await h.api(
            'POST',
            '/employees',
            { employeeCode: `SE${run}`, employeeName: 'Scoped', employmentType: 'ON_ROLL' },
            scoped,
          ),
        ),
      ).toEqual([403, 'Only a Super Admin can change employees shared by every location']);
      expect(
        err(
          await h.api(
            'POST',
            '/employees',
            {
              employeeCode: `SE${run}`,
              employeeName: 'Scoped',
              employmentType: 'ON_ROLL',
              hospitalId: fx.hospitalB,
            },
            scoped,
          ),
        ),
      ).toEqual([403, 'This location is outside your assigned access']);
    });
  },
);
