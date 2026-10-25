-- Pre-deploy check for branch dev-v1-new: the migrations it adds (9 dated 2026-10-21, 5 dated
-- 2026-10-23, and older ones if the target database is further behind). The 2026-10-23 ones only add
-- tables, columns with defaults and enum values: nothing in them can fail on existing data.
-- READ-ONLY: it runs in two transactions that are both rolled back. The first is READ ONLY; the
-- second only creates a temporary function in pg_temp (this session only), dropped by its rollback.
--
-- Run against the database you are about to deploy to, e.g.:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/predeploy-check-dev-v1-new.sql
--
-- How to read it:
--   1. Every migration in the branch and whether the database has it (only PENDING ones run).
--   2. BLOCKERS: any row in sections 2a-2d or 3b makes a migration fail. Rename those rows by hand
--      (in the portal) before deploying.
--   3. NOT blockers, but data the migrations will change, so the right people can be told:
--      items renamed with their code, menu items losing a kitchen link, names re-cased.
--
-- If a migration fails anyway (tested on a copy of this situation, 2026-10-22):
--   * It is NOT undone. Prisma does not wrap a migration in a transaction, so the statements before
--     the failing one stay applied (e.g. 20261021150000 had already re-cased categories when it
--     stopped on roles). Every later deploy then refuses to run (P3009) until it is resolved.
--   * Recover: fix the clashing rows, then mark it rolled back and deploy again:
--       npx prisma migrate resolve --rolled-back <migration_name>
--   * 20261021160000 only: its first statement creates aahar_title_case(text), which a failed run
--     leaves behind, so first:  DROP FUNCTION IF EXISTS aahar_title_case(text);
--   * Re-run this check after fixing: a fix can miss rows the failed run already changed.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';

-- 1. Every migration in dev-v1-new, and whether this database has it. Only the PENDING ones run
--    on deploy; if none of the 2026-10-21 ones are pending, sections 2 and 3 do not apply.
SELECT repo.name AS migration,
       CASE WHEN m.finished_at IS NOT NULL THEN 'applied' WHEN m.migration_name IS NOT NULL THEN 'FAILED or rolled back' ELSE 'PENDING' END AS state
FROM (VALUES ('20260608130222_sprint_1_foundation'), ('20260616090000_phase_1_hospital_foundation_refactor'), ('20260617042757_phase_2a_master_data'), ('20260619054809_phase_2b_employee_master'), ('20260619062500_normalized_item_master_names'), ('20260619070000_phase_2c_mapping_foundation'), ('20260619083000_item_code_auto_generation'), ('20260619093000_restaurant_menu_arrays_and_positioning'), ('20260622093000_phase_3a_grn_store_stock'), ('20260624093000_phase_3b_store_restaurant_transfer'), ('20260624113000_phase_4a_kitchen_production'), ('20260624165000_phase_4b_kitchen_transfer'), ('20260626051932_organization_ba_refinement'), ('20260626094006_restaurant_master_ba_fields'), ('20260626110027_pos_device_payment_machine_refinement'), ('20260626114418_location_master_ui_refinement'), ('20260629082024_phase_4_6b_restaurant_menu_active'), ('20260630061843_phase_4_6c_item_price_master'), ('20260630063825_phase_4_6c_item_price_master'), ('20260630070917_item_price_gst_percent'), ('20260915090000_pos_payment_machine_default_and_upi_options'), ('20260921180000_user_permission_overrides'), ('20260921190000_user_passwords'), ('20260922000000_notifications'), ('20260922010000_user_location_scope'), ('20260922020000_user_profile_fields'), ('20261001090000_user_preferences'), ('20261001110000_user_session_version'), ('20261005120000_list_count_indexes'), ('20261006030000_document_numbers_keep_growing'), ('20261007120000_default_location_for_every_user'), ('20261008090000_location_specific_masters'), ('20261009120000_items_shared_by_every_location'), ('20261009150000_restaurant_menu_details_and_pricing'), ('20261009170000_restaurant_menu_own_times'), ('20261013090000_legal_entities'), ('20261013110000_restaurant_ihc_only'), ('20261013130000_drop_notifications'), ('20261013140000_legal_entity_location_names'), ('20261014090000_pos_device_legal_entity'), ('20261014100000_pos_devices_take_location_entity'), ('20261014120000_employee_employment_type'), ('20261015090000_restaurant_orders'), ('20261015100000_user_last_active'), ('20261015110000_orders_from_any_source'), ('20261015120000_board_order_details'), ('20261019090000_item_classified_by_mapping'), ('20261020090000_restaurant_menu_item_code'), ('20261021090000_category_per_mapping'), ('20261021100000_mapping_unique_per_category'), ('20261021110000_item_name_unique'), ('20261021120000_menu_kitchen_must_make_item'), ('20261021130000_menu_store_source'), ('20261021140000_item_names_capitalised'), ('20261021150000_names_capitalised_everywhere'), ('20261021160000_title_case_names_upper_case_codes'), ('20261021170000_pos_counter_billing'), ('20261023090000_kiosk_orders'), ('20261023120000_item_category_sort_order'), ('20261023130000_stock_discard'), ('20261023140000_employee_discounts'), ('20261023150000_restaurant_transfer_out'), ('20261023160000_counter_shifts_and_day_close'), ('20261024090000_online_payments'), ('20261024120000_menu_sub_code_featured')) AS repo(name)
LEFT JOIN "_prisma_migrations" m ON m.migration_name = repo.name AND m.rolled_back_at IS NULL
ORDER BY repo.name;

ROLLBACK;

BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE FUNCTION pg_temp.aahar_title_case(value text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
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

-- 2a item categories: names that the two naming migrations would turn into the SAME value. "item_categories"."category_name"
-- has a unique index, so any row here makes that migration FAIL and the deploy stops.
SELECT '2a item categories' AS "check", 'capitalise (20261021150000)' AS migration, upper(left("category_name", 1)) || substr("category_name", 2) AS becomes,
       string_agg(quote_literal("category_name"), ', ' ORDER BY "category_name") AS current_values
FROM "item_categories" GROUP BY upper(left("category_name", 1)) || substr("category_name", 2) HAVING count(*) > 1
UNION ALL
SELECT '2a item categories', 'title case (20261021160000)', pg_temp.aahar_title_case(upper(left("category_name", 1)) || substr("category_name", 2)),
       string_agg(quote_literal("category_name"), ', ' ORDER BY "category_name")
FROM "item_categories" GROUP BY pg_temp.aahar_title_case(upper(left("category_name", 1)) || substr("category_name", 2)) HAVING count(*) > 1;

-- 2b roles: names that the two naming migrations would turn into the SAME value. "roles"."name"
-- has a unique index, so any row here makes that migration FAIL and the deploy stops.
SELECT '2b roles' AS "check", 'capitalise (20261021150000)' AS migration, upper(left("name", 1)) || substr("name", 2) AS becomes,
       string_agg(quote_literal("name"), ', ' ORDER BY "name") AS current_values
FROM "roles" GROUP BY upper(left("name", 1)) || substr("name", 2) HAVING count(*) > 1
UNION ALL
SELECT '2b roles', 'title case (20261021160000)', pg_temp.aahar_title_case(upper(left("name", 1)) || substr("name", 2)),
       string_agg(quote_literal("name"), ', ' ORDER BY "name")
FROM "roles" GROUP BY pg_temp.aahar_title_case(upper(left("name", 1)) || substr("name", 2)) HAVING count(*) > 1;

-- 2c time slots: names that the two naming migrations would turn into the SAME value. "time_slots"."slot_name"
-- has a unique index, so any row here makes that migration FAIL and the deploy stops.
SELECT '2c time slots' AS "check", 'capitalise (20261021150000)' AS migration, upper(left("slot_name", 1)) || substr("slot_name", 2) AS becomes,
       string_agg(quote_literal("slot_name"), ', ' ORDER BY "slot_name") AS current_values
FROM "time_slots" GROUP BY upper(left("slot_name", 1)) || substr("slot_name", 2) HAVING count(*) > 1
UNION ALL
SELECT '2c time slots', 'title case (20261021160000)', pg_temp.aahar_title_case(upper(left("slot_name", 1)) || substr("slot_name", 2)),
       string_agg(quote_literal("slot_name"), ', ' ORDER BY "slot_name")
FROM "time_slots" GROUP BY pg_temp.aahar_title_case(upper(left("slot_name", 1)) || substr("slot_name", 2)) HAVING count(*) > 1;

-- 2d. Duplicate live mappings (same place and item). 20261021100000 adds a unique index on
--     (place, item, category); a row here makes it FAIL. Usually empty: the old (place, item)
--     index already prevented this, unless it was missing.
SELECT 'store_items' AS mapping, store_id AS place, item_id, count(*) FROM store_items WHERE deleted_at IS NULL GROUP BY store_id, item_id HAVING count(*) > 1
UNION ALL
SELECT 'kitchen_items', kitchen_id, item_id, count(*) FROM kitchen_items WHERE deleted_at IS NULL GROUP BY kitchen_id, item_id HAVING count(*) > 1
UNION ALL
SELECT 'restaurant_menus', restaurant_id, item_id, count(*) FROM restaurant_menus WHERE deleted_at IS NULL GROUP BY restaurant_id, item_id HAVING count(*) > 1;

-- 3a. Items the unique-name migration (20261021110000) RENAMES: every live item but the oldest
--     with the same normalized name gets " (<item code>)" appended. Not a failure, a data change.
SELECT item_code, item_name AS current_name, item_name || ' (' || item_code || ')' AS new_name,
       normalized_name AS duplicates_of
FROM (
  SELECT item_code, item_name, normalized_name,
         row_number() OVER (PARTITION BY normalized_name ORDER BY created_at, item_code) AS position
  FROM items WHERE deleted_at IS NULL
) ranked
WHERE position > 1
ORDER BY normalized_name, item_code;

-- 3b. After that rename, would any new name still clash? Any row here makes 20261021110000 FAIL.
WITH renamed AS (
  SELECT id, CASE WHEN position > 1
              THEN normalized_name || lower(regexp_replace(item_code, '[^a-zA-Z0-9]', '', 'g'))
              ELSE normalized_name END AS new_normalized
  FROM (
    SELECT id, item_code, normalized_name,
           row_number() OVER (PARTITION BY normalized_name ORDER BY created_at, item_code) AS position
    FROM items WHERE deleted_at IS NULL
  ) ranked
)
SELECT new_normalized, count(*) AS rows FROM renamed GROUP BY new_normalized HAVING count(*) > 1;

-- 3c. Menu items whose kitchen link 20261021120000 CLEARS (the kitchen does not make the item).
SELECT count(*) AS menu_items_losing_kitchen
FROM restaurant_menus menu
WHERE menu.kitchen_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM kitchen_items mapping
                  WHERE mapping.kitchen_id = menu.kitchen_id AND mapping.item_id = menu.item_id
                    AND mapping.deleted_at IS NULL);

-- 3d. How many item names the two naming migrations re-case (no failure possible: items are unique
--     on normalized_name, which ignores case).
SELECT count(*) AS item_names_recased FROM items
WHERE item_name IS DISTINCT FROM pg_temp.aahar_title_case(upper(left(item_name, 1)) || substr(item_name, 2));

ROLLBACK;
