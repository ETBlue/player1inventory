-- Households H6b. Adds the ownership offers: an owner offers the household to
-- one member (a transfer), or the household is offered to the members when
-- the owner's account is deleted (a hand-over). See
-- docs/global/permissions/2026-10-04-households-design.md and
-- docs/global/permissions/2026-11-20-households-plan-h6.md (decision T58,
-- task K.1).
--
-- This migration only ADDS. It creates one enum and one new, empty table. No
-- existing row is changed and none is read, so it needs no backfill and no
-- RAISE EXCEPTION guard.
--
-- "OwnershipOffer" foreign keys:
--   "householdId" ON DELETE CASCADE   the offers go with their household.
--   "toUserId"    ON DELETE CASCADE   the person the offer is made TO.
--                                     /e2e/cleanup deletes "User" rows, and
--                                     an offer to that person must not block
--                                     it. Production never deletes a "User"
--                                     row (H2 sets "deletedAt"), so there
--                                     this cascade never fires.
--
-- "fromUserId" has NO foreign key, on purpose. It is the owner who made a
-- transfer offer, and NULL for a hand-over. A key to "User" (RESTRICT or
-- CASCADE) would act on the person who MADE the offer: RESTRICT would block
-- /e2e/cleanup of that person when the offer sits in a household they do not
-- own, and CASCADE would delete an offer the other person may still want to
-- accept. The id only names who offered; nothing reads it for a right.
--
-- The unique index allows at most one offer per person per household, so
-- "the first accept wins" stays simple. Its first column is "householdId",
-- so it also serves the household's ON DELETE CASCADE. The second index lists
-- one person's offers (decision T65) and serves the "User" ON DELETE CASCADE.
--
-- Every statement below names only "Household" and "User", which committed
-- migrations 20261104000000_add_households and earlier created.
--
-- Written by hand in the shape `prisma migrate diff` prints. It matches the
-- output of `prisma migrate diff --from-schema-datamodel <the schema at
-- 20261120000000_add_household_activity> --to-schema-datamodel
-- prisma/schema.prisma --script`, which needs no database.

-- CreateEnum
CREATE TYPE "OfferKind" AS ENUM ('transfer', 'handover');

-- CreateTable
CREATE TABLE "OwnershipOffer" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "kind" "OfferKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "OwnershipOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnershipOffer_toUserId_idx" ON "OwnershipOffer"("toUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipOffer_householdId_toUserId_key" ON "OwnershipOffer"("householdId", "toUserId");

-- AddForeignKey
ALTER TABLE "OwnershipOffer" ADD CONSTRAINT "OwnershipOffer_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipOffer" ADD CONSTRAINT "OwnershipOffer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
