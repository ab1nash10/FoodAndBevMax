-- Additive only: who/where/why context on audit rows, and indexes for the audit read API
-- (newest first per hospital, entity, action and user). Existing rows keep NULLs; nothing is
-- backfilled. IF NOT EXISTS lets a half-applied run (migrations are not transactional here)
-- be resolved and re-run without editing this file.

ALTER TABLE "audit_logs"
  ADD COLUMN IF NOT EXISTS "actor_role" TEXT,
  ADD COLUMN IF NOT EXISTS "location_id" TEXT,
  ADD COLUMN IF NOT EXISTS "request_id" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "summary" TEXT;

CREATE INDEX IF NOT EXISTS "audit_logs_hospital_id_created_at_idx" ON "audit_logs"("hospital_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_entity_name_created_at_idx" ON "audit_logs"("entity_name", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at" DESC);
