import { strict as assert } from 'node:assert';
import { StockReferenceType } from '@prisma/client';
import { test } from 'vitest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { StockRepository } from './stock.repository';

// A Prisma stand-in: each model answers findMany with its rows for the ids asked, and records
// which models were asked at all.
function fakePrisma(rows: Record<string, Array<{ id: string } & Record<string, unknown>>>) {
  const asked: string[] = [];
  const model = (name: string) => ({
    findMany: ({ where }: { where: { id: { in: string[] } } }) => {
      asked.push(name);

      return Promise.resolve((rows[name] ?? []).filter((row) => where.id.in.includes(row.id)));
    },
  });

  return {
    asked,
    prisma: {
      grn: model('grn'),
      kitchenProduction: model('kitchenProduction'),
      restaurantOrder: model('restaurantOrder'),
      transfer: model('transfer'),
      transferAcknowledgement: model('transferAcknowledgement'),
    } as unknown as PrismaService,
  };
}

test('each ledger row gets the number of the document behind it', async () => {
  const { prisma } = fakePrisma({
    grn: [{ grnNumber: 'GRN000002', id: 'g1' }],
    kitchenProduction: [{ id: 'p1', productionNumber: 'PRD0002' }],
    restaurantOrder: [
      { billNumber: 'MAX/00000003', id: 'o1', orderNumber: 'ORD-1' },
      { billNumber: null, id: 'o2', orderNumber: 'ORD-2' },
    ],
    transfer: [{ id: 't1', transferNumber: 'TRF0002' }],
    transferAcknowledgement: [{ id: 'a1', transfer: { id: 't1', transferNumber: 'TRF0002' } }],
  });
  const documents = await new StockRepository(prisma).findReferenceDocuments([
    { referenceId: 'g1', referenceType: StockReferenceType.GRN },
    { referenceId: 'p1', referenceType: StockReferenceType.KITCHEN_PRODUCTION },
    { referenceId: 't1', referenceType: StockReferenceType.TRANSFER },
    { referenceId: 'a1', referenceType: StockReferenceType.TRANSFER_ACKNOWLEDGEMENT },
    { referenceId: 'o1', referenceType: StockReferenceType.ORDER },
    { referenceId: 'o2', referenceType: StockReferenceType.ORDER },
    { referenceId: 'gone', referenceType: StockReferenceType.GRN },
    { referenceId: null, referenceType: null },
  ]);

  assert.deepEqual(Object.fromEntries(documents), {
    // An acknowledgement opens as its transfer.
    a1: { id: 't1', number: 'TRF0002', type: 'TRANSFER' },
    g1: { id: 'g1', number: 'GRN000002', type: 'GRN' },
    // A bill by its bill number, its order number until it has one.
    o1: { id: 'o1', number: 'MAX/00000003', type: 'ORDER' },
    o2: { id: 'o2', number: 'ORD-2', type: 'ORDER' },
    p1: { id: 'p1', number: 'PRD0002', type: 'KITCHEN_PRODUCTION' },
    t1: { id: 't1', number: 'TRF0002', type: 'TRANSFER' },
  });
});

test('no query for a kind of document the page has none of', async () => {
  const { asked, prisma } = fakePrisma({ grn: [{ grnNumber: 'GRN000001', id: 'g1' }] });

  await new StockRepository(prisma).findReferenceDocuments([
    { referenceId: 'g1', referenceType: StockReferenceType.GRN },
    { referenceId: 'g1', referenceType: StockReferenceType.GRN },
  ]);
  assert.deepEqual(asked, ['grn']);
  assert.equal((await new StockRepository(prisma).findReferenceDocuments([])).size, 0);
  assert.deepEqual(asked, ['grn']);
});
