-- AlterTable
ALTER TABLE "grns" ALTER COLUMN "grn_number" SET DEFAULT 'GRN' || lpad((nextval('grn_number_seq'::regclass))::text, 6, '0'::text);

CREATE SEQUENCE IF NOT EXISTS store_code_sequence;

DO $$
DECLARE
  highest_store_code INTEGER;
BEGIN
  SELECT MAX(SUBSTRING(store_code FROM 4)::INTEGER)
  INTO highest_store_code
  FROM stores
  WHERE store_code ~ '^STR[0-9]+$';

  IF highest_store_code IS NULL THEN
    PERFORM setval('store_code_sequence', 1, false);
  ELSE
    PERFORM setval('store_code_sequence', highest_store_code, true);
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS kitchen_code_sequence;

DO $$
DECLARE
  highest_kitchen_code INTEGER;
BEGIN
  SELECT MAX(SUBSTRING(kitchen_code FROM 4)::INTEGER)
  INTO highest_kitchen_code
  FROM kitchens
  WHERE kitchen_code ~ '^KIT[0-9]+$';

  IF highest_kitchen_code IS NULL THEN
    PERFORM setval('kitchen_code_sequence', 1, false);
  ELSE
    PERFORM setval('kitchen_code_sequence', highest_kitchen_code, true);
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS restaurant_code_sequence;

DO $$
DECLARE
  highest_restaurant_code INTEGER;
BEGIN
  SELECT MAX(SUBSTRING(restaurant_code FROM 4)::INTEGER)
  INTO highest_restaurant_code
  FROM restaurants
  WHERE restaurant_code ~ '^RST[0-9]+$';

  IF highest_restaurant_code IS NULL THEN
    PERFORM setval('restaurant_code_sequence', 1, false);
  ELSE
    PERFORM setval('restaurant_code_sequence', highest_restaurant_code, true);
  END IF;
END $$;

-- AlterTable
ALTER TABLE "kitchen_productions" ALTER COLUMN "production_number" SET DEFAULT 'PRD' || lpad((nextval('kitchen_production_number_seq'::regclass))::text, 4, '0'::text);

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "account_number" TEXT,
ADD COLUMN     "at_table_dining" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cover_image_url" TEXT,
ADD COLUMN     "delivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "gst_address" TEXT,
ADD COLUMN     "home_delivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ifsc_code" TEXT,
ADD COLUMN     "in_car_dining" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inventory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "mobile" TEXT,
ADD COLUMN     "offline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "open_24x7" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pos_orders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qr_unit_name" TEXT,
ADD COLUMN     "takeaway" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "thumbnail_url" TEXT,
ADD COLUMN     "veg_only" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "transfers" ALTER COLUMN "transfer_number" SET DEFAULT 'TRF' || lpad((nextval('transfer_number_seq'::regclass))::text, 4, '0'::text);

-- CreateTable
CREATE TABLE "restaurant_kitchens" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "kitchen_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "restaurant_kitchens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "restaurant_kitchens_deleted_at_idx" ON "restaurant_kitchens"("deleted_at");

-- CreateIndex
CREATE INDEX "restaurant_kitchens_is_active_idx" ON "restaurant_kitchens"("is_active");

-- CreateIndex
CREATE INDEX "restaurant_kitchens_kitchen_id_idx" ON "restaurant_kitchens"("kitchen_id");

-- CreateIndex
CREATE INDEX "restaurant_kitchens_restaurant_id_idx" ON "restaurant_kitchens"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_kitchens_restaurant_id_kitchen_id_key" ON "restaurant_kitchens"("restaurant_id", "kitchen_id");

-- AddForeignKey
ALTER TABLE "restaurant_kitchens" ADD CONSTRAINT "restaurant_kitchens_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_kitchens" ADD CONSTRAINT "restaurant_kitchens_kitchen_id_fkey" FOREIGN KEY ("kitchen_id") REFERENCES "kitchens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
