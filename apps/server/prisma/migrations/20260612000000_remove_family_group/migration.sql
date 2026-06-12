-- Remove the alpha global "family group" sharing feature entirely.
-- Drops the FamilyGroup table and the unused `familyId` column (always NULL —
-- never populated by any resolver) plus its indexes from every model.
-- Per-location membership will be the cloud sharing model going forward.

-- DropIndex (familyId-keyed indexes)
DROP INDEX IF EXISTS "TagType_familyId_name_idx";
DROP INDEX IF EXISTS "Tag_familyId_typeId_idx";
DROP INDEX IF EXISTS "Vendor_familyId_name_idx";
DROP INDEX IF EXISTS "Item_familyId_updatedAt_idx";
DROP INDEX IF EXISTS "Item_familyId_name_idx";
DROP INDEX IF EXISTS "Recipe_familyId_name_idx";
DROP INDEX IF EXISTS "Shelf_familyId_order_idx";

-- DropColumn (familyId)
ALTER TABLE "TagType" DROP COLUMN IF EXISTS "familyId";
ALTER TABLE "Tag" DROP COLUMN IF EXISTS "familyId";
ALTER TABLE "Vendor" DROP COLUMN IF EXISTS "familyId";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "familyId";
ALTER TABLE "Recipe" DROP COLUMN IF EXISTS "familyId";
ALTER TABLE "Cart" DROP COLUMN IF EXISTS "familyId";
ALTER TABLE "Shelf" DROP COLUMN IF EXISTS "familyId";

-- CreateIndex (replace the dropped familyId-keyed Item indexes with userId-keyed ones)
CREATE INDEX "Item_userId_updatedAt_idx" ON "Item"("userId", "updatedAt");
CREATE INDEX "Item_userId_name_idx" ON "Item"("userId", "name");

-- DropTable (FamilyGroup — its indexes drop automatically with the table)
DROP TABLE IF EXISTS "FamilyGroup";
