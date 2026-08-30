-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemStock" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "targetQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refillThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "packedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unpackedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_userId_order_idx" ON "Location"("userId", "order");

-- CreateIndex
CREATE INDEX "ItemStock_locationId_idx" ON "ItemStock"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemStock_itemId_locationId_key" ON "ItemStock"("itemId", "locationId");

-- AddForeignKey
ALTER TABLE "ItemStock" ADD CONSTRAINT "ItemStock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemStock" ADD CONSTRAINT "ItemStock_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one default Location per user, enforced by the database rather than
-- by application code. Prisma has no syntax for a partial index, so this is
-- hand-written; it is what makes the lazy ensureDefaultLocation race-safe
-- (a concurrent second insert gets P2002 instead of a duplicate default).
--
-- Named deliberately OUTSIDE Prisma's generator namespace. The obvious name,
-- "Location_userId_isDefault_key", is byte-for-byte what Prisma would emit for
-- a future @@unique([userId, isDefault]) on Location — a plausible mistake,
-- since that constraint LOOKS like the right way to express this invariant
-- (it is not: it would permit two isDefault=false rows and one isDefault=true
-- per user, which is a different, weaker rule). Sharing the name would make
-- the generated CREATE UNIQUE INDEX collide with this one.
CREATE UNIQUE INDEX "Location_one_default_per_user_key"
  ON "Location" ("userId") WHERE "isDefault";

-- Backfill 1: one default Location per user.
-- Unioned across ALL nine user-scoped tables, not just Item — a user with only
-- tags and no items still needs a location. UNION (not UNION ALL) dedupes.
INSERT INTO "Location" ("id", "name", "order", "isDefault", "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'My Home', 0, true, u."userId", NOW(), NOW()
FROM (
      SELECT "userId" FROM "Item"
      UNION SELECT "userId" FROM "TagType"
      UNION SELECT "userId" FROM "Tag"
      UNION SELECT "userId" FROM "Vendor"
      UNION SELECT "userId" FROM "Recipe"
      UNION SELECT "userId" FROM "Cart"
      UNION SELECT "userId" FROM "CartItem"
      UNION SELECT "userId" FROM "InventoryLog"
      UNION SELECT "userId" FROM "Shelf"
) u;

-- Backfill 2: one ItemStock per Item, under its owner's default location,
-- carrying the five state fields across. Item keeps its columns (dropped in
-- PR 5), so this duplicates rather than moves — deliberately, so a browser
-- running an older bundle keeps working.
INSERT INTO "ItemStock" ("id", "itemId", "locationId", "targetQuantity", "refillThreshold", "packedQuantity", "unpackedQuantity", "dueDate", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       i."id",
       l."id",
       i."targetQuantity",
       i."refillThreshold",
       i."packedQuantity",
       i."unpackedQuantity",
       i."dueDate",
       i."createdAt",
       i."updatedAt"
FROM "Item" i
JOIN "Location" l ON l."userId" = i."userId" AND l."isDefault";
