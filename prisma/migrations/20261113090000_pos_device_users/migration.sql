-- Who may open a POS device's till, each from their own computer. Additive: a new table. Tills
-- set up before keep their old key column, which is no longer read: every till's user types the
-- computer name once more after an admin lists them on the device.
CREATE TABLE IF NOT EXISTS "pos_device_users" (
    "id" UUID NOT NULL,
    "pos_device_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "host_name" TEXT NOT NULL,
    "till_key_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "pos_device_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_device_users_pos_device_id_user_id_key" ON "pos_device_users"("pos_device_id", "user_id");
CREATE INDEX IF NOT EXISTS "pos_device_users_user_id_idx" ON "pos_device_users"("user_id");
CREATE INDEX IF NOT EXISTS "pos_device_users_till_key_hash_idx" ON "pos_device_users"("till_key_hash");

DO $$ BEGIN
  ALTER TABLE "pos_device_users" ADD CONSTRAINT "pos_device_users_pos_device_id_fkey" FOREIGN KEY ("pos_device_id") REFERENCES "pos_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pos_device_users" ADD CONSTRAINT "pos_device_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
