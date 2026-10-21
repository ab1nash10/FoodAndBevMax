-- AAHAR's own POS: counter bills with lines, totals, payment and complimentary details; a
-- per-counter bill sequence; stock movements for counter receipts and sales.
-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('COUNTER', 'ROOM');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CARD', 'UPI', 'CASH', 'OTHER');

-- AlterEnum
ALTER TYPE "OrderSource" ADD VALUE 'COUNTER';

-- AlterEnum
ALTER TYPE "StockReferenceType" ADD VALUE 'ORDER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockTransactionType" ADD VALUE 'COUNTER_RECEIVE_IN';
ALTER TYPE "StockTransactionType" ADD VALUE 'SALE_OUT';
ALTER TYPE "StockTransactionType" ADD VALUE 'SALE_CANCEL_IN';

-- AlterTable
ALTER TABLE "hospitals" ADD COLUMN     "bill_sequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "restaurant_orders" ADD COLUMN     "bed_number" TEXT,
ADD COLUMN     "bill_number" TEXT,
ADD COLUMN     "business_date" DATE,
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "channel" "OrderChannel",
ADD COLUMN     "complimentary_reason" TEXT,
ADD COLUMN     "created_by" UUID,
ADD COLUMN     "customer_mobile" TEXT,
ADD COLUMN     "employee_code" TEXT,
ADD COLUMN     "grand_total" DECIMAL(12,2),
ADD COLUMN     "gst_total" DECIMAL(12,2),
ADD COLUMN     "instructions" TEXT,
ADD COLUMN     "is_complimentary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payment_mode" "PaymentMode",
ADD COLUMN     "payment_reference" TEXT,
ADD COLUMN     "room_number" TEXT,
ADD COLUMN     "round_off" DECIMAL(12,2),
ADD COLUMN     "subtotal" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "restaurant_order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "restaurant_menu_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "item_name" TEXT NOT NULL,
    "menu_item_code" TEXT NOT NULL,
    "hsn_code" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "gst_percent" DECIMAL(5,2) NOT NULL,
    "is_gst_inclusive" BOOLEAN NOT NULL,
    "taxable_amount" DECIMAL(12,2) NOT NULL,
    "gst_amount" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "restaurant_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "restaurant_order_lines_order_id_idx" ON "restaurant_order_lines"("order_id");

-- CreateIndex
CREATE INDEX "restaurant_order_lines_item_id_idx" ON "restaurant_order_lines"("item_id");

-- CreateIndex
CREATE INDEX "restaurant_order_lines_restaurant_menu_id_idx" ON "restaurant_order_lines"("restaurant_menu_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_orders_hospital_id_bill_number_key" ON "restaurant_orders"("hospital_id", "bill_number");

-- CreateIndex
CREATE INDEX "restaurant_orders_counter_id_business_date_idx" ON "restaurant_orders"("counter_id", "business_date");

-- AddForeignKey
ALTER TABLE "restaurant_order_lines" ADD CONSTRAINT "restaurant_order_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_order_lines" ADD CONSTRAINT "restaurant_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "restaurant_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_order_lines" ADD CONSTRAINT "restaurant_order_lines_restaurant_menu_id_fkey" FOREIGN KEY ("restaurant_menu_id") REFERENCES "restaurant_menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Staff discount by employee type
-- AlterTable
ALTER TABLE "restaurant_order_lines" ADD COLUMN     "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "restaurant_orders" ADD COLUMN     "discount_percent" DECIMAL(5,2),
ADD COLUMN     "discount_total" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "restaurant_staff_discounts" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "employment_type" "EmploymentType" NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "restaurant_staff_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_staff_discounts_restaurant_id_employment_type_key" ON "restaurant_staff_discounts"("restaurant_id", "employment_type");

-- AddForeignKey
ALTER TABLE "restaurant_staff_discounts" ADD CONSTRAINT "restaurant_staff_discounts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

