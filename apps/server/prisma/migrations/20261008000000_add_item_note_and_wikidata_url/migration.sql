-- Adds "Item"."wikidataUrl" and "Item"."note", the two Info-tab fields that
-- already exist in local mode (the Dexie `Item` in packages/types/src/index.ts)
-- but had nowhere to go in cloud mode. Without them the client sent a field the
-- GraphQL schema did not declare and the whole save failed. Issue #335.
--
-- Both columns are NULLABLE, so this migration needs no backfill and no
-- RAISE EXCEPTION guard: every existing row simply gets NULL. The local type
-- declares both fields optional (`wikidataUrl?: string`, `note?: string`), so
-- "absent" is how local mode already stores "no note", and NULL is the same
-- thing in SQL. The resolvers map an absent input to NULL and never to the
-- empty string, which keeps the two data modes storing the same value.

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "wikidataUrl" TEXT,
ADD COLUMN     "note" TEXT;
