-- AlterTable
ALTER TABLE "grns" ALTER COLUMN "grn_number" SET DEFAULT 'GRN' || lpad((nextval('grn_number_seq'::regclass))::text, 6, '0'::text);

-- AlterTable
ALTER TABLE "kitchen_productions" ALTER COLUMN "production_number" SET DEFAULT 'PRD' || lpad((nextval('kitchen_production_number_seq'::regclass))::text, 4, '0'::text);

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "is_registered_in_gst" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sodexo_mid" TEXT,
ADD COLUMN     "sodexo_tid" TEXT;

-- AlterTable
ALTER TABLE "transfers" ALTER COLUMN "transfer_number" SET DEFAULT 'TRF' || lpad((nextval('transfer_number_seq'::regclass))::text, 4, '0'::text);
