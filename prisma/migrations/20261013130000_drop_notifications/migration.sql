-- Notifications were removed from the app; their table and every stored notification go too.

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_hospital_id_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- DropTable
DROP TABLE "notifications";

