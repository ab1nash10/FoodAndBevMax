-- A location is named by its entity's Location column (legal_entities.location_name), as the
-- Legal Entities list shows it. A display name that only copied the old name follows it;
-- one set apart (e.g. "Max Healthcare Corporate Office") is kept. Deleted locations keep theirs.
UPDATE "hospitals" AS h
SET "display_name" = CASE
      WHEN h."display_name" IS NULL OR h."display_name" = h."hospital_name"
        THEN btrim(le."location_name")
      ELSE h."display_name"
    END,
    "hospital_name" = btrim(le."location_name"),
    "updated_at" = now()
FROM "legal_entities" AS le
WHERE h."legal_entity_id" = le."id"
  AND h."deleted_at" IS NULL
  AND btrim(coalesce(le."location_name", '')) <> ''
  AND h."hospital_name" <> btrim(le."location_name");
