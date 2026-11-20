-- ERP GRNs move stock on arrival. Goods in go into the Main Store at once; a reverse takes what
-- the store holds and waits (PENDING) for the rest, running again by itself unless paused
-- (rerun_active), until it is done (VERIFIED) or a store admin closes it (CLOSED).
-- Each statement can run again safely if a deploy stops part way.

ALTER TYPE "GrnEntryStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

ALTER TABLE "grn_entries" ADD COLUMN IF NOT EXISTS "rerun_active" BOOLEAN NOT NULL DEFAULT true;

-- What moved and what was closed never exceed what was sent, even while still waiting.
ALTER TABLE "grn_entries" DROP CONSTRAINT IF EXISTS "grn_entries_quantities_check";
ALTER TABLE "grn_entries" ADD CONSTRAINT "grn_entries_quantities_check" CHECK (
  "sent_qty" > 0
  AND COALESCE("accepted_qty", 0) >= 0
  AND COALESCE("rejected_qty", 0) >= 0
  AND COALESCE("accepted_qty", 0) + COALESCE("rejected_qty", 0) <= "sent_qty"
  AND ("status" = 'PENDING' OR "accepted_qty" + "rejected_qty" = "sent_qty")
);
