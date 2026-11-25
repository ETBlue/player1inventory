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
The results below were filled on 2026-11-24 (release plan step A.3). The households release
is deployed: release #403, merge `16929909`, 2026-11-23. A value the session record does not
hold says "not recorded".

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

Results (rehearsal of the households release):

| Query | Count | Date | Run by |
|---|---|---|---|
| H4-A | 0 | 2026-11-23 | main session |
| H4-B | 0 | 2026-11-23 | main session |
| H4-C | no rows | 2026-11-23 | main session |

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

Results: Not recorded. D.11 of the release plan (`2026-11-23-households-release-plan.md`) was done by the owner on 2026-11-23 and 2026-11-24, but the result of this check was not written down.

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

0. Before the deploy day: the whole cloud E2E suite on Neon, green (section 15).
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

**Done on 2026-11-25** (branch `chore/remove-old-bundle-shim`, into `develop`). Everything in
the paragraph above is deleted, and `cartItemId` is `ID!` again. The release that ships it
needs no special deploy order: the server change only removes fields that no households
bundle uses. A device still on a bundle from before households then fails every location
query, checkout and cook until it accepts the update prompt.

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

**Nobody runs SQL while writing this section.** The results below were filled after the
rehearsal of the households release, 2026-11-23 and the deploy (release #403).

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
| H5b-1 | `with_active_household` = 0 | 0 (`users` 2, `with_active_household` 0), rehearsal of the households release, 2026-11-23 |
| H5b-2 | 0 | 0, rehearsal of the households release, 2026-11-23 |
| H5b-3 | four rows, delete rules `n`, `c`, `r`, `n` as listed | four rows, `r`, `c`, `n`, `n` for `createdById`, `householdId`, `usedById`, `User_activeHouseholdId`, rehearsal of the households release, 2026-11-23 |
| H5b-4 | three rows, only `HouseholdInvite_token_key` unique | three rows, only `HouseholdInvite_token_key` unique, rehearsal of the households release, 2026-11-23 |

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
passes that same-origin path to Clerk as `forceRedirectUrl`, and Clerk's **Sign up** link
goes to the app's own `/sign-up?redirect=/join/<token>` page, which passes the path to
Clerk's `<SignUp>` as `forceRedirectUrl` (decision T24). Clerk may refuse a redirect it does
not allow.

**Corrected 2026-11-23.** This section first said the sign-in page passes the path as
`signUpForceRedirectUrl` too, and that a sign-up would return. It did not: there was no
`/sign-up` page, so Clerk's **Sign up** link went to Clerk's hosted page, which keeps no
`?redirect=`. Fixed in code (`fix/join-redirect-after-sign-up`), see
`docs/global/bugs/2026-11-23-bug-join-redirect-lost-on-sign-up.md`.

1. In the Clerk Dashboard, open **Paths** and any list of allowed redirect URLs. Check that a
   path on the production origin, such as `/join/<token>`, is allowed.
2. After the deploy, test both ways, with a link from a test household:
   - **Sign-in:** open the link in a private window, signed out. Sign in with an existing
     account. The page must come back to `/join/<token>`.
   - **Sign-up:** open a NEW link in a private window. Choose **Sign up**. The address bar
     must show `/sign-up?redirect=%2Fjoin%2F<token>`, on the app's own origin, not a Clerk
     `accounts.dev` or `accounts.<domain>` page. Sign up as a new account (including any
     e-mail code Clerk asks for). The page must come back to `/join/<token>`, not to `/`.

If either lands on `/`, the person can still open the link again by hand. If the address bar
showed our own `/sign-up?redirect=…` and it still lands on `/`, check the Clerk redirect
setting in step 1. If the **Sign up** link left our origin, the web bundle is older than the
2026-11-23 fix.

Result: sign-in and sign-up both not recorded. Before the release the sign-up path was
fixed in code (#401) and the owner checked it on the local dev server (2026-11-23, "the
sign-up flow is good now"). Step 1 (the Clerk dashboard) is not recorded.

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

Result: not recorded as a whole. What is recorded: in production the owner found that the
join page said "User invited you." (fixed by #406) and asked for a clearer role list (#407).
After release #409 (2026-11-24) the owner confirmed that the join page cards look right and
that the inviter's real name is shown.

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

Result: Not recorded. D.11 of the release plan (`2026-11-23-households-release-plan.md`) was done by the owner on 2026-11-23 and 2026-11-24, but the result of this check was not written down.

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
| A signed-out person who opens a link ends on `/` after sign-in or sign-up | Clerk did not accept the redirect, or the web bundle is older than the 2026-11-23 sign-up fix (9.5) | fix the Clerk setting, or deploy the web. The person opens the link again |
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

Added 2026-11-19 by H5c task H.9. **H5c is merged into `develop` (#391, merge
`7dbaeca9`, 2026-11-20). It is not deployed.** Plan:
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

Result: Not recorded. D.11 of the release plan (`2026-11-23-households-release-plan.md`) was done by the owner on 2026-11-23 and 2026-11-24, but the result of this check was not written down.

### 10.4 If something is wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| The people page, or the Members page, shows an error for everyone | the web is new and the server is old, or the server was rolled back | check the Railway deployment is the new commit |
| Device B does not change in step 3 or 4 until a reload | the live socket is not connected (H3c-1 runbook) | check `VITE_GRAPHQL_WS_URL` in the Cloudflare build and the socket in the browser's network tab. The write itself is saved: a reload shows it |

**Rollback.** No migration, so the server can go back to the previous deployment by
itself. Role changes made in the meantime are ordinary `LocationMember` rows and stay. But
roll back the web FIRST (or together): an H5c bundle on an H5b server fails on the Members
page (10.2). Role changes made between H5c and H6 are not logged (owner decision O29-A).

## 11. Households H6a (activity log, purges, danger zones)

Added 2026-11-20 by H6 task J.9. **H6a is built on `feature/households-h6a`, from `develop`
at `7dbaeca9`. It is merged into `develop` (2026-11-20, #392, merge `c0f096ed`), not deployed.** Plan:
[`../permissions/2026-11-20-households-plan-h6.md`](../permissions/2026-11-20-households-plan-h6.md),
*Deploy notes*, *Known gaps* and *Status*.

In short: **one additive migration, the server first, then the web, then the checks below.**

### 11.1 What changes

| Part | What is new |
|---|---|
| Database | **one migration**, `20261120000000_add_household_activity`. It adds one enum, `"ActivityAction"` (19 values; the six H6b values are already in it), and one empty table, `"HouseholdActivity"`. Additive only: no row is changed, nothing is dropped, no backfill |
| Server env, web build env, Clerk | nothing new |
| GraphQL schema | 1 new query (`householdActivity`), 3 new types (`HouseholdActivityEntry`, `ActivityImportCounts`, the enum `ActivityAction`), 1 new input (`ImportCountsInput`) and 4 new mutations (`deleteAllLocations`, `removeAllLocationItems`, `deleteHousehold`, `recordImport`). No field, argument or input field is removed or changed. `oldBundleCompat.test.ts` still passes with the same list of known changes (in `pnpm test`, 2026-11-20) |
| Live updates | `deleteAllLocations` sends one household-level `LOCATION` event; `removeAllLocationItems` sends `STOCK` and `CART` at that location, each only when it changed rows. `recordImport` and `deleteHousehold` send nothing. The live guard holds 76 mutation fields: 74 in `publishes`, 2 in `publishesNothing` |
| Server behaviour | 13 kinds of write now add one activity row inside their own transaction (decision T51). `createInvite` and `revokeInvite` became transactions. `clearAllData`, `renameHousehold`, `deleteLocation` and the new owner-only writes take the household lock FIRST and read the role after it, so a household deleted at the same moment gives `FORBIDDEN`, not a raw `P2025` |
| Web behaviour | **Settings › Household › Activity** (owner and manager, cloud only), a danger zone on the household page (owner: **Clear household**, **Delete all locations**, **Delete household**), and one on a location's people page (organizer: **Remove all items**). Every purge asks for the name, typed exactly |

### 11.2 The migration deploys with the server

The migration runs in Railway's release command, like every other one. In the households
release it is the **fifth** migration, so the numbers in section 9.2 grow by one:

| Runbook step | Section 9.2 says | With H6a in the release |
|---|---|---|
| H3b runbook 3.1 (the pending list) | exactly four pending migrations | **exactly five**: the four in 9.2, then `20261120000000_add_household_activity`. If it lists more, stop and find out why |
| H3b runbook 4.2 (the release log) | four `Applying migration` lines | **five** lines, the fifth `Applying migration \`20261120000000_add_household_activity\`` |
| H3b runbook 5, check 1 | H3a 5 query 1 with `LIMIT 5` | `LIMIT 6`: all five new migrations have `finished_at` and no `rolled_back_at` |

**Proved on the test database on 2026-11-20.** The main session ran
`pnpm --filter server verify:migration` against the TEST database, with the owner's explicit
consent (given after Prisma's AI-agent warning). Result: "Migration verified.", every line
`ok`. The checks for `add_household_activity`:

| Check | Result |
|---|---|
| `"HouseholdActivity"` has exactly 8 columns, with the right types | ok |
| `"ActivityAction"` holds exactly the 19 values, H6b's included | ok |
| exactly one foreign key: `householdId` → `Household`, `ON DELETE CASCADE` | ok |
| no foreign key on `actorId`, `targetUserId` or `locationId` | ok |
| index `HouseholdActivity_householdId_createdAt_id_idx` on `("householdId", "createdAt" DESC, id)` | ok |
| a row naming no real actor, target or location is accepted | ok |
| the optional columns read back `NULL`, and `createdAt` is filled in | ok |
| an unknown action is refused (`22P02`) | ok |
| an unknown household is refused (`23503`) | ok |
| deleting a household deletes its activity rows and keeps another household's | ok |

The earlier groups passed again too: the household delete across 17 tables and the
household lock tests. That proves the migration on a database built from the committed
history. It does NOT prove it on production data. That is 11.3.

### 11.3 Rehearse on a FRESH Neon branch of production

**Main session, with the owner's consent.** Do this inside the release rehearsal of the H3a
and H3b runbooks, on the same fresh branch, in the same run, after all five migrations are
applied. The rules of 9.3 hold: only `prisma migrate deploy` and read-only SQL, never
`verify:migration` against a copy of production, prove the env override first, and never
paste a host or a connection string anywhere.

```sql
-- H6a-1. The new table exists and holds nothing. Expect 0.
SELECT count(*) AS activity_rows FROM "HouseholdActivity";

-- H6a-2. The enum has 19 values. Expect 19.
SELECT count(*) AS actions
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'ActivityAction';

-- H6a-3. The one foreign key and what it does on delete.
--        Expect exactly one row: HouseholdActivity_householdId_fkey  c  (CASCADE)
SELECT conname, confdeltype
FROM pg_constraint
WHERE conrelid = '"HouseholdActivity"'::regclass AND contype = 'f';

-- H6a-4. The index. Expect one row, with "createdAt" DESC.
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexname = 'HouseholdActivity_householdId_createdAt_id_idx';
```

| Check | Expected | Result |
|---|---|---|
| H6a-1 | 0 | 0, rehearsal of the households release, 2026-11-23 |
| H6a-2 | 19 | 19, rehearsal of the households release, 2026-11-23 |
| H6a-3 | one row, `c` | one row, `c`, rehearsal of the households release, 2026-11-23 |
| H6a-4 | one row, `"createdAt" DESC` | one row, `("householdId", "createdAt" DESC, id)`, rehearsal of the households release, 2026-11-23 |

**Stop rule:** any other answer means the migration did not apply as written. Do not
deploy. Find out why with the main session.

### 11.4 The order: server first, then the web

This is already the order of the whole households release (section 8.3). H6a does not
change it.

- **New web on an old server does not work.** The new bundle selects `householdActivity`
  and calls the new mutations. An old server fails GraphQL validation, so the Activity page
  and the danger zones fail. The end of every import also calls `recordImport`. On an old
  server that call fails, but the web swallows the error on purpose (`recordImport` in
  `apps/web/src/lib/importData.ts`): the import still succeeds, and only its log row is
  missing.
- **Old web on the new server works.** `main`'s bundle selects none of the new fields.

### 11.5 Checks after the deploy

**Owner, after the web deploy.** Use two real devices and two accounts in one TEST
household, not the real one. Device B's person is a household `member`.

1. Device A, as the owner: open a location's people page and give B's person **Viewer**.
2. Device A: **Settings › Household › Activity**. The newest row says that you gave B the
   Viewer role on that location.
3. Device B: the Activity item is not in the household sidebar.
4. Device A: on the TEST household's page, scroll to the danger zone. Press **Delete all
   locations**. The button in the dialog stays disabled until the household name is typed
   exactly. Do NOT press it on a household with real data.
5. Device A, on a TEST location with one item in stock: open its people page, **Remove all
   items**, type the location name, confirm. The pantry of that location is empty. The
   item's log tab still shows its logs. The Activity page shows the row.

Result: Not recorded. D.11 of the release plan (`2026-11-23-households-release-plan.md`) was done by the owner on 2026-11-23 and 2026-11-24, but the result of this check was not written down.

### 11.6 Before the release: count accounts that are already deleted

Owner decision O36-A. This is for H6b, but run it at the same release if H6b ships with it.
On production, read-only:

```sql
SELECT count(*) FROM "User" WHERE "deletedAt" IS NOT NULL;
```

If it is 0, nothing more. If it is not 0, stop: H6b must add a one-off hand-over script
first. Result: **0** (rehearsal of the households release, 2026-11-23, on the rehearsal branch, not on production; see
12.6 for why).

### 11.7 If something is wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| The release log stops at `add_household_activity` with an error | the migration failed. It runs as its own transaction (H3a runbook 7.1), so nothing of it is applied; the migrations before it stay applied | the old server keeps serving. Read the error, then follow H3a runbook 7.1, with `20261120000000_add_household_activity` as the name to mark `--rolled-back` |
| The Activity page or a danger zone shows an error for everyone | the web is new and the server is old, or the server was rolled back | check the Railway deployment is the new commit |
| An import succeeds, but the Activity page has no row for it, and the browser console says "Could not write the import to the activity log" | `recordImport` failed: the server is old, the network failed, or the person lost the owner or manager role during the import | nothing to repair: the data is written. Only the log row is missing |

**Rollback.** The migration only adds. To roll back the server alone, redeploy the previous
server deployment; the old server ignores the new table. Log rows written in the meantime
stay. But roll back the web FIRST (or together): an H6a bundle on an older server fails on
the Activity page and the danger zones, and imports write no log row (11.4). For a full
rollback use H3a runbook 7.2.

## 12. Households H6b (transfer, hand-over, deleted accounts)

Added 2026-11-20 by H6 task K.9. **H6b is built on `feature/households-h6b`, from `develop`
after H6a (#392). It is NOT merged and NOT deployed.** Plan:
[`../permissions/2026-11-20-households-plan-h6.md`](../permissions/2026-11-20-households-plan-h6.md),
tasks K.0 to K.9, *Deploy notes*, *Known gaps* and *Status*.

In short: **one additive migration, the server first, then the web. No new env value and no
Clerk change. Before the release, count the accounts that were deleted before H6 (12.6),
and if the count is not 0, a one-off script must exist first.**

### 12.1 What changes

| Part | What is new |
|---|---|
| Database | **one migration**, `20261120100000_add_ownership_offers`. It adds one enum, `"OfferKind"` (`transfer`, `handover`), and one empty table, `"OwnershipOffer"`, with two foreign keys (`householdId` → `Household` and `toUserId` → `User`, both `ON DELETE CASCADE`). Additive only: no row is changed, nothing is dropped, no backfill. `Household.ownerGoneAt` is not new (H3a); H6b is the first code that writes it |
| Server env, web build env | nothing new |
| Clerk | nothing new. The endpoint already sends `user.deleted` (since H2), and `CLERK_WEBHOOK_SIGNING_SECRET` is already set. Check both are still true (12.4) |
| GraphQL schema | 1 new query (`myOwnershipOffers`), 1 new type (`OwnershipOffer`), 1 new enum (`OfferKind`), 2 new fields on `Household` (`hasOwner`, `pendingTransfer`) and 5 new mutations (`offerOwnership`, `cancelOwnershipOffer`, `acceptOwnershipOffer`, `declineOwnershipOffer`, `dismissOwnershipOffer`). Nothing is removed or changed. `oldBundleCompat.test.ts` still passes with the same list of known changes (in `pnpm test`, 2026-11-20) |
| Live updates | the four offer writes send one household-level `LOCATION` event; `dismissOwnershipOffer` sends nothing. The `user.deleted` hand-over sends one household-level `LOCATION` per household that still exists. The live guard holds 81 mutation fields: 78 in `publishes`, 3 in `publishesNothing` |
| Server behaviour | `user.deleted` now runs the household hand-over in the same transaction as the `User` row (decision T60). A deleted account no longer counts as an organizer and is not listed (T61). The last live person who leaves a household with no owner deletes it (O37-A). The owner's leave text is "Transfer ownership first." |
| Web behaviour | the offer banner at the top of every cloud page; on **Settings › Household › Members**: **Transfer ownership**, the waiting row with **Cancel**, "This household has no owner." with **Become the owner**, a warning on the last person's Leave; "Clear & import" in cloud asks for the typed household name |

### 12.2 The migration deploys with the server

The migration runs in Railway's release command, like every other one. In the households
release it is the **sixth** migration, so the numbers in 11.2 grow by one more:

| Runbook step | Section 11.2 says | With H6b in the release |
|---|---|---|
| H3b runbook 3.1 (the pending list) | exactly five pending migrations | **exactly six**: the five in 11.2, then `20261120100000_add_ownership_offers`. If it lists more, stop and find out why |
| H3b runbook 4.2 (the release log) | five `Applying migration` lines | **six** lines, the sixth `Applying migration \`20261120100000_add_ownership_offers\`` |
| H3b runbook 5, check 1 | `LIMIT 6` | `LIMIT 7`: all six new migrations have `finished_at` and no `rolled_back_at` |

**Proved on the test database on 2026-11-20.** The main session ran
`pnpm --filter server verify:migration` against the TEST database before task K.8, with the
owner's explicit consent (given after Prisma's AI-agent warning). Result: "Migration
verified.", every line `ok`. The checks for `add_ownership_offers` (`assertOwnershipOffers`):

| Check | Result |
|---|---|
| `"OwnershipOffer"` has exactly 7 columns | ok |
| `"OfferKind"` holds exactly `transfer, handover` | ok |
| exactly two foreign keys, `householdId` → `Household` and `toUserId` → `User`, both `CASCADE`; none on `fromUserId` | ok |
| the unique `(householdId, toUserId)` and the `toUserId` index | ok |
| a second offer to one person in one household is refused (`23505`); an unknown kind (`22P02`); an unknown household or person (`23503`) | ok |
| the person who MADE an offer is deleted: the offer stays. The person it is made TO is deleted: their offers go. A household is deleted: only its offers go | ok |

No file under `apps/server/prisma/` changed after that run (checked in task K.9 with
`git log --oneline e0b7f585..HEAD -- apps/server/prisma/`, which is empty). That proves the
migration on a database built from the committed history. It does NOT prove it on
production data. That is 12.3.

### 12.3 Rehearse on a FRESH Neon branch of production

**Main session, with the owner's consent.** Do this inside the same release rehearsal as
11.3, on the same fresh branch, after all six migrations are applied. The rules of 9.3
hold.

```sql
-- H6b-1. The new table exists and holds nothing. Expect 0.
SELECT count(*) AS offers FROM "OwnershipOffer";

-- H6b-2. The enum. Expect two rows: transfer, handover.
SELECT e.enumlabel
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'OfferKind' ORDER BY e.enumsortorder;

-- H6b-3. The two foreign keys. Expect exactly two rows, both confdeltype c (CASCADE):
--        OwnershipOffer_householdId_fkey and OwnershipOffer_toUserId_fkey
SELECT conname, confdeltype
FROM pg_constraint
WHERE conrelid = '"OwnershipOffer"'::regclass AND contype = 'f'
ORDER BY conname;

-- H6b-4. The two indexes. Expect OwnershipOffer_householdId_toUserId_key (UNIQUE)
--        and OwnershipOffer_toUserId_idx.
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'OwnershipOffer' AND indexname <> 'OwnershipOffer_pkey'
ORDER BY indexname;
```

| Check | Expected | Result |
|---|---|---|
| H6b-1 | 0 | 0, rehearsal of the households release, 2026-11-23 |
| H6b-2 | `transfer`, `handover` | `transfer`, `handover`, rehearsal of the households release, 2026-11-23 |
| H6b-3 | two rows, both `c` | two rows, both `c`, rehearsal of the households release, 2026-11-23 |
| H6b-4 | two rows, one `UNIQUE` | two rows, only `OwnershipOffer_householdId_toUserId_key` unique, rehearsal of the households release, 2026-11-23 |

**Stop rule:** any other answer means the migration did not apply as written. Do not
deploy. Find out why with the main session.

### 12.4 The order: server first, then the web

This is the order of the whole households release (section 8.3). H6b does not change it.

- **New web on an old server does not work.** The new bundle selects `myOwnershipOffers`,
  `Household.hasOwner` and `Household.pendingTransfer`. An old server fails GraphQL
  validation, so the banner query fails on every cloud page, and `GetHousehold` fails, which
  breaks the household page and the Members page.
- **Old web on the new server works.** `main`'s bundle selects none of the new fields.
- **The webhook runs the hand-over only after the server deploy.** A `user.deleted` that an
  old server answers only sets `deletedAt`. 12.6 covers that account too, if the count is
  run after the server deploy as well.
- **Before the server deploy, check the Clerk side has not changed** (Owner, in the
  production Clerk Dashboard): the webhook endpoint is still there and still lists
  `user.deleted`. On Railway, `CLERK_WEBHOOK_SIGNING_SECRET` is still set (check that the
  name is there; do not copy the value anywhere).

### 12.5 Checks after the deploy

**Owner, after the web deploy.** Use two real devices and two TEST accounts in one TEST
household, not the real one. Device A is the owner; device B's person is a `manager` or
`member`. Do NOT delete a real account to test the hand-over.

1. Open the Members page on device B and leave it open.
2. Device A, **Settings › Household › Members**: press **Transfer ownership** on B's row.
   The confirm names the household and B. Confirm. A's row for B shows "Waiting for B to
   accept" with **Cancel**.
3. Device B, with NO reload: within a few seconds the banner shows "A wants to make you the
   owner of …" with **Accept** and **Decline**. This is the live arrival check.
4. Device B: press **Accept**. The banner says "You are now the owner of …".
5. Device A, with no reload: A's own row is now **Manager** and B's is **Owner**. The
   Activity page shows "offered" and "became the owner".
6. Optional, to undo: device B transfers back to A, and device A accepts.

Result: Not recorded. D.11 of the release plan (`2026-11-23-households-release-plan.md`) was done by the owner on 2026-11-23 and 2026-11-24, but the result of this check was not written down.

### 12.6 Before the release: accounts deleted before H6 (owner decisions O36-A and O44)

**Main session, read-only, with the owner's consent, on a COPY of production** (the
rehearsal branch of 12.3 is fine: it is a fresh branch of production). Never on production
itself, and never print an e-mail or a name; the query returns a count only.

```sql
-- H6b-O36. Accounts deleted before H6 that still have a household membership.
--          Expect 0. Each one counted here was never handed over.
SELECT count(DISTINCT u.id) AS deleted_with_membership
FROM "User" u
JOIN "HouseholdMember" m ON m."userId" = u.id
WHERE u."deletedAt" IS NOT NULL;
```

(Section 11.6 counts every deleted account. This query counts only those that still have a
`HouseholdMember` row, which are the ones that need the hand-over.)

| Check | Expected | Result |
|---|---|---|
| H6b-O36 | 0 | **0** (rehearsal of the households release, 2026-11-23). **0** again on 2026-11-24 (release plan D.12), run by the owner in the Neon SQL Editor on a fresh branch of production |

**If the count is 0:** nothing more. **If it is not 0** (owner decision O44): a one-off
script must run `handOverDeletedAccount` (`apps/server/src/lib/handover.ts`) for each such
account, after the server deploy. That also deletes a household where no live person is
left (O37-A).

**That script does not exist yet.** It must be written and reviewed before the release,
and only if the count is not 0. What it must do:

- default to a dry run that prints, per account, only the household ids and what would
  happen (handed over, or deleted); write only with an explicit flag;
- run each account in its own transaction, the same way `handleClerkEvent` does (the `User`
  row first, `retryOnceOnConflict`), and publish nothing (no tab of a deleted person is
  open, and a live event after a script is not needed);
- never print an e-mail or a connection string.

It was not written in task K.9 on purpose: `apps/server/scripts/` must not import from
`src` (root `CLAUDE.md`, the no-overlap rule of `tsconfig.scripts.json`), so a script there
would need a copy of `handOverDeletedAccount` and its helpers. That is too large to write
without a count that says it is needed. Run the count again right after the server deploy:
a `user.deleted` answered by the old server during the deploy is not handed over either.

### 12.7 If something is wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| The release log stops at `add_ownership_offers` with an error | the migration failed. It runs as its own transaction, so nothing of it is applied; the migrations before it stay applied | the old server keeps serving. Read the error, then follow H3a runbook 7.1, with `20261120100000_add_ownership_offers` as the name to mark `--rolled-back` |
| Every cloud page shows an error, and the Members page does not load | the web is new and the server is old, or the server was rolled back | check the Railway deployment is the new commit |
| The banner does not appear on device B until a reload | the live socket is not connected on B, or the event was sent before B's socket subscribed | reload B: the banner shows, so the offer itself is fine. Check the browser console for the socket close code (root `CLAUDE.md`, *Close codes*) |
| A Clerk account was deleted, and the household still shows the old owner | the webhook did not arrive (endpoint, secret), or an old server answered it | check the Clerk Dashboard's webhook log for that event and its answer. Then run the 12.6 count again |

**Rollback.** The migration only adds. To roll back the server alone, redeploy the previous
server deployment; the old server ignores the new table, and `user.deleted` only sets
`deletedAt` again. Offers written in the meantime stay, and a household that was handed
over keeps `ownerId: null` until someone accepts, which the old server cannot do. So roll
back the web FIRST (or together), and do not roll back the server while a hand-over is open
unless it is needed. For a full rollback use H3a runbook 7.2.

**Known gaps** (from the plan): no E2E for **Not now**, for the T62 restart after a
declined hand-over, for **Cancel** on the waiting row, or for the "This offer is no longer
open." notice; the Members page has no Decline or Not now. Check 12.5 covers the transfer
path only.

## 13. Households H7a (household switch, create, the stale-tab fix, the copy choice)

Added 2026-11-21 by H7 task L.7. **H7a is built on `feature/households-h7a`. It is not
merged and not deployed.** Plan:
[`../permissions/2026-11-21-households-plan-h7.md`](../permissions/2026-11-21-households-plan-h7.md),
*Deploy notes* and *Known gaps*.

### 13.1 What changes

| Part | What is new |
|---|---|
| Database | **no migration**. `User.activeHouseholdId` exists since H5b. `git log --oneline 9701ddff..HEAD -- apps/server/prisma/` is empty (checked 2026-11-21) |
| Server env, web build env, Clerk | nothing new |
| HTTP | the web sends a new header, `x-household-id`: the household this page shows. The server's `cors()` sets no `allowedHeaders`, so it allows every header the browser asks for, the new one included. The old server ignores it |
| GraphQL schema | 1 new type (`HouseholdChoice`), 1 new query (`myHouseholds`), 1 new mutation (`setActiveHousehold`), 1 new optional argument (`createHousehold(alsoWhenMember: Boolean = false)`), 1 new error code (`HOUSEHOLD_CHANGED`). No field, argument or input field is removed or changed. `oldBundleCompat.test.ts` passes with the same list of known changes (in `pnpm test`, 2026-11-21) |
| Server behaviour | `requireHousehold` compares the header with the household the person acts in. When the header names another household, every field that calls it answers `HOUSEHOLD_CHANGED`, and nothing is read or written. No header: no compare, the same as before |
| Live updates | `setActiveHousehold` sends nothing (`publishesNothing`). The live guard holds 82 mutation fields: 78 in `publishes`, 4 in `publishesNothing` |
| Web behaviour | **Switch to…** in the household sidebar and the mobile settings accordion (cloud only), with **Create new**; a tab that gets `HOUSEHOLD_CHANGED` reloads into the household the person is in now and shows one message (owner decisions O51-A and O56-A); the copy of offline data lists every household where the person may copy, a household joined on this device included (O57-B), and **A new household** (O22-A) |

### 13.2 The order: server first, then the web

This is the order of the whole households release (section 8.3). H7a does not change it.

- **New web on an old server works only in part.** The new bundle selects `myHouseholds`
  and may send `createHousehold(alsoWhenMember:)`. An old server fails GraphQL validation
  on both. **Switch to…** then shows its error row, **Create new** fails, and the copy
  choice offers only the household shown. The header itself does no harm: the old server
  ignores it, so the stale-tab check is simply not there.
- **Old web on the new server works.** `main`'s bundle sends no `x-household-id`, so
  nothing is compared. **The O21 hole stays open for an old bundle** until it reloads into
  the new one (plan *Known gaps*).

### 13.3 Checks after the deploy

**Owner, after the web deploy.** Use one TEST person who is in two TEST households (A and
B), not the real household. Use two tabs in one browser, or two devices.

1. Tab 1, **Settings › Household**: open **Switch to…**. Both households are listed with
   the person's role, and the current one is marked.
2. Tab 1: choose B. The page reloads; the household name in the sidebar is B; the pantry
   and the carts show only B's data.
3. Tab 2 still shows A (do not reload it). Make a change there, for example create a tag
   type. Expected: the change is NOT saved. Tab 2 reloads into B and shows "You are now in
   B. This page still showed A, so it was reloaded. If you were saving a change, it was not
   saved." Check that the tag type is in neither A nor B.
4. Tab 1: **Switch to… › Create new**, give a test name, press **Create**. The page reloads
   into the new household, which has one location, "Home". The person is its owner.
5. Optional: delete the test household from step 4 (**Delete household** in its danger
   zone).

Result: Not recorded. D.11 of the release plan (`2026-11-23-households-release-plan.md`) was done by the owner on 2026-11-23 and 2026-11-24, but the result of this check was not written down.

### 13.4 If something is wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| **Switch to…** shows an error row for everyone, and **Create new** fails | the web is new and the server is old, or the server was rolled back | check the Railway deployment is the new commit |
| A tab keeps reloading, or shows the message after every load | the message is read from `sessionStorage` once and removed; a loop means the server answers `HOUSEHOLD_CHANGED` to the household it also names as active | read the browser console and the network tab: `GetHousehold` must answer the household the header names. Report it as a bug; roll back the web if it hits real people |
| A stale tab still saves into the other household | an old web bundle (no header), or a field that checks only a location role (cart, stock and log writes; plan *Known gaps*, review F6) | reload the tab. A location-scoped write lands in the household the tab SHOWS, not the other one |

**Rollback.** No migration, so the server can go back by itself. But roll back the web
FIRST (or together): an H7a bundle on an older server loses **Switch to…** and **Create
new** (13.2). Households made with **Create new** stay, and `User.activeHouseholdId` stays
on the household chosen last. The older server still reads it (H5b decision T14), so the
person keeps acting in that household.

**Known gaps** (from the plan): cart, stock and log writes never answer
`HOUSEHOLD_CHANGED` (they check a location role); an old bundle has no stale-tab check;
the person's other tabs learn of a switch only on their next request;
`CreateHouseholdDialog` shows the name rule ("Enter a name of 1 to 100 characters") for
every `BAD_USER_INPUT`, so an `ALREADY_IN_HOUSEHOLD` refusal would show that text (no
current server path sends it to this dialog).

## 14. Households H7b (personal location order and the four sorts)

Added 2026-11-22 by H7 task M.6. **H7b is built on `feature/households-h7b`, from `develop`
at `bf71f485` (after H7a, #394). It is NOT merged and NOT deployed.** Plan:
[`../permissions/2026-11-21-households-plan-h7.md`](../permissions/2026-11-21-households-plan-h7.md),
tasks M.1 to M.6, *Deploy notes*, *What a deployed old web bundle sees* and *Known gaps*.

In short: **one additive migration with one backfill, the server first, then the web. No
new env value and no Clerk change.**

### 14.1 What changes

| Part | What is new |
|---|---|
| Database | **one migration**, `20261122000000_add_location_preferences`. In order: one enum, `"LocationSort"` (`name`, `lastUpdated`, `lastVisited`, `custom`); one nullable column, `"User"."locationSort"` (no backfill: `NULL` means the default, Custom, owner decision O52-A); one nullable column, `"Location"."dataUpdatedAt"`, and **one backfill `UPDATE`** that sets it to the newest `"ItemStock"."updatedAt"` of each location (a location with no stock row keeps `NULL`); one new, empty table, `"LocationPreference"` (primary key `("userId", "locationId")`, two foreign keys to `User` and `Location`, both `ON DELETE CASCADE`, an index on `"locationId"`). Nothing is dropped. `"Location"."order"` stays |
| Server env, web build env, Clerk | nothing new |
| GraphQL schema | 1 new enum (`LocationSort`), 2 new nullable fields on `Location` (`dataUpdatedAt`, `lastVisitedAt`), 1 new query (`myLocationSort`), 2 new mutations (`setLocationSort`, `markLocationVisited`). No field, argument or input field is removed or changed. `oldBundleCompat.test.ts` passes with the same list of known changes (in `pnpm test`, 2026-11-22) |
| Server behaviour | `Location.order` now answers the CALLER's own position (0 to n−1). `locations` and `householdLocations` come back in the caller's own order: their `customOrder` first, then the locations they have not placed, by the shared order. `reorderLocations` writes the caller's own order (one `LocationPreference` row per id), for **any household role** (it needed `manager`). It never writes the shared `Location.order` again; `createLocation` and imports still do. `publishChange` sets `Location.dataUpdatedAt` after every `STOCK`, `CART` or `LOG` event (this also moves `Location.updatedAt`) |
| Live updates | `reorderLocations` moved from `publishes` to `publishesNothing`: only this person sees the change. `setLocationSort` and `markLocationVisited` send nothing. The live guard holds 84 mutation fields: 77 in `publishes`, 7 in `publishesNothing` |
| Web behaviour | **Sort by** on Settings › Locations (Name, Last updated, Last visited, Custom; Custom first); drag handles for every household role, only with Custom; the location switcher uses the same sort (O53-A); in cloud, a visit is recorded when a location becomes the active one, at most once a minute (O55-A); local mode offers Name and Custom only, saved on the device (O54-B) |
| Export | a cloud export now writes the person's OWN order as each location's `order`, because `GetLocations` answers it. A later import of that file into a new household gives that order as the shared order |

### 14.2 The migration deploys with the server

The migration runs in Railway's release command, like every other one. H7a had no
migration, so in the households release this is the **seventh** migration. The numbers in
12.2 grow by one more:

| Runbook step | Section 12.2 says | With H7b in the release |
|---|---|---|
| H3b runbook 3.1 (the pending list) | exactly six pending migrations | **exactly seven**: the six in 12.2, then `20261122000000_add_location_preferences`. If it lists more, stop and find out why |
| H3b runbook 4.2 (the release log) | six `Applying migration` lines | **seven** lines, the seventh `Applying migration \`20261122000000_add_location_preferences\`` |
| H3b runbook 5, check 1 | `LIMIT 7` | `LIMIT 8`: all seven new migrations have `finished_at` and no `rolled_back_at` |

**The backfill `UPDATE` touches every `Location` row that has a stock row, once.** Production
had 5 locations on 2026-10-05. It runs inside the migration's transaction, so it is part of
the same all-or-nothing step.

**Proved on the test database on 2026-11-22.** The main session ran
`pnpm --filter server verify:migration` against the TEST database before task M.5, at
`415cbf02`, with the owner's explicit consent (given after Prisma's AI-agent warning).
Result: "Migration verified.", **284** lines `ok`, **0** failed. The checks for
`add_location_preferences` (`seedLocationPreferenceBackfill` writes stock rows with known
times before the last deploy; `assertLocationDataUpdatedAtBackfill` runs first after it;
then `assertLocationPreferences`):

| Check | Result |
|---|---|
| a location with two stock rows gets the NEWER `"updatedAt"` of its own rows | ok |
| a second location gets the time of its own stock row | ok |
| a location with no stock row keeps `NULL` | ok |
| every one of the 19 locations reads the newest `"updatedAt"` of its own stock rows, or `NULL` when it has none | ok |
| `"LocationSort"` holds exactly `name, lastUpdated, lastVisited, custom` | ok |
| `"User"."locationSort"` is a nullable `"LocationSort"`, and every existing `"User"` row reads `NULL` (no backfill) | ok |
| `"Location"."dataUpdatedAt"` is a nullable timestamp | ok |
| `"dataUpdatedAt"` is not on `"ItemStock"`, and `"locationSort"` is not on `"Household"` | ok |
| `"LocationPreference"` has exactly the planned columns, each with its type and nullability | ok |
| `"LocationPreference_pkey"` is the primary key on `("userId", "locationId")` | ok |
| `"LocationPreference_locationId_idx"` is a plain index on `("locationId")`, and the table has exactly two indexes | ok |
| exactly two foreign keys, `"locationId"` → `Location` and `"userId"` → `User`, both `ON DELETE CASCADE` (read from the catalog, not with `LIKE`) | ok |
| four rows (two people × two locations) are accepted; a new row reads `"customOrder"` and `"lastVisitedAt"` `NULL` | ok |
| a second row for the same person and location is refused (`23505`); a row for an unknown location or an unknown person is refused (`23503`) | ok |
| deleting a location deletes its preference rows and keeps another location's; deleting a `"User"` deletes theirs and keeps another person's | ok |
| the 5 `Location` reads and deletes that run BEFORE the last deploy still work (each now has a `select`, so they never ask for `dataUpdatedAt` before it exists) | ok |

**Mutation, run by the main session the same day, with its own consent:** the backfill
`UPDATE` deleted from the migration. Result: `FAIL: a location with two stock rows gets the
NEWER "updatedAt" of its own rows, 2026-03-04T05:06:07.123Z (read: NULL)`, exit 1. The file
was restored from a copy and checked with `cmp`. So the backfill check can fail.

No file under `apps/server/prisma/` or `apps/server/scripts/` changed after that run
(checked in task M.6 with `git log --oneline 415cbf02..HEAD -- apps/server/prisma/
apps/server/scripts/`, which is empty at `14f9501c`). That proves the migration on a
database built from the committed history. It does NOT prove it on production data. That
is 14.3.

### 14.3 Rehearse on a FRESH Neon branch of production

**Main session, with the owner's consent.** Do this inside the same release rehearsal as
11.3 and 12.3, on the same fresh branch, after all seven migrations are applied. The rules
of 9.3 hold.

```sql
-- H7b-1. The new table exists and holds nothing. Expect 0.
SELECT count(*) AS preferences FROM "LocationPreference";

-- H7b-2. The enum. Expect four rows: name, lastUpdated, lastVisited, custom.
SELECT e.enumlabel
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'LocationSort' ORDER BY e.enumsortorder;

-- H7b-3. The two foreign keys. Expect exactly two rows, both confdeltype c (CASCADE):
--        LocationPreference_locationId_fkey and LocationPreference_userId_fkey
SELECT conname, confdeltype
FROM pg_constraint
WHERE conrelid = '"LocationPreference"'::regclass AND contype = 'f'
ORDER BY conname;

-- H7b-4. The backfill. Expect 0: no location whose "dataUpdatedAt" differs from the
--        newest "updatedAt" of its own stock rows (NULL when it has none).
SELECT count(*) AS wrong
FROM "Location" l
LEFT JOIN (SELECT "locationId", max("updatedAt") AS m FROM "ItemStock" GROUP BY 1) s
  ON s."locationId" = l.id
WHERE l."dataUpdatedAt" IS DISTINCT FROM s.m;

-- H7b-5. No sort is stored yet. Expect 0.
SELECT count(*) AS with_sort FROM "User" WHERE "locationSort" IS NOT NULL;
```

| Check | Expected | Result |
|---|---|---|
| H7b-1 | 0 | 0, rehearsal of the households release, 2026-11-23 |
| H7b-2 | `name`, `lastUpdated`, `lastVisited`, `custom` | `name`, `lastUpdated`, `lastVisited`, `custom`, rehearsal of the households release, 2026-11-23 |
| H7b-3 | two rows, both `c` | two rows, both `c`, rehearsal of the households release, 2026-11-23 |
| H7b-4 | 0 | 0, rehearsal of the households release, 2026-11-23 |
| H7b-5 | 0 | 0, rehearsal of the households release, 2026-11-23 |

**Stop rule:** any other answer means the migration did not apply as written. Do not
deploy. Find out why with the main session.

**H7b-4 is true only right after the migration.** Once the new server runs, every stock,
cart or log write moves `dataUpdatedAt` to "now", which is later than the stock row's time
for a cart or log write. Run it on the rehearsal branch, before any server points at it.

### 14.4 The order: server first, then the web

This is the order of the whole households release (section 8.3). H7b does not change it.

- **New web on an old server does not work.** The new bundle selects
  `Location.dataUpdatedAt` and `Location.lastVisitedAt` in `GetLocations` and
  `GetHouseholdLocations`, and `myLocationSort`. An old server fails GraphQL validation, so
  the location switcher and Settings › Locations fail on every cloud page.
- **Old web on the new server works, with three changes the old bundle cannot see:**

| What the old bundle does | What it gets from the new server |
|---|---|
| its switcher sorts by `Location.order` | the person's OWN order. For a person who never reordered, that is the shared order, the same as before |
| its drag on Settings › Locations calls `reorderLocations` | the drag now saves the person's OWN order, for any household role. It no longer changes what other people see. The answer has the same type |
| it reads `Location.isDefault` | `isDefault` still follows the SHARED order (the old-bundle shim, `firstLocationIdOf`). After a person reorders, the location marked default may not be first in their own list |

- **Visits made with an old bundle are not recorded.** Nothing calls `markLocationVisited`.
- **After the server deploy, the shared order is frozen.** Only `createLocation` (at the
  end) and imports write it. A person who reorders gets their own order; everyone else keeps
  the order they saw.

### 14.5 Checks after the deploy

**Owner, after the web deploy.** Use one TEST household with two TEST people (A, an owner
or manager, and B, a `member`) and at least three locations whose names are not in the
shared order. Not the real household.

1. A, **Settings › Locations**: **Sort by** shows **Custom**. Drag one location to another
   place. Reload: the new order stays.
2. B, on another device: the list keeps the old order (A's drag did not change it). B also
   sees drag handles, and can drag B's own order.
3. A: choose **Name**. The list is by name, and so is the location switcher. Open the app
   on a second device as A: it shows **Name** too.
4. A: change the stock of an item at the location that is LAST by name. Open
   Settings › Locations again (or reload), choose **Last updated**: that location is first.
   It does not move while the page stays open (owner decision O58-A); that is expected.
5. A: pick a location in the switcher on the pantry. Open Settings › Locations again, choose
   **Last visited**: that location is first.
6. A: choose **Custom** again to leave the household as it was.

Result: Not recorded. D.11 of the release plan (`2026-11-23-households-release-plan.md`) was done by the owner on 2026-11-23 and 2026-11-24, but the result of this check was not written down.

### 14.6 If something is wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| the location switcher and Settings › Locations fail on every cloud page | the web is new and the server is old, or the server was rolled back | check the Railway deployment is the new commit |
| "Last updated" puts every location in name order | `dataUpdatedAt` is `NULL` everywhere: the backfill did not run, and nothing was written since | run H7b-4 on production with the main session. Each location fixes itself on its next stock, cart or log write |
| "Last updated" does not change after a stock change | the page was open; the lists refetch only on `LOCATION` (O58-A) | reload the page. Not a bug |
| one person's drag changes another person's list | an old server, or a bug in `reorderLocations` | check the deployment; report it |

**Rollback.** The migration is additive, so an older server runs on the new schema: it
ignores the new table and columns. But roll back the web FIRST (or together): an H7b bundle
on an older server loses the location lists (14.4). After a server rollback, every person
sees the SHARED order again, and a drag writes the shared order again, `manager` only. The
`LocationPreference` rows stay, unused, until the server comes back.

**Known gaps** (from the plan): "Last updated" does not move live (O58-A); a reorder does not
reach the person's other open tabs live (`publishesNothing`); `dataUpdatedAt` is written
after the commit, so a crash between the two loses one timestamp; visits made with an old
bundle or in local mode are not recorded; the shared `Location.order` stays until the
release after households.

## 15. Every checkpoint release: the whole cloud E2E suite on Neon

Added 2026-11-23 by E2E speed plan task S.9 (owner answer P10-A). Plan:
[`../testing/2026-11-22-e2e-speed-plan.md`](../testing/2026-11-22-e2e-speed-plan.md).

**Why.** Since that plan's PR B, the per-PR gate runs the cloud specs on a Postgres on the
developer's Mac, and only 8 spec files on the Neon test branch. A local query takes well
under 1 ms; a Neon query about 52 ms. So a wait that is long enough only on a fast database,
or a race that needs a slow one, can pass every PR gate and still fail on Neon. This step
runs EVERY cloud spec on Neon once, before the release.

**Who:** the main session, alone on the machine (no other E2E run, no `pnpm test`).
**When:** before the deploy day, after the last PR of the release is merged into `develop`,
on a checkout of `develop` at the commit that will be released. Do it AFTER any
`verify:migration` run on the TEST branch: that run drops and rebuilds the schema, and the
E2E server starts on whatever it left.

```bash
pnpm test:e2e:all:neon
```

It runs three rows: `local`, `cloud-neon` with the whole cloud list on the Neon test branch
(`E2E_DATABASE=neon`, `E2E_NEON_FULL=1`), and `pwa`. It needs `TEST_DATABASE_URL` in
`apps/server/.env`, as before. It never touches production or the dev database.

| Check | Expected | Result |
|---|---|---|
| every row | green, 0 failed | green, exit 0 (2026-11-23): `local` 179 passed / 11 skipped (3m48s), `cloud-neon` 212 passed / 8 skipped (36m13s), `pwa` 73 passed (1m36s) |
| `cloud-neon` counts | the same tests as the `cloud` row of the last per-PR gate (220 collected on 2026-11-23) | 220 collected, the same |
| commit | the `develop` commit that will be released | `e05ec1e7`, the commit released in #403 |

**Stop rule:** a failed test is a stop, as in the root `CLAUDE.md`, *Verification Gate*.
Copy `e2e-results/` (it holds `test-results-cloud-neon/`) aside before any re-run, and tell a
real failure from a phantom with the three proofs there. A test that fails on Neon and
passes on the local database is a real difference, not noise.

**Measured on `chore/e2e-speed-b` at `aa327e69`, 2026-11-23** (E2E speed plan task S.9):
all green, **44m33s** wall clock. `local` 3m47s (179 passed / 11 skipped), `cloud-neon`
39m10s (212 passed / 8 skipped), `pwa` 1m36s (73 passed).

## Where this file lives, and why

In `docs/global/backend/`, beside the H3a, H3b and H3c-1 runbooks. A person who opens a
runbook during a deploy looks for deploy documents, not for a feature folder.
