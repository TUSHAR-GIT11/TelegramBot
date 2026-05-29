/*
  Warnings:

  - You are about to drop the column `customerName` on the `Bill` table. All the data in the column will be lost.
  - You are about to drop the column `discount` on the `Bill` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Bill" DROP COLUMN "customerName",
DROP COLUMN "discount";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "soldCount" INTEGER NOT NULL DEFAULT 0;
