ALTER TYPE "StockTransactionType" ADD VALUE IF NOT EXISTS 'KITCHEN_TRANSFER_OUT';
ALTER TYPE "StockTransactionType" ADD VALUE IF NOT EXISTS 'RESTAURANT_TRANSFER_IN';

ALTER TABLE "transfer_lines"
  ALTER COLUMN "batch_number" DROP NOT NULL,
  ALTER COLUMN "expiry_date" DROP NOT NULL;

ALTER TABLE "transfer_acknowledgement_lines"
  ALTER COLUMN "batch_number" DROP NOT NULL,
  ALTER COLUMN "expiry_date" DROP NOT NULL;
