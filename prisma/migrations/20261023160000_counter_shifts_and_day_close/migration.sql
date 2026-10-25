-- Shifts at a counter (open, hand over, close with the cash counted) and closing a counter's
-- business day. Only adds: existing bills keep no shift, restaurants default to CASHIER shifts.

-- CreateEnum
CREATE TYPE "ShiftMode" AS ENUM ('CASHIER', 'FIXED');

-- CreateEnum
CREATE TYPE "CounterShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'HANDED_OVER');

-- AlterTable
ALTER TABLE "restaurant_orders" ADD COLUMN     "shift_id" UUID;

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "shift_mode" "ShiftMode" NOT NULL DEFAULT 'CASHIER',
ADD COLUMN     "shift_timings" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "counter_shifts" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "counter_id" UUID NOT NULL,
    "name" TEXT,
    "status" "CounterShiftStatus" NOT NULL DEFAULT 'OPEN',
    "opened_by" UUID NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taken_over_from_id" UUID,
    "closed_by" UUID,
    "closed_at" TIMESTAMP(3),
    "expected_cash" DECIMAL(12,2),
    "counted_cash" DECIMAL(12,2),
    "summary" JSONB,
    "handover_stock" JSONB,
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counter_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counter_day_closes" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "counter_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "closed_by" UUID,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,

    CONSTRAINT "counter_day_closes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "counter_shifts_taken_over_from_id_key" ON "counter_shifts"("taken_over_from_id");

-- CreateIndex
CREATE INDEX "counter_shifts_counter_id_status_idx" ON "counter_shifts"("counter_id", "status");

-- CreateIndex
CREATE INDEX "counter_shifts_hospital_id_idx" ON "counter_shifts"("hospital_id");

-- CreateIndex
CREATE INDEX "counter_day_closes_hospital_id_idx" ON "counter_day_closes"("hospital_id");

-- CreateIndex
CREATE UNIQUE INDEX "counter_day_closes_counter_id_business_date_key" ON "counter_day_closes"("counter_id", "business_date");

-- CreateIndex
CREATE INDEX "restaurant_orders_shift_id_idx" ON "restaurant_orders"("shift_id");

-- AddForeignKey
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "counter_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_shifts" ADD CONSTRAINT "counter_shifts_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "counters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_shifts" ADD CONSTRAINT "counter_shifts_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_shifts" ADD CONSTRAINT "counter_shifts_taken_over_from_id_fkey" FOREIGN KEY ("taken_over_from_id") REFERENCES "counter_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_day_closes" ADD CONSTRAINT "counter_day_closes_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "counters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_day_closes" ADD CONSTRAINT "counter_day_closes_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

