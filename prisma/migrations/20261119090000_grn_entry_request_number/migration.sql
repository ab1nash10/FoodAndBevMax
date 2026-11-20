-- The transaction number is now AAHAR's number for the request (one POST /erp/grns), given in
-- its response and kept on every row of that request: no longer unique per row. Rows that came
-- before keep the numbers they have.
DROP INDEX IF EXISTS "grn_entries_transaction_number_key";
CREATE INDEX IF NOT EXISTS "grn_entries_transaction_number_idx" ON "grn_entries"("transaction_number");
