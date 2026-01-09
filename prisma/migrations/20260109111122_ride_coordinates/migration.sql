/*
  Warnings:

  - You are about to drop the column `destination` on the `Ride` table. All the data in the column will be lost.
  - You are about to drop the column `origin` on the `Ride` table. All the data in the column will be lost.
  - Added the required column `destLat` to the `Ride` table without a default value. This is not possible if the table is not empty.
  - Added the required column `destLng` to the `Ride` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originLat` to the `Ride` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originLng` to the `Ride` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Ride" DROP COLUMN "destination",
DROP COLUMN "origin",
ADD COLUMN     "destLat" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "destLng" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "originLat" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "originLng" DOUBLE PRECISION NOT NULL;
