-- Online UPI at the till: a Razorpay or PayU payment link shown as a QR, checked until paid,
-- then used for one bill. Only adds a table.

-- CreateEnum
CREATE TYPE "OnlinePaymentProvider" AS ENUM ('RAZORPAY', 'PAYU');

-- CreateEnum
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "online_payments" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "counter_id" UUID NOT NULL,
    "provider" "OnlinePaymentProvider" NOT NULL,
    "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "provider_ref" TEXT NOT NULL,
    "payment_url" TEXT NOT NULL,
    "paid_reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "order_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_payments_order_id_key" ON "online_payments"("order_id");

-- CreateIndex
CREATE INDEX "online_payments_counter_id_status_idx" ON "online_payments"("counter_id", "status");

-- CreateIndex
CREATE INDEX "online_payments_hospital_id_idx" ON "online_payments"("hospital_id");

-- CreateIndex
CREATE UNIQUE INDEX "online_payments_provider_provider_ref_key" ON "online_payments"("provider", "provider_ref");

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "counters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "restaurant_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

