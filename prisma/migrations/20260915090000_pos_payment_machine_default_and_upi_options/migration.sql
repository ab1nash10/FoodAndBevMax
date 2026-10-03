-- AlterEnum
-- Adds the BA-specified UPI options (Menu 2, field 9). Existing values are retained so
-- already-stored payment machines keep resolving.
ALTER TYPE "PrimaryUpiProvider" ADD VALUE IF NOT EXISTS 'UPI_PAYTM';
ALTER TYPE "PrimaryUpiProvider" ADD VALUE IF NOT EXISTS 'UPI_SALE';
ALTER TYPE "PrimaryUpiProvider" ADD VALUE IF NOT EXISTS 'UPI_BHARAT_QR';

-- AlterTable
ALTER TABLE "payment_machines" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "payment_machines_is_default_idx" ON "payment_machines"("is_default");

-- CreateIndex
-- Only one live payment machine can be the default for a POS device (Menu 2 validation).
CREATE UNIQUE INDEX "payment_machines_pos_device_id_default_key"
  ON "payment_machines"("pos_device_id")
  WHERE "deleted_at" IS NULL AND "is_default" = true;

-- CreateIndex
CREATE INDEX "pos_devices_host_name_idx" ON "pos_devices"("host_name");
