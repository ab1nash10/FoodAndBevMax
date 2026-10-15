-- On roll or outsourced, asked for when an employee is created. Nullable: employees recorded
-- before it was asked for stay "Not set" rather than being guessed.

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('ON_ROLL', 'OUTSOURCED');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "employment_type" "EmploymentType";
