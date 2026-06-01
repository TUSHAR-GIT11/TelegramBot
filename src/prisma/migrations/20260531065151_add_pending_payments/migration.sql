-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "isPaid" BOOLEAN NOT NULL DEFAULT true;
