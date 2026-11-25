-- Payment reconciliation and Supervisor approval per shift (the user, 2026-11-26): the restaurant
-- admin's reasons for a closed shift's cash, UPI and card differences, and the Supervisor's
-- decision. Additive only (a type and a table). Re-runnable.
DO $$ BEGIN
  CREATE TYPE "ShiftReconciliationStatus" AS ENUM ('SUBMITTED', 'SENT_BACK', 'APPROVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "shift_reconciliations" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "status" "ShiftReconciliationStatus" NOT NULL,
    "reasons" JSONB NOT NULL DEFAULT '{}',
    "submitted_by" UUID,
    "submitted_at" TIMESTAMP(3),
    "comment" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "approved_checks" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shift_reconciliations_shift_id_key" ON "shift_reconciliations"("shift_id");
CREATE INDEX IF NOT EXISTS "shift_reconciliations_hospital_id_status_idx"
    ON "shift_reconciliations"("hospital_id", "status");

DO $$ BEGIN
  ALTER TABLE "shift_reconciliations" ADD CONSTRAINT "shift_reconciliations_hospital_id_fkey"
    FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shift_reconciliations" ADD CONSTRAINT "shift_reconciliations_shift_id_fkey"
    FOREIGN KEY ("shift_id") REFERENCES "counter_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
