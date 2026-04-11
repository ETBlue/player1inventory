-- CreateEnum
CREATE TYPE "TargetUnit" AS ENUM ('package', 'measurement');

-- CreateEnum
CREATE TYPE "ExpirationMode" AS ENUM ('disabled', 'date', 'days_from_purchase');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('active', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "TagColor" AS ENUM ('red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'gray');

-- CreateTable
CREATE TABLE "TagType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" "TagColor" NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT,

    CONSTRAINT "TagType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT,
    "parentId" TEXT,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "packageUnit" TEXT,
    "measurementUnit" TEXT,
    "amountPerPackage" DOUBLE PRECISION,
    "targetUnit" "TargetUnit" NOT NULL,
    "targetQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refillThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "packedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unpackedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumeAmount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "dueDate" TIMESTAMP(3),
    "estimatedDueDays" INTEGER,
    "expirationThreshold" INTEGER,
    "expirationMode" "ExpirationMode" NOT NULL DEFAULT 'disabled',
    "userId" TEXT NOT NULL,
    "familyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemTag" (
    "itemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ItemTag_pkey" PRIMARY KEY ("itemId","tagId")
);

-- CreateTable
CREATE TABLE "ItemVendor" (
    "itemId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,

    CONSTRAINT "ItemVendor_pkey" PRIMARY KEY ("itemId","vendorId")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastCookedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "familyId" TEXT,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeItem" (
    "recipeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "defaultAmount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RecipeItem_pkey" PRIMARY KEY ("recipeId","itemId")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "status" "CartStatus" NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLog" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "InventoryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "memberUserIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TagType_userId_name_idx" ON "TagType"("userId", "name");

-- CreateIndex
CREATE INDEX "TagType_familyId_name_idx" ON "TagType"("familyId", "name");

-- CreateIndex
CREATE INDEX "Tag_userId_typeId_idx" ON "Tag"("userId", "typeId");

-- CreateIndex
CREATE INDEX "Tag_familyId_typeId_idx" ON "Tag"("familyId", "typeId");

-- CreateIndex
CREATE INDEX "Vendor_userId_name_idx" ON "Vendor"("userId", "name");

-- CreateIndex
CREATE INDEX "Vendor_familyId_name_idx" ON "Vendor"("familyId", "name");

-- CreateIndex
CREATE INDEX "Item_familyId_updatedAt_idx" ON "Item"("familyId", "updatedAt");

-- CreateIndex
CREATE INDEX "Item_familyId_name_idx" ON "Item"("familyId", "name");

-- CreateIndex
CREATE INDEX "Recipe_userId_name_idx" ON "Recipe"("userId", "name");

-- CreateIndex
CREATE INDEX "Recipe_familyId_name_idx" ON "Recipe"("familyId", "name");

-- CreateIndex
CREATE INDEX "Cart_userId_status_idx" ON "Cart"("userId", "status");

-- CreateIndex
CREATE INDEX "CartItem_cartId_idx" ON "CartItem"("cartId");

-- CreateIndex
CREATE INDEX "CartItem_itemId_idx" ON "CartItem"("itemId");

-- CreateIndex
CREATE INDEX "InventoryLog_itemId_occurredAt_idx" ON "InventoryLog"("itemId", "occurredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "FamilyGroup_code_key" ON "FamilyGroup"("code");

-- CreateIndex
CREATE INDEX "FamilyGroup_code_idx" ON "FamilyGroup"("code");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TagType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTag" ADD CONSTRAINT "ItemTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTag" ADD CONSTRAINT "ItemTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVendor" ADD CONSTRAINT "ItemVendor_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVendor" ADD CONSTRAINT "ItemVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
