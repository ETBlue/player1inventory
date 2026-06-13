-- DropIndex
DROP INDEX "Cart_userId_status_idx";

-- AlterTable
ALTER TABLE "Cart" DROP COLUMN "completedAt",
DROP COLUMN "createdAt",
DROP COLUMN "status",
DROP COLUMN "updatedAt",
DROP COLUMN IF EXISTS "vendorId",
ADD COLUMN "lastPurchasedAt" TIMESTAMP(3);

-- DropEnum
DROP TYPE "CartStatus";

-- CreateIndex
CREATE INDEX "Cart_userId_idx" ON "Cart"("userId");
