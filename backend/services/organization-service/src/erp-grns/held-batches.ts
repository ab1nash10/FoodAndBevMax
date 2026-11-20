import { GrnEntryStatus, type Prisma } from '@prisma/client';
import { toNumber } from '../common/values';

/** Quantities are kept to 3 decimals; sums of them are rounded back. */
export const round = (value: number) => Math.round(value * 1000) / 1000;

/** What a GRN row still has to move: sent, less what moved and what was closed. */
export const remainingOf = (row: {
  acceptedQty: Prisma.Decimal | null;
  rejectedQty: Prisma.Decimal | null;
  sentQty: Prisma.Decimal | null;
}) =>
  Math.max(
    0,
    round(
      toNumber(row.sentQty ?? 0) - toNumber(row.acceptedQty ?? 0) - toNumber(row.rejectedQty ?? 0),
    ),
  );

/** One batch of one item, as `heldForReturn` keys it. */
export const batchKey = (itemId: string, batchNumber: string | null) =>
  `${itemId}|${batchNumber ?? ''}`;

/**
 * Batches of these items the location still owes the vendor: an ERP return (flag 1) the Main
 * Store could not cover, still waiting. They are on hold at the location's counters (not sold)
 * until the return is settled or closed.
 */
export async function heldForReturn(
  client: Pick<Prisma.TransactionClient, 'grnEntry'>,
  hospitalId: string,
  itemIds: string[],
) {
  const rows = itemIds.length
    ? await client.grnEntry.findMany({
        select: {
          acceptedQty: true,
          batchNumber: true,
          itemId: true,
          rejectedQty: true,
          sentQty: true,
        },
        where: { flag: 1, hospitalId, itemId: { in: itemIds }, status: GrnEntryStatus.PENDING },
      })
    : [];

  return new Set(
    rows.filter((row) => remainingOf(row) > 0).map((row) => batchKey(row.itemId, row.batchNumber)),
  );
}
