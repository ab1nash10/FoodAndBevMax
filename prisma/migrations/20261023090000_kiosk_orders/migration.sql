-- Self-service kiosk orders, paid at a counter: the cashier loads one by its number and bills it.
-- Additive only: a new table.
-- CreateTable
CREATE TABLE "kiosk_orders" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "number" INTEGER NOT NULL,
    "client_order_id" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "employee_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billed_order_id" UUID,

    CONSTRAINT "kiosk_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_orders_billed_order_id_key" ON "kiosk_orders"("billed_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_orders_restaurant_id_business_date_number_key" ON "kiosk_orders"("restaurant_id", "business_date", "number");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_orders_restaurant_id_client_order_id_key" ON "kiosk_orders"("restaurant_id", "client_order_id");

-- AddForeignKey
ALTER TABLE "kiosk_orders" ADD CONSTRAINT "kiosk_orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

