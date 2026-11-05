-- Employee details: email, gender, dates, level, entity and reporting manager. Additive only,
-- and every step may run again, should a first run stop part way.

DO $$ BEGIN
  CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "official_email" TEXT,
  ADD COLUMN IF NOT EXISTS "gender" "Gender",
  ADD COLUMN IF NOT EXISTS "birth_date" DATE,
  ADD COLUMN IF NOT EXISTS "joining_date" DATE,
  ADD COLUMN IF NOT EXISTS "employee_level" TEXT,
  ADD COLUMN IF NOT EXISTS "legal_entity_id" UUID,
  ADD COLUMN IF NOT EXISTS "reporting_manager_id" UUID;

CREATE INDEX IF NOT EXISTS "employees_legal_entity_id_idx" ON "employees"("legal_entity_id");
CREATE INDEX IF NOT EXISTS "employees_reporting_manager_id_idx" ON "employees"("reporting_manager_id");

DO $$ BEGIN
  ALTER TABLE "employees" ADD CONSTRAINT "employees_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "employees" ADD CONSTRAINT "employees_reporting_manager_id_fkey"
    FOREIGN KEY ("reporting_manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Codes for employees saved without one (EMP0001, ...); taken codes are stepped over.
CREATE SEQUENCE IF NOT EXISTS employee_code_sequence;
