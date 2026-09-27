-- Phase 1 Foundation Refactor: company-based organization data becomes hospital-based.

-- Drop old organization constraints and indexes before table/column renames.
ALTER TABLE "locations" DROP CONSTRAINT IF EXISTS "locations_company_id_fkey";
ALTER TABLE "restaurants" DROP CONSTRAINT IF EXISTS "restaurants_location_id_fkey";

DROP INDEX IF EXISTS "companies_code_key";
DROP INDEX IF EXISTS "companies_deleted_at_idx";
DROP INDEX IF EXISTS "companies_name_key";
DROP INDEX IF EXISTS "locations_code_key";
DROP INDEX IF EXISTS "locations_company_id_idx";
DROP INDEX IF EXISTS "locations_deleted_at_idx";
DROP INDEX IF EXISTS "restaurants_code_key";
DROP INDEX IF EXISTS "restaurants_deleted_at_idx";
DROP INDEX IF EXISTS "restaurants_location_id_idx";

-- Hospitals replace companies while preserving existing IDs.
ALTER TABLE "companies" RENAME TO "hospitals";
ALTER TABLE "hospitals" RENAME CONSTRAINT "companies_pkey" TO "hospitals_pkey";
ALTER TABLE "hospitals" RENAME COLUMN "code" TO "hospital_code";
ALTER TABLE "hospitals" RENAME COLUMN "name" TO "hospital_name";
ALTER TABLE "hospitals" ADD COLUMN "address" TEXT;
ALTER TABLE "hospitals" ADD COLUMN "bill_prefix" TEXT;
ALTER TABLE "hospitals" ADD COLUMN "city" TEXT;
ALTER TABLE "hospitals" ADD COLUMN "gst_applicable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "hospitals" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "hospitals" ADD COLUMN "state" TEXT;
UPDATE "hospitals"
SET "is_active" = CASE WHEN "status" = 'ACTIVE' THEN true ELSE false END;
ALTER TABLE "hospitals" DROP COLUMN "gst_number";
ALTER TABLE "hospitals" DROP COLUMN "status";

CREATE UNIQUE INDEX "hospitals_hospital_code_key" ON "hospitals"("hospital_code");
CREATE INDEX "hospitals_deleted_at_idx" ON "hospitals"("deleted_at");
CREATE INDEX "hospitals_is_active_idx" ON "hospitals"("is_active");

-- Locations now belong to hospitals and use descriptive location fields.
ALTER TABLE "locations" RENAME COLUMN "company_id" TO "hospital_id";
ALTER TABLE "locations" RENAME COLUMN "name" TO "location_name";
ALTER TABLE "locations" ADD COLUMN "area" TEXT;
ALTER TABLE "locations" ADD COLUMN "building" TEXT;
ALTER TABLE "locations" ADD COLUMN "floor" TEXT;
ALTER TABLE "locations" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
UPDATE "locations"
SET "is_active" = CASE WHEN "status" = 'ACTIVE' THEN true ELSE false END;
ALTER TABLE "locations" ALTER COLUMN "address" DROP NOT NULL;
ALTER TABLE "locations" DROP COLUMN "city";
ALTER TABLE "locations" DROP COLUMN "code";
ALTER TABLE "locations" DROP COLUMN "state";
ALTER TABLE "locations" DROP COLUMN "status";

CREATE INDEX "locations_hospital_id_idx" ON "locations"("hospital_id");
CREATE INDEX "locations_deleted_at_idx" ON "locations"("deleted_at");
CREATE INDEX "locations_is_active_idx" ON "locations"("is_active");

-- Restaurants move under hospitals and can optionally link location/store/kitchen.
ALTER TABLE "restaurants" RENAME COLUMN "code" TO "restaurant_code";
ALTER TABLE "restaurants" RENAME COLUMN "name" TO "restaurant_name";
ALTER TABLE "restaurants" ADD COLUMN "hospital_id" UUID;
UPDATE "restaurants" AS "restaurant"
SET "hospital_id" = "location"."hospital_id"
FROM "locations" AS "location"
WHERE "restaurant"."location_id" = "location"."id";
ALTER TABLE "restaurants" ALTER COLUMN "hospital_id" SET NOT NULL;
ALTER TABLE "restaurants" ALTER COLUMN "location_id" DROP NOT NULL;
ALTER TABLE "restaurants" ADD COLUMN "address" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "b2c_qr_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN "bank_branch" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "bank_name" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "closing_time" VARCHAR(5);
ALTER TABLE "restaurants" ADD COLUMN "fssai_number" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "gst_number" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "in_room_dining_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "restaurants" ADD COLUMN "kitchen_id" UUID;
ALTER TABLE "restaurants" ADD COLUMN "normal_discount_applicable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN "online_ordering_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN "opening_time" VARCHAR(5);
ALTER TABLE "restaurants" ADD COLUMN "pan_number" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "staff_discount_applicable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN "store_id" UUID;
ALTER TABLE "restaurants" ADD COLUMN "sun_bu" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "sun_t1" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "sun_t2" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "upi_id" TEXT;
UPDATE "restaurants"
SET "is_active" = CASE WHEN "status" = 'ACTIVE' THEN true ELSE false END;
ALTER TABLE "restaurants" DROP COLUMN "status";

