-- GRNs the ERP sent that AAHAR refused (nothing saved, no stock moved), with every reason and the
-- request as sent, for Logs → ERP GRN errors. A GRN number may now be sent more than once: each
-- request adds its rows to that GRN, so nothing here touches grn_entries.
-- Each statement can run again safely if a deploy stops part way.

CREATE TABLE IF NOT EXISTS "erp_grn_refusals" (
    "erp_grn_refusal_id" UUID NOT NULL,
    "grn_number" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "hospital_id" UUID,
    "errors" TEXT[],
    "rows" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erp_grn_refusals_pkey" PRIMARY KEY ("erp_grn_refusal_id")
);

CREATE INDEX IF NOT EXISTS "erp_grn_refusals_hospital_id_created_at_idx" ON "erp_grn_refusals"("hospital_id", "created_at");

CREATE INDEX IF NOT EXISTS "erp_grn_refusals_created_at_idx" ON "erp_grn_refusals"("created_at");

DO $$ BEGIN
    ALTER TABLE "erp_grn_refusals" ADD CONSTRAINT "erp_grn_refusals_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
