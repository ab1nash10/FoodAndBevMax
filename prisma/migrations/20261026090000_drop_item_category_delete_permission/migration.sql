-- Item categories are only switched off (ITEM_CATEGORY_UPDATE), never deleted: the DELETE route is
-- gone, so its permission ("Disable item categories") guards nothing. Remove it with the roles and
-- user overrides that hold it (both reference it ON DELETE RESTRICT, so they go first).
-- One transaction: Prisma does not wrap a migration, and a half-run one blocks every later deploy.
BEGIN;

DELETE FROM "role_permissions"
WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "code" = 'ITEM_CATEGORY_DELETE');

DELETE FROM "user_permissions"
WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "code" = 'ITEM_CATEGORY_DELETE');

DELETE FROM "permissions" WHERE "code" = 'ITEM_CATEGORY_DELETE';

COMMIT;
