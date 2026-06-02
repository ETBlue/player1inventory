-- AlterTable
ALTER TABLE "InventoryLog" ADD COLUMN     "logKey" TEXT,
ADD COLUMN     "logParams" JSONB;
