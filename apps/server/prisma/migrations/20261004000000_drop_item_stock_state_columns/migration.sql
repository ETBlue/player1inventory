-- PR 5 — drop "Item"'s five stock state columns.
--
--   "targetQuantity", "refillThreshold", "packedQuantity",
--   "unpackedQuantity", "dueDate"
--
-- These five describe the state of an item IN ONE PLACE, so their home is
-- "ItemStock" (one row per item per location), not "Item" (one row per item).
-- "ItemStock" has held them since PR 1's backfill
-- (20260830000000_add_location_and_item_stock), which copied every "Item"
-- row's five values into a row under that user's default location.
--
-- Design: docs/features/locations/2026-08-30-cloud-locations-design.md §8.
-- Plan:   docs/features/locations/2026-10-04-cloud-locations-plan-pr5.md.
--
-- ── WHAT STAYS ──
--
-- "Item"."consumeAmount" stays. It sits between "unpackedQuantity" and
-- "dueDate" in the model and looks like one of these five, but it is global
-- configuration — the step size for one item, the same in every location.
--
-- "ItemStock"'s five columns of the same name stay. They are the real home,
-- and a migration that dropped them from the wrong table would look exactly
-- like this one. scripts/verify-migration.ts asserts both halves.
--
-- ── FIVE BARE DROPS ──
--
-- "Item" has exactly two indexes, "Item_userId_updatedAt_idx" and
-- "Item_userId_name_idx", and no index, constraint, default or foreign key
-- touches any of the five. So there is nothing to drop first and nothing to
-- rebuild after. `IF EXISTS` per apps/server/prisma/CLAUDE.md's "Defensive
-- SQL" rule, so the file is safe to replay on a database that has already
-- lost a column.
--
-- ── IRREVERSIBLE: THERE IS NO DOWN MIGRATION ──
--
-- Dropping a column destroys its data. Prisma has no `migrate down`, so
-- rollback is a RESTORE FROM A NEON BRANCH, not a migration — and a restore
-- loses every write made after the snapshot was taken. Take the branch before
-- deploying. Task 6 of the plan above writes the runbook for this deploy; it
-- lands in docs/global/backend/ beside its precedent,
-- 2026-09-18-deploy-runbook-cart-rekey.md.
--
-- ── THE DEPLOY IS NOT SAFE FOR A STALE BROWSER BUNDLE ──
--
-- Eight web GraphQL operations selected these fields on "Item" until PR 5.
-- Dropping a field a document selects fails GraphQL validation, so a browser
-- holding a pre-PR-5 bundle gets a blank pantry until it reloads. The server
-- is never mismatched: Railway runs `prisma migrate deploy` as its release
-- command, after the build and before the new instance takes traffic.

-- DropColumn
ALTER TABLE "Item" DROP COLUMN IF EXISTS "targetQuantity";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "refillThreshold";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "packedQuantity";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "unpackedQuantity";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "dueDate";
