-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('NORMAL', 'STAFF', 'ROOM', 'COUNTER');

-- AlterTable
ALTER TABLE "grns" ALTER COLUMN "grn_number" SET DEFAULT 'GRN' || lpad((nextval('grn_number_seq'::regclass))::text, 6, '0'::text);

-- AlterTable
ALTER TABLE "kitchen_productions" ALTER COLUMN "production_number" SET DEFAULT 'PRD' || lpad((nextval('kitchen_production_number_seq'::regclass))::text, 4, '0'::text);

-- AlterTable
ALTER TABLE "transfers" ALTER COLUMN "transfer_number" SET DEFAULT 'TRF' || lpad((nextval('transfer_number_seq'::regclass))::text, 4, '0'::text);

-- CreateTable
CREATE TABLE "item_prices" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "restaurant_id" UUID,
    "item_id" UUID NOT NULL,
    "rate_type" "RateType" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "is_tax_inclusive" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "item_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_prices_deleted_at_idx" ON "item_prices"("deleted_at");

-- CreateIndex
CREATE INDEX "item_prices_effective_from_idx" ON "item_prices"("effective_from");

-- CreateIndex
CREATE INDEX "item_prices_effective_to_idx" ON "item_prices"("effective_to");

-- CreateIndex
CREATE INDEX "item_prices_hospital_id_idx" ON "item_prices"("hospital_id");

-- CreateIndex
CREATE INDEX "item_prices_hospital_id_restaurant_id_item_id_rate_type_idx" ON "item_prices"("hospital_id", "restaurant_id", "item_id", "rate_type");

-- CreateIndex
CREATE INDEX "item_prices_is_active_idx" ON "item_prices"("is_active");

-- CreateIndex
CREATE INDEX "item_prices_item_id_idx" ON "item_prices"("item_id");

-- CreateIndex
CREATE INDEX "item_prices_rate_type_idx" ON "item_prices"("rate_type");

-- CreateIndex
CREATE INDEX "item_prices_restaurant_id_idx" ON "item_prices"("restaurant_id");

-- AddForeignKey
ALTER TABLE "item_prices" ADD CONSTRAINT "item_prices_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_prices" ADD CONSTRAINT "item_prices_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_prices" ADD CONSTRAINT "item_prices_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
