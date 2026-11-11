# Households H3a — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-11-04
**Branch:** `feature/households-h3a` (worktree `.worktrees/feature-households`), based on `main`
after `fix/catalog-write-scope` merges
**Design:** [2026-10-04-households-design.md](2026-10-04-households-design.md)
**Phase plan (H1, H2 and the H3–H7 outline):** [2026-10-31-households-plan.md](2026-10-31-households-plan.md)
**Brainstorming log:** [2026-10-03-brainstorming-households.md](2026-10-03-brainstorming-households.md)

**Goal:** Put every cloud row into a household, give every person real roles, and make every
server check read those roles. Each person still has exactly one household, so nothing is
shared yet. Sharing arrives in H5.

**Architecture:** New tables `Household`, `HouseholdMember` and `LocationMember`. `Location` and
the six catalog models (`Item`, `Tag`, `TagType`, `Vendor`, `Recipe`, `Shelf`) move from
`userId` to `householdId`. All checks go through `apps/server/src/lib/authz.ts`:
`requireHousehold`, `requireHouseholdRole`, `requireLocationRole` and
`requireOwnRowOrUnclaimed`. The household and its first location are created on the first
request that needs them, guarded by a claim column on `User`.

**Tech stack:** Express 5, Apollo Server 4, Prisma 6, Postgres on Neon (server); React 19,
Apollo Client 4, TanStack Router (web); Vitest, Playwright, Biome.

---

## Where H3a sits

The phase plan said H3 is one PR. Research on 2026-11-03 found it too large for one, and the
owner agreed to this order on 2026-11-04:

| Order | PR | Contents |
|---|---|---|
| 1 | `fix/catalog-write-scope` | Seven tag, tag type and vendor writes that never checked whose row they change. A live security bug, so it does not wait for H3 |
| 2 | **H3a (this plan)** | Households, roles, the data migration, first sign-in, scoping for every resolver, `isDefault` removed, the household name in the 🏠 label, rename |
| 3 | `chore/build-shared-types` | A build step for `@p1i/types`, so the server can import shared code at runtime |
| 4 | H3b | Shared carts: `@@unique([cartId, itemId])`, the `CartItem.userId` filters (15, not 9), `Cart.userId` dropped, checkout and `consumeRecipes` in one transaction with a server-computed total |

**Why carts can wait for H3b.** Until H5 every household has one person. So every
`CartItem.userId` and `Cart.userId` filter still gives the right answer after H3a. H3b must
merge before H5 starts.

**One exception: the E2E second member (decision H9, task 3.11).** That route puts a second
person in a household before H3b. Any spec that uses it on carts meets the problems below.

**Owed to H3b, found by the review of task 3.8:**

| # | Where | What goes wrong with two people in one household |
|---|---|---|
| a | `bootstrapCarts` (`cart.resolver.ts`) | It looks up the existing carts by their global `id`, but its final read filters by `userId`. A second member who bootstraps a location where the first member already made the carts gets an **empty** list: the carts exist, so none is created, and none has the second member's `userId`. `vendorCart` returns the first member's cart row, because it looks up by `id` only. A cart spec that uses the second member before H3b will see this |
| b | `removeItemFromLocation` (`itemStock.resolver.ts`) | Its cart delete still filters `CartItem.userId`, so a co-member's cart entries of the item at that location stay behind. Its log delete has no such filter (pinned by a test since the task 3.8 review) |
| c | `vendorCart(vendorId:)` (`cart.resolver.ts`) | It never checks that the vendor belongs to the location's household. A caller can create a cart `${locationId}:${foreignVendorId}` with another household's vendor id in it |

**Owed to H4, found by the review of task 3.9:** H4 changes the household that import writes
into from the caller's to the import's TARGET household. In `import.resolver.ts` that is
every `requireHousehold(ctx)` call, not only the two that carry a comment saying so
(`bulkCreateLocations` and `bulkUpsertLocations`). Counted 2026-11-04: **17** calls, 16 in
the mutations and one in `requireOwnItemStockRefs`. The review brief said "four places";
that was wrong. Count them rather than quote this:

```bash
git grep -c "requireHousehold(ctx)" -- apps/server/src/resolvers/import.resolver.ts   # 18: 17 calls + 1 comment
```

Also `fallbackImportLocation` (two calls) and the `requireOwnRowOrUnclaimed` body in
`lib/authz.ts`. `createImportedLocation` already takes `householdId` as an argument, so it
needs no change.

**Owed to H5, found by the review of task 3.9:**

- **`bulkUpsertLocations` must keep `householdId` (and `userId`) out of its `update`.** No
  test can see it today: when the location is in the caller's own household, writing the
  same `householdId` again changes nothing. H5 must add a two-household test (a caller who
  organizes a location of household B, importing into household A) and mutation-check it.
- **One cart at a location where the user lost their role refuses the whole cart-item
  batch.** `resolveCartItemParents` calls `requireLocationRole` on each cart's location, and
  that throws `FORBIDDEN` for the batch. Nobody can lose a role before H5. H5 must decide
  whether to skip those rows instead, like every other reference that does not resolve.

**Owed to H6 (ownership transfer), found by the review of task 3.10:** `clearAllData`
(`import.resolver.ts`) checks household role `owner` with `requireHouseholdRole` BEFORE its
transaction starts. Today nobody can stop being the owner, so the check cannot go stale. Once
H6 lets the owner hand the household to someone else, a transfer can commit between that
check and the clear, and a former owner would clear the household. H6 must move the `owner`
check inside the transaction, after `lockHousehold`, and make the transfer take the same
lock.

## What the user gets (once merged AND deployed)

- **The 🏠 item in Settings shows the household's name** in cloud, for example "ET's
  Household", instead of "My data". The owner can rename it on the household page.
- **A new cloud account's first location is called "Home"**, not "My Home".
- **Any location can be deleted except the last one.** Today the default location cannot be
  deleted at all. Local mode does not change.
- Nothing else is visible. Every cloud account sees the same pantry as before.

## What the developer gets

- **Real role checks.** `requireLocationRole` stops ignoring its `role` argument. A test can
  now fail because a viewer tried to write.
- **No more `userId` scope on seven models.** After the last task `tsc` refuses any code that
  scopes `Location` or the catalog by `userId`, because the column is gone.
- **Fixes:** #273 (unchecked tag, vendor and item ids; unscoped counts), #360 (the first
  sign-in race guard), #359 step two (the six `userId: String!` fields), #320 for the filters
  H3a changes.
- **Stricter fakes.** Four Prisma fakes that silently ignore an unknown `where` key start
  throwing on one, so a dropped scope can no longer pass a test.
- **A test route for a second household member**, so role tests can use real SQL before
  invites exist (H5).
- **Costs, stated plainly:**
  - The `/e2e/cleanup` list grows from 15 models to 18.
  - About 20 cloud specs change, because the default location goes.
  - The migration needs a deploy runbook, a rehearsal on a branch of production data, and the
    owner's consent twice: once for the test database, once for production.
  - **H3a breaks a stale browser bundle.** It removes `isDefault` and six `userId` fields from
    the GraphQL schema. A browser still running an older bundle gets a failed query until it
    reloads. The runbook plans for this, as PR 5's did.

## Rules every task brief must pass down

The eight rules in the phase plan (*Rules every task brief must pass down*) apply to every
task here: plain English, the report structure with "what did this plan get wrong", Node
22.17.1, this worktree only, measure your own baseline, mutation-check every new test, check
commits with `git show`, and run the verification gate. Copy them into every brief.

Four more for H3a:

9. **Never write `row.userId === ctx.userId` or `row.householdId === …` as a guard.** Every
   check goes through a helper in `lib/authz.ts`. A `where` filter on a read is fine.
10. **A role test needs a second person with a different role, and a location the caller has
    no role on** (design, *Testing notes*). With one person, "check the role" and "ignore the
    role" give the same answer.
11. **Do not touch `apps/web/src/db/`.** Local mode keeps `isDefault`, "My Home" and its own
    data model.
12. **Location data has two fixed patterns** (added by the review of task 3.8; tasks 3.9 to
    3.14 must follow them):
    - **A new read of location data** across several locations uses
      `locationIdsWithRole(ctx)` (`lib/authz.ts`). For one location it uses
      `requireLocationRole`. Never write a new membership query: one without the decision H18
      filter counts a stale `LocationMember` row of a person who left the household.
    - **A new write that takes an item id with a location id** runs
      `requireLocationRole(ctx, locationId, …)` FIRST, then
      `requireLocationItems(ctx, locationId, itemIds)`. The other order tells a stranger
      which location ids exist: an existing foreign location with a missing item id gives
      `BAD_USER_INPUT`, a made-up location id gives `FORBIDDEN`. Add the same test the six
      task 3.8 sites have ("a stranger … gets FORBIDDEN, even for a missing item") and
      mutation-check it by swapping the two calls.

---

## Decisions made while writing this plan

The owner agreed to Q1–Q12 on 2026-11-04 (the research questions, in the session record).
The rest were made while writing. Task 3.0 writes all of them back into the design.

| # | Gap found | Decision | Reason |
|---|---|---|---|
| H1 | H2 made the design's first sign-in guard impossible. The design starts the transaction with `user.create` and relies on the `User` primary key. Since H2, `ensureUser` and the webhook create that row first, so `user.create` would always fail with `P2002` | New column `User.householdSetupAt DateTime?`. First sign-in runs one transaction that starts with `updateMany({ where: { id, householdSetupAt: null }, data: { householdSetupAt: now } })`. A count of 1 means this request creates the household. A count of 0 means another request won, so it reads the winner's household | Postgres makes the second `UPDATE` wait for the first transaction, then re-checks its `WHERE` and matches 0 rows. The column also tells "never set up" (create one) from "left their household" (do not, design *Create and delete a household*) |
| H2 | The migration made a household only for users who have data | **Every** `User` row gets a household. A user with no location also gets "Home". A `userId` found in data with no `User` row gets a `User` row with `displayName` `'User'` first | Otherwise a person who signed in once and saved nothing lands on an empty "no household" screen |
| H3 | SQL cannot translate the household name | The migration writes `<displayName>'s Household` in English. First sign-in translates it, using the app language the web client sends in a new header, `x-app-language` | Only first sign-in knows the language. The owner can rename it |
| H4 | No phase owned renaming the household | H3a adds `renameHousehold(name)`, owner only, and a name field on `/settings/household` (cloud) | H3a starts showing the name, so it must be changeable |
| H5 | The design drops `Location.order` in H3, but personal order arrives in H7 | **Keep `Location.order` and drag-to-reorder until H7.** H3a drops only `isDefault` and its index. Reordering needs the household role `manager` | Dropping it would remove a working feature for four phases. Nobody shares a location before H5 |
| H6 | `LocationPreference`, `UserPreference` and `dataUpdatedAt` serve only H7's sorts | **All three move to H7** | Nothing reads them before H7. A column nobody reads is a column nobody tests |
| H7 | The design says to share `buildCheckoutLogQuantities` | H3b, after `chore/build-shared-types` | The server cannot load `@p1i/types` at runtime today |
| H8 | `CartItem` can hold two rows for one item | H3b adds `@@unique([cartId, itemId])` and merges duplicates in its migration | Carts are H3b |
| H9 | Two-user role tests need a second member, but invites are H5 | E2E-only route `POST /e2e/household-members`, inside `if (E2E_TEST_MODE)` like H2's routes | Real SQL for roles in H3a, not two phases later |
| H10 | The design puts the two-household purge test before H3; the phase plan puts it in H6 | **H3a**, task 3.10 | H3a changes the filters, so the test must exist when they change |
| H11 | #359: drop the six fields only once the live web build is from `8465406b` or later | Drop them in task 3.14. The runbook's first step checks the live build | Same rule as the design |
| H12 | The import resolvers fall back to `ensureDefaultLocation` for a log or cart with no location. The design replaces that with H4's "Import into which location?" dialog | Until H4, the fallback is the caller's **first location by `order`** on which they are participant or higher | Import must keep working between H3a and H4 |
| H13 | With `isDefault` gone, nothing stops deleting the last location, and the "no locations" screen is H5 | `deleteLocation` refuses the household's last location until H5 | An empty household has no screen to land on |
| H14 | The design's role and permission names | `HouseholdRole` = `owner \| manager \| member`. `LocationRole` = `organizer \| participant \| viewer`. Both are Prisma enums | The design's names. Enums so a typo fails at `tsc` |
| H15 | `Household.ownerId` and the owner's `HouseholdMember` row say the same thing | The `HouseholdMember` row is the source of truth for rights. `ownerId` mirrors it and is written in the same transaction as the row. A partial unique index allows one `owner` row per household | H6 needs `ownerId` to go null on hand-over while history stays. The index makes two owners impossible |
| H16 | A schema change that drops `userId` breaks the compile of every resolver at once, so no task in between could pass the gate | **Two migrations in this PR.** Task 3.3 adds the tables and a **nullable** `householdId` with a backfill. Task 3.14 sets it `NOT NULL` and drops `userId` and `isDefault`. Between them, code writes both columns | Each task can then pass the gate. Both migrations deploy together, so production never sees the middle state |
| H17 | Decision H13 covers only `deleteLocation`. `clearAllData` would also leave a household with no location, and the design says *Clear household* is owner only | `clearAllData` needs household role `owner`, and re-creates "Home" with an `organizer` row in the same transaction (owner agreed 2026-11-04). **Side effect, accepted:** the `clear` import strategy is owner only from H3a, before H4's import gating. Harmless while each household has one person. Whether H6's "Delete all locations" also keeps one location is for the H6 plan | The same reason as H13: no screen exists for a household with no location until H5 |
| H18 | The design says a `LocationMember` must be a `HouseholdMember` of the location's household. Nothing enforces it: Postgres cannot check it with a simple constraint | `requireLocationRole` counts a location role only when the matching `HouseholdMember` row also exists. The E2E member route (decision H9) refuses a location role without a household role | A person removed from a household (H5) must lose their location rights at once, even if a stale `LocationMember` row is left behind |

---

## File map

| File | Change | Task |
|---|---|---|
| `docs/global/permissions/2026-10-04-households-design.md` | the decisions above | 3.0 |
| `apps/server/src/test/stockFake.ts`, `cartItemFake.ts`, `shoppingFake.ts`, `inventoryLogFake.ts` | throw on an unknown `where` key | 3.1 |
| `apps/server/src/resolvers/purge.resolver.test.ts`, `import.resolver.test.ts`, `purge-coverage.test.ts` | the 11 missing `where` assertions; filter-form check | 3.2 |
| `apps/server/prisma/schema.prisma`, `migrations/<date>_add_households/` | new models, nullable `householdId`, backfill | 3.3 |
| `apps/server/scripts/verify-migration.ts` | new entry, assertions, the race proof | 3.3, 3.14 |
| `apps/server/src/test/householdFake.ts` (new), `ownedRowFake.ts` | doubles for the new models; scope column | 3.4 |
| `apps/server/src/lib/authz.ts`, `lib/household.ts` (new), `context.ts`, `index.ts` | helpers, first sign-in, `x-app-language` | 3.5 |
| `apps/server/src/lib/defaultLocation.ts` | deleted | 3.5 |
| `resolvers/location.resolver.ts`, `schema/location.graphql` | household scope, `LocationMember` | 3.6 |
| `resolvers/item`, `tag`, `vendor`, `recipe`, `shelf` `.resolver.ts` | household scope, #273 | 3.7 |
| `resolvers/itemStock`, `inventoryLog`, `cart` `.resolver.ts`, `lib/itemStockWrite.ts` | role names, read scope, item-in-household checks | 3.8 |
| `resolvers/import.resolver.ts` | household scope, fallback location | 3.9 |
| `resolvers/purge.resolver.ts`, `schema/purge.graphql`, `lib/e2eCleanup.ts`, `e2e/helpers/cloudTeardown.ts` | `purgeUserData` removed; household filters; 18 models | 3.10 |
| `lib/e2eHouseholds.ts` (new), `index.ts`, `e2e/helpers/cloudUsers.ts` | the member route | 3.11 |
| `apps/web/src/apollo/operations/locations.graphql`, `import.graphql`, hooks, `LocationList.tsx`, `packages/types/src/index.ts` | cloud stops using `isDefault` | 3.12 |
| `schema/household.graphql` (new), `resolvers/household.resolver.ts` (new), web sidebar and household page, `apollo/client.ts`, i18n | name, rename, language header | 3.13 |
| `migrations/<date>_drop_user_scope/` and the six `userId: String!` fields | `NOT NULL`, drops | 3.14 |
| about 20 files under `e2e/` | default location gone, "Home" | 3.15 |
| `docs/global/backend/<date>-deploy-runbook-households-h3a.md` (new), `CLAUDE.md` files, `docs/INDEX.md` | runbook and docs | 3.16 |

**Line numbers below were measured at `e48bbe2f` and will drift.** Each brief says "about".
Find the code by name.

---

## Task 3.0 — Write the decisions back into the design

- [ ] **Step 1:** In the design, update *New models*, *Changed models*, *Writers of
  `dataUpdatedAt`*, *Migration of existing data*, *First sign-in* and *Sequencing* to match
  H1–H16. Keep the old text where it explains a reason, and say what replaced it.
- [ ] **Step 2:** In the phase plan's H3 outline, add a pointer to this file and to the H3a /
  H3b split. Correct "nine" `CartItem.userId` filters to 15, and list them by file:line from
  the research: `cart.resolver.ts` 137, 159, 161, 166, 174, 190, 201, 228, 375, 454;
  `itemStock.resolver.ts` 199; `import.resolver.ts` 1577; `purge.resolver.ts` 26;
  `lib/e2eCleanup.ts` 83; and `lib/authz.ts` 152 through the `cartItem` delegate.
- [ ] **Step 3:** Commit: `docs(households): write the H3a decisions back into the design`.

## Task 3.1 — Four fakes throw on an unknown `where` key

**Why first:** H3a adds `householdId` and relation filters everywhere. Four fakes ignore a key
they do not know. A resolver that filters by `householdId` would then match every row in the
fake, and a test of a missing scope would pass. This is the PR 3c trap in root `CLAUDE.md`.

**Files:** `apps/server/src/test/stockFake.ts` (`matchesLocation` about 170, `matchesStock`
about 179), `cartItemFake.ts` (about 76-100), `shoppingFake.ts` (`matchesVendor` 66,
`matchesCart` 72), `inventoryLogFake.ts` (`matchesLog` 76), and their tests.

- [ ] **Step 1:** For each fake, write a failing test: a `where` with an unknown key throws an
  error that names the key and the fake. Copy the error shape from `ownedRowFake`'s
  `UnsupportedWhereKeyError`.
- [ ] **Step 2:** Implement. Make no other behaviour change.
- [ ] **Step 3:** Run the whole server suite. **A test that now throws was passing a key the
  fake ignored.** List each one in the report, with the key. Fix the fake to model that key
  properly, not the test. If a key needs a relation the fake cannot see, stop and report.
- [ ] **Step 4: Mutation check.** Remove the throw in one fake. Its new test goes red.
- [ ] **Step 5:** Commit: `test(server): make four Prisma fakes refuse an unknown where key`.

## Task 3.2 — The purge tests owed before the filters change (#320)

**Files:** `apps/server/src/resolvers/purge.resolver.test.ts` (its `where` assertions are only
at about 122-126), `import.resolver.test.ts` (`clearAllData`, about 621-660),
`purge-coverage.test.ts`.

