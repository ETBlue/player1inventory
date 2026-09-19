-- PR 3b — re-key "Cart"."id" to `${locationId}:${vendorId | 'no-vendor'}`.
--
-- PR 3a (20260916000000_add_location_to_log_and_cart) added "Cart"."locationId"
-- and wrote it from every cart writer. Nothing read it. This migration is what
-- reads it: the column becomes the first half of the primary key.
--
-- Design: docs/features/locations/2026-08-30-cloud-locations-design.md §4.7 and §5.
--
-- ── TWO PHASES, AND THE ORDER IS THE CORRECTNESS ARGUMENT ──
--
--   Phase A  split the shared 'no-vendor' cart, one cart per user
--   Phase B  re-key every remaining cart, "CartItem" first
--
-- Phase A MUST run first. "Cart"."id" is the primary key and 'no-vendor' is a
-- literal every user shares, so there is exactly ONE such row for the whole
-- database and one user owns it. If phase B ran first, it would rename that one
-- row to the owner's `${locationId}:no-vendor`, and phase B's "CartItem" update
-- joins on "cartId" = "Cart"."id" — so EVERY other user's items on that row
-- would follow it into the owner's cart. Phase A moves them out first.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ──
--
-- It does not touch "Item"'s five state columns (PR 5) and it does not change
-- the import surface (PR 4).
--
-- ── THE DEPLOY IS NOT SAFE TO INTERLEAVE ──
--
-- Old server code looks a cart up by the bare `vendorId ?? 'no-vendor'`. After
-- this migration that lookup finds nothing, falls into its `create` branch and
-- makes a DUPLICATE cart under the old shape, with no error. The migration and
-- the new server must go out together. The runbook is PR 3b Task 6.

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE A — split the shared 'no-vendor' cart (design §5)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The leak being fixed: `vendorCart(null)` looked up the id 'no-vendor' with no
-- user scoping. The first user to open it owned the row; every other user's
-- no-vendor cart WAS that same row. Item data did not cross (cartItems filters
-- by "userId") but "lastPurchasedAt" did.
--
-- The row's own owner is left alone on purpose. Phase B renames their row to
-- `${their locationId}:no-vendor`, which is the right id for them and keeps
-- their "lastPurchasedAt". Only the OTHER users need a new row.

-- A.1 — one new no-vendor cart per other user who has items on the shared row.
-- Joined to "Location" on "userId" AND "isDefault", so a cart can only ever be
-- created under a location its own owner holds. PR 1's partial unique index
-- ("Location_one_default_per_user_key") makes that one row per user.
--
-- `IS DISTINCT FROM` rather than `<>`: if no 'no-vendor' cart row exists at all
-- the subquery is NULL, and `<> NULL` is NULL, which would drop every row.
INSERT INTO "Cart" ("id", "userId", "locationId")
SELECT l."id" || ':no-vendor', owners."userId", l."id"
FROM (SELECT DISTINCT "userId" FROM "CartItem" WHERE "cartId" = 'no-vendor') owners
JOIN "Location" l ON l."userId" = owners."userId" AND l."isDefault"
WHERE owners."userId" IS DISTINCT FROM (SELECT "userId" FROM "Cart" WHERE "id" = 'no-vendor');

-- A.2 — repoint those users' cart items onto their own new cart.
UPDATE "CartItem" ci
SET "cartId" = l."id" || ':no-vendor'
FROM "Location" l
WHERE ci."cartId" = 'no-vendor'
  AND l."userId" = ci."userId"
  AND l."isDefault"
  AND ci."userId" IS DISTINCT FROM (SELECT "userId" FROM "Cart" WHERE "id" = 'no-vendor');

-- A.3 — guard for phase A.
--
-- Protects against a user who holds a "CartItem" on the shared row but has NO
-- default "Location". A.1's JOIN matches no row for them, A.2 leaves their
-- items on 'no-vendor', and phase B then drags those items into the row
-- owner's cart — the exact leak this phase exists to fix.
--
-- WITHOUT this guard that outcome is SILENT. Phase B does not fail: the items
-- point at a cart that still exists after the rename, the FK re-add is happy,
-- and the migration reports success with one user's items sitting in another
-- user's cart. There is no Postgres error to read, which is why the guard is
-- here and why it names the users.
--
-- It should never fire: PR 1's migration created a default Location for every
-- user holding a row in any of nine user-scoped tables, "CartItem" among them,
-- and ensureDefaultLocation (apps/server/src/lib/defaultLocation.ts) covers
-- every user created since. The guard is here because that assumption might be
-- wrong, not because it is expected to be.
DO $$
DECLARE
  leftover_count INTEGER;
  leftover_users TEXT;
