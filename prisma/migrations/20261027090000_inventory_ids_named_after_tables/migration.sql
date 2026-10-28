-- Each inventory table's id column is named after its table (grns.grn_id, transfer_lines.transfer_line_id…),
-- so a link and the id it points to read the same: grn_lines.grn_id = grns.grn_id. The two links that did
-- not follow that pattern are renamed with their index and foreign key. Renames only: no data moves, and
-- Postgres keeps every foreign key pointing at the renamed columns.
BEGIN;

ALTER TABLE "grns" RENAME COLUMN "id" TO "grn_id";
ALTER TABLE "grn_lines" RENAME COLUMN "id" TO "grn_line_id";
ALTER TABLE "grn_batches" RENAME COLUMN "id" TO "grn_batch_id";
ALTER TABLE "kitchen_productions" RENAME COLUMN "id" TO "kitchen_production_id";
ALTER TABLE "kitchen_production_lines" RENAME COLUMN "id" TO "kitchen_production_line_id";
ALTER TABLE "transfers" RENAME COLUMN "id" TO "transfer_id";
ALTER TABLE "transfer_lines" RENAME COLUMN "id" TO "transfer_line_id";
ALTER TABLE "transfer_acknowledgements" RENAME COLUMN "id" TO "transfer_acknowledgement_id";
ALTER TABLE "transfer_acknowledgement_lines" RENAME COLUMN "id" TO "transfer_acknowledgement_line_id";
ALTER TABLE "stock_ledgers" RENAME COLUMN "id" TO "stock_ledger_id";
ALTER TABLE "stock_balances" RENAME COLUMN "id" TO "stock_balance_id";

ALTER TABLE "kitchen_production_lines" RENAME COLUMN "production_id" TO "kitchen_production_id";
ALTER INDEX "kitchen_production_lines_production_id_idx" RENAME TO "kitchen_production_lines_kitchen_production_id_idx";
ALTER TABLE "kitchen_production_lines" RENAME CONSTRAINT "kitchen_production_lines_production_id_fkey" TO "kitchen_production_lines_kitchen_production_id_fkey";

ALTER TABLE "transfer_acknowledgement_lines" RENAME COLUMN "acknowledgement_id" TO "transfer_acknowledgement_id";
ALTER INDEX "transfer_acknowledgement_lines_acknowledgement_id_idx" RENAME TO "transfer_acknowledgement_lines_transfer_acknowledgement_id_idx";
ALTER TABLE "transfer_acknowledgement_lines" RENAME CONSTRAINT "transfer_acknowledgement_lines_acknowledgement_id_fkey" TO "transfer_acknowledgement_lines_transfer_acknowledgement_id_fkey";

COMMIT;
