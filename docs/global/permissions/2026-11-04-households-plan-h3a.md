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

Three more for H3a:

9. **Never write `row.userId === ctx.userId` or `row.householdId === …` as a guard.** Every
   check goes through a helper in `lib/authz.ts`. A `where` filter on a read is fine.
10. **A role test needs a second person with a different role, and a location the caller has
    no role on** (design, *Testing notes*). With one person, "check the role" and "ignore the
    role" give the same answer.
11. **Do not touch `apps/web/src/db/`.** Local mode keeps `isDefault`, "My Home" and its own
    data model.

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
- **Delete `apps/server/src/test/derivedRoles.ts`** once no file imports it. Check with
  `git grep -l derivedRoles -- apps/server/src`, which must print nothing. If a file
  still imports it here, remove it from that file first (see the note under task 3.6).

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

## Task 3.11 — A second household member in E2E

**Files:** `apps/server/src/lib/e2eHouseholds.ts` and test (new); `index.ts`;
`webhookRouteOrder.test.ts` (its route guard); `e2e/helpers/cloudUsers.ts`; a new spec
`e2e/tests/cloud-roles.spec.ts`; `e2e/playwright.config.ts`.

- [ ] **Step 1:** `POST /e2e/household-members`, body
  `{ ownerUserId, memberUserId, householdRole, locations: [{ locationId, role }] }`. It adds
  the member to the owner's household and gives the listed location roles. It refuses a location role for someone who is not a household member (decision H18). Mount it inside
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

## Task 3.14 — The second migration: drop the old scope

**Files:** `schema.prisma`; migration `<YYYYMMDD>000000_drop_user_scope`;
`verify-migration.ts`; `schema/location.graphql`, `schema/import.graphql`; the six
`userId: String!` fields (`item.graphql:18`, `tag.graphql:5` and `:12`, `vendor.graphql:4`,
`recipe.graphql:59`, `shelf.graphql:20`); `test/stockFake.ts`; every resolver and test that
still writes `userId` on the seven models.

- [ ] **Step 1:** Schema: `householdId` becomes required on the seven models. Drop `userId`
  from them, and its indexes. Drop `Location.isDefault`. Keep `order`. In SQL: a
  `DO $$ RAISE EXCEPTION` guard on null `householdId` first, then `SET NOT NULL`, then the
  drops, then `DROP INDEX IF EXISTS "Location_one_default_per_user_key"`.

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
- [ ] **Step 2:** Run `pnpm build`. **`tsc` now lists every leftover `userId` use on these
  models.** Fix each one. This is the sweep that proves nothing still scopes by account.
  List the count in the report.
- [ ] **Step 3:** Remove `isDefault` from the `Location` GraphQL type and its comments in
  `import.graphql`. Remove the six `userId: String!` fields (#359 step two; decision H11).
- [ ] **Step 3b:** Drop `requiredColumns: ['userId']` from the catalog `ownedRowFake` stores
  (added in task 3.7). The column no longer exists, so a fake that still requires it would
  refuse every correct create.
- [ ] **Step 4:** `stockFake.ts`: remove `DefaultLocationConstraintError` and every
  `isDefault` match. Remove the places the design says argue from the old index: the
  migration comments in `20260916…/migration.sql` (about 30) and `20260917…/migration.sql`
  (about 49) stay as history, but add a line saying the index is gone as of this migration.
- [ ] **Step 5: `verify-migration.ts`.** Add the folder to `MIGRATIONS`. **Re-read every
  earlier assertion**: the PR 1 block asserts `isDefault` exists and that a second default
  fails with `P2002` (about 373-438). The script asserts the **final** state, so those break.
  Replace them with the new facts (no `isDefault` column; the index is gone), following the
  "present on one table, absent on the other" rule in `apps/server/prisma/CLAUDE.md`.
- [ ] **Step 6:** Full gate. Commit:
  `feat(server): drop the account scope from locations and the catalog (#359, #360)`.
- [ ] **Step 7 (main session):** with the owner's consent, migrate the test database again,
  as in task 3.3 step 6.

  **From the review of task 3.5:** if the race proof was not re-run since commit `3ba61aeb`
  (see task 3.3 step 6), this run is where it happens. Report its result. When step 5 edits
  `verify-migration.ts`, keep the race proof's claim the same call as `ensureHousehold`'s
  (`tx.user.updateMany` with `where: { id, householdSetupAt: null }`).

**Found by the review of task 3.7. OPEN QUESTION for the owner: what to do with
cross-household rows that already exist.** Do not build either option before the owner
decides. Task 3.16's rehearsal measures how many there are.

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

- [ ] **Step 1:** `ensureCloudDefaultLocation` becomes `ensureCloudHomeLocation`. It calls
  `locations` (which runs first sign-in) and returns the first location. Fixtures keep a
  `HOME` key, mapped onto that location for cloud. Local seeds keep `isDefault` and
  "My Home".
- [ ] **Step 2:** Cloud expectations of "My Home" become "Home". `settings/locations.spec.ts`'s
  "Default location is undeletable" becomes two tests: local (unchanged) and cloud (the last
  location cannot be deleted; a second one can).
- [ ] **Step 3:** `item-stock-pager.spec.ts` relies on the default being at `order` 0. The
  first sign-in location is created with `order` 0, so check that this still holds.
- [ ] **Step 4:** `import-strategies.spec.ts` and `data-mode-migration.spec.ts`: keep the
  `clear` → "Home is re-created" expectation, and keep the colliding item **and** the new item
  in `import-strategies.spec.ts` (#330 guard, design *Known gaps*). H4 rewrites them again
  for its dialog.
- [ ] **Step 5:** Run the cloud project alone, then local alone. **Copy `test-results/` aside
  before any re-run** (root `CLAUDE.md`).
- [ ] **Step 6:** Commit: `test(e2e): cloud has no default location any more`.

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
       deletion of the type's household. If any exist, decide with the owner before the deploy.
       Also count other households' ids inside `Shelf.itemIds` and `Shelf.filterConfig`,
       which step 8b does not count. These counts answer the **open question under task
       3.14** (found by the review of task 3.7): since task 3.7 such rows make the web's
       full-set edits fail with `FORBIDDEN`
     - every `User` row the migration created with the placeholder name `'User'`. Those
       people get "User's Household" until Clerk sends `user.updated` or they rename it, and
       their `deletedAt` stays null even if the Clerk account is gone
  4. Merge, watch the Railway release log, wait for Cloudflare, hard reload.
  5. The stale-bundle window: any open tab gets failed queries until it reloads.
  6. A manual smoke test in production: the pantry looks the same; the 🏠 label shows the
     name; rename it; create, rename and delete a location; the last location cannot be
     deleted; a checkout still works.
  7. What to do if the release command fails (`migrate resolve --rolled-back`).
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
- **A manager's reorder in H5 may leave some locations with old orders.** `reorderLocations`
  writes only the ids it is sent, and the web sends only the locations the caller sees. If
  H5 lets a manager see only some of the household's locations, the others keep their old
  `order`, and the list can end up with duplicate orders. Unless H5 lets managers see every
  location, H5 must handle this.
