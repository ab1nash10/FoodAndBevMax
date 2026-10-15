-- Orders from any channel: a POS (its device key) or a kiosk, QR ordering or another app
-- (the restaurant's own order key). Additive; existing rows are POS orders.
CREATE TYPE "OrderSource" AS ENUM ('POS', 'KIOSK', 'QR', 'OTHER');

ALTER TABLE "restaurants" ADD COLUMN "order_key_hash" TEXT;
CREATE UNIQUE INDEX "restaurants_order_key_hash_key" ON "restaurants"("order_key_hash");

ALTER TABLE "restaurant_orders" ADD COLUMN "source" "OrderSource" NOT NULL DEFAULT 'POS';
ALTER TABLE "restaurant_orders" ALTER COLUMN "source" DROP DEFAULT;

-- A resend from the same sender updates its order instead of duplicating it.
ALTER TABLE "restaurant_orders" ADD COLUMN "sender_id" UUID;
UPDATE "restaurant_orders" SET "sender_id" = "pos_device_id";
ALTER TABLE "restaurant_orders" ALTER COLUMN "sender_id" SET NOT NULL;
ALTER TABLE "restaurant_orders" ALTER COLUMN "pos_device_id" DROP NOT NULL;
ALTER TABLE "restaurant_orders" RENAME COLUMN "pos_order_id" TO "external_order_id";

DROP INDEX "restaurant_orders_pos_device_id_pos_order_id_key";
CREATE UNIQUE INDEX "restaurant_orders_sender_id_external_order_id_key" ON "restaurant_orders"("sender_id", "external_order_id");
