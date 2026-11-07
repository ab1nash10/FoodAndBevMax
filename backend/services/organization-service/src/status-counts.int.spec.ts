// GET /grns?statusCounts=true over HTTP against a real database: the tab counts come from one
// grouped query, ignore the status tab being viewed, keep the other filters, and stay inside the
// caller's locations. The suite makes its own two locations, so other suites cannot move them.
//
// Runs only with DATABASE_URL_TEST: a migrated and seeded database it may write to.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  databaseUrl,
  day,
  firstOf,
  run,
  startHarness,
  type Body,
  type Harness,
} from './testing/int-harness.js';

const items = (data: Body) => data.items as Body[];
const idOf = (data: Body) => data.id as string;

describe.skipIf(!databaseUrl)('status counts (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  let hospitalId = '';
  let otherOnly = '';

  beforeAll(async () => {
    h = await startHarness();
    const ok = (...args: Parameters<Harness['ok']>) => h.ok(...args);
    // Creating a location also makes its Main Store.
    hospitalId = idOf(
      await ok('POST', '/hospitals', {
        city: 'Gurugram',
        locationCode: `SC${run}`,
        state: 'Haryana',
        title: `Int Counts ${run}`,
      }),
    );
    const otherId = idOf(
      await ok('POST', '/hospitals', {
        city: 'Noida',
        locationCode: `SO${run}`,
        state: 'Uttar Pradesh',
        title: `Int Counts Other ${run}`,
      }),
    );
    const storeId = idOf(firstOf(items(await ok('GET', `/stores?hospitalId=${hospitalId}`))));
    const categoryId = idOf(
      await ok('POST', '/item-categories', { categoryName: `Int Counts ${run}` }),
    );
    const itemId = idOf(await ok('POST', '/items', { itemName: `Int Count ${run}`, type: 'VEG' }));
    await ok('POST', '/store-items', { categoryId, itemId, storeId });

    const grn = (batchNumber: string) =>
      ok('POST', '/grns', {
        hospitalId,
        items: [
          {
            acceptedQty: 5,
            batches: [
              { acceptedQty: 5, batchNumber, expiryDate: day(60), receivedQty: 5, rejectedQty: 0 },
            ],
            itemId,
            receivedQty: 5,
            rejectedQty: 0,
          },
        ],
        receivedBy: 'Characterisation',
        receivedDate: day(0),
        storeId,
        vendorName: `Vendor SC ${run}`,
      });
    await grn(`SCD-${run}`);
    await ok('PATCH', `/grns/${idOf(await grn(`SCP-${run}`))}/post-to-stock`);

    // A user who may view GRNs, but only at the other location.
    const [user] = await h.rawQuery<{ id: string; sessionVersion: number }>(
      `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, now())
       RETURNING id, session_version AS "sessionVersion"`,
      `SC${run}`.toUpperCase(),
      `Counts Other ${run}`,
      `6${String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-9)}`,
      otherId,
    );
    await h.rawQuery(
      `INSERT INTO user_hospitals (id, user_id, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
      user!.id,
      otherId,
    );
    await h.rawQuery(
      `INSERT INTO user_permissions (id, user_id, permission_id, granted, updated_at)
       SELECT gen_random_uuid(), $1::uuid, id, true, now() FROM permissions WHERE code = 'GRN_VIEW'`,
      user!.id,
    );
    otherOnly = h.signFor(user!);
  }, 120_000);

  afterAll(() => h?.app.close());

  const meta = async (query: string, as?: string) => {
    const result = await h.api('GET', `/grns?${query}`, undefined, as);
    expect(result.status).toBe(200);
    return result.data.meta as Body;
  };

  it('counts every status at the location in the same request', async () => {
    expect(await meta(`hospitalId=${hospitalId}&limit=0&statusCounts=true`)).toMatchObject({
      statusCounts: { DRAFT: 1, POSTED_TO_STOCK: 1 },
      total: 2,
    });
  });

  it('the tab being viewed narrows the list, not the counts', async () => {
    expect(
      await meta(`hospitalId=${hospitalId}&limit=0&status=DRAFT&statusCounts=true`),
    ).toMatchObject({ statusCounts: { DRAFT: 1, POSTED_TO_STOCK: 1 }, total: 1 });
  });

  it('never counts outside the caller’s locations', async () => {
    const elsewhere = await h.api(
      'GET',
      `/grns?hospitalId=${hospitalId}&limit=0&statusCounts=true`,
      undefined,
      otherOnly,
    );
    expect(elsewhere.status).toBe(403);
    // Unfiltered, the counts cover only their own location, which has no GRNs.
    expect(await meta('limit=0&statusCounts=true', otherOnly)).toMatchObject({
      statusCounts: {},
      total: 0,
    });
  });

  // The posted GRN put one batch (60 days to expiry) into the store, with one ledger line.
  it('stock ledgers count every reference type in the same request', async () => {
    const result = await h.api(
      'GET',
      `/stock-ledgers?hospitalId=${hospitalId}&limit=0&referenceType=TRANSFER&referenceTypeCounts=true`,
    );
    expect(result.status).toBe(200);
    expect((result.data).meta).toMatchObject({ referenceTypeCounts: { GRN: 1 }, total: 0 });
  });

  it('store stock counts every state from one load', async () => {
    const result = await h.api(
      'GET',
      `/store-stock/summary?hospitalId=${hospitalId}&limit=0&statusCounts=true`,
    );
    expect(result.status).toBe(200);
    expect((result.data).meta).toMatchObject({ statusCounts: { AVAILABLE: 1 }, total: 1 });
  });

  it('without the flag the response is as before', async () => {
    expect(await meta(`hospitalId=${hospitalId}&limit=0`)).not.toHaveProperty('statusCounts');
  });
});
