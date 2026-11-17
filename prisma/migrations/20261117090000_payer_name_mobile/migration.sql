-- Who paid: the payer's name on the bill (its mobile column already exists), and the name and
-- mobile given when an online payment was started (sent to Razorpay with the link). Additive.
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "customer_name" TEXT;
ALTER TABLE "online_payments" ADD COLUMN IF NOT EXISTS "customer_name" TEXT;
ALTER TABLE "online_payments" ADD COLUMN IF NOT EXISTS "customer_mobile" TEXT;
