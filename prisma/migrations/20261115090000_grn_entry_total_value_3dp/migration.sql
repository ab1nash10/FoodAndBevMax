-- The ERP sends an item's total value with three decimals (e.g. 9.257): keep all three.
-- Widening only (no value changes); integer digits stay at 12.
ALTER TABLE "grn_entries" ALTER COLUMN "total_value" TYPE DECIMAL(15,3);
