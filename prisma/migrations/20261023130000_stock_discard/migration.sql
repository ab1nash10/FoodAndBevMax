-- A batch's stock can be thrown away (Discard on a stock screen), recorded as its own movement.
ALTER TYPE "StockTransactionType" ADD VALUE IF NOT EXISTS 'DISCARD_OUT';
