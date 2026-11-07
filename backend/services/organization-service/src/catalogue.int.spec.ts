// Characterisation of the catalogue over HTTP: item categories, items (and their spreadsheet
// import), item prices (effective dates, overlaps, which price is current), store and kitchen
// item mappings, and restaurant menus (time slots, display order, import, what the kiosk shows).
// It pins today's statuses, messages, shapes and database effects so refactors can be checked.
//
// Runs only with DATABASE_URL_TEST. Every record it makes carries `run` in its name (or hangs off
// one that does), so it never touches seeded data and needs no cleanup. It never reorders
// categories for real: PUT /item-categories/order renumbers every category in the database.
import { randomUUID } from 'node:crypto';
import { titleCase } from '@aahar/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  databaseUrl,
  day,
  firstOf,
  run,
  shape,
  startHarness,
  type Body,
  type Harness,
} from './testing/int-harness.js';

// The images set no TZ, so production runs in UTC and so does this suite.
process.env.TZ = 'UTC';

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
/** Site time (India, +05:30) `minutes` from now, as a Date whose UTC fields read as IST. */
const ist = (minutes: number) => new Date(Date.now() + (330 + minutes) * 60_000);
const hhmm = (minutes: number) => ist(minutes).toISOString().slice(11, 16);
const istWeekday = (offset: number) => WEEKDAYS[(ist(0).getUTCDay() + offset) % 7] as string;

