-- Households H3a, the first of two migrations. Puts every cloud row into a
-- household and gives every person their roles. Each person still has exactly
-- one household, so nothing is shared yet. See
-- docs/global/permissions/2026-10-04-households-design.md and
-- docs/global/permissions/2026-11-04-households-plan-h3a.md (task 3.3).
--
-- Three decisions shape this file:
--
-- H16 — two migrations, not one. This one ADDS: the new tables and a NULLABLE
--   "householdId" on "Location" and the six catalog models ("Item", "Tag",
--   "TagType", "Vendor", "Recipe", "Shelf"), filled in below. "userId",
--   "order" and "isDefault" all stay. The second migration, drop_user_scope
--   (task 3.14), sets "householdId" NOT NULL and drops "userId" and
--   "isDefault". Dropping "userId" here would break the compile of every
--   resolver at once. Between the two migrations the code writes both columns.
--   Both deploy together, so production never sees the middle state.
--
-- H2 — EVERY "User" row gets a household, not only users who have data. Since
--   households H2 a person can have a "User" row and no data at all (they signed
--   in once and saved nothing). Without a household they would land on an empty
--   "no household" screen. The other way round, a "userId" found in the data
--   with no "User" row (a person who has not made a request since H2 deployed)
--   first gets a "User" row named 'User'.
--
-- H1 — "User"."householdSetupAt" is the first sign-in claim. First sign-in runs
--   UPDATE "User" SET "householdSetupAt" = now()
--   WHERE id = $1 AND "householdSetupAt" IS NULL
--   as the first statement of its transaction. A second, concurrent request
--   waits for the first transaction's row lock, then re-checks the WHERE and
--   matches 0 rows, so only one household is ever created. The "User" primary
--   key cannot do this job any more: the webhook and ensureUser (H2) create the
--   row before first sign-in runs. This migration sets the column for every
--   user it gives a household, so first sign-in will not make a second one.
--
-- The household name is written in English, '<displayName>''s Household'
-- (decision H3). SQL cannot translate it. First sign-in translates the name for
-- new users, and the owner can rename it (decision H4).
--
-- The role values below carry an explicit cast, such as 'owner'::"HouseholdRole".
-- Postgres has no automatic cast from text to an enum, so the cast removes any
-- doubt about how a literal in an INSERT ... SELECT is typed.
--
-- Ids: Prisma's @default(cuid()) is applied by the Prisma client, not by the
-- database, so every INSERT below gives an explicit id. gen_random_uuid()::text
-- is what 20260830000000_add_location_and_item_stock used. Every id column here
-- is TEXT and nothing parses an id's shape, so a uuid is a valid id.
--
-- Postgres runs this whole file in one transaction. If the guard in step 8
-- raises, nothing in this file is applied.

-- ── Step 1: the enums, the three tables, User.householdSetupAt ──

-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('owner', 'manager', 'member');

-- CreateEnum
CREATE TYPE "LocationRole" AS ENUM ('organizer', 'participant', 'viewer');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "householdSetupAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT,
    "ownerGoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("householdId","userId")
);

-- CreateTable
CREATE TABLE "LocationMember" (
    "locationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "LocationRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationMember_pkey" PRIMARY KEY ("locationId","userId")
);

-- At most one owner row per household (decision H15). The HouseholdMember row
-- is the source of truth for rights; "Household"."ownerId" only mirrors it.
-- This index makes two owners impossible. Prisma has no syntax for a partial
-- index, so it is written by hand, the same way as
-- "Location_one_default_per_user_key" in 20260830000000.
--
-- Named by hand, outside Prisma's generated names. Prisma would name a
-- @@unique([householdId, role]) "HouseholdMember_householdId_role_key". That
-- constraint looks similar but is a different, wrong rule: it would also allow
-- only one manager and one member per household.
--
-- Created BEFORE the backfill on purpose, so the backfill below is checked by
-- it as it runs.
CREATE UNIQUE INDEX "HouseholdMember_one_owner_key"
  ON "HouseholdMember" ("householdId") WHERE "role" = 'owner';

-- ── Step 2: a "User" row for every userId in the data that has none ──
--
-- All ten tables that carry a "userId" are read, not only the seven that move
-- to a household. "Cart", "CartItem" and "InventoryLog" keep their "userId"
-- (it now means the author), and the person they name still needs a household
-- to reach that data. UNION (not UNION ALL) removes duplicates.
INSERT INTO "User" ("id", "displayName", "createdAt", "updatedAt")
SELECT u."userId", 'User', NOW(), NOW()
FROM (
      SELECT "userId" FROM "Location"
      UNION SELECT "userId" FROM "Item"
      UNION SELECT "userId" FROM "TagType"
      UNION SELECT "userId" FROM "Tag"
      UNION SELECT "userId" FROM "Vendor"
      UNION SELECT "userId" FROM "Recipe"
      UNION SELECT "userId" FROM "Shelf"
      UNION SELECT "userId" FROM "Cart"
      UNION SELECT "userId" FROM "CartItem"
      UNION SELECT "userId" FROM "InventoryLog"
) u
WHERE NOT EXISTS (SELECT 1 FROM "User" x WHERE x."id" = u."userId");

