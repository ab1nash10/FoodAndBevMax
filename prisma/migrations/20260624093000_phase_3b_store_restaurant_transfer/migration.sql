ALTER TYPE "StockTransactionType" ADD VALUE IF NOT EXISTS 'STORE_TO_RESTAURANT_OUT';
ALTER TYPE "StockTransactionType" ADD VALUE IF NOT EXISTS 'RESTAURANT_RECEIVE_IN';
ALTER TYPE "StockTransactionType" ADD VALUE IF NOT EXISTS 'TRANSFER_REJECTED_RETURN_IN';

ALTER TYPE "StockReferenceType" ADD VALUE IF NOT EXISTS 'TRANSFER';
ALTER TYPE "StockReferenceType" ADD VALUE IF NOT EXISTS 'TRANSFER_ACKNOWLEDGEMENT';

CREATE TYPE "TransferStatus" AS ENUM (
    'DRAFT',
    'PENDING_ACKNOWLEDGEMENT',
    'ACKNOWLEDGED',
    'CANCELLED'
);

CREATE TYPE "TransferAcknowledgementStatus" AS ENUM (
    'ACCEPTED_FULL',
    'ACCEPTED_PARTIAL',
    'REJECTED_FULL'
);

CREATE SEQUENCE IF NOT EXISTS "transfer_number_seq" START WITH 1 INCREMENT BY 1;

CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "transfer_number" TEXT NOT NULL DEFAULT ('TRF' || lpad((nextval('transfer_number_seq'::regclass))::text, 4, '0'::text)),
    "hospital_id" UUID NOT NULL,
    "source_type" "InventoryLocationType" NOT NULL,
    "source_id" UUID NOT NULL,
    "destination_type" "InventoryLocationType" NOT NULL,
    "destination_id" UUID NOT NULL,
    "transfer_date" TIMESTAMP(3) NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transfer_lines" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "batch_number" TEXT NOT NULL,
    "expiry_date" DATE NOT NULL,
    "sent_qty" DECIMAL(12,3) NOT NULL,
    "accepted_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "rejected_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "rejection_reason" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "transfer_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transfer_acknowledgements" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "acknowledgement_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TransferAcknowledgementStatus" NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "transfer_acknowledgements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transfer_acknowledgement_lines" (
    "id" UUID NOT NULL,
    "acknowledgement_id" UUID NOT NULL,
    "transfer_line_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "batch_number" TEXT NOT NULL,
    "expiry_date" DATE NOT NULL,
    "sent_qty" DECIMAL(12,3) NOT NULL,
    "accepted_qty" DECIMAL(12,3) NOT NULL,
    "rejected_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "rejection_reason" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "transfer_acknowledgement_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transfers_transfer_number_key" ON "transfers"("transfer_number");
CREATE INDEX "transfers_business_date_idx" ON "transfers"("business_date");
CREATE INDEX "transfers_deleted_at_idx" ON "transfers"("deleted_at");
CREATE INDEX "transfers_destination_type_destination_id_idx" ON "transfers"("destination_type", "destination_id");
CREATE INDEX "transfers_hospital_id_idx" ON "transfers"("hospital_id");
CREATE INDEX "transfers_source_type_source_id_idx" ON "transfers"("source_type", "source_id");
CREATE INDEX "transfers_status_idx" ON "transfers"("status");
CREATE INDEX "transfers_transfer_date_idx" ON "transfers"("transfer_date");

CREATE INDEX "transfer_lines_batch_number_idx" ON "transfer_lines"("batch_number");
CREATE INDEX "transfer_lines_deleted_at_idx" ON "transfer_lines"("deleted_at");
CREATE INDEX "transfer_lines_expiry_date_idx" ON "transfer_lines"("expiry_date");
CREATE INDEX "transfer_lines_item_id_idx" ON "transfer_lines"("item_id");
CREATE INDEX "transfer_lines_transfer_id_idx" ON "transfer_lines"("transfer_id");

CREATE UNIQUE INDEX "transfer_acknowledgements_transfer_id_key" ON "transfer_acknowledgements"("transfer_id");
CREATE INDEX "transfer_acknowledgements_acknowledgement_date_idx" ON "transfer_acknowledgements"("acknowledgement_date");
CREATE INDEX "transfer_acknowledgements_deleted_at_idx" ON "transfer_acknowledgements"("deleted_at");
CREATE INDEX "transfer_acknowledgements_hospital_id_idx" ON "transfer_acknowledgements"("hospital_id");
CREATE INDEX "transfer_acknowledgements_status_idx" ON "transfer_acknowledgements"("status");

CREATE INDEX "transfer_acknowledgement_lines_acknowledgement_id_idx" ON "transfer_acknowledgement_lines"("acknowledgement_id");
CREATE INDEX "transfer_acknowledgement_lines_batch_number_idx" ON "transfer_acknowledgement_lines"("batch_number");
CREATE INDEX "transfer_acknowledgement_lines_deleted_at_idx" ON "transfer_acknowledgement_lines"("deleted_at");
CREATE INDEX "transfer_acknowledgement_lines_expiry_date_idx" ON "transfer_acknowledgement_lines"("expiry_date");
CREATE INDEX "transfer_acknowledgement_lines_item_id_idx" ON "transfer_acknowledgement_lines"("item_id");
CREATE INDEX "transfer_acknowledgement_lines_transfer_line_id_idx" ON "transfer_acknowledgement_lines"("transfer_line_id");

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfer_acknowledgements" ADD CONSTRAINT "transfer_acknowledgements_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_acknowledgements" ADD CONSTRAINT "transfer_acknowledgements_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfer_acknowledgement_lines" ADD CONSTRAINT "transfer_acknowledgement_lines_acknowledgement_id_fkey" FOREIGN KEY ("acknowledgement_id") REFERENCES "transfer_acknowledgements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_acknowledgement_lines" ADD CONSTRAINT "transfer_acknowledgement_lines_transfer_line_id_fkey" FOREIGN KEY ("transfer_line_id") REFERENCES "transfer_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_acknowledgement_lines" ADD CONSTRAINT "transfer_acknowledgement_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
