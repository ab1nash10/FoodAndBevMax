-- A room order the guest placed on their phone gets a six-digit code at billing: their order page
-- shows it as a QR, and the steward scans (or types) it at the bed to mark the order delivered.
-- Runs again safely if a deploy stops part way.

ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "delivery_code" TEXT;
