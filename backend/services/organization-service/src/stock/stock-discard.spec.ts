import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { discardProblem, discardRemarks } from './stock-discard';
import { StockDiscardService } from './stock-discard.service';

test('the ledger shows what the batch holds after a discard, even when a sale took some meanwhile', async () => {
  // Read at 10; a sale takes 1 before the discard of 2 lands, so 7 are left, not 8.
  let held = new Prisma.Decimal(10);
  const ledger: Array<Record<string, unknown>> = [];
  const tx = {
    stockBalance: {
      findFirst: () => {
        const read = { availableQty: held, id: 'balance-1' };
        held = held.minus(1);
        return Promise.resolve(read);
      },
      findUniqueOrThrow: () => Promise.resolve({ availableQty: held }),
      updateMany: ({ data }: { data: { availableQty: { decrement: number } } }) => {
        held = held.minus(data.availableQty.decrement);
        return Promise.resolve({ count: 1 });
      },
    },
    stockLedger: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        ledger.push(data);
        return Promise.resolve({ id: 'ledger-1' });
      },
    },
  };
  const service = new StockDiscardService(
    { record: () => Promise.resolve() } as unknown as AuditLogService,
    {
      $transaction: (handler: (client: unknown) => unknown) => handler(tx),
    } as unknown as PrismaService,
  );

  const result = await service.discard(
    { quantity: 2, reason: 'EXPIRED', stockBalanceId: 'balance-1' },
    { actorId: 'user-1' },
  );

  assert.equal(ledger[0]!.balanceAfter, 7);
  assert.equal(result.availableQty, 7);
});

test('a discard may take up to what the batch holds, never more', () => {
  assert.equal(discardProblem(5, 5), null);
  assert.equal(discardProblem(5, 2.5), null);
  assert.equal(discardProblem(0.3, 0.1 + 0.2), null);
  assert.match(discardProblem(5, 5.001) ?? '', /Only 5 left/);
  assert.match(discardProblem(5, 0) ?? '', /above zero/);
});

test('the ledger remarks say why, with the note when one was given', () => {
  assert.equal(discardRemarks('EXPIRED'), 'Discarded: Expired');
  assert.equal(discardRemarks('DAMAGED', '  tin dented '), 'Discarded: Damaged: tin dented');
  assert.equal(discardRemarks('OTHER', ''), 'Discarded: Other');
});
