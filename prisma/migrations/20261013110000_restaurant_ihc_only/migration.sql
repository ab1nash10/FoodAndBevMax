-- Restaurants get an "IHC only" option, off for every existing restaurant.

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "ihc_only" BOOLEAN NOT NULL DEFAULT false;

