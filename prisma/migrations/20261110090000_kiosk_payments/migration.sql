-- Kiosk orders paid at the kiosk (UPI QR or the counter's card machine), billed at the
-- restaurant's kiosk counter; guest orders say where they came from. Additive. Re-runnable.
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "kiosk_counter_id" UUID;

DO $$ BEGIN
  CREATE TYPE "GuestOrderSource" AS ENUM ('QR', 'KIOSK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "qr_orders" ADD COLUMN IF NOT EXISTS "source" "GuestOrderSource" NOT NULL DEFAULT 'QR';
