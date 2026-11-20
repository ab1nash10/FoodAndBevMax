-- The POS Cashier role is now named Restaurant/POS Operator (the user's wording, 2026-11-20).
-- Users keep the same role (same id), so their permissions and locations are unchanged.
UPDATE "roles" SET "name" = 'Restaurant/POS Operator', "updated_at" = now()
WHERE "name" = 'POS Cashier'
  AND NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'Restaurant/POS Operator');