- [ ] **Step 1:** In both test files, add the 11 missing
  `toHaveBeenCalledWith({ where: … })` assertions: `inventoryLog`, `cartItem`, `cart`,
  `recipeItem`, `recipe`, `itemTag`, `itemVendor`, `item`, `tag`, `tagType`, `vendor`.
  They assert **today's** filters. Task 3.10 changes them together with the code.
- [ ] **Step 2:** Make `purge-coverage.test.ts` check the filter form, not only that
  `prisma.<model>.deleteMany(` appears. For each of the three paths, read the source and
  assert each call's argument names a scope (`userId` today; task 3.10 changes the expected
  form). A call with `{}` or `{ where: { id: 'x' } }` must fail it.
- [ ] **Step 3: Mutation checks.** (a) Change one filter in `purge.resolver.ts` to
  `{ where: {} }`: both the unit test and `purge-coverage` go red. (b) The same in
  `clearAllData`.
- [ ] **Step 4:** Commit: `test(server): pin every purge filter before households changes them`.

## Task 3.3 — The schema and the first migration

**Files:** `apps/server/prisma/schema.prisma`, a new migration folder
`<YYYYMMDD>000000_add_households`, `apps/server/scripts/verify-migration.ts`.

- [ ] **Step 1: Schema.** Add:

```prisma
enum HouseholdRole {
  owner
  manager
  member
}

enum LocationRole {
  organizer
  participant
  viewer
}

model Household {
  id          String    @id @default(cuid())
  name        String
  // Mirrors the HouseholdMember row with role owner. Null after the owner's
  // account is deleted, until someone accepts (H6).
  ownerId     String?
  owner       User?     @relation("HouseholdOwner", fields: [ownerId], references: [id], onDelete: SetNull)
  ownerGoneAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  members   HouseholdMember[]
  locations Location[]
  // …and one back-relation per catalog model
}

model HouseholdMember {
  householdId String
  userId      String
  role        HouseholdRole
  joinedAt    DateTime      @default(now())
  household   Household     @relation(fields: [householdId], references: [id], onDelete: Cascade)
  user        User          @relation(fields: [userId], references: [id])

  @@id([householdId, userId])
  @@index([userId])
}

model LocationMember {
  locationId String
  userId     String
  role       LocationRole
  createdAt  DateTime     @default(now())
  location   Location     @relation(fields: [locationId], references: [id], onDelete: Cascade)
  user       User         @relation(fields: [userId], references: [id])

  @@id([locationId, userId])
  @@index([userId])
}
```

  On `User`, add `householdSetupAt DateTime?` (decision H1) and the back-relations. The `user`
  side of both member tables has no `onDelete`, so Prisma's default is used: a `User` row with
  members cannot be deleted. Production never deletes a `User` row (H2 sets `deletedAt`), so a
  delete that fails is a bug, and it should fail loudly. `/e2e/cleanup` deletes the member rows
  first (task 3.10).

  On `Location` and the six catalog models, add `householdId String?` and the relation, with
  `onDelete: Cascade`. **Keep `userId`, `order` and `isDefault`** (decision H16). Add an index
  `[householdId, …]` beside each `[userId, …]` index, with the same second column.
