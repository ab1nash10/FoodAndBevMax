-- Legal entities: the registered name, address and GSTIN a location or restaurant bills under.
-- Locations and restaurants may link one; existing rows stay unlinked.

-- AlterTable
ALTER TABLE "hospitals" ADD COLUMN     "legal_entity_id" UUID;

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "legal_entity_id" UUID;

-- CreateTable
CREATE TABLE "legal_entities" (
    "id" UUID NOT NULL,
    "entity_name" TEXT NOT NULL,
    "entity_address" TEXT NOT NULL,
    "gst_number" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_entities_deleted_at_idx" ON "legal_entities"("deleted_at");

-- CreateIndex
CREATE INDEX "legal_entities_gst_number_idx" ON "legal_entities"("gst_number");

-- CreateIndex
CREATE INDEX "legal_entities_is_active_idx" ON "legal_entities"("is_active");

-- CreateIndex
CREATE INDEX "hospitals_legal_entity_id_idx" ON "hospitals"("legal_entity_id");

-- CreateIndex
CREATE INDEX "restaurants_legal_entity_id_idx" ON "restaurants"("legal_entity_id");

-- AddForeignKey
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

