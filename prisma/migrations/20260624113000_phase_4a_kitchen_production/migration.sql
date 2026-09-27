ALTER TYPE "StockTransactionType" ADD VALUE IF NOT EXISTS 'KITCHEN_PRODUCTION_IN';

ALTER TYPE "StockReferenceType" ADD VALUE IF NOT EXISTS 'KITCHEN_PRODUCTION';

CREATE TYPE "KitchenProductionStatus" AS ENUM (
    'DRAFT',
    'POSTED',
    'CANCELLED'
);

CREATE SEQUENCE IF NOT EXISTS "kitchen_production_number_seq" START WITH 1 INCREMENT BY 1;

ALTER TABLE "stock_balances" ADD COLUMN IF NOT EXISTS "business_date" DATE;

DROP INDEX IF EXISTS "stock_balances_unique_batch_key";

CREATE UNIQUE INDEX IF NOT EXISTS "stock_balances_unique_stock_key" ON "stock_balances"(
    "hospital_id",
    "location_type",
    "location_id",
    "item_id",
    "batch_number",
    "expiry_date",
    "business_date"
);

CREATE INDEX IF NOT EXISTS "stock_balances_business_date_idx" ON "stock_balances"("business_date");

CREATE TABLE "kitchen_productions" (
    "id" UUID NOT NULL,
    "production_number" TEXT NOT NULL DEFAULT ('PRD' || lpad((nextval('kitchen_production_number_seq'::regclass))::text, 4, '0'::text)),
    "hospital_id" UUID NOT NULL,
    "kitchen_id" UUID NOT NULL,
    "production_date" TIMESTAMP(3) NOT NULL,
    "business_date" DATE NOT NULL,
    "chef_user_id" UUID,
    "status" "KitchenProductionStatus" NOT NULL DEFAULT 'DRAFT',
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "kitchen_productions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kitchen_production_lines" (
    "id" UUID NOT NULL,
    "production_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "produced_qty" DECIMAL(12,3) NOT NULL,
    "wastage_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "accepted_qty" DECIMAL(12,3) NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "kitchen_production_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kitchen_productions_production_number_key" ON "kitchen_productions"("production_number");
CREATE INDEX "kitchen_productions_business_date_idx" ON "kitchen_productions"("business_date");
CREATE INDEX "kitchen_productions_chef_user_id_idx" ON "kitchen_productions"("chef_user_id");
CREATE INDEX "kitchen_productions_deleted_at_idx" ON "kitchen_productions"("deleted_at");
CREATE INDEX "kitchen_productions_hospital_id_idx" ON "kitchen_productions"("hospital_id");
CREATE INDEX "kitchen_productions_kitchen_id_idx" ON "kitchen_productions"("kitchen_id");
CREATE INDEX "kitchen_productions_production_date_idx" ON "kitchen_productions"("production_date");
CREATE INDEX "kitchen_productions_status_idx" ON "kitchen_productions"("status");

CREATE INDEX "kitchen_production_lines_deleted_at_idx" ON "kitchen_production_lines"("deleted_at");
CREATE INDEX "kitchen_production_lines_item_id_idx" ON "kitchen_production_lines"("item_id");
CREATE INDEX "kitchen_production_lines_production_id_idx" ON "kitchen_production_lines"("production_id");

ALTER TABLE "kitchen_productions" ADD CONSTRAINT "kitchen_productions_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kitchen_productions" ADD CONSTRAINT "kitchen_productions_kitchen_id_fkey" FOREIGN KEY ("kitchen_id") REFERENCES "kitchens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kitchen_productions" ADD CONSTRAINT "kitchen_productions_chef_user_id_fkey" FOREIGN KEY ("chef_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kitchen_production_lines" ADD CONSTRAINT "kitchen_production_lines_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "kitchen_productions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kitchen_production_lines" ADD CONSTRAINT "kitchen_production_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
