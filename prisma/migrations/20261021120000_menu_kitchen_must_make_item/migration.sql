-- A menu item's kitchen is the one that makes it, so it must be a kitchen the item is mapped
-- to. Earlier any kitchen at the restaurant's location was accepted, which let packaged (store)
-- items point at a kitchen that never makes them. Those links are cleared; Kitchen is optional,
-- and the menu item, its prices and its timing are otherwise unchanged.
UPDATE "restaurant_menus" AS menu
SET "kitchen_id" = NULL,
    "updated_at" = now()
WHERE menu."kitchen_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "kitchen_items" AS mapping
    WHERE mapping."kitchen_id" = menu."kitchen_id"
      AND mapping."item_id" = menu."item_id"
      AND mapping."deleted_at" IS NULL
  );
