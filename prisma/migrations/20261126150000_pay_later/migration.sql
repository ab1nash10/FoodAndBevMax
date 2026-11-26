-- Pay later for room orders (the user, 2026-11-26): billed now, the payment collected later at a
-- till and counted in that till's shift. Additive only (an enum value, five columns, an index).
-- Re-runnable.
ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'PAY_LATER';

ALTER TABLE "restaurant_orders"
    ADD COLUMN IF NOT EXISTS "collected_mode" "PaymentMode",
    ADD COLUMN IF NOT EXISTS "collected_reference" TEXT,
    ADD COLUMN IF NOT EXISTS "collected_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "collected_by" UUID,
    ADD COLUMN IF NOT EXISTS "collected_shift_id" UUID;

CREATE INDEX IF NOT EXISTS "restaurant_orders_collected_shift_id_idx"
    ON "restaurant_orders"("collected_shift_id");
