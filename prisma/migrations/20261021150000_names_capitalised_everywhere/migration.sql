-- The naming convention, everywhere a person types a name: the first letter is a capital and
-- the rest keeps its case (the API now saves every name that way). Existing names are brought
-- in line. Codes, emails and technical fields (host names, audit table names) are left alone,
-- and normalized names, which ignore case, are unaffected.

UPDATE "counters" SET "counter_name" = upper(left("counter_name", 1)) || substr("counter_name", 2)
WHERE left("counter_name", 1) <> upper(left("counter_name", 1));

UPDATE "employees" SET "employee_name" = upper(left("employee_name", 1)) || substr("employee_name", 2)
WHERE left("employee_name", 1) <> upper(left("employee_name", 1));

UPDATE "grns" SET "vendor_name" = upper(left("vendor_name", 1)) || substr("vendor_name", 2)
WHERE left("vendor_name", 1) <> upper(left("vendor_name", 1));

UPDATE "hospitals" SET "display_name" = upper(left("display_name", 1)) || substr("display_name", 2)
WHERE left("display_name", 1) <> upper(left("display_name", 1));

UPDATE "hospitals" SET "hospital_name" = upper(left("hospital_name", 1)) || substr("hospital_name", 2)
WHERE left("hospital_name", 1) <> upper(left("hospital_name", 1));

UPDATE "item_categories" SET "category_name" = upper(left("category_name", 1)) || substr("category_name", 2)
WHERE left("category_name", 1) <> upper(left("category_name", 1));

UPDATE "kitchens" SET "kitchen_name" = upper(left("kitchen_name", 1)) || substr("kitchen_name", 2)
WHERE left("kitchen_name", 1) <> upper(left("kitchen_name", 1));

UPDATE "legal_entities" SET "entity_name" = upper(left("entity_name", 1)) || substr("entity_name", 2)
WHERE left("entity_name", 1) <> upper(left("entity_name", 1));

UPDATE "legal_entities" SET "location_name" = upper(left("location_name", 1)) || substr("location_name", 2)
WHERE left("location_name", 1) <> upper(left("location_name", 1));

UPDATE "locations" SET "location_name" = upper(left("location_name", 1)) || substr("location_name", 2)
WHERE left("location_name", 1) <> upper(left("location_name", 1));

UPDATE "payment_machines" SET "name" = upper(left("name", 1)) || substr("name", 2)
WHERE left("name", 1) <> upper(left("name", 1));

UPDATE "pos_devices" SET "name" = upper(left("name", 1)) || substr("name", 2)
WHERE left("name", 1) <> upper(left("name", 1));

UPDATE "restaurants" SET "bank_name" = upper(left("bank_name", 1)) || substr("bank_name", 2)
WHERE left("bank_name", 1) <> upper(left("bank_name", 1));

UPDATE "restaurants" SET "legal_name" = upper(left("legal_name", 1)) || substr("legal_name", 2)
WHERE left("legal_name", 1) <> upper(left("legal_name", 1));

UPDATE "restaurants" SET "qr_unit_name" = upper(left("qr_unit_name", 1)) || substr("qr_unit_name", 2)
WHERE left("qr_unit_name", 1) <> upper(left("qr_unit_name", 1));

UPDATE "restaurants" SET "restaurant_name" = upper(left("restaurant_name", 1)) || substr("restaurant_name", 2)
WHERE left("restaurant_name", 1) <> upper(left("restaurant_name", 1));

UPDATE "roles" SET "name" = upper(left("name", 1)) || substr("name", 2)
WHERE left("name", 1) <> upper(left("name", 1));

UPDATE "stores" SET "store_name" = upper(left("store_name", 1)) || substr("store_name", 2)
WHERE left("store_name", 1) <> upper(left("store_name", 1));

UPDATE "time_slots" SET "slot_name" = upper(left("slot_name", 1)) || substr("slot_name", 2)
WHERE left("slot_name", 1) <> upper(left("slot_name", 1));

UPDATE "users" SET "name" = upper(left("name", 1)) || substr("name", 2)
WHERE left("name", 1) <> upper(left("name", 1));
