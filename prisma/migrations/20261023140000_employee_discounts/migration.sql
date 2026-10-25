-- CreateTable
CREATE TABLE "employee_discounts" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL,
    "employment_type" "EmploymentType",
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "days_of_week" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "employee_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_discounts_hospital_id_idx" ON "employee_discounts"("hospital_id");

-- CreateIndex
CREATE INDEX "employee_discounts_restaurant_id_archived_at_idx" ON "employee_discounts"("restaurant_id", "archived_at");

-- AddForeignKey
ALTER TABLE "employee_discounts" ADD CONSTRAINT "employee_discounts_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_discounts" ADD CONSTRAINT "employee_discounts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The restaurants' existing staff discount rates become rules, so billing gives the same
-- discount as before on day one: one rule per restaurant and employment type with a rate above
-- zero, every day, all day. Idempotent: a rate already copied (same restaurant, type and name)
-- is not copied again.
INSERT INTO "employee_discounts" (
  "id", "hospital_id", "restaurant_id", "name", "discount_percent", "employment_type",
  "days_of_week", "created_at", "updated_at", "updated_by"
)
SELECT
  gen_random_uuid(),
  r."hospital_id",
  s."restaurant_id",
  CASE s."employment_type" WHEN 'ON_ROLL' THEN 'Staff discount (on roll)' ELSE 'Staff discount (outsourced)' END,
  s."discount_percent",
  s."employment_type",
  ARRAY[]::TEXT[],
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  s."updated_by"
FROM "restaurant_staff_discounts" s
JOIN "restaurants" r ON r."id" = s."restaurant_id"
WHERE s."discount_percent" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "employee_discounts" e
    WHERE e."restaurant_id" = s."restaurant_id"
      AND e."employment_type" = s."employment_type"
      AND e."name" = CASE s."employment_type" WHEN 'ON_ROLL' THEN 'Staff discount (on roll)' ELSE 'Staff discount (outsourced)' END
  );
