// The SQL behind `DELETE /e2e/cleanup` (lib/e2eCleanup.ts), as ONE Postgres
// function, so the route costs ONE database round trip (E2E speed plan, task
// S.2, decision D1, owner answer P4-A).
//
// ── WHY A FUNCTION ──
//
// Until task S.2 the route sent one read and then the ARRAY form of
// `$transaction` with 22 `deleteMany`. Prisma sends each of them on its own,
// plus `BEGIN` and `COMMIT`: about 25 round trips. On the Neon test branch
// one round trip is about 52 ms, so one cleanup took about 1.33 s, and every
// cloud test calls it. A function runs all 22 statements inside Postgres, so
// the server waits for the network once.
//
// ── WHO CREATES IT ──
//
// The E2E server, at start, inside the `if (E2E_TEST_MODE)` block of
// `index.ts` (`installE2eCleanupFunction` in lib/e2eCleanup.ts, decision D4).
// `CREATE OR REPLACE`, so every start writes the current text. It is NOT a
// migration, so it never reaches production. `verify:migration` drops the
// `public` schema, and the function with it; the next E2E start makes it
// again.
//
// Prisma does not see it. Prisma 6's schema engine reads functions from
// `pg_proc`, but its differ (`sql-schema-connector`) never compares them, so
// `migrate diff` and the drift check of `migrate dev` do not report it.
// Checked in the prisma-engines source at tag 6.19.0 (the installed version
// is 6.19.3): `get_procedures` in `sql-schema-describer/src/postgres.rs`
// fills `SqlSchema.procedures`, and no file of `sql-schema-connector/src`
// reads them except the SQL Server flavour, which drops them on reset. The
// test database is only ever migrated with `migrate deploy` and `migrate
// reset`, which run no drift check at all.
//
// ── THE RULES OF THE TEXT ──
//
// `purge-coverage.test.ts` and `e2eCleanup.test.ts` read this text. Keep
// these rules, or they fail:
//
// - Each delete is ONE statement, `DELETE FROM "<Model>" WHERE <filter>;`, on
//   one or more lines, with no comment inside it. Comments go on their own
//   lines, starting with `--`, above the statement.
// - Each delete is followed by `GET DIAGNOSTICS c = ROW_COUNT;` and ONE
//   `jsonb_build_object('<key>', c)`, with the key from `CLEANUP_MODEL_KEYS`.
// - Every table and column name is quoted. No model has `@@map`, so a table
//   name is the model name.
//
// ── WHAT IT DELETES ──
//
// The same 22 deletes, in the same order, with the same filters as the 22
// `deleteMany` calls the route made until task S.2 (decision D2). See the
// header of lib/e2eCleanup.ts for what each one is for. In PL/pgSQL each
// statement is its own query, so the foreign key checks, the cascades and the
// `SET NULL` actions of one statement run before the next statement starts,
// the same as before. The whole function is one statement of the caller, so
// it is one transaction: if any delete fails, nothing is deleted.
//
// It takes a LIST of users (`user_ids text[]`). The route sends one today;
// task S.4 sends several. `x = ANY(user_ids)` is `x = <the one id>` for a
// list of one.

