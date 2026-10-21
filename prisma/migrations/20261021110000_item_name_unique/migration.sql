-- Item names are unique across the catalogue (ignoring case, spaces and punctuation, which
-- normalized_name already drops). The API checks this on create and rename; this index is the
-- guarantee when two saves race.
--
-- Older data may hold duplicates from when names were unique only within a category. Rather
-- than fail the deploy, every live duplicate but the oldest gets its code appended
-- ("samosa (ITM0005)"), so each stays usable and can be merged or renamed afterwards.

UPDATE "items" AS item
SET "item_name" = item."item_name" || ' (' || item."item_code" || ')',
    "normalized_name" = item."normalized_name" || lower(regexp_replace(item."item_code", '[^a-zA-Z0-9]', '', 'g')),
    "updated_at" = now()
FROM (
  SELECT "id",
         row_number() OVER (PARTITION BY "normalized_name" ORDER BY "created_at", "item_code") AS position
  FROM "items"
  WHERE "deleted_at" IS NULL
) AS ranked
WHERE item."id" = ranked."id" AND ranked.position > 1;

-- Partial, so a deleted item's name can be used again.
CREATE UNIQUE INDEX "items_normalized_name_active_key" ON "items"("normalized_name") WHERE "deleted_at" IS NULL;
