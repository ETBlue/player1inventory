# Households — sharing locations and handing over ownership

**Date:** 2026-10-04
**Status:** 🔲 Designed, not built
**Branch:** `feature/households`
**Brainstorming log:** [2026-10-03-brainstorming-households.md](2026-10-03-brainstorming-households.md)
(27 decisions, with the reason for each — read it for the *why*; this doc gives the *what*)
**Changes:** [Location RBAC](2026-08-29-design-location-rbac.md). Its binding rule stays. Its
role table is replaced, and its six open questions are answered (see the last section).
**Blocked by:** nothing since 2026-10-08. Cloud-locations PR 5 merged as #332 (see *Sequencing*).
**Fixes when built:** issue #273 (unchecked tag / vendor ids). Issue #327 (import takes over
another user's rows) was fixed separately on 2026-10-28 (#354); H4 moves that guard to the
household scope.
**H3 plan:** [2026-11-04-households-plan-h3a.md](2026-11-04-households-plan-h3a.md). H3 is
split into two PRs, H3a and H3b. That plan's decisions H1–H16 were written back into this doc
on 2026-11-04. Each change below names its decision, for example "H3a plan decision H1".
**Do not confuse the decision numbers H1–H16 with the phases H1–H7.** A phase is always
written "phase H1"; a decision is always written "decision H1".

