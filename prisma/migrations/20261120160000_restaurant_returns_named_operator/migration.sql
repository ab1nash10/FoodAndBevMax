-- Restaurants send stock back to the store (counted in by the store), and a transfer can name
-- the operator who must acknowledge it. Each statement can run again safely.

ALTER TYPE "StockTransactionType" ADD VALUE IF NOT EXISTS 'RESTAURANT_RETURN_OUT';
ALTER TYPE "StockTransactionType" ADD VALUE IF NOT EXISTS 'STORE_RETURN_IN';

ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "receiver_id" UUID;
