-- Categories get a place on menus, the till and the kiosk. Existing ones start in today's order
-- (alphabetical, as the till sorted them), so nothing moves until someone rearranges the list.
ALTER TABLE "item_categories" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

UPDATE "item_categories" AS c
SET "sort_order" = ranked.position
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "category_name") AS position
  FROM "item_categories"
) AS ranked
WHERE c."id" = ranked."id";

CREATE INDEX "item_categories_sort_order_idx" ON "item_categories"("sort_order");
