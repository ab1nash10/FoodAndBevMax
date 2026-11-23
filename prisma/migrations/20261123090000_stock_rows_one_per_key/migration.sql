-- One stock row per place, item, batch, expiry and business day. The unique index never covered
-- rows with an empty batch, expiry or business day (Postgres counted NULLs as all different), so
-- two receipts at the same moment could make two rows of the same stock. This adds up any such
-- rows into the oldest one, then rebuilds the index with NULLS NOT DISTINCT (an empty value is
-- one value). Stock is now added with INSERT ... ON CONFLICT on that index.
-- Sales now keep the stock row they took from (stock_ledgers.stock_balance_id), so a cancel puts
-- the stock back on that row. No foreign key references stock_balances; the merge repoints
-- stock_balance_id itself.
-- Needs PostgreSQL 15 or newer: on an older server it stops before changing anything.
-- Each statement can run again safely if a deploy stops part way; the merge and the new index
-- are one statement, so they land together or not at all.

DO $$
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION 'Stock rows need PostgreSQL 15 or newer for NULLS NOT DISTINCT; this server runs %. Nothing was changed. Upgrade the database, run: npx prisma migrate resolve --rolled-back 20261123090000_stock_rows_one_per_key, then deploy again.',
      current_setting('server_version');
  END IF;
END $$;

ALTER TABLE "stock_ledgers" ADD COLUMN IF NOT EXISTS "stock_balance_id" UUID;

DO $$
BEGIN
  -- No stock can be added between the merge and the new index.
  LOCK TABLE "stock_balances" IN SHARE ROW EXCLUSIVE MODE;

  -- Each row with the row it is kept as: the oldest live row of its key. Live rows' quantities
  -- go to the kept row; soft-deleted duplicates (none are made today) add nothing.
  WITH ranked AS (
    SELECT "stock_balance_id" AS id,
           "deleted_at" IS NULL AS live,
           "available_qty",
           "reserved_qty",
           first_value("stock_balance_id") OVER (
             PARTITION BY "hospital_id", "location_type", "location_id", "item_id",
                          "batch_number", "expiry_date", "business_date"
             ORDER BY "deleted_at" IS NOT NULL, "created_at", "stock_balance_id"
           ) AS kept_id,
           count(*) OVER (
             PARTITION BY "hospital_id", "location_type", "location_id", "item_id",
                          "batch_number", "expiry_date", "business_date"
           ) AS copies
    FROM "stock_balances"
  ),
  totals AS (
    SELECT kept_id,
           sum("available_qty") FILTER (WHERE live) AS available_qty,
           sum("reserved_qty") FILTER (WHERE live) AS reserved_qty
    FROM ranked
    WHERE copies > 1
    GROUP BY kept_id
  ),
  added_up AS (
    UPDATE "stock_balances" AS kept
    SET "available_qty" = totals.available_qty,
        "reserved_qty" = totals.reserved_qty,
        "updated_at" = now()
    FROM totals
    WHERE kept."stock_balance_id" = totals.kept_id
      AND totals.available_qty IS NOT NULL
  ),
  repointed AS (
    UPDATE "stock_ledgers" AS ledger
    SET "stock_balance_id" = ranked.kept_id
    FROM ranked
    WHERE ledger."stock_balance_id" = ranked.id
      AND ranked.id <> ranked.kept_id
  )
  DELETE FROM "stock_balances" AS duplicate
  USING ranked
  WHERE duplicate."stock_balance_id" = ranked.id
    AND ranked.id <> ranked.kept_id;

  DROP INDEX IF EXISTS "stock_balances_unique_stock_key";
  -- Run as text: an older server cannot even parse NULLS NOT DISTINCT.
  EXECUTE 'CREATE UNIQUE INDEX "stock_balances_unique_stock_key" ON "stock_balances" (
    "hospital_id", "location_type", "location_id", "item_id",
    "batch_number", "expiry_date", "business_date"
  ) NULLS NOT DISTINCT';
END $$;
