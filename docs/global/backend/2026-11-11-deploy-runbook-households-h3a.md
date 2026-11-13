# Deploy runbook — households H3a (two migrations, `isDefault` and six `userId` fields removed)

**Date written:** 2026-11-11
**Migrations:** `apps/server/prisma/migrations/20261104000000_add_households/migration.sql`
and `apps/server/prisma/migrations/20261111000000_drop_user_scope/migration.sql`
**Branch:** `feature/households-h3a`
**Plan:** [`../permissions/2026-11-04-households-plan-h3a.md`](../permissions/2026-11-04-households-plan-h3a.md) (task 3.16)
**Design:** [`../permissions/2026-10-04-households-design.md`](../permissions/2026-10-04-households-design.md)
**Models for this runbook:** [`2026-09-18-deploy-runbook-cart-rekey.md`](2026-09-18-deploy-runbook-cart-rekey.md),
[`2026-10-05-deploy-runbook-item-column-drop.md`](2026-10-05-deploy-runbook-item-column-drop.md),
[`2026-10-08-deploy-runbook-checkout-items-arg.md`](2026-10-08-deploy-runbook-checkout-items-arg.md)

**When this runbook runs: at the first checkpoint release, not when the H3a PR merges.**
Since 2026-11-12 the H3a PR merges into `develop`, which deploys nothing (see the households
plan, *How this plan is split*). This runbook runs when `develop` is merged into `main`. If
that release carries more migrations than these two (for example H3b's), the rehearsal in
section 3 must be run again on a fresh branch of production, with every new migration, and
this runbook extended or replaced. The rehearsal results below are from 2026-11-12 and prove
these two migrations against production as it was that day.

**Who does what.** "Owner" means ETBlue, the person with the Railway, Cloudflare, Neon and
Clerk dashboards. "Main session" means the Claude session that runs commands in the
worktree, and only with the owner's consent for each command that touches a database.

**Rule for every step: never paste a database connection string or a database hostname
into a chat, a commit, a document, or a screenshot.** Refer to the environment variable
names only: `DATABASE_URL`, `DIRECT_URL`, `PROD_COPY_DATABASE_URL`, `PROD_COPY_DIRECT_URL`.

**Where the results go.** Every `TBD after rehearsal` below is filled in by the main
session after the rehearsal in section 3. Every `TBD on deploy day` is filled in by the
owner or the main session on the day.

---

## 0. The order, on one page

| # | Step | Who | Section |
|---|---|---|---|
| 1 | Check that the live web build is from `8465406b` or later (#359) | owner | 2.1 |
| 2 | Rehearse both migrations on a fresh branch of production, and record the counts | main session, owner's consent | 3 |
| 3 | Take a Neon branch of production on deploy day. This is the rollback | owner | 4.1 |
| 4 | Turn off Railway's automatic deploy | owner | 4.2 |
| 5 | Merge `develop` into `main`. Wait for Cloudflare. Update every device | owner | 4.3 |
| 6 | Deploy the server on Railway. Watch the release log | owner | 4.4 |
| 7 | Check the database | owner or main session | 5 |
| 8 | The manual smoke test | owner | 6 |
| 9 | Turn Railway's automatic deploy back on | owner | 4.5 |

**The web goes first, the server second.** Section 1.3 says why. That is the reason for
step 4.

---

## 1. What changes, and what breaks if it goes wrong

### 1.1 The data

| Migration | What it does |
|---|---|
| `20261104000000_add_households` | Adds `Household`, `HouseholdMember`, `LocationMember` and `User.householdSetupAt`. Gives every `User` row a household and an `owner` row. Adds a `User` row named `'User'` for every `userId` in the data that has none. Adds a `'Home'` location for every user with no location. Fills a NULLABLE `householdId` on `Location` and the six catalog models. Makes each location's `userId` its `organizer`. Counts the references that cross households with `RAISE NOTICE` (step 8b) |
| `20261111000000_drop_user_scope` | Locks 18 tables. Re-runs the backfill for rows the old server wrote between the two migrations. Cleans up references that cross households (step 3, 14 kinds). Sets `householdId` `NOT NULL`. Drops `userId` from `Location` and the six catalog models, and drops `Location.isDefault` and its index |

Postgres runs each file in its own transaction. A raised error in one file leaves that
file's changes out. **But the two files are two transactions**: if the second fails, the
first stays applied. See section 7.

There is no `migrate down`. The rollback is a restore of the Neon branch from step 4.1, and
it loses every write made after that branch was taken.

### 1.2 The GraphQL schema: two removals that break an old browser bundle

This branch removes fields from the schema. A query that names a field the schema does not
have fails GraphQL **validation**, and the whole query errors, not only that field.

| Removed | Still selected by `main`'s web bundle? | Effect on an old bundle against the new server |
|---|---|---|
| `Location.isDefault` | **Yes.** `apps/web/src/apollo/operations/locations.graphql` on `origin/main`, lines 6, 17, 28 and 43 (`GetLocations`, `CreateLocation`, `UpdateLocation`, `ReorderLocations`), and `import.graphql` lines 206 and 217 (`BulkCreateLocations`, `BulkUpsertLocations`) | **Every location query and mutation fails.** `GetLocations` fails, so the active location cannot load, and cloud mode is unusable until the bundle is updated |
| Six `userId: String!` fields (`Item`, `TagType`, `Tag`, `Vendor`, `Recipe`, `Shelf`) | **No**, since `8465406b` (#359 step one) | none, if the live bundle is from `8465406b` or later. Section 2.1 checks this |
| `purgeUserData` | No. No web document names it | none |

Checked on 2026-11-11 with:

```bash
git fetch origin main
git show origin/main:apps/web/src/apollo/operations/locations.graphql | grep -n isDefault   # 6, 17, 28, 43
git show origin/main:apps/web/src/apollo/operations/import.graphql | grep -n isDefault      # 206, 217
git merge-base --is-ancestor 8465406b origin/main && echo "8465406b is on main"
```

Re-run them before the deploy. If `origin/main` has moved, the line numbers may move too.

### 1.3 Which goes first: the web. Why

The server (Railway) and the web (Cloudflare Pages) deploy separately. Both start when the
PR merges to `main`, and nothing decides which one finishes first.

| Order | What is live in the gap | Effect |
|---|---|---|
| **Server first** (new server, old bundle) | the old bundle selects `Location.isDefault` | **every location query fails. Cloud mode is unusable** until the device has the new bundle |
| **Web first** (new bundle, old server, old database) | the new bundle selects only fields the old server has | **the app works.** Three small things, listed below |

This branch's web bundle selects no field the old server lacks, except in the new
`GetHousehold` query and `RenameHousehold` mutation. `git diff origin/main HEAD --
apps/web/src/apollo/operations/` shows only three changes: `isDefault` removed from six
documents, and the new `household.graphql`. The new `x-app-language` request header is safe
too: the old server's `cors()` sets no `allowedHeaders`, so it accepts any request header.

What the new bundle does against the OLD server, during the gap:

- The 🏠 label shows "My data" instead of the household name. `GetHousehold` fails (no such
  field yet), and the label falls back.
- Renaming the household fails.
- Deleting the location that is still `isDefault` on the old server is refused with an
  error. The new bundle shows Delete on every location.

None of these writes bad data. **So the web goes first.**

**Two more reasons the web must go first:**

- **The app is a PWA with `registerType: 'prompt'`** (`apps/web/vite.config.ts`). A device
  keeps its cached bundle until the person accepts the update prompt. So "Cloudflare has
  finished" does not mean "the device has the new bundle". Each device must accept the
  prompt BEFORE the server deploys. Otherwise that device is in the "server first" row
  above until it does.
- **If a release command fails, the old server keeps serving** (Railway does not switch
  traffic). With the web first, a failed migration leaves "new bundle + old server", which
  works. With the server first, nothing is lost either, but the order is only safe if you
  can control it.

**How long the gap may be.** With the web first, the gap is safe, so it may last as long as
you need to update the devices. Keep it short anyway, under an hour: during the gap, a new
account still gets "My Home" from the old server, and a household cannot be renamed. Do not
import backups during the gap.

**What still breaks after the server deploys:** any device or tab that did NOT take the new
bundle. A Cloudflare Pages **preview** built before this branch is frozen on the old bundle
and points at the production API, so it stays broken. Rebuild it or ignore it.

---

## 2. Before the deploy day

### 2.1 Check the live web build is from `8465406b` or later (#359)

**Owner.** This is the first step, before anything else (decision H11).

1. Open the Cloudflare Pages dashboard, the production deployment of the web app. Read the
   commit SHA it was built from.
2. Run:

   ```bash
   git merge-base --is-ancestor 8465406b <live-sha> && echo "OK: the live bundle selects no userId" || echo "STOP: the live bundle still selects userId"
   ```

3. **If it says STOP, do not go on.** The six `userId` fields would break the live bundle
   too. Redeploy the web from a commit that contains `8465406b` first.

Result: `TBD on deploy day` (live SHA, OK or STOP).

### 2.2 Count the devices

**Owner.** Write down every browser and every home-screen PWA signed into **cloud** mode.
Section 4.3 visits each one. Local-mode devices do not matter: local mode does not call
GraphQL.

Result: `TBD on deploy day`.

---

## 3. The rehearsal on a fresh branch of production

**Main session, with the owner's consent.** The owner creates the Neon branch. The main
session runs the commands. The SQL can also be run by the owner in the Neon SQL Editor,
with the rehearsal branch selected.

**Never point `verify:migration` at this branch.** It drops the schema. The script refuses
the `PROD_COPY_*` variables since #333, but do not rely on that.

**Use a fresh branch.** A branch that has had a migration applied cannot rehearse it again.

### 3.1 Make the branch and prove the env override

1. **Owner:** in the Neon console, create a branch of the production branch, at the current
   time. Name it `prod-rehearsal-h3a-<date>`.
2. **Owner:** put its pooled and direct connection strings into `PROD_COPY_DATABASE_URL` and
   `PROD_COPY_DIRECT_URL` in `apps/server/.env`. Do not paste them anywhere else.
3. **Main session:** prove the override is real BEFORE any write. Run `migrate status` twice,
   once with the override and once without. The two must name **different hosts**. Do not
   copy the host into the record; write "different" or "same".

   ```bash
   cd apps/server
   set -a; . ./.env; set +a
   DATABASE_URL="$PROD_COPY_DATABASE_URL" DIRECT_URL="$PROD_COPY_DIRECT_URL" pnpm exec prisma migrate status
   pnpm exec prisma migrate status
   ```

4. The run with the override must list **exactly two** pending migrations:
   `20261104000000_add_households` and `20261111000000_drop_user_scope`. If it lists more,
   production is behind `main`. Stop and find out why first.

Result (2026-11-12): hosts **different**. Pending list: exactly `20261104000000_add_households` and `20261111000000_drop_user_scope`.

### 3.2 Before any migration: who will get a placeholder name or a "Home"

Run on the rehearsal branch, before 3.3. Keep the output: 3.4 compares against it.

```sql
-- A. userIds in the data with no "User" row. add_households step 2 gives each a "User"
--    row named 'User'. These people get "User's Household".
SELECT u."userId"
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
WHERE NOT EXISTS (SELECT 1 FROM "User" x WHERE x."id" = u."userId")
ORDER BY 1;

-- B. "User" rows with no location. add_households step 4 gives each a 'Home'.
--    (A userId from list A also has no location if it has no "Location" row; it is
--    counted after 3.3, because its "User" row does not exist yet.)
SELECT u."id", u."displayName"
FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "Location" l WHERE l."userId" = u."id")
ORDER BY 1;

-- C. Row counts, to compare after each migration.
SELECT 'User' AS t, count(*) FROM "User"
UNION ALL SELECT 'Location', count(*) FROM "Location"
UNION ALL SELECT 'Item', count(*) FROM "Item"
UNION ALL SELECT 'Tag', count(*) FROM "Tag"
UNION ALL SELECT 'TagType', count(*) FROM "TagType"
UNION ALL SELECT 'Vendor', count(*) FROM "Vendor"
UNION ALL SELECT 'Recipe', count(*) FROM "Recipe"
UNION ALL SELECT 'Shelf', count(*) FROM "Shelf"
UNION ALL SELECT 'ItemStock', count(*) FROM "ItemStock"
UNION ALL SELECT 'Cart', count(*) FROM "Cart"
UNION ALL SELECT 'CartItem', count(*) FROM "CartItem"
UNION ALL SELECT 'InventoryLog', count(*) FROM "InventoryLog"
UNION ALL SELECT 'ItemTag', count(*) FROM "ItemTag"
UNION ALL SELECT 'ItemVendor', count(*) FROM "ItemVendor"
UNION ALL SELECT 'RecipeItem', count(*) FROM "RecipeItem";
```

Results (2026-11-12):

- **A: 1 userId.** A second account with 1 location, 1 cart, no items and no logs. Its last row is from 2026-10-03, before H2 added the `User` row, so it never signed in after H2. It gets a `User` row named 'User' and "User's Household".
- **B: 0 rows.** The one `User` row (the owner's account) already has 4 locations.
- **C:** `User` 1, `Location` 5, `Item` 186, `Tag` 61, `TagType` 3, `Vendor` 23, `Recipe` 9, `Shelf` 13, `ItemStock` 189, `Cart` 42, `CartItem` 7, `InventoryLog` 1531, `ItemTag` 493, `ItemVendor` 390, `RecipeItem` 74.

### 3.3 Apply `add_households` ONLY

`prisma migrate deploy` applies every pending migration. To stop between the two, park
`drop_user_scope` outside `prisma/migrations/` for this one command, the same way
`verify-migration.ts` does. `apps/server/.migration-under-test/` is in `.gitignore`.

```bash
cd apps/server
mkdir -p .migration-under-test
mv prisma/migrations/20261111000000_drop_user_scope .migration-under-test/
DATABASE_URL="$PROD_COPY_DATABASE_URL" DIRECT_URL="$PROD_COPY_DIRECT_URL" pnpm exec prisma migrate deploy
mv .migration-under-test/20261111000000_drop_user_scope prisma/migrations/
git status --short prisma/        # must print nothing
```

**Put the folder back even if the deploy fails.** Check with `git status`. A missing folder
on a later commit would be a missing migration.

Write down whether the `RAISE NOTICE` lines of step 8b appear in this output. If they do,
that answers item 9 of the plan for a bare `migrate deploy`.

Result (2026-11-12): exit 0. Notices printed: **no**. The output shows no `NOTICE` line. So the 3.5 count queries are the only record of what step 3 changes.

### 3.4 After `add_households`: the record queries

Run on the rehearsal branch. Each has its expected answer.

```sql
-- 1. users = households = owner rows. All three equal.
SELECT (SELECT count(*) FROM "User") AS users,
       (SELECT count(*) FROM "Household") AS households,
       (SELECT count(*) FROM "HouseholdMember" WHERE "role" = 'owner') AS owner_rows;

-- 2. No null "householdId" on the seven tables. Expect 0.
SELECT (SELECT count(*) FROM "Location" WHERE "householdId" IS NULL)
     + (SELECT count(*) FROM "Item"     WHERE "householdId" IS NULL)
     + (SELECT count(*) FROM "Tag"      WHERE "householdId" IS NULL)
     + (SELECT count(*) FROM "TagType"  WHERE "householdId" IS NULL)
     + (SELECT count(*) FROM "Vendor"   WHERE "householdId" IS NULL)
     + (SELECT count(*) FROM "Recipe"   WHERE "householdId" IS NULL)
     + (SELECT count(*) FROM "Shelf"    WHERE "householdId" IS NULL) AS null_household_rows;

-- 3. Every location has an organizer. Expect 0.
SELECT count(*) AS locations_without_organizer
FROM "Location" l
WHERE NOT EXISTS (
  SELECT 1 FROM "LocationMember" m WHERE m."locationId" = l."id" AND m."role" = 'organizer'
);

-- 4. The 'Home' locations, and for whom. Compare with 3.2 B, plus any person from
--    3.2 A who had no location. A 'Home' that is not on that list was there before.
SELECT l."id", l."userId", u."displayName", l."isDefault", l."createdAt"
FROM "Location" l JOIN "User" u ON u."id" = l."userId"
WHERE l."name" = 'Home'
ORDER BY l."createdAt";

-- 5. "User" rows named 'User'. The ones from 3.2 A were made by the migration. Any
--    other was made by ensureUser when Clerk did not answer (FALLBACK_DISPLAY_NAME in
--    apps/server/src/lib/userRow.ts).
SELECT "id", "createdAt", "deletedAt" FROM "User" WHERE "displayName" = 'User' ORDER BY 1;

-- 6. Household names longer than 100 UTF-16 code units (the web's limit, and the
--    rename limit). add_households has no cap. Such an owner sees an error on the name
--    card until they shorten the name. Code points above U+FFFF count 2, like
--    JavaScript String.length.
SELECT h."id", h."name", n.len
FROM "Household" h
CROSS JOIN LATERAL (
  SELECT sum(CASE WHEN ascii(c) > 65535 THEN 2 ELSE 1 END) AS len
  FROM regexp_split_to_table(h."name", '') AS c
) n
WHERE n.len > 100;
```

| # | Expected | Result |
|---|---|---|
| 1 | three equal numbers | 2, 2, 2 |
| 2 | 0 | 0 |
| 3 | 0 | 0 |
| 4 | one row per person in 3.2 B (and 3.2 A with no location) | 0 rows. 3.2 B was empty, and the 3.2 A account already had a location |
| 5 | the people in 3.2 A, plus any fallback rows | 1 row: the 3.2 A account, `deletedAt` null. No fallback rows |
| 6 | probably 0 rows | 0 rows |

**About the people in query 5.** They get "User's Household" until Clerk sends
`user.updated` or they rename it. Their `deletedAt` stays null even if their Clerk account
is gone, because no `user.deleted` event will come for an account Clerk already deleted.
Tell the owner who they are.

### 3.5 After `add_households`, before `drop_user_scope`: what the cleanup will change

**`RAISE NOTICE` does not reach the output in every setup** (it did not in
`verify-migration.ts` on 2026-11-11). So count with plain queries now. Each query below
counts exactly the rows one statement of `drop_user_scope` step 3 changes. Statement names
are the ones in the migration's comments.

**When these counts are exact.** They read the database after `add_households`. On the
rehearsal branch nothing writes between the two migrations, so `drop_user_scope` step 2
changes nothing and these are the numbers step 3 will change. In production, the old
server may write a few rows between the two migrations, so the real numbers can differ by
those rows.

```sql
-- 3a. Tag types copied: one per (household of the tag, type), where the type is in
--     another household.
SELECT count(*) AS tag_type_copies FROM (
  SELECT DISTINCT t."householdId", t."typeId"
  FROM "Tag" t JOIN "TagType" x ON x."id" = t."typeId"
  WHERE t."householdId" <> x."householdId"
) p;

-- 3a. Tags moved to a copy of their type.
SELECT count(*) AS tags_moved_to_copy
FROM "Tag" t JOIN "TagType" x ON x."id" = t."typeId"
WHERE t."householdId" <> x."householdId";

-- 3b. Tags that lose a parent in another household.
SELECT count(*) AS tags_lose_parent
FROM "Tag" t JOIN "Tag" p ON p."id" = t."parentId"
WHERE t."householdId" <> p."householdId";

-- 3c. Join rows deleted.
SELECT count(*) AS item_tag_deleted
FROM "ItemTag" j JOIN "Item" i ON i."id" = j."itemId" JOIN "Tag" t ON t."id" = j."tagId"
WHERE i."householdId" <> t."householdId";

SELECT count(*) AS item_vendor_deleted
FROM "ItemVendor" j JOIN "Item" i ON i."id" = j."itemId" JOIN "Vendor" v ON v."id" = j."vendorId"
WHERE i."householdId" <> v."householdId";

SELECT count(*) AS recipe_item_deleted
FROM "RecipeItem" j JOIN "Recipe" rc ON rc."id" = j."recipeId" JOIN "Item" i ON i."id" = j."itemId"
WHERE rc."householdId" <> i."householdId";

-- 3d. Shelves that lose item ids, and how many ids in total.
SELECT count(DISTINCT s."id") AS shelves_lose_item_ids, count(*) AS item_ids_removed
FROM "Shelf" s, unnest(s."itemIds") AS u(x)
JOIN "Item" i ON i."id" = u.x
WHERE i."householdId" <> s."householdId";

-- 3e. Shelves that lose filter ids, one query per array. Only a value that is a JSON
--     array counts, the same as the migration.
SELECT count(DISTINCT s."id") AS shelves_lose_filter_tag_ids
FROM "Shelf" s
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(s."filterConfig" -> 'tagIds') = 'array' THEN s."filterConfig" -> 'tagIds' ELSE '[]'::jsonb END
) AS u(x)
JOIN "Tag" t ON t."id" = u.x
WHERE t."householdId" <> s."householdId";

SELECT count(DISTINCT s."id") AS shelves_lose_filter_vendor_ids
FROM "Shelf" s
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(s."filterConfig" -> 'vendorIds') = 'array' THEN s."filterConfig" -> 'vendorIds' ELSE '[]'::jsonb END
) AS u(x)
JOIN "Vendor" v ON v."id" = u.x
WHERE v."householdId" <> s."householdId";

SELECT count(DISTINCT s."id") AS shelves_lose_filter_recipe_ids
FROM "Shelf" s
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(s."filterConfig" -> 'recipeIds') = 'array' THEN s."filterConfig" -> 'recipeIds' ELSE '[]'::jsonb END
) AS u(x)
JOIN "Recipe" rc ON rc."id" = u.x
WHERE rc."householdId" <> s."householdId";

-- 3f. Stock-side rows deleted: the item is in another household than the location
--     (for CartItem, the cart's location).
SELECT count(*) AS item_stock_deleted
FROM "ItemStock" s JOIN "Item" i ON i."id" = s."itemId" JOIN "Location" l ON l."id" = s."locationId"
WHERE i."householdId" <> l."householdId";

SELECT count(*) AS cart_item_deleted
FROM "CartItem" ci
JOIN "Item" i ON i."id" = ci."itemId"
JOIN "Cart" c ON c."id" = ci."cartId"
JOIN "Location" l ON l."id" = c."locationId"
WHERE i."householdId" <> l."householdId";

SELECT count(*) AS inventory_log_deleted
FROM "InventoryLog" g JOIN "Item" i ON i."id" = g."itemId" JOIN "Location" l ON l."id" = g."locationId"
WHERE i."householdId" <> l."householdId";
```

| Step | Kind | Expected | Result |
|---|---|---|---|
| 3a | tag types copied | probably 0 | 0 |
| 3a | tags moved to a copy | probably 0 | 0 |
| 3b | tags that lose a parent | probably 0 | 0 |
| 3c | `ItemTag` rows deleted | probably 0 | 0 |
| 3c | `ItemVendor` rows deleted | probably 0 | 0 |
| 3c | `RecipeItem` rows deleted | probably 0 | 0 |
| 3d | shelves that lose item ids (ids removed) | probably 0 | 0 (0) |
| 3e | shelves that lose filter tag ids | probably 0 | 0 |
| 3e | shelves that lose filter vendor ids | probably 0 | 0 |
| 3e | shelves that lose filter recipe ids | probably 0 | 0 |
| 3f | `ItemStock` rows deleted | probably 0 | 0 |
| 3f | `CartItem` rows deleted | probably 0 | 0 |
| 3f | `InventoryLog` rows deleted | probably 0 | 0 |

"Probably 0" because a person could only make such a row by calling the API by hand with a
guessed id. **Any count above 0 is production data the cleanup will change. Tell the owner
before the deploy**, with the rows behind the count (replace `count(*)` with the columns).

### 3.6 Apply `drop_user_scope`, then check

```bash
cd apps/server
DATABASE_URL="$PROD_COPY_DATABASE_URL" DIRECT_URL="$PROD_COPY_DIRECT_URL" pnpm exec prisma migrate deploy
DATABASE_URL="$PROD_COPY_DATABASE_URL" DIRECT_URL="$PROD_COPY_DIRECT_URL" pnpm exec prisma migrate status
pnpm exec prisma migrate diff --from-url "$PROD_COPY_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

| Check | Expected | Result |
|---|---|---|
| `migrate deploy` | exit 0 | exit 0 |
| step 3 notices in the output | write down: printed or not | not printed |
| `migrate status` | "Database schema is up to date!" | "Database schema is up to date!" |
| `migrate diff … --exit-code` | exit 0 (no drift) | exit 0, "No difference detected." |
| every query in 3.5, run again | all 0 | all 0 |
| query C of 3.2, run again | each table's count went down by exactly its 3.5 number, `TagType` went UP by the copies, every other table is unchanged | every table unchanged from 3.2 C, except `User` 1 → 2 (the 3.2 A account, added by `add_households`) |
| queries 1 and 3 of 3.4, run again | the same as before | the same: 2, 2, 2 and 0 |

The 3.5 queries do not name `userId`, so they still run after `drop_user_scope`. Query 4 of
3.4 does name it, so do not re-run that one.

### 3.7 A `replace` import with name-only conflicts

**Not a production-data check.** It tests code, so run it on the local stack (dev server
and dev database), in cloud mode, after the migrations are applied there. From the review
of task 3.9.

1. In cloud, create an item "Milk", a tag "Dairy", a vendor "Costco" and a recipe "Soup".
2. In local mode, create the same four names (so they get DIFFERENT ids), and a new shelf
   that names all four (item in its list; tag, vendor and recipe in its filter).
3. Export the local data. Import the file into cloud with the `replace` strategy.
4. Check: the new shelf in cloud keeps every one of those four ids (`03e32094` fixed this).
5. Also put "Milk" in a local cart before step 3, and write down whether the cart item
   survives in cloud. The plan's *Known gaps* says it may be skipped.

Result: `TBD after rehearsal`.

### 3.8 After the rehearsal

**Owner:** delete the rehearsal branch in the Neon console, and clear
`PROD_COPY_DATABASE_URL` and `PROD_COPY_DIRECT_URL` in `apps/server/.env`.

---

## 4. The deploy

### 4.1 Take a Neon branch of production. This is the rollback

**Owner. Do this on the day, before the merge.**

1. In the Neon console, create a branch of the production branch, at the current time.
2. Name it `prod-before-households-h3a-<date>`. Write the name down.

Do not skip this because the rehearsal passed. The rehearsal ran on other rows, on another
day.

Result: `TBD on deploy day` (branch name).

### 4.2 Turn off Railway's automatic deploy

**Owner.** Railway deploys `main` automatically ("Auto deploys when pushed to GitHub"), and
its release command `prisma migrate deploy` (`railway.toml`) runs both migrations. To make
the web go first (section 1.3), stop that for one merge:

1. Open the Railway dashboard, the server service, its settings.
2. Turn off the automatic deploy from `main`.
3. Check: the setting shows it off.

**If you cannot turn it off**, you cannot control the order. Then only merge when nobody is
using the app, and after the merge, update every device (4.3) as soon as Cloudflare is live.
Until a device updates, cloud mode does not work there.

### 4.3 Merge `develop` into `main`. Wait for Cloudflare. Update every device

**Owner.**

1. Pick a time when nobody uses the app. Tell anyone else to stop.
2. Merge the release PR (`develop` into `main`).
3. Wait for the Cloudflare Pages production build to finish. Read its commit SHA, and check
   it is the merge commit or later.
4. On **every device** from 2.2: open the app, wait for the update prompt, and **accept
   it**. Then reload. If no prompt comes, reload once and wait a few seconds. Last resort:
   DevTools console, `window.__unregisterServiceWorkers()`, then reload.
5. Check on each device that it has the new bundle. Open the browser's network tab, reload
   the pantry, and look at the `GetLocations` request body: it must NOT contain `isDefault`.
   The 🏠 label shows "My data" at this point. That is expected: the old server has no
   `household` field yet.

Result: `TBD on deploy day` (Cloudflare SHA; each device updated).

### 4.4 Deploy the server on Railway. Watch the release log

**Owner.**

1. In the Railway dashboard, deploy the latest commit of `main` on the server service.
2. Read the release command's output. Expect, in this order:

   ```
   Applying migration `20261104000000_add_households`
   Applying migration `20261111000000_drop_user_scope`
   ```

3. Wait until Railway reports the new deployment as active.
4. Hard reload the app on one device (Cmd+Shift+R on macOS). The 🏠 label now shows the
   household name.

**The build now starts the server once** (added 2026-11-13, `chore/build-shared-types`). If
`main` contains that branch, `pnpm --filter server build` ends with
`node scripts/check-start.mjs`. It starts the built `dist/index.js` on port 0 with no real
database, and fails the build if the server does not print `Server ready at` within 20 s.
Nobody has run this step on Railway yet. If the build fails there:

- The build runs before the release command, so no migration is applied.
- The old server keeps serving.
- Read the build log. A failed start prints `start check FAILED:` and the server's own output
  below it. Stop and decide with the main session before you try again.

**The migration can wait on a lock** (plan item 10). `drop_user_scope` starts with
`LOCK TABLE … IN EXCLUSIVE MODE` on 18 tables, and sets no `lock_timeout`. While the
release command runs, the OLD server is still serving. So:

- If an old-server transaction is open on one of the 18 tables, the migration waits for it.
- If an old-server transaction holds a lock the migration wants, and wants a lock the
  migration holds, that is a deadlock. Postgres cancels one side. If it cancels the
  migration, the release command fails, nothing of `drop_user_scope` is applied, and you
  can run the deploy again (section 7.1).

With nobody using the app, neither should happen. If the release command seems stuck for
more than 2 minutes, run this in the Neon SQL Editor on the production branch, and read
which sessions wait (`wait_event_type = 'Lock'`) and how old each transaction is:

```sql
SELECT pid, state, wait_event_type, wait_event,
       now() - xact_start AS transaction_age,
       left(query, 80) AS query
FROM pg_stat_activity
WHERE datname = current_database() AND state <> 'idle'
ORDER BY xact_start;
```

Then decide with the main session. Cancelling the Railway deploy drops the migration's
connection, so its transaction rolls back; then follow section 7.1.

Result: `TBD on deploy day` (both lines seen; time taken).

### 4.5 Turn Railway's automatic deploy back on

**Owner.** After section 5 passes. Check the setting shows it on.

---

## 5. How to tell it worked

**Owner or main session**, in the Neon SQL Editor on the production branch.

```sql
-- 1. Both migrations finished, none rolled back.
SELECT "migration_name", "finished_at", "rolled_back_at"
FROM "_prisma_migrations"
ORDER BY "started_at" DESC
LIMIT 3;

-- 2. users = households = owner rows.
SELECT (SELECT count(*) FROM "User") AS users,
       (SELECT count(*) FROM "Household") AS households,
       (SELECT count(*) FROM "HouseholdMember" WHERE "role" = 'owner') AS owner_rows;

-- 3. Every location has an organizer. Expect 0.
SELECT count(*) AS locations_without_organizer
FROM "Location" l
WHERE NOT EXISTS (
  SELECT 1 FROM "LocationMember" m WHERE m."locationId" = l."id" AND m."role" = 'organizer'
);

-- 4. Every household has at least one location. Expect 0.
SELECT count(*) AS households_without_location
FROM "Household" h
WHERE NOT EXISTS (SELECT 1 FROM "Location" l WHERE l."householdId" = h."id");

-- 5. The columns are gone. Expect 0 rows.
SELECT table_name::text, column_name::text
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((column_name = 'userId' AND table_name IN ('Location','Item','Tag','TagType','Vendor','Recipe','Shelf'))
    OR (column_name = 'isDefault' AND table_name = 'Location'));
```

Then run every query of section 3.5 again. Each must be 0.

| Check | Expected | Result |
|---|---|---|
| 1 | both migrations have `finished_at`, no `rolled_back_at` | `TBD on deploy day` |
| 2 | three equal numbers | `TBD on deploy day` |
| 3 | 0 | `TBD on deploy day` |
| 4 | 0 | `TBD on deploy day` |
| 5 | 0 rows | `TBD on deploy day` |
| 3.5 again | all 0 | `TBD on deploy day` |

---

## 6. The manual smoke test

**Owner**, in a real browser, signed in to the production account, after a hard reload.

| # | Action | What must happen |
|---|---|---|
| 1 | Open the pantry | It looks the same as before the deploy. Same locations, same items, same numbers. No error |
| 2 | Look at the 🏠 item in Settings | It shows the household name, for example "ET's Household", not "My data" |
| 3 | Open `/settings/household` and rename the household | The new name shows on the page and on the 🏠 label after a reload |
| 4 | Create a location, rename it, then delete it | Each step works |
| 5 | Delete locations until one is left, then try to delete the last one | Refused with a message. The location stays. (Only do this with throwaway locations you created in step 4.) |
| 6 | Add an item to a cart and check out | It succeeds. The stock goes up. The item's log shows the purchase at the location you were viewing |
| 7 | Switch to a second location and check its cart | Only that location's cart is shown |

Results: `TBD on deploy day`.

---

## 7. If something is wrong

### 7.1 A release command failed

Railway did not switch traffic, so the old server is still serving. The two migrations are
two transactions, so check which one failed:

| Which failed | State of the database | Is the app OK meanwhile? |
|---|---|---|
| `add_households` | unchanged | yes: old server, old schema |
| `drop_user_scope` | `add_households` is applied; `drop_user_scope` is not | yes: the old server still writes `userId`, and `householdId` is nullable. This is the "between the two deploys" state the design planned for (decision H16) |

1. Read the error. The guards name what they found. For example
   `drop_user_scope: N row(s) have no household, because their userId is in no household`
   lists the rows and their `userId`.
2. If Prisma left the migration in a failed state, it blocks every later deploy. Mark it
   rolled back, against production, with `DATABASE_URL` and `DIRECT_URL` set to production:

   ```bash
   pnpm --filter server exec prisma migrate resolve --rolled-back 20261111000000_drop_user_scope
   ```

   (or `20261104000000_add_households`, whichever failed). Use `--rolled-back`, not
   `--applied`: Postgres rolled the failed file back, so it left no partial changes.
3. Fix the cause, then deploy again. A re-run of `drop_user_scope` is safe: its step 2 adds
   only what is missing.

### 7.2 Full rollback: restore from the branch of 4.1

Use this only when the data is wrong and cannot be repaired by hand. **It loses every write
made after the branch was taken.**

1. In the Neon console, restore the production branch from
   `prod-before-households-h3a-<date>`, or point production's `DATABASE_URL` / `DIRECT_URL`
   at that branch.
2. On Railway, deploy the **previous** server commit, so the code matches the restored
   schema. Turn off the automatic deploy first, or the next push re-applies the migrations.
3. The new web bundle works with the old server (section 1.3), so the web can stay. To be
   safe, redeploy the previous web commit on Cloudflare Pages too.
4. Tell the user what window of work was lost.

---

## 8. Left open on purpose

These are known and accepted for H3a. None blocks the deploy.

| Item | Why it is open |
|---|---|
| `renameHousehold` has a race with H6's hand-over | It reads the caller's role, then runs one `UPDATE` with no `lockHousehold`. An owner who hands the household over at the same moment could rename it once more. Nobody can hand a household over before H6. H6 decides whether this matters. Nothing to prove on Postgres in H3a (plan, task 3.13 Done note) |
| `clearAllData` checks role `owner` before its transaction | Nobody can stop being the owner before H6. H6 must move the check inside the transaction, after `lockHousehold` (plan, *Owed to H6*) |
| The household lock is proved only by `verify-migration.ts` | `assertHouseholdLock` (two deletes at once; `clearAllData` with `deleteLocation`). Run on the test database on 2026-11-12: exit 0, both cases pass (in each, the second transaction was seen waiting). Proved by mutation the same day: with `lockHouseholdCopy` removed from `deleteLocationBody`, case 1 fails with "was never seen blocked", and case 2 (run with case 1 skipped) fails with `P2025` on `tx.location.delete` |
| No `lock_timeout` on `drop_user_scope` | See 4.4. A cancelled migration fails cleanly and can be run again |
| Names over 100 code units | `add_households` and `drop_user_scope` step 2b do not cap names. The name card shows an error and the owner can shorten it. Count in 3.4 query 6 |
| Shared carts | H3b. Until H5 every household has one person, so the `userId` filters on carts still give the right answer |

---

## Where this file lives, and why

In `docs/global/backend/`, beside the other deploy runbooks and
[`2026-04-13-deployment-troubleshooting.md`](2026-04-13-deployment-troubleshooting.md). A
person who opens a runbook during a deploy looks for deploy documents, not for a feature
folder.
