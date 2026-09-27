import { Prisma } from '@prisma/client';

type LockableTable = 'grns' | 'kitchen_productions' | 'transfers';

/**
 * Holds the document's row lock until the transaction ends.
 *
 * Posting, dispatching, cancelling, editing and deleting all read the status and then act on it.
 * Under READ COMMITTED two concurrent requests (a double click, a retry) both saw DRAFT, so a GRN
 * or production was credited to stock twice, or a transfer debited twice. Taken first, the lock
 * makes the second request wait and then read the status the first one committed.
 */
export async function lockRow(
  tx: Prisma.TransactionClient,
  table: LockableTable,
  id: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM ${Prisma.raw(`"${table}"`)} WHERE id = ${id}::uuid FOR UPDATE`;
}
