-- QR ordering: a guest orders from the restaurant's QR on their phone and pays by UPI; the paid
-- order is billed at the restaurant's QR counter. Staff confirm their discount with an OTP on
-- their registered mobile. Additive only (a nullable column, a type, two tables). Re-runnable.
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "qr_counter_id" UUID;

DO $$ BEGIN
  CREATE TYPE "QrOrderStatus" AS ENUM ('AWAITING_PAYMENT', 'BILLED', 'PAID_NOT_BILLED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "qr_orders" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "counter_id" UUID NOT NULL,
    "client_order_id" TEXT NOT NULL,
    "channel" "OrderChannel" NOT NULL,
    "room_number" TEXT,
    "bed_number" TEXT,
    "instructions" TEXT,
    "lines" JSONB NOT NULL,
    "employee_code" TEXT,
    "grand_total" DECIMAL(12,2) NOT NULL,
    "online_payment_id" UUID NOT NULL,
    "billed_order_id" UUID,
    "status" "QrOrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "staff_discount_otps" (
    "id" UUID NOT NULL,
    "employee_code" TEXT NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "token_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_discount_otps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "qr_orders_online_payment_id_key" ON "qr_orders"("online_payment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "qr_orders_billed_order_id_key" ON "qr_orders"("billed_order_id");
CREATE INDEX IF NOT EXISTS "qr_orders_hospital_id_status_idx" ON "qr_orders"("hospital_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "qr_orders_restaurant_id_client_order_id_key"
    ON "qr_orders"("restaurant_id", "client_order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "staff_discount_otps_token_hash_key" ON "staff_discount_otps"("token_hash");
CREATE INDEX IF NOT EXISTS "staff_discount_otps_employee_code_created_at_idx"
    ON "staff_discount_otps"("employee_code", "created_at");

DO $$ BEGIN
  ALTER TABLE "qr_orders" ADD CONSTRAINT "qr_orders_hospital_id_fkey" FOREIGN KEY ("hospital_id")
    REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "qr_orders" ADD CONSTRAINT "qr_orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id")
    REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "qr_orders" ADD CONSTRAINT "qr_orders_online_payment_id_fkey" FOREIGN KEY ("online_payment_id")
    REFERENCES "online_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "qr_orders" ADD CONSTRAINT "qr_orders_billed_order_id_fkey" FOREIGN KEY ("billed_order_id")
    REFERENCES "restaurant_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
