-- Households H7b. Adds what the personal location order and the four location
-- sorts need. See docs/global/permissions/2026-11-21-households-plan-h7.md
-- (decisions T74, T75 and T79, task M.1).
--
-- What it does, in this order:
--   1. one enum, "LocationSort" (name, lastUpdated, lastVisited, custom);
--   2. one nullable column, "User"."locationSort";
--   3. one nullable column, "Location"."dataUpdatedAt", and ONE backfill of it;
--   4. one new, empty table, "LocationPreference".
--
-- WHY EACH NEW COLUMN IS NULLABLE
--
--   "User"."locationSort"      NULL means "the default sort" (owner decision
--                              O52). The server fills in the default when it
--                              reads the value. So every existing person needs
--                              no value, and the default can change later with
--                              no data step. No backfill.
--   "Location"."dataUpdatedAt" NULL means "nothing at this location has
--                              changed since this column was added, and it had
--                              no stock row then". The server sets it after a
--                              stock, cart or log write (decision T79).
--   "LocationPreference"."customOrder"
--                              NULL until the person reorders their list. A
--                              location with no value sorts after the ones that
--                              have one, by the shared "Location"."order"
--                              (decision T76). So no row is copied from
--                              "Location"."order".
--   "LocationPreference"."lastVisitedAt"
--                              NULL until the person makes the location their
--                              active one (decision T80).
--
-- WHY A NULLABLE COLUMN GETS A BACKFILL HERE
--
-- apps/server/prisma/CLAUDE.md says a nullable column normally needs no
-- backfill and no guard: NULL breaks no constraint. "dataUpdatedAt" is the one
-- exception, on purpose. The "Last updated" sort reads it, and the newest
-- "ItemStock"."updatedAt" of each location is real history that already
-- exists. Without the backfill, every location would read NULL after the
-- deploy, and the sort would show no order until each location's next write.
-- The UPDATE sets only locations that have at least one stock row. A location
-- with none keeps NULL, which is the true answer. The UPDATE cannot fail a
-- constraint, so there is no RAISE EXCEPTION guard.
--
-- Carts and logs are NOT read by the backfill. "CartItem" has no time column
-- for a change, and the plan names "ItemStock" only (decision T79). A
-- location whose only data is a cart or a log keeps NULL until its next write.
--
-- "LocationPreference" foreign keys, both ON DELETE CASCADE:
--   "userId"     /e2e/cleanup deletes "User" rows, and a preference row must
--                not block it. Production never deletes a "User" row (H2 sets
--                "deletedAt"), so there this cascade never fires.
--   "locationId" the rows go with their location, also when a household
--                delete removes its locations.
-- The primary key is ("userId", "locationId"): one row per person per
-- location. It starts with "userId", so it serves the "User" cascade. The
-- index on "locationId" serves the "Location" cascade.
--
-- Every statement below names only "User", "Location" and "ItemStock", which
-- committed migrations 20261104000000_add_households and earlier created.
--
-- Written by hand in the shape `prisma migrate diff` prints. Every statement
-- except the backfill matches the output of `prisma migrate diff
-- --from-schema-datamodel <the schema at 20261120100000_add_ownership_offers>
-- --to-schema-datamodel prisma/schema.prisma --script`, which needs no
-- database. That output puts "Location" before "User"; the order of those two
-- ALTER TABLE statements does not matter.

-- CreateEnum
CREATE TYPE "LocationSort" AS ENUM ('name', 'lastUpdated', 'lastVisited', 'custom');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locationSort" "LocationSort";

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "dataUpdatedAt" TIMESTAMP(3);

-- Backfill: the newest stock row time of each location. A location with no
-- stock row is not matched, so it keeps NULL.
UPDATE "Location" l
SET "dataUpdatedAt" = s.m
FROM (
    SELECT "locationId", max("updatedAt") AS m
    FROM "ItemStock"
    GROUP BY 1
) s
WHERE s."locationId" = l."id";

-- CreateTable
CREATE TABLE "LocationPreference" (
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "customOrder" INTEGER,
    "lastVisitedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationPreference_pkey" PRIMARY KEY ("userId","locationId")
);

-- CreateIndex
CREATE INDEX "LocationPreference_locationId_idx" ON "LocationPreference"("locationId");

-- AddForeignKey
ALTER TABLE "LocationPreference" ADD CONSTRAINT "LocationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPreference" ADD CONSTRAINT "LocationPreference_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
