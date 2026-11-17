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

Added 2026-11-17 by H5 task F.9. **H5a is built on `feature/households-h5` and waits for its
PR. It is not merged and not deployed.** Plan:
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
| **old web, new server** (server first) | **works.** The old bundle selects no new field. Two small things: an old bundle can delete the household's last location, because the server no longer refuses it, and then Pantry, Shopping and Cooking show a spinner that never ends (the old bundle has no empty screen). No data is lost; adding a location from the settings page ends it. |
| **new web, old server** (web first) | **cloud mode is unusable.** `GetLocations` selects `myRole`, which the old server does not have, so the query fails GraphQL validation and no page can load its location. Also, **no vendor can be created at all**: the new `CreateVendor` document declares `$locationId: ID`, and the old argument is `ID!`, so every call fails with `Variable "$locationId" of type "ID" used in position expecting type "ID!"`, with or without a location |

### 8.3 H5a in the same checkpoint release as H3a — NO safe order

**This is a problem the H5 plan did not see, and it needs an owner decision before that
release.** The plan said "H5a adds no new conflict with the H3a rule (web before server)".
That is not true:

| Order | What is live in the gap | Effect |
|---|---|---|
| server first | `main`'s old bundle on the new server | the old bundle selects `Location.isDefault`, which H3a removes: **every location query fails** (H3a runbook, section 2) |
| web first | the new bundle on `main`'s old server | the new bundle selects `Location.myRole`, which the old server does not have: **every location query fails** too |

H3a's "web first" rule works only because H3a's bundle "selects no field the old server
lacks, except in the new `GetHousehold` query" (H3a runbook, section 2). H5a's bundle breaks
that: `myRole` is in `GetLocations`, which every page needs.

**Web first is still the less bad order**, for the PWA reason in the H3a runbook: a device
keeps its old bundle until the person accepts the update prompt, and the old bundle works on
the old server. So in a web-first gap only the devices that took the update are broken; in a
server-first gap every device is broken until it updates. But neither order is safe.

Options for the owner (not decided here):

1. **Two checkpoint releases**: the first carries H3a to H4 (web first, the H3a rule), the
   second carries H5 (server first, section 8.2). Each gap is then safe or nearly safe. The
   plan's decision T13 ("H5a, H5b and H5c must all be in `develop` before that release")
   would change.
2. **One release, gap as short as possible**: web first, then the server at once, and ask
   people not to accept the update prompt until the server is live.
3. A web change so a missing `myRole` does not fail the query. Not built, and not simple:
   GraphQL validation fails the whole document, not one field.

Not checked here: whether H3b, H3c-1, H3c-2 or H4 already added a field to a query that
every page needs. The H4 runbook (section 2.2) says H4's new query is only used by import.

### 8.4 Checks after the deploy

1. As the owner, open **Settings → Household → Locations**. Every location shows a role
   text ("Organizer").
2. Delete a location that holds nothing, until one is left; delete the last one too (on a
   test household, not a real one). Pantry shows "You have no locations in this household
   yet" and **Create a location**. Create one; the pantry comes back.
3. Create a vendor. It must work, with a location and in an empty household.

## Where this file lives, and why

In `docs/global/backend/`, beside the H3a, H3b and H3c-1 runbooks. A person who opens a
runbook during a deploy looks for deploy documents, not for a feature folder.
