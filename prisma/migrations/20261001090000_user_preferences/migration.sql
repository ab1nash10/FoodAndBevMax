-- Per-user portal preferences. Nullable, so existing users keep every default.
ALTER TABLE "users" ADD COLUMN "preferences" JSONB;
