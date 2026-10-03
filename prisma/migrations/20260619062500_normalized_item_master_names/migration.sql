-- Add normalized names first as nullable so existing records can be backfilled safely.
ALTER TABLE "item_categories" ADD COLUMN "normalized_name" TEXT;
ALTER TABLE "items" ADD COLUMN "normalized_name" TEXT;

UPDATE "item_categories"
SET "normalized_name" = regexp_replace(lower("category_name"), '[^a-z0-9]', '', 'g')
WHERE "normalized_name" IS NULL;

UPDATE "items"
SET "normalized_name" = regexp_replace(lower("item_name"), '[^a-z0-9]', '', 'g')
WHERE "normalized_name" IS NULL;

ALTER TABLE "item_categories" ALTER COLUMN "normalized_name" SET NOT NULL;
ALTER TABLE "items" ALTER COLUMN "normalized_name" SET NOT NULL;

CREATE INDEX "item_categories_normalized_name_idx" ON "item_categories"("normalized_name");
CREATE INDEX "items_normalized_name_idx" ON "items"("normalized_name");
