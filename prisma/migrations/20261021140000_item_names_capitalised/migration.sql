-- Item names start with a capital (the API now saves them that way); existing ones are brought
-- in line. Only the first letter changes, the rest keeps its case, and normalized_name (which
-- ignores case) is unaffected, so uniqueness is untouched.
UPDATE "items"
SET "item_name" = upper(left("item_name", 1)) || substr("item_name", 2),
    "updated_at" = now()
WHERE left("item_name", 1) <> upper(left("item_name", 1));
