-- Households H6a. Adds the household activity log. See
-- docs/global/permissions/2026-10-04-households-design.md (*Activity log*)
-- and docs/global/permissions/2026-11-20-households-plan-h6.md (decisions
-- T46, T47, T48 and T51, task J.1).
--
-- This migration only ADDS. It creates one enum and one new, empty table. No
-- existing row is changed and none is read, so it needs no backfill and no
-- RAISE EXCEPTION guard.
--
-- The enum holds the H6b values too (the OWNERSHIP_* values, HANDOVER_STARTED
-- and ACCOUNT_DELETED). So H6b needs no ALTER TYPE ... ADD VALUE, and a new
-- value is never used in the same transaction that adds it.
--
-- "HouseholdActivity" foreign keys:
--   "householdId" ON DELETE CASCADE   the log goes with its household. This
--                                     is the ONLY foreign key.
--
-- Three id columns have NO foreign key, on purpose (decision T46):
--   "actorId"       a log must outlive the person it names. A foreign key to
--   "targetUserId"  "User" would also block /e2e/cleanup, which deletes "User"
--                   rows, whenever a log row in ANOTHER household names the
--                   person. Production never deletes a "User" row (H2 sets
--                   "deletedAt"), so the id always still finds the name.
--   "locationId"    a log must outlive the location it names. CASCADE would
--                   delete the row with the location, SET NULL would lose
--                   which location it was, and RESTRICT would block the
--                   delete. The location's name is stored in "details" when
--                   the row is written, so the log can still name it.
--
-- "targetUserId", "locationId" and "details" are nullable because not every
-- action has a person, a location or extra facts: "HOUSEHOLD_CLEARED" has
-- none of the three.
--
-- The index serves the Activity page, which reads one household newest first
-- with "id" to break a tie (decision T54), and the ON DELETE CASCADE.
--
-- Every statement below names only "Household", which committed migration
-- 20261104000000_add_households created.
--
-- Written by hand in the shape `prisma migrate diff` prints.

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('LOCATION_ROLE_SET', 'LOCATION_ROLE_REMOVED', 'LOCATION_LEFT', 'HOUSEHOLD_ROLE_CHANGED', 'INVITE_CREATED', 'INVITE_REVOKED', 'MEMBER_JOINED', 'MEMBER_LEFT', 'MEMBER_REMOVED', 'HOUSEHOLD_CLEARED', 'LOCATIONS_DELETED', 'LOCATION_ITEMS_REMOVED', 'IMPORT', 'OWNERSHIP_OFFERED', 'OWNERSHIP_OFFER_CANCELLED', 'OWNERSHIP_DECLINED', 'OWNERSHIP_ACCEPTED', 'HANDOVER_STARTED', 'ACCOUNT_DELETED');

-- CreateTable
CREATE TABLE "HouseholdActivity" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "targetUserId" TEXT,
    "locationId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HouseholdActivity_householdId_createdAt_id_idx" ON "HouseholdActivity"("householdId", "createdAt" DESC, "id");

-- AddForeignKey
ALTER TABLE "HouseholdActivity" ADD CONSTRAINT "HouseholdActivity_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
