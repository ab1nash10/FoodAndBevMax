ALTER TABLE "restaurant_menus" DROP CONSTRAINT IF EXISTS "restaurant_menus_time_slot_id_fkey";
DROP INDEX IF EXISTS "restaurant_menus_time_slot_id_idx";

ALTER TABLE "restaurant_menus"
ADD COLUMN "time_slot_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "restaurant_menus"
SET "time_slot_ids" = CASE
  WHEN "time_slot_id" IS NULL THEN ARRAY[]::TEXT[]
  ELSE ARRAY["time_slot_id"::TEXT]
END;

ALTER TABLE "restaurant_menus" DROP COLUMN "time_slot_id";

ALTER TABLE "restaurant_menus"
ALTER COLUMN "days_of_week" TYPE TEXT[]
USING CASE
  WHEN "days_of_week" IS NULL OR btrim("days_of_week") = '' THEN ARRAY[]::TEXT[]
  ELSE regexp_split_to_array(regexp_replace("days_of_week", '\s+', '', 'g'), ',')
END;

ALTER TABLE "restaurant_menus"
ALTER COLUMN "days_of_week" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "days_of_week" SET NOT NULL;

WITH ranked_menus AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "restaurant_id"
      ORDER BY COALESCE("display_order", 2147483647), "created_at", "id"
    ) AS "next_display_order"
  FROM "restaurant_menus"
  WHERE "deleted_at" IS NULL
)
UPDATE "restaurant_menus" AS rm
SET "display_order" = ranked_menus."next_display_order"
FROM ranked_menus
WHERE rm."id" = ranked_menus."id";

UPDATE "restaurant_menus"
SET "display_order" = 0
WHERE "display_order" IS NULL;

ALTER TABLE "restaurant_menus"
ALTER COLUMN "display_order" SET DEFAULT 0,
ALTER COLUMN "display_order" SET NOT NULL;
