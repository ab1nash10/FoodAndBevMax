-- Every restaurant menu item gets its own code, like items (ITM0001): RMI0001, RMI0002, ...
-- generated on add and never changed. Existing menu items are numbered in the order they were
-- created, and the sequence continues after them.
CREATE SEQUENCE IF NOT EXISTS restaurant_menu_code_sequence;

ALTER TABLE "restaurant_menus" ADD COLUMN "menu_item_code" TEXT;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM "restaurant_menus"
)
UPDATE "restaurant_menus" AS r
SET "menu_item_code" = 'RMI' || CASE WHEN numbered.n < 10000 THEN lpad(numbered.n::text, 4, '0') ELSE numbered.n::text END
FROM numbered
WHERE r.id = numbered.id;

SELECT setval(
  'restaurant_menu_code_sequence',
  GREATEST((SELECT count(*) FROM "restaurant_menus"), 1),
  (SELECT count(*) FROM "restaurant_menus") > 0
);

ALTER TABLE "restaurant_menus" ALTER COLUMN "menu_item_code" SET NOT NULL;
CREATE UNIQUE INDEX "restaurant_menus_menu_item_code_key" ON "restaurant_menus"("menu_item_code");