BEGIN
  SELECT count(*), string_agg(DISTINCT ci."userId", ', ')
  INTO leftover_count, leftover_users
  FROM "CartItem" ci
  JOIN "Cart" c ON c."id" = ci."cartId"
  WHERE ci."cartId" = 'no-vendor' AND ci."userId" <> c."userId";

  IF leftover_count > 0 THEN
    RAISE EXCEPTION
      'Phase A left % CartItem row(s) of OTHER users on the shared ''no-vendor'' cart. These users have no default Location: %. Phase B would move their items into the cart owner''s account. Create one default Location per listed user, then re-run this migration.',
      leftover_count, leftover_users;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE B — the re-key (design §4.7)
-- ═══════════════════════════════════════════════════════════════════════════

-- B.1 — drop the FK so "CartItem" can be moved first.
--
-- The FK is ON DELETE CASCADE ON UPDATE CASCADE (20260411094542_init). The
-- ON UPDATE CASCADE is why the drop is REQUIRED, not optional: with the FK in
-- place, B.2 would set "cartId" to a "Cart"."id" that does not exist yet and
-- fail immediately.
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_cartId_fkey";

-- B.2 — "CartItem" first, while it can still join on the OLD id.
--
-- The `<>` clause skips the carts phase A just created: their ids are already
-- `${locationId}:no-vendor`, and re-keying them again would produce
-- `${locationId}:${locationId}:no-vendor`. The design's SQL was written before
-- phase A existed and does not have this clause.
--
-- The predicate is exact, not a guess about colons. `"id" NOT LIKE '%:%'` would
-- also skip a legitimate old cart whose vendor id contained ':', leaving it
-- un-re-keyed. `"id" = "locationId" || ':no-vendor'` is precisely and only the
-- shape A.1 writes.
UPDATE "CartItem" ci
SET "cartId" = c."locationId" || ':' || c."id"
FROM "Cart" c
WHERE ci."cartId" = c."id"
  AND c."id" <> c."locationId" || ':no-vendor';

-- B.3 — then the carts themselves.
--
-- No transient primary-key collision is possible. Every id written here
-- contains ':' and every id NOT yet rewritten is an old id. Old ids are either
-- 'no-vendor' or a vendor cuid, so none of them contains ':'. (Measured on
-- production 2026-09-16: 0 Cart rows contained ':'.) The carts phase A created
-- do contain ':' and are excluded by the same clause as B.2.
UPDATE "Cart"
SET "id" = "locationId" || ':' || "id"
WHERE "id" <> "locationId" || ':no-vendor';

-- B.4 — guard for phase B, BEFORE the FK goes back on.
--
-- Three checks, each naming what was left behind:
--
--   1. every "Cart"."id" contains ':'            — a row the re-key missed
--   2. every "Cart"."id" starts with its own
--      "locationId" || ':'                       — a double prefix, or a row
--                                                  whose location moved
--   3. every "CartItem"."cartId" names a "Cart"  — an orphan
--
-- Check 3 is the one that catches B.3 running before B.2. WITHOUT this guard
-- that mistake surfaces at B.5 as Postgres 23503, which names the constraint
-- and nothing else. This RAISE names the cart ids that lost their rows.
DO $$
DECLARE
  bad_count INTEGER;
  bad_ids TEXT;
BEGIN
  SELECT count(*), string_agg("id", ', ')
  INTO bad_count, bad_ids
  FROM "Cart" WHERE position(':' IN "id") = 0;

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'The re-key left % Cart row(s) without a '':'' in the id: %. Every cart id must be `${locationId}:${vendorId | no-vendor}`.',
      bad_count, bad_ids;
  END IF;

  SELECT count(*), string_agg("id", ', ')
  INTO bad_count, bad_ids
  FROM "Cart" WHERE left("id", length("locationId") + 1) <> "locationId" || ':';

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'The re-key left % Cart row(s) whose id does not start with their own locationId: %. A doubled prefix (`loc:loc:vendor`) looks like this.',
      bad_count, bad_ids;
  END IF;

  SELECT count(*), string_agg(DISTINCT ci."cartId", ', ')
  INTO bad_count, bad_ids
  FROM "CartItem" ci
  WHERE NOT EXISTS (SELECT 1 FROM "Cart" c WHERE c."id" = ci."cartId");

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'The re-key left % CartItem row(s) pointing at a Cart that no longer exists. Missing cart ids: %. This is what "Cart" being updated before "CartItem" looks like.',
      bad_count, bad_ids;
  END IF;
END $$;

-- B.5 — put the FK back, exactly as 20260411094542_init declared it.
-- Same clauses, or `prisma migrate diff` reports drift against schema.prisma.
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
