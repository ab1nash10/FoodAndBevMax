-- When each user last signed in, shown on the Admins and Operators screens.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);

-- Filled once from the sign-ins already logged; auth-service stamps every sign-in from now on.
UPDATE "users" AS u
SET "last_login_at" = s."last_login"
FROM (
  SELECT "user_id", MAX("created_at") AS "last_login"
  FROM "audit_logs"
  WHERE "action" = 'LOGIN_SUCCESS' AND "user_id" IS NOT NULL
  GROUP BY "user_id"
) AS s
WHERE s."user_id" = u."id" AND u."last_login_at" IS NULL;
