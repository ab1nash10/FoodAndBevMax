-- AlterTable
ALTER TABLE "grns" ALTER COLUMN "grn_number" SET DEFAULT 'GRN' || lpad((nextval('grn_number_seq'::regclass))::text, 6, '0'::text);

-- AlterTable
ALTER TABLE "kitchen_productions" ALTER COLUMN "production_number" SET DEFAULT 'PRD' || lpad((nextval('kitchen_production_number_seq'::regclass))::text, 4, '0'::text);

-- AlterTable
ALTER TABLE "restaurant_menus" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "transfers" ALTER COLUMN "transfer_number" SET DEFAULT 'TRF' || lpad((nextval('transfer_number_seq'::regclass))::text, 4, '0'::text);

-- CreateIndex
CREATE INDEX "restaurant_menus_is_active_idx" ON "restaurant_menus"("is_active");
