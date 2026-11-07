-- Stewards: the Delivery Operator taking an order to the guest, assigned by the till or the
-- kitchen (additive: two nullable columns). Re-runnable.
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "steward_id" UUID;
ALTER TABLE "restaurant_orders" ADD COLUMN IF NOT EXISTS "steward_assigned_at" TIMESTAMP(3);
