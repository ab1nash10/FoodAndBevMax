CREATE TYPE "GrnStatus" AS ENUM (
    'DRAFT',
    'UNDER_VERIFICATION',
    'PARTIALLY_ACCEPTED',
    'ACCEPTED',
    'REJECTED',
    'POSTED_TO_STOCK',
    'CANCELLED'
);

CREATE TYPE "InventoryLocationType" AS ENUM (
    'STORE',
    'KITCHEN',
    'RESTAURANT',
    'COUNTER'
);

CREATE TYPE "StockTransactionType" AS ENUM (
    'GRN_IN'
);

CREATE TYPE "StockReferenceType" AS ENUM (
    'GRN'
);

CREATE SEQUENCE IF NOT EXISTS "grn_number_seq" START WITH 1 INCREMENT BY 1;

CREATE TABLE "grns" (
    "id" UUID NOT NULL,
    "grn_number" TEXT NOT NULL DEFAULT ('GRN' || lpad((nextval('grn_number_seq'::regclass))::text, 6, '0'::text)),
    "hospital_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "received_date" TIMESTAMP(3) NOT NULL,
    "received_by" TEXT NOT NULL,
    "vendor_name" TEXT,
    "po_number" TEXT,
    "invoice_number" TEXT,
    "remarks" TEXT,
    "status" "GrnStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "grn_lines" (
    "id" UUID NOT NULL,
    "grn_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "ordered_qty" DECIMAL(12,3),
    "received_qty" DECIMAL(12,3) NOT NULL,
    "accepted_qty" DECIMAL(12,3) NOT NULL,
    "rejected_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "rejection_reason" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grn_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "grn_batches" (
    "id" UUID NOT NULL,
    "grn_line_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "batch_number" TEXT NOT NULL,
    "manufacturing_date" DATE,
    "expiry_date" DATE NOT NULL,
    "received_qty" DECIMAL(12,3) NOT NULL,
    "accepted_qty" DECIMAL(12,3) NOT NULL,
    "rejected_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grn_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_ledgers" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "location_type" "InventoryLocationType" NOT NULL,
    "location_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "batch_number" TEXT,
    "expiry_date" DATE,
    "transaction_type" "StockTransactionType" NOT NULL,
    "reference_type" "StockReferenceType",
    "reference_id" UUID,
    "qty_in" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "qty_out" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "balance_after" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "business_date" DATE NOT NULL,
    "transaction_datetime" TIMESTAMP(3) NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stock_ledgers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_balances" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "location_type" "InventoryLocationType" NOT NULL,
    "location_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "batch_number" TEXT,
    "expiry_date" DATE,
    "available_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reserved_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "last_updated_on" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "grns_grn_number_key" ON "grns"("grn_number");
CREATE INDEX "grns_deleted_at_idx" ON "grns"("deleted_at");
CREATE INDEX "grns_hospital_id_idx" ON "grns"("hospital_id");
CREATE INDEX "grns_received_date_idx" ON "grns"("received_date");
CREATE INDEX "grns_status_idx" ON "grns"("status");
CREATE INDEX "grns_store_id_idx" ON "grns"("store_id");

CREATE INDEX "grn_lines_deleted_at_idx" ON "grn_lines"("deleted_at");
CREATE INDEX "grn_lines_grn_id_idx" ON "grn_lines"("grn_id");
CREATE INDEX "grn_lines_item_id_idx" ON "grn_lines"("item_id");

CREATE INDEX "grn_batches_batch_number_idx" ON "grn_batches"("batch_number");
CREATE INDEX "grn_batches_deleted_at_idx" ON "grn_batches"("deleted_at");
CREATE INDEX "grn_batches_expiry_date_idx" ON "grn_batches"("expiry_date");
CREATE INDEX "grn_batches_grn_line_id_idx" ON "grn_batches"("grn_line_id");
CREATE INDEX "grn_batches_item_id_idx" ON "grn_batches"("item_id");

CREATE INDEX "stock_ledgers_batch_number_idx" ON "stock_ledgers"("batch_number");
CREATE INDEX "stock_ledgers_business_date_idx" ON "stock_ledgers"("business_date");
CREATE INDEX "stock_ledgers_deleted_at_idx" ON "stock_ledgers"("deleted_at");
CREATE INDEX "stock_ledgers_expiry_date_idx" ON "stock_ledgers"("expiry_date");
CREATE INDEX "stock_ledgers_hospital_id_idx" ON "stock_ledgers"("hospital_id");
CREATE INDEX "stock_ledgers_item_id_idx" ON "stock_ledgers"("item_id");
CREATE INDEX "stock_ledgers_location_type_location_id_idx" ON "stock_ledgers"("location_type", "location_id");
CREATE INDEX "stock_ledgers_reference_type_reference_id_idx" ON "stock_ledgers"("reference_type", "reference_id");
CREATE INDEX "stock_ledgers_transaction_datetime_idx" ON "stock_ledgers"("transaction_datetime");
CREATE INDEX "stock_ledgers_transaction_type_idx" ON "stock_ledgers"("transaction_type");

CREATE UNIQUE INDEX "stock_balances_unique_batch_key" ON "stock_balances"(
    "hospital_id",
    "location_type",
    "location_id",
    "item_id",
    "batch_number",
    "expiry_date"
);
CREATE INDEX "stock_balances_batch_number_idx" ON "stock_balances"("batch_number");
CREATE INDEX "stock_balances_deleted_at_idx" ON "stock_balances"("deleted_at");
CREATE INDEX "stock_balances_expiry_date_idx" ON "stock_balances"("expiry_date");
CREATE INDEX "stock_balances_hospital_id_idx" ON "stock_balances"("hospital_id");
CREATE INDEX "stock_balances_item_id_idx" ON "stock_balances"("item_id");
CREATE INDEX "stock_balances_location_type_location_id_idx" ON "stock_balances"("location_type", "location_id");

ALTER TABLE "grns" ADD CONSTRAINT "grns_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grns" ADD CONSTRAINT "grns_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "grn_batches" ADD CONSTRAINT "grn_batches_grn_line_id_fkey" FOREIGN KEY ("grn_line_id") REFERENCES "grn_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grn_batches" ADD CONSTRAINT "grn_batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_ledgers" ADD CONSTRAINT "stock_ledgers_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_ledgers" ADD CONSTRAINT "stock_ledgers_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
