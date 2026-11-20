-- Rooms, beds and tables: each gets a QR that opens ordering with the room filled in. Additive.
CREATE TABLE IF NOT EXISTS "rooms" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "room_code" TEXT NOT NULL,
    "room_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rooms_room_code_key" ON "rooms"("room_code");
CREATE INDEX IF NOT EXISTS "rooms_hospital_id_idx" ON "rooms"("hospital_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_hospital_id_fkey') THEN
    ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hospital_id_fkey" FOREIGN KEY ("hospital_id")
      REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Codes R-000001, R-000002, … in the order rooms are added.
CREATE SEQUENCE IF NOT EXISTS room_code_sequence;
