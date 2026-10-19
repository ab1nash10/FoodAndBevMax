-- A store, kitchen or restaurant may hold the same item under more than one category;
-- only an exact repeat (same place, item and category) among live rows is refused.
DROP INDEX IF EXISTS "store_items_store_id_item_id_active_key";
CREATE UNIQUE INDEX "store_items_store_id_item_id_category_id_active_key" ON "store_items"("store_id", "item_id", "category_id") WHERE "deleted_at" IS NULL;

DROP INDEX IF EXISTS "kitchen_items_kitchen_id_item_id_active_key";
CREATE UNIQUE INDEX "kitchen_items_kitchen_id_item_id_category_id_active_key" ON "kitchen_items"("kitchen_id", "item_id", "category_id") WHERE "deleted_at" IS NULL;

DROP INDEX IF EXISTS "restaurant_menus_restaurant_id_item_id_active_key";
CREATE UNIQUE INDEX "restaurant_menus_restaurant_id_item_id_category_id_active_key" ON "restaurant_menus"("restaurant_id", "item_id", "category_id") WHERE "deleted_at" IS NULL;
