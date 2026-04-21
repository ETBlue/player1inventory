-- CreateTable
CREATE TABLE "Shelf" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "filterConfig" JSONB,
    "itemIds" TEXT[],
    "userId" TEXT NOT NULL,
    "familyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shelf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shelf_userId_order_idx" ON "Shelf"("userId", "order");

-- CreateIndex
CREATE INDEX "Shelf_familyId_order_idx" ON "Shelf"("familyId", "order");
