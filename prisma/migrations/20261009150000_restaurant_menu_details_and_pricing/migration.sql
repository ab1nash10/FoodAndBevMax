-- A restaurant menu item carries its own kitchen, serving details and price, instead of the
-- price living only in item_prices. Every new column is nullable or has a default, so existing
-- menus keep working unchanged.

-- CreateEnum
CREATE TYPE "MenuServeAt" AS ENUM ('BOTH', 'ROOM', 'COUNTER');

-- AlterTable
ALTER TABLE "restaurant_menus" ADD COLUMN     "accompaniments" TEXT,
ADD COLUMN     "add_on" TEXT,
ADD COLUMN     "gst_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "is_discountable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_gst_inclusive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_special_serve" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kitchen_id" UUID,
ADD COLUMN     "preparation_time_minutes" INTEGER,
ADD COLUMN     "price" DECIMAL(12,2),
ADD COLUMN     "room_price" DECIMAL(12,2),
ADD COLUMN     "serve_at" "MenuServeAt" NOT NULL DEFAULT 'BOTH',
ADD COLUMN     "serves" INTEGER;

-- CreateIndex
CREATE INDEX "restaurant_menus_kitchen_id_idx" ON "restaurant_menus"("kitchen_id");

-- AddForeignKey
ALTER TABLE "restaurant_menus" ADD CONSTRAINT "restaurant_menus_kitchen_id_fkey" FOREIGN KEY ("kitchen_id") REFERENCES "kitchens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
