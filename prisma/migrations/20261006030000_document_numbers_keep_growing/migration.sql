-- Transfer, kitchen production and GRN numbers were the sequence value padded with lpad, which
-- also cuts longer text: the 10,000th transfer got TRF1000, a number transfer 1,000 already had,
-- so from then on every create failed on the unique index (GRNs after the 999,999th). Numbers keep
-- their padding (TRF0042, GRN000123) and then simply grow (TRF10000); existing rows are unchanged.
-- nextval is called once: pad to 20 digits (more than a bigint has), then drop the extra zeros.

ALTER TABLE "transfers" ALTER COLUMN "transfer_number" SET DEFAULT 'TRF' || regexp_replace(lpad((nextval('transfer_number_seq'::regclass))::text, 20, '0'::text), '^0{0,16}'::text, ''::text);

ALTER TABLE "kitchen_productions" ALTER COLUMN "production_number" SET DEFAULT 'PRD' || regexp_replace(lpad((nextval('kitchen_production_number_seq'::regclass))::text, 20, '0'::text), '^0{0,16}'::text, ''::text);

ALTER TABLE "grns" ALTER COLUMN "grn_number" SET DEFAULT 'GRN' || regexp_replace(lpad((nextval('grn_number_seq'::regclass))::text, 20, '0'::text), '^0{0,14}'::text, ''::text);
