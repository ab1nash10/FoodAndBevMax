-- Each manual send of a restaurant's day to the ERP's revenue API, and what came back
-- (additive: a new table and type only).
DO $$ BEGIN
  CREATE TYPE "ErpPostingStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'EMPTY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "erp_postings" (
    "erp_posting_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "ErpPostingStatus" NOT NULL DEFAULT 'PENDING',
    "bill_count" INTEGER NOT NULL DEFAULT 0,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB,
    "request_body" TEXT,
    "response_status" INTEGER,
    "response_body" TEXT,
    "error" TEXT,
    "duration_ms" INTEGER,
    "sent_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_postings_pkey" PRIMARY KEY ("erp_posting_id")
);

CREATE INDEX IF NOT EXISTS "erp_postings_hospital_id_created_at_idx"
    ON "erp_postings"("hospital_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "erp_postings_restaurant_id_business_date_idx"
    ON "erp_postings"("restaurant_id", "business_date");
-- One send in flight per restaurant and day: a double click cannot post the day twice.
CREATE UNIQUE INDEX IF NOT EXISTS "erp_postings_one_pending_key"
    ON "erp_postings"("restaurant_id", "business_date") WHERE "status" = 'PENDING';