export const E2E_CLEANUP_FUNCTION_SQL = `
CREATE OR REPLACE FUNCTION e2e_cleanup(user_ids text[]) RETURNS jsonb
LANGUAGE plpgsql
AS $e2e_cleanup$
DECLARE
  owned text[];
  c bigint;
  result jsonb := '{}'::jsonb;
BEGIN
  -- An empty list would delete no user but still run every statement. A
  -- NULL list would make every "= ANY(user_ids)" unknown. Both mean the
  -- caller forgot the users, so refuse.
  IF user_ids IS NULL OR cardinality(user_ids) = 0 THEN
    RAISE EXCEPTION 'e2e_cleanup: no user ids';
  END IF;

  -- The households a listed user OWNS. Read by the "HouseholdMember" row,
  -- which is the source of truth for rights (decision H15), not by
  -- "Household"."ownerId", which only mirrors it. Read in the same
  -- transaction as the deletes, so no household can start to be owned in
  -- between (until task S.2 this read ran before the transaction).
  -- COALESCE, so a user who owns nothing gets an empty list, which matches
  -- no row. It is never NULL.
  SELECT COALESCE(array_agg(DISTINCT "householdId"), '{}'::text[]) INTO owned
  FROM "HouseholdMember"
  WHERE "userId" = ANY(user_ids) AND "role" = 'owner';

  -- ORDER MATTERS FOR THE COUNTS, not only for the deletes. Every child is
  -- deleted before its parent, so each count is the number of rows this
  -- statement removed. Move the "Item" delete above the "ItemTag" delete and
  -- the ItemTag rows go by ON DELETE CASCADE instead, reporting 0. The same
  -- holds for "LocationMember" before "Location", and every household-scoped
  -- table before "Household": "householdId" is ON DELETE CASCADE on all of
  -- them, "HouseholdInvite" included.

  -- Logs, carts and stock have no household of their own. They go through
  -- their location, the same as in clearAllData.
  DELETE FROM "InventoryLog"
  WHERE "locationId" IN (SELECT "id" FROM "Location" WHERE "householdId" = ANY(owned));
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('inventoryLogs', c);

  DELETE FROM "CartItem"
  WHERE "cartId" IN (SELECT "id" FROM "Cart" WHERE "locationId" IN (SELECT "id" FROM "Location" WHERE "householdId" = ANY(owned)));
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('cartItems', c);

  DELETE FROM "Cart"
  WHERE "locationId" IN (SELECT "id" FROM "Location" WHERE "householdId" = ANY(owned));
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('carts', c);

  DELETE FROM "ItemTag"
  WHERE "itemId" IN (SELECT "id" FROM "Item" WHERE "householdId" = ANY(owned));
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('itemTags', c);

  DELETE FROM "ItemVendor"
  WHERE "itemId" IN (SELECT "id" FROM "Item" WHERE "householdId" = ANY(owned));
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('itemVendors', c);

  -- Through the recipe, the same path as clearAllData. It was through the
  -- item here until households H3a task 3.10.
  DELETE FROM "RecipeItem"
  WHERE "recipeId" IN (SELECT "id" FROM "Recipe" WHERE "householdId" = ANY(owned));
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('recipeItems', c);

  DELETE FROM "ItemStock"
  WHERE "locationId" IN (SELECT "id" FROM "Location" WHERE "householdId" = ANY(owned));
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('itemStocks', c);

  DELETE FROM "Item"
  WHERE "householdId" = ANY(owned);
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('items', c);

  -- Before "TagType": "Tag"."typeId" is NO ACTION, so a tag type cannot go
  -- while a tag names it.
  DELETE FROM "Tag"
  WHERE "householdId" = ANY(owned);
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('tags', c);

  DELETE FROM "TagType"
  WHERE "householdId" = ANY(owned);
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('tagTypes', c);

  DELETE FROM "Vendor"
  WHERE "householdId" = ANY(owned);
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('vendors', c);

  DELETE FROM "Recipe"
  WHERE "householdId" = ANY(owned);
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('recipes', c);

  DELETE FROM "Shelf"
  WHERE "householdId" = ANY(owned);
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('shelves', c);

  -- Every role row on the owned households' locations (anybody's), and the
  -- users' own role rows on any other location. "userId" is RESTRICT, so the
  -- "User" delete cannot run while one is left.
  DELETE FROM "LocationMember"
  WHERE "userId" = ANY(user_ids) OR "locationId" IN (SELECT "id" FROM "Location" WHERE "householdId" = ANY(owned));
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('locationMembers', c);

  -- Every preference row on the owned households' locations (anybody's), and
  -- the users' own rows on any other location (households H7b, task M.1).
  -- BEFORE "Location" and "User", for the count: both foreign keys are
  -- ON DELETE CASCADE, so after either delete the rows would be gone already
  -- and the count would read 0.
  DELETE FROM "LocationPreference"
  WHERE "userId" = ANY(user_ids) OR "locationId" IN (SELECT "id" FROM "Location" WHERE "householdId" = ANY(owned));
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('locationPreferences', c);

  DELETE FROM "Location"
  WHERE "householdId" = ANY(owned);
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('locations', c);

  -- Every invite of the owned households (anybody's), and the invites a
  -- listed user made in households they do not own (households H5b, task
  -- G.6). BEFORE "Household": "householdId" is ON DELETE CASCADE, so after
  -- the household delete the owned invites would be gone already and the
  -- count would read 0. BEFORE "User": "createdById" is RESTRICT (decision
  -- T26), so an invite the user made elsewhere would make the "User" delete
  -- fail. An invite the user only USED stays: "usedById" is SET NULL.
  DELETE FROM "HouseholdInvite"
  WHERE "householdId" = ANY(owned) OR "createdById" = ANY(user_ids);
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('householdInvites', c);

  -- Every activity row of the owned households (households H6, task J.1).
  -- BEFORE "Household", for the count. Only the owned households: a log row
  -- elsewhere that names the user stays with its household ("actorId" and
  -- "targetUserId" have no foreign key, decision T46).
  DELETE FROM "HouseholdActivity"
  WHERE "householdId" = ANY(owned);
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('householdActivities', c);

  -- Every offer of the owned households, and every offer TO a listed user
  -- anywhere (households H6b, task K.1). BEFORE "Household" and "User", for
  -- the counts: both foreign keys are ON DELETE CASCADE. BEFORE
  -- "HouseholdMember", so no member row goes while an offer still names its
  -- person. An offer a user MADE elsewhere stays: "fromUserId" has no
  -- foreign key.
  DELETE FROM "OwnershipOffer"
  WHERE "householdId" = ANY(owned) OR "toUserId" = ANY(user_ids);
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('ownershipOffers', c);

  -- Every member row of the owned households (anybody's), and the users' own
  -- member rows in households they do not own. "userId" is RESTRICT.
  DELETE FROM "HouseholdMember"
  WHERE "userId" = ANY(user_ids) OR "householdId" = ANY(owned);
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('householdMembers', c);

  -- "User"."activeHouseholdId" is SET NULL, so a person outside the list who
  -- still names one of these households keeps their row.
  DELETE FROM "Household"
  WHERE "id" = ANY(owned);
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('households', c);

  -- The "User" rows, LAST, after the two role tables and the invites, whose
  -- foreign keys to "User" are RESTRICT. The key is "id": the row IS the
  -- user.
  DELETE FROM "User"
  WHERE "id" = ANY(user_ids);
  GET DIAGNOSTICS c = ROW_COUNT;
  result := result || jsonb_build_object('users', c);

  RETURN result;
END;
$e2e_cleanup$;
`
