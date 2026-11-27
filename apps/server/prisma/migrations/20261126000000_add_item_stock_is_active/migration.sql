-- Adds "ItemStock"."isActive": is the item active at THIS location?
-- `true` means active whatever the target is (target 0 = "no target").
-- `false` means inactive whatever the target is.
-- Design: docs/features/items/2026-11-26-item-stock-active-design.md.
--
-- Until this migration the web read "inactive here" as "targetQuantity = 0".
-- Now the column decides.
--
-- NOT NULL with DEFAULT true. Postgres fills every existing row with `true`
-- while it adds the column, so no row can be left NULL. That is why there is
-- no RAISE EXCEPTION guard: there is no NULL to count.
--
-- The UPDATE is the one backfill (a named exception in
-- apps/server/prisma/CLAUDE.md). Every row that showed as inactive before
-- this migration (target 0) must still show as inactive on the first request
-- after the deploy. Without it, every such row would turn active at once.
-- It is additive only, so the server deployed before this migration keeps
-- working against the new table.

-- AlterTable
ALTER TABLE "ItemStock" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: the old rule, written down once.
UPDATE "ItemStock" SET "isActive" = false WHERE "targetQuantity" = 0;
