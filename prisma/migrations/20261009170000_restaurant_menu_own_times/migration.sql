-- A menu item keeps its own on-sale window instead of pointing at shared time slots, and the
-- Featured and Special Serve flags go.

-- AlterTable
ALTER TABLE "restaurant_menus" ADD COLUMN     "available_from" VARCHAR(5),
ADD COLUMN     "available_to" VARCHAR(5);

-- Copy each menu's slots into its own window. A menu on an always-available slot, or on none,
-- stays empty (all day). Several slots become one window from the earliest start to the latest
-- end, the closest single window that still covers every slot.
UPDATE "restaurant_menus" AS menu
SET "available_from" = window_times.from_time,
    "available_to" = window_times.to_time
FROM (
  SELECT m."id",
         MIN(s."start_time") AS from_time,
         MAX(s."end_time") AS to_time
  FROM "restaurant_menus" m
  JOIN "time_slots" s ON s."id"::text = ANY (m."time_slot_ids") AND s."deleted_at" IS NULL
  GROUP BY m."id"
  HAVING NOT BOOL_OR(s."is_always_available")
     AND BOOL_AND(s."start_time" IS NOT NULL AND s."end_time" IS NOT NULL)
) AS window_times
WHERE menu."id" = window_times."id";

-- AlterTable
ALTER TABLE "restaurant_menus" DROP COLUMN "is_featured",
DROP COLUMN "is_special_serve",
DROP COLUMN "time_slot_ids";
