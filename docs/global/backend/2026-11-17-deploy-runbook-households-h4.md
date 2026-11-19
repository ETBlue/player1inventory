# Deploy runbook — households H4 (import and export, one new query, no migration)

**Date written:** 2026-11-17
**Migration:** none
**Branch:** `feature/households-h4`. Merged into `develop` 2026-11-17 (#382, merge `bf87e839`). Not deployed
**Plan:** [`../permissions/2026-11-16-households-plan-h4.md`](../permissions/2026-11-16-households-plan-h4.md) (task E.7, decision T9)
**Design:** [`../permissions/2026-10-04-households-design.md`](../permissions/2026-10-04-households-design.md), section *Import and export*
**Runs with:** the H3a, H3b and H3c-1 runbooks in this folder, when H4 goes out at the same checkpoint release

## Why this is a separate file

H4 has **no migration and no new setting**. Its one deploy rule is about ORDER, and that rule
is the opposite of H3a's:

| Phase | Which part must be live first | Why |
|---|---|---|
| H3a | the **web** | `main`'s web bundle selects `Location.isDefault`, which H3a's server removes |
| H4 | the **server** | H4's web bundle calls the new query `importCheck`, which an older server does not have |

Putting H4's steps inside the H3a file would hide that the two rules point in opposite
directions. Section 2 says which rule wins when both phases go out together.

**Rule for every step: never paste the Railway hostname, a database connection string, a
database hostname or a secret into a chat, a commit, a document or a screenshot.**

**Who does what:** "Owner" is ETBlue. "Main session" is the Claude session in the worktree.
The main session runs the SQL in section 3 only with the owner's consent, and only on a
branch of production made for the rehearsal. **Nobody runs SQL while writing this file.**
The results below are `TBD`.

---

## What the user gets

Once H4 is merged **and deployed**:

- Copying local data into cloud asks "Import into which location?". The household's first
  location is selected, and **New location** is offered.
- An import that names rows of another household is refused before anything is written. The
  message says "another household" and "Nothing was imported", and both are true.
- A manager sees only "Skip conflicts" and "Replace matches". A household member cannot
  import. Only the owner sees "Clear & import".
- A location in the file where the importer cannot edit is skipped, and the card names it.
- Copying cloud data to local mode puts the ACTIVE location into local "My Home".
- After restoring a cloud backup into a new household, the user is moved to the backup's
  first location instead of an empty "Home" (decision O9).

Until H5 (invites) every person is alone in their household, so the role gate and the skipped
locations cannot happen to a real user yet.

## What the developer gets

- One read-only SQL block to run before the release (section 3), with a clear stop rule.
- One table (section 4) that says what each mix of old and new web and server does.
- Cost: one more ordering rule to remember. It does not fit with H3a's rule, and section 2
  says how to live with both.

---

## 0. The order, on one page (H4 steps only)

| # | Step | Who | Section |
|---|---|---|---|
| 1 | Run the read-only SQL on the rehearsal branch, and record the counts | main session, owner's consent | 3 |
| 2 | If a count is not 0: stop, and plan a data fix with the owner | owner | 3 |
| 3 | Deploy in the order section 2 gives | owner | 2 |
| 4 | Do not import or copy data between the two deploys | owner | 4 |
| 5 | The checks after the deploy | owner | 5 |

---

## 1. What changes

| Part | What is new |
|---|---|
| Database | nothing. **No migration** |
| Server env, web build env | nothing |
| GraphQL schema | one new query, `importCheck(ids: ImportCheckInput!, forClear: Boolean): ImportCheck!` (`apps/server/src/schema/import.graphql`). No field is removed. `InventoryLogInput.locationId` stays optional; only its comment changed |
| Server behaviour | every one of the 22 bulk import mutations asks the household role `manager` first. A log with no location, and a cart id with no `:`, are refused with `BAD_USER_INPUT`. A location id `'local'` or with a `:` is refused. A location, a stored row and an item must all be in the target household (#381). `createVendor` checks its location is in the household. The five reads behind the export (`locations`, `inventoryLogs`, `allCarts`, `allCartItems`, `allItemStocks`) return the active household only |
| Web behaviour | `importCheck` runs before the first write (and before `clearAllData`). The "Import into which location?" dialog. A role-aware import card. A new read, `ItemStockIdsAtLocation`, which uses the existing `itemStocks(locationId:)` field, so it needs nothing new from the server |

---

## 2. Which goes first

### 2.1 H4 alone (a checkpoint release after the one that carries H3a)

**The server goes first, then the web** (decision T9).

1. Deploy the server on Railway and wait until it is live.
2. Then merge `develop` into `main`, so Cloudflare builds the new web.
3. Reload every device and accept the update prompt.

With the server first, the gap is "old web, new server". Section 4 shows that the old web
still works there, except for two rare import cases. With the web first, the gap is "new web,
old server", and every cloud import fails until the server is live.

### 2.2 H4 in the same checkpoint release as H3a (the plan today)

> **Replaced on 2026-11-17 (owner decision, option 4): the server goes FIRST for the whole
> households release.** The server now keeps the fields `main`'s old bundle needs for one
> release, so an old bundle works on the new server. See section 8.3. The text below is the
> reasoning before that decision.

**Follow H3a's order: the web first, then the server.** H3a's reason is stronger. With the
server first, every location query of an old bundle fails, and cloud mode is unusable. With
the web first, only the import fails, and it fails before it writes anything (section 4,
row "new web, old server").

So during H3a's gap, **cloud import and the local → cloud copy do not work**. The H3a
runbook already says "Do not import backups during the gap". That rule now covers the
local → cloud copy too. Keep the gap short, as H3a 1.3 says.

---

## 3. Before the deploy: read-only SQL on the rehearsal branch

**Main session, with the owner's consent, on the rehearsal branch only** (the branch of
production made for H3a 3, or a fresh one if H4 goes out alone). Every statement is a
`SELECT`. Run them AFTER the H3a and H3b migrations have been applied on that branch, because
H4's server runs on that schema.

```sql
-- H4-A. Carts whose id does not start with "<their own locationId>:".
--       The old import fallback (decision H12, deleted in H4) could store
--       such a cart. Since H4 (decision T6) an import that names one of
--       these ids is refused with FORBIDDEN, so the owner of that cart can
--       no longer re-import their own backup.
SELECT count(*) AS carts_not_keyed_by_their_location
FROM "Cart" c
WHERE left(c."id", length(c."locationId") + 1) <> c."locationId" || ':';

-- H4-B. Location ids that H4's import refuses (decision T12).
SELECT count(*) AS locations_with_refused_id
FROM "Location"
WHERE "id" = 'local' OR "id" LIKE '%:%';

-- H4-C. A location stored under the id 'local'. Must return NO rows.
SELECT "id" FROM "Location" WHERE "id" = 'local';
```

H4-A uses `left(…)` and not `NOT LIKE "locationId" || ':%'`: a location id may hold `_` or
`%`, which `LIKE` reads as wildcards. H3b-C in the H3b runbook is the same query, run before
the H3b migration. Run it again here: rows written between the two runs count too.

| Query | Expected | If not |
|---|---|---|
| H4-A | 0 | **Stop.** List them with `SELECT "id", "locationId" FROM "Cart" WHERE left("id", length("locationId") + 1) <> "locationId" \|\| ':'`. Do not write a data fix here. Plan one with the owner (Known gaps in the H4 plan) |
| H4-B | 0 | **Stop.** List them with `SELECT "id", "householdId" FROM "Location" WHERE "id" = 'local' OR "id" LIKE '%:%'`, and plan a fix with the owner |
| H4-C | no rows | **Stop**, as for H4-B |

Why H4-C matters on its own: the web treats any file with a location whose id is `'local'`
as a LOCAL backup. It asks "Import into which location?" and moves that location's rows to
the location the user picks. So a household that has a cloud location with the id `'local'`
cannot restore that location under its own id, and the server refuses the id anyway.

Results (`TBD after rehearsal`):

| Query | Count | Date | Run by |
|---|---|---|---|
| H4-A | TBD | TBD | TBD |
| H4-B | TBD | TBD | TBD |
| H4-C | TBD | TBD | TBD |

---

## 4. Old and new versions together

| Web | Server | What happens |
|---|---|---|
| old | new | **Mostly works.** The old bundle never calls `importCheck`; the server's own checks still keep the data safe. The owner is `owner`, so the role gate passes. The old bundle remaps the file's default location onto the household's first location and gives a legacy file's carts a location prefix, so it sends no `'local'` and no bare cart id. **Two rare failures:** (1) a backup made before locations existed, with inventory logs, is refused with `BAD_USER_INPUT` at the log batch, AFTER the earlier batches were written; (2) an import refused for another household's id is refused per batch of 50, so the batches before it stay written (the old behaviour). The old texts still say "another account". The five export reads give one household, which is the only household anyone has before H5 |
| new | old | **Every cloud import fails, and nothing is written.** `importCheck` is unknown to the old server, so its request fails GraphQL validation. The web runs `importCheck` before `clearAllData` and before the first batch, so the import stops there. The card shows its general error. The "Import into which location?" dialog shows "The locations could not be loaded" (it asks `importCheck` too). Everything that is not import or the local → cloud copy works, because no other new web document uses a new field |
| new | new | Everything works |

**After both deploys, reload every device once and accept the update prompt.** The app is a
PWA with `registerType: 'prompt'`: a device keeps its old bundle until the person accepts.

---

## 5. How to tell it worked

**Owner**, cloud mode, signed in, on a device with the new bundle.

1. **The new query answers.** Open `/settings/household`. Export a backup. Then import the
   same file and press **Skip conflicts**. In the browser's network tab, find the
   `ImportCheck` request: it must answer `200` with `data.importCheck` and no `errors`. The
   import must end with "Import complete." Every row is already there, so skip writes
   nothing new. (After decision O9 the app may switch to the backup's first location if the
   active location holds no stock. That is expected.)
2. **The card is role-aware.** As the owner, the conflict dialog shows three buttons,
   including **Clear & import**. Do not press it.
3. **The local → cloud question.** Only if a device has local data to copy: sign in, and
   check that "Import into which location?" appears with the first location selected. Press
   Cancel unless the copy is wanted.
4. **Read-only SQL, optional.** Run H4-A and H4-B again on production, read-only, only with
   the owner's consent. Both must still be 0.

Results: `TBD on deploy day`.

---

## 6. If something is wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| Every cloud import fails at once with the general error | the web is new and the server is old, or the device has a new bundle against a server that was rolled back | check the Railway deployment is the new commit. If the server was rolled back on purpose, cloud import stays off until it is deployed again |
| An import is refused with "another household" for the owner's own backup | a cart from H4-A, or a location from H4-B or H4-C | run section 3 on production, read-only, with consent. Plan a fix with the owner |
| The local → cloud copy fails with "Only the owner or a manager can import data" | the person is a household `member`. Not possible before H5 | — |

**Rollback.** H4 has no migration, so a rollback is only a redeploy: redeploy the previous
server deployment on Railway, and revert the web on Cloudflare Pages. If only the server is
rolled back, the new web cannot import (section 4, row "new web, old server"). If H4 went
out with H3a, use the H3a runbook's rollback, which covers both.

---

## 7. Left open on purpose

- **No data fix for H4-A, H4-B or H4-C.** The counts decide whether one is needed.
- **The activity log of imports** is H6.
- **One person in two households** has no real-SQL test until H5 (invites).

## 8. Households H5a (roles in the web, read-only views, empty households)

Added 2026-11-17 by H5 task F.9. **H5a is merged into `develop` (#384, merge `4307d30a`,
2026-11-18). It is not deployed.** (Until 2026-11-18 this line said "built on
`feature/households-h5` and waits for its PR".) Plan:
[`../permissions/2026-11-17-households-plan-h5.md`](../permissions/2026-11-17-households-plan-h5.md),
*Deploy notes*.

### 8.1 What changes

| Part | What is new |
|---|---|
| Database | nothing. **No migration** |
| Server env, web build env | nothing |
| GraphQL schema | two new fields on `Location`, `myRole: LocationRole` and `hasOrganizer: Boolean!`; one new query, `householdLocations`; `createVendor(locationId:)` goes from `ID!` to `ID` (optional). No field is removed |
| Server behaviour | the last location of a household can be deleted (`LAST_LOCATION` is gone, decision H13 lifted). A location `viewer` can read a cart (`vendorCart` gives an unsaved empty cart instead of `FORBIDDEN`). `reorderLocations` refuses a list that is not the household's full set. `createVendor` with no location writes the vendor and no cart |
| Web behaviour | `GetLocations`, `CreateLocation`, `UpdateLocation` and `ReorderLocations` select `myRole`. The settings list reads `householdLocations`. Read-only views for a household `member` and a location `viewer`. The empty "no locations" screen |

### 8.2 H5a alone (a checkpoint release after the one that carries H3a to H4)

**The server goes first, then the web** (the same rule as H4, decision T9).

| Gap | Effect |
|---|---|
| **old web, new server** (server first) | **Replaced by 8.3 for the households release.** This row was written for H5a alone, after H3a's server was live. In the households release the old bundle is `main`'s, and 8.3 says what it sees. Kept for the record: **works.** The old bundle selects no new field. Two small things: an old bundle can delete the household's last location, because the server no longer refuses it, and then Pantry, Shopping and Cooking show a spinner that never ends (the old bundle has no empty screen). No data is lost; adding a location from the settings page ends it. |
| **new web, old server** (web first) | **cloud mode is unusable.** `GetLocations` selects `myRole`, which the old server does not have, so the query fails GraphQL validation and no page can load its location. Also, **no vendor can be created at all**: the new `CreateVendor` document declares `$locationId: ID`, and the old argument is `ID!`, so every call fails with `Variable "$locationId" of type "ID" used in position expecting type "ID!"`, with or without a location |

### 8.3 H5a in the same checkpoint release as H3a — server first, with a shim

**Decided 2026-11-17 by the owner: option 4.** For one release, the new server still
ACCEPTS every field and input field that `main`'s old web bundle sends. So **the server goes
first, then the web**, for the whole households release. The extra fields are removed in the
release after households.

**This replaces the "web first" rule of the H3a runbook (section 1.3), the H3b runbook
(section 0) and section 2.2 above, for this release.** Those rules were written when the old
bundle could not work on the new server at all. With the shim it can.

#### Why there was no safe order before

| Order | What is live in the gap | Effect without the shim |
|---|---|---|
| server first | `main`'s old bundle on the new server | the old bundle selects `Location.isDefault`, which H3a removed: **every location query fails**. Its checkout and cooking send input fields H3b removed: **both fail** |
| web first | the new bundle on `main`'s old server | the new bundle selects `Location.myRole`, which the old server does not have: **every location query fails** too |

#### What the shim adds (all `@deprecated`, built 2026-11-17)

Found by validating every operation in `origin/main:apps/web/src/apollo/operations/*.graphql`
(`351d22ad`) against the new schema, and by comparing the two schemas with graphql-js
`findBreakingChanges`. These are ALL the differences the old bundle can reach:

| Old bundle sends | Where | Shim | Value given, and why |
|---|---|---|---|
| `Location.isDefault` (selected) | `GetLocations`, `CreateLocation`, `UpdateLocation`, `ReorderLocations`, `BulkCreateLocations`, `BulkUpsertLocations` | the field is back, `Boolean!` | `true` for the first location of the caller's `locations` list (by `order`, then `id`), `false` for every other and for a location the caller has no role on. The old bundle uses it to pick the active location, as the import's target location, and to hide Delete. With `false` everywhere the import would have no target, and the old bundle could delete the last location, for which it has no empty screen. The first id is read once per household per request, not once per location |
| `CheckoutItemInput { itemId, quantity }`, where `quantity` is the client's stock total | `Checkout` | `itemId` is back; `cartItemId` is optional | the server finds the cart row by its item and buys the STORED amount, as the old server did. The old `quantity` is ignored. An `itemId` with no row being bought is skipped, as the old server did. **Not every `CART_CHANGED` rule applies.** The amount rule cannot fire, because the amount is copied from the same read it would be compared with: a co-member's change that committed before the read is bought at the new amount, as on the old server. Still `CART_CHANGED`: the same `itemId` twice, a row being bought that the input leaves out, and a row changed or deleted between the read and the claim (the claim's `deleteMany` still stops a double buy). Each entry needs exactly one of `cartItemId` and `itemId`, the same in all entries; anything else is `BAD_USER_INPUT` |
| `ConsumeRecipesItemInput { packedQuantity, unpackedQuantity, quantity }` beside `delta` | `ConsumeRecipes` | the three fields are back, optional | ignored. The old bundle's `delta` is already "minus the amount used", the value the new server needs |

**The default can move.** On `main`, `isDefault` was a stored flag, not "the first by
`order`", so a location could sit above it. On such a household the old bundle now locks a
different row, shows Delete on its old default, and uses a different import target and
active-location fallback. No data is lost.

Not shimmed, because no `main` document uses them: the six `userId` fields (#359 step one
removed every selection), `purgeUserData` and `PurgeResult`. One old document,
`AllCartItems`, has the same name in `export.graphql` and `shopping.graphql`; that is a
problem of `main` itself, not of this release, and each operation validates on its own.

The test that keeps this true: `apps/server/src/test/oldBundleCompat.test.ts`. It validates
every operation of a COPY of `main`'s documents
(`apps/server/src/test/fixtures/main-web-operations/`) against the current schema, checks the
old checkout and cooking variables, and fails if a current web document selects a deprecated
field. It also compares a COPY of `main`'s server schema
(`apps/server/src/test/fixtures/main-server-schema.graphql`) with the current one:
`findBreakingChanges` must return exactly the eight changes above, and
`findDangerousChanges` only `CheckoutItemInput.cartItemId`. Document validation alone does
not look inside an input type sent as a variable, so this comparison is what catches a
change to, for example, `ItemInput` or `TagInput`, which `main`'s import sends.

#### Mutations an old bundle calls that now mean something else (they still work)

| Mutation | What changed on the new server | Effect on an old bundle |
|---|---|---|
| every write | a household or location role is checked | none today: each person is the owner of their own household, with `organizer` on every location they made |
| `deleteLocation` | the last location can be deleted (F.7) | the old bundle hides Delete on its `isDefault` location, so it cannot delete the last one. **One case remains:** after the web deploy, a device with the NEW bundle in the same household (for example the same person's other device) can delete the last location. A device that still has the old bundle then gets an empty list and shows a spinner that never ends, until it accepts the update. No data is lost beyond what the delete removed |
| `reorderLocations` | must name the household's full set (F.2) | the old bundle sends its whole `locations` list, which is the full set while nobody shares a household |
| `checkout` | refuses a changed cart with `CART_CHANGED` | the old bundle shows a plain error. Reload and try again. Only a real change refuses it: an item the old screen still lists but the cart no longer buys is skipped, so a retry does not keep failing |
| the 22 import mutations, `clearAllData` | role gate, household checks, no fallback location (H4) | as in section 4, row "old web, new server" |
| `createVendor` | checks its location is in the household | none: the old bundle sends the active location |

#### The order

1. Deploy the server (H3a runbook 4.4, with the migrations). Wait until it is live.
2. Then merge `develop` into `main`, so Cloudflare builds the new web.
3. Reload every device and accept the update prompt.

#### What to check after the server deploy, before the web deploy

On a device that still has the OLD bundle:

1. Pantry loads, and the location switcher shows the locations. (`isDefault`)
2. Settings → Locations: the first location shows the lock and has no Delete button.
3. Add an item to a cart and check out. The stock goes up by the cart amount.
4. Cook one recipe. The stock goes down by the amount used.

Then deploy the web and do 8.4.

#### Removing the shim (the release after households)

Delete `Location.isDefault` and its resolver, with `firstLocationIdOf` in
`location.resolver.ts`, the `firstLocationIds` entry of `RequestCache` (`context.ts`) and
its `delete` in `forgetLocationRoles` (`lib/authz.ts`); `CheckoutItemInput.itemId` (and make
`cartItemId` `ID!` again, removing `checkoutInputShape` and `fromOldCheckoutInput` in
`cart.resolver.ts`); the three `ConsumeRecipesItemInput` fields; the fixture folder
`main-web-operations/`, the schema copy `main-server-schema.graphql`, and
`oldBundleCompat.test.ts`. Only after every device has the households bundle.

### 8.4 Checks after the deploy

1. As the owner, open **Settings → Household → Locations**. Every location shows a role
   text ("Organizer").
2. Delete a location that holds nothing, until one is left; delete the last one too (on a
   test household, not a real one). Pantry shows "You have no locations in this household
   yet" and **Create a location**. Create one; the pantry comes back.
3. Create a vendor. It must work, with a location and in an empty household.

## 9. Households H5b (invites, join, members, the no-household screen)

Added 2026-11-18 by H5b task G.11. **H5b is merged into `develop` (#385, merge
`938fa2aa`, 2026-11-18). It is not deployed.** Plan:
[`../permissions/2026-11-18-households-plan-h5b.md`](../permissions/2026-11-18-households-plan-h5b.md),
*Deploy notes* and *Known gaps*.

**Nobody runs SQL while writing this section.** Every result below is `TBD`.

### 9.1 What changes

| Part | What is new |
|---|---|
| Database | **one migration**, `20261118000000_add_household_invites`. It adds the table `HouseholdInvite` and the nullable column `User.activeHouseholdId`. Additive only: no row is changed, nothing is dropped, no backfill |
| Server env, web build env | nothing new |
| Clerk | no new setting, but one check (9.4): the return to `/join/<token>` after sign-in and after sign-up |
| GraphQL schema | 3 new queries (`householdInvites`, `invitePreview`, `householdMembers`) and 7 new mutations (`createInvite`, `revokeInvite`, `joinHousehold`, `setHouseholdRole`, `removeMember`, `leaveHousehold`, `createHousehold`). No field, argument or input field is removed or changed. `oldBundleCompat.test.ts` still passes with the same list of known changes (in `pnpm test`, 2026-11-18) |
| Server behaviour | a person in two households acts in one, by a fixed rule: `User.activeHouseholdId` while they are still a member there, else the oldest membership (decision T14). A person who left or was removed, with no other household, gets `NO_HOUSEHOLD` |
| Web behaviour | the join page `/join/$token`, the sign-in return path (`/sign-in?redirect=`), the Members page `/settings/household/members` (cloud only), the no-household screen, and a guard that clears the Apollo cache when the household changes |

### 9.2 The migration deploys with the server

The migration runs in Railway's release command, like every other one. In the households
release it is the **fourth** migration. So two numbers in the earlier runbooks are now one
too low:

| Runbook step | It says | With H5b in the release |
|---|---|---|
| H3b runbook 3.1 (the pending list) | exactly three pending migrations | **exactly four**: `20261104000000_add_households`, `20261111000000_drop_user_scope`, `20261114000000_shared_carts`, `20261118000000_add_household_invites`. If it lists more, stop and find out why |
| H3b runbook 4.2 (the release log) | three `Applying migration` lines | **four** lines, the fourth `Applying migration \`20261118000000_add_household_invites\`` |
| H3b runbook 5, check 1 | H3a 5 query 1 with `LIMIT 4` | `LIMIT 5`: all four new migrations have `finished_at` and no `rolled_back_at` |

H3c-1, H3c-2, H4 and H5a have no migration, so they add nothing to these lists.

The test database is already migrated. The main session ran `verify-migration.ts` on it on
2026-11-18, with the owner's consent (plan, *Status*, task G.1: exit 0, 213 `ok —` lines,
0 `FAIL:`). That proves the migration on a database built from the committed history. It
does NOT prove it on production data. That is 9.3.

### 9.3 Rehearse on a FRESH Neon branch of production

**Main session, with the owner's consent.** Do this inside the release rehearsal of the H3a
and H3b runbooks (section 3 of each), on the same fresh branch, in the same run. Each
rehearsal writes to its branch, so a branch that was used once cannot rehearse again.

- **Only `prisma migrate deploy` and read-only SQL.** H5b's migration is additive only, so
  this is the *Production-data rehearsals* rule in `apps/server/prisma/CLAUDE.md`.
- **Never run `verify:migration` (`scripts/verify-migration.ts`) against a copy of
  production.** It resets its target. Its guard refuses the `PROD_COPY_*` variables, but do
  not rely on the guard.
- **Prove the env override first** (H3a runbook 3.1): `prisma migrate status` with and
  without the override must report different hosts. Never paste a host or a connection
  string anywhere.

After all four migrations are applied, run these on the rehearsal branch. All are
read-only.

```sql
-- H5b-1. The new column exists and is empty on every row.
--        Expect with_active_household = 0.
SELECT count(*) AS users,
       count("activeHouseholdId") AS with_active_household
FROM "User";

-- H5b-2. The new table exists and holds nothing. Expect 0.
SELECT count(*) AS invites FROM "HouseholdInvite";

-- H5b-3. The four foreign keys and what each does on delete.
--        Expect exactly four rows:
--          User_activeHouseholdId_fkey        n  (SET NULL)
--          HouseholdInvite_householdId_fkey   c  (CASCADE)
--          HouseholdInvite_createdById_fkey   r  (RESTRICT)
--          HouseholdInvite_usedById_fkey      n  (SET NULL)
SELECT conname, confdeltype
FROM pg_constraint
WHERE conname IN ('User_activeHouseholdId_fkey',
                  'HouseholdInvite_householdId_fkey',
                  'HouseholdInvite_createdById_fkey',
                  'HouseholdInvite_usedById_fkey')
ORDER BY conname;

-- H5b-4. The three new indexes. Expect three rows; only the token index is UNIQUE.
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexname IN ('HouseholdInvite_token_key',
                    'HouseholdInvite_householdId_idx',
                    'User_activeHouseholdId_idx')
ORDER BY indexname;
```

| Check | Expected | Result |
|---|---|---|
| H5b-1 | `with_active_household` = 0 | `TBD after rehearsal` |
| H5b-2 | 0 | `TBD after rehearsal` |
| H5b-3 | four rows, delete rules `n`, `c`, `r`, `n` as listed | `TBD after rehearsal` |
| H5b-4 | three rows, only `HouseholdInvite_token_key` unique | `TBD after rehearsal` |

**Stop rule:** any other answer means the migration did not apply as written. Do not
deploy. Find out why with the main session.

### 9.4 The order: server first, then the web

This is already the order of the whole households release (section 8.3). H5b does not
change it.

- **New web on an old server does not work.** The new bundle sends queries the old server
  does not have (`invitePreview`, `householdMembers`, `householdInvites`, `createHousehold`
  and the rest), so the join page, the Members page and the no-household screen fail
  GraphQL validation.
- **Old web on the new server works.** `main`'s bundle selects none of the new fields.

### 9.5 Clerk: the return to the invite link

**Owner, in the PRODUCTION Clerk instance, before the web deploy.** A person who opens an
invite link while signed out goes to `/sign-in?redirect=/join/<token>`. The sign-in page
passes that same-origin path to Clerk as `forceRedirectUrl` AND `signUpForceRedirectUrl`
(decision T24). Clerk may refuse a redirect it does not allow.

1. In the Clerk Dashboard, open **Paths** and any list of allowed redirect URLs. Check that a
   path on the production origin, such as `/join/<token>`, is allowed.
2. After the deploy, test both ways, with a link from a test household:
   - **Sign-in:** open the link in a private window, signed out. Sign in with an existing
     account. The page must come back to `/join/<token>`.
   - **Sign-up:** open a NEW link in a private window. Sign up as a new account (including
     any e-mail check Clerk asks for). The page must come back to `/join/<token>`, not to
     `/`.

If either lands on `/`, the person can still open the link again by hand. Fix the Clerk
setting; no code change is needed for that.

Result: `TBD on deploy day` (sign-in: back on the link yes/no; sign-up: yes/no).

### 9.6 Manual check on two real devices: invite, join, leave

**Owner, after the web deploy.** Use two real devices (for example a laptop and a phone)
and two accounts. Use a test household, not the real one.

1. Device A, as the owner: **Settings › Household › Members › Invite someone**. Choose
   `member`, give one location a role, create the link.
2. Device B, signed out: open the link. Sign in or sign up. The join page shows the
   household name, who invited you and your roles. Press **Join**. Device B lands on the
   pantry of A's household.
3. Device A: the Members page lists the new person without a reload (live update).
4. Device B: **Members › Leave household**, and confirm. Device B shows "You are not in any
   household." and **Create a household**. (If B had another household, B lands there
   instead.)
5. Device A: the new person is gone from the list.

Result: `TBD on deploy day`.

### 9.7 Manual check: Copy link where the Clipboard API does not work

**Owner, after the web deploy, or on a local build before it.** The unit tests run in jsdom,
which cannot show what a real browser copies (review of task G.9). `copyText` uses the
Clipboard API first, then a hidden text area with `execCommand('copy')`.

1. Make the Clipboard API fail. One of:
   - open the app over plain `http://` on a phone in the local network (the Clipboard API
     needs a secure page, and a plain `http://` address on the local network is not one),
     for example a local production build served with `vite preview --host`; or
   - block the clipboard permission for the site in the browser settings.
2. **In the invite dialog:** create a link, press **Copy link**, then paste it into another
   app. The pasted text must be the full link `<origin>/join/<token>`.
3. **On an open-invite row:** press **Copy link** on a row in **Open invites**, then paste.
   The same check.
4. If copying fails, the page must show the link in a read-only field, selected, with the
   text "Could not copy. Select the link and copy it yourself."

Result: `TBD` (dialog: pasted yes/no; row: pasted yes/no; browser and device used).

### 9.8 The old-bundle window

`main`'s old bundle never calls the new fields, so it keeps working on the new server
(9.4). It also has no no-household screen and no Members page.

- **Between the server deploy and the web deploy nobody can invite, join or remove**,
  because only the new bundle has those screens.
- **After the web deploy, a device that has not accepted the update yet still runs the old
  bundle.** If someone on a new bundle removes that person from their only household, the
  old bundle gets `NO_HOUSEHOLD` on every request. It shows failing pages and no screen
  that explains why, until the device reloads and takes the new bundle. No data is lost.
- **An old-bundle device can mix two households after a join.** The old bundle has no
  `HouseholdChangeGuard`. So when the person joins another household on a new-bundle
  device, an old-bundle device does not clear its cache or reload. It can show the old
  household's cached rows mixed with answers from the new household, until it takes the
  update. No data is written to the wrong household by this; it is what the screen shows.
- This is the same window as H5a's (8.3). The fix is the same: reload every device and
  accept the update prompt right after the web deploy.

### 9.9 If something is wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| The release log stops at `add_household_invites` with an error | the migration failed. Each migration file runs as its own transaction (H3a runbook 7.1), so nothing of this one is applied; the three before it stay applied | the old server keeps serving. Read the error, then follow H3a runbook 7.1, with `20261118000000_add_household_invites` as the name to mark `--rolled-back` |
| A signed-out person who opens a link ends on `/` after sign-in or sign-up | Clerk did not accept the redirect (9.5) | fix the Clerk setting. The person opens the link again |
| The join page, Members page or no-household screen shows an error for everyone | the web is new and the server is old, or the server was rolled back | check the Railway deployment is the new commit |

**Rollback.** The migration only adds. To roll back the server alone, redeploy the previous
server deployment; the old server ignores the new table and column. Invites made in the
meantime stay in the table, unused. A person who joined a household in the meantime stays a
member. **But the old server has no rule for a person in two households**: it picks one
with `findFirst` and no order, so such a person may see a different household on each
request. For a full rollback use H3a runbook 7.2, which restores the branch taken before all
four migrations.

**Rolling back the web alone** (to the H5a bundle, with the H5b server still running).
The H5a bundle has no no-household screen, no join page and no Members page. A person in
NO household (who left or was removed) then gets `NO_HOUSEHOLD` on every request: the
pages fail and nothing explains why. No data is lost. A person still in a household is not
affected. So when anyone may be in no household, prefer to fix forward over a web-only
rollback.

## 10. Households H5c (the location people page)

Added 2026-11-19 by H5c task H.9. **H5c is built on `feature/households-h5c`. It is not
merged and not deployed.** Plan:
[`../permissions/2026-11-19-households-plan-h5c.md`](../permissions/2026-11-19-households-plan-h5c.md),
*Deploy notes* and *Known gaps*.

### 10.1 What changes

| Part | What is new |
|---|---|
| Database | **no migration**. No table, column or index changes |
| Server env, web build env, Clerk | nothing new |
| GraphQL schema | 1 new query (`locationPeople`), 1 new type (`LocationPerson`), 1 new field (`HouseholdPerson.hasLocationRole`) and 3 new mutations (`setLocationRole`, `removeLocationRole`, `leaveLocation`). No field, argument or input field is removed or changed. `oldBundleCompat.test.ts` still passes with the same list of known changes (in `pnpm test`, 2026-11-19) |
| Live updates | each of the 3 mutations sends one household-level `LOCATION` event after the commit. The live guard holds 72 mutation fields |
| Web behaviour | the page `/settings/household/locations/$id` (cloud only), a link on each location name in **Settings › Household › Locations**, the **No location roles** mark on the Members page, and a short message when a tab loses its active location |

### 10.2 The order: server first, then the web

This is already the order of the whole households release (section 8.3). H5c does not
change it.

- **New web on an old server does not work.** The new bundle selects `locationPeople` and
  `HouseholdPerson.hasLocationRole`. An old server fails GraphQL validation on both, so the
  people page and the **Members page** show an error (the Members query selects the new
  field).
- **Old web on the new server works.** `main`'s bundle selects none of the new fields, and
  an H5b-era bundle was never deployed, so there is no in-between bundle.

### 10.3 Checks after the deploy

**Owner, after the web deploy.** Use two real devices (for example a laptop and a phone)
and two accounts in one TEST household, not the real one. Device B's person must be a
household `member`.

1. Device A, as the owner: **Settings › Household › Locations**. Each location name is a
   link. Open one.
2. The page shows the location name and the people with a role there. Press **Add
   person**, choose B's person and **Viewer**, and add.
3. Device B, already open on the pantry or on the empty screen: within a few seconds,
   with no reload, B sees the location (in the switcher, with **View only**).
4. Device A: change B's role to **Participant**. Device B: the **View only** badge goes,
   with no reload.
5. Device A: remove B from the location (the Remove button on B's row, then confirm).
   Device B, if it was showing that location: the screen moves to B's next location, or to
   the empty screen, and shows "You no longer have access to {location}." once.
6. Device A: **Settings › Household › Members**. If B now has no location role, B's row
   shows **No location roles** with a link to the locations.

Result: `TBD on deploy day`.

### 10.4 If something is wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| The people page, or the Members page, shows an error for everyone | the web is new and the server is old, or the server was rolled back | check the Railway deployment is the new commit |
| Device B does not change in step 3 or 4 until a reload | the live socket is not connected (H3c-1 runbook) | check `VITE_GRAPHQL_WS_URL` in the Cloudflare build and the socket in the browser's network tab. The write itself is saved: a reload shows it |

**Rollback.** No migration, so the server can go back to the previous deployment by
itself. Role changes made in the meantime are ordinary `LocationMember` rows and stay. But
roll back the web FIRST (or together): an H5c bundle on an H5b server fails on the Members
page (10.2). Role changes made between H5c and H6 are not logged (owner decision O29-A).

## Where this file lives, and why

In `docs/global/backend/`, beside the H3a, H3b and H3c-1 runbooks. A person who opens a
runbook during a deploy looks for deploy documents, not for a feature folder.
