CREATE TYPE "LocationScope" AS ENUM ('ALL', 'MULTI', 'SINGLE');

ALTER TABLE "roles" ADD COLUMN "location_scope" "LocationScope" NOT NULL DEFAULT 'SINGLE';

CREATE TABLE "user_hospitals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "user_hospitals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_hospitals_user_id_hospital_id_key" ON "user_hospitals"("user_id", "hospital_id");
CREATE INDEX "user_hospitals_hospital_id_idx" ON "user_hospitals"("hospital_id");
CREATE INDEX "user_hospitals_deleted_at_idx" ON "user_hospitals"("deleted_at");

ALTER TABLE "user_hospitals" ADD CONSTRAINT "user_hospitals_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_hospitals" ADD CONSTRAINT "user_hospitals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the existing hierarchy: the seeded administrative roles are not single-location.
UPDATE "roles" SET "location_scope" = 'ALL' WHERE "name" = 'Super Admin';
UPDATE "roles" SET "location_scope" = 'MULTI' WHERE "name" = 'Admin';

-- Existing users keep working: their current home hospital becomes their first assignment.
INSERT INTO "user_hospitals" ("id", "user_id", "hospital_id", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", "hospital_id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" WHERE "hospital_id" IS NOT NULL
ON CONFLICT DO NOTHING;
