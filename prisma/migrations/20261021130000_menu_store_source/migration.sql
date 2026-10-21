-- A menu item comes from one of its item's mappings at the restaurant's location: the kitchen
-- that makes it, or now also the store that stocks it.

-- AlterTable
ALTER TABLE "restaurant_menus" ADD COLUMN     "store_id" UUID;

-- CreateIndex
CREATE INDEX "restaurant_menus_store_id_idx" ON "restaurant_menus"("store_id");

-- AddForeignKey
ALTER TABLE "restaurant_menus" ADD CONSTRAINT "restaurant_menus_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing packaged menu items (no kitchen) get their store when exactly one store at the
-- location stocks the item under the menu item's category. Where several do, or none, it is
-- left empty to choose on the next edit.
UPDATE "restaurant_menus" AS menu
SET "store_id" = only_store."store_id",
    "updated_at" = now()
FROM (
  SELECT m."id", min(si."store_id"::text)::uuid AS "store_id"
  FROM "restaurant_menus" m
  JOIN "store_items" si
    ON si."item_id" = m."item_id"
   AND si."category_id" IS NOT DISTINCT FROM m."category_id"
   AND si."deleted_at" IS NULL
   AND si."is_active" = true
  JOIN "stores" s
    ON s."id" = si."store_id"
   AND s."hospital_id" = m."hospital_id"
   AND s."deleted_at" IS NULL
  WHERE m."kitchen_id" IS NULL AND m."deleted_at" IS NULL
  GROUP BY m."id"
  HAVING count(DISTINCT si."store_id") = 1
) AS only_store
WHERE menu."id" = only_store."id";