**Already done before H3a: `fix/catalog-write-scope` (PR #371, merged 2026-11-04).** Seven
tag, tag type and vendor writes changed rows by `where: { id }` alone, without checking whose
row it was. They now call `requireOwnRowOrUnclaimed` before they write: `updateVendor`,
`deleteVendor`, `updateTagType`, `deleteTagType`, `createTag`, `updateTag` and `deleteTag`
(for `createTag` and `updateTag`, the check is on `typeId` and `parentId`). See
`docs/global/bugs/2026-11-04-bug-unscoped-catalog-writes.md`. H3a moves the `typeId` /
`parentId` checks into its new `requireCatalogIds` helper (H3a plan task 3.7).

## Summary

### Where this sits

Cloud mode is single-user today. Every cloud row carries a flat `userId`, and
`requireLocationRole` (`apps/server/src/lib/authz.ts`) ignores its `role` argument. A family
cannot share a pantry, and if the account holder dies, nobody can take over their data.

This design adds **households**. A household owns a catalog (items, tags, vendors, recipes,
shelves) and a set of locations. People join a household, and get a role on each location
separately.

User stories:

1. As a location owner, I want to add members to my locations, so that I can share my pantry
   and cart status with my family.
2. As a location owner, I want to transfer ownership when I choose, or have it given to my
   family automatically when my account is deleted, so that my family can still manage the
   location after I pass away.

### Relation to other work

| Work | Relation |
|---|---|
| Cloud-locations PR 5 (drop `Item`'s stock columns and the dual-write bridge) | ✅ Merged 2026-10-08 (#332). It deleted `lib/stockDualWrite.ts` and two of the `isDefault` reads. |
| Issue #273 | Fixed here, in H3a. Catalog ids are checked with `requireHouseholdRole` and a new helper, `requireCatalogIds` (H3a plan task 3.7). |
| `fix/catalog-write-scope` (PR #371) | ✅ Merged 2026-11-04, before H3a. Seven tag, tag type and vendor writes now check ownership through `requireOwnRowOrUnclaimed`. Not part of #273. |
| Issue #327, cart-id leak (`e2e/tests/cart-id-cross-user-leak.spec.ts`) | ✅ Fixed 2026-10-28 (#354), before this work. It added a second guard, `requireOwnRowOrUnclaimed`. H4 changes that guard's body to the new scopes (see *Authorization*). |
| Issue #330 (`replace` skips rows) | ✅ Fixed 2026-10-12 (#350), before this work. The import rewrite here must keep the fix (see *Known gaps*). |
| Issue #358 (`CartItem.userId` filters keep compiling and become wrong) | Answered here, in *Checkout with a shared cart*. Fixed in **H3b**, not H3a. The issue says nine filters; the H3 research found **15** (listed in that section). |
| Issue #359 (six `userId: String!` GraphQL fields) | Step one ✅ merged 2026-10-31 (#367): no web document selects them any more. Step two, removing the fields, is H3a task 3.14 (decision H11). See *Sequencing*. |
| Issue #360 (`ensureDefaultLocation` loses its race guard) | Answered here, in *First sign-in*. Fixed in H3a, with a claim column on `User` (decision H1). |
| Issue #361 (`Cart.id` is not a cuid) | Answered here, in *Authorization*. Fixed in H4. |
| Issue #320 (purge and `clearAllData` filters) | Answered here, in *Purge*. Fixed in H3a (filters, and the two-household test, decision H10) and H6 (new purges). |
| Local mode | Not changed, except for the Settings layout and route moves. |

### What the user gets (once merged AND deployed)

- A household owner or manager can invite family members with a link, and choose what each
  person can do on each location.
- Family members see the shared pantry, cart and cooking pages of the locations they were
  given, and can edit them if they are a participant or organizer.
- An owner can hand the household to someone else. If the owner's account is deleted, the
  family is asked who wants to become the owner, and the first to accept does.
- Owners and managers can see who changed roles, who joined, and who ran a purge.
- Settings is split into a household area and a personal area. Every user sees this change,
  including in local mode.
- Nothing changes on screen for someone who never invites anyone, except the Settings layout.

### What the developer gets

| DX gain | Specifics |
|---|---|
| Fewer ways to get it wrong | `requireLocationRole` and the new `requireHouseholdRole` finally check roles. A resolver that forgets to call them is the one remaining mistake, and the tests below are written to catch it. |
| Less to remember | `Location.isDefault` and its partial unique index go away in cloud, with every fallback that read them (`ensureDefaultLocation` in import, carts and logs). |
| Honest documentation | The RBAC doc's six open questions get answers. |

**DX cost, accepted.** Every route under `/settings/*` moves, so every E2E page object and test
that uses one changes. The data migration touches seven models. Two Clerk-related pieces are
new to run and test: a signed webhook, and E2E users without Clerk.

## Roles

There are two levels. Each role includes every right of the roles below it.

### Household roles

| Action | Owner | Manager | Member |
|---|---|---|---|
| Delete the household | ✅ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ |
| Make a member a manager, or a manager a member | ✅ | ❌ | ❌ |
| Rename the household | ✅ | ❌ | ❌ |
| Clear household / delete all locations (purge) | ✅ | ❌ | ❌ |
| Edit the catalog (items, tags, tag types, vendors, recipes, shelves) | ✅ | ✅ | ❌ (read only) |
| Import data | ✅ | ✅ | ❌ |
| Invite people, remove members | ✅ | ✅ (members only) | ❌ |
| Give or remove **any** location role, on any location, for anyone, including themselves | ✅ | ✅ | ❌ |
| Delete a location | ✅ | ✅ | ❌ |
| See every location's **name** (not its data) | ✅ | ✅ | ❌ |
| Read the activity log | ✅ | ✅ | ❌ |
| Create a location (and become its organizer) | ✅ | ✅ | ✅ |
| Export what they can read | ✅ | ✅ | ✅ |
| Leave the household | ❌ (transfer first) | ✅ | ✅ |

### Location roles

| Action | Organizer | Participant | Viewer |
|---|---|---|---|
| Read stock, cart, logs | ✅ | ✅ | ✅ |
| Edit pantry, shopping, cooking | ✅ | ✅ | ❌ |
| Leave the location | ✅ | ✅ | ✅ |
| Give or remove participant / viewer | ✅ | ❌ | ❌ |
| Rename the location | ✅ | ❌ | ❌ |
| Remove all items from the location (purge) | ✅ | ❌ | ❌ |

### Rules that cross the two levels

- **A household role gives no location data.** Owner and manager see the list of locations and
  manage roles on them, but they see the stock, cart and logs only of locations where they hold
  a location role. This is for bug tracing: unless someone was officially added to a location,
  they cannot have changed its stock.
- Every location role change is written to the activity log, so a manager who adds themselves,
  changes stock, and leaves again is still visible.
- Organizers cannot make organizers, and cannot remove another organizer.
- Anyone can leave a location, even its only organizer. A location with no organizer keeps
  working. Owner and manager see a **No organizer** warning and can give the role to someone.
- Item settings (unit, expiration mode, and the other fields on `Item`) are catalog. Per-location
  stock (packed, unpacked, expiry date, target, refill) is location data. So a participant who
  is only a household member can change stock but cannot create an item.

The member rules (read-only catalog) are a first version. They may change after user feedback.

## Data model (cloud only)

### New models

The *Phase* column was added on 2026-11-04 from the H3a plan. "H3a" means the model is built
in that PR.

| Model | Fields | Notes | Phase |
|---|---|---|---|
| `User` | `id` (Clerk id), `displayName`, `email?`, `lastSeenAt?`, `deletedAt?`, **`householdSetupAt?`** | See *Clerk integration*. `email` is optional: a Clerk account may have none, and `user.deleted` carries none (plan P10). `householdSetupAt` is the first sign-in claim column (decision H1, see *First sign-in*) | phase H2; `householdSetupAt` in H3a |
| `Household` | `id`, `name`, `ownerId?`, `ownerGoneAt?`, `createdAt`, `updatedAt` | `ownerId` is null after the owner's account is deleted, until someone accepts. `ownerId` **mirrors** the owner's `HouseholdMember` row and is written in the same transaction as that row (decision H15). `onDelete: SetNull` on the `ownerId` relation | H3a |
| `HouseholdMember` | `householdId`, `userId`, `role` (`owner` / `manager` / `member`), `joinedAt` | Primary key `(householdId, userId)`. **This row is the source of truth for rights**, not `Household.ownerId` (decision H15). A partial unique index, `HouseholdMember_one_owner_key ON ("householdId") WHERE role = 'owner'`, allows at most one `owner` row per household, so two owners are impossible | H3a |
| `LocationMember` | `locationId`, `userId`, `role` (`organizer` / `participant` / `viewer`), `createdAt` | Primary key `(locationId, userId)`. The person must be a `HouseholdMember` of the location's household | H3a |
| `HouseholdInvite` | `id`, `householdId`, `token` (unique), `householdRole`, `locationRoles` (JSON list of `{locationId, role}`), `createdBy`, `expiresAt`, `usedAt?`, `usedBy?`, `revokedAt?` | Single use, 7 days | H5 |
| `OwnershipOffer` | `householdId`, `toUserId`, `fromUserId?`, `kind` (`transfer` / `handover`), `createdAt`, `dismissedAt?` | `transfer`: the owner offered it. `handover`: the owner's account was deleted. Drives the prompt banner | H6 |
| `HouseholdActivity` | `id`, `householdId`, `actorId`, `action`, `targetUserId?`, `locationId?`, `details` (JSON), `createdAt` | See *Activity log* | H6 |
| `LocationPreference` | `userId`, `locationId`, `customOrder?`, `lastVisitedAt?` | Per-person location order and last visit | **H7** (decision H6) |
| `UserPreference` | `userId`, `locationSort` (`name` / `lastUpdated` / `lastVisited` / `custom`) | Per-person sort mode. May be merged into `User` | **H7** (decision H6) |

**Role names are Prisma enums** (decision H14): `HouseholdRole` = `owner | manager | member`,
`LocationRole` = `organizer | participant | viewer`. An enum makes a typo fail at `tsc`.

**`LocationPreference` and `UserPreference` moved from H3 to H7** (decision H6). Nothing reads
them before H7's sorts. A column nobody reads is a column nobody tests.

**The `user` side of both member tables has no `onDelete`.** So a `User` row that still has
member rows cannot be deleted. Production never deletes a `User` row (phase H2 sets
`deletedAt`), so such a delete is a bug and should fail loudly. `/e2e/cleanup` deletes the
member rows first. (H3a plan task 3.3.)

### Changed models

| Model | Change |
|---|---|
| `Location` | `userId` → `householdId`. **Drops** `isDefault` and the partial unique index on `isDefault` (H3a). **Keeps `order` until H7** (decision H5, see below). **Adds `dataUpdatedAt` in H7, not H3** (decision H6) |
| `Item`, `Tag`, `TagType`, `Vendor`, `Recipe`, `Shelf` | `userId` → `householdId` (H3a). `Shelf.order` stays shared, because shelves are catalog |
| `InventoryLog` | `userId` stays, and now means **the author**. Its scope comes from `locationId` |
| `Cart` | **Drops** `userId` — in **H3b**, not H3a. A cart belongs to its location and is shared by everyone there. The composite id `${locationId}:${vendorId \| 'no-vendor'}` stays |
| `CartItem` | `userId` stays, and now means **added by**. It stops being a scope: today every cart query filters cart items by `{ cartId, userId }` (`resolvers/cart.resolver.ts`), so in a shared cart each person would see only the items they added. Scope comes from the cart's location. Showing "added by" on screen is for a later phase. **H3b** re-derives the filters and adds `@@unique([cartId, itemId])`, merging duplicate rows in its migration (decision H8) |
| `ItemStock`, `ItemTag`, `ItemVendor`, `RecipeItem` | No change. Already scoped through a parent |

**`Location.order` is kept until H7** (decision H5). This doc first said H3 drops it, because
the order becomes personal (`LocationPreference.customOrder`). But personal order arrives only
in H7. Dropping `order` in H3 would remove drag-to-reorder, a working feature, for four phases.
Nobody shares a location before H5, so a shared order is harmless until then. Until H7,
`reorderLocations` needs the household role `manager`.

**The `userId` → `householdId` change uses two migrations in one PR** (decision H16). Dropping
`userId` breaks the compile of every resolver at once, so no task in between could pass the
gate. So:

| Migration | H3a task | What it does |
|---|---|---|
| `add_households` | 3.3 | adds the new tables and a **nullable** `householdId`, and fills it in (see *Migration of existing data*). `userId`, `order` and `isDefault` stay |
| `drop_user_scope` | 3.14 | a guard on null `householdId`, then `SET NOT NULL`, then drops `userId`, its indexes, `isDefault` and `Location_one_default_per_user_key` |

Between the two, code writes both columns. Both migrations deploy together, so production
never sees the middle state.

**Carts change only their role names in H3a.** Until H5 every household has one person, so
every `Cart.userId` and `CartItem.userId` filter still gives the right answer. H3b must merge
before H5 starts (see *Sequencing*).

### Writers of `dataUpdatedAt`

**Moved to H7** (decision H6). Only H7's "sort by last updated" reads `dataUpdatedAt`, so H3a
does not add the column or touch its writers. The list below is still what H7 must cover.
Re-check it when H7 is planned, because H3b changes `checkout` and `consumeRecipes`.

PR 5 added `writeStock` in `apps/server/src/lib/itemStockWrite.ts`, but it is **not** the only
place stock is written. Its own plan says so. Each of these must set `Location.dataUpdatedAt`,
or "sort by last updated" will be wrong for that path:

| Writer | File |
|---|---|
| `writeStock` (used by `upsertItemStock`, `checkout`, `consumeRecipes`) | `lib/itemStockWrite.ts` |
| `applyUnitSwitch` (writes inside its transaction) | `resolvers/itemStock.resolver.ts` |
| `addItemToLocation`, `removeItemFromLocation` | `resolvers/itemStock.resolver.ts` |
| `bulkCreateItemStocks`, `bulkUpsertItemStocks` | `resolvers/import.resolver.ts` |
| every cart and cart item mutation | `resolvers/cart.resolver.ts` |

The plan decides between calling a shared helper from each writer and a database trigger. A
test must list the writers, so that a new one cannot be added without it.

### Migration of existing data

**Replaced on 2026-11-04 by the H3a plan.** The first version of this section said "one
migration" with six steps. What changed, and why:

| First version | Now | Why |
|---|---|---|
| One migration | Two migrations in H3a, `add_households` and `drop_user_scope` | decision H16 (see *Changed models*) |
| A `User` row for every `userId` in the data | **Every** `User` row gets a household. A `userId` found in data with no `User` row first gets one, with `displayName` `'User'` | decision H2. Since phase H2, a person can have a `User` row and no data. Without a household they would land on the empty "no household" screen |
| Copy `order` into `LocationPreference.customOrder` (step 5) | Not done in H3a. `Location.order` stays | decisions H5 and H6. Both the column and the table belong to H7 |
| Drop `isDefault` and its index (step 6) | Done in the second migration, `drop_user_scope` | decision H16 |
| The household name is translated | The migration writes `<displayName>'s Household` **in English** | decision H3. SQL cannot translate. Only first sign-in knows the user's language. The owner can rename it (decision H4) |

The migration `add_households` (H3a plan task 3.3), in order:

1. Create the two enums and three tables (`Household`, `HouseholdMember`, `LocationMember`). Add
   `User.householdSetupAt`. Add the partial unique index `HouseholdMember_one_owner_key`
   (decision H15).
2. Insert a `User` row, `displayName` `'User'`, for every distinct `userId` in the ten tables
   that have one and no `User` row yet (decision H2).
3. Insert one `Household` per `User` row, named `<displayName>'s Household`, with
   `ownerId` = the user. Then one `HouseholdMember` row with role `owner` per household.
4. Insert a location `'Home'`, `order` 0, for every user with no location. (It also sets
   `isDefault` true, because the column still exists until `drop_user_scope` and today's code
   reads it.)
5. Add `householdId` to `Location` and the six catalog models, **nullable**, and fill it from
   the household whose `ownerId` is the row's `userId`.
6. Insert a `LocationMember` row with role `organizer` for every location, for its owner.
7. Set `householdSetupAt` = now for every user who got a household.
8. A guard that raises an exception, naming the bad rows, if a row in the seven tables still
   has a null `householdId`, a user has no owner membership, or a location has no organizer.
9. Foreign keys and indexes last.

The migration `drop_user_scope` (H3a plan task 3.14) makes `householdId` `NOT NULL` and drops
`userId`, `isDefault` and their indexes. `order` stays.

A user who never invites anyone sees the same pantry as before. The only visible changes are
the household name in the 🏠 item, "Home" as the name of a new account's first location, and
that any location except the last one can be deleted (see *First sign-in* and decision H13).

### Default names

| Thing | Name |
|---|---|
| A new user's household | `<name>'s Household`, e.g. "ET's Household". `<name>` is `User.displayName`, which phase H2 fills from Clerk, falling back to the part of the email before `@`, then to `"User"` (plan P10). Translated at first sign-in, into the app language the web client sends in the `x-app-language` header (`en` or `tw`; anything else gives `en`). The data migration writes it in English (decision H3). The owner can rename it (decision H4) |
| A new household's first location | "Home". A normal location, with nothing special about it. Translated the same way. In cloud this replaces "My Home"; local mode keeps "My Home" |

**Renaming the household is built in H3a** (decision H4): a `renameHousehold(name)` mutation,
owner only, and a name field on `/settings/household` in cloud. H3a starts to show the name, so
it must be changeable at the same time. As built (task 3.13): the server trims the name and
accepts 1 to 100 characters, refusing anything else with `BAD_USER_INPUT`; a manager or member
gets `FORBIDDEN` whatever name they send, and on the page sees the name as text. The name is
shown as stored, never capitalized, like vendor and location names.

## Authorization

**Role names in code.** `LocationRole` in `apps/server/src/lib/authz.ts` is still
`'viewer' | 'member' | 'owner'`, and resolvers pass `'member'` (for example `checkout`). H3a
renames it to `'viewer' | 'participant' | 'organizer'`, so `member` means only the household
role. The call sites change `'member'` → `'participant'` and `'owner'` → `'organizer'` (H3a
plan task 3.5). Both role sets are Prisma enums (decision H14).

The RBAC doc's rule stays: **never write `row.userId === ctx.userId` as an authorization check.**

| Helper | Use |
|---|---|
| `requireLocationRole(ctx, locationId, role)` | Already exists, signature unchanged. The body reads `LocationMember`. `role` is `viewer`, `participant` or `organizer`, and a higher role passes a lower check |
| `requireHouseholdRole(ctx, householdId, role)` | New. Reads `HouseholdMember`. Used for the catalog, members, invites, purges and activity |
| `requireHousehold(ctx)` | New in H3a (H3a plan task 3.5). Returns the caller's household id, read once per request and kept on the context. Runs first sign-in when the user has no household yet |
| `requireCatalogIds(ctx, householdId, model, ids)` | New in H3a (task 3.7, #273). Refuses with `Forbidden` unless every id is a catalog row of that household |
| `requireOwnRowOrUnclaimed(ctx, model, id)` | Already exists (added by #354 for the 22 bulk import mutations, and since PR #371 also used by seven tag, tag type and vendor writes). Its call sites do not move. H3a and H4 change its body, see below |

**`requireOwnRowOrUnclaimed` after households.** Today its body checks `where: { id, userId }`
for nine models.

**H3a changes the body once already** (H3a plan task 3.9). For the six catalog models, "own"
means the row is in the caller's household (`requireHousehold`). `InventoryLog`, `Cart` and
`CartItem` keep the `userId` check until H3b and H4. No call site moves. H4 then changes the
body again, to the scopes below, which name the **target** household.

Under this design those nine split into two scopes:

| Models | New check in the body |
|---|---|
| `Item`, `Tag`, `TagType`, `Vendor`, `Recipe`, `Shelf` (the catalog) | the row is in the **target** household, and the caller holds the household role import needs (owner or manager) |
| `Cart`, `InventoryLog` (through their `locationId`), `CartItem` (through its cart) | the row's location is in the target household, and the caller is its organizer or participant |

Three points matter for H4:

- **`Cart` is checked through its location, and its id must match its location** (issue #361).
  `Cart.id` is not a cuid. It is built as `${locationId}:${vendorId}` (`apps/server/src/lib/cartId.ts`),
  so anyone who knows a location id can build its cart ids. After households, co-members and
  former members know location ids. With an account-scoped check, a former member could ask
  "is this cart id free?" and learn which vendors a household shops with. So H4 does two things:
  the server refuses a cart whose id does not start with `${locationId}:`, and the location
  check runs first. A caller with no role on that location is refused before any cart id is
  looked at, so the "free or taken" answer is never given for a cart. The comment in
  `apps/server/src/lib/authz.ts` and the paragraph in root `CLAUDE.md` that say "the ids are
  cuid" must say "eight of the nine models" until then.

- **"In the target household", not "in any household I belong to".** A user can belong to two
  households. If the check were "any household I belong to", an import into household B of a
  backup from household A would find A's rows as `'own'`, and the upsert would **move** them
  from A to B. So the helper must also take the target household id.
- **It cannot follow the "same error for missing and not-yours" rule below.** An import must
  create new rows, so a free id has to return `'unclaimed'`. #354 says this on purpose, and the
  helper's comment explains why. The rule below applies to every other helper.

Every refusal throws the same `Forbidden` error, whether the row is missing or owned by someone
else, so a caller cannot probe for ids (as `requireLocationRole` does today).

Reads follow the same rules. A query for stock, carts or logs returns only locations where the
caller has a role. A catalog query returns the active household's catalog to every member.
The `itemCountBy*` queries (issue #273) count only within the caller's household.

Local mode has no role checks. Nothing in `apps/web/src/db/` changes for this.

## Flows

### First sign-in

**Rewritten on 2026-11-04 (decision H1).** Phase H2 made the first version of this guard
impossible. The first version is kept below the new one, because it explains the problem.

**Now (H3a).** The `User` row already exists: phase H2's `ensureUser` and the Clerk webhook
create it before anything else. The household is created on the **first request that needs
it** (`requireHousehold`, which the `locations` query also calls). One transaction:

1. **Claim:** `updateMany({ where: { id, householdSetupAt: null }, data: { householdSetupAt: now } })`
   on `User`.
2. **A count of 1** means this request won. In the same transaction it creates
   `<name>'s Household`, the owner's `HouseholdMember` row, a location "Home" with `order` 0,
   and an `organizer` row for the user on "Home".
3. **A count of 0** means the household was already set up, or another request won. It reads
   the winner's household.

| `householdSetupAt` | Has a `HouseholdMember` row | Result |
|---|---|---|
| null | — | first sign-in: claim and create, as above |
| set | yes | use that household; create nothing |
| set | no | throw `GraphQLError` with code `NO_HOUSEHOLD`; create nothing |

**Why the claim works.** Postgres makes the second `UPDATE` wait for the first transaction.
It then re-checks its `WHERE` and matches 0 rows. The proof runs against real Postgres in
`verify-migration.ts`: two connections, from two separate `PrismaClient` instances, each run the
claim for the same new user inside a transaction. Exactly one reports 1 row. A fake cannot
prove this.

**Why a column and not just "has a membership".** The column tells "never set up" from "left
their household". A person who never had a household gets one. A person who left one does not:
they see the **Create a household** screen (see *Create and delete a household*). Nobody can
leave before H5, so `NO_HOUSEHOLD` cannot happen in production in H3a, but it is tested.

**What else goes, as in the first version.** `ensureDefaultLocation`
(`apps/server/src/lib/defaultLocation.ts`) and its test are deleted (H3a task 3.5). The other
places that argue from the old index go in task 3.14: `src/schema/import.graphql`,
`DefaultLocationConstraintError` in `src/test/stockFake.ts`, the second-default assertion in
`scripts/verify-migration.ts` (replaced by the claim race proof above), and a line in each of
the two migration comments saying the index is gone.

**Import does not ask yet** (decision H12). The first version said the two import resolvers
stop falling back to a default, and ask the user instead (rule 3 of *The new id rule*). That
dialog is H4. Until H4, a log or cart row with no known location goes to the caller's **first
location by `order`** on which they are participant or higher (`fallbackImportLocation`).

**The first version, replaced.** "Steps 1 and 2 run in one transaction, and the `User`
primary key is the race guard (issue #360). The transaction starts with `user.create`. A second
concurrent first request fails with `P2002`, rolls back, re-reads and uses the winner's
household." This stopped working when phase H2 shipped: `ensureUser` and the webhook create the
`User` row first, so `user.create` would **always** fail with `P2002`, and no request would
ever create a household.

Background (issue #360): today `ensureDefaultLocation` has no lock. Two concurrent first
requests are kept from making two default locations only by the partial unique index
`Location_one_default_per_user_key`. H3a drops that index with `isDefault`, so the guard must
move. The claim column is where it moves to.

**The last location cannot be deleted** (decision H13). `Location.isDefault` used to stop the
default location from being deleted. With it gone, `deleteLocation` refuses the household's
last location with a new error code, `LAST_LOCATION`, until H5. An empty household has no
screen to land on before H5 builds the "no locations" screen. Any other location can now be
deleted in cloud. Local mode does not change.

Two deletes at once could both count two locations and both delete. To stop that,
`deleteLocation` first locks the household row (`lockHousehold` in
`apps/server/src/lib/household.ts`), so the second delete waits and then counts again after
the first one commits. `clearAllData` takes the same lock, also first, so the two cannot
deadlock. Not yet proved on real Postgres (plan H3a, task 3.16).

A person who signs up through an invite link gets their own household too, then joins the
inviting one.

### Invite and join

1. An owner or manager opens **Members › Invite** and chooses a household role (`member`, or
   `manager` — owner only) and, optionally, location roles (e.g. organizer of *Kitchen*).
2. The server creates a single-use link that expires after 7 days. It can be revoked until used.
3. The person opens `/join/$token`, signs in, sees the household name, who invited them and
   their roles, and presses **Join**.
4. They now have the household and the given locations.

| Case | Result |
|---|---|
| Already in this household | "You are already in this household." The link is not used up |
| Expired, used or revoked link | "This invite is no longer valid. Ask for a new one." |

### Location roles

- Owner and manager give or remove any location role on any location.
- An organizer gives or removes participant and viewer on their location, choosing from the
  household's members.
- A member who creates a location becomes its organizer.
- Anyone leaves a location from its page.

### Household roles, removal and leaving

| Who | Can do |
|---|---|
| Owner | Change a member to manager or back. Remove anyone |
| Manager | Remove a member. Not the owner, not another manager |
| Manager, member | Leave |
| Owner | Cannot leave; transfer first |

When someone leaves or is removed, their household role and all their location roles in that
household end at once. Everything they created stays. Their logs keep their `userId`, so history
still shows their name.

### Transfer ownership

1. The owner picks a manager or member and presses **Transfer**. This creates an
   `OwnershipOffer` of kind `transfer`.
2. The person sees a banner and presses **Accept** or **Decline**. Nobody becomes owner without
   agreeing.
3. On accept, they become owner and the old owner becomes manager. Location roles do not change.
4. The owner can cancel before it is accepted.

### Owner's account is deleted

The Clerk `user.deleted` webhook arrives for a household owner.

| Household state | Result |
|---|---|
| Owner was the only person | The household and all its data are deleted at once |
| Has managers | `ownerId` becomes null. Each manager gets an `OwnershipOffer` of kind `handover` |
| No managers, some members organize a location | Those members get the offer |
| No managers, no member organizes a location | All remaining members get the offer |

Each person sees: "The owner of *ET's Household* is gone. Do you want to become the owner?" —
**Accept** / **Not now**. The **first** to accept becomes owner, and every other offer is
deleted. "Not now" hides the banner for that person. They can still accept from the Members
page.

Until someone accepts, everyone keeps their own rights. Only owner-only actions are unavailable.

When a person who is **not** an owner is deleted, their household and location roles are
removed. Their `User` row stays with `deletedAt` set, and logs show them as "Deleted user".

Only account deletion starts a hand-over in this phase. See *Postponed*.

### Create and delete a household

- Anyone creates another household from the **Switch to…** dropdown. They become owner, and
  organizer of its first location, "Home".
- Only the owner deletes a household, by typing its name to confirm. Everyone loses access.
- A person with no household sees a screen with a **Create a household** button. The app does
  not create one by itself.
  - **Exception: first sign-in** (decision H1). A person whose `User.householdSetupAt` is null
    has never had a household, so the server creates one for them. A person who has a
    `householdSetupAt` but no membership has left or been removed; for them the server creates
    nothing and answers `NO_HOUSEHOLD`. Nobody can leave before H5. **No phase in
    *Sequencing* names the "no household" screen yet**; it must exist by the time leaving does.

### Checkout with a shared cart

`checkout` (`resolvers/cart.resolver.ts`) was written for one person per account. Its own
comment calls a cart row added during checkout "rare with one account per user". In a shared
cart it is common, and there are two more problems:

| Case | Today | Rule in this design |
|---|---|---|
| Someone adds a row after you opened the cart | The whole checkout fails with `BAD_USER_INPUT` | Checkout buys **only the cart rows the client sent**. Rows added later stay in the cart |
| Two people press checkout at the same time | No transaction. Both add the stock, so the purchase counts **twice** | Checkout runs in **one transaction** that removes the rows it buys. If they are already gone, it fails with "This cart was just checked out. Refresh to see it." |
| Someone changes the stock just before your checkout | The log stores the on-hand total the client computed, which is now wrong, with no error | The **server** computes the total from the saved `ItemStock` row, inside the transaction |

**Why the total moved to the client, and how this keeps that fix.** Parity-followup PR A (issue
#336) moved the log total to the client because the conversion needs `Item.amountPerPackage`,
and the resolver had only the `ItemStock` row. The server can read the `Item` in the same
transaction. The plan must move the conversion rule (`buildCheckoutLogQuantities`,
`apps/web/src/lib/checkoutQuantities.ts`) to code both sides can use, and keep its 6 unit
tests passing against the server version.

`consumeRecipes` sends a client-computed total for the same reason, so it has the same stale
total problem and gets the same fix.

**This whole section is H3b, not H3a.** The server cannot load `@p1i/types` at runtime today,
so sharing `buildCheckoutLogQuantities` needs a build step first (decision H7). The order is
H3a, then `chore/build-shared-types`, then H3b. Until H5 every household has one person, so
the old filters still give the right answer after H3a. H3b must merge before H5 starts.

**Every `CartItem.userId` filter is re-derived** (issue #358). The column stays and means "added
by", so `tsc` reports none of them. Scope comes from the cart's location, checked by
`requireCartLocation`.

**There are 15, not nine.** Issue #358 and the first version of this doc said nine. The H3
research (2026-11-03, measured at `e48bbe2f`) found 15. The lines were re-checked at
`8dde455a` on 2026-11-04 and still match. They will drift; find the code by name.

| File | Lines |
|---|---|
| `resolvers/cart.resolver.ts` | 137, 159, 161, 166, 174, 190, 201, 228, 375, 454 |
| `resolvers/itemStock.resolver.ts` | 199 (`removeItemFromLocation`) |
| `resolvers/import.resolver.ts` | 1577 (`clearAllData`) |
| `resolvers/purge.resolver.ts` | 26 (`purgeUserData`) |
| `lib/e2eCleanup.ts` | 83 |
| `lib/authz.ts` | 152, through the `cartItem` delegate of `requireOwnRowOrUnclaimed` |

The table below covers the `cart.resolver.ts` lines. H3a removes `purgeUserData` and changes
the `clearAllData` and `/e2e/cleanup` filters (see *Purge*), so those three are re-derived in
H3a. H3b handles the `cart.resolver.ts` and `itemStock.resolver.ts` ones. The `authz.ts` one
keeps `userId` after H3a; the H3a plan says "H3b moves carts, and H4 moves the body", and does
not say which of the two changes this line.

| Today (`cart.resolver.ts`) | After H3b |
|---|---|
| `cartItems`: `{ cartId, userId }` | `{ cartId }`. Everyone at the location sees every row |
| `cartItemCountByItem`, both branches | count rows in carts at locations where the caller has a role |
| `allCartItems`: `{ userId }` | rows in carts at locations the exporter can read (as *Export*) |
| add to cart: find the row `{ cartId, itemId, userId }` | `{ cartId, itemId }`. One row per item per cart, enforced by `@@unique([cartId, itemId])`; H3b's migration merges existing duplicates (decision H8). A second person adding the same item changes that row. "Added by" stays the first person (Decision 27) |
| update and remove a row: `{ id, userId }` | `{ id }`, then the row's cart location needs participant or higher |
| `checkout` read: `{ cartId, userId }` | the rows the client sent, inside the transaction (see above) |
| `checkout` delete: `{ cartId, userId, quantity > 0 }` | the rows it bought |
| `abandonCart` lookup: `Cart` by `{ id, userId }` | by `{ id }`. `Cart.userId` is dropped, so this line stops compiling |
| `abandonCart` delete: `{ cartId, userId }` | `{ cartId }`. The whole cart is cleared |
| `vendorCart` create: `data: { id, userId, locationId }` | no `userId`. This line stops compiling |

The same check applies to `InventoryLog.userId` ("the author"), flagged in
`resolvers/inventoryLog.resolver.ts`. The test for each row needs **two members** adding rows to
one cart. With one member, "rows I added" and "rows in this cart" are the same, so the test
cannot fail.

### Purge

These replace today's `purgeUserData`.

| Who | Action | Deletes | Keeps |
|---|---|---|---|
| Owner | Clear household | the catalog and all locations, with everything in them | the household, its members, their household roles |
| Owner | Delete all locations | all locations, with stock, carts, logs and location roles | the catalog, the household, its members |
| Organizer | Remove all items from this location | the location's stock rows and its cart | the location, its roles, its logs, the catalog |

Each asks the person to type the household or location name. Each is written to the activity log.

**No path deletes rows because of who created them** (issue #320). `userId` today means both
"owns" and "created". After H3 it means only "created", so it never selects what to delete:

| Event | What happens to the rows they created |
|---|---|
| A member leaves or is removed | They stay with the household (see *Household roles, removal and leaving*) |
| A non-owner's account is deleted | They stay. Logs show "Deleted user" |
| The owner's account is deleted | They stay, and the hand-over starts. Only when the owner was the only person is the household deleted |
| A `clear` import | The same as *Clear household*, so owner only (Decision 27). See *Import* |

So `purgeUserData` is removed. `clearAllData` (`resolvers/import.resolver.ts`) becomes the
*Clear household* filter. All 14 `deleteMany` filters in each become `householdId` or
location filters.

**What H3a does here** (H3a plan task 3.10):

- `purgeUserData` is removed. It has no web caller.
- `clearAllData` becomes the household clear, owner only. Its filters become `{ householdId }`
  or go through the location or item. `Cart`, `CartItem` and `InventoryLog` go through their
  location, not `userId`.
- **`clearAllData` then re-creates a "Home" location**, with an `organizer` row for the
  caller, in the same transaction. The plan gives decision H13 as the reason: the household
  must never be left with no location before H5. This differs from the *Clear household* row
  in the table above, which deletes "all locations" and keeps nothing of them.
- `/e2e/cleanup` deletes by the households the user **owns**, plus the user's own memberships
  in other households, then the three new tables, then the `User` row. It never deletes a
  household the user only belongs to. It covers 18 models (15 before).
- The other two purges in the table (*Delete all locations*, *Remove all items from this
  location*) and the danger zone stay in H6.

**Tests owed before the filters change.** Today only 3 of the 14 filters in each path have a
`where` assertion, and `purge-coverage.test.ts` checks only that each `deleteMany(` appears in
the source. The plan must:

1. Add the 11 missing `toHaveBeenCalledWith({ where: … })` assertions to both paths, before
   the filters change, so the change shows up as failing tests. (H3a task 3.2, before task
   3.10 changes the filters.)
2. Make `purge-coverage.test.ts` check the filter form, not only the call. (H3a task 3.2.)
3. Add a real-SQL E2E test with **two households**, or two locations with different people:
   purge one and assert the other's rows survive. Mutation check: drop one filter's scope, and
   the test must go red saying the other's rows are gone. **This is in H3a** (decision H10,
   spec `e2e/tests/purge-two-households.spec.ts`). The first version of this doc put it
   before H3, and the phase plan put it in H6. H3a changes the filters, so the test must exist
   when they change.

### Activity log

`HouseholdActivity` records: location role given or removed, household role changed, invite
created or revoked, joined, left, removed, ownership offered, accepted or declined, every purge,
and every import. Each row has who acted, what, on whom or which location, and when. Owner and
managers read it, newest first. Stock changes are not in it — they are in `InventoryLog`.

## Screens

The Settings area is rebuilt in **both** modes.

### Desktop

**Notes added by the plan (2026-10-31, P1–P6):**

- Before H1 the tag, vendor, recipe and shelf **list** pages were full-screen too. On desktop they now
  show the household sidebar. On mobile they stay full-screen with their own Back button.
- `/settings` decides by screen width (`useIsDesktop`, the Tailwind `lg` value): desktop goes to
  `/settings/household`, mobile shows the accordion.
- Until H3a the 🏠 item says "My data" in both modes. From H3a, in cloud, it shows the
  household name (local keeps "My data"). While the name is loading it shows "My data", so the
  label never flashes empty (H3a plan task 3.13). Members, Activity, Switch to…, the danger
  zone and `/settings/household/locations/$id` are not shown until the phase that builds them
  (H5, H6, H7, H6 and H5).

**Main sidebar.** The top half does not change: app name, location switcher, Pantry, Shopping,
Cooking. At the bottom, **Settings** is replaced by:

1. 🏠 household name — opens the household sidebar
2. 👤 user name — opens the user sidebar

**Household sidebar.** Replaces the main sidebar, with a back button at the top left. Items 1–8
render in the main area.

| # | Item | Route |
|---|---|---|
| 1 | Config: household name, export / import, danger zone | `/settings/household` |
| 2 | Members, invites, leave, transfer owner | `/settings/household/members` |
| 3 | Locations | `/settings/household/locations`, `/settings/household/locations/$id` |
| 4 | Shelves | `/settings/household/shelves` |
| 5 | Vendors | `/settings/household/vendors` |
| 6 | Recipes | `/settings/household/recipes` |
| 7 | Tags | `/settings/household/tags` |
| 8 | Activity | `/settings/household/activity` |
| 9 | Switch to… — dropdown of households plus **Create new** | — |

- The sidebar shown is decided by the URL: any `/settings/household/*` route shows it.
- **Back** goes to the last Pantry, Shopping or Cooking page visited.
- The item-9 dropdown looks as much as possible like the location switcher's dropdown.
- Detail pages (one tag, vendor, recipe, shelf, or an item) stay full-screen with no sidebar, as
  today.
- On desktop, `/settings` redirects to `/settings/household`. On mobile it shows the accordion
  (see *Mobile* below).
- The old `/settings/tags`-style routes are **removed with no redirect**. The only production
  user is the developer.

**User sidebar.** Replaces the main sidebar, with a back button. Its content renders **inside the
sidebar**; the main area does not change, and there is no route. Items: user name, email, theme,
language, data mode (sign in / sign out), last sign-in and account created date. Name, email and
dates come from Clerk's `useUser()`.

### Mobile

- The top bar and the bottom bar look the same as today.
- `/settings` is a two-item accordion: 🏠 household (open by default, holding the nine household
  items; 1–8 open their pages, 9 opens the dropdown) and 👤 user (closed by default, its content
  shown inside the accordion).

### Location pages

**List** (`/settings/household/locations`):

- **Sort by** name, last updated, last visited or custom. Drag handles show only for custom.
  The order is personal. (Built in H7. Until then the list keeps today's shared
  `Location.order` and drag-to-reorder, which needs the household role `manager` — decision
  H5.)
- Each row shows the name and the person's role. Owner and manager also see locations where they
  have no role, marked **No access**, and a **No organizer** warning where it applies.
- **Create location** for everyone. **Delete** for owner and manager.

**One location** (`/settings/household/locations/$id`): name (organizer edits), people and their
roles with **Add person** (organizer, owner, manager), danger zone with **Remove all items**
(organizer), and **Leave location**.

### Location switcher

- Lists only locations where the person has a role, in their own order.
- Shows a **View only** badge for a viewer.
- "Manage locations" links to `/settings/household/locations`.
- With no locations: pantry, shopping and cooking show "You have no locations in this household
  yet" and a **Create a location** button.

### Read-only views

| Who | Sees |
|---|---|
| Member (not manager) | Shelves, Vendors, Recipes and Tags with no add, edit or delete controls. On the item page, catalog fields are read only; the Stock tab stays editable where they are a participant. "Create item" is hidden in search |
| Viewer of a location | No quick-update button, no "add to cart", no checkout, no "cook" |

### Prompts

A banner at the top of the app shows each open `OwnershipOffer`:

- `handover`: "The owner of *ET's Household* is gone. Do you want to become the owner?" —
  **Accept** / **Not now**
- `transfer`: "*ET* wants to make you the owner of *ET's Household*." — **Accept** / **Decline**

### Invite and empty screens

| Route / state | Shows |
|---|---|
| `/join/$token` | household name, who invited you, your roles, **Join** |
| No household | "You are not in any household." **Create a household** |

### Local mode

| Element | Local mode |
|---|---|
| 🏠 item | "My data" |
| 👤 item | "Preferences" |
| Household sidebar | Hides Members, Activity and Switch to |
| User sidebar | Hides name, email and dates |
| Routes | The same as cloud (`/settings/household/...`) |
| Everything else in this doc | Not present |

## Import and export

### Export: everyone exports what they can read

| Part | Included |
|---|---|
| Catalog | Yes |
| Locations, with stock, carts and logs | Only those where the exporter has a location role |
| Members, roles, invites, activity, offers | Never |

### Import: owner and manager only

| A location in the file… | Result |
|---|---|
| does not exist anywhere | Created with its id. The importer becomes its organizer |
| exists in this household, importer is organizer or participant | Its stock, cart and logs are imported, with skip / replace as today |
| exists in this household, importer is viewer or has no role | Skipped. The importer is told which ones |
| exists in **another** household | The whole import is refused (see rule 2 below) |

**The `clear` strategy is owner-only** (Decision 27). `clear` deletes everything before it
imports, which is the same as *Clear household*. That purge is owner-only, so `clear` is
owner-only too. A manager sees only `skip` and `replace`.

### The new id rule

This **replaces** PR 4b's remap rule (`apps/web/src/lib/importData.ts:371-384`, "keep every
location id, except the file's default, which maps onto the destination's default"). That rule
needs a cloud default, and cloud no longer has one.

The new rule:

1. **Keep every id**, except in case 3 below.
2. **If any id in the file already belongs to another household, the whole import is refused.**
   This applies to every table. Nothing is written. The message says: "Some rows in this file
   belong to another household, so the import was refused. Nothing was imported." This applies
   even when the importer is a member of that other household. Otherwise the import would
   move that household's rows into the target household (Decision 26).
3. **The local default location** (id `'local'`) and **a file with no locations** both ask
   "Import into which location?" The household's "Home" is selected first, and **New location**
   is an option. This is one dialog for both cases.

Rule 2 is enforced by the **server**, not trusted from the client. Since #354 (2026-10-28) the
bulk import resolvers already check ownership of every id through `requireOwnRowOrUnclaimed`,
and an import that holds another account's id is **refused as a whole** with `FORBIDDEN`
(nothing is written). H4 keeps this behaviour. It changes two things:

- the guard's body checks the **target** household (see *Authorization*)
- the message says "another household" where it now says "another account". The i18n keys are
  `settings.import.importErrorForbidden`, `settings.import.importErrorForbiddenAfterClear` and
  `settings.postLoginMigration.errorForbidden`, in `en.json` and `tw.json`.

Copying rows from one household into another is postponed (see *Postponed*).

### Server code this replaces

These still read or write `isDefault` on `main` at `d63bd81f` and go in H3a. (One change since
this table was written: the import fallback does not go away in H3a. It moves to
`fallbackImportLocation` until H4, decision H12. See *First sign-in*.)

| Code | What it does today |
|---|---|
| `lib/defaultLocation.ts` (`ensureDefaultLocation`) | Creates "My Home" for a user with none. Called by the `locations` query and the two import resolvers. Its own comment says it goes in H3 |
| `lib/authz.ts` | `requireLocationRole` selects `isDefault` |
| `resolvers/location.resolver.ts` | `createLocation` writes `isDefault: false`; `deleteLocation` refuses the default |
| `resolvers/import.resolver.ts` | `bulkCreateLocations` / `bulkUpsertLocations` write `isDefault: false`; unknown cart and log locations fall back to `ensureDefaultLocation` |
| `schema/location.graphql`, `schema/import.graphql` | `isDefault: Boolean!` and comments that explain it |

### Copying between local and cloud

| Direction | What happens |
|---|---|
| Local → cloud | Into the user's own household (the one made at first sign-in). The local "My Home" goes where the user picks, as in rule 3 |
| Cloud → local | What the user can read in the **active** household. The **active** location becomes local "My Home"; every other location keeps its id |

Every import is written to the activity log.

## Clerk integration

Clerk stays the only source of truth for who a person is. The `User` table copies what this app
needs.

| Field | Source | How it arrives |
|---|---|---|
| `id` | Clerk | `ctx.userId`, already in every request |
| `displayName`, `email` | Clerk | webhook `user.created`, `user.updated` |
| `deletedAt` | Clerk | webhook `user.deleted` |
| `lastSeenAt` | this app | set on a signed-in request, at most once a day |

- **The webhook** is a new route, `POST /webhooks/clerk`, in `apps/server/src/index.ts`. Clerk
  signs each call with Svix, and the server must verify the signature before doing anything.
  The `user.deleted` event starts the hand-over flow, so a forged call would be serious.
- **Safety net.** If a webhook is lost, the request path creates a missing `User` row, reading
  name and email once from the Clerk API.
- **Setup.** A webhook secret in the Railway env and in the Clerk dashboard.
- **E2E.** The E2E header bypass skips Clerk, so the test server needs a way to create `User`
  rows and to send a fake `user.deleted` event. That route must exist only in E2E test mode,
  like `DELETE /e2e/cleanup`.

**Notes added by the plan (2026-10-31):**

- **P11.** In E2E mode, and when the Clerk API fails, the safety net creates the row with
  fallback values. It never fails the GraphQL request.
- **P13.** `user.deleted` for an unknown id creates the row with `deletedAt` set. The safety net
  never clears `deletedAt` and never overwrites a name the webhook wrote.
- **P14.** `/e2e/cleanup` also deletes the caller's `User` row, so it covers 15 models.
- **P15.** Nothing migrates the E2E test database. It is migrated by hand after H2's migration.
- **P16.** No `svix` package. `verifyWebhook` from `@clerk/express/webhooks` checks the
  Svix-format signature, using `CLERK_WEBHOOK_SIGNING_SECRET`. The route is mounted before
  `express.json()`, because the check needs the raw body.

`lastSeenAt` is not used in this phase. It is stored now so the postponed inactivity trigger
has data when it is built. The day is the UTC day (H2 task 2.4).

**`User.updatedAt` does not mean "the name or email changed".** `@updatedAt` moves on every
write, and `lastSeenAt` is written about once a day for every active user. Code that needs
"when did the profile change" must not read `updatedAt` for it.

## Postponed to a later cloud-improvement phase

| Postponed | Why |
|---|---|
| Inactivity as a hand-over trigger, with an owner setting (default 6 months, allowed 1–60) | Without a veto, it could hand over the household of an owner who is only on a long trip |
| Proactive claims, with a veto period (default 30 days, allowed 7–365) | The veto must reach an owner who no longer opens the app, which needs email |
| An email service (e.g. Resend or Postmark) | Not worth the cost for fewer than 5 users, all family |
| Copying rows from one household into another | It needs a new server query to find taken ids, and a remap of every reference. A future global pool would likely change how rows are matched, so building it now would probably be redone |
| A global pool of shared items, tags and vendors, kept by the site owner, with names in several languages. Households reuse them as prototypes: each household keeps its own copy, which it can change and reset to the prototype's values | A large feature of its own. The constraints for whoever designs it are listed below |

**Constraints for the global pool**, decided now so that this design does not block it
(Decision 26):

1. **An instance gets its own id, plus a separate `prototypeId` field.** It never reuses the
   prototype's id. One id names one row, so a shared id would stop households from changing
   their own copy. With separate ids, ids stay local to one household, and the import rules
   above stay as they are.
2. **An import never writes a prototype row.** A backup carries only the `prototypeId` link.
   If the prototype exists, the link is kept. If it does not, the link is dropped and the
   instance is kept. This is how #354 already treats a `tagId` that does not resolve.
3. **Only the site owner writes prototypes.** That is a new role, above households.
4. **Copying between households is redesigned with the pool.** It would likely match rows by
   `prototypeId` (both eggs come from the global egg, so they merge), and give the other rows
   new ids.

Consequence: in this phase, story 2 works only after someone deletes the owner's Clerk account.

## Sequencing

Household work starts **after cloud-locations PR 5 merges**. It changes `userId` to
`householdId` on seven models and removes `isDefault`, and PR 5 changes the same code.

The first version of this table was "a suggested split". Phases H1 and H2 were built as
listed. **H3 was split on 2026-11-04**: research on 2026-11-03 found it too large for one PR,
and the owner agreed to the order below. Detail:
[2026-11-04-households-plan-h3a.md](2026-11-04-households-plan-h3a.md), *Where H3a sits*.

| PR | Contents | User-visible |
|---|---|---|
| H1 | Settings layout and route moves (both modes). No backend change. Can start before PR 5 | Yes: new Settings layout |
| H2 | `User` model, Clerk webhook, `lastSeenAt`, E2E user creation | No |
| `fix/catalog-write-scope` (#371) | ✅ Merged 2026-11-04. Seven tag, tag type and vendor writes check ownership. A live security bug, so it did not wait for H3 | No |
| **H3a** | `Household`, `HouseholdMember`, `LocationMember`, `User.householdSetupAt`, the data migration (two migrations, decision H16), first sign-in, real role checks in both helpers, read scoping for every resolver, `isDefault` removed, the six `userId: String!` GraphQL fields removed, the household name in the 🏠 label, `renameHousehold`, `deleteLocation` refuses the last location, the two-household purge test, an E2E-only route that adds a second household member (`POST /e2e/household-members`, decision H9). Fixes #273, #360, #359 step two, and #320 for the filters H3a changes | Small: the household name and rename; "Home" for a new account; any location but the last can be deleted |
| `chore/build-shared-types` | A build step for `@p1i/types`, so the server can import shared code at runtime (needed by H3b, decision H7) | No |
| **H3b** | Shared carts: `@@unique([cartId, itemId])` (decision H8), the 15 `CartItem.userId` filters, `Cart.userId` dropped, checkout and `consumeRecipes` in one transaction with a server-computed total. Fixes #358. **Must merge before H5 starts** | No (one person per household) |
| H4 | Import and export: the new id rule, and `requireOwnRowOrUnclaimed` moved to the target household scope (#327 itself is already fixed by #354). Replaces H3a's import fallback location (decision H12) | The "Import into which location?" dialog |
| H5 | Invites, join, members page, location people page, switcher filtering, read-only views. Lifts H3a's "last location" refusal (decision H13) | **Yes: sharing works** |
| H6 | Transfer, hand-over, offers banner, purges, activity log | Yes: story 2 |
| H7 | Personal location order and sort, household switch and create. Now also `LocationPreference`, `UserPreference` and `dataUpdatedAt` (decision H6), and the end of the shared `Location.order` (decision H5) | Yes |

**H3a's GraphQL change is breaking, so deploy order matters** (issue #359). Six types declare
`userId: String!`: `Item`, `TagType`, `Tag`, `Vendor`, `Recipe`, `Shelf`. Removing a field that a
deployed web bundle still selects makes the whole query fail. #367 removed every selection on
2026-10-31, so H3a may drop the fields only when the web build live on Cloudflare is from that
commit (`8465406b`) or later. The H3a deploy runbook checks this first (decision H11). H3a
also removes `isDefault` from the `Location` type, which breaks a stale bundle the same way.

## Testing notes

The root `CLAUDE.md` rules apply. Points special to this design:

- **Every role test needs a fixture with a second person who has a different role**, and a
  location the caller has **no** role on. With one person, "check the role" and "ignore the
  role" give the same answer, and the test proves nothing.
- **The Prisma fakes must model the new constraints** — `LocationMember` and `HouseholdMember`
  lookups that honour every `where` key, and the primary keys on both. A fake that ignores
  `role` leaves every role check unpinned.
- **Each helper call is mutation-checked**: delete the check, the test goes red.
- **Real SQL.** At least one cloud E2E spec must run two signed-in users against the same
  location, because no unit test runs the resolvers against Postgres. H3a starts this before
  invites exist: an E2E-only route, `POST /e2e/household-members`, adds a second member to a
  household, and `e2e/tests/cloud-roles.spec.ts` checks the roles through GraphQL (decision
  H9).
- **The webhook** needs a test with a bad signature that is refused.

## Known gaps and risks

- **No way to copy one household into another in this phase.** A backup of household A
  cannot be imported into household B while A still holds its rows. It is refused (rule 2 of
  *The new id rule*). Creating household B and filling it from A's backup is the case that
  hits this. With fewer than 5 users it is rare.
- **Node is pinned to 22.17.1** (`.node-version`, `engines` in `package.json`, #353). Node 25
  breaks the web suite with `localStorage.setItem is not a function` in every file. Every
  implementation brief must say so.
- **The migration is large.** Seven models change their scope column in one go. It needs the
  same care as PR 3b's cart re-key: a deploy runbook, and a check against a branch of production
  data. (H3a splits it into two migrations that deploy together, decision H16.)
- **Existing households get an English name** (decision H3). The data migration cannot
  translate, so a `tw` user who signed up before H3a sees "<name>'s Household" until they
  rename it. Only first sign-in translates.
- **H3a's import fallback is a stopgap** (decision H12). A log or cart row with no known
  location goes to the caller's first location by `order`. H4's dialog replaces it.
- **The last location cannot be deleted until H5** (decision H13).
- **The read-only member rules are a first version** and may change after feedback.
- **Hand-over needs a deleted Clerk account.** If nobody deletes it, the family cannot take over.
- **No email.** A person learns of an invite only from the link, and of an offer only by opening
  the app.
- **`UserPreference` may be merged into `User`.** Left for the plan. The table moved to H7
  (decision H6), so H7's plan decides.
- **Household switch shows the previous household's cart — confirmed, must be designed for.**
  `main` now documents this in `apps/web/src/hooks/useLocations.ts` (the comment on
  `useDeleteLocation`). `AllCarts` and `AllCartItems` are safe today only because their readers
  filter by `activeLocationId`. A household switch changes the household, not the location, so
  while `activeLocationId` still names a location of the previous household, its cart passes that
  filter and renders. **Requirement:** a household switch must, in one step, set the active
  location to one in the new household (or none), and clear the household-scoped Apollo cache
  entries (`Player1InventoryCloudCache` is persisted, so the clear must reach it too). A test
  must switch household with a cart in the old one and see no old cart rows.
- **E2E specs that depend on the default location.** `e2e/tests/settings/data-mode-migration.spec.ts`
  and `e2e/tests/settings/import-strategies.spec.ts` (added after this design was first written)
  expect `isDefault`, the name "My Home", and a local → cloud copy that finishes **without** a
  dialog. The helpers `e2e/helpers/backupAssertions.ts` and `e2e/helpers/cloudSeed.ts` find the
  default by its flag. H3 and H4 must rewrite all of them. H3a task 3.15 rewrites them for
  "Home" and no default (about 20 files). It keeps the `clear` → "Home is re-created"
  expectation and the colliding item **and** the new item in `import-strategies.spec.ts`. H4
  rewrites them again for its dialog.
- **The import rewrite must keep the #330 fix.** Issue #330 was fixed on 2026-10-12 (#350).
  `runBulkBatches` in `apps/web/src/lib/importData.ts` now builds its resume key as
  `${mode}:${entityType}:${batchIndex}`. H4 changes the id rule in the same file. If the
  `mode` term is lost, the `replace` strategy skips the upsert pass again in cloud. The guard
  is the last assertion of `user can replace the matching rows and keep everything else` in
  `e2e/tests/settings/import-strategies.spec.ts`. That spec also depends on the default
  location (see above), so H4 must rewrite it **without** losing its colliding item plus its
  new item. With only colliding items, `toCreate.items` is empty and the guard cannot fail.
- **A second signed-in user in cloud E2E needs new test support.** The browser always runs as
  one fixed test user (`VITE_E2E_TEST_USER_ID`), and the API takes the user from the
  `x-e2e-user-id` header. A two-user spec needs a browser context per user. There is no
  test route yet to create a `User` row or to send a fake `user.deleted`. (Phase H2 added
  E2E-only user routes, and H3a adds `POST /e2e/household-members`, decision H9. A browser
  context per user is still H5.)
- **H3a's two migrations join `verify:migration`.** The script asserts the final state, so the
  PR 1 assertions on `isDefault` must be replaced in task 3.14. It must be added to the `MIGRATIONS` list in
  `apps/server/scripts/verify-migration.ts`. That script now refuses to run if a test database
  URL equals any other database URL in the environment.
- **Done in H1: the E2E route moves.** The forecast was 76 code lines (109 with comments) in 17
  E2E files. Commit `3b02a62a` moved 132 URL lines in 16 files and touched 17 files in all.
  `e2e/` is type-checked and linted inside the root `pnpm build`.
- **H3a breaks a stale browser bundle.** PR 5 was the first PR in the cloud-locations series that
  was not safe for an old bundle, and accepted it. H3a changes the GraphQL scoping and removes
  `isDefault` from the `Location` type, so it is the same kind of change. The plan must say so
  and plan the deploy the same way.

## Answers to the RBAC doc's open questions

| # | Open question in [2026-08-29-design-location-rbac.md](2026-08-29-design-location-rbac.md) | Answer |
|---|---|---|
| 1 | What governs entities with no location (tags, vendors, recipes, shelves)? | The household. Owner and manager edit, members read |
| 2 | Where does the role live? | `HouseholdMember` and `LocationMember` |
| 3 | What is owner-only? | Delete household, transfer ownership, manage managers, rename household, household-wide purges |
| 4 | Invite, join, leave | Invite links; leave a location or a household. See *Flows* |
| 5 | Data on removal | Stays in the household. Logs keep their author |
| 6 | Local mode | Out of scope, confirmed |

The RBAC doc's role table (owner / member / viewer on a location) is replaced by the two tables
in *Roles*.
