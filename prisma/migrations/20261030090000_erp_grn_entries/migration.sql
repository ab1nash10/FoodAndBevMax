-- GRNs sent by the ERP (POST /erp/grns), one row per batch, verified in the portal. Adds only:
-- two tables, one enum and one value each on the two stock enums. No existing row changes.

-- CreateEnum
CREATE TYPE "GrnEntryStatus" AS ENUM ('PENDING', 'VERIFIED');

-- AlterEnum
ALTER TYPE "StockReferenceType" ADD VALUE 'GRN_ENTRY';

-- AlterEnum
ALTER TYPE "StockTransactionType" ADD VALUE 'GRN_RETURN_OUT';

-- CreateTable
CREATE TABLE "grn_entries" (
    "grn_entry_id" UUID NOT NULL,
    "transaction_number" TEXT NOT NULL,
    "grn_number" TEXT NOT NULL,
    "flag" SMALLINT NOT NULL,
    "hospital_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "hospital_code" TEXT NOT NULL,
    "store_code" TEXT NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_name" TEXT,
    "uom" TEXT,
    "hsn_code" TEXT,
    "batch_number" TEXT NOT NULL,
    "expiry_date" DATE NOT NULL,
    "sent_qty" DECIMAL(12,3) NOT NULL,
    "accepted_qty" DECIMAL(12,3),
    "rejected_qty" DECIMAL(12,3),
    "rejection_reason" TEXT,
    "unit_rate" DECIMAL(12,2),
    "mrp" DECIMAL(12,2),
    "tax_rate" TEXT,
    "discount" DECIMAL(12,2),
    "total_value" DECIMAL(14,2),
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "issued_by" TEXT,
    "purchase_order" TEXT,
    "requisition_number" TEXT,
    "vendor_code" TEXT,
    "status" "GrnEntryStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "verified_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grn_entries_pkey" PRIMARY KEY ("grn_entry_id")
);

-- CreateTable
CREATE TABLE "erp_request_nonces" (
    "nonce" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erp_request_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex
CREATE UNIQUE INDEX "grn_entries_transaction_number_key" ON "grn_entries"("transaction_number");

-- CreateIndex
CREATE INDEX "grn_entries_grn_number_idx" ON "grn_entries"("grn_number");

-- CreateIndex
CREATE INDEX "grn_entries_hospital_id_status_idx" ON "grn_entries"("hospital_id", "status");

-- CreateIndex
CREATE INDEX "grn_entries_status_verified_at_idx" ON "grn_entries"("status", "verified_at");

-- CreateIndex
CREATE INDEX "grn_entries_store_id_idx" ON "grn_entries"("store_id");

-- CreateIndex
CREATE INDEX "erp_request_nonces_created_at_idx" ON "erp_request_nonces"("created_at");

-- AddForeignKey
ALTER TABLE "grn_entries" ADD CONSTRAINT "grn_entries_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_entries" ADD CONSTRAINT "grn_entries_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_entries" ADD CONSTRAINT "grn_entries_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_entries" ADD CONSTRAINT "grn_entries_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Rules Prisma cannot express: a flag is 0 (in) or 1 (return), quantities are never negative,
-- and a verified batch accounts for every unit sent: accepted + rejected = sent.
ALTER TABLE "grn_entries" ADD CONSTRAINT "grn_entries_flag_check" CHECK ("flag" IN (0, 1));
ALTER TABLE "grn_entries" ADD CONSTRAINT "grn_entries_quantities_check" CHECK (
  "sent_qty" > 0
  AND COALESCE("accepted_qty", 0) >= 0
  AND COALESCE("rejected_qty", 0) >= 0
  AND ("status" = 'PENDING' OR "accepted_qty" + "rejected_qty" = "sent_qty")
);
