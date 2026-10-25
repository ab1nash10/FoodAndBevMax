-- A restaurant can pass its ready-made leftovers to another restaurant (the receiver accepts).
ALTER TYPE "StockTransactionType" ADD VALUE IF NOT EXISTS 'RESTAURANT_TRANSFER_OUT';