- [ ] **Step 2: The migration**, by hand, following `apps/server/prisma/CLAUDE.md` (the
  four-phase rule for a column on a table with rows). Its comment explains decisions H1, H2
  and H16. In order:
  1. Create the two enums and three tables; add `User.householdSetupAt`. Add the partial
     unique index `HouseholdMember_one_owner_key ON "HouseholdMember" ("householdId") WHERE
     role = 'owner'` (decision H15). Name it by hand, the same way
     `Location_one_default_per_user_key` was named.
  2. Insert a `User` row, `displayName` `'User'`, for every distinct `userId` in the ten
     tables that have one and no `User` row yet (decision H2).
  3. Insert one `Household` per `User` row: `id` = `gen_random_uuid()::text`,
     `name` = `"displayName" || '''s Household'`, `ownerId` = the user. Then one
     `HouseholdMember` row with role `owner` per household.
  4. Insert a location `'Home'`, `order` 0, `isDefault` true, for every user with no location.
     (`isDefault` still exists until task 3.14. Setting it keeps today's code working.)
  5. Add `householdId` to `Location` and the six catalog models as nullable, and fill it from
     `Household."ownerId" = row."userId"`.
  6. Insert a `LocationMember` row with role `organizer` for every location, for its owner.
  7. Set `householdSetupAt` = now for every user who got a household.
  8. A `DO $$ … RAISE EXCEPTION` guard that names the bad rows if: a row in the seven tables
     still has a null `householdId`; a user has no owner membership; a location has no
     organizer.
  9. Foreign keys and indexes last.

  Check it with the database-free diff in the phase plan's task 2.1 step 2. **Never pass
  `TEST_DIRECT_URL` as `--shadow-database-url`.**
- [ ] **Step 3: `verify-migration.ts`.** Add the folder to `MIGRATIONS` and its header. Read
  `apps/server/prisma/CLAUDE.md` *verify-migration.ts* first. Assertions:
  - each seeded user has exactly one household, named `<displayName>'s Household`, and is its
    owner
  - every location has an organizer, and it is the location's old `userId`
  - the seven tables have no null `householdId`, and each row's household is its old owner's
  - a user with no location got exactly one `Home`
  - a second `owner` row for one household fails with `P2002` (the partial index)
  - **the race proof (decision H1):** two connections each open a transaction and run the
    claim `UPDATE "User" SET "householdSetupAt" = now() WHERE id = $1 AND
    "householdSetupAt" IS NULL` for the same new user. Hold the first transaction open until
    the second has started. Exactly one reports 1 row and the other 0. Use two separate
    `PrismaClient` instances, because one client may serialize the calls itself.

  The seed runs **before** `add_user`, so it cannot seed a `User` row without data. Decide how
  to cover the "User row with no data" case (decision H2). For example, a second seed step
  after `add_user` is applied. Explain the choice in the report.
- [ ] **Step 4:** Root `pnpm build` and `pnpm test`. Nothing reads the new columns yet, so all
  tests stay green.
- [ ] **Step 5:** Commit: `feat(server): add households and backfill every row's household`.
- [ ] **Step 6 (main session, not a subagent):** ask the owner for consent. Then run
  `verify:migration` against the test database and `prisma migrate deploy` against
  `TEST_DIRECT_URL`, exactly as phase-plan task 2.1 step 6 did, including the empty
  `migrate diff`. Prisma 6 also needs the owner's own words after its warning, passed in
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.

  **Re-run owed (review of task 3.5).** The race proof was changed after this step was
  planned: it now runs Prisma's `tx.user.updateMany` with the same `where` as
  `ensureHousehold` (`lib/household.ts`), not raw SQL (commit `3ba61aeb`). The new version
  has only been type-checked. The next `verify:migration` run against the test database
  (with the owner's consent) must include it and report that it passed. If this step has
  already been run, it ran the old raw-SQL version.

## Task 3.4 — Fakes for the new models

**Files:** `apps/server/src/test/householdFake.ts` and test (new); `ownedRowFake.ts` and test.

- [ ] **Step 1:** `householdFake`: stateful stores for `Household`, `HouseholdMember` and
  `LocationMember`, following `ownedRowFake`'s rules (root `CLAUDE.md`). It must:
  - apply `where` key by key and throw on an unknown key
  - honour both composite primary keys and raise `P2002` on a taken one
  - model `HouseholdMember_one_owner_key`: a second `owner` row raises `P2002`
  - match `role` as a value or `{ in: [...] }`
  - support the relation filter the resolvers will use for reads, for example
    `location: { members: { some: { userId } } }`. Decide the exact shapes with task 3.5's
    helper design, and refuse every other nested key
  - support `updateMany` on `User.householdSetupAt` with `null` in the `where`, returning
    `{ count }`. `userFake` covers `User`, so extend it there instead if that is cleaner
- [ ] **Step 2:** `ownedRowFake`: let a store use `householdId` as its scope column for the six
  catalog models, keeping `userId` for `InventoryLog`, `Cart` and `CartItem`. `insert` requires
  whichever scope column the store uses.
- [ ] **Step 2b:** `userFake` still checks `where` keys per row, with its own
  `UserFakeUnsupportedError`. Move it to `checkWhere` (`apps/server/src/test/whereKeys.ts`),
  so its check runs once per call. Write `householdFake` on `checkWhere` from the start.
- [ ] **Step 3:** One test per rule. **Mutation check:** make the fake ignore `role`. A test
  must go red.
- [ ] **Step 4:** Commit: `test(server): add Prisma doubles for households and members`.

**Done (`fa2b45ae`), with review fixes in `52b3954c`.** One thing step 2b did not foresee:
`whereKeys.ts` had to grow three new kinds for `userFake` — `'null'`, `'nullableDateLt'` and
`{ or }` (Prisma's `OR`). The review notes owed by later tasks are written into tasks 3.5,
3.6, 3.7, 3.8, 3.9, 3.10 and 3.14 below.

## Task 3.5 — The helpers and first sign-in

**Files:** `apps/server/src/lib/authz.ts` and test; `lib/household.ts` and test (new);
`context.ts`; `index.ts`; `apps/web/src/apollo/client.ts` and test; `lib/defaultLocation.ts`
and test (deleted); `apps/server/src/test/stockFake.ts` and test (step 0).

**Found by the review of task 3.4, and owed here. Read all five before step 1.**

- **(a) `stockFake` drops `householdId`.** `insertLocation` (`apps/server/src/test/stockFake.ts`
  about 405-427) builds the row field by field, and `householdId` is not one of the fields.
  The fixture rows in the test files have no `householdId` either. So with
  `locations: () => stockFake.state.locations`, every location has no household, and every
  H18 check in `householdFake` fails closed: each role is refused, for the right code and the
  wrong code alike. Step 0 fixes this first.
- **(b) `runInTransaction` does not model the row lock that decision H1 relies on.**
  `runInTransaction` (`stockFake.ts` about 290) does not run transactions one at a time, and
  it takes its snapshot when each transaction starts. In Postgres, the second `UPDATE` on the
  same `User` row waits for the first transaction to finish. In the fake, nothing waits. A
  reviewer ran a correct `ensureHousehold` 10 times in parallel through the plain fake: **1
  fulfilled, 9 rejected with `NO_HOUSEHOLD`, 0 households left, and `householdSetupAt`
  set.** One fact in the code makes this possible: a rollback restores the WHOLE store from
  the snapshot taken when that transaction started, so it also removes rows that another
  transaction wrote in the meantime. With a promise chain around the
  transactions (one waits for the one before it, as the row lock does), the same code gave
  **10 fulfilled, 1 household, 1 member**. So:
  - the "ten parallel calls" test in step 1 must run through a **test-only lock** around
    `runInTransaction` — a promise chain in the test file, so each transaction starts after
    the one before has finished;
  - **do NOT change correct code to make the unlocked fake pass.** If a test fails only
    without the lock, the fake is wrong, not the code;
  - the real-SQL proof of the race is already in `verify-migration.ts` (task 3.3, the race
    proof). The unit test only proves the code's logic under a lock.
  - mutation check (c) in step 7 may stay green under the lock: with the transactions run one
    at a time, code that skips the claim but reads the membership first may still create one
    household. If it stays green, say so in the report and name what does prove the claim.
- **(c) How to build the fake.** `createHouseholdFake({ …, locations: () =>
  stock.state.locations })`, so it sees the current location rows. Create the `Household`
  row **before** the owner's `HouseholdMember` row: the other order raises `P2003` in the
  fake, as it does in Postgres. Use the new role names only (`owner | manager | member` and
  `organizer | participant | viewer`); an old location role string throws `InvalidRoleError`.
- **(d) `members: { some: {} }` matches when the household has OTHER members**, as in Prisma:
  `some` is true when at least one related row passes. So the H18 fixture needs another
  member in that household. With only the caller in it, a resolver that forgets `userId`
  inside `some` gives the same answer as a correct one, and passes.
- **(e) `Household.ownerId` mirroring the owner row (decision H15) is not modelled.** The fake
  stores each row as it is written. A test of the code that writes the owner must assert
  **both** `Household.ownerId` and the `owner` `HouseholdMember` row.

- [ ] **Step 0: `stockFake` carries `householdId`.** Add `householdId` to `FakeLocation`, to
  `insertLocation`, and to `LOCATION_WHERE`. Give the fixture rows a `householdId` where a
  test reads it. Add a `stockFake.test.ts` test that a created location keeps its
  `householdId`, and mutation-check it.
- [ ] **Step 1: Failing tests for `ensureHousehold(userId, language)`** in `lib/household.ts`:
  - a new user (`householdSetupAt` null): one transaction claims the user, creates
    `<name>'s Household`, the owner row, a location `Home` with `order` 0, and an `organizer`
    row. It returns the household id
  - a user already set up returns their household id and creates nothing
  - ten parallel calls for one new user create one household. Use `runInTransaction` from
    `stockFake.ts` for rollback, **inside a test-only lock** (note (b) above). The real race
    is proved in task 3.3, not here
  - a user with `householdSetupAt` set and **no** membership throws a `GraphQLError` with code
    `NO_HOUSEHOLD`, and creates nothing. Nobody can reach this state before H5, but the code
    path must not create a second household (design *Create and delete a household*)
  - the names: `en` → `"ET's Household"` and `"Home"`. `tw` → the Traditional Chinese
    strings (pick them, and list them in the report so the owner can review them in the PR).
    An unknown or missing language → `en`. The `<name>` is `User.displayName`
- [ ] **Step 2: Failing tests for the helpers in `authz.ts`.** Use `householdFake` with a
  fixture of **three** people: the caller, a second member with a different role, and a
  stranger. Add a location on which the caller has no role (rule 10).
  - `requireHousehold(ctx)` → the caller's household id, read once per request. Memoise it on
    the context. It calls `ensureHousehold` when the user has none
  - `requireHouseholdRole(ctx, householdId, role)`: `owner` passes every check, `manager`
    passes `manager` and `member`, `member` passes only `member`. A non-member gets the same
    `Forbidden` as `requireLocationRole`
  - `requireLocationRole(ctx, locationId, role)`: the body reads `LocationMember`.
    `organizer` > `participant` > `viewer`. Rename the `LocationRole` type. No row, or another
    household's location, gives the same `Forbidden`. It stops selecting `isDefault`. **A
    household owner with no location role is refused** (design *Rules that cross the two
    levels*). **A `LocationMember` row counts only while the person is also a
    `HouseholdMember` of the location's household** (decision H18). Test it with a fixture
    that has the location row but not the household row
- [ ] **Step 3:** Implement. Put the language on the context from the `x-app-language` header
  in **both** context branches in `index.ts` (the E2E branch returns early, as H2 found).
  Accept only `en` and `tw`. Update `contextEnsureUser.test.ts` or add a sibling test so the
  header is read in both branches.
- [ ] **Step 4: Web.** Add `x-app-language` to every GraphQL request, from i18next's current
  language, in both Apollo clients in `apps/web/src/apollo/client.ts`. Test it in
  `client.test.ts`.
- [ ] **Step 5:** Rename the role strings passed at every call site: `'member'` →
  `'participant'`, `'owner'` → `'organizer'` (about 31 sites; `deleteLocation` is the only
  `'owner'`). `tsc` finds them all once the type changes.
- [ ] **Step 6:** The `locations` query stops calling `ensureDefaultLocation`. Call
  `requireHousehold(ctx)` instead, which creates "Home" for a new user. The two import
  fallbacks (`import.resolver.ts` about 95 and 224) move to a helper
  `fallbackImportLocation(ctx)`: the caller's first location by `order` with role
  `participant` or higher (decision H12). Delete `lib/defaultLocation.ts` and its test.
- [ ] **Step 7: Mutation checks**, each restored from a saved copy:
  - (a) `requireLocationRole` ignores `role` again → a viewer-writes test goes red
  - (b) `requireHouseholdRole` lets `member` pass `manager` → red
  - (c) `ensureHousehold` skips the claim → the parallel test goes red
  - (d) the E2E branch does not read `x-app-language` → red
- [ ] **Step 8:** Commit: `feat(server): real role checks and first sign-in for households`.
  Commit the web header separately if it is cleaner:
  `feat(web): send the app language with every GraphQL request`.

**Done** in `add940c3` (step 0), `c62b686d` (the helpers and first sign-in) and `73f84bdc`
(the web header), with review fixes in `3ba61aeb`. What a later task needs to know:

- `fallbackImportLocation` (`lib/authz.ts`) does not create a location. When no location
  qualifies, it throws a `GraphQLError` with code `NO_LOCATION`.
- `deleteLocation` still reads `isDefault`, with its own `findUnique`, because
  `requireLocationRole` no longer selects it. Task 3.6 removes that read.
- The GraphQL context moved out of `index.ts` into `lib/graphqlContext.ts`, with its own test.
- The `tw` names are `<displayName>的家` for the household and `住家` for the location. The
  owner reviews them in the PR.
- Review fixes in `3ba61aeb`: the race proof in `verify-migration.ts` now runs
  `tx.user.updateMany`, the same call as `ensureHousehold`, instead of raw SQL. It must be
  re-run against the test database (see task 3.3 step 6). Location role `member` was renamed
  to `participant` in 10 comments and 2 GraphQL descriptions that step 5 missed. Stale
  comments in `household.ts`, `e2eCleanup.ts`, `authz.ts` (`fallbackImportLocation`) and
  four places in `e2e/CLAUDE.md` were corrected.
- `test/derivedRoles.ts` (new) lets 14 old test files keep working. It must go; see the notes
  under tasks 3.6, 3.8, 3.9 and 3.10.

## Task 3.6 — Locations

**Files:** `resolvers/location.resolver.ts` and tests; `schema/location.graphql`.

| Operation | After H3a |
|---|---|
| `locations` | locations where the caller has any `LocationMember` row, by `order`. Owner and manager do **not** yet see locations without a role; that is H5 |
| `createLocation` | household role `member`. One transaction: create the row with `householdId` (and `userId`, until task 3.14), `order` = max + 1 within the household, and an `organizer` row for the caller |
| `updateLocation` (rename) | location role `organizer` |
| `deleteLocation` | household role `manager`, and the location must be in that household. Refuse the household's last location (decision H13) with a new error code `LAST_LOCATION`. Stop reading `isDefault` |
| `reorderLocations` | household role `manager`. Every id must be a location of that household |

- [ ] **Step 1:** Failing tests for each row, with the three-person fixture. Include a
  `participant` who tries to delete, and a stranger's location id in `reorderLocations`.
- [ ] **Step 2:** Implement.
- [ ] **Step 3: Mutation checks:** remove the `LAST_LOCATION` refusal; drop the household
  check in `reorderLocations`; skip the `organizer` row in `createLocation`. Each goes red.
- [ ] **Step 4:** Commit: `feat(server): scope locations by household and location role`.

**Found by the review of task 3.4, and owed here:**

- **`householdFake` does not model the `LocationMember` cascade.** In Postgres, deleting a
  location deletes its `LocationMember` rows (`onDelete: Cascade`). In the fake, the
  `LocationMember` rows stay. So a correct `deleteLocation` that relies on the cascade leaves
  stale rows in the fake, and a test that counts them fails against correct code. Either
  model the cascade in the fake (with its own test), or write the test around it on purpose
  and say so in a comment.
- **A filter of the shape `location: { members: { some: { userId } } }` filters `Location` or
  `ItemStock` rows.** Those rows live in `stockFake`, so the filter belongs in `stockFake`, not
  in `householdFake`. `householdFake` resolves `members.some` only on `Household` and on the
  H18 path of `LocationMember`.

**Found by the review of task 3.5, and owed here: remove `test/derivedRoles.ts` from every
test file this task touches.** `derivedRoles` adds an `organizer` row, and a household, for
any location that has no `householdId`. So in a file that uses it, every location the
caller made counts as theirs, and no role test is real. A resolver that forgets to write a
role row still passes. Seed the roles in each file instead, with the three-person fixture
(rule 10). The 14 files that import it after task 3.5 (check with
`git grep -l derivedRoles -- apps/server/src`):

| Task | Files (`apps/server/src/resolvers/`) |
|---|---|
| 3.6 | `location.resolver.test.ts` |
| 3.8 | `applyUnitSwitch.resolver.test.ts`, `cart.resolver.test.ts`, `cartBootstrap.test.ts`, `inventoryLog.resolver.test.ts`, `itemStock.resolver.test.ts`, `recipe.resolver.test.ts`, `vendor.resolver.test.ts` |
| 3.9 | `import-cart-location.resolver.test.ts`, `import-inventoryLog-location.resolver.test.ts`, `import-itemStock.resolver.test.ts`, `import-location.resolver.test.ts`, `import-ownership-cart.resolver.test.ts`, `import-ownership-log.resolver.test.ts` |

`vendor.resolver.test.ts` and `recipe.resolver.test.ts` may be touched first by task 3.7.
Whichever task touches a file first removes `derivedRoles` from it.

**Found by the review of task 3.5, and owed here: `createLocation` must write the role row.**
Today `createLocation` writes no `householdId` and no `LocationMember` row. In the fake,
`derivedRoles` invents an `organizer` row for it, so `createLocation` then `updateLocation`
passes. A reviewer's probe showed that. On Postgres there is no such row, so the rename is
refused with `Forbidden`. So:

- `createLocation` writes the location with `householdId` and the caller's `organizer` row in
  ONE transaction.
- Its test must not use `derivedRoles`.
- Add a test that creates a location through the resolver and then renames it, and one that
  creates it and then writes stock into it. Both must use only rows the resolvers wrote.

**Done** in `71029099`, with review fixes in `27ccea7e`. What a later task needs to know:

- `deleteLocation` locks the household row FIRST, before it reads or counts. The helper is
  `lockHousehold`, exported from `lib/household.ts` (moved there in `27ccea7e`). A test pins
  that the `household.update` runs before the `findFirst` and the `count`.
- `reorderLocations` returns the caller's visible locations (the same list as `locations`),
  not every location it wrote. It refuses a list with a repeated id with `BAD_USER_INPUT`
  and writes nothing.
- `createLocation` no longer sends `isDefault`. The column default, `false`, applies.
- The `member` check on `createLocation` cannot be tested yet. `member` is the lowest
  household role, so the only person it refuses is someone in no household, and nobody can
  be in that state before H5.
- `locations` breaks ties in `order` by `id`, and a test pins it.

## Task 3.7 — The catalog: items, tags, tag types, vendors, recipes, shelves

**Files:** `resolvers/item`, `tag`, `vendor`, `recipe` and `shelf` `.resolver.ts` and tests.

Reads need household role `member`. Writes need `manager` (design *Household roles*: members
read the catalog). Every query that filters by `{ userId }` filters by `{ householdId }`.
Every create writes `householdId` (and `userId` until task 3.14).

**#273, in the same task:**
- `createItem` / `updateItem` `tagIds` and `vendorIds`, and `applyShelfFilterPicks`
  `addTagIds` / `addVendorIds` / recipe ids: every id must belong to the household. Add one
  helper, `requireCatalogIds(ctx, householdId, model, ids)`, in `authz.ts`. Refuse with
  `Forbidden`.
- `itemCountByTag`, `itemCountByVendor` and `itemCountByRecipe` count only within the household.
- Recipe item ids in `createRecipe` / `updateRecipe`: the same helper.
- Shelf `itemIds` and the ids inside `filterConfig` in `createShelf` / `updateShelf`: the
  same helper (found by `fix/catalog-write-scope`, not listed in #273).
- The tag `typeId` / `parentId` checks added by `fix/catalog-write-scope` move to the same
  helper.

- [ ] **Step 1:** Failing tests per resolver file, three-person fixture. For each write: a
  `member` is refused, a `manager` passes, a stranger's row is refused. For each read: a
  stranger's rows never appear. For #273: a stranger's tag id on `createItem` is refused, and
  a count does not include a stranger's items.
- [ ] **Step 2:** Implement, one resolver file per commit if that is easier to review.
- [ ] **Step 3: Mutation checks:** at least one per resolver file (drop the role check), plus
  one per #273 site (drop `requireCatalogIds`). Each goes red.
- [ ] **Step 4:** Commit(s): `feat(server): scope the catalog by household (#273)`.

**Found by the review of task 3.4, and owed here:**

- **Build the catalog `ownedRowFake` stores with
  `scope: 'householdId', requiredColumns: ['userId']`.** `userId` stays NOT NULL on these
  models until task 3.14, so a create without it must still throw.
- **A household-scoped store refuses `userId` in a `where`, on purpose.** So
  `requireOwnRowOrUnclaimed` and the import tests that share the catalog stores must switch to
  `householdId` in the **same step** as the stores. Switch one without the other and those
  tests throw `UnknownWhereKeyError`.

**Found by the review of task 3.5:** if this task touches `vendor.resolver.test.ts` or
`recipe.resolver.test.ts`, remove `test/derivedRoles.ts` from them here. See the note under
task 3.6.

**Done** in `959cb705`. What a later task needs to know:

- New in `lib/authz.ts`: `requireCatalogRole(ctx, role)` returns the household id after the
  role check; `requireCatalogIds(ctx, householdId, model, ids, { missing })` checks attached
  ids. Another household's id is `FORBIDDEN`; an id no row holds is `BAD_USER_INPUT`, or
  passes with `missing: 'allow'` (the shelf arrays only, because they are not foreign keys).
  A repeated id is not refused. (It was de-duplicated first in `959cb705`; the review fix
  `ec17fe8d` removed that, because `id IN (...)` already matches each row once and the test
  for it passed without it.)
- `updateRecipeLastCookedAt` and the `lastCookedAt` write in `consumeRecipes` need only
  household role `member`: marking a recipe as cooked is a cooking right, not a catalog edit.
- `createVendor` needs household `manager` AND location `participant`.
- **`requireOwnRowOrUnclaimed`'s body moved here, not in task 3.9.** It had to: the catalog
  stores refuse `userId` in a `where`. The six catalog models are checked by household; logs
  and carts keep `userId`. So task 3.9 no longer changes this body.
- **Part of task 3.9 is done here:** every catalog create in `import.resolver.ts` writes
  `householdId`, and every catalog read there (closing reads, tag / vendor / item / tag type
  reference reads, and `requireOwnItemStockRefs`' item read) filters by `householdId`. Task 3.9
  still owns locations, the fallback location, removing `derivedRoles` from the import tests,
  and the whole-import test.
- Still by `userId`, owed by later tasks: `itemStock.resolver.ts` (`applyUnitSwitch` reads
  the item and recipe by `userId`) and `cart.resolver.ts` (`vendor.findMany` in
  `bootstrapCarts`) — task 3.8; `clearAllData`, `purge.resolver.ts` and `e2eCleanup.ts` delete
  catalog rows by `userId` — task 3.10. `deleteVendor`'s cart cleanup reads only the caller's
  carts — H3b.
- `itemCountBy*` filter the junction row by `item: { householdId }`. A Prisma fake that serves
  them must model that relation filter.

**Review fix** in `ec17fe8d`. The review of task 3.7 found five things. All five are fixed
there, each with a test that a mutation turned red:

| Finding | Fix |
|---|---|
| `consumeRecipes` asking for `manager` instead of `member` left all 971 tests green | a test where a household `member` who is a location `participant` cooks, and the recipe gets `lastCookedAt` (`recipe.resolver.test.ts`) |
| `createVendor` asking for location `viewer` instead of `participant` left all tests green | a test where a household manager who is only a location `viewer` is refused, with no vendor and no cart written (`catalog-household.resolver.test.ts`) |
| `deleteTagType` deleted the household's tags, then the type delete failed (another household's tag still used the type), and it returned `false` with the tags gone | the tag cleanup and the type delete run in ONE interactive transaction. It still returns `false` in that case. The test fake models `Tag_typeId_fkey` (`P2003` when a tag uses the type) |
| the junction fake's spec allowed `item: { householdId: { in } }`, but its matcher compared a plain string | the spec is `equals` now, so a `{ in }` filter throws |
| the `requireCatalogIds` dedupe test passed without the dedupe | the dedupe is removed; the test now pins that a repeated id passes and a repeated stranger's id is refused |

**Found by the review of task 3.7, still open:** see the notes under tasks 3.8, 3.9, 3.10,
3.14 and *Known gaps*.

## Task 3.8 — Stock, logs and carts

**Files:** `resolvers/itemStock`, `inventoryLog` and `cart` `.resolver.ts` and tests;
`lib/itemStockWrite.ts`.

- Writes already call `requireLocationRole`. After task 3.5 they ask for `participant`.
- Reads that scope by `location: { userId }` (`itemStocksForItem`, `allItemStocks`,
  `ensureStockAtLocation`'s source search) use the caller's location memberships instead.
- `itemLogs`, `inventoryLogCountByItem` and `lastPurchaseDates` drop their `userId` filter.
  The location role already scopes them, and `InventoryLog.userId` now means the author
  (the comment at `inventoryLog.resolver.ts` about 39-54 asks for this). `inventoryLogs`
  (scoped by `userId` only) uses location memberships.
- **An `itemId` passed with a `locationId` must belong to the location's household:**
  `upsertItemStock`, `addItemToLocation`, `addInventoryLog`, `consumeRecipes` items,
  `applyUnitSwitch`, `addToCart`. Today none of them checks the item. Use one helper.
- **Carts change only their role names in H3a.** Every `Cart.userId` and `CartItem.userId`
  filter stays until H3b (see *Where H3a sits*).

- [ ] **Step 0:** `itemStock.resolver.test.ts` has local matchers (`logMatches`,
  `stockMatches`, the inline `location.findFirst`) that ignore unknown keys. A `householdId`
  filter would pass there silently. Move them onto `checkWhere` or a shared fake first.
- [ ] **Step 1:** Failing tests: a `viewer` cannot write stock, a log or a cart. A stranger's
  item id is refused at each site above. A read never returns a location the caller has no
  role on.
- [ ] **Step 2:** Implement.
- [ ] **Step 3: Mutation checks:** one per site.
- [ ] **Step 4:** Commit: `feat(server): scope stock and logs by location role`.

**Found by the review of task 3.4, and owed here:** the reads above that use "the caller's
location memberships" filter `Location` or `ItemStock` rows with a shape like
`location: { members: { some: { userId } } }`. Model that filter in `stockFake`, where those
rows live, not in `householdFake`. See the same note under task 3.6.

**Found by the review of task 3.5, and owed here:**

- Remove `test/derivedRoles.ts` from the seven files listed under task 3.6.
- **Add a role test per call site: a `viewer` is refused, a `participant` passes.** These
  tests do not exist yet. In these files every caller is an organizer, because the adapter
  (`derivedRoles`) makes each location's `userId` its `organizer`. So a call site that asks
  for `organizer` by mistake, or for `viewer`, passes every test today.

**Found by the review of task 3.7, and owed here:**

- **`applyUnitSwitch` is a catalog edit as well as a stock write.** It writes `Item`
  configuration and `RecipeItem` amounts. So it also needs `requireCatalogRole(ctx, 'manager')`,
  not only location `participant`. Test both: a location `participant` who is a household
  `member` is refused; a household `manager` who is a location `viewer` is refused.
- **`applyUnitSwitch` still reads the item and the recipe by `userId`**
  (`itemStock.resolver.ts`, `prisma.item.findFirst({ where: { id: itemId, userId } })` and
  the `prisma.recipe.findFirst` below it). Move both to `householdId`.
- **Any new "this item is the household's" check uses
  `requireCatalogIds(ctx, householdId, 'item', ids)`**, not a new helper. That covers the
  item ids of `upsertItemStock`, `addItemToLocation`, `addInventoryLog`, `consumeRecipes`,
  `applyUnitSwitch` and `addToCart` listed above.
- **`bootstrapCarts` in `cart.resolver.ts` reads `prisma.vendor.findMany({ where: { userId } })`.**
  So it makes carts only for the vendors the caller created, not for every vendor of the
  household. Move it to `householdId`.

**Done** in `0627baca` (step 0) and `e37dc75d`. What a later task needs to know:

- **Two new helpers in `lib/authz.ts`.** `householdOfLocation(locationId)` reads the
  household from the LOCATION row (`FORBIDDEN` if there is no such location or it has no
  household). `requireLocationItems(ctx, locationId, itemIds)` calls `requireCatalogIds`
  with that household. Call it after `requireLocationRole`; it checks no role. It uses the
  location's household, not `requireHousehold(ctx)`, on purpose: nothing in the schema
  stops a person being a member of two households, and then the caller's household and
  the location's household differ. Tests in `itemStock.resolver.test.ts`,
  `applyUnitSwitch.resolver.test.ts` and `authz.test.ts` give the caller a second
  household and go red when the helper uses `requireHousehold`.
- **Item checks:** `upsertItemStock`, `addItemToLocation`, `addInventoryLog`, `addToCart`,
  `consumeRecipes` (all items, the whole mutation is refused before the first write) and
  `applyUnitSwitch` (once per named location). Not checked: `checkout` (its items come from
  cart rows, which `addToCart` now checks), `removeItemFromLocation` (it only deletes).
- **`applyUnitSwitch`** needs household `manager` first, then location `participant` and
  the item check per location, then `requireCatalogIds` over the item AND every item id in
  `recipeUpdates` (the plan did not list those; they are attached ids, like issue #273's).
  A missing item is now `BAD_USER_INPUT`, not `NOT_FOUND`. Recipes are read by
  `householdId` and stay `NOT_FOUND`.
- **Reads by membership** use `locationId: { in: await locationIdsWithRole(ctx) }`, not a
  relation filter. So `stockFake` did not need `location: { members: { some } }`. It
  gained `locationId: { in }` and `orderBy` on `itemStock.findMany` instead.
  `ensureStockAtLocation` now takes `sourceLocationIds` where it took `userId`.
- **Log reads have no `userId` filter.** `inventoryLogs` reads every location the caller
  holds a role on, so a co-member's logs are exported. Creates still write `userId` as the
  author.
- **`bootstrapCarts`** reads vendors by `householdOfLocation(locationId)`.
- **Carts:** no filter changed. Every `Cart.userId` / `CartItem.userId` filter waits for H3b,
  including the one in `removeItemFromLocation`'s cart delete.
- **Test doubles:** `householdWorld.extend(models, stores)` adds models to the world's
  client and their stores to its rollback. `test/householdRows.ts` builds role rows.
  `inventoryLogFake` gained `deleteMany` and `locationId: { in }`; `shoppingFake`'s vendor
  keeps and filters `householdId`. `derivedRoles` is gone from the five files of this
  task; only the six import test files of task 3.9 still use it.
- **Cost:** each item check is one location read plus one item query, so `upsertItemStock`,
  `addInventoryLog` and `addToCart` cost two more queries than before. `addItemToLocation`
  and `checkout` also read the caller's location memberships once.

**Review fixes in `ff7ec4cb`** (tests only, no source change):

- **The order of the two checks is now pinned.** At all six sites (`upsertItemStock`,
  `addItemToLocation`, `applyUnitSwitch`, `addInventoryLog`, `addToCart`, `consumeRecipes`)
  the location role check runs before `requireLocationItems`. Before the fix, a reviewer
  swapped the two calls at each site and all 1050 server tests stayed green. The order
  matters because `requireLocationItems` reads the location's household: run first, it
  answers `BAD_USER_INPUT` for an existing foreign location with a missing item id, but
  `FORBIDDEN` for a made-up location id. So a stranger could find out which location ids
  exist. Each site now has a test that sends exactly that request and expects `FORBIDDEN`
  with nothing written, and a control with an unknown location id (green in both orders).
  Swapping the two calls makes the first test red at each of the six sites.
- **`removeItemFromLocation` deleting a co-member's logs is pinned.** A two-person test:
  user-m's log of the item at the location is deleted, and user-m's log at another location
  is kept. Adding `userId` to `tx.inventoryLog.deleteMany` makes it red. Whether a
  `participant` should be able to do this at all was an open question for the owner. It is
  decided now, see *Owner decisions 2026-11-11* below.
- Server tests 1050 → 1062.

**Owner decisions 2026-11-11.**

- **Removing an item from a location needs location role `organizer`.** The owner decided
  this on 2026-11-11. `removeItemFromLocation` now calls
  `requireLocationRole(ctx, locationId, 'organizer')`, where it called `'participant'`.
  What the removal deletes does not change: the stock row, EVERY log of the item at the
  location (the logs other members wrote too), and the item's entries in that location's
  carts. The reason: the removal deletes co-members' logs, so it needs a higher role than
  editing stock. A participant can still edit stock, add an item to the location, cook and
  shop.
- Tests in `itemStock.resolver.test.ts`, describe block *removing an item from a location
  needs location role organizer*: a `participant` is refused with `FORBIDDEN` and the stock
  row, both logs (one is the co-member's) and the cart entry are all kept; an `organizer`
  succeeds and all of them are deleted; a `viewer` is refused. Mutation check:
  `'organizer'` back to `'participant'` makes the participant test red.
- `removeItemFromLocation` still has no `requireLocationItems`. It only deletes, so it never
  attaches an item to a location, and rule 12 does not apply.
- **Known gap for H5:** the web Stock tab shows the *Remove from location* button to every
  role. A participant who presses it gets `FORBIDDEN`, and the web shows no message: the
  dialog stays open and the error is an unhandled promise rejection. H3a has no role-aware
  UI. See *Known gaps*.

## Task 3.9 — Import

**Files:** `resolvers/import.resolver.ts` and its seven test files; `lib/authz.ts`
(`requireOwnRowOrUnclaimed`).

- `requireOwnRowOrUnclaimed`'s body: for the six catalog models, "own" means the row is in
  the caller's household (`requireHousehold`). `InventoryLog`, `Cart` and `CartItem` keep
  `userId` until H3b and H4. **No call site moves.** H4 changes the body again, to the
  **target** household.
- Catalog bulk writes write `householdId`. Their closing reads filter by `householdId`.
- `bulkCreateLocations` / `bulkUpsertLocations`: write `householdId`, and add an `organizer`
  row for each created location. `requireOwnLocationIdsOrUnclaimed` reads membership.
- The log and cart location fallbacks use `fallbackImportLocation` (task 3.5).
- Import role gating (owner or manager only) is H4. Do not add it here.

- [ ] **Step 0:** `junctionFake` inside `import-ownership-item.resolver.test.ts` still checks
  `where` keys per row. Move it onto `checkWhere` first.
- [ ] **Step 1:** Failing tests. The ownership tests in the four `import-ownership*.test.ts`
  files must still pass, with the second user now in another household.
- [ ] **Step 2:** Implement.
- [ ] **Step 3: Mutation checks:** the body ignores `householdId`; a created location gets no
  `organizer` row. Each goes red.
- [ ] **Step 4:** Commit: `feat(server): import into the caller's household`.

**Found by the review of task 3.4, and owed here:** `householdFake` has no
`locationMember.createMany`. If the bulk location mutations write their `organizer` rows with
`createMany`, add it to the fake first, with the same checks as `create` (role enum, foreign
key, composite key `P2002`, and `skipDuplicates` only if a resolver passes it), and a test.

**Found by the review of task 3.5, and owed here:**

- Remove `test/derivedRoles.ts` from the six import test files listed under task 3.6.
- `bulkCreateLocations` / `bulkUpsertLocations` have the same hole as `createLocation` (task
  3.6): today they write no `householdId` and no `organizer` row, and `derivedRoles` invents
  them in the fake. Their tests must not use `derivedRoles`.
- Add a test of a whole import through the resolvers: import the locations, then import item
  stocks into them. It must use only rows the resolvers wrote. On Postgres today the second
  step is refused, because the imported locations have no role rows.

**Found by the review of task 3.6, and owed here:**

- **Without `organizer` rows (and `householdId`), imported locations are invisible.** Today
  `locations` lists only locations the caller has a role on. So a location made by
  `bulkCreateLocations` / `bulkUpsertLocations` is missing from `locations`, the location
  switcher, the settings list, the Stock-tab pager, and a cloud export (`exportData.ts` reads
  `GetLocations`). An export then import round trip loses them.
- **Count `order` within the household**, not per user, the same as `createLocation`.
- **Use `locationIdsWithRole` or `countedLocationRole`** (`lib/authz.ts`) for any membership
  read. Do not write a new one: a read without the decision H18 filter counts stale rows.

**Found by the review of task 3.7, and owed here:**

- **This task no longer changes the `requireOwnRowOrUnclaimed` body.** Task 3.7 did it (see
  its Done note). The first bullet of this task and step 3's first mutation are already done.
- **Import does not check every id it attaches.** `requireCatalogIds` (task 3.7) is used by
  the normal mutations, not by these:

  | Mutation | Line (about) | Id it does not check |
  |---|---|---|
  | `bulkUpsertTags` | 1040-1060 | `typeId` and `parentId`, passed from the payload as they are |
  | `bulkCreateShelves` | 1321 | `itemIds` and the ids inside `filterConfig` |
  | `bulkUpsertShelves` | 1482 | `itemIds` and the ids inside `filterConfig` |

  `bulkCreateTags` already skips a tag whose `typeId` is not the household's. Either call
  `requireCatalogIds` (with `missing: 'allow'` for the shelf arrays, as task 3.7 does), or
  skip the row the way `bulkCreateTags` does. Pick one and say why. A mutation check per row.
- **`import-inventoryLog-location.resolver.test.ts`'s `item.findFirst` fake** (about lines
  79-85) still compares `where.userId` and ignores `householdId`. A resolver that dropped its
  household filter would pass there. Move it onto `checkWhere` (`test/whereKeys.ts`).

**Found by the review of task 3.8, and owed here:**

- **The cart item imports check the item against the wrong household.**
  `bulkCreateCartItems` and `bulkUpsertCartItems` (`import.resolver.ts`, about 898 and 1265)
  do check `itemId`, but against the CALLER's household (`requireHousehold`), with
  `prisma.item.findFirst({ where: { id: itemId, householdId } })`. They should check it
  against the household of the CART's location, as `addToCart` does since task 3.8. Today
  the two are the same household, because a person is in one household and the cart is
  scoped by `userId`. Once a person can be in two households (H5), an imported cart row can
  put household A's item into a cart at household B's location. **`checkout` then buys it
  into B's stock**, because `checkout` trusts the item ids in cart rows: only `addToCart`
  checks them. Add both mutations to the list of import ids that need a check. Use
  `householdOfLocation` / `requireLocationItems` (`lib/authz.ts`), AFTER the cart's
  location check. Note: `requireLocationItems` throws, but these two mutations SKIP a row
  whose cart or item does not resolve, on purpose (a partial backup may name an item that
  is gone). Keep the skip, or refuse the whole batch, and say which and why. Write a
  two-household test; with one household per person it cannot fail.
- **`test/derivedRoles.ts` is now used only by the six import test files**
  (`import-ownership-cart`, `import-ownership-log`, `import-itemStock`, `import-location`,
  `import-inventoryLog-location` and `import-cart-location`). Removing it from them, as task
  3.5's review asks above, lets the file itself be deleted.

**Done** in `1eb01462` (step 0) and `264d2c16`. What a later task needs to know:

- **Locations.** A created location gets `householdId` (the caller's, `requireHousehold`)
  and an `organizer` row for the caller, in one transaction (`createImportedLocation` in
  `import.resolver.ts`, the same two writes as `createLocation`). `bulkUpsertLocations` no
  longer uses `upsert`: a new id goes through `createImportedLocation`, an existing id gets
  `location.update`. **An update writes and changes no role row**: the caller already holds
  one, and an import must not grant or change anybody's role.
- **`bulkUpsertLocations` now needs `organizer` on an existing id**, not `participant`. It
  renames the row, and `updateLocation` needs `organizer` for a rename. The plan did not ask
  for this. `bulkCreateLocations` still asks `participant`: it only skips an existing row.
  `requireOwnLocationIdsOrUnclaimed(ctx, locations, role)` takes the role and returns the
  ids that already exist. It already read membership through `requireLocationRole` (and so
  through the decision H18 filter) since task 3.5; the plan's "reads membership" needed no
  new read.
- **`order` is the payload's own value, not counted within the household.** The plan said
  "count `order` within the household, the same as `createLocation`". But import never
  counted `order`: it stored the backup's value, which is the user's own order, and an
  import restores it. Two locations of one household can share an `order`; `locations`
  breaks the tie by id. A test pins that the payload's order is kept even when it repeats
  one in the household. So the brief's mutation "order per user" had nothing to mutate; the
  mutation run instead was "order = count of the user's locations", which turned 4 tests
  red.
- **Bug found and fixed (latent until H5):** `bulkCreateLocations` read an existing id with
  `findUnique({ where: { id, userId } })`. For a location the caller holds a role on but did
  not create, that missed, and the create then failed with `P2002`. Now it skips from the
  set the pre-check returns. Test: "user who is only a participant of a location can still
  name it in a 'skip' import".
- **Fallbacks:** confirmed. `resolveLogLocations` and `resolveCartLocations` both call
  `fallbackImportLocation` (task 3.5).
- **Attached ids, all SKIPPED, not refused** (a partial backup may name a row that is gone,
  and "not yours" must look the same as "not there"):
  - `bulkUpsertTags`: a tag whose `typeId` is not a tag type of the household, or whose
    `parentId` is neither a household tag nor a tag of the same payload, is skipped. The
    tags are now written in passes, parents first, like `bulkCreateTags`. That also fixes
    an ordering hazard: the old single `Promise.all` could write a child before its parent,
    and Postgres checks `Tag.parentId`'s foreign key.
  - Both shelf mutations: each id in `itemIds` and in `filterConfig.tagIds` / `vendorIds` /
    `recipeIds` that is not a row of the household is DROPPED; the shelf still lands
    (`householdShelfRefs`). ~~An id no row holds is dropped too, unlike `createShelf`'s
    `missing: 'allow'`, so a foreign id and a gone id give the same answer. Shelves are
    the last entity the client imports, so the ids exist by then.~~ **Wrong, fixed in
    `03e32094`:** only another household's id is dropped. An id no row holds is kept, as
    `createShelf` keeps it. See *Bug 1* below.
  - Both cart item mutations: the item is checked against the household of the CART's
    location (`resolveCartItemParents`): the cart by `userId`, then `requireLocationRole`
    on the cart's location (rule 12: role first), then `householdOfLocation`. A cart or item
    that does not resolve is skipped, as before. A cart of the caller's at a location they
    hold no role on now makes the whole batch `FORBIDDEN`, before any write. Not
    `requireLocationItems`, because it throws and these mutations skip.
  - Rule 12's order test ("a stranger gets FORBIDDEN even for a missing item") does not
    apply here: the location comes from the caller's own cart row, not from the input, and
    `householdOfLocation` gives the same `FORBIDDEN` as the role check for any location id.
    Swapping the two calls changes no answer, so no test can pin the order.
- **`derivedRoles.ts` is deleted.** The six import test files use `householdWorld` and a new
  builder, `soloHouseholds` (`test/householdRows.ts`): one household per person, owner and
  organizer of their own locations. `git grep -l derivedRoles -- apps/server/src` now lists
  only comments that say it was removed.
- **Step 0:** `junctionFake` (`import-ownership-item.resolver.test.ts`) and the `item.findFirst`
  fake (`import-inventoryLog-location.resolver.test.ts`) run `checkWhere` once per call. The
  second one compared `where.userId` and ignored `householdId` before.
  `import-itemStock.resolver.test.ts`'s hand-written item store is now an `ownedRowFake`.
- **The whole-import test** is in `import-itemStock.resolver.test.ts` ("a whole import into a
  new account"): first sign-in, then `bulkCreateLocations` (or `bulkUpsertLocations`), then
  `bulkCreateItems`, then `bulkCreateItemStocks` into both imported locations, then
  `locations`. Every household and role row is one the resolvers wrote. Against the old
  resolver it is red.
- **The two cloud E2E rows of *Execution* that "end at 3.9"** (import with locations, and
  imported locations missing from `locations`) should now pass. Not run here (no database
  in this task).
- Server tests 1062 → 1094.

**Review fix** in `03e32094` (server tests 1094 → 1098):

- **Bug 1: shelf imports dropped ids that did not exist YET.** On `replace`, the web client
  runs `bulkCreate*` for every entity (shelves last), THEN `bulkUpsert*`. An item, tag,
  vendor or recipe that conflicts with a cloud row by name only keeps its payload id and is
  written in the second pass, so a new shelf naming it lost that id. Before task 3.9 the id
  was kept. Now `householdShelfRefs` drops only ids that are rows of ANOTHER household. A
  test runs the two passes (`bulkCreateShelves`, then `bulkUpsertItems` and
  `bulkUpsertTags`) and goes red if missing ids are dropped again.
- A test pins that a parent tag skipped for its type also skips its child in
  `bulkUpsertTags`. Before it, counting every payload id as written turned no test red.
- A comment on `bulkUpsertLocations`: not atomic per row since task 3.9 (`P2002` on two
  concurrent imports of one new id, `P2025` on a row deleted between check and update), and
  the web app never sends it today.

## Task 3.10 — Purges and E2E cleanup

**Files:** `resolvers/purge.resolver.ts` and test; `schema/purge.graphql`;
`resolvers/import.resolver.ts` (`clearAllData`) and test; `purge-coverage.test.ts`;
`lib/e2eCleanup.ts` and test; `e2e/helpers/cloudTeardown.ts`;
`e2e/tests/cleanup-endpoint.spec.ts`; a new spec `e2e/tests/purge-two-households.spec.ts`;
`e2e/CLAUDE.md`.

- [ ] **Step 1:** Remove `purgeUserData`: the resolver, its schema line, its tests, and its
  entry in `purge-coverage.test.ts`. It has no web caller (research 2026-11-03).
- [ ] **Step 2:** `clearAllData` clears the **household**: household role `owner` (design:
  clear household is owner only). Every filter becomes `{ householdId }` or a filter through
  the location or item. `Cart`, `CartItem` and `InventoryLog` go through their location, not
  `userId`, because "no path deletes rows because of who created them" (design *Purge*). Then
  it re-creates a "Home" location with an `organizer` row, in the same transaction, so the
  household is never left with no location (decision H17). Update the assertions from task
  3.2 to the new filters.
- [ ] **Step 3:** `purge-coverage.test.ts`: the expected filter form becomes household or
  location. Add `Household`, `HouseholdMember` and `LocationMember` to what it checks for
  `/e2e/cleanup`.
- [ ] **Step 4: `/e2e/cleanup`.** It finds the households the user **owns**, and deletes their
  rows by household. It also deletes the user's own memberships in households they do not own.
  Then it deletes the three new tables, then the `User` row, last. **Never delete a household
  the user only belongs to**: two-user specs run cleanup for each user, and the first cleanup
  must not empty the other user's household. 18 keys. Change the four places together, as
  phase-plan task 2.6 did.
- [ ] **Step 5: The two-household real-SQL spec** (decision H10), cloud only, no browser:
  - users A and B each get a household and one row of every model
  - A runs `clearAllData`
  - all of B's rows survive, read back through B's GraphQL
  - **Mutation check:** change one `clearAllData` filter to `{}`. The spec goes red.
- [ ] **Step 6:** Commit: `feat(server): clear and clean up by household`.

**Found by the reviews of tasks 3.1 and 3.2, and owed here:**

- **`lib/e2eCleanup.test.ts` checks only 2 of its 15 filters** (`user`, `shelf`). Give it the
  same full table as the two resolver tests, and assert what reaches `$transaction`.
- **`purge-coverage.test.ts` lets any model use any parent path.** Map each model to its
  allowed path (for example `itemStock: ['location']`, `cartItem: ['cart', 'location']`), so a
  path that exists but is wrong fails. Today `recipeItem` goes through `recipe` in the two
  resolvers and through `item` in `/e2e/cleanup`. Pick one, or allow both on purpose and say
  why.
- **Add a negative case that refuses the old scope**: `{ where: { userId } }` on a catalog
  model must fail the form check after this task.
- **The coverage loop looks only for `prisma.<m>.deleteMany(`**, but the form check also
  accepts `tx.`. If `clearAllData` moves to an interactive transaction, make the two agree.
- **A text check cannot see an `undefined` value.** Prisma reads
  `{ where: { householdId: undefined } }` as no filter, so it deletes every row. Throw before
  the transaction when the household id is missing, and keep the exact-value unit tests and
  the two-household spec (step 5).

**Found by the review of task 3.4, and owed here:** `householdFake` does not model the
`LocationMember` cascade (see the note under task 3.6). `clearAllData` deletes locations, so
in the fake their `LocationMember` rows stay behind, while in Postgres they go. Model the
cascade, or delete the rows on purpose in the test setup and say why.

**Found by the review of task 3.5, and owed here:**

- **`clearAllData` leaves the household with no location today.** It deletes every location.
  Before task 3.5, the next `locations` query ran `ensureDefaultLocation`, which made a new
  one. Now that query runs `requireHousehold`, and its fast path returns at once because the
  household still exists, so nothing makes a location. A "clear" import that then writes a
  log or a cart with no usable location fails with `NO_LOCATION` from
  `fallbackImportLocation`. Step 2 (decision H17) fixes this. Add a test that runs
  `clearAllData` and then `locations`, and expects one "Home" with an `organizer` row.
- ~~**Delete `apps/server/src/test/derivedRoles.ts`** once no file imports it. Check with
  `git grep -l derivedRoles -- apps/server/src`, which must print nothing. If a file
  still imports it here, remove it from that file first (see the note under task 3.6).~~
  **Done in task 3.9** (`264d2c16` deleted the file). The check above was wrong: comments
  that say the file was removed still name it, so the grep prints files. The right check
  is that no file imports it: `git grep -n "from '.*derivedRoles" -- apps/server/src`
  prints nothing.

**Found by the review of task 3.6, and owed here:**

- **`clearAllData` must call `lockHousehold` (`lib/household.ts`) FIRST**, before its
  `deleteMany` on locations. If it locks later, it can deadlock with `deleteLocation`:
  `deleteLocation` holds the household lock and waits on a location row, while
  `clearAllData` holds that location row and waits on the household lock.
- **Add `location.deleteMany` to the fakes**, with the `ItemStock` and `LocationMember`
  cascades. `householdWorld` models the `LocationMember` cascade for `location.delete` only
  (task 3.6). Pin the new method with its own test.

**Found by the review of task 3.7, and owed here:** three places still delete catalog rows by
`userId`, not by household: `clearAllData` (`import.resolver.ts`), `purge.resolver.ts`, and
`lib/e2eCleanup.ts` (about lines 82-118: `item`, `tag`, `tagType`, `vendor`, `recipe`,
`shelf`, and the junction tables through `item: { userId }`). Steps 2 and 4 above already
change them. Listed here so nobody reads task 3.7 as "the catalog no longer uses `userId`".

**Done** in `49ff3458`. What a later task needs to know:

- **`purgeUserData` is gone**: `purge.resolver.ts`, its test, `schema/purge.graphql` (the
  whole file, `PurgeResult` with it). No web or E2E caller existed.
- **`clearAllData`** (`import.resolver.ts`), in this order: `requireHousehold`; a plain
  `Error('clearAllData: no household id')` if the id is falsy; `requireHouseholdRole(…,
  'owner')`; then ONE interactive transaction: `lockHousehold`, the 14 deletes, then
  `createFirstLocation`. The guard is BEFORE the role check on purpose: with an
  `undefined` id, the role check would build a compound key from `undefined`.
- **Filters:** catalog models `{ householdId }`; `inventoryLog`, `cart`, `itemStock`
  `{ location: { householdId } }`; `cartItem` `{ cart: { location: { householdId } } }`
  (CartItem has no `location` relation; the plan's `['cart', 'location']` is one CHAIN,
  not two choices); `itemTag`, `itemVendor` `{ item: { householdId } }`; `recipeItem`
  `{ recipe: { householdId } }`. `LocationMember` has no delete of its own: it goes with
  its location (ON DELETE CASCADE).
- **"Home" is made by `createFirstLocation`** (`lib/household.ts`, new), shared with
  first sign-in, so the two cannot drift. It writes `isDefault: true` and `userId`, the
  same as `ensureHousehold`. **Task 3.12 / 3.14 must change it in one place.** Its name
  comes from `firstLocationName(ctx.language)`: "Home", or "住家" for `tw`. The plan said
  "Home"; the app language was used so it matches first sign-in. The owner may want to
  review that.
- **`/e2e/cleanup`** reads the user's `owner` rows (`HouseholdMember`, the source of truth,
  decision H15, not `Household.ownerId`) BEFORE its array-form transaction, and filters
  with `owned = { in: [...] }`. `{ in: [] }` matches nothing, so a user who owns nothing
  deletes only their own role rows and the `User` row. 18 keys, in this order: the 13
  data keys as before, then `locationMembers`, `locations`, `householdMembers`,
  `households`, `users`. `recipeItem` now goes through `recipe`, as in `clearAllData`
  (it went through `item` before).
- **`purge-coverage.test.ts`** now checks that every schema model is deleted or in the
  path's `kept` list (not only models with a `userId`), one allowed parent chain per model
  (`MODEL_PATHS`), and that each call is on the path's client: `tx` inside `clearAllData`
  (a `prisma.` call there would run outside the transaction), `prisma` in the cleanup. It
  refuses `{ userId }` on all 14 data models in both paths.
- **Fakes:** `stockFake` `location.deleteMany` (ItemStock cascade) and `itemStock` `where:
  { location: { householdId } }`; `householdWorld` `location.deleteMany` (LocationMember
  cascade). `whereKeys.test.ts` used `{ householdId }` as its "unknown key" inside
  `itemStock.location`; it now uses `notAColumn`.
- **Tests moved:** the old `clearAllData` test in `import.resolver.test.ts` used a mock
  that modelled only the array form, so it moved to a new file,
  `clearAllData.resolver.test.ts`, on `householdWorld`. The twelve models the world does
  not hold are recorders there; the exact filters are pinned on them.
- **Mutation checks, all red:** owner → member (2 tests), guard removed (1), Home removed
  (4), Home outside the transaction (1), lock after the location delete (1), one filter
  per group (`tag` `{}`, `inventoryLog` and `cartItem` by `userId`, `itemTag` `{}`,
  `location` `{}`, `itemStock` `{}`: 2 each, unit + coverage), `prisma.tag` inside the
  transaction (coverage), cleanup owner read without `role` (3), cleanup `shelf` by
  `userId` (2), cleanup `household` `{}` (4), cleanup `householdMember` without its
  `{ userId }` half (3). E2E: `tx.shelf.deleteMany({})` made
  `purge-two-households.spec.ts` fail with `"shelves": Array []` for B.
- **E2E:** `purge-two-households.spec.ts` and `cleanup-endpoint.spec.ts`, cloud, 2 passed
  in 54.5s, and again in 44.8s after the mutation was undone. `cloud` now collects 125
  tests in 27 files; `local` 183 in 23.
- Server tests 1098 → 1107 (45 files: one removed, one added).

**Still open after this task:**

- **A household the user only belongs to is pinned by a unit test only.** Task 3.11 can
  add the real-SQL check once `POST /e2e/household-members` exists: owner and member each
  run cleanup, in both orders, and the owner's data survives the member's cleanup.
- **Rows with a null `householdId` are never cleaned up.** `main`'s server writes such
  rows on the shared test database. The *Execution* note about a stale `isDefault`
  location still applies; it can also make `clearAllData`'s "Home" fail with `P2002`
  (the whole clear then rolls back).
- **Links across households made before the 2026-11-04 catalog fix** can make
  `clearAllData` fail or reach another household: another household's tag on this
  household's tag type makes `tagType.deleteMany` fail (`Tag_typeId_fkey` is NO ACTION,
  so the clear rolls back), and deleting this household's item cascades another
  household's `ItemStock`, `RecipeItem`, `CartItem`, `InventoryLog` or `ItemTag` rows that
  name it. The old `userId` filters had the same property.
- **After a `clear` import, the household has the new "Home" next to the imported
  locations** (imported locations are `isDefault: false`). Before task 3.5,
  `ensureDefaultLocation` added a "My Home" at the same point, so this is not new.
- **`lockHousehold` first is pinned against the fake only.** No real-SQL test runs
  `clearAllData` and `deleteLocation` at once (task 3.16).

**Review findings fixed** in the commit `docs(households): add the task 3.10 review
findings` (docs and comments only, no behaviour change):

- root `CLAUDE.md`: the `$transaction` array-form paragraph named four users of the array
  form. Only `lib/e2eCleanup.ts` uses it now.
- `apps/web/src/lib/importData.ts` (`fetchCloudDefaultLocationId`): the comment said
  `ensureDefaultLocation` re-creates a default lazily. `clearAllData` now creates "Home"
  itself, in the same transaction. The rule (read the default AFTER the clear) stays.
- this plan: the owed work below in tasks 3.11, 3.12, 3.14 and 3.16, the H6 item under
  *Where H3a sits*, two traps under *Known gaps*, and the owner questions after task 3.14.

## Task 3.11 — A second household member in E2E

**Files:** `apps/server/src/lib/e2eHouseholds.ts` and test (new); `index.ts`;
`webhookRouteOrder.test.ts` (its route guard); `e2e/helpers/cloudUsers.ts`; a new spec
`e2e/tests/cloud-roles.spec.ts`; `e2e/playwright.config.ts`.

- [ ] **Step 1:** `POST /e2e/household-members`, body
  `{ ownerUserId, memberUserId, householdRole, locations: [{ locationId, role }] }`. It adds
  the member to the owner's household and gives the listed location roles. (Corrected after
  the review of task 3.11: this step first said "It refuses a location role for someone who
  is not a household member (decision H18)". That state cannot be reached here.
  `householdRole` is required, and the `HouseholdMember` and `LocationMember` rows are
  written in one transaction, so there is nothing to refuse.) Mount it inside
  `if (E2E_TEST_MODE)`. The parse-tree guard from H2 must cover it: check that it fails if the
  route is moved outside the block.
- [ ] **Step 2:** A helper `addHouseholdMember(request, …)` in `cloudUsers.ts`.
- [ ] **Step 3: `cloud-roles.spec.ts`**, no browser, through `makeGql`:
  - a household `member` cannot create a tag; a `manager` can
  - a `viewer` on a location can read its stock but cannot change it; a `participant` can
  - a location the member has no role on returns `Forbidden` for both read and write
  - **Mutation check:** make `requireLocationRole` ignore `role`. The viewer test goes red.
- [ ] **Step 4:** Add the spec to the `cloud` project's `testMatch`, and to the `local`
  project's `testIgnore`.
- [ ] **Step 5:** Commit: `test(e2e): add household members and check roles against Postgres`.

**Found by the review of task 3.10, and owed here: the two-member cleanup check on real
SQL.** Today a unit test is the only thing that pins "never delete a household the user only
belongs to". Once `POST /e2e/household-members` exists, add a cloud spec (no browser):

- the owner and a second member each run `/e2e/cleanup`, in **both orders**: owner first,
  then member first;
- when the member's cleanup runs first, the owner's data must survive it (read it back
  through the owner's GraphQL);
- the route deletes every member row of a household the user OWNS, other people's rows
  included. So when the owner's cleanup runs first, the member's `HouseholdMember` row goes
  with it. Assert that too, so the spec states the real rule.

Two cautions:

- **Do not give the added member an `isDefault` location.** The partial unique index
  `Location_one_default_per_user_key` allows one `isDefault` row per `userId`, across all
  households. `clearAllData` writes its new "Home" with `isDefault: true` and the caller's
  `userId`. So an extra default row for either user can fail with `P2002`: in the route
  itself, or later in `clearAllData`, which then rolls back the whole clear. Task 3.14 drops
  that index.

  (Corrected after the review of task 3.11. This caution first said "The member already has
  one (their own first sign-in "Home")". That is not how the route works. The route
  requires that the member has NO household yet, so a person is never in two households. It
  adds no location and no `isDefault` row. So the member must be added BEFORE their first
  GraphQL request; after that request they have a household of their own, and the route
  answers 409. See the *Done* note below.)
- **A spec that runs `clearAllData` with two members leaves the member with no location
  role.** Only the caller gets `organizer` on the new "Home" (see owner question Q1 after
  task 3.14). Any later step of the spec that acts as the member at a location fails with
  `FORBIDDEN`. That is today's behaviour, not a spec bug.

**Done** in `11e48fe8` (the route) and `554ef090` (the specs). What a later task needs to know:

- **`POST /e2e/household-members`** (`lib/e2eHouseholds.ts`), mounted inside
  `if (E2E_TEST_MODE)`. Body `{ ownerUserId, memberUserId, householdRole, locations }`. One
  interactive transaction: find the owner's `owner` row; check every location is in that
  household; upsert the member's `User` row (named by its id); set the member's first
  sign-in claim `householdSetupAt` if it is null; refuse if the member is already in a
  household; write the `HouseholdMember` row, then the `LocationMember` rows. Answers
  `{ ok: true, householdId }`.
- **What it refuses:** 400 for a bad body, an unknown role, `householdRole: 'owner'` (one
  owner per household, decision H15; hand-over is H6), the owner as the member, a location
  listed twice, or a location outside the owner's household (a made-up id too). 409 when the
  owner owns no household, or when the member is already in a household. A refusal writes
  nothing.
- **The plan assumed the member had their own household. The route refuses that.** The
  caution above says "the member already has one (their own first sign-in "Home")". But
  `ensureHousehold` reads a person's household with `householdMember.findFirst({ where:
  { userId } })` and no `orderBy`, so a person in two households would get one of them at
  random, and nothing before H5 is built for two households. So the member must be added
  BEFORE their first GraphQL request, and the route sets their claim so that request makes
  no household of its own. Result: the member has no `isDefault` location at all, so the
  first caution cannot happen. **H5 (invites) must decide what happens to the household a
  person already has when they accept an invite.**
- **Decision H18:** a location role without a household role cannot be written here.
  `householdRole` is required, and the household row and the location rows are written in
  one transaction. There is no separate "refuse" branch because the state cannot be reached.
  **The write order does not matter for H18** (review of task 3.11). The route writes
  `HouseholdMember` before `LocationMember`, but the rows commit together, and there is no
  foreign key between the two tables. Writing them the other way round would give the same
  result.
- **The "already in a household" read MUST come after the claim `updateMany`** (review of
  task 3.11). The claim takes the member's `User` row lock. A first sign-in that claimed
  first has committed by the time the claim returns, so the read after it sees that
  household. Read before the claim, a first sign-in could commit its household between the
  read and the claim, and the member would end up in two households. **No unit test pins
  this order.** The Prisma fake has no locks and no concurrency. Measured: moving the read
  above the claim kept all 31 tests in `e2eHouseholds.test.ts` green. Only the comment in
  the route guards it.
- **After the owner's cleanup removes the member's row, the member gets `NO_HOUSEHOLD`**,
  not a new household, because the claim is set. `household-member-cleanup.spec.ts`
  checks it. This is the first real-SQL test that reaches `NO_HOUSEHOLD`.
- **Helper:** `addHouseholdMember(request, { ownerUserId, memberUserId, householdRole,
  locations })` in `e2e/helpers/cloudUsers.ts`. Returns the household id.
- **Specs, both cloud-only with no browser** (in `cloud`'s `testMatch` and `local`'s
  `testIgnore`):
  - `cloud-roles.spec.ts`, 3 tests: catalog (`member` refused, `manager` writes), location
    (`viewer` reads but cannot write, `participant` writes), no role (`FORBIDDEN` for read
    and write; the member's `locations` list leaves that location out).
  - `household-member-cleanup.spec.ts`, 2 tests: the two-member cleanup from the 3.10
    review, both orders. Put in its own file because its subject is the cleanup route,
    not roles.
  - Neither makes a vendor or a cart (see "Owed to H3b").
- **The route guard:** `webhookRouteOrder.test.ts` names the new route and its handler.
  Moving the route below the block's closing brace turned 4 of its tests red.
- **Mutation checks, all red and all undone from copies:** unit: no claim (3 tests), no
  location check (2), no "already in a household" check (2), the owner read without
  `role: 'owner'` (1). One mutation stayed green and showed dead code: writing the claim in
  the upsert's `create` as well as in the `updateMany`; the `create` copy was removed. E2E,
  `--project=cloud`: `requireLocationRole` ignoring `role` turned the viewer test red
  (`Received promise resolved instead of rejected`); `requireHouseholdRole` ignoring `role`
  turned the tag test red; the cleanup's owner read without `role: 'owner'` turned the
  member-first test red (8 counts); the cleanup's `householdMember` delete by `{ userId }`
  only turned the owner-first test red (`householdMembers` 1, expected 2).
- **E2E runs:** the two new specs plus `purge-two-households.spec.ts` and
  `cleanup-endpoint.spec.ts`, `--project=cloud`: 7 passed in 2.1m, and 7 passed in 2.0m after
  every mutation was undone. Load average 2.7 to 7.0. `cloud` collects 130 tests in 29 files
  (was 125 in 27); `local` 183 in 23 (unchanged).
- Server tests 1107 → 1139 (45 → 46 files). Web 2474 / 265 and spec 70, unchanged.
- **Review of task 3.11:** the findings are recorded in the commit
  `docs(households): add the task 3.11 review findings` — the two corrections in this task
  (step 1 and the first caution), the two notes above on write order and read order, the
  route's comment on decision H18, three items under *Known gaps* (owed to H5), and the root
  `CLAUDE.md` (spec counts, the new route and the two new specs). Docs and comments only.

**Still open after this task:**

- **The route and a member's first request at the same moment are not tested.** By
  reasoning, the `User` row lock covers it, as for decision H1: when the route's
  `updateMany` sets the claim, it holds the lock until it commits, so a first sign-in waits,
  matches 0 rows, and then reads the committed membership. And the route reads "already in
  a household" after its own claim, so a first sign-in that won earlier is seen and
  refused. E2E sends one request at a time, so neither order is reached, and no real-SQL
  test runs them together.
- **Not every resolver is role-checked on real SQL.** One read and one write per level.
  `organizer`-only writes (rename, delete, reorder a location) and every cart resolver have
  no two-person real-SQL test.
- **Root `CLAUDE.md` does not list the new route** next to H2's E2E-only routes, and its
  count of cloud spec files ("26 of the 30") is stale. Task 3.16 owns the root docs.

## Task 3.12 — The web app stops using `isDefault` in cloud

**Files:** `apps/web/src/apollo/operations/locations.graphql` (4 operations select
`isDefault`), `import.graphql` (2); `packages/types/src/index.ts` (`Location`);
`hooks/useActiveLocation.tsx` (about 93, 169); `hooks/useCloudLocationId.ts` (about 56);
`components/location/LocationList/LocationList.tsx`; `lib/importData.ts` (about 184, 431,
561, 915, and the read of the default after a clear, about 2397); their tests and stories.

- [ ] **Step 1:** Make `isDefault` optional on the shared `Location` type. Local rows keep
  setting it. Cloud rows never have it.
- [ ] **Step 2:** Remove `isDefault` from the six cloud operations. The server still declares
  the field until task 3.14, so this order is safe (#359's lesson: stop selecting first).
- [ ] **Step 3:** The active-location fallback becomes "the first location" in cloud. The
  server returns locations by `order`. Local keeps `find(isDefault)`.
- [ ] **Step 4:** `LocationList`: show the lock icon and hide Delete only when
  `isDefault === true` (local). In cloud, Delete on the last location shows the server's
  `LAST_LOCATION` refusal as a translated message (`en.json` and `tw.json`).
- [ ] **Step 5:** `importData.ts` (cloud): after `clearAllData`, the destination for
  default-location rows is the "Home" the server re-created, read as the first location.
- [ ] **Step 6:** Tests and stories, including a cloud test that the last location cannot be
  deleted and a local test that the default still cannot be. **Mutation check** each fallback.
  Grep the test files for `isDefault` yourself (root `CLAUDE.md`: the type-check does not
  catch an extra key in an untyped mock).
- [ ] **Step 7:** Commit: `feat(web): stop reading isDefault in cloud mode`.

**Found by the review of task 3.6, and owed here:**

- **The web app hides `deleteLocation` errors.**
  `apps/web/src/routes/settings/household/locations/index.tsx` (about line 106) calls
  `deleteLocation.mutate(location.id)` with no `onError`. So a `LAST_LOCATION` refusal shows
  nothing at all. Wire an `onError`, and add the messages to `en.json` and `tw.json`. Step 4
  depends on this.
- `LAST_LOCATION` is reachable in cloud today: after a "clear" import the household has no
  "Home" until task 3.10, so the first location created after it is the last one.
- The reorder cache write in `useReorderLocations` already matches the server's answer (the
  caller's visible locations). No change is needed there.

**Found by the review of task 3.10:** `createFirstLocation` (`apps/server/src/lib/household.ts`)
is the ONE place that writes `isDefault: true` and `userId` for a new "Home". Both first
sign-in (`ensureHousehold`) and `clearAllData` call it. This task does not change the server,
but it is where the web stops reading `isDefault`; task 3.14 then removes both columns from
that one function.

**Done** in `c2a660c9`. What a later task needs to know:

- **Cloud has no default location in the web app.** The six cloud operations no longer
  select `isDefault`. `Location.isDefault` is optional in `packages/types` and local only.
  Code tests `isDefault === true`. The flag is `undefined` on every cloud row. The server
  still declares the field until 3.14,
  and `apps/web/src/generated/graphql.ts` still names it once (the schema type).
- **The cloud fallback is the FIRST location** (the server returns the list by `order`), in
  three places: `useActiveLocation` (by mode; local keeps `find(isDefault === true)`),
  `useCloudLocationId` (`list[0]`), and `fetchCloudDefaultLocationId` in `importData.ts`.
  After a `clear` import "Home" is the only location, so it is the first one.
- **`LocationList`** locks a row (lock icon, no Delete, no drag) only when
  `isDefault === true`. Every cloud row can be dragged and deleted.
- **Delete errors are shown.** `handleDelete` in `routes/settings/household/locations/index.tsx`
  shows a toast (`sonner`, the app's pattern for mutation errors). The code is read with a
  new helper, `hasGraphQLErrorCode(err, code)` (`apps/web/src/lib/graphqlErrorCode.ts`),
  which reads `extensions.code` and never the message. `LAST_LOCATION` gets
  `settings.locations.deleteLastError`; any other failure gets
  `settings.locations.deleteError`.
- **Not in the plan: cloud BACKUP FILES lost their default marker.** `sanitiseCloudPayload`
  kept `isDefault` in the file, and `findPayloadDefaultLocationId` read it to know which
  payload location to fold onto the destination's default. With the field gone, a new
  cloud backup restored into local mode (or copied down by the cloud → local switch) would
  have kept its "Home" as an extra location next to "My Home". So
  `findPayloadDefaultLocationId` gained a third answer: the location with the lowest
  `order`, **only when no row carries an `isDefault` key at all**. Local (v18+) backups flag
  every row, pre-v18 ones have the `'local'` id, and older cloud backups still carry the
  flag, so the READING side does not change for any of them: each still names the same
  payload default. A file whose rows carry the key but none is `true` (only a hand-edited
  file) gets no default. `sanitiseCloudPayload` no longer copies the flag.

  **The DESTINATION side did change, and that was a bug** (review of task 3.12, fixed in
  `79c92fec`). Before this task the cloud destination default was the `isDefault` row,
  which had the same id as the backup's default, so a restore into the same household was
  the identity. After it, the destination default is the first location by `order`, which
  can be a location the backup does not contain. Example: back up Home (order 0) and
  Garage, later add Attic and drag it to the top, restore with `skip` or `replace`.
  `buildLocationRemap` returned `Home → Attic`, for a new-format file and for an older file
  with `isDefault: true` alike. Every row the import CREATED for Home landed under Attic,
  and each of Home's carts got a new `Attic:<vendor>` twin.

  **Corrected by the review of task 3.15.** This note said that "Home's stock, carts and
  logs landed under Attic, and with `replace` Attic was renamed 'Home'". Both halves were
  wrong for cloud, and the comment above `buildLocationRemap` said the same. Read from
  `apps/server/src/resolvers/import.resolver.ts`:
  - **Attic is not renamed.** `skip` and `replace` both send `locations` on the create pass
    only (`partitionPayload`; the upsert pass gets `locations: []`), and
    `bulkCreateLocations` skips an id that exists. The payload's Home row carried Attic's
    id, so it was skipped.
  - **A row that already exists mostly stays at Home.** `bulkUpsertItemStocks` updates
    the quantities only, and `bulkUpsertInventoryLogs` writes `locationId` in `create`
    only. The one exception is a cart item under `replace`: `bulkUpsertCartItems` writes
    `cartId` in `update` too, so it moved into the Attic cart.
  - The rename IS what local mode would do (`importLocations` writes with `bulkPut` on
    `replace` and `clear`), but local never runs the same-household check: it passes no
    set, and its destination default is always `DEFAULT_LOCATION_ID`.
- **Tests:** web 2474 / 265 → **2485 / 267**. New: `index.cloud.test.tsx` (the
  `LAST_LOCATION` toast and the general one, through the real `useDeleteLocation` cloud
  branch and the real toast in `__root.tsx`), `graphqlErrorCode.test.ts`, a local fallback
  test in `useActiveLocation.test.tsx` with the default NOT first, three import tests, and
  the `CloudLocations` / `CloudLastLocation` stories with smoke tests. Cloud fixtures in
  16 test and story files dropped `isDefault` (`test/cloudFixtures.ts`'s `cloudLocation`
  lost its fourth argument). The local route test "user cannot delete or drag the default
  location in local mode" now has a second location, so it checks the lock against a row
  that is not locked.
- **Mutation checks, all red, all restored from copies:** cloud fallback `locations[last]`
  (4 tests); local fallback without `find(isDefault)` (1); `useCloudLocationId` `list[last]`
  (3); `fetchCloudDefaultLocationId` last (1); payload "lowest order" replaced by "first in
  the array" (1); payload key guard removed (4); payload order fallback removed (1);
  `LocationList` locking a row with no flag (5); `LocationList` never locking (2); route
  without `onError` (2); route always general (1); route always last-location (1). One
  equivalent mutant, not counted: `find(isDefault)` in the cloud branch too gives the same
  answer, because cloud rows have no flag.
- **E2E not run (task 3.15 owns it).** What changes in cloud: (1) the locations page shows
  Delete and a drag handle on the first location, so `settings/locations.spec.ts`'s
  "Default location is undeletable" fails in cloud (the plan's step 2 already splits it);
  (2) no row says "Default" in cloud; (3) deleting the last location now shows a toast;
  (4) a cloud backup file made by the app has no `isDefault` on its locations. The
  import side then folds the location with the lowest `order` onto the destination's
  first location (cloud) or onto "My Home" (local). That is the same row as before
  whenever the default sat at `order` 0, which is true for "Home" after first sign-in
  and after a clear. A spec that moves another location above "Home" first would now
  see a different fold. The E2E helpers (`cloudSeed.ts`, `stockReadback.ts`,
  `cleanup-endpoint.spec.ts`, `cart-id-cross-user-leak.spec.ts`) query `isDefault`
  from the server directly, so they keep working until task 3.14 drops the field.
  The static fixture `cloud-backup.json` still marks a default, and the import side
  still honours that flag. (Since `79c92fec`, a restore into the same household does not
  fold at all; see below.)

**Review fixes** in `79c92fec`. What a later task needs to know:

- **Plan step 5's assumption held only for `clear`.** "Read the first location" is right
  after a clear, because "Home" is then the only location. For `skip` and `replace` the
  destination keeps its own locations, and the first one may be new. So
  `fetchCloudDefaultLocationId` now returns every destination id as well as the first, and
  `buildLocationRemap` takes them as a third argument: when the payload's default is
  already a destination location, nothing is remapped. A first copy between modes or
  accounts, and a `clear` restore, still remap onto the first location.
- **Local mode was checked and is not changed.** Its destination default is always
  `'local'`, and a local backup always flags that id, so a local → local restore is the
  identity. One edge case remains, and the guard would not fix it: restore a cloud backup
  into local, then later restore a NEWER cloud backup of the same household after a new
  location was moved to the top. The newer file's default is the new location, so it
  lands on "My Home", while the first file's Home rows keep their own id. See
  *Known gaps*.
- **An offline delete shows one toast.** `offlineWriteLink` already shows
  `pwa.writeBlocked` and then rejects with `OfflineWriteError`. `handleDelete` now returns
  early for that error, so the general `deleteError` toast no longer follows it.
- **Wording:** two comments (`useLocations.ts`, `useActiveLocation.tsx`) and nine cloud test
  titles (`useShoppingCart.cloud.test.tsx` 5, `useInventoryLogs.cloud.test.tsx` 4) no
  longer say "default location" for cloud. The brief named 5 titles; 4 more in
  `useShoppingCart.cloud.test.tsx` had the same wording. Two comments still named a deleted
  function, `remapPayloadForCloud`; they now name `prepareCloudPayload`.
- **Tests:** web 2485 / 267 → **2489 / 267**. Mutation checks, all red, restored from
  copies: guard removed in `buildLocationRemap` (3 tests); ids not passed from
  `prepareCloudPayload` (2); `instanceof OfflineWriteError` early return removed (1).

## Task 3.13 — The household name and rename

**Files:** `apps/server/src/schema/household.graphql` and
`resolvers/household.resolver.ts` (new), with tests; `apps/web/src/apollo/operations/household.graphql`
(new); `hooks/useHousehold.ts` (new); `components/global/Sidebar/Sidebar.tsx` (about 34),
`HouseholdSidebar.tsx` (about 88), `routes/settings/household/index.tsx` (about 11-20),
`routes/settings/index.tsx` (about 56); i18n; tests and stories.

- [ ] **Step 1: Server.** `household: Household!` returns `{ id, name, role }` for the
  caller (role = their `HouseholdRole`). `renameHousehold(name: String!): Household!` needs
  `owner`. It refuses an empty or blank name after trimming, and names longer than 100
  characters, with `BAD_USER_INPUT`. Tests use the three-person fixture. **Mutation check:**
  let a `manager` rename. Red.
- [ ] **Step 2: Web.** In cloud, the 🏠 sidebar item, the household sidebar heading, the
  household page title and the mobile accordion trigger show the household name. Local keeps
  "My data" (`settings.household.title`). While the name is loading, show "My data", so the
  label never flashes empty.
- [ ] **Step 3:** On `/settings/household` (cloud, owner only), a name field with Save. A
  manager or member sees the name as text. Follow the existing settings form patterns and
  `apps/web/src/components/CLAUDE.md`.
- [ ] **Step 4:** Stories for the new and changed components, with smoke tests (root
  `CLAUDE.md`, *Component Development*). Update the tests that assert "My data" (research
  found 9 files): the local ones stay, and the cloud ones assert the name.
- [ ] **Step 5:** Add the household page to `e2e/tests/a11y.spec.ts` if a new state appears
  (the name field), in light and dark mode.
- [ ] **Step 6:** Commit: `feat(households): show and rename the household in cloud`.

**Done** in `95191ea8`. What a later task needs to know:

- **Server.** `household: Household!` (`apps/server/src/schema/household.graphql`,
  `resolvers/household.resolver.ts`) returns `{ id, name, role }`, where `role` is the
  CALLER's household role. It calls `requireHousehold`, so it is also a first sign-in path.
  `renameHousehold(name)` needs `owner`. The role check runs BEFORE the name check, so a
  manager or member gets `FORBIDDEN` even for a blank name. The name is trimmed; empty,
  blank or over 100 characters (`String.length`, UTF-16 units, the same unit as the web
  field's `maxLength`) is `BAD_USER_INPUT`. The rules live in `cleanHouseholdName`.
- **No `lockHousehold` in the rename.** It is one `UPDATE` of one row and reads nothing its
  write depends on, so there is no read-then-write race to close. The one gap: the role is
  read before the `UPDATE`, so an owner who hands the household over (H6) at the same moment
  could rename it once more. H6 decides whether that matters.
- **New GraphQL enum `HouseholdRole`**, and `codegen.ts` now sets `enumsAsTypes: true` for
  both outputs. Without it, codegen makes a TypeScript `enum`, and the Prisma value `'owner'`
  is not assignable to it. It was the first GraphQL enum in the schema, so nothing else
  changed. Task 3.14 or H5 can add `LocationRole` the same way.
- **Web.** `useHousehold` / `useRenameHousehold` (`hooks/useHousehold.ts`, cloud only),
  `HouseholdLabel` (the four places that said "My data") and `HouseholdNameCard` (the first
  card on `/settings/household`). Local mode and a loading cloud query both show "My data".
  The household name follows the Name Display Convention exception (no `capitalize`), now
  written down in the root `CLAUDE.md`.
- **Trap for every later web task: `useGetHouseholdQuery` now runs on every page** (the
  sidebar's 🏠 link). A test file with its own `vi.mock('@/generated/graphql', …)` that
  renders the sidebar must stub it, or the real Apollo hook runs and demands a provider.
  Three files needed it: `cooking.cloud.test.tsx`, `shopping/index.cloud.test.tsx`,
  `settings/household/locations/index.cloud.test.tsx`. Stories that render the sidebar need
  an Apollo provider for the same reason; `HouseholdSidebar.stories.tsx` had none and now
  wraps each story in `MockedProvider`.
- **a11y: the name field cannot be scanned.** `a11y.spec.ts` runs in `local` and `pwa`
  only, and the card is cloud only. No cloud a11y project exists, and none was added. The
  local household page (which changed only its title markup) was re-scanned:
  `pnpm test:e2e --project=local e2e/tests/a11y.spec.ts` gave 68 passed, 2 skipped.
- **Plan step 4 said "research found 9 files" that assert "My data".** All of them render
  local mode, so all stay as they are. The cloud assertions are new files:
  `routes/settings/household/index.cloud.test.tsx` (6 tests) and
  `components/global/Sidebar/Sidebar.cloud.test.tsx` (1).
- **No cloud story for the household PAGE.** The page's cloud state is shown by the
  `HouseholdNameCard` stories (Owner, Manager) and the `HouseholdSidebar`
  `CloudHouseholdName` story; a whole-route cloud story would need every root-shell query
  mocked.
- **Tests:** server 1139 / 46 → **1154 / 47**; web 2489 / 267 → **2523 / 274**. Mutation
  checks, all red, all restored from copies: server — a `manager` may rename (2 tests), the
  name checked before the role (1), no trim (3), limit 101 (1), limit 99 (1), no empty check
  (2), the read not scoped to the caller's household (4), the read's role a constant (2).
  Web — 26 mutations across 7 files, each red; one equivalent mutant, not counted: removing
  `useHousehold`'s local early return gives the same answer, because a skipped query already
  has no data.

**Review findings, fixed in `8d2b723d`** (`fix(households): cap long household names, and
pin the rename form`):

- **A first sign-in name could be longer than the rename allows.** `firstSignInNames`
  built the name from `User.displayName` with no cap, and the column is `TEXT`. The owner
  could then not save the name again unchanged. It now caps the household name at 100
  (`HOUSEHOLD_NAME_MAX_LENGTH`, moved to `lib/household.ts` so `cleanHouseholdName` and
  first sign-in share one constant). It shortens the display-name part, keeps the suffix
  ("'s Household" or "的家"), removes spaces left at the end of the cut, and never ends on
  the first half of a surrogate pair, so an emoji at the cut is dropped whole.
- **`HouseholdNameCard` now shows `invalidError` inline** when the trimmed name is over
  100, and Save is disabled then. Two cases reach it: a stored name that is already longer
  (see the `add_households` note under task 3.14), and a value set without typing, which
  `maxLength` does not cut. No new UI string: the existing `invalidError` ("Enter a name of
  1 to 100 characters." / "請輸入 1 到 {{max}} 個字的名稱。") fits. New story
  `OwnerNameTooLong`.
- **The length rule counts UTF-16 code units**, on the server (`String.length`) and in the
  web (`maxLength` and the new inline check). So an emoji counts as 2 or more. The en and
  tw strings say "characters" and "字". That is close enough for normal text, and was left
  as it is on purpose.
- **The form reset and the cache update are now pinned with real Apollo.**
  `HouseholdNameCard.apollo.test.tsx` renders `HouseholdLabel` and `HouseholdNameCard`
  under `MockedProvider` with the real generated hooks, renames to `"  The Lab  "`, and
  checks that the label shows "The Lab", the field holds the trimmed "The Lab", and Save is
  disabled. **It needs a `<Suspense>` inside `MockedProvider`.** Without it the tree
  renders as an empty `<div />` with no error; even a plain element placed before the card
  is missing. The brief said a `QueryClientProvider` fixes this. Measured: it does not,
  and it is not needed once the boundary is there. With the boundary nothing suspends (a
  fallback is never shown). The cause was not found.
- **The double-submit guard is pinned** by a test with the mutation's `loading: true`
  that submits the form directly. The `|| rename.isPending` in Save's `disabled` cannot be
  pinned: `Button` also disables itself while `isLoading` is true, so removing it changes
  nothing a user can see (the mutation was run: all tests stay green). The guard in
  `onSubmit` is the one the test proves.
- **Tests:** server 1154 / 47 → **1160 / 47**; web 2523 / 274 → **2529 / 275**. Mutation
  checks, each red, each restored from a copy: no cut in `firstSignInNames` (5 tests), no
  surrogate check (1); no length check in the card (2), no `key={data.name}` (1, the Apollo
  test: the field kept `"  The Lab  "`), no `rename.isPending` in `onSubmit` (1).

## Task 3.14 — The second migration: drop the old scope

**Files:** `schema.prisma`; migration `<YYYYMMDD>000000_drop_user_scope`;
`verify-migration.ts`; `schema/location.graphql`, `schema/import.graphql`; the six
`userId: String!` fields (`item.graphql:18`, `tag.graphql:5` and `:12`, `vendor.graphql:4`,
`recipe.graphql:59`, `shelf.graphql:20`); `test/stockFake.ts`; every resolver and test that
still writes `userId` on the seven models.

- [x] **Step 1:** Schema: `householdId` becomes required on the seven models. Drop `userId`
  from them, and its indexes. Drop `Location.isDefault`. Keep `order`. In SQL: a
  `DO $$ RAISE EXCEPTION` guard on null `householdId` first, then `SET NOT NULL`, then
  `DROP INDEX IF EXISTS "Location_one_default_per_user_key"` BY NAME, then the other
  drops. The named drop comes FIRST: `DROP COLUMN "isDefault"` also removes that partial
  index, because the index names the column, so a `DROP INDEX` after it would find
  nothing. The migration drops it by name so a reader can find where it went. (This step
  used to say "the drops, then `DROP INDEX`". It was built the other way, which is the
  order above. Done in `2312707a`.)

  **Close the gap between the two migrations first** (task 3.3 review). Each migration
  file is its own transaction, and the old server keeps serving until Railway switches. So
  after `add_households` commits, the old server can still write a row with a null
  `householdId`, a location with no organizer, or a new person with no household. The guard
  alone would then fail the release. So `drop_user_scope` starts by:
  1. `LOCK TABLE` on `User` and the seven tables, so no new write lands during the rest;
  2. re-running steps 2–7 of `add_households` so they only add what is missing
     (`WHERE "householdId" IS NULL`, `NOT EXISTS` for members and households);
  3. then the guard, then `SET NOT NULL`.

  `verify-migration.ts` must prove step 2: seed one row with a null `householdId` and one
  new `User` between the two deploys, and check both are filled in.

  **From the review of task 3.10:**
  - The re-run of steps 2–7 also fills the null-`householdId` rows that pile up on the
    shared test database (see *Known gaps*, *Traps*). Once it has run there, they stop.
    (The owner decided on 2026-11-11 not to build Q3's `/e2e/cleanup` change for this.)
  - `createFirstLocation` (`lib/household.ts`) is the ONE place that writes `isDefault: true`
    and `userId` for a new "Home" (first sign-in and `clearAllData`). Remove both there; no
    other call site writes them for "Home".

  **From the review of task 3.12:** dropping `isDefault` breaks several cloud E2E helpers
  and specs, because they select it straight from the server. Task 3.15 must land in the
  same push as this task, or right after it. See task 3.15 for the list.

  **From the review of task 3.13:**
  - **Existing household names may be longer than 100 code units.** The `add_households`
    migration built each name from `User.displayName` with no cap. Do NOT edit that
    migration: it is applied on the test database. Since `8d2b723d` the web name card shows
    an inline error for such a name and the owner can shorten it, and first sign-in caps
    new names. **An option, not a requirement:** `drop_user_scope` may also cap the
    existing names in SQL. If it does, cut the display-name part and keep the suffix, as
    `firstSignInNames` does. Postgres `left()` and `char_length()` count characters (code
    points), not UTF-16 code units, so an emoji counts as 1 there and 2 in the app. A cap
    of 100 in SQL can therefore still leave a name the app calls too long. Cut to fewer
    characters, or check the result in `verify-migration.ts` with JavaScript
    `String.length`. The rehearsal (task 3.16) can count how many names are over 100 first.
  - **Any test with its own `vi.mock('@/generated/graphql')` that renders a route which is
    not full-screen must stub `useGetHouseholdQuery`** (the sidebar's 🏠 label reads it on
    every such page). Three files spread `importOriginal` and render item routes, which are
    full-screen today, so they have no stub: `routes/items/$id/stock.cloud.test.tsx`,
    `routes/items/$id/index.cloud.test.tsx`, `routes/items/$id/stock.test.tsx` (and
    `stock.stories.test.tsx`, which renders the same route's stories). If one of them ever
    renders a route that shows the sidebar, the real query errors, and the label falls
    back to "My data". A test that asserts "My data" would then pass for the wrong reason.
    The review also named `hooks/useLocations.test.tsx`; checked: it renders hooks and
    `LocationList`, not a route, so it is not at risk today.
- [x] **Step 2:** Run `pnpm build`. **`tsc` now lists every leftover `userId` use on these
  models.** Fix each one. This is the sweep that proves nothing still scopes by account.
  List the count in the report.
- [x] **Step 3:** Remove `isDefault` from the `Location` GraphQL type and its comments in
  `import.graphql`. Remove the six `userId: String!` fields (#359 step two; decision H11).
- [x] **Step 3b:** Drop `requiredColumns: ['userId']` from the catalog `ownedRowFake` stores
  (added in task 3.7). The column no longer exists, so a fake that still requires it would
  refuse every correct create.
- [x] **Step 4:** `stockFake.ts`: remove `DefaultLocationConstraintError` and every
  `isDefault` match. The migration comments in `20260916…/migration.sql` (about 30) and
  `20260917…/migration.sql` (about 49) argue from the old index. They stay as history and
  are NOT edited: both migrations are applied, and editing an applied migration changes
  its checksum, so `prisma migrate` would report it as modified. Instead, the comment
  above `DROP INDEX` in `drop_user_scope` names both files and says the index is gone
  from this migration on. (This step used to say "add a line" to the two old files.
  Done in `2312707a`.)
- [x] **Step 5: `verify-migration.ts`.** Add the folder to `MIGRATIONS`. **Re-read every
  earlier assertion**: the PR 1 block asserts `isDefault` exists and that a second default
  fails with `P2002` (about 373-438). The script asserts the **final** state, so those break.
  Replace them with the new facts (no `isDefault` column; the index is gone), following the
  "present on one table, absent on the other" rule in `apps/server/prisma/CLAUDE.md`.
- [x] **Step 6:** Full gate. Commit:
  `feat(server): drop the account scope from locations and the catalog (#359, #360)`.
- [x] **Step 7 (main session):** with the owner's consent, migrate the test database again,
  as in task 3.3 step 6.

  **Done 2026-11-11** on the shared test database (`ep-round-surf-a1owh3iu`), after a
  reset:
  - `verify:migration` exited 0, with 162 `ok` lines. Every cleanup kind was checked.
  - The first sign-in race proof passed, with the claim made by `tx.user.updateMany`
    (the same call as `ensureHousehold`): "the second claim WAITED for the first
    transaction … exactly one of two overlapping claims wins: 1 and 0".
  - `prisma migrate diff --from-url $TEST_DIRECT_URL --to-schema-datamodel
    prisma/schema.prisma --exit-code` exited 0: no drift.
  - **The `RAISE NOTICE` counts did NOT appear in the script's output.** So the
    rehearsal in task 3.16 must count with plain queries (the review's runbook item 9
    already says this). This run proves it only for the way `verify-migration.ts` calls
    `migrate deploy`. It is still not proven whether a bare `prisma migrate deploy`
    prints them.

  **From the review of task 3.5:** if the race proof was not re-run since commit `3ba61aeb`
  (see task 3.3 step 6), this run is where it happens. Report its result. When step 5 edits
  `verify-migration.ts`, keep the race proof's claim the same call as `ensureHousehold`'s
  (`tx.user.updateMany` with `where: { id, householdSetupAt: null }`).

**Done** (steps 1 to 6) in `2312707a` (the code and the migration
`20261111000000_drop_user_scope`) and `56aa15de` (the owner's answers on cross-household
rows). Step 7 was done by the main session on 2026-11-11 (see above).

**What the implementer said the plan got wrong:**

- **`tsc` does not list every leftover write (step 2).** Seven writes in
  `import.resolver.ts` were behind `as any`, so `tsc` could not see them. They were found
  by grep. The test fakes now refuse a dropped column on every write, so such a write
  fails a test.
- **Step 5 needed a third deploy in `verify-migration.ts`.** The Q4 cleanup deletes the
  PR 3a and PR 3b fixture rows. So the blocks that read `userId` and `isDefault` run
  between `add_households` and `drop_user_scope`, and `drop_user_scope` is applied after
  them.
- **The literal re-run of `add_households` steps 2 to 7 breaks** on household members and
  removed members. So each statement got its own condition (for example
  `"householdSetupAt" IS NULL` in 2b and 2c, and the join through `HouseholdMember` in 2d).
- **The file list omitted `apps/server/src/test/shoppingFake.ts`.** It also writes the
  dropped columns, and was changed.

**Found by the review of task 3.7: what to do with cross-household rows that already exist.
DECIDED by the owner on 2026-11-11: option A, with A1 for a tag's type, and the three
stock-side kinds too (Q4).** `drop_user_scope` cleans them up, in its step 3, before the
guard. Task 3.16's rehearsal still measures how many there are (the `RAISE NOTICE` lines).

| Question | Decision (owner, 2026-11-11) |
|---|---|
| A: clean up cross-household rows in `drop_user_scope` | **Yes, option A.** |
| A-sub: a tag whose `typeId` is another household's type | **A1:** copy the type into the tag's own household (same name and color; one copy per household and type) and point the tag at the copy |
| Q4: also clean cross-household `ItemStock`, `CartItem` and `InventoryLog` rows | **Yes.** They are deleted |

The text below is the question as it was asked, kept for the reasons.

*The problem.* Before #273 (task 3.7) the server did not check the ids a write attached. So
production may hold rows that link one household's row to another household's row. Migration
step 8b in `add_households` counts five kinds: `ItemTag`, `ItemVendor`, `RecipeItem`,
`Tag.typeId` and `Tag.parentId`. A sixth kind it does not count: ids of another household
inside `Shelf.itemIds` and `Shelf.filterConfig`.

Since task 3.7 these rows cause four problems:

| Problem | Why |
|---|---|
| a full-set edit fails with `FORBIDDEN` | the web sends the WHOLE list back on every edit, old ids included, and `requireCatalogIds` refuses the other household's id. The places: `routes/items/$id/relation/tags.tsx` (about 144-150), `routes/items/$id/relation/vendors.tsx`, `components/pantry/VendorDetailView.tsx` (about 189), and `toVars` in `hooks/useRecipes.ts`, plus the shelf `itemIds` / `filterConfig` arrays. A reviewer proved the `FORBIDDEN` with a probe. The user probably cannot fix it in the app: the bad id is not one of the household's rows, so the app lists no button to remove it (not checked in a browser) |
| the other household's ids leak | `item.tagIds` (and the vendor and recipe lists) return the other household's ids to this household |
| `deleteTagType` fails | a `Tag.typeId` that crosses households makes Postgres refuse the type delete. Since `ec17fe8d` it rolls back and returns `false`, so no data is lost, but the type can never be deleted |
| a household can never be deleted | the same `Tag_typeId_fkey`, as step 8b's comment says |

*Options.*

- **(A, recommended) Clean them up in `drop_user_scope`.** In the migration, before the
  guard:
  - delete cross-household `ItemTag`, `ItemVendor` and `RecipeItem` rows;
  - set a cross-household `Tag.parentId` to `NULL` (the tag becomes top-level);
  - remove other households' ids from `Shelf.itemIds` and `Shelf.filterConfig`;
  - for a cross-household `Tag.typeId`, **a sub-choice the owner must make**: (A1) move the
    tag to a copy of the type in the tag's own household (same name and color; one copy per
    household and type), or (A2) delete the tag (its `ItemTag` rows go by cascade). A1 keeps
    the user's data; A2 is simpler.
  - **if the owner agrees (Q4 below), also** the three stock-side kinds described after
    this list: cross-household `ItemStock`, `CartItem` and `InventoryLog` rows;
  - report each count with `RAISE NOTICE`, the same way step 8b does;
  - `verify-migration.ts` seeds one row of each kind and checks each is cleaned, and that a
    same-household row next to it is kept.

  Why recommended: it removes the leak and every `FORBIDDEN` at once, and the server code
  stays as it is.
- **(B) Let `requireCatalogIds` accept an id the row already holds.** The write would pass
  when the other household's id was attached before. More code at every call site (each has
  to read the row's current ids first), and it keeps the leak and the `deleteTagType` and
  household-delete failures.

*How many.* Probably 0 in production: a person could only attach another account's id by
calling the API by hand with a guessed `cuid`. Task 3.16's rehearsal on a production copy
records the step 8b counts. Step 8b does not count the shelf arrays, so the rehearsal needs
one more query for them. If every count is 0, the owner may choose to do nothing, but note
that import still writes unchecked `typeId` / `parentId` and shelf ids until task 3.9 fixes
it (see the note there).

*Three more kinds, found by the review of task 3.10.* `main`'s `upsertItemStock` and
`addToCart`, and maybe `addInventoryLog`, did not check that the item and the location
belong to the same account. So production may also hold:

| Row | Crosses households when |
|---|---|
| `ItemStock` | its item's household is not its location's household |
| `CartItem` | its item's household is not its cart's location's household |
| `InventoryLog` | its item's household is not its location's household |

Migration step 8b does not count them, and task 3.16's rehearsal does not either today.
There is one more effect. `clearAllData` deletes this household's items, and the foreign
keys from `ItemStock`, `RecipeItem`, `CartItem`, `InventoryLog`, `ItemTag` and `ItemVendor`
to `Item` are all `ON DELETE CASCADE`. So a clear also deletes such a row when it sits in
ANOTHER household but names this household's item. This is not new: the old `userId`
filters did the same. It is probably 0 rows. It belongs to this open question, not to a
separate fix.

**Questions for the owner (from task 3.10). DECIDED on 2026-11-11.**

| # | Question | Recommendation | Decision (owner, 2026-11-11) |
|---|---|---|---|
| Q1 | After *Clear household*, should the other members get a role on the new "Home"? Today only the caller gets `organizer`, so the others see no location until H5 | Nothing is needed before H5: every household has one person. Decide in H5 or H6, for example `organizer` for the owner and managers, `participant` for members | **Nothing before H5.** Nothing is built |
| Q2 | Should the new "Home" be "Home" or "住家" by the app language, as first sign-in does? Task 3.10 used the app language; the plan said "Home" | Keep it by the app language | **Yes, by the app language.** Task 3.10 already does this; no change |
| Q3 | Until task 3.14, should `/e2e/cleanup` also delete the user's rows with a null `householdId`? E2E only, and temporary | Yes, if `main`'s cloud E2E still runs on the shared test database. Otherwise it is not needed | **Not built.** `drop_user_scope`'s re-run of the backfill fills those rows, and `SET NOT NULL` ends them |
| Q4 | Should option A's cleanup (task 3.14) also cover cross-household `ItemStock`, `CartItem` and `InventoryLog` rows? | Yes | **Yes** (see the table above) |

**The owner also checked (2026-11-11):** `E2E_TEST_MODE` is `false` on production Railway.
`apps/server/src/index.ts` (about line 25) compares it with `=== 'true'`, so the E2E-only
routes stay off in production.

**Decided on 2026-11-11:** removing an item from a location (`removeItemFromLocation`) needs
location role `organizer`. It still deletes the logs other members wrote. See task 3.8,
*Owner decisions 2026-11-11*.

## Task 3.15 — E2E: the default location is gone

**Files** (research 2026-11-03; re-check with
`grep -rln "isDefault\|My Home\|ensureCloudDefaultLocation" e2e/`):
`e2e/helpers/cloudSeed.ts`, `backupAssertions.ts`, `stockReadback.ts`, `fixture.ts`;
`e2e/tests/settings/data-mode-migration.spec.ts`, `import-strategies.spec.ts`,
`import-export-cloud.spec.ts`, `locations.spec.ts`, `shelves.spec.ts`;
`vendors-group`, `shelves`, `recipes-group`, `settings-global-pages`,
`unified-item-search`, `location-scoped-writes`, `location-not-stocked-here`,
`item-stock-input`, `item-stock-pager`, `cooking`, `item-logs`, `shopping`,
`item-list-state-restore`, `cleanup-endpoint`, `cart-id-cross-user-leak`,
`location-switcher` `.spec.ts`; `e2e/CLAUDE.md`.

- [x] **Step 1:** `ensureCloudDefaultLocation` becomes `ensureCloudHomeLocation`. It calls
  `locations` (which runs first sign-in) and returns the first location. Fixtures keep a
  `HOME` key, mapped onto that location for cloud. Local seeds keep `isDefault` and
  "My Home".
- [x] **Step 2:** Cloud expectations of "My Home" become "Home". `settings/locations.spec.ts`'s
  "Default location is undeletable" becomes two tests: local (unchanged) and cloud (the last
  location cannot be deleted; a second one can).
- [x] **Step 3:** `item-stock-pager.spec.ts` relies on the default being at `order` 0. The
  first sign-in location is created with `order` 0, so check that this still holds.
- [x] **Step 4:** `import-strategies.spec.ts` and `data-mode-migration.spec.ts`: keep the
  `clear` → "Home is re-created" expectation, and keep the colliding item **and** the new item
  in `import-strategies.spec.ts` (#330 guard, design *Known gaps*). H4 rewrites them again
  for its dialog.
- [x] **Step 5:** Run the cloud project alone, then local alone. **Copy `test-results/` aside
  before any re-run** (root `CLAUDE.md`).
- [x] **Step 6:** Commit: `test(e2e): cloud has no default location any more`.

**Done 2026-11-11** in `f16d497f` (the specs and helpers) and `5d4322f3` (the new
same-household restore test). Notes:

- Step 1: the fixtures keep their `isDefault` key, not a new `HOME` key. Local needs the
  flag anyway, and in cloud `seedCloudFixture` maps that entry onto "Home" and renames it.
  So a fixture that says "My Home" shows "My Home" in both projects, and only the specs that
  never seed (`locations`, `location-switcher`) needed the cloud name. They use
  `homeLocationName(baseURL)` from `e2e/constants.ts`. `readLocations` returns `isHome`
  (the `isDefault` row in local, the first location in cloud).
- Step 3: holds. The pager tests pass in cloud: first sign-in makes "Home" at `order` 0.
- Step 4: `DESTINATION_DEFAULT_LOCATION_NAME` became `destinationDefaultLocationName(baseURL)`
  ("My Home" in local, "Home" in cloud). Both import-strategies items are kept.
- `settings-global-pages.spec.ts`'s sidebar test now runs in cloud. It renames the household
  first and checks the 🏠 label shows that name.
- Step 5: before this task **76 of 130** cloud tests failed (57 on `isDefault`, 19 on the
  name). After it: cloud **126 passed, 7 skipped** (133), local **178 passed, 6 skipped**,
  pwa **73 passed**.
- The two items owed by the review of task 3.12 are done: every `isDefault` read is gone
  from `e2e/`, and the same-household restore test exists (see the next note).

**What this task found about the restore test (review of task 3.12).** Mutation: removing
the same-household check in `buildLocationRemap` makes the `replace` test fail, but only on
the CART (Home's cart count 0, expected 1). Home's stock row and log stayed on Home under
that mutation. Probably because the server's upserts keep an existing row's location when
the id matches, so only the cart, whose id carries its location, moved. Not checked in the
server code. The `skip` test stays green under the mutation: it is a negative control.

**Review of task 3.15** (fixed 2026-11-11, after `421b9286`):

- **The guess in the note above is right, and is now checked in the server code.**
  `bulkUpsertItemStocks` updates the quantities only, and `bulkUpsertInventoryLogs` writes
  `locationId` in `create` only, so an existing stock row or log stays at Home whatever the
  remap says. `bulkUpsertCartItems` writes `cartId` in `update` too, so under `replace` an
  existing cart item moves into the new `Attic:<vendor>` cart. That is why only the cart
  went red.
- **The comment above `buildLocationRemap` was false for cloud, and the task 3.12 note
  copied it** ("Home's stock, carts and logs land under Attic, and with `replace` Attic is
  renamed"). Attic is not renamed: locations go on the create pass only, and
  `bulkCreateLocations` skips an id that exists. Both are corrected (see the task 3.12
  note). The rename is what local would do, but local never runs this check.
- **The restore test can now fail on stock and logs.** After the export it calls
  `removeItemFromLocation(CLOUD_ITEM_ID, Home)`, which deletes Home's stock row, log and
  cart item (location role `organizer`, which the test user holds on Home through
  `createFirstLocation`). A precondition checks all three are gone. The restore then has
  to create them, and a created row takes the remapped location. `replace` re-creates all
  three on Home. `skip` re-creates the log and the cart item but not the stock
  (`stocksForItems` sends stock only for items it creates), so Home's stock is expected to
  be empty there. Readbacks after the import use `expect.poll`.
- **Mutation, same-household check removed, every post-restore assertion made soft for one
  run so each could be seen:**

  | Assertion | `skip` | `replace` |
  |---|---|---|
  | four location names; Attic kept its name | green | green |
  | Home's stock | green (expects `[]`; negative control) | **red**: `[]`, expected `[2]` |
  | Attic holds no stock | green (negative control) | **red**: `[2]` |
  | Home's cart count is 1 | **red**: 0 | **red**: 0 |
  | Attic's cart count is 0 | **red**: 1 | **red**: 1 |
  | Home's log is back | **red**: `[]` | **red**: `[]` |
  | no log at Attic | **red**: log `…006` there | **red**: log `…006` there |

  With hard assertions (as committed) the first red line is the cart (`skip`) and the stock
  (`replace`). Restored from a copy, checked with `cmp`.
- **"keeps each cart at its own location"** now checks that the row it calls Home holds
  Home's stock (2). Before, a lookup that picked a location with no cart (Fixture Cabin)
  also passed its "0 carts at Home" check. Mutation (the lookup picks Fixture Cabin): red,
  received `[3]`.
- The opening line of the task 3.5 paragraph below was lost in `421b9286` and is restored.
- Gate after the fixes: `pnpm lint`, root `pnpm build` (no `TS6385`), `build-storybook`,
  `pnpm check` all exit 0; `pnpm test`: web **2529 / 275**, server **1161 / 47**, spec
  **70**. E2E: `import-export-cloud.spec.ts` in `cloud` **8 passed** (3.7m); the whole
  `cloud` project **126 passed, 7 skipped** (22.1m; load average 5.8 at the start, 1.6 at
  the end).

**Found by the review of task 3.5, and owed here:** these `e2e/` files still name the deleted
`ensureDefaultLocation` or `lib/defaultLocation.ts` in comments: `helpers/cloudSeed.ts`,
`helpers/backupAssertions.ts`, `tests/cleanup-endpoint.spec.ts`, `tests/item-logs.spec.ts`,
`tests/item-stock-pager.spec.ts`, `tests/location-switcher.spec.ts`,
`tests/settings/data-mode-migration.spec.ts`, `tests/settings/import-export-cloud.spec.ts`,
`tests/settings/import-strategies.spec.ts` and `tests/settings/locations.spec.ts`. Correct
them here. Find them with `git grep -n -w ensureDefaultLocation -- e2e/` and
`git grep -n defaultLocation.ts -- e2e/`. (`ensureDefaultLocationRow` in
`import-export-local.spec.ts` is a local-mode name, not this one.) `e2e/CLAUDE.md` was
already corrected in `3ba61aeb`.

**Done in `f16d497f`** (checked 2026-11-11 by the review of task 3.15). The two `git grep`
commands above still find four hits outside `e2e/CLAUDE.md`, and each is written as
history (the function "was deleted", "until task 3.5"), so it is correct:
`e2e/helpers/cloudSeed.ts:64-67`, `e2e/helpers/backupAssertions.ts:57`,
`e2e/tests/item-stock-pager.spec.ts:68` and `:264`.

**Found by the review of task 3.12, and owed here:**

- **These E2E files read `isDefault` straight from the server**, in their own GraphQL
  strings. They work only while `createFirstLocation` writes `isDefault: true` and the
  `Location` type declares the field. Task 3.14 removes both, so they break then. **This task
  must land with 3.14 or right after it.** Re-check with `grep -rn isDefault e2e/`:
  - `e2e/helpers/stockReadback.ts`: `readLocations` (the `LOCATIONS` query, about line 75)
  - `e2e/helpers/backupAssertions.ts`: `expectFixtureLocations` (about 162, 174) and
    `expectStockNotCollapsedOntoDefault` (about 251)
  - `e2e/tests/settings/import-export-cloud.spec.ts`: about lines 468, 507, 540 and 608
  - `e2e/tests/purge-two-households.spec.ts`: the `LOCATIONS` query, about line 52 (and the
    type at about 130)
  - `e2e/helpers/cloudSeed.ts` (about 26-30, 76, 117), already in the list above
- **Add a cloud E2E case for a same-household restore with a new location at the top.**
  Back up a household with Home (order 0) and a second location, create a third location
  and drag it to the top, then restore with `skip` and with `replace`. Home's stock, carts
  and logs must stay on Home, and the third location must keep its name. The unit tests in
  `apps/web/src/lib/importData.test.ts` prove the payload the web sends; only E2E proves
  the server writes it there.

**Found by the review of task 3.13, and owed here:**

- **Every cloud page load that renders the sidebar now sends one `household` request**
  (the 🏠 label; the sidebar is in the DOM at every width, only hidden by CSS on mobile,
  and only full-screen pages drop it). It calls `requireHousehold`, so it is also a first
  sign-in path, like `locations`. A spec that counts requests, or waits for the network to
  go quiet, sees one more.
- **The 🏠 link and the household page title show `<displayName>'s Household` in cloud**,
  not "My data". Local and `pwa` keep "My data". Checked with `grep -rn "My data" e2e/`:
  the hits are in `a11y.spec.ts` (not in the `cloud` project) and in
  `settings-global-pages.spec.ts`. That file's test "user sees My data and Preferences
  pinned to the bottom of the sidebar…" skips cloud, and its skip reason is **no longer
  true**: it says the sidebar renders the same markup in local and E2E cloud, but the 🏠
  label now differs. Correct the reason, or run the test in cloud with the household name.
- **Same trap as in unit tests:** see the note under task 3.14 about stubbing
  `useGetHouseholdQuery`.

## Task 3.16 — Runbook, docs and the final gate

- [ ] **Step 1: Deploy runbook** `docs/global/backend/<date>-deploy-runbook-households-h3a.md`.
  Model it on `2026-09-18-deploy-runbook-cart-rekey.md`. It must cover:
  1. **First:** check that the live Cloudflare web build is from `8465406b` or later (#359).
  2. Take a Neon branch of production. This is the rollback.
  3. **Rehearsal (main session, owner's consent):** apply both migrations to a **fresh**
     branch of production, with the env override proved first (`apps/server/prisma/CLAUDE.md`
     *Prod-copy rehearsals*). Record: users = households = owner rows; no null
     `householdId`; every location has an organizer; how many "Home" locations were added
     and for whom. **Never point `verify:migration` at it.** Also record:
     - the `RAISE NOTICE` counts of cross-household references (`Tag.typeId`,
       `Tag.parentId`, `ItemTag`, `ItemVendor`, `RecipeItem`). These come from the old
       unchecked writes fixed by #371. A `Tag.typeId` that crosses households blocks the
       deletion of the type's household.
       **Since 2026-11-11 `drop_user_scope` cleans these up** (the owner chose option A, A1
       and Q4; see the decision under task 3.14). Its step 3 reports one `RAISE NOTICE`
       count per kind: type copies made, tags moved to a copy, tag parents cleared,
       `ItemTag`, `ItemVendor` and `RecipeItem` rows deleted, shelves that lost item ids
       and filter tag, vendor or recipe ids, and `ItemStock`, `CartItem` and
       `InventoryLog` rows deleted. Record each count. A count above 0 is data the cleanup
       changed in production, so tell the owner
     - every `User` row the migration created with the placeholder name `'User'`. Those
       people get "User's Household" until Clerk sends `user.updated` or they rename it, and
       their `deletedAt` stays null even if the Clerk account is gone
     - **a `replace` migration with name-only conflicts** (review of task 3.9). Import a
       local backup with the `replace` strategy where some items, tags, vendors and recipes
       share a NAME (not an id) with cloud rows, and a new shelf names them. Check that the
       shelf keeps every one of those ids afterwards. Those rows are written in the second
       pass, after the shelf; `03e32094` fixed the shelf losing them. Also note whether cart
       items naming such an item survive (see *Known gaps*)
  4. Merge, watch the Railway release log, wait for Cloudflare, hard reload.
  5. The stale-bundle window: any open tab gets failed queries until it reloads.
  6. A manual smoke test in production: the pantry looks the same; the 🏠 label shows the
     name; rename it; create, rename and delete a location; the last location cannot be
     deleted; a checkout still works.
  7. What to do if the release command fails (`migrate resolve --rolled-back`).
  8. **Deploy order for `Location.isDefault`** (review of task 3.14). `main`'s web bundle
     selects `Location.isDefault`: `apps/web/src/apollo/operations/locations.graphql` on
     `main`, lines 6, 17, 28 and 43 (`GetLocations`, `CreateLocation`, `UpdateLocation`,
     `ReorderLocations`), and `import.graphql` lines 206 and 217 (`BulkCreateLocations`,
     `BulkUpsertLocations`). Check with `git show origin/main:<path>`. This branch removes
     the field from the schema. A query that names a field the schema does not have fails
     GraphQL validation, so the whole query errors. Between the server deploy and the web
     deploy, every location query and mutation from the old bundle fails. This is the same
     two-step problem root `CLAUDE.md` describes for `userId` (#359). The runbook must say
     which deploys first, and how long the gap may be.
  9. **Do not rely on `RAISE NOTICE` reaching the deploy output** (review of task 3.14).
     It is not known whether `prisma migrate deploy` prints notices. So in the rehearsal,
     either run a plain count query for each cleanup kind against the production copy
     before deploying, or prove once that the notices appear.
  10. **The lock has no `lock_timeout`** (review of task 3.14). `drop_user_scope` starts
      with `LOCK TABLE … IN EXCLUSIVE MODE` on 18 tables. It can wait behind a long
      transaction, or deadlock with the old server. In a deadlock Postgres cancels one
      side. A cancelled migration fails cleanly, and it can be run again.
- [ ] **Step 2: Docs.** Root `CLAUDE.md` *Authorization (cloud)*: households are built; the
  helper bodies; the role names; `requireOwnRowOrUnclaimed` covers six catalog models by
  household and three by `userId` until H3b and H4. `apps/server/prisma/CLAUDE.md`,
  `e2e/CLAUDE.md` (cleanup, the default location, 18 models), `apps/web/src/routes/settings/CLAUDE.md`
  and `components/CLAUDE.md` (the label), `apps/web/src/hooks/CLAUDE.md`. The design's
  *Sequencing* table: H3a built. `docs/INDEX.md`. Re-measure every count you write.
- [ ] **Step 3: Final gate:** the verification gate, then `pnpm test:e2e:all`. All three
  projects green.

  **From the review of task 3.5:** before this step, confirm that `verify:migration` has
  passed against the test database with the `updateMany` race proof (commit `3ba61aeb`; see
  task 3.3 step 6 and task 3.14 step 7). If it has not, it needs the owner's consent and a
  run here.

  **From the review of task 3.6:** prove the household lock on real Postgres. Add a case to
  the two-connection harness in `verify-migration.ts`, like the `User` claim race proof: two
  transactions each run `lockHousehold`'s `UPDATE` on the same household, and the script
  checks with `pg_blocking_pids` that the second waits for the first. Then the second
  transaction's count must see the first one's committed delete. Run by the main session,
  with the owner's consent.

  **From the review of task 3.10:** the case above proves the lock with two copies of the
  same `UPDATE`. It does not run `clearAllData` at the same time as `deleteLocation`. Add a
  second case for that pair: `clearAllData` must take `lockHousehold` before its location
  `deleteMany`, so the two never deadlock (see the task 3.6 review note under task 3.10).
  Today that order is pinned against the fake only.

  **From the review of task 3.13:** list in the runbook's *open on purpose* items that
  `renameHousehold` has a race with H6's hand-over. It reads the caller's role, then runs
  one `UPDATE` with no `lockHousehold`, so an owner who hands the household over at the
  same moment could rename it once more. This is left open on purpose (see the task 3.13
  Done note); H6 decides whether it matters. Nothing to prove on Postgres for it in H3a.
- [ ] **Step 4:** Commit: `docs(households): H3a runbook and docs`.

---

## Execution

Run this plan with `superpowers:subagent-driven-development`: one fresh subagent per task, a
review between tasks, and the main session reporting each task's result to the owner. Tasks
3.3 step 6, 3.14 step 7 and the runbook rehearsal in 3.16 are run by the main session, each
with the owner's consent.

**Between tasks 3.5 and 3.15 the cloud E2E project is expected to fail** in places that read
`isDefault` or "My Home". Run narrowed specs for the area each task touches, and the whole
suite only at task 3.16.

**The review of task 3.5 found more expected failures** in that window. Each ends at the task
named:

| What fails in cloud E2E | Why | Ends at |
|---|---|---|
| creating a location, then renaming it, stocking it, or writing a log or cart there | `createLocation` writes no `organizer` row, so `requireLocationRole` refuses the next call | 3.6 |
| cloud import with locations, for example `settings/import-export-cloud.spec.ts` | `bulkCreateLocations` / `bulkUpsertLocations` write no role rows, so the item stocks that follow are refused | 3.9 |
| anything after `clearAllData` that needs a location | the household is left with no location, and `fallbackImportLocation` throws `NO_LOCATION` | 3.10 |
| a location created by a cloud import (`bulkCreateLocations` / `bulkUpsertLocations`) or by a local→cloud migration is missing from `locations`, the switcher and exports | those mutations write no `organizer` row, and since 3.6 `locations` lists only locations with a role row | 3.9 |
| `/e2e/cleanup` for any user who has signed in since 3.5 | it does not delete `HouseholdMember` rows, so deleting the `User` row fails with `P2003` (see below) | 3.10 |

**A user left behind by `main`'s cloud E2E breaks first sign-in here.** `main`'s server still
runs `ensureDefaultLocation`. On the shared test database it can leave a user with an
`isDefault` location (no household) and `householdSetupAt` null. For that user,
`ensureHousehold` claims the user, then creates a second `isDefault` location, and
`Location_one_default_per_user_key` refuses it with `P2002`. The transaction rolls back, the
claim is undone, and the same thing happens on **every** request for that user. Delete that
user's old locations (with the owner's consent) before running this branch's cloud E2E.

**The test database is shared with every other branch, `main` included.** From task 3.5 on,
a cloud E2E run on this branch creates `HouseholdMember` rows for the E2E user ids. Until
task 3.10, `/e2e/cleanup` does not delete them, and `HouseholdMember.userId` stops the
`User` row from being deleted. So after a cloud E2E run here, cleanup fails with `P2003` on
**every** branch that uses the same E2E user ids. Before anyone runs `main`'s cloud E2E, re-run
`verify:migration` (with the owner's consent) or delete those member rows. After task 3.14
drops `userId`, `main`'s cloud E2E cannot run on this database at all until H3a merges.

## Known gaps

- **Owner and manager do not see locations they have no role on** until H5. Nobody can be in
  that state before H5, because every location's creator is its organizer.
- **A household member cannot leave, and nobody can be invited**, until H5. `NO_HOUSEHOLD` is
  therefore unreachable in production in H3a, but it is tested.
- **`requireOwnRowOrUnclaimed` still checks `InventoryLog`, `Cart` and `CartItem` by
  `userId`.** H3b changes the `cart` and `cartItem` delegates (`authz.ts` about 102-103,
  the lookup at about 152) to check through the location, because H3b drops `Cart.userId`.
  H4 then moves the whole body to the **target** household.
- **No phase owns the "no household" screen yet.** H5 brings leaving, which is the first way
  to reach `NO_HOUSEHOLD`. The H5 plan must add the screen.
- **The import fallback location is a stopgap** (decision H12). H4's dialog replaces it.
- **The `tw` household and location names are a first version.** The owner reviews them in
  the PR.
- **`fallbackImportLocation`'s `householdId` filter has no test that can fail** (review of
  task 3.5). A person is in exactly one household today, so removing the filter still picks
  the right location and every test stays green. The task that first lets a person into two
  households (H5 or later) must add a two-household test for it and mutation-check it.
- **`locations` does not filter by household** (review of task 3.6). It lists every location
  the caller has a counted role on. A person is in one household today, so this is the same
  thing. Once H5 lets a person into two households, they will see both households'
  locations. `fallbackImportLocation`'s household filter (above) is the same gap.
- **A small design mismatch for the owner: marking a recipe as cooked needs no location
  role** (review of task 3.7). `updateRecipeLastCookedAt` takes no location, and needs only
  household role `member`. So a household member with no location role, or only `viewer`,
  can mark a recipe as cooked. The design (*Location roles*) calls cooking a `participant`
  right. `consumeRecipes` does check location `participant`, because it names a location.
  Behaviour is not changed in H3a. The owner decides whether this is fine (it writes only
  `lastCookedAt`) or whether the mutation should take a location.
- **DECIDED 2026-11-11: removing an item from a location is `organizer` only** (was an open
  question from the review of task 3.8). `removeItemFromLocation` deletes EVERY log of the
  item at that location, including the logs other members wrote. The organizer-only purge,
  *Remove all items from this location*, KEEPS the location's logs. So with `participant` a
  person could delete co-members' logs one item at a time. The owner decided the removal
  needs `organizer`, and it still deletes the logs. See task 3.8, *Owner decisions
  2026-11-11*. Local mode is single-user and has no role check.
- **The web shows every role the *Remove from location* button, and a refusal shows no
  message** (from the 2026-11-11 decision). H3a has no role-aware UI. In cloud, a
  `participant` or `viewer` who confirms the removal gets `FORBIDDEN`. `DeleteButton`'s
  `handleConfirm` has `try/finally` and no `catch`, and `handleRemove` in
  `apps/web/src/routes/items/$id/stock.tsx` does not catch either. So the dialog stays open,
  its buttons come back, nothing is removed, and the error is an unhandled promise
  rejection in the console. Nobody shares a location before H5, so nobody can hit this
  yet. H5 must hide the button for a role below `organizer`, or show an error.
- **On `replace`, a create-pass row loses a reference to a row that comes in the second
  pass** (review of task 3.9). The web client sends rows with no conflict first
  (`bulkCreate*`), then conflicting rows (`bulkUpsert*`). A row that conflicts with a cloud
  row by NAME only keeps its payload id and is written in the second pass. So when a NEW
  row names it, the reference is skipped, because the row is not there yet. `03e32094`
  fixed this for shelves only. Found by reading the code, not tested, and all of them
  existed before task 3.9:
  - a cart item naming such an item is skipped (`resolveCartItemParents`)
  - a recipe item naming such an item is skipped (`bulkCreateRecipes`)
  - an item's `tagIds` and `vendorIds` naming such a tag or vendor are skipped
    (`bulkCreateItems`)
  - a child tag naming such a tag as its parent is skipped (`bulkCreateTags`)

  The fix is probably on the web side (send the name-only conflicts in the first pass, or
  re-send the references after the second pass). The task 3.16 rehearsal should show how
  often it happens.
- **A child tag in an earlier import batch than its new parent is skipped without a word**
  (review of task 3.9). The web client sends tags in batches of 50 (`BATCH_SIZE` in
  `apps/web/src/lib/importData.ts`). A batch only knows the parents in the database and in
  the same batch. `bulkCreateTags` has skipped such a child since `9bdb465c` (2026-04-12).
  `bulkUpsertTags` skips it since task 3.9; before that, Postgres refused it with a
  foreign-key error. Not checked: whether an export lists parents before children.
- **An import can write a tag cycle** (review of task 3.9, existed before). An existing tag
  of the caller's counts as "written" at the start of `bulkUpsertTags`. So a payload that
  reparents that tag under a new tag, which names the existing tag as its own parent, writes
  both, and the two tags are each other's parent.
- **A manager's reorder in H5 may leave some locations with old orders.** `reorderLocations`
  writes only the ids it is sent, and the web sends only the locations the caller sees. If
  H5 lets a manager see only some of the household's locations, the others keep their old
  `order`, and the list can end up with duplicate orders. Unless H5 lets managers see every
  location, H5 must handle this.
- **Owed to H5: a rule for which household a person is in** (review of task 3.11).
  `ensureHousehold` (`apps/server/src/lib/household.ts`) finds a person's household with
  `householdMember.findFirst({ where: { userId } })` and no `orderBy`. `requireHousehold`
  (`apps/server/src/lib/authz.ts`, about line 42) gets its answer from `ensureHousehold`.
  With two households per person, Postgres picks one, and the choice can change between
  requests. Nobody can be in two households before H5: the E2E member route refuses a
  member who already has a household. H5 must give these reads a rule (an `orderBy`, or
  "the active household") BEFORE it lets a person into two households.
- **Owed to H5: what happens to a person's own household when they accept an invite**
  (review of task 3.11). Every person gets a household at first sign-in. The E2E route
  avoids the question by refusing such a person. Invites cannot: H5 must decide whether the
  old household is kept, left or deleted.
- **Owed to H5: a person removed from a household gets `NO_HOUSEHOLD`** (review of task
  3.11). Their first sign-in claim (`User.householdSetupAt`) is set, so `ensureHousehold`
  makes no new household for them. `household-member-cleanup.spec.ts` proves this on real
  SQL. H5's "no household" screen must handle this case, not only a person who left.
- **Owed to H5: what the web shows a cloud user with no household** (review of task 3.13).
  Today such a user (`NO_HOUSEHOLD`, for example a removed member) sees "My data" on the 🏠
  link and the household page title, and no name card, with no message at all: the
  `household` query errors, `useHousehold` returns no data, and every reader falls back.
  The web has no `NO_HOUSEHOLD` handling anywhere (`grep -rn NO_HOUSEHOLD apps/web/src`
  finds nothing), and no global Apollo error link that could show one. H5 must decide what
  that user sees.
- **Owed to H4/H5: a household `member` sees Delete on every cloud location** (review of
  task 3.12). `LocationList` hides Delete only for the local default, and the web app does
  not know roles yet. When the server refuses with `FORBIDDEN`, the page shows the general
  `settings.locations.deleteError` ("Please try again"), which retrying cannot fix. When the
  UI learns roles, add a `FORBIDDEN` message, or hide Delete by role.
- **Not fixed: two cloud backups restored into local in turn can move one location's data**
  (review of task 3.12). A cloud backup made since task 3.12 names its default as the
  location with the lowest `order`. Restore one into local: its first location lands on
  "My Home". Later move a new location to the top in cloud, back up again, and restore that
  into the same local database: the new location now lands on "My Home", and the first
  file's location comes in under its own id as a separate row. Rare (two restores, with a
  reorder between them). A cloud backup has no other way to name a default, so the fix is
  a design choice, not a guard.

- **Test database only: `/e2e/cleanup` can leave rows the migration re-run handles badly**
  (review of task 3.14). For a household member, `/e2e/cleanup`
  (`apps/server/src/lib/e2eCleanup.ts`, about 149-154) deletes their `User` row and their
  `LocationMember` rows. It keeps the rows they wrote in a household they do not own,
  because it deletes catalog rows by owned household. When `drop_user_scope` then runs,
  step 2a gives that `userId` a new `User` row named 'User', and step 2b gives them a
  household. Step 2e can make them organizer of a location in ANOTHER household (a
  location they cannot reach), or a guard in step 4 raises. Production cannot reach this:
  `user.deleted` keeps the `User` row.
- **`verify-migration.ts` stays green if any of these is removed** (review of task 3.14),
  because no fixture or check reaches them:
  - the `LOCK TABLE` in step 1;
  - the whole guard in step 4 (no fixture makes it raise, so its raise path never runs);
  - step 2d's join through `HouseholdMember`, if changed back to `Household."ownerId"`
    (no fixture has a member who is not the owner AND has rows with a null
    `householdId`);
  - `"householdSetupAt" IS NULL` in step 2c;
  - the `jsonb_typeof(…) = 'array'` filter in step 3e (every `filterConfig` fixture holds
    arrays).
- **Step 2b of `drop_user_scope` builds new household names with no length cap** (review
  of task 3.14). First sign-in caps them at 100 (`firstSignInNames`). So a person filled in
  by the re-run can get a name longer than the rename allows, like the `add_households`
  names noted under task 3.14.
- **Step 3e turns a non-string element of a `filterConfig` array into a string** (review of
  task 3.14). It reads the arrays with `jsonb_array_elements_text`. This is harmless for
  `FilterConfig`, whose arrays are `[String!]`.

### Traps (review of task 3.10)

- **Rows with a null `householdId` now pile up on the shared test database.** Since task
  3.10, `/e2e/cleanup` deletes by household, so it never reaches a row with no household.
  Such rows come from `main`'s cloud E2E (only if it runs on the shared test database), or
  from runs of this branch before task 3.7. Several cloud specs seed fixed ids, for example
  `'item-milk'`. A leftover null row with that id can make such a spec fail with `FORBIDDEN`
  (the id belongs to no household of the caller) or `P2002` (the id is taken). That is a
  dirty database, not a code bug. Task 3.14's backfill re-run ends it. The owner decided
  on 2026-11-11 (Q3) not to clean them up before that.
- **`resolvers/purge-coverage.test.ts` refuses `{ householdId: householdId }`**, though it means the
  same as the shorthand `{ householdId }`. The text check accepts only the shorthand. It
  fails safe (a correct filter is refused, never a wrong one accepted). Write the shorthand.
