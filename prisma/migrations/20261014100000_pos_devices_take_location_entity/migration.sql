-- A POS device bills under its location's entity unless another one is chosen. Devices without
-- an entity take their location's; devices that already have one, and locations without one,
-- are left as they are.
UPDATE "pos_devices" AS p
SET "legal_entity_id" = h."legal_entity_id"
FROM "hospitals" AS h
WHERE p."hospital_id" = h."id"
  AND p."legal_entity_id" IS NULL
  AND p."deleted_at" IS NULL
  AND h."legal_entity_id" IS NOT NULL;
