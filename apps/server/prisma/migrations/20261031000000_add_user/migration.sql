-- Adds the "User" table: one row per person who has signed in with Clerk.
-- The server keeps each person's display name and email here, so it does not
-- have to ask Clerk on every request. Households phase H2. See
-- docs/global/permissions/2026-10-04-households-design.md.
--
-- "id" is the Clerk user id, not a generated cuid. It is also the primary key,
-- so two first requests from the same new person cannot both create a row:
-- the second insert fails with a unique violation (Prisma P2002).
--
-- "email" is nullable on purpose. A Clerk account may sign in by phone or
-- username and have no email, and Clerk's user.deleted event carries none.
--
-- This migration only creates a new, empty table. No other table changes and
-- no existing row is read, so it needs no backfill and no RAISE EXCEPTION
-- guard. No foreign key points at "User" yet; phase H3 adds them.
--
-- "User" must stay quoted: user is a reserved word in Postgres.

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
