-- Every user has a default location: users.hospital_id, where the portal starts them after
-- sign-in. Data only. A default that already points at a live location is left as it is, so
-- nobody's access changes (the access resolver counts users.hospital_id as an assigned location).

-- 1. A location saved as the default in Preferences becomes the default, when the user still
--    works there (an assigned location) or reaches every location.
UPDATE "users" u
SET "hospital_id" = (u."preferences"->>'defaultLocationId')::uuid,
    "updated_at" = now()
WHERE u."deleted_at" IS NULL
  AND u."preferences"->>'defaultLocationId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND u."hospital_id" IS DISTINCT FROM (u."preferences"->>'defaultLocationId')::uuid
  AND EXISTS (
    SELECT 1 FROM "hospitals" h
    WHERE h."id" = (u."preferences"->>'defaultLocationId')::uuid AND h."deleted_at" IS NULL
  )
  AND (
    EXISTS (
      SELECT 1 FROM "user_hospitals" uh
      WHERE uh."user_id" = u."id" AND uh."deleted_at" IS NULL
        AND uh."hospital_id" = (u."preferences"->>'defaultLocationId')::uuid
    )
    OR EXISTS (
      SELECT 1 FROM "user_roles" ur JOIN "roles" r ON r."id" = ur."role_id"
      WHERE ur."user_id" = u."id" AND ur."deleted_at" IS NULL AND r."deleted_at" IS NULL
        AND r."location_scope" = 'ALL'
    )
  );

-- The default now lives only in users.hospital_id.
UPDATE "users"
SET "preferences" = "preferences" - 'defaultLocationId'
WHERE "preferences" ? 'defaultLocationId';

-- 2. A user with no default, or one pointing at a deleted location, gets their earliest
--    still-assigned location.
UPDATE "users" u
SET "hospital_id" = first_assigned."hospital_id",
    "updated_at" = now()
FROM (
  SELECT DISTINCT ON (uh."user_id") uh."user_id", uh."hospital_id"
  FROM "user_hospitals" uh
  JOIN "hospitals" h ON h."id" = uh."hospital_id" AND h."deleted_at" IS NULL
  WHERE uh."deleted_at" IS NULL
  ORDER BY uh."user_id", uh."created_at", uh."hospital_id"
) first_assigned
WHERE first_assigned."user_id" = u."id"
  AND u."deleted_at" IS NULL
  AND (
    u."hospital_id" IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM "hospitals" h WHERE h."id" = u."hospital_id" AND h."deleted_at" IS NULL
    )
  );

-- 3. A user who reaches every location (Super Admin) and still has no default gets the first
--    active location by name. Anyone else left without one has no location assigned at all and
--    already sees no data; an administrator assigns their location.
UPDATE "users" u
SET "hospital_id" = (
      SELECT h."id" FROM "hospitals" h
      WHERE h."deleted_at" IS NULL AND h."is_active"
      ORDER BY h."hospital_name", h."id"
      LIMIT 1
    ),
    "updated_at" = now()
WHERE u."deleted_at" IS NULL
  AND (
    u."hospital_id" IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM "hospitals" h WHERE h."id" = u."hospital_id" AND h."deleted_at" IS NULL
    )
  )
  AND EXISTS (
    SELECT 1 FROM "user_roles" ur JOIN "roles" r ON r."id" = ur."role_id"
    WHERE ur."user_id" = u."id" AND ur."deleted_at" IS NULL AND r."deleted_at" IS NULL
      AND r."location_scope" = 'ALL'
  )
  AND EXISTS (SELECT 1 FROM "hospitals" h WHERE h."deleted_at" IS NULL AND h."is_active");
