-- Pagination counts on the transfer, GRN and stock ledger lists filter by hospital (and status or
-- location, or item) and skip soft-deleted rows; these let Postgres count from the index alone.

-- CreateIndex
CREATE INDEX "grns_hospital_id_status_deleted_at_idx" ON "grns"("hospital_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "stock_ledgers_hospital_location_deleted_at_idx" ON "stock_ledgers"("hospital_id", "location_type", "location_id", "deleted_at");

-- CreateIndex
CREATE INDEX "stock_ledgers_item_id_deleted_at_idx" ON "stock_ledgers"("item_id", "deleted_at");

-- CreateIndex
CREATE INDEX "transfers_hospital_id_status_deleted_at_idx" ON "transfers"("hospital_id", "status", "deleted_at");
