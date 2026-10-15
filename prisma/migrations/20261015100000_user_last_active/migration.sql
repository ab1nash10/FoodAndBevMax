-- When the user was last signed in and active; locks admin credential changes for 8 hours.
ALTER TABLE "users" ADD COLUMN "last_active_at" TIMESTAMP(3);
