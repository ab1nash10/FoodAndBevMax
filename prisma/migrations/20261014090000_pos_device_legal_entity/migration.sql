-- POS devices link to a legal entity, as locations and restaurants do. The old free-text
-- "entity" column stays, unused; no existing value can be matched to an entity.

-- AlterTable
ALTER TABLE "pos_devices" ADD COLUMN     "legal_entity_id" UUID;

-- CreateIndex
CREATE INDEX "pos_devices_legal_entity_id_idx" ON "pos_devices"("legal_entity_id");

-- AddForeignKey
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

