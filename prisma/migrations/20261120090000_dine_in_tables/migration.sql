-- Dine-in tables: a room with a restaurant is that restaurant's table, and its QR orders to it
-- (channel TABLE, the table's name on the order). Additive, and safe to run again.
ALTER TYPE "OrderChannel" ADD VALUE IF NOT EXISTS 'TABLE';

ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "restaurant_id" UUID;
CREATE INDEX IF NOT EXISTS "rooms_restaurant_id_idx" ON "rooms"("restaurant_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_restaurant_id_fkey') THEN
    ALTER TABLE "rooms" ADD CONSTRAINT "rooms_restaurant_id_fkey" FOREIGN KEY ("restaurant_id")
      REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "table_name" TEXT;
ALTER TABLE "qr_orders" ADD COLUMN IF NOT EXISTS "table_name" TEXT;

-- Codes T-000001, T-000002, … in the order tables are added.
CREATE SEQUENCE IF NOT EXISTS table_code_sequence;
