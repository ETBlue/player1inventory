-- Adds "Item"."consumable". `true` means the item is used up (milk, rice):
-- the web shows a percentage of its target. `false` means it is not used up
-- (cups, slippers): the web shows its count of pieces.
-- Design: docs/features/items/2026-11-25-item-consumable-design.md.
--
-- NOT NULL with DEFAULT true, in one statement. Postgres fills every existing
-- row with the default while it adds the column, so this needs no backfill
-- UPDATE and no RAISE EXCEPTION guard: no row can be left NULL. Every item
-- written before this migration was shown as consumable, so `true` keeps how
-- it looks today. It is additive only, so the server deployed before this
-- migration keeps working against the new table.

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "consumable" BOOLEAN NOT NULL DEFAULT true;
