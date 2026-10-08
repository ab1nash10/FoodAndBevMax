-- Items, item categories, time slots and employees can belong to one location. An empty
-- hospital_id means the record is shared by every location, which is what every existing row
-- stays as, so nothing changes until a record is given a location.

-- AlterTable
ALTER TABLE "item_categories" ADD COLUMN     "hospital_id" UUID;

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "hospital_id" UUID;

-- AlterTable
ALTER TABLE "time_slots" ADD COLUMN     "hospital_id" UUID;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "hospital_id" UUID;

-- CreateIndex
CREATE INDEX "item_categories_hospital_id_idx" ON "item_categories"("hospital_id");

-- CreateIndex
CREATE INDEX "items_hospital_id_idx" ON "items"("hospital_id");

-- CreateIndex
CREATE INDEX "time_slots_hospital_id_idx" ON "time_slots"("hospital_id");

-- CreateIndex
CREATE INDEX "employees_hospital_id_idx" ON "employees"("hospital_id");

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
