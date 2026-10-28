-- Pine Labs card payments at the till: a third online payment provider, and the card machine each
-- such payment was sent to. Additive only: a new enum value and a nullable column with its key.
ALTER TYPE "OnlinePaymentProvider" ADD VALUE IF NOT EXISTS 'PINELABS';

ALTER TABLE "online_payments" ADD COLUMN IF NOT EXISTS "payment_machine_id" UUID;

ALTER TABLE "online_payments"
  ADD CONSTRAINT "online_payments_payment_machine_id_fkey" FOREIGN KEY ("payment_machine_id")
  REFERENCES "payment_machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
