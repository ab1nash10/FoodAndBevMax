-- Orders & Reports: when the kitchen took a bill and when it was handed over, and the bill
-- amendments admins make (additive: two nullable columns, a new type and table). Re-runnable.
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMP(3);
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(3);

DO $$ BEGIN
  CREATE TYPE "OrderAmendmentType" AS ENUM ('PAYMENT_MODE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "order_amendments" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "OrderAmendmentType" NOT NULL,
    "old_value" JSONB NOT NULL,
    "new_value" JSONB NOT NULL,
    "remarks" TEXT NOT NULL,
    "amended_by" UUID,
    "amended_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_amendments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "order_amendments_hospital_id_amended_at_idx"
    ON "order_amendments"("hospital_id", "amended_at" DESC);
CREATE INDEX IF NOT EXISTS "order_amendments_order_id_idx" ON "order_amendments"("order_id");

DO $$ BEGIN
  ALTER TABLE "order_amendments" ADD CONSTRAINT "order_amendments_hospital_id_fkey"
    FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_amendments" ADD CONSTRAINT "order_amendments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "restaurant_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