CREATE UNIQUE INDEX "restaurants_hospital_id_restaurant_code_key" ON "restaurants"("hospital_id", "restaurant_code");
CREATE INDEX "restaurants_hospital_id_idx" ON "restaurants"("hospital_id");
CREATE INDEX "restaurants_location_id_idx" ON "restaurants"("location_id");
CREATE INDEX "restaurants_store_id_idx" ON "restaurants"("store_id");
CREATE INDEX "restaurants_kitchen_id_idx" ON "restaurants"("kitchen_id");
CREATE INDEX "restaurants_deleted_at_idx" ON "restaurants"("deleted_at");
CREATE INDEX "restaurants_is_active_idx" ON "restaurants"("is_active");

-- New Store/F&B entity.
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "location_id" UUID,
    "store_code" TEXT NOT NULL,
    "store_name" TEXT NOT NULL,
    "store_type" TEXT,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stores_hospital_id_store_code_key" ON "stores"("hospital_id", "store_code");
CREATE INDEX "stores_hospital_id_idx" ON "stores"("hospital_id");
CREATE INDEX "stores_location_id_idx" ON "stores"("location_id");
CREATE INDEX "stores_deleted_at_idx" ON "stores"("deleted_at");
CREATE INDEX "stores_is_active_idx" ON "stores"("is_active");

-- New kitchen entity.
CREATE TABLE "kitchens" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "location_id" UUID,
    "kitchen_code" TEXT NOT NULL,
    "kitchen_name" TEXT NOT NULL,
    "opening_time" VARCHAR(5),
    "closing_time" VARCHAR(5),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "kitchens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kitchens_hospital_id_kitchen_code_key" ON "kitchens"("hospital_id", "kitchen_code");
CREATE INDEX "kitchens_hospital_id_idx" ON "kitchens"("hospital_id");
CREATE INDEX "kitchens_location_id_idx" ON "kitchens"("location_id");
CREATE INDEX "kitchens_deleted_at_idx" ON "kitchens"("deleted_at");
CREATE INDEX "kitchens_is_active_idx" ON "kitchens"("is_active");

-- New restaurant counters.
CREATE TABLE "counters" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "counter_code" TEXT NOT NULL,
    "counter_name" TEXT NOT NULL,
    "pos_device_id" TEXT,
    "payment_device_id" TEXT,
    "pine_labs_device_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "counters_restaurant_id_counter_code_key" ON "counters"("restaurant_id", "counter_code");
CREATE INDEX "counters_hospital_id_idx" ON "counters"("hospital_id");
CREATE INDEX "counters_restaurant_id_idx" ON "counters"("restaurant_id");
CREATE INDEX "counters_deleted_at_idx" ON "counters"("deleted_at");
CREATE INDEX "counters_is_active_idx" ON "counters"("is_active");

-- User and audit logs gain optional hospital context.
ALTER TABLE "users" ADD COLUMN "hospital_id" UUID;
CREATE INDEX "users_hospital_id_idx" ON "users"("hospital_id");

ALTER TABLE "audit_logs" ADD COLUMN "hospital_id" UUID;
CREATE INDEX "audit_logs_hospital_id_idx" ON "audit_logs"("hospital_id");

-- Rebuild foreign keys for the V2 hierarchy.
ALTER TABLE "users" ADD CONSTRAINT "users_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stores" ADD CONSTRAINT "stores_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stores" ADD CONSTRAINT "stores_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kitchens" ADD CONSTRAINT "kitchens_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kitchens" ADD CONSTRAINT "kitchens_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_kitchen_id_fkey" FOREIGN KEY ("kitchen_id") REFERENCES "kitchens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "counters" ADD CONSTRAINT "counters_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "counters" ADD CONSTRAINT "counters_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
