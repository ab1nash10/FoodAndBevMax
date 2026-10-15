-- Optional order details for the pickup board: eat here / take away, the collection counter
-- and the sender's preparation estimate. Additive.
-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('DINE_IN', 'TAKE_AWAY');

-- AlterTable
ALTER TABLE "restaurant_orders" ADD COLUMN     "counter_id" UUID,
ADD COLUMN     "prep_minutes" INTEGER,
ADD COLUMN     "service_type" "ServiceType";

-- AddForeignKey
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "counters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

