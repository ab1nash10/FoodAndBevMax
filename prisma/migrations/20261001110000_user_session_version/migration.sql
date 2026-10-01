-- Session version per user. Existing tokens carry no version, which counts as 0, so nobody is
-- signed out by this migration.
ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;
