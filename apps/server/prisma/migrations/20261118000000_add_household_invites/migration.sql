-- Households H5b. Adds invite links and the "active household" column. See
-- docs/global/permissions/2026-10-04-households-design.md (*Invite and join*)
-- and docs/global/permissions/2026-11-18-households-plan-h5b.md (decisions
-- T14 and T26, task G.1).
--
-- This migration only ADDS. It creates one new, empty table and one nullable
-- column. No existing row is changed and none is read, so it needs no
-- backfill and no RAISE EXCEPTION guard.
--
-- "User"."activeHouseholdId" is nullable because "no household chosen" is a
-- real state: every person has it right after this migration, and a person
-- whose active household is deleted gets it again (ON DELETE SET NULL). The
-- server reads the column only while the person is still a member of that
-- household. Otherwise it uses the person's OLDEST membership (by "joinedAt",
-- then "householdId"). So NULL already means "the same household as before
-- this migration" for every person, and there is nothing to fill in.
--
-- "HouseholdInvite" foreign keys:
--   "householdId" ON DELETE CASCADE   the invites go with their household.
--   "createdById" ON DELETE RESTRICT  the same rule as the member tables:
--                                     production never deletes a "User" row,
--                                     so such a delete is a bug and fails
--                                     loudly. /e2e/cleanup deletes invites
--                                     first.
--   "usedById"    ON DELETE SET NULL  history only, so it may be lost.
--
-- "token" is 32 random bytes in base64url (decision T12). Its unique index is
-- what makes one token name one invite.
--
-- Every statement below names only "User", "Household" and the
-- "HouseholdRole" enum, which committed migrations 20261031000000_add_user
-- and 20261104000000_add_households created.
--
-- Generated with `prisma migrate diff --from-schema-datamodel <schema at the
-- commit before> --to-schema-datamodel prisma/schema.prisma --script`, which
-- needs no database, then commented by hand.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activeHouseholdId" TEXT;

-- CreateTable
CREATE TABLE "HouseholdInvite" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "householdRole" "HouseholdRole" NOT NULL,
    "locationRoles" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "HouseholdInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdInvite_token_key" ON "HouseholdInvite"("token");

-- CreateIndex
CREATE INDEX "HouseholdInvite_householdId_idx" ON "HouseholdInvite"("householdId");

-- CreateIndex
CREATE INDEX "User_activeHouseholdId_idx" ON "User"("activeHouseholdId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeHouseholdId_fkey" FOREIGN KEY ("activeHouseholdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdInvite" ADD CONSTRAINT "HouseholdInvite_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdInvite" ADD CONSTRAINT "HouseholdInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdInvite" ADD CONSTRAINT "HouseholdInvite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