describe.skipIf(!databaseUrl)('catalogue (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  const fx = {
    categoryId: '',
    hospitalCode: '',
    hospitalId: '',
    kitchenId: '',
    otherHospitalId: '',
    restaurantCode: '',
    restaurantName: '',
    restaurantId: '',
    storeId: '',
    viewer: '',
  };

  const list = (data: Body) => data.items as Body[];
  const idOf = (data: Body) => data.id as string;
  const listed = async (path: string) => list(await h.ok('GET', path));
  /** [status, message] of a call expected to fail. */
  const refused = async (method: string, path: string, body?: unknown, as?: string) => {
    const result = await h.api(method, path, body, as);
    return [result.status, result.body.message];
  };

  let labels = 0;
  /** A unique, Title-Case-proof name for this run. */
  const name = (label: string) => `Int ${label} ${run} ${(labels += 1)}`;
  const category = async (label = 'Cat') =>
    idOf(await h.ok('POST', '/item-categories', { categoryName: name(label) }));
  const item = async (label = 'Item', extra: Body = {}) =>
    h.ok('POST', '/items', { itemName: name(label), type: 'VEG', ...extra });
  const storeMap = (itemId: string, categoryId = fx.categoryId) =>
    h.ok('POST', '/store-items', { categoryId, itemId, storeId: fx.storeId });
  const kitchenMap = (itemId: string, categoryId = fx.categoryId) =>
    h.ok('POST', '/kitchen-items', { categoryId, itemId, kitchenId: fx.kitchenId });
  /** A menu entry at this run's restaurant, sold from the kitchen unless `extra` says otherwise. */
  const menuBody = (itemId: string, extra: Body = {}) => ({
    categoryId: fx.categoryId,
    itemId,
    kitchenId: fx.kitchenId,
    price: 100,
    restaurantId: fx.restaurantId,
    roomPrice: 120,
    ...extra,
  });
  /** A fresh item, mapped to the kitchen, on the menu. */
  const onMenu = async (label: string, extra: Body = {}, categoryId = fx.categoryId) => {
    const it = await item(label);
    await kitchenMap(idOf(it), categoryId);
    const menu = await h.ok(
      'POST',
      '/restaurant-menus',
      menuBody(idOf(it), { categoryId, ...extra }),
    );
    return { item: it, menu };
  };

  beforeAll(async () => {
    h = await startHarness();

    const kitchen = firstOf(
      await listed('/kitchens?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc'),
    );
    fx.hospitalId = kitchen.hospitalId as string;
    fx.kitchenId = idOf(kitchen);
    fx.storeId = idOf(
      firstOf(await listed(`/stores?limit=1&isActive=true&hospitalId=${fx.hospitalId}`)),
    );
    fx.hospitalCode = (await h.ok('GET', `/hospitals/${fx.hospitalId}`)).hospitalCode as string;
    // Its own restaurant: placing a menu item FIRST renumbers the restaurant's whole menu.
    const restaurant = await h.ok('POST', '/restaurants', {
      hospitalId: fx.hospitalId,
      restaurantName: `Int Catalogue ${run}`,
    });
    fx.restaurantId = idOf(restaurant);
    fx.restaurantCode = restaurant.restaurantCode as string;
    fx.restaurantName = restaurant.restaurantName as string;
    fx.categoryId = await category('Main');

    // A viewer limited to a location of its own, who may also change (not add) items.
    const [other] = await h.rawQuery<{ id: string }>(
      `INSERT INTO hospitals (id, hospital_code, hospital_name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`,
      `CI${run}`.toUpperCase(),
      `Int Catalogue Other ${run}`,
    );
    fx.otherHospitalId = other!.id;
    const [role] = await h.rawQuery<{ id: string }>(
      `INSERT INTO roles (id, name, location_scope, updated_at)
       VALUES (gen_random_uuid(), $1, 'SINGLE', now()) RETURNING id`,
      `Int Catalogue Viewer ${run}`,
    );
    await h.rawQuery(
      `INSERT INTO role_permissions (id, role_id, permission_id, updated_at)
       SELECT gen_random_uuid(), $1::uuid, id, now() FROM permissions WHERE code = ANY($2::text[])`,
      role!.id,
      [
        'ITEM_CATEGORY_VIEW',
        'ITEM_PRICE_VIEW',
        'ITEM_UPDATE',
        'ITEM_VIEW',
        'KITCHEN_ITEM_VIEW',
        'RESTAURANT_MENU_VIEW',
        'STORE_ITEM_VIEW',
      ],
    );
    const [viewer] = await h.rawQuery<{ id: string; sessionVersion: number }>(
      `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, 'Catalogue Viewer', $2, $3::uuid, now())
       RETURNING id, session_version AS "sessionVersion"`,
      `CV${run}`.toUpperCase(),
      `6${String(Date.now()).slice(-9)}`,
      fx.otherHospitalId,
    );
    await h.rawQuery(
      `INSERT INTO user_roles (id, user_id, role_id, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
      viewer!.id,
      role!.id,
    );
    await h.rawQuery(
      `INSERT INTO user_hospitals (id, user_id, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
      viewer!.id,
      fx.otherHospitalId,
    );
    fx.viewer = h.signFor(viewer!);
  }, 60_000);

  afterAll(() => h?.app.close());

  describe('item categories', () => {
    it('creates, reads, lists, updates and switches off a category', async () => {
      const categoryName = name('Beverages');
      const created = await h.ok('POST', '/item-categories', { categoryName });
      expect(shape(created)).toMatchInlineSnapshot(`
        {
          "categoryName": "string",
          "createdAt": "string",
          "deletedAt": null,
          "id": "string",
          "isActive": "boolean",
          "sortOrder": "number",
          "updatedAt": "string",
        }
      `);
      expect(created).toMatchObject({ categoryName: titleCase(categoryName), isActive: true });
      // A new category goes last on menus, the till and the kiosk.
      const [last] = await h.rawQuery<{ max: number }>(
        'SELECT max(sort_order)::int AS max FROM item_categories WHERE deleted_at IS NULL',
      );
      expect(created.sortOrder).toBeLessThanOrEqual(last!.max);
      expect(created.sortOrder).toBeGreaterThan(1);

      expect(await h.ok('GET', `/item-categories/${idOf(created)}`)).toEqual(created);
      const found = await h.ok(
        'GET',
        `/item-categories?search=${encodeURIComponent(categoryName)}`,
      );
      expect(list(found).map(idOf)).toEqual([idOf(created)]);
      expect(found.meta).toEqual({ limit: 20, page: 1, total: 1, totalPages: 1 });

      const renamed = await h.ok('PUT', `/item-categories/${idOf(created)}`, {
        categoryName: `${categoryName} Hot`,
      });
      expect(renamed).toMatchObject({
        categoryName: titleCase(`${categoryName} Hot`),
        isActive: true,
      });

      // A category is only ever switched off, never deleted: there is no DELETE route.
      expect(
        await h.ok('PUT', `/item-categories/${idOf(created)}`, { isActive: false }),
      ).toMatchObject({ isActive: false });
      expect((await h.api('DELETE', `/item-categories/${idOf(created)}`)).status).toBe(404);
      expect(await h.ok('GET', `/item-categories/${idOf(created)}`)).toMatchObject({
        isActive: false,
      });
    });

    it('saves names in Title Case and refuses a name that differs only in case or punctuation', async () => {
      const created = await h.ok('POST', '/item-categories', {
        categoryName: `int soups ${run}`,
      });
      expect(created.categoryName).toBe(titleCase(`int soups ${run}`));
      expect(created.categoryName).toMatch(/^Int Soups /);
      expect(
        await refused('POST', '/item-categories', { categoryName: `INT-SOUPS_${run}!` }),
      ).toEqual([409, 'Similar category already exists']);

      const other = await category('Other');
      expect(
        await refused('PUT', `/item-categories/${other}`, { categoryName: `Int Soups ${run}` }),
      ).toEqual([409, 'Similar category already exists']);
    });

    it('validates the body, the id and the order list', async () => {
      expect(await refused('POST', '/item-categories', {})).toEqual([
        400,
        'categoryName must be shorter than or equal to 255 characters, Category name must include at least one letter or number, categoryName must be a string, categoryName should not be empty',
      ]);
      expect(await refused('POST', '/item-categories', { categoryName: '***' })).toEqual([
        400,
        'Category name must include at least one letter or number',
      ]);
      expect(
        await refused('POST', '/item-categories', { categoryName: name('X'), isActive: 'yes' }),
      ).toEqual([400, 'isActive must be a boolean value']);
      expect(
        await refused('POST', '/item-categories', { categoryName: name('X'), sortOrder: 1 }),
      ).toEqual([400, 'property sortOrder should not exist']);
      expect(await refused('GET', '/item-categories/not-a-uuid')).toEqual([
        400,
        'Validation failed (uuid is expected)',
      ]);
      expect(await refused('GET', `/item-categories/${randomUUID()}`)).toEqual([
        404,
        'Item category not found',
      ]);
      expect(await refused('GET', '/item-categories?sortBy=nope')).toEqual([
        400,
        'sortBy must be one of the following values: categoryName, createdAt, isActive, sortOrder, updatedAt',
      ]);

      // The order: validation, and an unknown id refused before anything is renumbered.
      expect(await refused('PUT', '/item-categories/order', { ids: [] })).toEqual([
        400,
        'ids must contain at least 1 elements',
      ]);
      const missing = randomUUID();
      expect(
        await refused('PUT', '/item-categories/order', { ids: [fx.categoryId, missing] }),
      ).toEqual([404, `Item category not found: ${missing}`]);
    });

    it('drops an inactive category from active lookups and refuses it for new mappings', async () => {
      const categoryName = name('Seasonal');
      const id = idOf(await h.ok('POST', '/item-categories', { categoryName, isActive: false }));
      const search = `search=${encodeURIComponent(categoryName)}`;
      expect((await h.ok('GET', `/item-categories?isActive=true&${search}`)).meta).toMatchObject({
        total: 0,
      });
      expect((await listed(`/item-categories?isActive=false&${search}`)).map(idOf)).toEqual([id]);
      // Still readable by id.
      expect(await h.ok('GET', `/item-categories/${id}`)).toMatchObject({ isActive: false });

      const it = idOf(await item());
      expect(
        await refused('POST', '/store-items', {
          categoryId: id,
          itemId: it,
          storeId: fx.storeId,
        }),
      ).toEqual([400, 'This category is inactive and cannot be used.']);
      expect(
        await refused('POST', '/store-items', {
          categoryId: randomUUID(),
          itemId: it,
          storeId: fx.storeId,
        }),
      ).toEqual([400, 'Item category not found']);
    });
  });

  describe('items', () => {
    it('creates an item with the next code, and reads, lists, updates and deletes it', async () => {
      const itemName = name('Masala Chai');
      const created = await h.ok('POST', '/items', {
        hsnCode: ' 0902 ab ',
        itemName,
        preparationTimeMinutes: 5,
        type: 'VEG',
      });
      expect(shape(created)).toMatchInlineSnapshot(`
        {
          "createdAt": "string",
          "deletedAt": null,
          "hsnCode": "string",
          "id": "string",
          "isActive": "boolean",
          "itemCode": "string",
          "itemName": "string",
          "itemType": null,
          "preparationTimeMinutes": "number",
          "type": "string",
          "updatedAt": "string",
        }
      `);
      // The type comes later, from its first mapping; HSN codes are kept upper case.
      expect(created).toMatchObject({
        hsnCode: '0902 AB',
        isActive: true,
        itemName: titleCase(itemName),
        itemType: null,
        preparationTimeMinutes: 5,
        type: 'VEG',
      });
      expect(created.itemCode).toMatch(/^ITM\d{4,}$/);
      const next = await item();
      expect(Number(String(next.itemCode).slice(3))).toBeGreaterThan(
        Number(String(created.itemCode).slice(3)),
      );

      expect(await h.ok('GET', `/items/${idOf(created)}`)).toEqual(created);
      // Search covers the name, the item code and the HSN code.
      for (const search of [itemName, created.itemCode as string]) {
        expect((await listed(`/items?search=${encodeURIComponent(search)}`)).map(idOf)).toEqual([
          idOf(created),
        ]);
      }
      expect((await listed(`/items?search=0902%20AB&limit=100`)).map(idOf)).toContain(
        idOf(created),
      );
      expect(
        (await h.ok('GET', `/items?search=${encodeURIComponent(itemName)}&type=NON_VEG`)).meta,
      ).toMatchObject({ total: 0 });

      const updated = await h.ok('PUT', `/items/${idOf(created)}`, {
        hsnCode: null,
        preparationTimeMinutes: null,
        type: 'EGGETARIAN',
      });
      expect(updated).toMatchObject({
        hsnCode: null,
        itemCode: created.itemCode,
        preparationTimeMinutes: null,
        type: 'EGGETARIAN',
      });

      expect(await h.ok('DELETE', `/items/${idOf(created)}`)).toEqual({ id: idOf(created) });
      expect(await refused('GET', `/items/${idOf(created)}`)).toEqual([404, 'Item not found']);
      expect(await refused('PUT', `/items/${idOf(created)}`, { type: 'VEG' })).toEqual([
        404,
        'Item not found',
      ]);
      expect(await refused('DELETE', `/items/${idOf(created)}`)).toEqual([404, 'Item not found']);
      expect(
        (await h.ok('GET', `/items?search=${encodeURIComponent(itemName)}`)).meta,
      ).toMatchObject({ total: 0 });
      // A deleted item's name may be used again, under a new code.
      const again = await h.ok('POST', '/items', { itemName, type: 'VEG' });
      expect(again.itemCode).not.toBe(created.itemCode);
    });

    it('refuses a duplicate name, ignoring case, spaces and punctuation', async () => {
      const itemName = name('Coke 500ml');
      const first = await h.ok('POST', '/items', { itemName, type: 'VEG' });
      const twin = itemName.toUpperCase().replace(/ /g, '-');
      expect(await refused('POST', '/items', { itemName: twin, type: 'VEG' })).toEqual([
        409,
        'An item with this name already exists',
      ]);
      const other = await item();
      expect(await refused('PUT', `/items/${idOf(other)}`, { itemName: twin })).toEqual([
        409,
        'An item with this name already exists',
      ]);
      // Renaming an item to its own name (or a variant of it) is fine.
      expect(await h.ok('PUT', `/items/${idOf(first)}`, { itemName: twin })).toMatchObject({
        id: idOf(first),
      });
    });

    it('validates the body and the query', async () => {
      expect(await refused('POST', '/items', {})).toEqual([
        400,
        'itemName must be shorter than or equal to 255 characters, Item name must include at least one letter or number, itemName must be a string, itemName should not be empty, type must be one of the following values: VEG, NON_VEG, EGGETARIAN',
      ]);
      expect(
        await refused('POST', '/items', {
          hsnCode: 'X'.repeat(51),
          itemName: name('Bad'),
          preparationTimeMinutes: -1,
          type: 'FISH',
        }),
      ).toEqual([
        400,
        'type must be one of the following values: VEG, NON_VEG, EGGETARIAN, preparationTimeMinutes must not be less than 0, hsnCode must be shorter than or equal to 50 characters',
      ]);
      expect(
        await refused('POST', '/items', { itemName: name('X'), itemType: 'MRP', type: 'VEG' }),
      ).toEqual([400, 'property itemType should not exist']);
      expect(await refused('GET', '/items?itemType=OTHER')).toEqual([
        400,
        'itemType must be one of the following values: MRP, READYMADE, LIVE',
      ]);
      expect(await refused('GET', '/items?limit=101')).toEqual([
        400,
        'limit must not be greater than 100',
      ]);
      expect(await refused('GET', `/items/${randomUUID()}`)).toEqual([404, 'Item not found']);
      expect(await refused('DELETE', '/items/123')).toEqual([
        400,
        'Validation failed (uuid is expected)',
      ]);
    });

    it('takes its type from its first mapping, and the mapping screens list unmapped items too', async () => {
      const mrp = await item('Mrp');
      const unmapped = await item('Unmapped');
      await storeMap(idOf(mrp));
      expect(await h.ok('GET', `/items/${idOf(mrp)}`)).toMatchObject({ itemType: 'MRP' });

      const search = `search=${encodeURIComponent(`${run} `)}&limit=100`;
      const mrpOnly = (await listed(`/items?itemType=MRP&${search}`)).map(idOf);
      expect(mrpOnly).toContain(idOf(mrp));
      expect(mrpOnly).not.toContain(idOf(unmapped));
      const withUnmapped = (await listed(`/items?itemType=MRP&includeUnmapped=true&${search}`)).map(
        idOf,
      );
      expect(withUnmapped).toEqual(expect.arrayContaining([idOf(mrp), idOf(unmapped)]));
      expect(
        (await listed(`/items?itemType=READYMADE&includeUnmapped=true&${search}`)).map(idOf),
      ).not.toContain(idOf(mrp));
    });

    it('drops an inactive item from active lookups and refuses it for mappings, menus and prices', async () => {
      const it = await item('Retired');
      const id = idOf(it);
      const updated = await h.ok('PUT', `/items/${id}`, { isActive: false });
      expect(updated).toMatchObject({ isActive: false });
      const search = `search=${encodeURIComponent(it.itemName as string)}`;
      expect((await h.ok('GET', `/items?isActive=true&${search}`)).meta).toMatchObject({
        total: 0,
      });
      expect((await listed(`/items?isActive=false&${search}`)).map(idOf)).toEqual([id]);

      const inactive = 'This item is inactive and cannot be used.';
      expect(
        await refused('POST', '/store-items', {
          categoryId: fx.categoryId,
          itemId: id,
          storeId: fx.storeId,
        }),
      ).toEqual([400, inactive]);
      expect(
        await refused('POST', '/kitchen-items', {
          categoryId: fx.categoryId,
          itemId: id,
          kitchenId: fx.kitchenId,
        }),
      ).toEqual([400, inactive]);
      expect(await refused('POST', '/restaurant-menus', menuBody(id))).toEqual([400, inactive]);
      expect(
        await refused('POST', '/item-prices', {
          effectiveFrom: day(0),
          gstPercent: 5,
          hospitalId: fx.hospitalId,
          itemId: id,
          price: 10,
          rateType: 'NORMAL',
        }),
      ).toEqual([400, 'This item is inactive and cannot be priced.']);
      expect(
        await refused(
          'GET',
          `/item-prices/resolve?hospitalId=${fx.hospitalId}&itemId=${id}&rateType=NORMAL`,
        ),
      ).toEqual([400, 'This item is inactive and cannot be priced.']);
    });
  });

  describe('item import', () => {
    it('dry-runs, then imports and updates items from rows', async () => {
      const itemName = name('Imported Samosa');
      const rows = [{ hsnCode: '2106', itemName, preparationTimeMinutes: '10', type: 'Non-veg' }];
      const search = `/items?search=${encodeURIComponent(itemName)}`;

      expect(await h.ok('POST', '/items/import', { dryRun: true, rows })).toEqual({
        created: 1,
        imported: false,
        rows: [{ action: 'create', errors: [] }],
        skipped: 0,
        updated: 0,
      });
      expect((await h.ok('GET', search)).meta).toMatchObject({ total: 0 });

      expect(await h.ok('POST', '/items/import', { dryRun: false, rows })).toMatchObject({
        created: 1,
        imported: true,
      });
      const saved = firstOf(await listed(search));
      expect(saved).toMatchObject({
        hsnCode: '2106',
        isActive: true,
        itemName: titleCase(itemName),
        preparationTimeMinutes: 10,
        type: 'NON_VEG',
      });
      expect(saved.itemCode).toMatch(/^ITM\d{4,}$/);

      // With its code a row updates the item; blank cells keep what it has.
      const update = [{ isActive: 'Inactive', itemCode: saved.itemCode, itemName, type: 'egg' }];
      expect(await h.ok('POST', '/items/import', { dryRun: false, rows: update })).toEqual({
        created: 0,
        imported: true,
        rows: [{ action: 'update', errors: [] }],
        skipped: 0,
        updated: 1,
      });
      expect(await h.ok('GET', `/items/${idOf(saved)}`)).toMatchObject({
        hsnCode: '2106',
        isActive: false,
        preparationTimeMinutes: 10,
        type: 'EGGETARIAN',
      });
      expect(await h.ok('POST', '/items/import', { dryRun: true, rows: update })).toMatchObject({
        rows: [{ action: 'skip', errors: [] }],
        skipped: 1,
      });
    });

    it('reports bad rows and saves nothing when any row is bad', async () => {
      const good = name('Good Row');
      const taken = await item('Taken');
      const result = await h.ok('POST', '/items/import', {
        dryRun: false,
        rows: [
          { itemName: good, type: 'veg' },
          { itemName: '', type: 'Fish' },
          { itemName: taken.itemName, type: 'veg' },
          {
            itemCode: `NOPE${run}`,
            itemName: name('Nope'),
            preparationTimeMinutes: 'x',
            type: 'veg',
          },
          { itemName: good, type: 'veg' },
        ],
      });
      expect(result).toEqual({
        created: 1,
        imported: false,
        rows: [
          { action: 'create', errors: [] },
          {
            action: 'create',
            errors: ['Item name is required', 'Food type must be Veg, Non-veg or Egg'],
          },
          {
            action: 'create',
            errors: [`An item with this name already exists (${String(taken.itemCode)})`],
          },
          {
            action: 'create',
            errors: [
              'Prep time (min) must not be less than 0',
              'Prep time (min) must be an integer number',
              `No item has code NOPE${run.toUpperCase()}; leave Item code blank to add a new item`,
            ],
          },
          { action: 'create', errors: ['Row 2 has the same item name'] },
        ],
        skipped: 0,
        updated: 0,
      });
      expect((await h.ok('GET', `/items?search=${encodeURIComponent(good)}`)).meta).toMatchObject({
        total: 0,
      });

      expect(await refused('POST', '/items/import', { dryRun: true, rows: [] })).toEqual([
        400,
        'The file has no rows to import',
      ]);
      expect(await refused('POST', '/items/import', { rows: [{}] })).toEqual([
        400,
        'dryRun must be a boolean value',
      ]);
    });
  });

  describe('item prices', () => {
    const priceBody = (itemId: string, extra: Body = {}) => ({
      effectiveFrom: day(0),
      gstPercent: 5,
      hospitalId: fx.hospitalId,
      itemId,
      price: 40,
      rateType: 'NORMAL',
      ...extra,
    });

    it('creates, reads, lists, updates and deletes a price', async () => {
      const itemId = idOf(await item('Priced'));
      const created = await h.ok(
        'POST',
        '/item-prices',
        priceBody(itemId, { effectiveTo: day(30) }),
      );
      // The location's fields: keys only, as seeded addresses may leave some empty.
      const { hospital, ...price } = created;
      expect(Object.keys(hospital as Body).sort()).toEqual([
        'city',
        'displayName',
        'hospitalCode',
        'hospitalName',
        'id',
        'isActive',
        'postalCode',
        'state',
      ]);
      expect(shape(price)).toMatchInlineSnapshot(`
        {
          "createdAt": "string",
          "deletedAt": null,
          "effectiveFrom": "string",
          "effectiveTo": "string",
          "gstPercent": "number",
          "hospitalId": "string",
          "id": "string",
          "isActive": "boolean",
          "isTaxInclusive": "boolean",
          "item": {
            "id": "string",
            "isActive": "boolean",
            "itemCode": "string",
            "itemName": "string",
            "itemType": null,
            "type": "string",
          },
          "itemId": "string",
          "price": "number",
          "rateType": "string",
          "restaurant": null,
          "restaurantId": null,
          "updatedAt": "string",
        }
      `);
      expect(created).toMatchObject({
        effectiveFrom: `${day(0)}T00:00:00.000Z`,
        effectiveTo: `${day(30)}T00:00:00.000Z`,
        gstPercent: 5,
        isActive: true,
        isTaxInclusive: true,
        price: 40,
        rateType: 'NORMAL',
      });

      expect(await h.ok('GET', `/item-prices/${idOf(created)}`)).toEqual(created);
      expect((await listed(`/item-prices?itemId=${itemId}`)).map(idOf)).toEqual([idOf(created)]);
      expect(
        (await h.ok('GET', `/item-prices?itemId=${itemId}&rateType=STAFF`)).meta,
      ).toMatchObject({ total: 0 });

      const updated = await h.ok('PUT', `/item-prices/${idOf(created)}`, {
        effectiveTo: null,
        price: 42.5,
      });
      expect(updated).toMatchObject({ effectiveTo: null, price: 42.5 });

      expect(await h.ok('DELETE', `/item-prices/${idOf(created)}`)).toEqual({ id: idOf(created) });
      expect(await refused('GET', `/item-prices/${idOf(created)}`)).toEqual([
        404,
        'Item price not found',
      ]);
      expect(await refused('PUT', `/item-prices/${idOf(created)}`, { price: 1 })).toEqual([
        404,
        'Item price not found',
      ]);
      expect(await refused('DELETE', `/item-prices/${idOf(created)}`)).toEqual([
        404,
        'Item price not found',
      ]);
      // A deleted price no longer blocks its dates.
      await h.ok('POST', '/item-prices', priceBody(itemId));
    });

    it('refuses overlapping active prices; dates are inclusive at both ends', async () => {
      const itemId = idOf(await item('Overlap'));
      const old = await h.ok(
        'POST',
        '/item-prices',
        priceBody(itemId, { effectiveFrom: day(-30), effectiveTo: day(-1), price: 30 }),
      );
      const current = await h.ok('POST', '/item-prices', priceBody(itemId, { price: 35 }));
      const overlap = 'An active price already exists for this item, rate type, and date range.';

      // A one-day price is allowed, so a day the old price covers overlaps it.
      expect(
        await refused(
          'POST',
          '/item-prices',
          priceBody(itemId, { effectiveFrom: day(-1), effectiveTo: day(-1) }),
        ),
      ).toEqual([409, overlap]);
      expect(
        await refused(
          'POST',
          '/item-prices',
          priceBody(itemId, { effectiveFrom: day(-5), effectiveTo: day(-2) }),
        ),
      ).toEqual([409, overlap]);
      // An open-ended price overlaps everything after it starts.
      expect(
        await refused('POST', '/item-prices', priceBody(itemId, { effectiveFrom: day(400) })),
      ).toEqual([409, overlap]);
      // Ending on the day the current price starts overlaps it.
      expect(await refused('PUT', `/item-prices/${idOf(old)}`, { effectiveTo: day(0) })).toEqual([
        409,
        overlap,
      ]);

      // Another rate type, another restaurant level, or an inactive price may share the dates.
      await h.ok('POST', '/item-prices', priceBody(itemId, { rateType: 'STAFF', price: 20 }));
      await h.ok(
        'POST',
        '/item-prices',
        priceBody(itemId, { restaurantId: fx.restaurantId, price: 50 }),
      );
      const parked = await h.ok(
        'POST',
        '/item-prices',
        priceBody(itemId, { isActive: false, price: 99 }),
      );
      expect(parked).toMatchObject({ isActive: false });
      expect(await refused('PUT', `/item-prices/${idOf(parked)}`, { isActive: true })).toEqual([
        409,
        overlap,
      ]);

      // Closing the current price makes room for the next one.
      await h.ok('PUT', `/item-prices/${idOf(current)}`, { effectiveTo: day(9) });
      const next = await h.ok(
        'POST',
        '/item-prices',
        priceBody(itemId, { effectiveFrom: day(10), price: 38 }),
      );

      // Prices in force on a date.
      const on = async (date: string) =>
        (await listed(`/item-prices?itemId=${itemId}&rateType=NORMAL&effectiveDate=${date}`))
          .filter((price) => price.restaurantId === null && price.isActive)
          .map((price) => price.price);
      expect(await on(day(-1))).toEqual([30]);
      expect(await on(day(9))).toEqual([35]);
      expect(await on(day(10))).toEqual([38]);
      expect(await on(day(-31))).toEqual([]);
      expect(idOf(next)).toBeTruthy();
    });

    it('resolves the current price: the restaurant’s own first, then the location’s', async () => {
      const itemId = idOf(await item('Resolved'));
      const resolve = (query: string) =>
        h.ok(
          'GET',
          `/item-prices/resolve?hospitalId=${fx.hospitalId}&itemId=${itemId}&rateType=NORMAL${query}`,
        );

      expect(await resolve('')).toEqual({
        itemPrice: null,
        price: null,
        source: 'MISSING',
        status: 'PRICE_MISSING',
      });

      await h.ok(
        'POST',
        '/item-prices',
        priceBody(itemId, { effectiveFrom: day(-10), effectiveTo: day(-1), price: 30 }),
      );
      await h.ok('POST', '/item-prices', priceBody(itemId, { price: 35 }));
      await h.ok(
        'POST',
        '/item-prices',
        priceBody(itemId, { effectiveFrom: day(5), restaurantId: fx.restaurantId, price: 50 }),
      );

      const today = await resolve('');
      expect(shape(today)).toMatchObject({ itemPrice: expect.any(Object) as unknown });
      expect([today.price, today.source, today.status]).toEqual([35, 'LOCATION', 'FOUND']);
      expect(await resolve(`&date=${day(-3)}`)).toMatchObject({ price: 30, source: 'LOCATION' });
      expect(await resolve(`&date=${day(-11)}`)).toMatchObject({ source: 'MISSING' });
      // The restaurant's own price wins once in force; before that the location's applies.
      expect(await resolve(`&restaurantId=${fx.restaurantId}`)).toMatchObject({
        price: 35,
        source: 'LOCATION',
      });
      expect(await resolve(`&restaurantId=${fx.restaurantId}&date=${day(5)}`)).toMatchObject({
        price: 50,
        source: 'RESTAURANT',
      });
      // A price for another rate type is not used.
      expect(
        await h.ok(
          'GET',
          `/item-prices/resolve?hospitalId=${fx.hospitalId}&itemId=${itemId}&rateType=ROOM`,
        ),
      ).toMatchObject({ source: 'MISSING' });
    });

    it('validates prices, GST, dates and what they belong to', async () => {
      const itemId = idOf(await item('Invalid Price'));
      const bad = (extra: Body) => refused('POST', '/item-prices', priceBody(itemId, extra));

      expect(await refused('POST', '/item-prices', {})).toEqual([
        400,
        'hospitalId must be a UUID, itemId must be a UUID, rateType must be one of the following values: NORMAL, STAFF, ROOM, COUNTER, price must not be less than 0.01, price must be a number conforming to the specified constraints, effectiveFrom must be a valid ISO 8601 date string',
      ]);
      expect(await bad({ price: 0 })).toEqual([400, 'price must not be less than 0.01']);
      expect(await bad({ price: 1.234 })).toEqual([
        400,
        'price must be a number conforming to the specified constraints',
      ]);
      expect(await bad({ gstPercent: 7 })).toEqual([
        400,
        'gstPercent must be one of the following values: 0, 5, 12, 18',
      ]);
      // Tax-inclusive is the default, and needs a GST slab.
      expect(await bad({ gstPercent: undefined })).toEqual([
        400,
        'GST Percentage is required when Tax Inclusive is enabled.',
      ]);
      expect(
        await h.ok(
          'POST',
          '/item-prices',
          priceBody(itemId, {
            gstPercent: undefined,
            isTaxInclusive: false,
            rateType: 'COUNTER',
          }),
        ),
      ).toMatchObject({ gstPercent: null, isTaxInclusive: false });
      expect(await bad({ effectiveFrom: day(3), effectiveTo: day(2) })).toEqual([
        400,
        'Effective To cannot be before Effective From',
      ]);
      expect(await bad({ effectiveFrom: 'tomorrow' })).toEqual([
        400,
        'effectiveFrom must be a valid ISO 8601 date string',
      ]);
      expect(await bad({ hospitalId: randomUUID() })).toEqual([400, 'Location not found']);
      expect(await bad({ itemId: randomUUID() })).toEqual([400, 'Item not found']);
      expect(await bad({ restaurantId: randomUUID() })).toEqual([
        400,
        'Restaurant not found for selected location',
      ]);
      // A restaurant at another location.
      expect(await bad({ hospitalId: fx.otherHospitalId, restaurantId: fx.restaurantId })).toEqual([
        400,
        'Restaurant not found for selected location',
      ]);
      expect(await refused('GET', `/item-prices/${randomUUID()}`)).toEqual([
        404,
        'Item price not found',
      ]);
      expect(await refused('GET', `/item-prices/resolve?hospitalId=${fx.hospitalId}`)).toEqual([
        400,
        'itemId must be a UUID, rateType must be one of the following values: NORMAL, STAFF, ROOM, COUNTER',
      ]);
    });
  });

  describe('store and kitchen item mappings', () => {
    it('maps an item to a store, refuses an exact repeat, and allows another category', async () => {
      const it = await item('Bottled Water');
      const created = await storeMap(idOf(it));
      expect(shape(created)).toMatchInlineSnapshot(`
        {
          "category": {
            "categoryName": "string",
            "id": "string",
            "isActive": "boolean",
          },
          "categoryId": "string",
          "createdAt": "string",
          "deletedAt": null,
          "id": "string",
          "isActive": "boolean",
          "item": {
            "id": "string",
            "isActive": "boolean",
            "itemCode": "string",
            "itemName": "string",
            "itemType": "string",
            "type": "string",
          },
          "itemId": "string",
          "store": {
            "hospital": {
              "hospitalCode": "string",
              "hospitalName": "string",
              "id": "string",
              "isActive": "boolean",
            },
            "id": "string",
            "isActive": "boolean",
            "storeCode": "string",
            "storeName": "string",
          },
          "storeId": "string",
          "updatedAt": "string",
        }
      `);
      expect(created).toMatchObject({
        categoryId: fx.categoryId,
        isActive: true,
        item: { itemType: 'MRP' },
        storeId: fx.storeId,
      });
      expect(await h.ok('GET', `/store-items/${idOf(created)}`)).toEqual(created);

      expect(
        await refused('POST', '/store-items', {
          categoryId: fx.categoryId,
          itemId: idOf(it),
          storeId: fx.storeId,
        }),
      ).toEqual([409, 'Store item mapping already exists for this category']);
      const second = await storeMap(idOf(it), await category('Second'));
      expect((await listed(`/store-items?itemId=${idOf(it)}`)).map(idOf).sort()).toEqual(
        [idOf(created), idOf(second)].sort(),
      );
      expect(
        (
          await listed(
            `/store-items?itemId=${idOf(it)}&storeId=${fx.storeId}&hospitalId=${fx.hospitalId}`,
          )
        ).length,
      ).toBe(2);
      expect(
        (await h.ok('GET', `/store-items?search=${encodeURIComponent(it.itemName as string)}`))
          .meta,
      ).toMatchObject({ total: 2 });

      // Moving the second mapping onto the first's category repeats it.
      expect(
        await refused('PUT', `/store-items/${idOf(second)}`, { categoryId: fx.categoryId }),
      ).toEqual([409, 'Store item mapping already exists for this category']);
      const third = await category('Third');
      expect(
        await h.ok('PUT', `/store-items/${idOf(second)}`, { categoryId: third }),
      ).toMatchObject({ categoryId: third });
      expect(await h.ok('PUT', `/store-items/${idOf(second)}`, { isActive: false })).toMatchObject({
        isActive: false,
      });
      expect((await listed(`/store-items?itemId=${idOf(it)}&isActive=true`)).map(idOf)).toEqual([
        idOf(created),
      ]);
    });

    it('keeps an item to one kind: MRP in stores or ready-made in kitchens', async () => {
      const mrp = await item('Chips');
      await storeMap(idOf(mrp));
      expect(
        await refused('POST', '/kitchen-items', {
          categoryId: fx.categoryId,
          itemId: idOf(mrp),
          kitchenId: fx.kitchenId,
        }),
      ).toEqual([
        400,
        `${String(mrp.itemName)} is an MRP item (mapped to stores), so it cannot be mapped to a kitchen.`,
      ]);

      const ready = await item('Dal');
      const kitchenItem = await kitchenMap(idOf(ready));
      expect(kitchenItem).toMatchObject({
        item: { itemType: 'READYMADE' },
        kitchenId: fx.kitchenId,
      });
      expect(
        await refused('POST', '/store-items', {
          categoryId: fx.categoryId,
          itemId: idOf(ready),
          storeId: fx.storeId,
        }),
      ).toEqual([
        400,
        `${String(ready.itemName)} is a Readymade item (mapped to kitchens), so it cannot be mapped to a store.`,
      ]);

      // Removing a mistaken mapping (never stocked) frees the item to be mapped the other way.
      expect(await h.ok('DELETE', `/kitchen-items/${idOf(kitchenItem)}`)).toEqual({
        id: idOf(kitchenItem),
      });
      expect(await h.ok('GET', `/items/${idOf(ready)}`)).toMatchObject({ itemType: null });
      expect(await storeMap(idOf(ready))).toMatchObject({ item: { itemType: 'MRP' } });
    });

    it('creates, reads, lists, updates and deletes a kitchen mapping', async () => {
      const it = await item('Paneer');
      const created = await kitchenMap(idOf(it));
      expect(Object.keys(created).sort()).toEqual([
        'category',
        'categoryId',
        'createdAt',
        'deletedAt',
        'id',
        'isActive',
        'item',
        'itemId',
        'kitchen',
        'kitchenId',
        'updatedAt',
      ]);
      expect(await h.ok('GET', `/kitchen-items/${idOf(created)}`)).toEqual(created);
      expect(
        (await listed(`/kitchen-items?itemId=${idOf(it)}&kitchenId=${fx.kitchenId}`)).map(idOf),
      ).toEqual([idOf(created)]);
      expect(
        await refused('POST', '/kitchen-items', {
          categoryId: fx.categoryId,
          itemId: idOf(it),
          kitchenId: fx.kitchenId,
        }),
      ).toEqual([409, 'Kitchen item mapping already exists for this category']);
      expect(
        await h.ok('PUT', `/kitchen-items/${idOf(created)}`, { isActive: false }),
      ).toMatchObject({ isActive: false });
      await h.ok('DELETE', `/kitchen-items/${idOf(created)}`);
      for (const method of ['GET', 'PUT', 'DELETE']) {
        expect(
          await refused(
            method,
            `/kitchen-items/${idOf(created)}`,
            method === 'PUT' ? {} : undefined,
          ),
        ).toEqual([404, 'Kitchen item mapping not found']);
      }
      expect(await refused('GET', `/store-items/${randomUUID()}`)).toEqual([
        404,
        'Store item mapping not found',
      ]);
    });

    it('validates mapping bodies and parents', async () => {
      const it = idOf(await item('Mapless'));
      expect(await refused('POST', '/store-items', {})).toEqual([
        400,
        'storeId must be a UUID, itemId must be a UUID, categoryId must be a UUID',
      ]);
      expect(await refused('POST', '/kitchen-items', { itemId: it })).toEqual([
        400,
        'kitchenId must be a UUID, categoryId must be a UUID',
      ]);
      expect(
        await refused('POST', '/store-items', {
          categoryId: fx.categoryId,
          itemId: it,
          storeId: randomUUID(),
        }),
      ).toEqual([400, 'Store not found or inactive']);
      expect(
        await refused('POST', '/kitchen-items', {
          categoryId: fx.categoryId,
          itemId: it,
          kitchenId: randomUUID(),
        }),
      ).toEqual([400, 'Kitchen not found or inactive']);
      expect(
        await refused('POST', '/store-items', {
          categoryId: fx.categoryId,
          itemId: randomUUID(),
          storeId: fx.storeId,
        }),
      ).toEqual([400, 'Item not found']);
      // A refused mapping leaves the item unclassified.
      expect(await h.ok('GET', `/items/${it}`)).toMatchObject({ itemType: null });
    });
  });

  describe('restaurant menus', () => {
    it('puts a mapped item on the menu, and reads, lists, updates and deletes it', async () => {
      const it = await item('Thali');
      await kitchenMap(idOf(it));
      const created = await h.ok(
        'POST',
        '/restaurant-menus',
        menuBody(idOf(it), {
          accompaniments: ' Pickle, curd ',
          addOn: '   ',
          availableFrom: '11:00',
          availableTo: '15:30',
          daysOfWeek: ['MONDAY', 'FRIDAY'],
          gstPercent: 5,
          serves: 2,
        }),
      );
      expect(shape(created)).toMatchInlineSnapshot(`
        {
          "accompaniments": "string",
          "addOn": null,
          "availableFrom": "string",
          "availableTo": "string",
          "category": {
            "categoryName": "string",
            "id": "string",
            "isActive": "boolean",
          },
          "categoryId": "string",
          "createdAt": "string",
          "daysOfWeek": [
            "string",
          ],
          "deletedAt": null,
          "displayOrder": "number",
          "gstPercent": "number",
          "hospitalId": "string",
          "id": "string",
          "isActive": "boolean",
          "isAvailable": "boolean",
          "isDiscountable": "boolean",
          "isFeatured": "boolean",
          "isGstInclusive": "boolean",
          "item": {
            "id": "string",
            "isActive": "boolean",
            "itemCode": "string",
            "itemName": "string",
            "itemType": "string",
            "type": "string",
          },
          "itemId": "string",
          "kitchen": {
            "id": "string",
            "isActive": "boolean",
            "kitchenCode": "string",
            "kitchenName": "string",
          },
          "kitchenId": "string",
          "menuItemCode": "string",
          "preparationTimeMinutes": null,
          "price": "number",
          "restaurant": {
            "hospital": {
              "hospitalCode": "string",
              "hospitalName": "string",
              "id": "string",
              "isActive": "boolean",
            },
            "id": "string",
            "isActive": "boolean",
            "restaurantCode": "string",
            "restaurantName": "string",
          },
          "restaurantId": "string",
          "roomPrice": "number",
          "serveAt": "string",
          "serves": "number",
          "store": null,
          "storeId": null,
          "subCode": null,
          "updatedAt": "string",
        }
      `);
      // Text is trimmed (blank becomes null); the rest takes defaults.
      expect(created).toMatchObject({
        accompaniments: 'Pickle, curd',
        addOn: null,
        availableFrom: '11:00',
        availableTo: '15:30',
        daysOfWeek: ['MONDAY', 'FRIDAY'],
        gstPercent: 5,
        hospitalId: fx.hospitalId,
        isActive: true,
        isAvailable: true,
        isDiscountable: false,
        isFeatured: false,
        isGstInclusive: false,
        price: 100,
        roomPrice: 120,
        serveAt: 'BOTH',
        serves: 2,
      });
      expect(created.menuItemCode).toMatch(/^RMI\d+$/);
      expect(await h.ok('GET', `/restaurant-menus/${idOf(created)}`)).toEqual(created);
      expect(
        (await listed(`/restaurant-menus?restaurantId=${fx.restaurantId}&itemId=${idOf(it)}`)).map(
          idOf,
        ),
      ).toEqual([idOf(created)]);

      const updated = await h.ok('PUT', `/restaurant-menus/${idOf(created)}`, {
        availableFrom: null,
        availableTo: null,
        price: 110.5,
        serveAt: 'COUNTER',
      });
      expect(updated).toMatchObject({
        availableFrom: null,
        availableTo: null,
        price: 110.5,
        // Not cleared: a counter-only item keeps its old in-room price.
        roomPrice: 120,
        serveAt: 'COUNTER',
      });
      expect(
        await h.ok('PUT', `/restaurant-menus/${idOf(created)}`, { isAvailable: false }),
      ).toMatchObject({ isAvailable: false });
      expect(
        (
          await listed(
            `/restaurant-menus?restaurantId=${fx.restaurantId}&isAvailable=false&itemId=${idOf(it)}`,
          )
        ).length,
      ).toBe(1);

      expect(await h.ok('DELETE', `/restaurant-menus/${idOf(created)}`)).toEqual({
        id: idOf(created),
      });
      for (const method of ['GET', 'PUT', 'DELETE']) {
        expect(
          await refused(
            method,
            `/restaurant-menus/${idOf(created)}`,
            method === 'PUT' ? {} : undefined,
          ),
        ).toEqual([404, 'Restaurant menu mapping not found']);
      }
      // Deleted: the item may go on the menu again under the same category.
      await h.ok('POST', '/restaurant-menus', menuBody(idOf(it)));
    });

    it('sells only what Item Mapping gives the restaurant’s location, from a kitchen or a store', async () => {
      const cooked = await item('Biryani');
      await kitchenMap(idOf(cooked));
      const packaged = await item('Juice');
      await storeMap(idOf(packaged));
      const choose =
        'Choose where it comes from: the kitchen that makes it or the store that stocks it.';

      expect(
        await refused('POST', '/restaurant-menus', menuBody(idOf(cooked), { kitchenId: null })),
      ).toEqual([400, choose]);
      expect(
        await refused('POST', '/restaurant-menus', menuBody(idOf(cooked), { storeId: fx.storeId })),
      ).toEqual([400, choose]);
      expect(await refused('POST', '/restaurant-menus', menuBody(idOf(packaged)))).toEqual([
        400,
        "This item isn't mapped to that kitchen under this category at this restaurant's location. Pick it from Item Mapping.",
      ]);
      expect(
        await refused(
          'POST',
          '/restaurant-menus',
          menuBody(idOf(cooked), { categoryId: await category('Unmapped') }),
        ),
      ).toEqual([
        400,
        "This item isn't mapped to that kitchen under this category at this restaurant's location. Pick it from Item Mapping.",
      ]);
      const fromStore = await h.ok(
        'POST',
        '/restaurant-menus',
        menuBody(idOf(packaged), { kitchenId: undefined, storeId: fx.storeId }),
      );
      expect(fromStore).toMatchObject({ kitchenId: null, storeId: fx.storeId });

      const fromKitchen = await h.ok('POST', '/restaurant-menus', menuBody(idOf(cooked)));
      expect(await refused('POST', '/restaurant-menus', menuBody(idOf(cooked)))).toEqual([
        409,
        'This item is already on the menu under this category',
      ]);
      // Switching an entry to a source the item isn't mapped to is refused too.
      expect(
        await refused('PUT', `/restaurant-menus/${idOf(fromKitchen)}`, {
          kitchenId: null,
          storeId: fx.storeId,
        }),
      ).toEqual([
        400,
        "This item isn't mapped to that store under this category at this restaurant's location. Pick it from Item Mapping.",
      ]);
      expect(
        await refused(
          'POST',
          '/restaurant-menus',
          menuBody(idOf(cooked), { restaurantId: randomUUID() }),
        ),
      ).toEqual([400, 'Restaurant not found or inactive']);
    });

    it('validates prices for where it is served, the time slot and the fields', async () => {
      const it = await item('Validated');
      await kitchenMap(idOf(it));
      const bad = (extra: Body) => refused('POST', '/restaurant-menus', menuBody(idOf(it), extra));

      expect(await bad({ price: null })).toEqual([
        400,
        'Price is required for an item served at the counter',
      ]);
      expect(await bad({ roomPrice: undefined, serveAt: 'ROOM' })).toEqual([
        400,
        'In-room price is required for an item served in rooms',
      ]);
      expect(await bad({ availableFrom: '07:00' })).toEqual([
        400,
        'Set both the from and to times, or neither for all day',
      ]);
      expect(await bad({ availableFrom: '07:00', availableTo: '07:00' })).toEqual([
        400,
        'The from and to times cannot be the same',
      ]);
      expect(await bad({ availableFrom: '7:00', availableTo: '24:00' })).toEqual([
        400,
        'availableFrom must use HH:mm format, availableTo must use HH:mm format',
      ]);
      expect(await bad({ daysOfWeek: ['FUNDAY'] })).toEqual([
        400,
        'each value in daysOfWeek must be one of the following values: FRIDAY, MONDAY, SATURDAY, SUNDAY, THURSDAY, TUESDAY, WEDNESDAY',
      ]);
      expect(await bad({ daysOfWeek: ['MONDAY', 'MONDAY'] })).toEqual([
        400,
        "All daysOfWeek's elements must be unique",
      ]);
      expect(await bad({ gstPercent: 7 })).toEqual([
        400,
        'gstPercent must be one of the following values: 0, 5, 12, 18',
      ]);
      expect(await bad({ positionType: 'BEFORE_ITEM' })).toEqual([
        400,
        'referenceMenuId must be a UUID',
      ]);
      expect(await bad({ positionType: 'AFTER_ITEM', referenceMenuId: randomUUID() })).toEqual([
        400,
        'Reference menu item not found for selected restaurant',
      ]);
      expect(await bad({ price: -1, serves: 0 })).toEqual([
        400,
        'serves must not be less than 1, price must not be less than 0',
      ]);
      expect(await refused('POST', '/restaurant-menus', {})).toEqual([
        400,
        'restaurantId must be a UUID, itemId must be a UUID, categoryId must be a UUID',
      ]);
      expect(
        await refused('GET', `/restaurant-menus?restaurantId=${fx.restaurantId}&dayOfWeek=FUNDAY`),
      ).toEqual([
        400,
        'dayOfWeek must be one of the following values: FRIDAY, MONDAY, SATURDAY, SUNDAY, THURSDAY, TUESDAY, WEDNESDAY',
      ]);
      // A room-only item needs no counter price.
      expect(
        await h.ok(
          'POST',
          '/restaurant-menus',
          menuBody(idOf(it), { price: null, serveAt: 'ROOM' }),
        ),
      ).toMatchObject({ price: null, roomPrice: 120, serveAt: 'ROOM' });
    });

    it('places items first, last, before or after another, renumbering the menu', async () => {
      const restaurant = idOf(
        await h.ok('POST', '/restaurants', {
          hospitalId: fx.hospitalId,
          restaurantName: `Int Catalogue Order ${run}`,
        }),
      );
      const add = async (label: string, extra: Body = {}) => {
        const it = await item(label);
        await kitchenMap(idOf(it));
        return idOf(
          await h.ok(
            'POST',
            '/restaurant-menus',
            menuBody(idOf(it), { restaurantId: restaurant, ...extra }),
          ),
        );
      };
      const a = await add('A');
      const b = await add('B');
      const c = await add('C', { positionType: 'FIRST' });
      const d = await add('D', { positionType: 'AFTER_ITEM', referenceMenuId: a });
      const e = await add('E', { positionType: 'BEFORE_ITEM', referenceMenuId: c });
      const order = async (sort = '&sortOrder=asc') =>
        (await listed(`/restaurant-menus?restaurantId=${restaurant}${sort}`)).map((menu) => [
          idOf(menu),
          menu.displayOrder,
        ]);
      // Menu order (displayOrder ascending) unless the caller asks otherwise.
      expect(await order('')).toEqual(await order());
      expect((await order('&sortOrder=desc')).map(([id]) => id)).toEqual([b, d, a, c, e]);
      expect(await order()).toEqual([
        [e, 1],
        [c, 2],
        [a, 3],
        [d, 4],
        [b, 5],
      ]);
      // Moving one to the end leaves a gap where it was.
      await h.ok('PUT', `/restaurant-menus/${e}`, { positionType: 'LAST' });
      expect(await order()).toEqual([
        [c, 2],
        [a, 3],
        [d, 4],
        [b, 5],
        [e, 6],
      ]);
      expect(
        await refused('PUT', `/restaurant-menus/${e}`, {
          positionType: 'AFTER_ITEM',
          referenceMenuId: e,
        }),
      ).toEqual([400, 'Reference menu item cannot be the same menu item']);
      expect(await refused('PUT', `/restaurant-menus/${e}`, { referenceMenuId: a })).toEqual([
        400,
        'Position type is required when reference menu is selected',
      ]);
    });

    // An item with no days set is on sale every day, so every day's filter includes it.
    it('filters by day, counting every-day entries in', async () => {
      const everyDay = await onMenu('Every Day');
      const someDays = await onMenu('Some Days', { daysOfWeek: ['MONDAY', 'SUNDAY'] });
      const ids = async (query: string) =>
        (await listed(`/restaurant-menus?restaurantId=${fx.restaurantId}&limit=100${query}`)).map(
          idOf,
        );

      expect(await ids('&dayOfWeek=MONDAY')).toContain(idOf(someDays.menu));
      expect(await ids('&dayOfWeek=MONDAY')).toContain(idOf(everyDay.menu));
      expect(await ids('&dayOfWeek=TUESDAY')).not.toContain(idOf(someDays.menu));
      expect(await ids('&dayOfWeek=TUESDAY')).toContain(idOf(everyDay.menu));
      expect(await ids('')).toEqual(
        expect.arrayContaining([idOf(everyDay.menu), idOf(someDays.menu)]),
      );
    });
  });

  describe('what the kiosk shows', () => {
    it('shows only active items on sale now, by time slot and day', async () => {
      const { boardToken } = await h.ok('POST', `/restaurants/${fx.restaurantId}/board-link`, {
        regenerate: false,
      });
      const kiosk = async () =>
        list(
          await h.ok(
            'GET',
            `/kiosk/${fx.restaurantId}/menu?token=${encodeURIComponent(String(boardToken))}`,
            undefined,
            '',
          ),
        ).map((entry) => entry.id);

      const allDay = await onMenu('Kiosk All Day');
      const now = await onMenu('Kiosk Now', { availableFrom: hhmm(-60), availableTo: hhmm(60) });
      const later = await onMenu('Kiosk Later', {
        availableFrom: hhmm(120),
        availableTo: hhmm(180),
      });
      const today = await onMenu('Kiosk Today', { daysOfWeek: [istWeekday(0)] });
      const tomorrow = await onMenu('Kiosk Tomorrow', { daysOfWeek: [istWeekday(1)] });
      const sold = await onMenu('Kiosk Sold Out', { isAvailable: false });
      const roomOnly = await onMenu('Kiosk Room', { price: null, serveAt: 'ROOM' });
      const retired = await onMenu('Kiosk Retired');
      const offCategory = await category('Kiosk Off');
      const hidden = await onMenu('Kiosk Off Category', {}, offCategory);

      const before = await kiosk();
      for (const shown of [allDay, now, today, retired, hidden]) {
        expect(before).toContain(idOf(shown.menu));
      }
      for (const notShown of [later, tomorrow, sold, roomOnly]) {
        expect(before).not.toContain(idOf(notShown.menu));
      }

      // An inactive item leaves the kiosk; its menu entry stays as it is.
      await h.ok('PUT', `/items/${idOf(retired.item)}`, { isActive: false });
      await h.ok('PUT', `/item-categories/${offCategory}`, { isActive: false });
      const after = await kiosk();
      expect(after).not.toContain(idOf(retired.menu));
      expect(await h.ok('GET', `/restaurant-menus/${idOf(retired.menu)}`)).toMatchObject({
        isActive: true,
        item: { isActive: false },
      });
      // An inactive category takes its entries off the kiosk (and the till) too.
      expect(after).not.toContain(idOf(hidden.menu));

      expect(
        await refused('GET', `/kiosk/${fx.restaurantId}/menu?token=wrong`, undefined, ''),
      ).toEqual([404, 'This kiosk link is no longer valid.']);
    });
  });

  describe('menu import', () => {
    it('dry-runs, then adds a menu item from its item mapping', async () => {
      const it = await item('Imported Idli');
      await kitchenMap(idOf(it));
      const rows = [
        {
          itemCode: it.itemCode,
          locationCode: fx.hospitalCode,
          price: '55',
          restaurantCode: fx.restaurantCode,
          roomPrice: '65.5',
          gstPercent: '5',
          isFeatured: 'yes',
        },
      ];
      expect(await h.ok('POST', '/restaurant-menus/import', { dryRun: true, rows })).toEqual({
        created: 1,
        imported: false,
        rows: [{ action: 'create', errors: [] }],
        skipped: 0,
        updated: 0,
      });
      const entries = () =>
        listed(`/restaurant-menus?restaurantId=${fx.restaurantId}&itemId=${idOf(it)}`);
      expect(await entries()).toEqual([]);

      expect(await h.ok('POST', '/restaurant-menus/import', { dryRun: false, rows })).toMatchObject(
        {
          created: 1,
          imported: true,
        },
      );
      expect(firstOf(await entries())).toMatchObject({
        categoryId: fx.categoryId,
        gstPercent: 5,
        isFeatured: true,
        kitchenId: fx.kitchenId,
        price: 55,
        roomPrice: 65.5,
        serveAt: 'BOTH',
        storeId: null,
      });
      // The same row again changes nothing; a new price updates the entry.
      expect(await h.ok('POST', '/restaurant-menus/import', { dryRun: true, rows })).toMatchObject({
        rows: [{ action: 'skip', errors: [] }],
      });
      expect(
        await h.ok('POST', '/restaurant-menus/import', {
          dryRun: false,
          rows: [{ ...rows[0], price: '60' }],
        }),
      ).toMatchObject({ imported: true, rows: [{ action: 'update', errors: [] }], updated: 1 });
      expect(firstOf(await entries())).toMatchObject({ price: 60, roomPrice: 65.5 });
    });

    it('reports rows it cannot place and saves none of them', async () => {
      const unmapped = await item('Import Unmapped');
      const result = await h.ok('POST', '/restaurant-menus/import', {
        dryRun: false,
        rows: [
          { itemCode: `NOPE${run}`, restaurantCode: `NOPE${run}` },
          {
            itemCode: unmapped.itemCode,
            locationCode: fx.hospitalCode,
            price: '10',
            restaurantCode: fx.restaurantCode,
            roomPrice: '10',
          },
          {},
        ],
      });
      const upper = run.toUpperCase();
      expect(result).toEqual({
        created: 0,
        imported: false,
        rows: [
          {
            action: 'create',
            errors: [
              `No restaurant you can reach has code NOPE${upper}`,
              `No item has code NOPE${upper}`,
            ],
          },
          {
            action: 'create',
            errors: [
              `${String(unmapped.itemName)} isn't mapped to a store or kitchen at ${fx.restaurantName}'s location. Map it in Item Mapping first.`,
            ],
          },
          { action: 'create', errors: ['Restaurant code is required', 'Item code is required'] },
        ],
        skipped: 0,
        updated: 0,
      });
      expect(
        await listed(`/restaurant-menus?restaurantId=${fx.restaurantId}&itemId=${idOf(unmapped)}`),
      ).toEqual([]);
    });
  });

  describe('sign-in, permissions and location scope', () => {
    const paths = [
      '/item-categories',
      '/items',
      '/item-prices',
      '/store-items',
      '/kitchen-items',
      '/restaurant-menus',
    ];

    it('refuses every catalogue route without a token', async () => {
      for (const path of paths) {
        expect(await refused('GET', path, undefined, '')).toEqual([401, 'Unauthorized']);
        expect(await refused('POST', path, {}, '')).toEqual([401, 'Unauthorized']);
        expect(await refused('GET', `${path}/${randomUUID()}`, undefined, '')).toEqual([
          401,
          'Unauthorized',
        ]);
      }
      expect(await refused('POST', '/items/import', { dryRun: true, rows: [{}] }, '')).toEqual([
        401,
        'Unauthorized',
      ]);
    });

    it('lets a viewer read but not write', async () => {
      const as = fx.viewer;
      for (const path of paths) {
        expect((await h.api('GET', `${path}?limit=1`, undefined, as)).status).toBe(200);
        expect(await refused('POST', path, {}, as)).toEqual([403, 'Forbidden resource']);
        // Categories are only switched off: they have no DELETE route at all.
        expect(await refused('DELETE', `${path}/${randomUUID()}`, undefined, as)).toEqual(
          path === '/item-categories'
            ? [404, expect.stringMatching(/^Cannot DELETE/)]
            : [403, 'Forbidden resource'],
        );
      }
      expect(await refused('PUT', '/item-categories/order', { ids: [fx.categoryId] }, as)).toEqual([
        403,
        'Forbidden resource',
      ]);
      expect(
        await refused('POST', '/restaurant-menus/import', { dryRun: true, rows: [{}] }, as),
      ).toEqual([403, 'Forbidden resource']);

      // ITEM_UPDATE alone is not enough: items are shared by every location, so a viewer kept to
      // one location can neither import nor edit them.
      const shared = [403, 'Only a Super Admin can change items shared by every location'];
      expect(
        await refused(
          'POST',
          '/items/import',
          { dryRun: true, rows: [{ itemName: name('Viewer Add'), type: 'veg' }] },
          as,
        ),
      ).toEqual(shared);
      const mine = await item('Viewer Edit');
      expect(await refused('PUT', `/items/${idOf(mine)}`, { hsnCode: '1234' }, as)).toEqual(shared);
    });

    it('keeps a single-location viewer to its own location’s mappings, menus and prices', async () => {
      const as = fx.viewer;
      const it = await item('Scoped');
      const storeItem = await storeMap(idOf(it));
      const ready = await onMenu('Scoped Menu');
      const price = await h.ok('POST', '/item-prices', {
        effectiveFrom: day(0),
        gstPercent: 5,
        hospitalId: fx.hospitalId,
        itemId: idOf(it),
        price: 10,
        rateType: 'NORMAL',
      });

      // Items and categories are shared by every location.
      expect((await h.api('GET', `/items/${idOf(it)}`, undefined, as)).status).toBe(200);
      expect((await h.api('GET', `/item-categories/${fx.categoryId}`, undefined, as)).status).toBe(
        200,
      );

      // Another location's rows are out of sight: not listed, and not found by id.
      expect(
        (await h.ok('GET', `/store-items?itemId=${idOf(it)}`, undefined, as)).meta,
      ).toMatchObject({ total: 0 });
      expect(await refused('GET', `/store-items/${idOf(storeItem)}`, undefined, as)).toEqual([
        404,
        'Store item mapping not found',
      ]);
      expect(
        (await h.ok('GET', `/kitchen-items?itemId=${idOf(ready.item)}`, undefined, as)).meta,
      ).toMatchObject({ total: 0 });
      expect(await refused('GET', `/restaurant-menus/${idOf(ready.menu)}`, undefined, as)).toEqual([
        404,
        'Restaurant menu mapping not found',
      ]);
      expect(
        (await h.ok('GET', `/item-prices?itemId=${idOf(it)}`, undefined, as)).meta,
      ).toMatchObject({ total: 0 });
      expect(await refused('GET', `/item-prices/${idOf(price)}`, undefined, as)).toEqual([
        404,
        'Item price not found',
      ]);
      // Asking for another location by id is refused outright.
      for (const path of ['/item-prices', '/store-items', '/restaurant-menus']) {
        expect(await refused('GET', `${path}?hospitalId=${fx.hospitalId}`, undefined, as)).toEqual([
          403,
          'This location is outside your assigned access',
        ]);
      }
      expect(
        await refused(
          'GET',
          `/item-prices/resolve?hospitalId=${fx.hospitalId}&itemId=${idOf(it)}&rateType=NORMAL`,
          undefined,
          as,
        ),
      ).toEqual([403, 'This location is outside your assigned access']);
    });
  });
});
