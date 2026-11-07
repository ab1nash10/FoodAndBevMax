// The audit trail of stock changes over HTTP: posting a GRN writes its ledger lines and exactly one
// GRN_POST audit row in the same transaction, and when anything in that transaction fails,
// neither the stock nor the audit row is left behind. Runs only with DATABASE_URL_TEST.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditLogService } from './common/audit/audit-log.service.js';
import {
  databaseUrl,
  day,
  firstOf,
  run,
  startHarness,
  type Body,
  type Harness,
} from './testing/int-harness.js';

describe.skipIf(!databaseUrl)(
  'audit trail of stock changes (integration)',
  { timeout: 30_000 },
  () => {
    let h: Harness;
    const fx = { hospitalId: '', itemId: '', storeId: '' };
    let seq = 0;

    /** A draft GRN of two fresh batches (5 + 3) into the store. */
    async function draftGrn(): Promise<string> {
      seq += 1;
      const batches = [5, 3].map((qty, index) => ({
        acceptedQty: qty,
        batchNumber: `AU-${run}-${seq}-${index}`,
        expiryDate: day(60),
        receivedQty: qty,
        rejectedQty: 0,
      }));
      const grn = await h.ok('POST', '/grns', {
        hospitalId: fx.hospitalId,
        items: [{ acceptedQty: 8, batches, itemId: fx.itemId, receivedQty: 8, rejectedQty: 0 }],
        receivedBy: 'Audit test',
        receivedDate: day(0),
        storeId: fx.storeId,
        vendorName: `Vendor ${run}`,
      });
      return grn.id as string;
    }

    const ledgerRows = (grnId: string) =>
      h.rawQuery<{ qty: string }>(
        'SELECT qty_in::text AS qty FROM stock_ledgers WHERE reference_id = $1::uuid',
        grnId,
      );
    const postAuditRows = (grnId: string) =>
      h.rawQuery<{
        new_value: { batches: unknown[]; status: string };
        request_id: string | null;
        source: string | null;
        summary: string | null;
        user_id: string | null;
      }>(
        `SELECT new_value, request_id, source, summary, user_id
         FROM audit_logs WHERE entity_id = $1::uuid AND action = 'GRN_POST'`,
        grnId,
      );

    beforeAll(async () => {
      h = await startHarness();
      const store = firstOf(
        (await h.ok('GET', '/stores?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc'))
          .items as Body[],
      );
      fx.storeId = store.id as string;
      fx.hospitalId = store.hospitalId as string;
      const categoryId = (await h.ok('POST', '/item-categories', { categoryName: `Audit ${run}` }))
        .id;
      fx.itemId = (await h.ok('POST', '/items', { itemName: `Audit rice ${run}`, type: 'VEG' }))
        .id as string;
      await h.ok('POST', '/store-items', { categoryId, itemId: fx.itemId, storeId: fx.storeId });
    }, 60_000);

    afterEach(() => vi.restoreAllMocks());
    afterAll(() => h?.app.close());

    it('a GRN post writes its ledger lines and one GRN_POST row naming the batches', async () => {
      const grnId = await draftGrn();

      await h.ok('PATCH', `/grns/${grnId}/post-to-stock`);

      expect((await ledgerRows(grnId)).map((row) => Number(row.qty)).sort()).toEqual([3, 5]);
      const audit = await postAuditRows(grnId);
      expect(audit).toHaveLength(1);
      const [row] = audit;
      expect(row!.new_value.status).toBe('POSTED_TO_STOCK');
      expect(row!.new_value.batches).toHaveLength(2);
      // Item names are stored title-cased.
      expect(row!.summary?.toLowerCase()).toBe(
        `posted 8 of audit rice ${run} in 2 batch(es) to stock`,
      );
      expect(row!.source).toBe('api');
      expect(row!.request_id).toBeTruthy();
      expect(row!.user_id).toBe(h.superAdmin.id);
    });

    it('when the transaction fails, neither the stock nor the audit row remains', async () => {
      const grnId = await draftGrn();
      // The audit write is the transaction's last step: failing it must undo the ledger lines too.
      vi.spyOn(AuditLogService.prototype, 'record').mockRejectedValueOnce(new Error('forced'));

      const posted = await h.api('PATCH', `/grns/${grnId}/post-to-stock`);

      expect(posted.status).toBe(500);
      expect(posted.body.requestId).toBeTruthy();
      expect(await ledgerRows(grnId)).toEqual([]);
      expect(await postAuditRows(grnId)).toEqual([]);
      expect((await h.ok('GET', `/grns/${grnId}`)).status).toBe('DRAFT');
    });
  },
);
