CREATE SEQUENCE IF NOT EXISTS item_code_sequence;

DO $$
DECLARE
  highest_item_code INTEGER;
BEGIN
  SELECT MAX(SUBSTRING(item_code FROM 4)::INTEGER)
  INTO highest_item_code
  FROM items
  WHERE item_code ~ '^ITM[0-9]+$';

  IF highest_item_code IS NULL THEN
    PERFORM setval('item_code_sequence', 1, false);
  ELSE
    PERFORM setval('item_code_sequence', highest_item_code, true);
  END IF;
END $$;
