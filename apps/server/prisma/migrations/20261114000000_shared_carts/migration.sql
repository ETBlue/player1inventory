-- Households H3b: shared carts. A cart belongs to its location, and everyone
-- with a role on that location shares it. See
-- docs/global/permissions/2026-11-14-households-h3b-design.md (section 1) and
-- docs/global/permissions/2026-11-14-households-plan-h3b.md (task B.3).
--
-- What this file does:
--
--   Step 1  merge "CartItem" rows that name the same item in the same cart
--   Step 2  add the unique index on ("cartId", "itemId")
--   Step 3  drop the old index on "cartId" alone (plan decision P2)
--   Step 4  drop "Cart"."userId" and its index
--
-- "CartItem"."userId" stays. It now means "added by" and is never a scope.
--
-- Postgres runs this whole file in one transaction. If any statement fails,
-- nothing in this file is applied.

-- ── Step 1: merge duplicate rows ──
--
-- Why there can be duplicates: until H3b each person had their own rows, and
-- addToCart looked a row up by (cartId, itemId, userId). So one cart can hold
-- two rows for one item. Step 2 cannot build a unique index while they exist.
--
-- The rule for each group of rows with the same ("cartId", "itemId"):
--   - the row with the lowest "id" stays;
--   - its "quantity" becomes the sum of the group;
--   - its own "userId" stays (the first adder is kept);
--   - every other row of the group is deleted.
--
-- "id" is compared as text, in the database's text order (the column is
-- TEXT, usually a cuid). Any fixed order would do; this one is simple to
-- check by hand.
--
-- Lock first, so no write lands between the merge and the index. EXCLUSIVE
-- mode blocks writes and still allows plain reads.
LOCK TABLE "CartItem" IN EXCLUSIVE MODE;

UPDATE "CartItem" AS keep
SET "quantity" = g."total"
FROM (
  SELECT MIN("id") AS "keepId", SUM("quantity") AS "total"
  FROM "CartItem"
  GROUP BY "cartId", "itemId"
  HAVING COUNT(*) > 1
) AS g
WHERE keep."id" = g."keepId";

DELETE FROM "CartItem" AS d
USING (
  SELECT "cartId", "itemId", MIN("id") AS "keepId"
  FROM "CartItem"
  GROUP BY "cartId", "itemId"
  HAVING COUNT(*) > 1
) AS g
WHERE d."cartId" = g."cartId"
  AND d."itemId" = g."itemId"
  AND d."id" <> g."keepId";

-- ── Step 2: one row per item per cart ──
--
-- The name is the one Prisma gives @@unique([cartId, itemId]), so the schema
-- and the migration history agree.
CREATE UNIQUE INDEX "CartItem_cartId_itemId_key" ON "CartItem"("cartId", "itemId");

-- ── Step 3: drop the index on "cartId" alone ──
--
-- The unique index from step 2 starts with "cartId", so Postgres can use it
-- for every lookup by "cartId" alone.
DROP INDEX "CartItem_cartId_idx";

-- ── Step 4: drop "Cart"."userId" ──
--
-- The index was created by 20260609100000_permanent_vendor_carts. Dropping
-- the column would drop the index too; it is dropped first by name so the
-- file says what it does.
--
-- Deploy warning: an OLD server that still runs after this file commits
-- writes "userId" when it creates a cart, and that write fails. Deploy with
-- auto-deploy off, as for H3a (design, "Deploy").
DROP INDEX "Cart_userId_idx";

ALTER TABLE "Cart" DROP COLUMN "userId";
