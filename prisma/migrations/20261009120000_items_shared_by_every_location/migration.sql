-- Items and item categories are shared by every location again. Dropping the column makes any
-- record that was kept by one location shared. Time slots and employees keep their location.

-- DropForeignKey
ALTER TABLE "item_categories" DROP CONSTRAINT "item_categories_hospital_id_fkey";

-- DropForeignKey
ALTER TABLE "items" DROP CONSTRAINT "items_hospital_id_fkey";

-- DropIndex
DROP INDEX "item_categories_hospital_id_idx";

-- DropIndex
DROP INDEX "items_hospital_id_idx";

-- AlterTable
ALTER TABLE "item_categories" DROP COLUMN "hospital_id";

-- AlterTable
ALTER TABLE "items" DROP COLUMN "hospital_id";
