-- CreateEnum
CREATE TYPE "PrimaryUpiProvider" AS ENUM ('PHONEPE', 'BHARATPE', 'GOOGLE_PAY', 'OTHER');

-- CreateTable
CREATE TABLE "pos_devices" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity" TEXT,
    "host_name" TEXT,
    "is_kot_print_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_invoice_print_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pos_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_device_restaurants" (
    "id" UUID NOT NULL,
    "pos_device_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pos_device_restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_machines" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "pos_device_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "serial_number" TEXT,
    "pinelab_merchant_id" TEXT,
    "pinelab_security_token" TEXT,
    "pinelab_imei" TEXT,
    "pinelab_merchant_store_pos_code" TEXT,
    "primary_upi" "PrimaryUpiProvider",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payment_machines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_devices_hospital_id_idx" ON "pos_devices"("hospital_id");

-- CreateIndex
CREATE INDEX "pos_devices_deleted_at_idx" ON "pos_devices"("deleted_at");

-- CreateIndex
CREATE INDEX "pos_devices_is_active_idx" ON "pos_devices"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "pos_devices_hospital_id_code_key" ON "pos_devices"("hospital_id", "code");

-- CreateIndex
CREATE INDEX "pos_device_restaurants_deleted_at_idx" ON "pos_device_restaurants"("deleted_at");

-- CreateIndex
CREATE INDEX "pos_device_restaurants_is_active_idx" ON "pos_device_restaurants"("is_active");

-- CreateIndex
CREATE INDEX "pos_device_restaurants_pos_device_id_idx" ON "pos_device_restaurants"("pos_device_id");

-- CreateIndex
CREATE INDEX "pos_device_restaurants_restaurant_id_idx" ON "pos_device_restaurants"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_device_restaurants_pos_device_id_restaurant_id_key" ON "pos_device_restaurants"("pos_device_id", "restaurant_id");

-- CreateIndex
CREATE INDEX "payment_machines_hospital_id_idx" ON "payment_machines"("hospital_id");

-- CreateIndex
CREATE INDEX "payment_machines_pos_device_id_idx" ON "payment_machines"("pos_device_id");

-- CreateIndex
CREATE INDEX "payment_machines_deleted_at_idx" ON "payment_machines"("deleted_at");

-- CreateIndex
CREATE INDEX "payment_machines_is_active_idx" ON "payment_machines"("is_active");

-- AddForeignKey
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_device_restaurants" ADD CONSTRAINT "pos_device_restaurants_pos_device_id_fkey" FOREIGN KEY ("pos_device_id") REFERENCES "pos_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_device_restaurants" ADD CONSTRAINT "pos_device_restaurants_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_machines" ADD CONSTRAINT "payment_machines_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_machines" ADD CONSTRAINT "payment_machines_pos_device_id_fkey" FOREIGN KEY ("pos_device_id") REFERENCES "pos_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
