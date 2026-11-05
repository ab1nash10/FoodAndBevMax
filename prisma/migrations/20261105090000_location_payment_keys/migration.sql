-- Each location's own PayU / Razorpay account for its Online Payment Option (additive: nullable
-- columns only; unset, the location keeps using the shared server keys).
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "payu_client_id" TEXT;
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "payu_merchant_id" TEXT;
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "payu_client_secret" TEXT;
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "razorpay_key_id" TEXT;
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "razorpay_key_secret" TEXT;
