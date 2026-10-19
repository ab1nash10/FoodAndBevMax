-- Each store mapping, kitchen mapping and restaurant menu item has its own category, chosen on
-- that mapping and independent of the item's other mappings (one location can file coke under
-- Beverages, another under Cold Drinks). Every existing mapping starts with the category its
-- item has today, so nothing changes on screen. items.category_id stays, unused, so no data is
-- dropped.

-- AlterTable
ALTER TABLE "store_items" ADD COLUMN     "category_id" UUID;

-- AlterTable
ALTER TABLE "kitchen_items" ADD COLUMN     "category_id" UUID;

-- AlterTable
ALTER TABLE "restaurant_menus" ADD COLUMN     "category_id" UUID;

-- Backfill: each mapping takes its item's current category.
UPDATE "store_items" AS m SET "category_id" = i."category_id" FROM "items" AS i WHERE i."id" = m."item_id";
UPDATE "kitchen_items" AS m SET "category_id" = i."category_id" FROM "items" AS i WHERE i."id" = m."item_id";
UPDATE "restaurant_menus" AS m SET "category_id" = i."category_id" FROM "items" AS i WHERE i."id" = m."item_id";

-- CreateIndex
CREATE INDEX "store_items_category_id_idx" ON "store_items"("category_id");

-- CreateIndex
CREATE INDEX "kitchen_items_category_id_idx" ON "kitchen_items"("category_id");

-- CreateIndex
CREATE INDEX "restaurant_menus_category_id_idx" ON "restaurant_menus"("category_id");

-- AddForeignKey
ALTER TABLE "store_items" ADD CONSTRAINT "store_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "item_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_items" ADD CONSTRAINT "kitchen_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "item_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_menus" ADD CONSTRAINT "restaurant_menus_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "item_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

