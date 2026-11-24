-- A steward's "Couldn't deliver" on a room order: why, when and who. The order comes off them for
-- the cashier or kitchen to give it to a steward again (which clears these) or cancel it.
-- Each statement can run again safely if a deploy stops part way.

ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "undelivered_reason" TEXT;
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "undelivered_at" TIMESTAMP(3);
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "undelivered_by" UUID;
