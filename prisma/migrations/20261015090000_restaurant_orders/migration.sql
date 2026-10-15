-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PLACED', 'PREPARING', 'READY', 'COLLECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "board_token" TEXT;

-- AlterTable
ALTER TABLE "pos_devices" ADD COLUMN     "api_key_hash" TEXT;

-- CreateTable
CREATE TABLE "restaurant_orders" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "pos_device_id" UUID NOT NULL,
    "pos_order_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "restaurant_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "restaurant_orders_hospital_id_idx" ON "restaurant_orders"("hospital_id");

-- CreateIndex
CREATE INDEX "restaurant_orders_restaurant_id_status_placed_at_idx" ON "restaurant_orders"("restaurant_id", "status", "placed_at");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_orders_pos_device_id_pos_order_id_key" ON "restaurant_orders"("pos_device_id", "pos_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_board_token_key" ON "restaurants"("board_token");

-- CreateIndex
CREATE UNIQUE INDEX "pos_devices_api_key_hash_key" ON "pos_devices"("api_key_hash");

-- AddForeignKey
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_pos_device_id_fkey" FOREIGN KEY ("pos_device_id") REFERENCES "pos_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

