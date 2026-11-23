import type { InventoryLocationType, ItemType, Prisma } from '@prisma/client';

/** A stock row's unique key: where, what, and its batch, expiry and business day (any may be empty). */
export interface StockKey {
  batchNumber: string | null;
  businessDate: Date | null;
  expiryDate: Date | null;
  hospitalId: string;
  itemId: string;
  itemType: ItemType;
  locationId: string;
  locationType: InventoryLocationType;
}

/** What a DATE column holds: the UTC calendar day, as Prisma writes it. */
const day = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

/**
 * Adds stock to its row, making the row on the first receipt, in one statement. Find-then-create
 * let two first receipts at the same moment make two rows of the same stock; now the second adds
 * to the first's row, as the unique key counts an empty batch, expiry or day as one value
 * (20261123090000). Answers the row after. Stock rows are never soft-deleted.
 */
export async function addStock(
  client: Prisma.TransactionClient,
  key: StockKey,
  quantity: number,
  actorId?: string,
): Promise<{ availableQty: Prisma.Decimal; id: string }> {
  const [row] = await client.$queryRaw<Array<{ availableQty: Prisma.Decimal; id: string }>>`
    INSERT INTO stock_balances (stock_balance_id, hospital_id, location_type, location_id,
      item_id, item_type, batch_number, expiry_date, business_date, available_qty,
      last_updated_on, created_at, created_by, updated_at, updated_by)
    VALUES (gen_random_uuid(), ${key.hospitalId}::uuid,
      ${key.locationType}::"InventoryLocationType", ${key.locationId}::uuid, ${key.itemId}::uuid,
      ${key.itemType}::"ItemType", ${key.batchNumber}, ${day(key.expiryDate)}::date,
      ${day(key.businessDate)}::date, ${quantity}::numeric, now() AT TIME ZONE 'UTC',
      now() AT TIME ZONE 'UTC', ${actorId ?? null}::uuid, now() AT TIME ZONE 'UTC',
      ${actorId ?? null}::uuid)
    ON CONFLICT (hospital_id, location_type, location_id, item_id, batch_number, expiry_date,
      business_date)
    DO UPDATE SET available_qty = stock_balances.available_qty + EXCLUDED.available_qty,
      last_updated_on = EXCLUDED.last_updated_on, updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by
    RETURNING stock_balance_id AS id, available_qty AS "availableQty"`;

  return row!;
}
