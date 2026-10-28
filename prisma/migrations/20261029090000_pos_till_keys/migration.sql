-- A till is the browser an admin set up as a POS device: it holds a secret key, of which the
-- device keeps only the SHA-256. Additive: a new nullable column and its unique index.
ALTER TABLE "pos_devices" ADD COLUMN IF NOT EXISTS "till_key_hash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "pos_devices_till_key_hash_key" ON "pos_devices"("till_key_hash");
