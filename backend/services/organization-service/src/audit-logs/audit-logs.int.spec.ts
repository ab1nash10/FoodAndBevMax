// The audit read API over HTTP: newest-first cursor pages, one record's history, the CSV export
// (itself recorded), the AUDIT_LOG_VIEW gate and location scoping. Runs only with DATABASE_URL_TEST.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  databaseUrl,
  firstOf,
  run,
  startHarness,
  type Body,
  type Harness,
} from '../testing/int-harness.js';

describe.skipIf(!databaseUrl)('audit read API (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  const fx = { categoryId: '', hospitalId: '', otherHospitalId: '' };

  /** A signed-in user of one hospital holding just these permissions. */
  async function userWith(hospitalId: string, permissions: string[]): Promise<string> {
    const [role] = await h.rawQuery<{ id: string }>(
      `INSERT INTO roles (id, name, location_scope, updated_at)
       VALUES (gen_random_uuid(), $1, 'SINGLE', now()) RETURNING id`,
      `Int Audit ${run} ${randomUUID().slice(0, 8)}`,
    );
    await h.rawQuery(
      `INSERT INTO role_permissions (id, role_id, permission_id, updated_at)
       SELECT gen_random_uuid(), $1::uuid, id, now() FROM permissions WHERE code = ANY($2::text[])`,
      role!.id,
      permissions,
    );
    const [user] = await h.rawQuery<{ id: string; sessionVersion: number }>(
      `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, 'Audit Reader', $2, $3::uuid, now())
       RETURNING id, session_version AS "sessionVersion"`,
      `AU${randomUUID().slice(0, 8)}`,
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
    const store = firstOf(
      (await h.ok('GET', '/stores?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc'))
        .items as Body[],
    );
    fx.hospitalId = store.hospitalId as string;
    const [other] = await h.rawQuery<{ id: string }>(
      `INSERT INTO hospitals (id, hospital_code, hospital_name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`,
      `AU${run}`.toUpperCase(),
      `Int Audit Other ${run}`,
    );
    fx.otherHospitalId = other!.id;
    // Three edits of one category: three rows of its history.
    fx.categoryId = (await h.ok('POST', '/item-categories', { categoryName: `Audit Cat ${run}` }))
      .id as string;
    for (const name of [`Audit Cat ${run} B`, `Audit Cat ${run} C`]) {
      await h.ok('PUT', `/item-categories/${fx.categoryId}`, { categoryName: name });
    }
  }, 60_000);

  afterAll(() => h?.app.close());

  it("a record's history comes newest first, as diffs, by cursor", async () => {
    const path = `/audit-logs/item_categories/${fx.categoryId}`;
    const first = await h.ok('GET', `${path}?limit=2`);
    const items = first.items as Body[];

    expect(items.map((row) => row.action)).toEqual([
      'ITEM_CATEGORY_UPDATE',
      'ITEM_CATEGORY_UPDATE',
    ]);
    // Only the changed field; names are stored title-cased.
    const name = (value: unknown) => String((value as Body).categoryName).toLowerCase();
    expect(Object.keys(items[0]!.newValue as Body)).toEqual(['categoryName']);
    expect(name(items[0]!.newValue)).toBe(`audit cat ${run} c`);
    expect(name(items[0]!.oldValue)).toBe(`audit cat ${run} b`);
    expect((items[0]!.user as Body).id).toBe(h.superAdmin.id);
    expect(first.nextCursor).toBeTruthy();

    const second = await h.ok('GET', `${path}?limit=2&cursor=${String(first.nextCursor)}`);
    expect((second.items as Body[]).map((row) => row.action)).toEqual(['ITEM_CATEGORY_CREATE']);
    expect(second.nextCursor).toBeNull();
  });

  it('filters by action and text, and refuses more than 200 a page', async () => {
    const found = await h.ok(
      'GET',
      `/audit-logs?action=ITEM_CATEGORY_CREATE&entityId=${fx.categoryId}`,
    );
    expect((found.items as Body[]).length).toBe(1);
    expect((await h.api('GET', '/audit-logs?limit=201')).status).toBe(400);
    expect((await h.api('GET', '/audit-logs?cursor=forged')).status).toBe(400);
  });

  it('exports CSV and records the export', async () => {
    const response = await fetch(
      `${h.baseUrl}/audit-logs/export?entityName=item_categories&entityId=${fx.categoryId}`,
      { headers: { Authorization: `Bearer ${h.signFor(h.superAdmin)}` } },
    );
    const csv = await response.text();

    expect(response.headers.get('content-type')).toMatch(/^text\/csv/);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toMatch(/^createdAt,action,entityName,entityId,recordName,summary,user/);
    expect(lines).toHaveLength(4);
    await vi.waitFor(async () => {
      const exports = await h.rawQuery<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs
          WHERE action = 'EXPORT' AND user_id = $1::uuid AND new_value->'filters'->>'entityId' = $2`,
        h.superAdmin.id,
        fx.categoryId,
      );
      expect(exports[0]!.n).toBe(1);
    });
  });

  it('needs AUDIT_LOG_VIEW, and a limited user sees only their own location', async () => {
    const without = await userWith(fx.hospitalId, ['ITEM_VIEW']);
    expect((await h.api('GET', '/audit-logs', undefined, without)).status).toBe(403);

    const reader = await userWith(fx.hospitalId, ['AUDIT_LOG_VIEW']);
    const mine = await h.ok('GET', '/audit-logs?limit=50', undefined, reader);
    expect((mine.items as Body[]).every((row) => row.hospitalId === fx.hospitalId)).toBe(true);
    // The category is a shared master (no location): not theirs to see.
    expect(
      (
        (await h.ok('GET', `/audit-logs/item_categories/${fx.categoryId}`, undefined, reader))
          .items as Body[]
      ).length,
    ).toBe(0);
    expect(
      (await h.api('GET', `/audit-logs?hospitalId=${fx.otherHospitalId}`, undefined, reader))
        .status,
    ).toBe(403);
  });
});
