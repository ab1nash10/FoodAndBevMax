-- The previous menu master's Sub-Code and Featured columns. Additive only.
ALTER TABLE "restaurant_menus" ADD COLUMN "sub_code" TEXT;
ALTER TABLE "restaurant_menus" ADD COLUMN "is_featured" BOOLEAN NOT NULL DEFAULT false;
