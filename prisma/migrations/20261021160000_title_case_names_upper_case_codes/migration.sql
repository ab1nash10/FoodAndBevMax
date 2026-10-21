-- The naming convention, applied to names already saved (the API saves new ones this way; the
-- rules live in @aahar/config naming.ts and are mirrored here exactly):
--   Title Case, small joining words lower case unless first or after "(", all-capital words of
--   up to 3 letters or without a vowel kept as acronyms, fixed spellings for Dr, Ltd, Pvt, Co,
--   Inc, Mr, Mrs, Ms and Max, mixed-case words keep their case, and letters straight after an
--   apostrophe or a digit are left alone.
-- Codes are upper case. A code is only changed when that can't clash with another row.

CREATE FUNCTION aahar_title_case(value text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  token text;
  lower_token text;
  result text := '';
  previous text := '';
  seen_word boolean := false;
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;

  FOR token IN
    SELECT (regexp_matches(regexp_replace(btrim(value), '\s+', ' ', 'g'), '[A-Za-z]+|[^A-Za-z]+', 'g'))[1]
  LOOP
    IF token !~ '^[A-Za-z]' THEN
      result := result || token;
    ELSE
      lower_token := lower(token);

      IF previous ~ '[''’0-9]$' THEN
        result := result || token;
      ELSIF lower_token IN ('co', 'dr', 'inc', 'ltd', 'max', 'mr', 'mrs', 'ms', 'pvt') THEN
        result := result || upper(left(lower_token, 1)) || substr(lower_token, 2);
      ELSIF lower_token IN ('a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with') THEN
        result := result || CASE
          WHEN NOT seen_word OR previous ~ '[(\[]\s*$' THEN upper(left(lower_token, 1)) || substr(lower_token, 2)
          ELSE lower_token
        END;
      ELSIF token <> upper(token) AND token <> lower_token AND token !~ '^[A-Z][a-z]*$' THEN
        result := result || upper(left(token, 1)) || substr(token, 2);
      ELSIF token = upper(token) AND (length(token) <= 3 OR token !~ '[AEIOU]') THEN
        result := result || token;
      ELSE
        result := result || upper(left(lower_token, 1)) || substr(lower_token, 2);
      END IF;

      seen_word := true;
    END IF;

    previous := token;
  END LOOP;

  RETURN result;
END;
$$;

UPDATE "counters" SET "counter_name" = aahar_title_case("counter_name") WHERE "counter_name" IS DISTINCT FROM aahar_title_case("counter_name");

UPDATE "employees" SET "employee_name" = aahar_title_case("employee_name") WHERE "employee_name" IS DISTINCT FROM aahar_title_case("employee_name");

UPDATE "grns" SET "vendor_name" = aahar_title_case("vendor_name") WHERE "vendor_name" IS DISTINCT FROM aahar_title_case("vendor_name");

UPDATE "hospitals" SET "display_name" = aahar_title_case("display_name") WHERE "display_name" IS DISTINCT FROM aahar_title_case("display_name");

UPDATE "hospitals" SET "hospital_name" = aahar_title_case("hospital_name") WHERE "hospital_name" IS DISTINCT FROM aahar_title_case("hospital_name");

UPDATE "item_categories" SET "category_name" = aahar_title_case("category_name") WHERE "category_name" IS DISTINCT FROM aahar_title_case("category_name");

UPDATE "items" SET "item_name" = aahar_title_case("item_name") WHERE "item_name" IS DISTINCT FROM aahar_title_case("item_name");

UPDATE "kitchens" SET "kitchen_name" = aahar_title_case("kitchen_name") WHERE "kitchen_name" IS DISTINCT FROM aahar_title_case("kitchen_name");

UPDATE "legal_entities" SET "entity_name" = aahar_title_case("entity_name") WHERE "entity_name" IS DISTINCT FROM aahar_title_case("entity_name");

UPDATE "legal_entities" SET "location_name" = aahar_title_case("location_name") WHERE "location_name" IS DISTINCT FROM aahar_title_case("location_name");

UPDATE "locations" SET "location_name" = aahar_title_case("location_name") WHERE "location_name" IS DISTINCT FROM aahar_title_case("location_name");

UPDATE "payment_machines" SET "name" = aahar_title_case("name") WHERE "name" IS DISTINCT FROM aahar_title_case("name");

UPDATE "pos_devices" SET "name" = aahar_title_case("name") WHERE "name" IS DISTINCT FROM aahar_title_case("name");

UPDATE "restaurants" SET "bank_name" = aahar_title_case("bank_name") WHERE "bank_name" IS DISTINCT FROM aahar_title_case("bank_name");

UPDATE "restaurants" SET "legal_name" = aahar_title_case("legal_name") WHERE "legal_name" IS DISTINCT FROM aahar_title_case("legal_name");

UPDATE "restaurants" SET "qr_unit_name" = aahar_title_case("qr_unit_name") WHERE "qr_unit_name" IS DISTINCT FROM aahar_title_case("qr_unit_name");

UPDATE "restaurants" SET "restaurant_name" = aahar_title_case("restaurant_name") WHERE "restaurant_name" IS DISTINCT FROM aahar_title_case("restaurant_name");

UPDATE "roles" SET "name" = aahar_title_case("name") WHERE "name" IS DISTINCT FROM aahar_title_case("name");

UPDATE "stores" SET "store_name" = aahar_title_case("store_name") WHERE "store_name" IS DISTINCT FROM aahar_title_case("store_name");

UPDATE "time_slots" SET "slot_name" = aahar_title_case("slot_name") WHERE "slot_name" IS DISTINCT FROM aahar_title_case("slot_name");

UPDATE "users" SET "name" = aahar_title_case("name") WHERE "name" IS DISTINCT FROM aahar_title_case("name");

DROP FUNCTION aahar_title_case(text);

-- Codes: upper case, unless another row already holds that code in the same scope.
UPDATE "hospitals" AS row SET "hospital_code" = upper(row."hospital_code")
WHERE row."hospital_code" <> upper(row."hospital_code")
  AND NOT EXISTS (SELECT 1 FROM "hospitals" other WHERE other."id" <> row."id" AND upper(other."hospital_code") = upper(row."hospital_code"));

UPDATE "stores" AS row SET "store_code" = upper(row."store_code")
WHERE row."store_code" <> upper(row."store_code")
  AND NOT EXISTS (SELECT 1 FROM "stores" other WHERE other."id" <> row."id" AND other."hospital_id" = row."hospital_id" AND upper(other."store_code") = upper(row."store_code"));

UPDATE "kitchens" AS row SET "kitchen_code" = upper(row."kitchen_code")
WHERE row."kitchen_code" <> upper(row."kitchen_code")
  AND NOT EXISTS (SELECT 1 FROM "kitchens" other WHERE other."id" <> row."id" AND other."hospital_id" = row."hospital_id" AND upper(other."kitchen_code") = upper(row."kitchen_code"));

UPDATE "restaurants" AS row SET "restaurant_code" = upper(row."restaurant_code")
WHERE row."restaurant_code" <> upper(row."restaurant_code")
  AND NOT EXISTS (SELECT 1 FROM "restaurants" other WHERE other."id" <> row."id" AND other."hospital_id" = row."hospital_id" AND upper(other."restaurant_code") = upper(row."restaurant_code"));

UPDATE "counters" AS row SET "counter_code" = upper(row."counter_code")
WHERE row."counter_code" <> upper(row."counter_code")
  AND NOT EXISTS (SELECT 1 FROM "counters" other WHERE other."id" <> row."id" AND upper(other."counter_code") = upper(row."counter_code"));

UPDATE "employees" AS row SET "employee_code" = upper(row."employee_code")
WHERE row."employee_code" <> upper(row."employee_code")
  AND NOT EXISTS (SELECT 1 FROM "employees" other WHERE other."id" <> row."id" AND upper(other."employee_code") = upper(row."employee_code"));

UPDATE "users" AS row SET "employee_code" = upper(row."employee_code")
WHERE row."employee_code" <> upper(row."employee_code")
  AND NOT EXISTS (SELECT 1 FROM "users" other WHERE other."id" <> row."id" AND upper(other."employee_code") = upper(row."employee_code"));

-- Not unique, so nothing can clash.
UPDATE "items" SET "hsn_code" = upper("hsn_code") WHERE "hsn_code" <> upper("hsn_code");
UPDATE "restaurants" SET "ifsc_code" = upper("ifsc_code") WHERE "ifsc_code" <> upper("ifsc_code");