-- ── Step 3: one household per "User" row, and its owner row ──
--
-- Every "User" row, including one with "deletedAt" set. A deleted person's
-- data still exists, and H6 hands such a household over; it must have one.
-- "Household" is empty before this statement, so "ownerId" is unique here and
-- the next statement can use it to find each new household.
INSERT INTO "Household" ("id", "name", "ownerId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."displayName" || '''s Household', u."id", NOW(), NOW()
FROM "User" u;

INSERT INTO "HouseholdMember" ("householdId", "userId", "role", "joinedAt")
SELECT h."id", h."ownerId", 'owner'::"HouseholdRole", NOW()
FROM "Household" h;

-- ── Step 4: a 'Home' location for every user with none ──
--
-- These are the users decision H2 is about. 'Home', not 'My Home': that is the
-- name a new cloud account's first location gets from H3a on.
-- "isDefault" is still a column until drop_user_scope (task 3.14), and today's
-- code reads it, so the new row is the default. It is the user's only
-- location, so "Location_one_default_per_user_key" cannot reject it.
INSERT INTO "Location" ("id", "name", "order", "isDefault", "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'Home', 0, true, u."id", NOW(), NOW()
FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "Location" l WHERE l."userId" = u."id");

-- ── Step 5: "householdId" on the seven tables, nullable, then filled in ──
--
-- Nullable in this migration (decision H16). The guard in step 8 proves that
-- no row was missed. drop_user_scope then sets NOT NULL.
--
-- Each row goes into the household its "userId" owns. Each user owns exactly
-- one household at this point (step 3), so the join matches one row.

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "householdId" TEXT;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "householdId" TEXT;

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "householdId" TEXT;

-- AlterTable
ALTER TABLE "TagType" ADD COLUMN     "householdId" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "householdId" TEXT;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "householdId" TEXT;

-- AlterTable
ALTER TABLE "Shelf" ADD COLUMN     "householdId" TEXT;

UPDATE "Location" t SET "householdId" = h."id" FROM "Household" h WHERE h."ownerId" = t."userId";
UPDATE "Item"     t SET "householdId" = h."id" FROM "Household" h WHERE h."ownerId" = t."userId";
UPDATE "Tag"      t SET "householdId" = h."id" FROM "Household" h WHERE h."ownerId" = t."userId";
UPDATE "TagType"  t SET "householdId" = h."id" FROM "Household" h WHERE h."ownerId" = t."userId";
UPDATE "Vendor"   t SET "householdId" = h."id" FROM "Household" h WHERE h."ownerId" = t."userId";
UPDATE "Recipe"   t SET "householdId" = h."id" FROM "Household" h WHERE h."ownerId" = t."userId";
UPDATE "Shelf"    t SET "householdId" = h."id" FROM "Household" h WHERE h."ownerId" = t."userId";

-- ── Step 6: the owner of each location is its organizer ──
--
-- Every location, including the 'Home' rows from step 4. The location's
-- "userId" is the person who owns it today.
INSERT INTO "LocationMember" ("locationId", "userId", "role", "createdAt")
SELECT l."id", l."userId", 'organizer'::"LocationRole", NOW()
FROM "Location" l;

-- ── Step 7: mark every user who now has a household as set up ──
--
-- Without this, first sign-in (decision H1) would claim these users again and
-- create a second household for each of them.
UPDATE "User" u SET "householdSetupAt" = NOW()
WHERE EXISTS (SELECT 1 FROM "HouseholdMember" m WHERE m."userId" = u."id");

-- ── Step 8: the guard ──
--
-- What it protects against. The old server keeps serving while this migration
-- runs. Each statement above reads the rows committed when it starts, so a row
-- written by a new person between step 2 and step 5 has no "User" row and no
-- household. It would keep a null "householdId", and drop_user_scope would then
-- fail on SET NOT NULL with Postgres error 23502, which names no row. This guard
-- fails here instead and names the rows and their "userId".
--
-- It also checks the two other facts the code from H3a relies on: every user
-- owns a household, and every location has its owner as organizer.
-- Each list shows at most 20 entries, plus the total count.
DO $$
DECLARE
  bad_count INTEGER;
  bad_list  TEXT;
BEGIN
  -- 1. A row in the seven tables with no household.
  WITH missing AS (
    SELECT 'Location' AS tbl, "id", "userId" FROM "Location" WHERE "householdId" IS NULL
    UNION ALL SELECT 'Item',    "id", "userId" FROM "Item"    WHERE "householdId" IS NULL
    UNION ALL SELECT 'Tag',     "id", "userId" FROM "Tag"     WHERE "householdId" IS NULL
    UNION ALL SELECT 'TagType', "id", "userId" FROM "TagType" WHERE "householdId" IS NULL
    UNION ALL SELECT 'Vendor',  "id", "userId" FROM "Vendor"  WHERE "householdId" IS NULL
    UNION ALL SELECT 'Recipe',  "id", "userId" FROM "Recipe"  WHERE "householdId" IS NULL
    UNION ALL SELECT 'Shelf',   "id", "userId" FROM "Shelf"   WHERE "householdId" IS NULL
  )
  SELECT (SELECT count(*) FROM missing),
         (SELECT string_agg(tbl || ' ' || "id" || ' (userId ' || "userId" || ')', ', ')
            FROM (SELECT * FROM missing ORDER BY tbl, "id" LIMIT 20) first20)
    INTO bad_count, bad_list;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'add_households: % row(s) have no household. Most likely a new person wrote data while this migration ran. Re-run the deploy. First 20: %', bad_count, bad_list;
  END IF;

  -- 2. A user who owns no household.
  SELECT count(*), string_agg("id", ', ')
    INTO bad_count, bad_list
    FROM (
      SELECT u."id" FROM "User" u
      WHERE NOT EXISTS (
        SELECT 1 FROM "HouseholdMember" m WHERE m."userId" = u."id" AND m."role" = 'owner'
      )
      ORDER BY u."id"
    ) noowner;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'add_households: % user(s) own no household: %', bad_count, left(bad_list, 2000);
  END IF;

  -- 3. A location whose owner is not its organizer.
  SELECT count(*), string_agg("id" || ' (userId ' || "userId" || ')', ', ')
    INTO bad_count, bad_list
    FROM (
      SELECT l."id", l."userId" FROM "Location" l
      WHERE NOT EXISTS (
        SELECT 1 FROM "LocationMember" m
        WHERE m."locationId" = l."id" AND m."userId" = l."userId" AND m."role" = 'organizer'
      )
      ORDER BY l."id"
    ) noorganizer;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'add_households: % location(s) have no organizer: %', bad_count, left(bad_list, 2000);
  END IF;
END $$;

-- ── Step 9: indexes and foreign keys, last ──
--
-- Built once, over the final data.

-- CreateIndex
CREATE INDEX "HouseholdMember_userId_idx" ON "HouseholdMember"("userId");

-- CreateIndex
CREATE INDEX "LocationMember_userId_idx" ON "LocationMember"("userId");

-- One "householdId" index beside each "userId" index, with the same second
-- column. The "userId" indexes stay until drop_user_scope.

-- CreateIndex
CREATE INDEX "Location_householdId_order_idx" ON "Location"("householdId", "order");

-- CreateIndex
CREATE INDEX "Item_householdId_updatedAt_idx" ON "Item"("householdId", "updatedAt");

-- CreateIndex
CREATE INDEX "Item_householdId_name_idx" ON "Item"("householdId", "name");

-- CreateIndex
CREATE INDEX "Tag_householdId_typeId_idx" ON "Tag"("householdId", "typeId");

-- CreateIndex
CREATE INDEX "TagType_householdId_name_idx" ON "TagType"("householdId", "name");

-- CreateIndex
CREATE INDEX "Vendor_householdId_name_idx" ON "Vendor"("householdId", "name");

-- CreateIndex
CREATE INDEX "Recipe_householdId_name_idx" ON "Recipe"("householdId", "name");

-- CreateIndex
CREATE INDEX "Shelf_householdId_order_idx" ON "Shelf"("householdId", "order");

-- The "Tag" foreign key is added BEFORE the "TagType" one, on purpose.
-- "Tag_typeId_fkey" (from the init migration) is ON DELETE RESTRICT. When a
-- household is deleted, Postgres runs the cascades of these foreign keys one
-- after another, in the order the constraints were created. If "TagType" went
-- first, its rows would be deleted while "Tag" rows still point at them, and
-- the RESTRICT check would fail the whole delete. verify-migration.ts deletes a
-- household that has a tag type and a tag, to prove this against real SQL.

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagType" ADD CONSTRAINT "TagType_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shelf" ADD CONSTRAINT "Shelf_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationMember" ADD CONSTRAINT "LocationMember_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationMember" ADD CONSTRAINT "LocationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
