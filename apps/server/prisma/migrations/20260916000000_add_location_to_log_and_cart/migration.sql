-- PR 3a — additive only. Adds "locationId" to "InventoryLog" and to "Cart".
--
-- This migration does NOT re-key "Cart"."id". That is PR 3b
-- (docs/features/locations/2026-08-30-cloud-locations-design.md §4.7). Keeping
-- the re-key out of this file is the reason PR 3 was split: every existing
-- query keeps working after this migration, so it can be reviewed and reverted
-- on its own.
--
-- Four phases per column, in this order:
--   1. ADD COLUMN, nullable  — no existing row can satisfy NOT NULL yet
--   2. backfill              — from the owner's default Location
--   3. guard                 — fail loudly if any row is still NULL
--   4. SET NOT NULL, then the FK and the index
--
-- Both columns use ON DELETE CASCADE. Deleting a Location deletes its logs and
-- its carts, which is what local mode already does (deleteLocation in
-- apps/web/src/db/operations.ts:1215). "CartItem" already cascades from "Cart",
-- so the cart cascade removes cart items too.

-- ─────────────────────────────────────────────────────────────────────────────
-- InventoryLog
-- ─────────────────────────────────────────────────────────────────────────────

-- Phase 1: add nullable.
ALTER TABLE "InventoryLog" ADD COLUMN "locationId" TEXT;

-- Phase 2: backfill from the owner's default Location.
-- Joins on "userId", so a log can only ever be pointed at a Location its own
-- owner holds. `l."isDefault"` picks the one default that PR 1's partial unique
-- index ("Location_one_default_per_user_key") guarantees is unique per user.
UPDATE "InventoryLog" log
SET "locationId" = l."id"
FROM "Location" l
WHERE l."userId" = log."userId" AND l."isDefault";

-- Phase 3: guard.
-- Protects against a user who holds an InventoryLog but has NO default
-- Location. Then the UPDATE above matches no row for them, their logs stay
-- NULL, and phase 4 fails with Postgres 23502 ("column contains null values") —
-- which names the column but not the user and not the reason. This RAISE names
-- both, so whoever runs the deploy can fix the data instead of guessing.
--
-- It should never fire: PR 1's migration created a default Location for every
-- user in all nine user-scoped tables, and ensureDefaultLocation
-- (apps/server/src/lib/defaultLocation.ts) covers every user created since.
-- The guard is here because that assumption might be wrong, not because it is
-- expected to be.
DO $$
DECLARE
  orphan_count INTEGER;
  orphan_users TEXT;
BEGIN
  SELECT count(*), string_agg(DISTINCT "userId", ', ')
  INTO orphan_count, orphan_users
  FROM "InventoryLog" WHERE "locationId" IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Backfill left % InventoryLog row(s) with a NULL locationId. These users have no default Location: %. Create one default Location per listed user, then re-run this migration.',
      orphan_count, orphan_users;
  END IF;
END $$;

-- Phase 4: constrain, then the FK and the index.
ALTER TABLE "InventoryLog" ALTER COLUMN "locationId" SET NOT NULL;

ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Serves the three location-scoped log queries added in PR 3a Task 2:
-- itemLogs, inventoryLogCountByItem and lastPurchaseDates. All three match
-- "itemId" and "locationId" for equality, then order by or count "occurredAt".
-- Both equality columns lead, so "occurredAt" is already ordered inside each
-- match. Postgres reads a DESC index backwards, so itemLogs' ascending order is
-- served by the same index.
CREATE INDEX "InventoryLog_itemId_locationId_occurredAt_idx"
  ON "InventoryLog"("itemId", "locationId", "occurredAt" DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Cart
-- ─────────────────────────────────────────────────────────────────────────────
--
-- "Cart"."locationId" is written from here on and read by nothing. That is on
-- purpose: it lands additively now so PR 3b's re-key has a column to build on.

-- Phase 1: add nullable.
ALTER TABLE "Cart" ADD COLUMN "locationId" TEXT;

-- Phase 2: backfill from the owner's default Location. Same join as above.
UPDATE "Cart" c
SET "locationId" = l."id"
FROM "Location" l
WHERE l."userId" = c."userId" AND l."isDefault";

-- Phase 3: guard. Same protection as the InventoryLog guard above.
DO $$
DECLARE
  orphan_count INTEGER;
  orphan_users TEXT;
BEGIN
  SELECT count(*), string_agg(DISTINCT "userId", ', ')
  INTO orphan_count, orphan_users
  FROM "Cart" WHERE "locationId" IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Backfill left % Cart row(s) with a NULL locationId. These users have no default Location: %. Create one default Location per listed user, then re-run this migration.',
      orphan_count, orphan_users;
  END IF;
END $$;

-- Phase 4: constrain, then the FK.
-- No standalone index on "Cart"."locationId". Nothing reads the column in
-- PR 3a, and PR 3b re-keys "Cart"."id" to `${locationId}:${vendorId}`, so the
-- primary key itself will carry the location. The one cost is that the
-- ON DELETE CASCADE from "Location" scans "Cart"; location deletes are rare
-- and a user holds few carts.
ALTER TABLE "Cart" ALTER COLUMN "locationId" SET NOT NULL;

ALTER TABLE "Cart" ADD CONSTRAINT "Cart_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
