-- CreateEnum
CREATE TYPE "OnlinePaymentOption" AS ENUM ('NONE', 'PAYU', 'RAZORPAY');

-- AlterTable
ALTER TABLE "hospitals" ADD COLUMN     "area" TEXT,
ADD COLUMN     "display_name" TEXT,
ADD COLUMN     "ip_address" TEXT,
ADD COLUMN     "latitude" TEXT,
ADD COLUMN     "longitude" TEXT,
ADD COLUMN     "online_payment_option" "OnlinePaymentOption" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "visiting_card_address" TEXT;
