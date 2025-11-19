/*
  Warnings:

  - Changed the type of `documentType` on the `Verification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."DocumentType" AS ENUM ('ID_CARD', 'DRIVER_LICENSE', 'INSURANCE');

-- AlterTable
ALTER TABLE "public"."Verification" DROP COLUMN "documentType",
ADD COLUMN     "documentType" "public"."DocumentType" NOT NULL;
