-- Households H3a, the second of two migrations. Ends the account scope on
-- "Location" and the six catalog models ("Item", "Tag", "TagType", "Vendor",
-- "Recipe", "Shelf"): "householdId" becomes NOT NULL, and "userId" goes. It
-- also drops "Location"."isDefault" and its partial unique index. See
-- docs/global/permissions/2026-11-04-households-plan-h3a.md (task 3.14) and
-- the first migration, 20261104000000_add_households.
--
-- "Cart", "CartItem" and "InventoryLog" keep their "userId" (it means the
-- author). "Location"."order" stays until H7 (decision H5).
--
-- The file runs in this order:
--
--   Step 1  lock the tables, so no write lands during the rest
--   Step 2  re-run steps 2-7 of add_households, adding only what is missing
--   Step 3  clean up the references that cross households (owner's choice A)
--   Step 4  the guard
--   Step 5  SET NOT NULL, then the drops
--
-- Postgres runs this whole file in one transaction. If the guard in step 4
-- raises, nothing in this file is applied.

-- ── Step 1: lock the tables ──
--
-- Why: each migration file is its own transaction. After add_households
-- commits, the OLD server keeps serving until Railway switches to the new
-- one. In that window it can write a row with a null "householdId", a
-- location with no organizer, or a "User" row for a new person with no
-- household. Step 2 adds what those writes are missing. The lock makes sure
-- no new such write lands after step 2 has looked.
--
-- EXCLUSIVE mode blocks every write and still allows plain reads, so the old
-- server keeps answering reads while this file runs. The ALTER TABLE
-- statements in step 5 take the stronger ACCESS EXCLUSIVE lock anyway.
--
-- The list is every table this file reads to decide, or writes: the seven,
-- the four that point at them, the three join tables, and the three
-- household tables.
LOCK TABLE
  "User", "Household", "HouseholdMember", "LocationMember",
  "Location", "Item", "Tag", "TagType", "Vendor", "Recipe", "Shelf",
  "ItemStock", "Cart", "CartItem", "InventoryLog",
  "ItemTag", "ItemVendor", "RecipeItem"
  IN EXCLUSIVE MODE;

-- ── Step 2: re-run steps 2-7 of add_households, for what is missing ──
--
-- Every statement adds only what is missing, so on a database where the old
-- server wrote nothing in the window, this step changes nothing.
--
-- This also fills the rows with a null "householdId" that piled up on the
-- shared test database (plan, task 3.14, "From the review of task 3.10").

-- 2a (add_households step 2): a "User" row for every "userId" in the data
-- that has none. A person the old server served while their "User" row could
-- not be written (ensureUserOrLog never fails a request).
INSERT INTO "User" ("id", "displayName", "createdAt", "updatedAt")
SELECT u."userId", 'User', NOW(), NOW()
FROM (
      SELECT "userId" FROM "Location"
      UNION SELECT "userId" FROM "Item"
      UNION SELECT "userId" FROM "TagType"
      UNION SELECT "userId" FROM "Tag"
      UNION SELECT "userId" FROM "Vendor"
      UNION SELECT "userId" FROM "Recipe"
      UNION SELECT "userId" FROM "Shelf"
      UNION SELECT "userId" FROM "Cart"
      UNION SELECT "userId" FROM "CartItem"
      UNION SELECT "userId" FROM "InventoryLog"
) u
WHERE NOT EXISTS (SELECT 1 FROM "User" x WHERE x."id" = u."userId");

-- 2b (add_households step 3): one household and its owner row for every
-- person who is in no household AND was never set up.
--
-- "householdSetupAt" IS NULL matters. add_households and first sign-in set it
-- for every person they give a household. A person who has it set and is in
-- no household was REMOVED from one (the E2E member route can do this on the
-- test database; H5 adds leaving). Such a person must not get a new
-- household: first sign-in does not give them one either.
--
-- One statement, so the owner row is written with the household it names.
WITH new_owner AS (
  SELECT u."id", u."displayName"
  FROM "User" u
  WHERE u."householdSetupAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "HouseholdMember" m WHERE m."userId" = u."id")
), new_household AS (
  INSERT INTO "Household" ("id", "name", "ownerId", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, o."displayName" || '''s Household', o."id", NOW(), NOW()
  FROM new_owner o
  RETURNING "id", "ownerId"
)
INSERT INTO "HouseholdMember" ("householdId", "userId", "role", "joinedAt")
SELECT h."id", h."ownerId", 'owner'::"HouseholdRole", NOW()
FROM new_household h;

-- 2c (add_households step 4): a 'Home' location for each household made in
-- 2b whose owner has no location yet. Only those: the owner's
-- "householdSetupAt" is still NULL here (2f sets it). A person the old server
-- served already has a 'My Home' from its ensureDefaultLocation, which 2d
-- puts into their household; they get no second location.
--
-- Not "every household with no location": on the test database a household
-- member who owns no location would then get one, and a household emptied by
-- a test would get one back.
--
-- "isDefault" is still a column here, and NOT NULL with a default of false.
-- It is dropped in step 5, so its value does not matter.
INSERT INTO "Location" ("id", "name", "order", "userId", "householdId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'Home', 0, u."id", h."id", NOW(), NOW()
FROM "Household" h
JOIN "User" u ON u."id" = h."ownerId"
WHERE u."householdSetupAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Location" l WHERE l."userId" = u."id");

-- 2d (add_households step 5): every row with a null "householdId" goes into
-- the household of the person in its "userId".
--
-- Joined through "HouseholdMember", not "Household"."ownerId" as in
-- add_households. There every person owned the one household they were in.
-- Since then the E2E member route can put a person into a household they do
-- not own (test database only). A person is in at most one household until
-- H5, so the join matches at most one row. A row whose person is in no
-- household keeps its null, and the guard in step 4 names it.
UPDATE "Location" t SET "householdId" = m."householdId" FROM "HouseholdMember" m WHERE m."userId" = t."userId" AND t."householdId" IS NULL;
UPDATE "Item"     t SET "householdId" = m."householdId" FROM "HouseholdMember" m WHERE m."userId" = t."userId" AND t."householdId" IS NULL;
UPDATE "Tag"      t SET "householdId" = m."householdId" FROM "HouseholdMember" m WHERE m."userId" = t."userId" AND t."householdId" IS NULL;
UPDATE "TagType"  t SET "householdId" = m."householdId" FROM "HouseholdMember" m WHERE m."userId" = t."userId" AND t."householdId" IS NULL;
UPDATE "Vendor"   t SET "householdId" = m."householdId" FROM "HouseholdMember" m WHERE m."userId" = t."userId" AND t."householdId" IS NULL;
UPDATE "Recipe"   t SET "householdId" = m."householdId" FROM "HouseholdMember" m WHERE m."userId" = t."userId" AND t."householdId" IS NULL;
UPDATE "Shelf"    t SET "householdId" = m."householdId" FROM "HouseholdMember" m WHERE m."userId" = t."userId" AND t."householdId" IS NULL;

-- 2e (add_households step 6): a location with no role row at all gets its
-- "userId" as organizer. That is a location the old server created.
--
-- "no role row at all", not "no organizer": a location that has some role
-- rows was made by the H3a code, which always writes the organizer row. And
-- an insert for a person who already has a row would break the primary key.
INSERT INTO "LocationMember" ("locationId", "userId", "role", "createdAt")
SELECT l."id", l."userId", 'organizer'::"LocationRole", NOW()
FROM "Location" l
WHERE NOT EXISTS (SELECT 1 FROM "LocationMember" m WHERE m."locationId" = l."id");

-- 2f (add_households step 7): every person in a household is marked as set
-- up, so first sign-in does not make them a second household.
UPDATE "User" u SET "householdSetupAt" = NOW()
WHERE u."householdSetupAt" IS NULL
  AND EXISTS (SELECT 1 FROM "HouseholdMember" m WHERE m."userId" = u."id");

-- ── Step 3: clean up references that cross households ──
--
-- Before #273 (task 3.7) the server did not check the ids a write attached,
-- and before task 3.8 it did not check that an item and a location belong to
-- the same account. So a database may hold rows that link one household's
-- row to another household's row. add_households step 8b counted five kinds.
-- Since task 3.7 such rows make the web's full-set edits fail with FORBIDDEN,
-- leak the other household's ids, and block deleting a tag type or a
-- household. The owner chose on 2026-11-11 to clean them up here (option A,
-- with A1 for "Tag"."typeId", and the three stock-side kinds too).
--
-- Each statement reports how many rows it changed with RAISE NOTICE, like
-- add_households step 8b. Probably 0 in production: a person could only make
-- such a row by calling the API by hand with a guessed id.
--
-- "<>", not IS DISTINCT FROM: a row with a null "householdId" is not touched
-- here. The guard in step 4 refuses it.
DO $$
DECLARE
  n INTEGER;
BEGIN
  -- 3a. A tag whose type is in another household (A1): copy the type into
  -- the tag's household, with the same name and color, and point the tag at
  -- the copy. ONE copy per household and type, however many of that
  -- household's tags use the type. A copy, not a delete: it keeps the tag
  -- and its items.
  --
  -- The copy's "userId" is the "userId" of one of the tags that use it. The
  -- column is dropped in step 5, but it is NOT NULL until then. Not the
  -- household's "ownerId": that column may be NULL.
  CREATE TEMP TABLE "_tag_type_copy" ON COMMIT DROP AS
  SELECT gen_random_uuid()::text AS "newId", p."householdId", p."typeId", p."userId"
  FROM (
    SELECT t."householdId", t."typeId", min(t."userId") AS "userId"
    FROM "Tag" t JOIN "TagType" x ON x."id" = t."typeId"
    WHERE t."householdId" <> x."householdId"
    GROUP BY t."householdId", t."typeId"
  ) p;

  INSERT INTO "TagType" ("id", "name", "color", "userId", "householdId")
  SELECT c."newId", x."name", x."color", c."userId", c."householdId"
  FROM "_tag_type_copy" c
  JOIN "TagType" x ON x."id" = c."typeId";
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'drop_user_scope: % tag type(s) copied into the household of a tag that used them', n;

  UPDATE "Tag" t SET "typeId" = c."newId"
  FROM "_tag_type_copy" c
  WHERE t."householdId" = c."householdId" AND t."typeId" = c."typeId";
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'drop_user_scope: % tag(s) moved to the copy of their type', n;

  DROP TABLE "_tag_type_copy";

  -- 3b. A tag whose parent is in another household: the tag becomes a
  -- top-level tag.
  UPDATE "Tag" t SET "parentId" = NULL
  FROM "Tag" p
  WHERE p."id" = t."parentId" AND t."householdId" <> p."householdId";
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'drop_user_scope: % tag(s) lost a parent in another household', n;

  -- 3c. The three join tables: delete the row.
  DELETE FROM "ItemTag" j
  USING "Item" i, "Tag" t
  WHERE i."id" = j."itemId" AND t."id" = j."tagId" AND i."householdId" <> t."householdId";
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'drop_user_scope: % ItemTag row(s) deleted', n;

  DELETE FROM "ItemVendor" j
  USING "Item" i, "Vendor" v
  WHERE i."id" = j."itemId" AND v."id" = j."vendorId" AND i."householdId" <> v."householdId";
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'drop_user_scope: % ItemVendor row(s) deleted', n;

  DELETE FROM "RecipeItem" j
  USING "Recipe" rc, "Item" i
  WHERE rc."id" = j."recipeId" AND i."id" = j."itemId" AND rc."householdId" <> i."householdId";
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'drop_user_scope: % RecipeItem row(s) deleted', n;

  -- 3d. A shelf's "itemIds": remove the ids of another household's items.
  -- An id no item holds is KEPT, in its place: a shelf may name a deleted
  -- item (requireCatalogIds with missing: 'allow', lib/authz.ts). The order
  -- of the kept ids does not change.
  UPDATE "Shelf" s SET "itemIds" = ARRAY(
    SELECT u.x FROM unnest(s."itemIds") WITH ORDINALITY AS u(x, ord)
    WHERE NOT EXISTS (
      SELECT 1 FROM "Item" i WHERE i."id" = u.x AND i."householdId" <> s."householdId"
    )
    ORDER BY u.ord
  )
  WHERE EXISTS (
    SELECT 1 FROM unnest(s."itemIds") AS u(x)
    JOIN "Item" i ON i."id" = u.x
    WHERE i."householdId" <> s."householdId"
  );
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'drop_user_scope: % shelf(s) lost item ids of another household', n;

  -- 3e. A shelf's "filterConfig": the same for its "tagIds", "vendorIds" and
  -- "recipeIds" arrays (FilterConfig in schema/shelf.graphql). One statement
  -- per array. Only a value that is a JSON array is changed; any other key
  -- in the object is left as it is.
  UPDATE "Shelf" s SET "filterConfig" = jsonb_set(s."filterConfig", '{tagIds}', (
    SELECT coalesce(jsonb_agg(u.x ORDER BY u.ord), '[]'::jsonb)
    FROM jsonb_array_elements_text(s."filterConfig" -> 'tagIds') WITH ORDINALITY AS u(x, ord)
    WHERE NOT EXISTS (
      SELECT 1 FROM "Tag" t WHERE t."id" = u.x AND t."householdId" <> s."householdId"
    )
  ))
  WHERE jsonb_typeof(s."filterConfig" -> 'tagIds') = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(s."filterConfig" -> 'tagIds') AS u(x)
      JOIN "Tag" t ON t."id" = u.x
      WHERE t."householdId" <> s."householdId"
    );
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'drop_user_scope: % shelf(s) lost filter tag ids of another household', n;

  UPDATE "Shelf" s SET "filterConfig" = jsonb_set(s."filterConfig", '{vendorIds}', (
    SELECT coalesce(jsonb_agg(u.x ORDER BY u.ord), '[]'::jsonb)
    FROM jsonb_array_elements_text(s."filterConfig" -> 'vendorIds') WITH ORDINALITY AS u(x, ord)
    WHERE NOT EXISTS (
      SELECT 1 FROM "Vendor" v WHERE v."id" = u.x AND v."householdId" <> s."householdId"
    )
  ))
  WHERE jsonb_typeof(s."filterConfig" -> 'vendorIds') = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(s."filterConfig" -> 'vendorIds') AS u(x)
      JOIN "Vendor" v ON v."id" = u.x
      WHERE v."householdId" <> s."householdId"
    );
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'drop_user_scope: % shelf(s) lost filter vendor ids of another household', n;

  UPDATE "Shelf" s SET "filterConfig" = jsonb_set(s."filterConfig", '{recipeIds}', (
    SELECT coalesce(jsonb_agg(u.x ORDER BY u.ord), '[]'::jsonb)
    FROM jsonb_array_elements_text(s."filterConfig" -> 'recipeIds') WITH ORDINALITY AS u(x, ord)
    WHERE NOT EXISTS (
      SELECT 1 FROM "Recipe" rc WHERE rc."id" = u.x AND rc."householdId" <> s."householdId"
    )
  ))
  WHERE jsonb_typeof(s."filterConfig" -> 'recipeIds') = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(s."filterConfig" -> 'recipeIds') AS u(x)
      JOIN "Recipe" rc ON rc."id" = u.x
      WHERE rc."householdId" <> s."householdId"
    );
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'drop_user_scope: % shelf(s) lost filter recipe ids of another household', n;

  -- 3f. The three stock-side kinds (owner's answer to Q4): a row whose item
  -- is in another household than its location. For "CartItem", the location
  -- is the cart's location. Deleted: the row records stock, a log or a cart
  -- line of an item the location's household does not have.
  DELETE FROM "ItemStock" s
  USING "Item" i, "Location" l
  WHERE i."id" = s."itemId" AND l."id" = s."locationId" AND i."householdId" <> l."householdId";
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'drop_user_scope: % ItemStock row(s) deleted', n;

  DELETE FROM "CartItem" ci
  USING "Item" i, "Cart" c, "Location" l
  WHERE i."id" = ci."itemId" AND c."id" = ci."cartId" AND l."id" = c."locationId"
    AND i."householdId" <> l."householdId";
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'drop_user_scope: % CartItem row(s) deleted', n;

  DELETE FROM "InventoryLog" g
  USING "Item" i, "Location" l
  WHERE i."id" = g."itemId" AND l."id" = g."locationId" AND i."householdId" <> l."householdId";
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'drop_user_scope: % InventoryLog row(s) deleted', n;
END $$;

-- ── Step 4: the guard ──
--
-- What it protects against: a row step 2 could not place. That is a row
-- whose "userId" person is in no household, for example a person removed
-- from a household on the test database who still had rows with no
-- household. Without this guard, SET NOT NULL in step 5 fails with Postgres
-- error 23502, which names no row. This guard names the rows and their
-- "userId".
--
-- It also checks the two facts the H3a code relies on that step 2 should
-- have made true: every location has an organizer, and every person in a
-- household is marked as set up.
-- Each list shows at most 20 entries, plus the total count.
DO $$
DECLARE
  bad_count INTEGER;
  bad_list  TEXT;
BEGIN
  -- 1. A row in the seven tables with no household.
  WITH missing AS (
    SELECT 'Location' AS tbl, "id", "userId" FROM "Location" WHERE "householdId" IS NULL
    UNION ALL SELECT 'Item',    "id", "userId" FROM "Item"    WHERE "householdId" IS NULL
    UNION ALL SELECT 'Tag',     "id", "userId" FROM "Tag"     WHERE "householdId" IS NULL
    UNION ALL SELECT 'TagType', "id", "userId" FROM "TagType" WHERE "householdId" IS NULL
    UNION ALL SELECT 'Vendor',  "id", "userId" FROM "Vendor"  WHERE "householdId" IS NULL
    UNION ALL SELECT 'Recipe',  "id", "userId" FROM "Recipe"  WHERE "householdId" IS NULL
    UNION ALL SELECT 'Shelf',   "id", "userId" FROM "Shelf"   WHERE "householdId" IS NULL
  )
  SELECT (SELECT count(*) FROM missing),
         (SELECT string_agg(tbl || ' ' || "id" || ' (userId ' || "userId" || ')', ', ')
            FROM (SELECT * FROM missing ORDER BY tbl, "id" LIMIT 20) first20)
    INTO bad_count, bad_list;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'drop_user_scope: % row(s) have no household, because their userId is in no household (removed from one?). Move or delete them first. First 20: %', bad_count, bad_list;
  END IF;

  -- 2. A location with no organizer.
  SELECT count(*), string_agg("id", ', ')
    INTO bad_count, bad_list
    FROM (
      SELECT l."id" FROM "Location" l
      WHERE NOT EXISTS (
        SELECT 1 FROM "LocationMember" m WHERE m."locationId" = l."id" AND m."role" = 'organizer'
      )
      ORDER BY l."id"
    ) noorganizer;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'drop_user_scope: % location(s) have no organizer: %', bad_count, left(bad_list, 2000);
  END IF;

  -- 3. A person in a household who is not marked as set up. First sign-in
  -- would claim them and make a second household.
  SELECT count(*), string_agg("id", ', ')
    INTO bad_count, bad_list
    FROM (
      SELECT u."id" FROM "User" u
      WHERE u."householdSetupAt" IS NULL
        AND EXISTS (SELECT 1 FROM "HouseholdMember" m WHERE m."userId" = u."id")
      ORDER BY u."id"
    ) notsetup;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'drop_user_scope: % user(s) in a household have no householdSetupAt: %', bad_count, left(bad_list, 2000);
  END IF;
END $$;

-- ── Step 5: SET NOT NULL, then the drops ──
--
-- The partial unique index first, by name. Dropping "isDefault" would drop it
-- too, because it names that column. Named here so a reader finds where it
-- went: 20260830000000_add_location_and_item_stock created it, and the
-- comments in 20260916000000 and 20260917000000 argue from it.
DROP INDEX IF EXISTS "Location_one_default_per_user_key";

-- The "userId" indexes, then the columns, exactly as prisma migrate diff
-- prints them.

-- DropIndex
DROP INDEX "TagType_userId_name_idx";

-- DropIndex
DROP INDEX "Tag_userId_typeId_idx";

-- DropIndex
DROP INDEX "Vendor_userId_name_idx";

-- DropIndex
DROP INDEX "Item_userId_updatedAt_idx";

-- DropIndex
DROP INDEX "Item_userId_name_idx";

-- DropIndex
DROP INDEX "Recipe_userId_name_idx";

-- DropIndex
DROP INDEX "Shelf_userId_order_idx";

-- DropIndex
DROP INDEX "Location_userId_order_idx";

-- AlterTable
ALTER TABLE "TagType" DROP COLUMN "userId",
ALTER COLUMN "householdId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Tag" DROP COLUMN "userId",
ALTER COLUMN "householdId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Vendor" DROP COLUMN "userId",
ALTER COLUMN "householdId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Item" DROP COLUMN "userId",
ALTER COLUMN "householdId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Recipe" DROP COLUMN "userId",
ALTER COLUMN "householdId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Shelf" DROP COLUMN "userId",
ALTER COLUMN "householdId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Location" DROP COLUMN "isDefault",
DROP COLUMN "userId",
ALTER COLUMN "householdId" SET NOT NULL;
