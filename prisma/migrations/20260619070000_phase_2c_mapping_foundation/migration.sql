CREATE TABLE "time_slots" (
    "id" UUID NOT NULL,
    "slot_name" TEXT NOT NULL,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "is_always_available" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "time_slots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_items" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "store_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kitchen_items" (
    "id" UUID NOT NULL,
    "kitchen_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "kitchen_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restaurant_menus" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "time_slot_id" UUID,
    "days_of_week" VARCHAR(100),
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "restaurant_menus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "time_slots_slot_name_key" ON "time_slots"("slot_name");
CREATE INDEX "time_slots_deleted_at_idx" ON "time_slots"("deleted_at");
CREATE INDEX "time_slots_is_active_idx" ON "time_slots"("is_active");
CREATE INDEX "time_slots_is_always_available_idx" ON "time_slots"("is_always_available");

CREATE INDEX "store_items_deleted_at_idx" ON "store_items"("deleted_at");
CREATE INDEX "store_items_is_active_idx" ON "store_items"("is_active");
CREATE INDEX "store_items_item_id_idx" ON "store_items"("item_id");
CREATE INDEX "store_items_store_id_idx" ON "store_items"("store_id");
CREATE INDEX "store_items_store_id_item_id_idx" ON "store_items"("store_id", "item_id");
CREATE UNIQUE INDEX "store_items_store_id_item_id_active_key" ON "store_items"("store_id", "item_id") WHERE "deleted_at" IS NULL;

CREATE INDEX "kitchen_items_deleted_at_idx" ON "kitchen_items"("deleted_at");
CREATE INDEX "kitchen_items_is_active_idx" ON "kitchen_items"("is_active");
CREATE INDEX "kitchen_items_item_id_idx" ON "kitchen_items"("item_id");
CREATE INDEX "kitchen_items_kitchen_id_idx" ON "kitchen_items"("kitchen_id");
CREATE INDEX "kitchen_items_kitchen_id_item_id_idx" ON "kitchen_items"("kitchen_id", "item_id");
CREATE UNIQUE INDEX "kitchen_items_kitchen_id_item_id_active_key" ON "kitchen_items"("kitchen_id", "item_id") WHERE "deleted_at" IS NULL;

CREATE INDEX "restaurant_menus_deleted_at_idx" ON "restaurant_menus"("deleted_at");
CREATE INDEX "restaurant_menus_hospital_id_idx" ON "restaurant_menus"("hospital_id");
CREATE INDEX "restaurant_menus_item_id_idx" ON "restaurant_menus"("item_id");
CREATE INDEX "restaurant_menus_restaurant_id_idx" ON "restaurant_menus"("restaurant_id");
CREATE INDEX "restaurant_menus_restaurant_id_item_id_idx" ON "restaurant_menus"("restaurant_id", "item_id");
CREATE INDEX "restaurant_menus_time_slot_id_idx" ON "restaurant_menus"("time_slot_id");
CREATE UNIQUE INDEX "restaurant_menus_restaurant_id_item_id_active_key" ON "restaurant_menus"("restaurant_id", "item_id") WHERE "deleted_at" IS NULL;

ALTER TABLE "store_items" ADD CONSTRAINT "store_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "store_items" ADD CONSTRAINT "store_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kitchen_items" ADD CONSTRAINT "kitchen_items_kitchen_id_fkey" FOREIGN KEY ("kitchen_id") REFERENCES "kitchens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kitchen_items" ADD CONSTRAINT "kitchen_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "restaurant_menus" ADD CONSTRAINT "restaurant_menus_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurant_menus" ADD CONSTRAINT "restaurant_menus_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurant_menus" ADD CONSTRAINT "restaurant_menus_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurant_menus" ADD CONSTRAINT "restaurant_menus_time_slot_id_fkey" FOREIGN KEY ("time_slot_id") REFERENCES "time_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
