# Households H7 (household switch, create, personal location order) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a person in two households can switch between them, and can make a new one from
**Switch to… › Create new**. A tab that still shows a household the person no longer acts
in can no longer write into the other household (owner decision O21). A person can copy their
offline data into any household where they may import, or into a new one (owner decision
O22-A). Each person has their own location order and picks one of four sorts: name, last
updated, last visited, custom.

**Architecture:** two PRs. **H7a** needs no migration: `User.activeHouseholdId` exists since
H5b. The web sends the household it shows in a new header, `x-household-id`, and
`requireHousehold` refuses a request whose header names another household (a new error code,
`HOUSEHOLD_CHANGED`). One new query (`myHouseholds`), one new mutation (`setActiveHousehold`)
and one new optional argument (`createHousehold(alsoWhenMember:)`). The web's switch reuses
H5b's `switchToHousehold` (`apps/web/src/apollo/householdGuard.ts`), which already clears the
in-memory Apollo cache, the saved copy in `Player1InventoryCloudCache` and the active
location id in one step. **H7b** has one additive migration: a `LocationPreference` table, a
nullable `User.locationSort` column and a nullable `Location.dataUpdatedAt` column.
`publishChange` sets `dataUpdatedAt` after every location-level change. `reorderLocations`
writes the caller's own order. The web sorts in one pure function.

**Tech Stack:** React 19, TanStack Router and Query, Apollo 4, Dexie (web); Express 5, Apollo
Server 4, Prisma 6, Postgres on Neon (server); Vitest, Playwright, Biome.

**Spec:** [2026-10-04-households-design.md](2026-10-04-households-design.md), sections
*Data model* (`LocationPreference`, `UserPreference`, `Location` changes), *Writers of
`dataUpdatedAt`*, *Migration of existing data* (the `order` row), *Create and delete a
household*, *Screens* (*Desktop* item 9, *Mobile*, *Location pages*, *Location switcher*,
*Local mode*), *Copying between local and cloud*, *Known gaps and risks* (the household
switch and the old cart). Phase plan:
[2026-10-31-households-plan.md](2026-10-31-households-plan.md), *H7*. Earlier plans this one
continues: [H3a](2026-11-04-households-plan-h3a.md) (decisions H5, H6),
[H4](2026-11-16-households-plan-h4.md) (decision T4, *Out of scope*: the household switch),
[H5](2026-11-17-households-plan-h5.md) (D1, O2, O9), [H5b](2026-11-18-households-plan-h5b.md)
(decisions T14, T16, T22, T23, T31, owner decisions O16, O21, O22, *Known gaps*),
[H5c](2026-11-19-households-plan-h5c.md) (*Known gaps*), [H6](2026-11-20-households-plan-h6.md)
(*Known gaps*).

Plan written on branch `feature/households-h7`, worktree `.worktrees/feature-households`, from
`develop` at `9701ddff` (after #393, which merged H6b). Each PR goes into `develop`. Nothing
deploys until the checkpoint release that ships H3a–H7 together.

**Names in this file.** H7 is split in two PRs if the owner agrees (owner decision **O49**):
**H7a** tasks are `L.n`, **H7b** tasks are `M.n`. (H6a used `J.n`, H6b `K.n`. The letter `I`
was skipped.) Technical decisions continue from H6: `T66…`. Owner decisions continue from
H6b: `O49…`. Disagreements with the code are `Z1…` (H6 used `Y…`). Outside this file, write
"H7 decision T66".

---

## Global Constraints

Every task brief passes these down (see also *Rules every task brief must pass down*).

- Local mode has no households, no roles and no household switch. Nothing in
  `apps/web/src/db/` changes in H7a or H7b. Local mode gets two of the sorts, **Name** and
  **Custom** (owner decision **O54-B**). The choice is saved on the device in `localStorage`,
  not in Dexie, so no Dexie version is added.
- Never write `row.userId === ctx.userId` or `row.householdId === …` as an authorization
  check. Every server check goes through `apps/server/src/lib/authz.ts`. **The new header
  check (T67) is not an authorization check.** It compares two household ids the SAME person
  belongs to. It lives in `requireHousehold`, not at call sites.
- **One lock order (H5b decision T16):** the `User` row (`lockUser`) before any household
  row. `setActiveHousehold` takes `lockUser` only.
- **A location role counts only while the person is a member of the location's household
  (decision H18).** Every new read of `LocationMember` uses the builders in `lib/authz.ts`.
- Every new `Mutation` field goes into `publishes` or `publishesNothing` in
  `apps/server/src/resolvers/live-publish.guard.test.ts`. Today: **78** in `publishes` and
  **3** in `publishesNothing` (measured 2026-11-20 after H6b). Count them again before you
  add any:

  ```bash
  awk '/^const publishes: /,/^}/' apps/server/src/resolvers/live-publish.guard.test.ts | grep -cE '^  [a-zA-Z]+: \{'
  awk '/^const publishesNothing: /,/^}/' apps/server/src/resolvers/live-publish.guard.test.ts | grep -cE '^  [a-zA-Z]+:'
  ```

- **Do not break the old-bundle shim.** `apps/server/src/test/oldBundleCompat.test.ts` must
  stay green. H7 only ADDS types, fields, queries, mutations and optional arguments. Do not
  change or remove an existing field, argument or input field. `Location.order: Int!` stays;
  only the number it returns changes (T77).
- **The server deploys before the web**, as for the whole households release (H4 runbook,
  section 8.3). Each task says what `main`'s old web bundle sees.
- A server schema change and the web documents that use it: this plan adds fields only, so a
  new web document may come in a later task than its schema. A task that changes an existing
  type goes in ONE commit with every document that uses it (root `CLAUDE.md`, *`pnpm codegen`
  is all-or-nothing*).
- **A new model must join `/e2e/cleanup`** (`lib/e2eCleanup.ts`, `CLEANUP_MODEL_KEYS`,
  `e2e/helpers/cloudTeardown.ts`), `purge-coverage.test.ts` and
  `e2e/tests/cleanup-endpoint.spec.ts`. **A new model that belongs to a household or a
  location must be considered for `emptyHouseholdWhere`** (`lib/invite.ts`). `LocationPreference`
  is NOT added there (decision T75); the comment above that function says so.
- **A new migration must join a group** in `apps/server/scripts/migrationDeploys.ts` and get
  assertions in `apps/server/scripts/verify-migration.ts` (`apps/server/prisma/CLAUDE.md`).
  **No subagent runs a database command.** The main session runs `verify:migration` against
  the TEST database only, with the owner's consent.
- Node 22.17.1 (`.node-version`). Node 25 breaks the web suite.
- Feature test titles start with `user can …` / `user sees …`. Role tests that really set up a
  role use the role name.
- Household, location and person names render as stored, never `capitalize`.
- `tw` texts use the app's existing words: 家庭, 據點, 擁有者, 管理者, 成員, 據點王, 搬運工,
  圍觀的. Use 「對方」 for "they".
- Plain English in every comment, doc, commit and report.

## Review Focus

The cases most likely to hurt a real person first. Each has its test in the task named.

1. **A write lands in a household the tab does not show** (O21). A person in A and B, a tab
   showing A, the server acting in B. A catalog write from that tab must be refused, and
   nothing may be written in B. (L.1 unit tests, L.6 real SQL.)
2. **The old household's rows stay on screen or in the saved cache after a switch.** A cart
   in household A, then a switch to B: no A cart row is shown, and none is left in
   `Player1InventoryCloudCache`. (L.3, L.6.)
3. **Two "Create a household" clicks make two households.** The no-household screen must keep
   its old rule; only **Create new** in **Switch to…** may create while the person is in a
   household. (L.2.)
4. **A copy of offline data lands in the wrong household** (O22-A). The household named in
   the dialog is the one written to, also after the page reloads in the middle. (L.5, L.6.)
5. **One person's reorder changes another person's order.** (M.3, M.5.)
6. **"Last updated" misses a writer.** A stock change, a cart change, a log and an import
   each move the location to the top. (M.2, M.5.)

---

## Summary

### Where this sits

| Phase | State |
|---|---|
| H1, H2 | ✅ merged into `main`, deployed |
| H3a, H3b, H3c-1, H3c-2, H4 | ✅ merged into `develop`, not deployed |
| H5a, H5b, H5c | ✅ merged into `develop`, not deployed |
| H6a, H6b | ✅ merged into `develop` (#392, #393), not deployed |
| **H7** | this plan: H7a (household switch, create, the stale-tab fix, the copy choice) and H7b (personal location order and the four sorts) |

H7 is the last phase in the design's *Sequencing* table. After it, the households release
can be cut from `develop`.

Since H5b a person can be in two households, but cannot choose between them. They act in
the household they joined last, and their own household is out of reach from the screen
(H5b O2-A). A tab that still shows a household they left writes into the other one with
nothing shown (O21). A copy of offline data can only go into the household they act in now
(O22-A). And the location order is shared by the whole household, so one person's drag
changes everyone's list.

### Relations

- **Blocked by:** nothing. H6b is merged (#393).
- **Blocks:** the checkpoint release that ships households.
- **H7a and H7b do not depend on each other.** The order is owner decision **O49**. The plan
  recommends H7a first, because it closes a data bug (O21) and H7b does not.
- **Deploy order:** server before web, the rule for the whole households release. H7a has no
  migration and no new env value. H7b has one additive migration that deploys with the
  server.

### What the user gets (once merged AND deployed)

**H7a:**

- **Switch to…** in the household sidebar and in the mobile settings accordion (cloud only).
  It lists every household the person is in, marks the current one, and offers **Create
  new**. Choosing a household moves the app there: the pantry, carts and settings show the
  new household, and nothing of the old one stays on screen.
- **Create new** asks for a name and makes a household with its first location, "Home". The
  person is its owner and moves into it.
- **A stale tab cannot write into the wrong household.** When the person switches on another
  tab or device, or leaves a household, an open tab that still shows the old household does
  not save into the other one. It reloads into the household the person is in now and says
  why (the text is owner decision **O51**).
- **Copy offline data into a household you choose.** "Copy your offline data into…" lists
  the households where the person may import (owner or manager; owner for **Clear &
  import**), and **A new household**.

**H7b:**

- **Settings › Locations: Sort by** name, last updated, last visited or custom. The choice is
  personal and follows the person to every device.
- **Custom order is personal.** Anyone with a location role may drag. Their order does not
  change anyone else's list. Drag handles show only with **Custom**.
- The location switcher shows the person's own order (and the chosen sort, if the owner
  chooses O53-A).

### What the developer gets

| DX gain | Specifics |
|---|---|
| Fewer ways to get it wrong | The household check is in ONE place, `requireHousehold`. Every catalog read and write, every import mutation and `clearAllData` get it with no change at their call sites. Measured 2026-11-21: 38 `requireHousehold(ctx` and 64 `requireCatalogRole(ctx` lines in non-test server files (`git grep -c 'requireHousehold(ctx' -- apps/server/src ':!*.test.ts'`), none of which moves |
| Fewer ways to get it wrong | No household argument on `importCheck`, `clearAllData` or the 22 bulk import mutations (decision T71). The import writes into the household the person acts in, and the header check stops it when that changes in the middle |
| A failure that now has a name | A stale tab's write fails with `HOUSEHOLD_CHANGED` instead of landing in another household with no error |
| Less to remember | "Until H7, the target household is `requireHousehold(ctx)`" (root `CLAUDE.md`, H4 sections; `authz.ts:527`; `import.resolver.ts:898`) becomes a rule that stays: the target is the household the person acts in |
| Fewer ways to get it wrong | "Last updated" is set by `publishChange`, which every writer already calls because the live guard forces it. A new writer cannot forget it (decision T79) |
| Real-SQL coverage | The first E2E of a person in two households who switches, of the stale-tab refusal, and of two people with different location orders |

**Costs, stated plainly:**

- One more header on every web request, and one more comparison in `requireHousehold`. No
  extra query: the comparison uses the id `requireHousehold` already worked out.
- One extra `UPDATE "Location"` after every location-level write (T79), outside the
  transaction. A write that changes stock now costs two statements after its commit instead
  of one event.
- One more table in `verify-migration.ts`, run by hand with the owner's consent.
- `/e2e/cleanup` grows from 21 to 22 models.
- `Location.order` now returns a per-person number, which needs one more read per request
  (cached like the role maps).

---

## Facts this plan is built on (checked 2026-11-21 at `5cc4e741`)

Line numbers drift. Each task re-reads the code before it trusts a line here.

| Fact | Where |
|---|---|
| `User.activeHouseholdId String?`, `onDelete: SetNull`, with an index. Joining and creating set it | `apps/server/prisma/schema.prisma:338–366` |
| `Location` has `order Int`, `updatedAt`, an index `(householdId, order)`. No `dataUpdatedAt` | `schema.prisma:263–281` |
| No `LocationPreference`, `UserPreference`, `customOrder`, `dataUpdatedAt` or `locationSort` anywhere in `apps`, `packages` or `e2e` (`git grep` finds nothing) | — |
| `requireHousehold(ctx)` returns the household id, kept per request on `ctx.requestCache.householdId`. It calls `ensureHousehold` (`lib/household.ts:199`), which picks `activeHouseholdId` while the person is still a member there, else the oldest membership (`household.ts:104–131`) | `apps/server/src/lib/authz.ts:48–56` |
| `requireCatalogRole(ctx, role)` = `requireHousehold` + `requireHouseholdRole`; every catalog resolver and every import mutation starts with it | `authz.ts:424–428` |
| Non-test callers: `requireHousehold(ctx` 38 lines (location 12, household 7, `authz.ts` 4, invite 3, cart 3, ownership 2, itemStock 2, import 2, recipe 1, inventoryLog 1, activity 1); `requireCatalogRole(ctx` 64 lines (import 25, tag 10, item 8, shelf 8, recipe 6, vendor 4, and the rest) | `git grep -c` on `apps/server/src` |
| The `household` query calls `requireHousehold` and answers the household the person acts in. `HouseholdChangeGuard` compares its id with `localStorage['last-household-id']` | `resolvers/household.resolver.ts:113–124`; `apps/web/src/apollo/HouseholdChangeGuard.tsx` |
| The GraphQL context reads `x-app-language` and `x-client-id`. No household header | `apps/server/src/lib/graphqlContext.ts:74–75`; `src/context.ts:23–87` |
| The web adds `x-app-language` and `x-client-id` in two `SetContextLink`s | `apps/web/src/apollo/client.ts:87–103` |
| `switchToHousehold(id, { to? })`: `clearCache()` (memory and `Player1InventoryCloudCache`), removes `active-location-id:cloud`, stores the new id, reloads. Its comment already names "H7's switch". `forgetHousehold()` is the no-household twin | `apps/web/src/apollo/householdGuard.ts:20–73` |
| `createHousehold(name: String): Household!` is only for a person in NO household: `lockUser`, the first sign-in claim, a membership count (`ALREADY_IN_HOUSEHOLD` when > 0), `createHouseholdFor`, then `activeHouseholdId`. It publishes household-level `LOCATION` | `resolvers/household.resolver.ts:434–498`; `schema/household.graphql:171–175`; `lib/household.ts:280–288` |
| The web's no-household screen treats `ALREADY_IN_HOUSEHOLD` as "another tab created or joined first" | `apps/web/src/hooks/useHousehold.ts:112–134` |
| No query lists the households a person is in. `myOwnershipOffers` is the only query across households | `apps/server/src/schema/*.graphql` (the `Query` fields) |
| `importCheck(ids, forClear)` and the 22 bulk import mutations start with `requireCatalogRole`; `clearAllData` calls `requireHousehold`, then locks and checks `owner` | `resolvers/importCheck.resolver.ts`; `resolvers/import.resolver.ts:2312–2352` |
| `visibleLocations` and `householdLocations` sort by `[order asc, id asc]`. `firstLocationIdOf` (the old-bundle `isDefault` shim) uses the same order | `resolvers/location.resolver.ts:58–66`, `:96–115`, `:282` |
| `reorderLocations(orderedIds)` needs household `manager`, refuses a repeated id and anything but the household's full set, writes `Location.order`, returns `[Location!]!` | `resolvers/location.resolver.ts:557–600`; `schema/location.graphql:114` |
| The web's `LocationSwitcher` sorts by `a.order - b.order`. `LocationList` sends `arrayMove(...)` ids to `onReorder`. `ActiveLocationProvider` falls back to the FIRST location of the server's list | `components/shared/LocationSwitcher/LocationSwitcher.tsx:80`; `components/location/LocationList/LocationList.tsx:255–256`; `hooks/useActiveLocation.tsx:228–231` |
| Local mode orders locations by Dexie `order` and has its own `reorderLocations` | `apps/web/src/db/operations.ts:1211–1270` |
| `publishChange(ctx, kinds, locations)` already imports `prisma` and reads `Location` rows for missing household ids. It runs after the commit and never throws | `apps/server/src/lib/publishChange.ts:1–110` |
| `writeStock` is used by `cart.resolver.ts` (`checkout`), `itemStock.resolver.ts` and `recipe.resolver.ts` (`consumeRecipes`) | `git grep -ln 'writeStock('` |
| `/e2e/cleanup` deletes **21** models | `lib/e2eCleanup.ts` |
| The newest migration is `20261120100000_add_ownership_offers`, in the last group of `migrationDeploys.ts` | `apps/server/scripts/migrationDeploys.ts:69` |
| `HouseholdSidebar` says "Switch to" (H7) is added by the phase that builds it | `apps/web/src/components/global/Sidebar/HouseholdSidebar.tsx:23` |
| E2E can put one person in a second household (`POST /e2e/household-members`) and run a browser per person (`newUserContext`) | `apps/server/src/index.ts:70`; `e2e/helpers/userContext.ts` |
| The H4 runbook ends at section 12 (H6b) | `docs/global/backend/2026-11-17-deploy-runbook-households-h4.md:783–964` |

## Where the design, the outline or the brief disagree with the code

| # | The design, outline or brief says | The code today | What this plan does |
|---|---|---|---|
| Z1 | Outline, *H7* (O22-A): the copy "needs **Switch to…** and a household input on `importCheck`, `clearAllData` and the 22 bulk import mutations" | Every one of those 24 fields already writes into `requireHousehold(ctx)`, the household the person acts in. With a switch, "copy into B" is "switch to B, then copy" | Decision **T71**: no new argument on any of them. The copy dialog switches first. The header check (T67) stops an import if the household changes in the middle |
| Z2 | Design, *Data model*: a `UserPreference` table with `userId` and `locationSort`. *Known gaps*: "May be merged into `User`. Left for the plan" | `User` already holds per-person settings (`activeHouseholdId`) | Decision **T74**: a nullable `User.locationSort` column, no table |
| Z3 | Design, *Migration of existing data*, and the outline: "copying the shared `Location.order` into each person's `customOrder`" | Nothing reads a personal order yet | Decision **T76**: no copy. A person with no `customOrder` for a location gets the shared `Location.order`. The first personal reorder writes a row for every location in the list. The result on screen is the same as a copy, and the migration has no data step for it |
| Z4 | Design, *Writers of `dataUpdatedAt`*: five rows, by file | Since H3b, H6a and H6b there are more writers: `removeAllLocationItems`, `deleteItem`'s cascades, `addInventoryLog`, the log and cart imports. Every one of them already calls `publishChange` with `STOCK`, `CART` or `LOG`, because the live guard forces it | Decision **T79**: `publishChange` sets `dataUpdatedAt`. The design's "a test must list the writers" is the live guard, which already lists every mutation |
| Z5 | Design, *Location pages*: "Until H7 … drag-to-reorder needs the household role `manager`" | `reorderLocations` asks `manager` and writes the shared order | Decision **T78**: it writes the caller's own order and asks only that the person sees every location in the list |
| Z6 | Outline: "the server refuses a **write** whose id does not match" | A stale tab's READS go wrong too: `items`, `tags` and the other catalog reads call `requireHousehold`, so a tab showing A's locations would show B's catalog | Decision **T67**: every `requireHousehold` call is checked, reads too, except the `household` query and `myHouseholds`, which must tell the web the truth |
| Z7 | Brief: "clear the household-scoped Apollo cache" | `clearCache()` clears the WHOLE cloud cache, memory and saved copy. Every cloud entry is household-scoped (or the location list, which is too) | Keep the whole clear. A partial clear would need a list of entries to keep, and a missed entry would show old rows |
| Z8 | Brief: the switch "must set the active location" | `switchToHousehold` REMOVES the stored id, and after the reload `ActiveLocationProvider` picks the first location of the new household (or none) | Keep it. Removing the id is the one step; the provider's fallback picks the location. L.6 checks that the stored id names a location of the new household after the switch |
| Z9 | H5b O16-A: `createHousehold` only for a person in NO household; "H7 lifts that limit" | The web's no-household screen relies on `ALREADY_IN_HOUSEHOLD` when a second tab creates or joins first | Decision **T70**: the limit stays the default. **Create new** passes a new optional argument, `alsoWhenMember: true`. Without it, two clicks on the no-household screen would make two households |
| Z10 | H4 plan, decision T4 and `authz.ts:527`: "H7's household switch will fill it in" (the target household argument of `requireOwnRowOrUnclaimed`) | The import helpers pass the id `requireCatalogRole` returns | Nothing to fill in: with T71 the target IS the household the person acts in. The comment is rewritten in L.1 |

## Gaps folded in from earlier plans

Every mention of H7 in the earlier plans, checked with
`grep -n '\bH7\b'` on each file, and every code comment that names H7
(`git grep -n 'H7' -- apps e2e`):

| Gap | From | Goes to |
|---|---|---|
| `LocationPreference`, `UserPreference`, `dataUpdatedAt` moved to H7 | H3a plan, decision H6; design *Data model* | **M.1** (T74, T75), **M.2** (T79) |
| Keep `Location.order` and drag-to-reorder until H7, then make the order personal | H3a plan, decision H5 | **M.3** (T76–T78) |
| The household switch: "Until then the target is `requireHousehold(ctx)`" | H4 plan, *Out of scope* and decision T4; `authz.ts:527`; `import.resolver.ts:898` | **L.1** (T71; comments rewritten) |
| "A test cannot yet tell the target household from the caller's household: until H7's household switch both are `requireHousehold(ctx)`" | root `CLAUDE.md`, *The import role gate* | **L.7** rewrites the sentence: they are the same by design (T71) |
| D1 / O2-A: the person's own household "comes back with H7's Switch to…" | H5 plan; H5b plan line 139 | **L.4** |
| O9-A: H7 still adds **Switch to… › Create new** | H5 plan | **L.2**, **L.4** |
| O16-A: `createHousehold` only for a person in no household until H7 | H5b plan, decision E7, *Known gaps*; `lib/household.ts:281` | **L.2** (T70) |
| T23: "H7's switch needs the same step" (clear the cache, the active location, reload) | H5b plan; `householdGuard.ts:23` | **L.3** reuses `switchToHousehold` |
| **O21:** a stale tab writes into the other household | H5b *Known gaps*; H5c *Known gaps*; H6 *Known gaps*; outline | **L.1**, **L.3**, **L.6** |
| **O22-A:** the copy only into the household the person acts in now | H5b T31, *Known gaps*; outline | **L.5**, **L.6** |
| "A person in two households cannot switch until H7" | H5b *Known gaps* | **L.2**–**L.4** |
| "The other household's locations wait for H7's switch" | H5c *Known gaps* | **L.4** |
| Household switch shows the previous household's cart; a test must switch with a cart in the old one and see no old rows | design *Known gaps*; outline | **L.6** test 1 |
| G.9 note: `HouseholdPerson` has no `id`; after H7's switch two households' lists would share entries if `keyFields: ['userId']` were added | H5b plan, G.9 notes | Not needed: the switch clears the whole cache (Z7), and nobody added `keyFields`. **L.7** records this in `hooks/CLAUDE.md` |
| `reorderLocations` comment "until H7 brings each person their own" | `location.resolver.ts:558` | **M.3** |
| "Switch to" added by the phase that builds it | `HouseholdSidebar.tsx:23` | **L.4** |

Not folded in, on purpose:

- **Deleting a household.** The outline's H7 row in the design named only switch and create.
  H6a built it (H6 owner decision O38-A).
- The old-bundle shim removal (the release after households).
- A per-tab household (two tabs in two households). See owner decision **O50**.
- E-mail, inactivity hand-over, claims (design, *Postponed*).

---

## Decisions

### Technical decisions (made in this plan)

| # | Decision | Why | Rejected |
|---|---|---|---|
| T66 | **The shown household travels in a header, `x-household-id`.** The web sends `localStorage['last-household-id']` (`getLastHouseholdId()`) on every HTTP request, through a new `SetContextLink` in `apollo/client.ts`, beside `x-client-id`. No stored id: no header. The server reads it in `graphqlContext.ts` into `ctx.shownHouseholdId` with `householdIdFrom(value)` in `src/context.ts`: a string of 1 to 64 characters, else `undefined`. The WebSocket sends nothing new: `shouldDeliver` checks membership per event | Every request needs it, and a header reaches every operation with no change to 24 import fields or 60 catalog fields. `makeGql` in E2E and the old bundle send no header, so they keep today's behaviour | A GraphQL argument on each field (dozens of schema changes); a cookie (shared by all tabs, and a second device does not have it) |
| T67 | **`requireHousehold` compares.** After it has worked out the household id, if `ctx.shownHouseholdId` is set and differs, it throws `GraphQLError('The household on this screen is not the one you are in now.', { extensions: { code: 'HOUSEHOLD_CHANGED' } })`. No household id goes into the error. The `household` query and `myHouseholds` call `requireHousehold(ctx, { ignoreShown: true })`, because the web needs the true answer to recover. The compare is in ONE function; no call site changes | Reads and writes both go wrong in a stale tab (Z6). A new code, not `FORBIDDEN`: the web must tell "your household changed" apart from "your role is too low" | Checking writes only (a stale tab would show B's catalog beside A's locations); checking in the `Mutation` wrapper `forgetRolesAroundEach` (it cannot see reads, and `joinHousehold` and `createHousehold` must not call `requireHousehold`, H5b T22) |
| T68 | **The active household is per person** (owner decision **O50-A**). `setActiveHousehold(householdId: ID!): Household!` takes `lockUser`, reads the membership through `tx` (`FORBIDDEN` when the person is not a member, the same answer as an unknown id), writes `User.activeHouseholdId`, and returns the household with the caller's role. It does not call `requireHousehold`. It is not logged (T51 of H6 lists no such action). It is in `publishesNothing`: the person's other tabs learn on their next request through T67 or `HouseholdChangeGuard` | One column already exists, and every device of the person ends in the same place, so the saved cache never holds two households | A per-device household (owner decision O50-B); publishing household-level `LOCATION` to B (every member of B would refetch every query for one person's choice) |
| T69 | **`myHouseholds: [HouseholdChoice!]!`**, any signed-in person, also one in no household (an empty list). `type HouseholdChoice { id: ID! name: String! role: HouseholdRole! isActive: Boolean! }`. `isActive` marks the household `requireHousehold` would pick. Ordered by `joinedAt`, then `householdId` (the same order as the fallback in `ensureHousehold`). A deleted household is not in it | The dropdown needs every household with the person's role, and the copy dialog needs the role to say where a copy is allowed. A separate type, not `Household`, because `Household` is normalised by `id` in the Apollo cache and its `role` field would be shared with the active household's | Reusing `Household` (two cache entries would fight over `role`'s meaning) |
| T70 | **`createHousehold(name: String, alsoWhenMember: Boolean = false)`.** Without the argument, nothing changes: `ALREADY_IN_HOUSEHOLD` for a person with a membership. With `true` the membership count is skipped. Everything else is the same transaction: `lockUser`, the first sign-in claim, `createHouseholdFor`, `activeHouseholdId` | An optional argument with a default is additive (`oldBundleCompat` sees nothing). The no-household screen keeps its guard against two tabs (Z9) | Removing the limit for everyone (two clicks, two households); a second mutation (two copies of the same transaction) |
| T71 | **The import target is the household the person acts in.** `importCheck`, `clearAllData`, `recordImport` and the 22 bulk import mutations get no new argument. Copying into another household is: `setActiveHousehold`, `switchToHousehold`, then the copy. The header check (T67) refuses every batch after a switch in another tab, so an import cannot finish in a household it did not start in | Z1. The checks of H4 (target household in every helper) stay exactly as they are | A `householdId` argument on 24 fields (a schema change per field, and a second way to name the target that the header would then have to agree with) |
| T72 | **The web's answer to `HOUSEHOLD_CHANGED`**: one function, `recoverFromHouseholdChange()` in `apollo/householdGuard.ts`. An `ErrorLink` in `apollo/client.ts` calls it once per page load (a module flag) on the first error with that code. It fetches `GetHousehold` with `fetchPolicy: 'network-only'` and calls `switchToHousehold(newId)`; with `NO_HOUSEHOLD` it calls `forgetHousehold()` and reloads. Before the reload it stores `localStorage['household-changed-notice'] = '1'`; after the reload the root shows the O51 message once and removes the key. The failed write is NOT retried | A write the person made for household A must not be sent again into B. One place to change the text and the rule | Retrying the write in the new household (it would land where the person did not mean); showing the error in each form (dozens of forms) |
| T73 | **The copy choice** (O22-A, task L.5). The `'confirming'` state of `usePostLoginMigration` lists `myHouseholds` where `canCopyInto(role, strategy)` is true, plus **A new household**. Choosing the active household copies at once, as today. Choosing another one (or a new one, through `createHousehold(alsoWhenMember: true)`) calls `setActiveHousehold`, stores `localStorage['copy-into-household'] = <id>`, and calls `switchToHousehold(id)`. After the reload, a stored strategy with `copy-into-household` equal to the household now shown runs the copy without asking again, then removes the key. A key naming another household is removed and the question shows again | The copy must run after the reload, because the reload is what clears the old household's cache. The key ties the stored copy to the household the person chose, so a later switch cannot carry it somewhere else | Copying before the reload (the old household's rows would still be in the cache that `importData.ts` reads to find conflicts) |
| T74 | **`User.locationSort LocationSort?`**, a new Prisma enum `LocationSort` = `name`, `lastUpdated`, `lastVisited`, `custom`. Nullable: `null` means the default (owner decision **O52**). Read with `myLocationSort: LocationSort!` (the default filled in) and written with `setLocationSort(sort: LocationSort!): LocationSort!` (`publishesNothing`) | One value per person needs no table (Z2). A nullable column is the simplest additive shape (`apps/server/prisma/CLAUDE.md`, *Adding a NULLABLE column*) and lets the default change later without a data step | A `UserPreference` table; a `NOT NULL DEFAULT` column (fixes the default in the migration) |
| T75 | **Model `LocationPreference`**: `userId` (relation to `User`, `onDelete: Cascade`), `locationId` (relation to `Location`, `onDelete: Cascade`), `customOrder Int?`, `lastVisitedAt DateTime?`, `updatedAt @updatedAt`. Primary key `(userId, locationId)`, `@@index([locationId])`. NOT in `emptyHouseholdWhere`: a preference is not data a person loses, and it goes with its location by cascade | The design's fields. Cascade on both sides: a deleted location or a `/e2e/cleanup` user delete takes the rows with it | A row per household (the order is per location) |
| T76 | **No copy of `Location.order`** (Z3). The personal position of a location is `customOrder` when the caller has one, else after every location that has one, by the shared `Location.order`, then `id`. `Location.order` keeps its column and is still written by `createLocation` (max + 1) and by the import (the payload's value). Nothing else writes it after H7b | Same order on screen as a copy, with no data step and no row per person per location until someone reorders | A migration that inserts a row for each member × location (it must also run for every later join and every new location, or those would sort differently) |
| T77 | **`Location.order` returns the caller's personal position**, 0 to n−1, in the caller's custom order over the list being returned. `locations` and `householdLocations` return their rows in that order. The preferences are read once per request per household (`ctx.requestCache.locationPreferences`), cleared by `forgetLocationRoles` like the role maps | The old bundle's switcher sorts by `order` (`LocationSwitcher.tsx:80`), so it shows the person's own order with no change. `oldBundleCompat` sees no schema change | A new `myOrder` field (the old bundle would keep showing the shared order) |
| T78 | **`reorderLocations(orderedIds)` writes the caller's own order.** Any household role. The list must be exactly the caller's settings list: for an owner or manager every location of the household (`householdLocations`), for a member the locations they have a role on (`locations`). A repeated id stays `BAD_USER_INPUT`; another household's or an unknown id `FORBIDDEN`; a wrong set `BAD_USER_INPUT`, as today. It upserts one `LocationPreference` per id with `customOrder` = its index, in one transaction, and returns the list as `locations` would. It moves from `publishes` to `publishesNothing` | The order is personal (Z5). The same field keeps the old bundle's drag working: for the one person in production today it gives the same result as before. A household-level event would refetch every query of every member for a change only one person sees | A new mutation beside it (two writers of one order) |
| T79 | **`dataUpdatedAt` is set by `publishChange`.** For each location it publishes `STOCK`, `CART` or `LOG` to, one `prisma.location.updateMany({ where: { id: { in } }, data: { dataUpdatedAt: now } })`, after the commit, inside the function's existing "never throws" guard. Household-level events (`LOCATION`, `CATALOG`) do not set it. The migration fills it once with the newest `ItemStock.updatedAt` of the location, or leaves `NULL` | Every writer of a location's data already calls `publishChange` with one of those kinds, and `live-publish.guard.test.ts` makes every mutation say what it publishes (Z4). Outside the transaction on purpose: a lost timestamp only moves a sort, and the write must not hold a row lock on `Location` inside every stock transaction | A helper called from each writer (a list to keep by hand); a Postgres trigger (the Prisma fakes cannot run it, and an `AFTER DELETE` trigger on a cascade from a location delete would update the row being deleted) |
| T80 | **`markLocationVisited(locationId: ID!): Boolean!`**, location role `viewer`, in the caller's household. Upserts `LocationPreference.lastVisitedAt = now`, skipped (answer `false`) when the stored value is under 60 seconds old. `publishesNothing`. The web calls it when the active location changes (owner decision **O55**), in cloud mode only | A query must not write. 60 seconds stops a burst of tab switches from writing a row each time | Recording visits from `PantryData` reads (a read that writes) |
| T81 | **The web sorts in one pure function**, `sortLocations(locations, sort, language)` in `apps/web/src/lib/locationSort.ts`. `name`: `localeCompare` with the app language, `sensitivity: 'base'`. `lastUpdated` / `lastVisited`: newest first, `null` last. `custom`: by `order`. Ties: by name, then `id`. The settings list and (with O53-A) the switcher both call it | The person changes the sort and sees it at once, with no round trip. One function, one test file | Sorting on the server per mode (a refetch per change, and the switcher and the list could disagree) |
| T82 | **Two new `Location` fields**: `dataUpdatedAt: String` (ISO, shared) and `lastVisitedAt: String` (ISO, the caller's own). `GetLocations` and `GetHouseholdLocations` select both | The web needs them for T81. New nullable fields are additive | — |

### Owner decisions

Questions **O49–O55** are at the end of this file, under *Owner questions*. Each task names
the ones it needs. Until the owner answers, the plan uses the recommended option (A)
everywhere.

| Question | Answer |
|---|---|
| O49 | **A.** Two PRs, H7a (L.1–L.7) first, then H7b (M.1–M.6) (2026-11-21) |
| O50 | **A.** Per person (`User.activeHouseholdId`) (2026-11-21) |
| O51 | **A.** Reload into the current household, with the one-time message (2026-11-21) |
| O52 | **A.** Custom (2026-11-21) |
| O53 | **A.** The switcher uses the chosen sort (2026-11-21) |
| O54 | **B.** Name and Custom only in local mode, saved on the device (`localStorage`). See M.4 (2026-11-21) |
| O55 | **A.** When it becomes the active location, at most once a minute (2026-11-21) |

---

## What a deployed old web bundle sees

The server deploys before the web. `main`'s bundle knows nothing of households.

| Piece | Old bundle |
|---|---|
| `x-household-id` check (T67) | sends no header, so nothing is compared. **The O21 hole stays open for an old bundle** until it reloads (*Known gaps*) |
| `myHouseholds`, `setActiveHousehold`, `createHousehold(alsoWhenMember:)` | never selected or called |
| `Location.order` per person (T77) | its switcher shows the caller's own order. For the one production user today that is the same order as before |
| `reorderLocations` per person (T78) | its drag writes the caller's own order. It no longer needs `manager`, which only loosens. The answer is the same type |
| `dataUpdatedAt`, `lastVisitedAt`, `myLocationSort`, `setLocationSort`, `markLocationVisited` | never selected or called. Visits made with an old bundle are not recorded |
| `oldBundleCompat.test.ts` | must list exactly the same breaking and dangerous changes as after H6b. An optional argument with a default and new nullable fields are neither |

---

## File map

| File | Task | Change |
|---|---|---|
| `apps/server/src/context.ts`, `lib/graphqlContext.ts` (+ test) | L.1 | `householdIdFrom`, `ctx.shownHouseholdId` |
| `apps/server/src/lib/authz.ts` (+ `authz.test.ts`), `resolvers/household.resolver.ts` | L.1 | the compare in `requireHousehold`; `{ ignoreShown: true }` for `household`; the `authz.ts:527` comment |
| `apps/server/src/resolvers/import.resolver.ts` | L.1 | the comment at `:898` (no code change) |
| `apps/server/src/schema/household.graphql`, `resolvers/household.resolver.ts` (+ `household-switch.resolver.test.ts`, new), `lib/household.ts` | L.2 | `HouseholdChoice`, `myHouseholds`, `setActiveHousehold`, `createHousehold(alsoWhenMember:)`; the `household.ts:281` comment |
| `resolvers/live-publish.guard.test.ts` | L.2, M.2, M.3 | `setActiveHousehold`, `setLocationSort`, `markLocationVisited` in `publishesNothing`; `reorderLocations` moves there |
| `apps/web/src/apollo/client.ts` (+ test), `apollo/householdGuard.ts` (+ test) | L.3 | the header link, the `ErrorLink`, `recoverFromHouseholdChange` |
| `apps/web/src/apollo/operations/household.graphql`, `hooks/useMyHouseholds.ts` (new, + test), `hooks/useHousehold.ts` | L.3 | `MyHouseholds`, `SetActiveHousehold`, `CreateHousehold` with `alsoWhenMember` |
| `apps/web/src/routes/__root.tsx`, `components/global/HouseholdChangedNotice/` (new) | L.3 | the O51 message after the reload |
| `apps/web/src/components/household/HouseholdSwitcher/` (new: component, stories, smoke, tests), `components/household/CreateHouseholdDialog/` (new) | L.4 | **Switch to…** and **Create new** |
| `components/global/Sidebar/HouseholdSidebar.tsx`, `routes/settings/index.tsx` (+ tests, stories) | L.4 | the item, cloud only |
| `apps/web/src/hooks/usePostLoginMigration.ts` (+ test), `components/global/PostLoginMigrationDialog/` (+ tests, stories) | L.5 | the household choice (T73) |
| `apps/web/src/i18n/locales/en.json`, `tw.json` | L.3–L.5, M.4 | the texts |
| `e2e/tests/household-switch.spec.ts` (new), `e2e/pages/HouseholdSwitcher.ts` (new), `e2e/playwright.config.ts` | L.6 | the E2E |
| `apps/server/prisma/schema.prisma`, `prisma/migrations/<timestamp>_add_location_preferences/` (new) | M.1 | `LocationPreference`, `LocationSort`, `User.locationSort`, `Location.dataUpdatedAt` |
| `apps/server/scripts/migrationDeploys.ts`, `scripts/verify-migration.ts` | M.1 | the migration in the last group; assertions |
| `apps/server/src/test/locationPreferenceFake.ts` or the existing stock and household fakes (+ tests) | M.1 | a `locationPreference` store that applies every `where` key and throws on an unknown one |
| `apps/server/src/lib/e2eCleanup.ts` (+ test), `e2e/helpers/cloudTeardown.ts`, `resolvers/purge-coverage.test.ts`, `e2e/tests/cleanup-endpoint.spec.ts`, `lib/invite.ts` | M.1 | 22 models; the `emptyHouseholdWhere` comment |
| `apps/server/src/lib/publishChange.ts` (+ test) | M.2 | `dataUpdatedAt` (T79) |
| `apps/server/src/schema/location.graphql`, `resolvers/location.resolver.ts` (+ `location-order.resolver.test.ts`, new) | M.2, M.3 | `dataUpdatedAt`, `lastVisitedAt`, `markLocationVisited`, `myLocationSort`, `setLocationSort`, personal `order`, `reorderLocations` |
| `apps/web/src/lib/locationSort.ts` (new, + test) | M.4 | `sortLocations` |
| `apps/web/src/apollo/operations/locations.graphql`, `hooks/useLocations.ts`, `hooks/useLocationSort.ts` (new, + test), `hooks/usePermissions.ts`, `hooks/useActiveLocation.tsx` | M.4 | documents, hooks, `canReorderLocations`, the visit call |
| `apps/web/src/routes/settings/household/locations/index.tsx`, `components/location/LocationList/`, `components/shared/LocationSwitcher/` (+ tests, stories) | M.4 | **Sort by**, drag handles, the switcher order |
| `e2e/tests/location-sort.spec.ts` (new), `e2e/pages/LocationsPage.ts`, `e2e/playwright.config.ts` | M.5 | the E2E |
| docs (below) | L.7, M.6 | |

---

# Part 1 — H7a: household switch, create, the stale-tab fix, the copy choice

## Task L.1 — server: the shown household and `HOUSEHOLD_CHANGED` (O21)

**Files:** `apps/server/src/context.ts`, `lib/graphqlContext.ts` and
`graphqlContext.test.ts`, `lib/authz.ts` and `authz.test.ts`,
`resolvers/household.resolver.ts`, a new `resolvers/household-shown.resolver.test.ts`,
`resolvers/import.resolver.ts` (comment only).

- [x] **Step 0: measure the baseline.** Done 2026-11-21 at `7879369f`: web 3729 / 364, server 2689 / 85, `scripts/spec` 70; live guard 78 `publishes`, 3 `publishesNothing`.
- [x] **Step 1: write the failing tests.** Done: 18 in `graphqlContext.test.ts`, 9 in `authz.test.ts` (`requireHousehold with a shown household`), 19 in the new `resolvers/household-shown.resolver.test.ts` (header A, header B, no header, and the person who left A).
- [x] **Step 2:** red. Done: the refusal tests were red; the "works as today" tests were already green (they describe old behaviour; the mutations below prove them).
- [x] **Step 3:** done in `6df3d53d`.
- [x] **Step 4:** done in `4bc9abeb`. `householdChanged()` is exported from `lib/authz.ts`.
- [x] **Step 5:** done in `2c375e24` (comments only).
- [x] **Step 6:** full gate green. After: web 3729 / 364, server 2735 / 86 (+46), spec 70. Build: server bundle 255.0 KiB, no TS6385.

**Mutation checks** (copy each file aside first; restore from the copy, never with
`git checkout --`):

| Mutation | Must go red |
|---|---|
| the compare in `requireHousehold` deleted | every `HOUSEHOLD_CHANGED` test, the O21 left-household test first |
| the compare moved before the cached promise, comparing `undefined` | the "same id works" test |
| `household` without `{ ignoreShown: true }` | "the `household` query answers B" |
| `householdIdFrom` returns the raw value with no length check | the 65-character test |

**Done 2026-11-21.** Commits `6df3d53d`, `4bc9abeb`, `2c375e24`. Mutation checks, each restored from a copy:

| Mutation | Result |
|---|---|
| the compare deleted | red, 11 tests, the O21 left-household tests included |
| the compare before the cached lookup, comparing `undefined` | red, 8 tests, "same id works" included |
| `household` without `{ ignoreShown: true }` | red, 1 test ("answers B") |
| `householdIdFrom` with no length check | red, 3 tests (65 characters) |
| (extra) the checked promise cached instead of the lookup | red, 1 test ("keeps the household id in the cache") |

**E2E:** none in this task (L.6 test 3).

---

## Task L.2 — server: `myHouseholds`, `setActiveHousehold`, `createHousehold(alsoWhenMember:)`

**Files:** `apps/server/src/schema/household.graphql`, `resolvers/household.resolver.ts`, a
new `resolvers/household-switch.resolver.test.ts`, `lib/household.ts` (the comment at
`:281`), `resolvers/live-publish.guard.test.ts`, `src/test/oldBundleCompat.test.ts` (run,
expect no change).

- [x] **Step 1: write the failing tests.** Done: 25 tests in the new `resolvers/household-switch.resolver.test.ts` (Mia in hh_a owner and hh_b member, Bea in hh_b owner, Cy in none and never set up): 7 for `myHouseholds`, 10 for `setActiveHousehold`, 8 for `createHousehold(alsoWhenMember:)`; plus `setActiveHousehold` in `publishesNothing`.
- [x] **Step 2:** red. Done: 21 of 25 were red against the HEAD resolver and schema. The 4 green ones describe old behaviour or are negative controls; the mutations below prove them.
- [x] **Step 3:** done in `ac18190e`.
- [x] **Step 4:** done in `ac18190e`. `myHouseholds` and `setActiveHousehold` do not call `requireHousehold` at all (not `ignoreShown`): it would run first sign-in for a person in no household. `pickHousehold` and `MEMBERSHIP_ORDER` are exported from `lib/household.ts`. `myHouseholds` makes two reads (the `User` row with ordered memberships, then the names), not one `findMany`.
- [x] **Step 5:** codegen clean; `oldBundleCompat.test.ts` 7/7 with no list change. Full gate green. After: web 3729 / 364, server 2760 / 87 (+25), spec 70. Live guard 78 `publishes`, 4 `publishesNothing`. Server bundle 260.2 KiB, no TS6385.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| `setActiveHousehold` skips the membership read | Bea-for-A `FORBIDDEN` test |
| `setActiveHousehold` reads the membership with the global `prisma` | the `tx` spy test |
| `createHousehold` ignores `alsoWhenMember` (always counts) | the Mia "Second" test |
| `createHousehold` skips the count always | "without the argument, Mia still gets `ALREADY_IN_HOUSEHOLD`" |
| `myHouseholds` calls `requireHousehold` | Cy gets `[]` with no household made |
| `isActive` true on the first membership always | Mia with `activeHouseholdId` = B |

**Done 2026-11-21.** Commit `ac18190e`. Mutation checks, each restored from a copy:

| Mutation | Result |
|---|---|
| `setActiveHousehold` skips the membership read | red, 5 tests, Bea-for-A `FORBIDDEN` included |
| `setActiveHousehold` reads the membership with the global `prisma` | red, 2 tests (the `tx` spy, the lock order) |
| `createHousehold` ignores `alsoWhenMember` | red, 2 tests (Mia "Second" included) |
| `createHousehold` skips the count always | red, 3 tests ("without the argument, Mia still gets ALREADY_IN_HOUSEHOLD", `false`, `null`) |
| `myHouseholds` calls `requireHousehold` | red, 3 tests (Cy gets `[]` with no household made included) |
| `isActive` true on the first membership always | red, 2 tests (Mia with active = hh_b) |
| (extra) no `lockUser` in `setActiveHousehold` | red, 1 test (lock order) |
| (extra) `setActiveHousehold` calls `requireHousehold` | red, 4 tests (stale-tab switches, Cy) |
| (extra) `myHouseholds` without `orderBy` | red, 3 tests |
| (extra) `setActiveHousehold` left out of the live guard | red, the guard |

**E2E:** L.6 tests 1 and 2.

---

## Task L.3 — web: the header, the recovery, documents and hooks

**Files:** `apps/web/src/apollo/client.ts` and `client.test.ts`, `apollo/householdGuard.ts`
and `householdGuard.test.ts`, `apollo/operations/household.graphql`, a new
`hooks/useMyHouseholds.ts` and test, `hooks/useHousehold.ts`, a new
`components/global/HouseholdChangedNotice/` (component, stories, smoke test),
`routes/__root.tsx`, `i18n/locales/en.json`, `tw.json`.

- [x] **Step 1: write the failing tests.** Done: 8 in `client.test.ts` (the header for both clients, no header with nothing stored, the per-page id when another tab stores a new one, the recovery once for `HOUSEHOLD_CHANGED` for both clients, not for `FORBIDDEN`), 12 in `householdGuard.test.ts` (`getShownHouseholdId`, the recovery: switch with both names, no old name for another cached household, `NO_HOUSEHOLD`, a second call, a burst of five, the same household, a failed question then a retry, a cache that cannot be cleared; the stored message, also with storage that throws), 7 in the new `hooks/useMyHouseholds.test.tsx`, 5 in `HouseholdChangedNotice.test.tsx`, 3 in its smoke test.
- [x] **Step 2:** written alongside the code; the mutations below prove each one.
- [x] **Step 3:** done in `75d6b259`. `householdIdLink` and `householdChangedLink` (the Apollo 4 `ErrorLink`) in one `httpChain()` shared by the Clerk client and the E2E client. The header is `getShownHouseholdId()`, the id this page shows, read once per page load, not `getLastHouseholdId()`.
- [x] **Step 4:** done in `d065264b`. `MyHouseholds`, `SetActiveHousehold`, `CreateHousehold($name, $alsoWhenMember)`. The no-household screen sends no `alsoWhenMember`.
- [x] **Step 5:** done in `d065264b` (hooks, `MyHouseholds` in `CATALOG`) and `75d6b259` (`recoverFromHouseholdChange`, `HouseholdChangedNotice` in `__root.tsx` beside `OfflineBanner`, the O51 texts).
- [x] **Step 6:** full gate green. After: web 3764 / 367 (+35), server 2760 / 87, spec 70. Build: server bundle 260.2 KiB, no TS6385. Storybook: 3 new stories.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| the header link not added to the E2E client | L.6 test 3 (the unit test covers the Clerk client only if the file is shared; check which one the test builds) |
| the module flag removed (recovery runs per error) | "a second call does nothing" |
| `switchTo` calls `switchToHousehold` before the mutation resolves | "does NOT call it when the mutation fails" |
| `createAndSwitch` drops `alsoWhenMember` | its variables test |

**Done 2026-11-21.** Commits `d065264b`, `75d6b259`. Mutation checks, each restored from a copy:

| Mutation | Result |
|---|---|
| the header and error links not added to the E2E client | red, 2 tests (e2e header, e2e recovery) |
| the module flag removed (recovery runs per error) | red, 2 tests ("a second call does nothing"; the burst test by timeout) |
| `switchTo` calls `switchToHousehold` before the mutation resolves | red, 2 tests ("does NOT call it when the mutation fails" included) |
| `createAndSwitch` drops `alsoWhenMember` | red, 2 tests (its variables tests) |
| (extra) the header reads the shared key on every request | red, 2 tests (the other-tab test) |
| (extra) the recovery reads with `network-only` | red, 1 test |
| (extra) the error link does not call the recovery | red, 2 tests |
| (extra) the error link fires on any code | red, 1 test (`FORBIDDEN`) |
| (extra) the notice key is not removed | red, 1 test |
| (extra) no notice stored before the reload | red, 2 tests |
| (extra) the old name used for another cached household | red, 1 test |
| (extra) the flag not reset after a failed question | red, 1 test |
| (extra) a reload when the answer is the shown household | red, 1 test |
| (extra) `forgetHousehold` keeps the page id | red, 1 test |

**E2E:** L.6.

### Review of L.1–L.3

An independent review (2026-11-21) found no must-fix defect: a stale tab cannot reach the
other household through any field that calls `requireHousehold`. It found five problems to
fix (fixed below, each proved first) and two notes (F6, F7) recorded in *Known gaps*.

| Finding | Verdict | Fix |
|---|---|---|
| F1: the notice key in `localStorage` is shared by every tab; another tab could show or remove it | true | `a3097db4`: the notice lives in `sessionStorage` (one tab, survives its reload); every access in try/catch |
| F2: `HouseholdChangeGuard` compared with `getLastHouseholdId()`; with page `hh-a`, key `hh-b` and answer `hh-b` it did nothing | true (probe reproduced as a red test) | `52cb5136`: compares with `getShownHouseholdId()`; the guard tests reset the page state in `beforeEach` |
| F3: "a header sent twice arrives as an array" | true: Node 22.17.1 gives `"A, B"`; only `headersDistinct` gives an array | `02598166`: `householdIdFrom` treats a comma or whitespace as missing (not a refusal: no header already skips the compare, and old bundles must keep working); comments fixed, also on `clientIdFrom` |
| F5: `switchToHousehold` clears the cache before the page id changes, so the refetches are refused and the recovery stores a false notice and switches again | true | `6eca4351`: `switchToHousehold` and `forgetHousehold` set the recovery flag before `clearCache()`; switch keeps it on success and puts it back on failure; forget puts it back when it ends |
| F8: `clearCache` called `localStorage.removeItem` with no try/catch | true | `a0862c04`: wrapped. `useActiveLocation.tsx` is not on the switch path, so it is unchanged |

Mutation checks, each restored from a copy and checked with `cmp`:

| Mutation | Result |
|---|---|
| `householdIdFrom` accepts a comma or whitespace | red, 7 tests |
| `clearCache` removeItem unwrapped | red, 1 test |
| the notice back in `localStorage` | red, 10 tests |
| `switchToHousehold` does not set the flag | red, 1 test |
| `switchToHousehold` does not put the flag back on failure | red, 1 test |
| `forgetHousehold` does not set the flag | red, 1 test |
| `forgetHousehold` does not put the flag back | red, 1 test |
| the guard back to `getLastHouseholdId()` | red, 1 test |
| (extra) the guard drops `seenId` | green, 9 of 9: `seenId` is no longer pinned (known gap) |

Gate after the fixes: web 3772 / 367 (+8), server 2767 / 87 (+7), spec 70. Build: server bundle 260.2 KiB, no TS6385.

---

## Task L.4 — web: **Switch to…** and **Create new**

**Files:** a new `components/household/HouseholdSwitcher/` (`HouseholdSwitcher.tsx`,
`index.ts`, stories, `.stories.test.tsx`, `.test.tsx`), a new
`components/household/CreateHouseholdDialog/`, `components/global/Sidebar/HouseholdSidebar.tsx`
and tests and stories, `routes/settings/index.tsx` (the mobile accordion) and tests,
`i18n/locales/en.json`, `tw.json`.

- [x] **Step 1: write the failing tests.** Done: 13 in `HouseholdSwitcher.test.tsx` (every household with its name as stored and its role, no `capitalize` ancestor; the current one `aria-checked`; another calls `switchTo`; the current one does nothing; every row disabled while it runs; a toast on failure; one household is a list; Create new opens the dialog with focus on the name; focus back on the trigger; loading row; error row; the card's name; nothing in local mode), 6 in `CreateHouseholdDialog.test.tsx` (trimmed name; empty name; Create and Cancel off while it runs; a server error in the dialog; the name rule and focus on `BAD_USER_INPUT`; nothing more offline), 4 in `HouseholdSidebar.switcher.test.tsx` and 4 in `routes/settings/index.switcher.test.tsx` (owner, manager, member in cloud; not in local).
- [x] **Step 2:** written alongside the code; the mutations below prove each one.
- [x] **Step 3:** done in `d9f314e3`. `HouseholdSwitcher` (`variant: 'sidebar' | 'card'`) and `CreateHouseholdDialog`. Rows are `menuitemradio` with `aria-checked`. A switch keeps the menu open (`preventDefault`) with every row disabled. Create new opens the dialog in the menu's `onCloseAutoFocus`.
- [x] **Step 4:** stories `OneHousehold`, `TwoHouseholds`, `LongName`, `Loading`, `LoadError`, `Switching`, `CreateDialogOpen`, `Card`; `CreateHouseholdDialog` `Open`, `Creating`, `ServerError`; `HouseholdSidebar` `CloudHouseholdName` now lists two households. Smoke tests assert roles and names.
- [x] **Step 5:** the comment at `HouseholdSidebar.tsx:23` updated; `components/CLAUDE.md` in `0941e6a1`. Full gate green. Before: web 3772 / 367, server 2767 / 87, spec 70. After: web 3811 / 373 (+39), server 2767 / 87, spec 70. Build: server bundle 260.2 KiB, no TS6385. Storybook: 11 new story ids. No E2E run (L.6).

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| choosing the current household calls `switchTo` | "choosing the current one does nothing" |
| the item shown in local mode | the local sidebar test |
| `capitalize` added to the household name | the ancestor test |

**Done 2026-11-21.** Commits `d9f314e3`, `0941e6a1`. Mutation checks, each restored from a copy and checked with `cmp`:

| Mutation | Result |
|---|---|
| choosing the current household calls `switchTo` | red, 1 test ("choosing the current household does nothing") |
| the item shown in local mode | red, 4 tests (component, sidebar, accordion, sidebar story) |
| `capitalize` added to the household name | red, 1 test (the ancestor test) |
| (extra) `capitalize` on the menu | red, 1 test |
| (extra) rows not disabled while switching | red, 2 tests (unit, `Switching` story) |
| (extra) `aria-checked` removed | red, 2 tests (unit, `TwoHouseholds` story) |
| (extra) the dialog opened in `onSelect` | red, 1 test (focus on the name field) |
| (extra) focus not put back on the trigger | red, 1 test |
| (extra) no toast on a failed switch | red, 1 test |
| (extra) the name not trimmed | red, 1 test |
| (extra) Create not disabled while pending | red, 2 tests (unit, `Creating` story) |
| (extra) a server error not shown | red, 2 tests (unit, `ServerError` story) |
| (extra) no focus after a refused name | red, 1 test |
| (extra) the general error shown offline | red, 1 test |

**E2E:** L.6 tests 1, 2 and 5 (the axe scans of the menu and the dialog are there, not in L.4).

---

## Task L.5 — web: copy offline data into a chosen household (O22-A)

**Files:** `apps/web/src/hooks/usePostLoginMigration.ts` and test,
`components/global/PostLoginMigrationDialog/` (component, tests, stories),
`i18n/locales/en.json`, `tw.json`. Read H5b decision T31 and the 2026-11-19 bug doc
(`docs/global/bugs/2026-11-19-bug-manual-import-names-no-household.md`) first: the manual
prompt and the stored copy share this dialog since then. Check whether both reach the new
choice, and say so in the report.

- [x] **Step 1: write the failing tests** (T73). Done: 12 in `usePostLoginMigration.test.ts` (describe "a copy into a chosen household (L.5)": move first and nothing copied before the reload; the plain question stores `skip`; a new household with `alsoWhenMember: true`; a refused move stores nothing; a move that fails after the answer removes what it stored; after the reload the copy runs with no question and the key is gone before it starts; a `skip` copy asks only where; the key is removed when the copy fails; a key naming another household; a key matching the answer but not the page id; a key matching the page id but not the answer; a role that no longer allows it), 3 in `useMyHouseholds.test.tsx` (`beforeSwitch` order for both writes, not called on a refusal), 11 in `PostLoginMigrationDialog/index.test.tsx` (the list without a member household; `clear` lists owned households only; another household moves and copies nothing here; the household shown copies as before; a new household with a name; member here and manager elsewhere; member everywhere: sentence and Done; a joined household not offered; `clear` into another household types THAT name; a failed move shows an alert; names render as stored), 2 smoke tests.
- [x] **Step 2:** written alongside the code; the mutations below prove each one.
- [x] **Step 3:** done in `945f7af9` (`beforeSwitch` on `switchTo` and `createAndSwitch`) and `16bb0a4c` (`copyElsewhere`, `COPY_INTO_HOUSEHOLD_KEY` in `sessionStorage`, read once and removed before the copy, compared with the `household` answer AND `getShownHouseholdId()` and `canCopyInto`; `copyTargetOptions` and the "Copy into" radio group in both questions; i18n `chooseLabel`, `newHousehold`, `newHouseholdName`, `newHouseholdTitle`, `newHouseholdNote`, `moveNote`, `moveAndCopy`, `moveError`). Both questions (the stored copy and the manual prompt) share the dialog since 2026-11-19, and both reach the choice.
- [x] **Step 4:** stories `ChooseHouseholdTwo` and `ChooseHouseholdOne`; docs in `d6ccbbc7`. Full gate green. Before: web 3811 / 373, server 2767 / 87, spec 70. After: web 3839 / 373 (+28), server 2767 / 87, spec 70. Build: server bundle 260.2 KiB, no TS6385. Storybook: 2 new story ids. No E2E run (L.6).

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| the copy starts before `switchToHousehold` | "the copy does NOT start before the reload" |
| the key is not compared with the shown household | "a key naming another household" |
| a `member` household listed | the list test |
| the key not removed after an error | the error test |

**Done 2026-11-21.** Commits `945f7af9`, `16bb0a4c`, `d6ccbbc7`. Mutation checks, each restored from a copy and checked with `cmp`:

| Mutation | Result |
|---|---|
| the copy starts before `switchToHousehold` | red, 6 tests |
| the key not compared with the shown household (`getShownHouseholdId`) | red, 1 test |
| (extra) the key not compared with the `household` answer | red, 1 test (green until the "page id B, answer A" test was added) |
| a `member` household listed | red, 4 tests |
| the key not removed (so not after an error) | red, 4 tests |
| (extra) no role check after the reload | red, 1 test |
| (extra) no cleanup after a move that fails after the answer | red, 1 test |
| (extra) the skip list ignored | red, 1 test |
| (extra) `clear` asks for the current household's name | red, 1 test |
| (extra) the key in `localStorage` | red, 4 tests |
| (extra) `beforeSwitch` not called | red, 4 tests |

**E2E:** L.6 test 4.

---

## Task L.6 — E2E: switch, create, stale tab and copy on real SQL

**Files:** a new `e2e/tests/household-switch.spec.ts`, a new page object
`e2e/pages/HouseholdSwitcher.ts`, `e2e/playwright.config.ts` (the `cloud` project's
`testMatch` and the `local` project's `testIgnore`).

Read `e2e/CLAUDE.md` first. Every test seeds through `makeGql` and `/e2e/household-members`,
and reads the result back through `makeGql` with `expect.poll`. Assert something PRESENT
before an absence (root `CLAUDE.md`, *An absence … can be satisfied by the loading state*).

| # | Test | Fixture | Mutation that must turn it red |
|---|---|---|---|
| 1 | `user can switch household and sees no cart row of the old one` | person P in A (owner, location LA, a cart with item "Old milk") and in B (member, location LB, cart with "New bread"); P's page on Shopping in A shows "Old milk" first | (a) `clearCache()` removed from `switchToHousehold`: the test reads `Player1InventoryCloudCache` with `page.evaluate` after the switch and finds the string `Old milk`; (b) the removal of `active-location-id:cloud` dropped: the stored id still names LA right after the reload. The visible check ("New bread" shown, "Old milk" not) is a **negative control**: the shopping page filters by the active location, so it may stay green under (a) |
| 2 | `user can create a new household from Switch to and lands in it` | P in A only | `createHousehold` ignoring `alsoWhenMember` (P gets `ALREADY_IN_HOUSEHOLD`, no new household in `myHouseholds`) |
| 3 | `a stale tab cannot write into the other household` (O21) | P in A and B; page shows A; then `makeGql` as P calls `setActiveHousehold(B)` (another device) | the compare in `requireHousehold` removed: the tag the page tries to create is found in B by readback. With the fix: no tag in A or B, the page reloads into B and shows the O51 message |
| 4 | `user can copy offline data into another household they manage` (O22-A) | P owner of A (active) and manager of B; local data seeded in Dexie; P switches to cloud and picks B | the copy starts before the switch: the items land in A (readback of `items` with P active in A) |
| 5 | axe scan of the open **Switch to…** dropdown and the Create dialog, light and dark | — | (a scan; no mutation) |

- [ ] Step 1: write the spec, then run it alone: `pnpm test:e2e --project=cloud
  e2e/tests/household-switch.spec.ts`.
- [ ] Step 2: run each mutation above. Copy the source file aside first; restore from the
  copy. Record red or green for each, and name the negative control as one.
- [ ] Step 3: `a11y.spec.ts` does not run in `cloud`, so the scans live in this spec, as in
  H6b's `household-ownership.spec.ts`.
- [ ] Step 4: count the cloud spec files with the two commands under *Proving a Test Works*
  in root `CLAUDE.md`.

---

## Task L.7 — H7a docs, deploy notes and the final gate

**Files:** root `CLAUDE.md` (an H7a paragraph after the H6b one: `x-household-id`,
`HOUSEHOLD_CHANGED`, `myHouseholds`, `setActiveHousehold`, `createHousehold(alsoWhenMember:)`,
the live guard count; rewrite the H4 sentence "A test cannot yet tell the target household
from the caller's household"), `apps/web/src/routes/CLAUDE.md`, `hooks/CLAUDE.md` (the G.9
`keyFields` note is not needed: the switch clears the whole cache), `components/CLAUDE.md`,
`routes/settings/CLAUDE.md`, `e2e/CLAUDE.md`, the design (*Create and delete a household*,
*Desktop* item 9, *Known gaps* "Household switch shows the previous household's cart",
*Sequencing* row H7), the phase plan's H7 outline, the H5b plan's *Known gaps* (O21 and O22
marked fixed, with a link here), `docs/INDEX.md`, the H4 runbook (a new **section 13, H7a**:
no migration, server first, what an old bundle sees, checks after deploy), and this plan's
*What this plan got wrong* and *Status*.

- [ ] Step 1: the docs. Re-measure every count you write; do not copy one from here.
- [ ] Step 2: no migration in H7a, so no `verify:migration`. Check with
  `git log --oneline 9701ddff..HEAD -- apps/server/prisma/` (empty).
- [ ] Step 3: the full gate from the repo root, every command alone:

  ```bash
  pnpm lint
  pnpm build 2>&1 | tee /tmp/p1i-build.log
  (cd apps/web && pnpm build-storybook)
  pnpm check
  grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
  pnpm test
  pnpm test:e2e:all
  ```

  Never the bare `pnpm test:e2e`, never `--grep`. Copy `test-results/` aside before
  re-running anything.
- [ ] Step 4: `git status` clean; `git show --stat` for each commit.

---

# Part 2 — H7b: personal location order and the four sorts

## Task M.1 — the migration, fakes and cleanup

**Files:** `apps/server/prisma/schema.prisma`, a new migration folder
`apps/server/prisma/migrations/<timestamp>_add_location_preferences/migration.sql`,
`apps/server/scripts/migrationDeploys.ts`, `scripts/verify-migration.ts`, the Prisma fakes
(`src/test/householdFake.ts` / `householdWorld.ts` or a new `locationPreferenceFake.ts`, and
their tests), `src/lib/e2eCleanup.ts` and test, `resolvers/purge-coverage.test.ts`,
`e2e/helpers/cloudTeardown.ts`, `e2e/tests/cleanup-endpoint.spec.ts`, `src/lib/invite.ts`.

- [ ] **Step 0: measure the baseline** as in L.1.
- [ ] **Step 1: write the failing tests.**
  - The fake: the `locationPreference` store keys on `(userId, locationId)`; `upsert` keeps
    `create` and `update` apart; `where` applies `userId`, `locationId` (plain and `{ in }`)
    and THROWS on any other key; a location delete in the world removes its rows (cascade).
  - `e2eCleanup.test.ts`: 22 keys; `locationPreference.deleteMany` runs before
    `location.deleteMany` and before `user.deleteMany`, filtered by the test user's id OR the
    owned households' locations.
  - `purge-coverage.test.ts`: the filter text of the new call. `deleteHouseholdData` needs
    no new line: the rows go with their locations by cascade. Write that in the test's
    `kept` or cascade list, whichever the file uses (read it first).
  - An `invite-join.resolver.test.ts` case: a joiner's own household with only preference
    rows is still deleted at the join (T75).
- [ ] **Step 2:** run: red.
- [ ] **Step 3: schema and migration** (T74, T75, T79). In order: `CREATE TYPE
  "LocationSort"`; `ALTER TABLE "User" ADD COLUMN "locationSort" "LocationSort"` (nullable);
  `ALTER TABLE "Location" ADD COLUMN "dataUpdatedAt" TIMESTAMP(3)` (nullable); the one
  backfill `UPDATE "Location" l SET "dataUpdatedAt" = s.m FROM (SELECT "locationId", max("updatedAt") m FROM "ItemStock" GROUP BY 1) s WHERE s."locationId" = l.id`;
  `CREATE TABLE "LocationPreference"` with the primary key, both foreign keys `ON DELETE
  CASCADE`, and the index on `locationId`. Write in the SQL comment why each column is
  nullable, and why there is a backfill on a nullable column (it carries real history the
  sort uses; `apps/server/prisma/CLAUDE.md` says a nullable column normally needs none).
- [ ] **Step 4:** the migration joins the last group of `migrationDeploys.ts`, after
  `20261120100000_add_ownership_offers`. In `verify-migration.ts`: the table's columns,
  types and nullability; the primary key; exactly two foreign keys, both `CASCADE` (read from
  `information_schema`, not with `LIKE '%Id%'`); the enum has exactly the four values;
  `User.locationSort` and `Location.dataUpdatedAt` are nullable; a location with stock rows
  has `dataUpdatedAt` equal to its newest `ItemStock.updatedAt` after the backfill, and a
  location with none has `NULL`; deleting a location deletes its preference rows and keeps
  another location's; deleting a user deletes theirs.
- [ ] **Step 5:** the fakes, the cleanup (22 models), the comment above
  `emptyHouseholdWhere`, `cloudTeardown.ts`'s key list, and one seeded row in
  `cleanup-endpoint.spec.ts` (through `markLocationVisited` once M.2 exists; until then the
  E2E step waits for M.5).
- [ ] **Step 6:** `pnpm --filter server exec prisma validate`, `pnpm codegen`, the full gate.
  **Do not run** `prisma migrate dev`, `verify:migration` or any command that reaches a
  database. Report that `verify:migration` is owed to the main session (M.6).

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| the fake ignores an unknown `where` key | the fake's throw test |
| `locationPreference.deleteMany` removed from the cleanup | `e2eCleanup.test.ts` key count |
| `locationPreferences: { none: {} }` (or the relation's real name) added to `emptyHouseholdWhere` | the T75 join test |
| (for the main session, in `verify-migration.ts`) the backfill line removed from the SQL | the backfill assertion |

**E2E:** none in this task.

---

## Task M.2 — server: `dataUpdatedAt`, `lastVisitedAt` and `markLocationVisited`

**Files:** `apps/server/src/lib/publishChange.ts` and test, `schema/location.graphql`,
`resolvers/location.resolver.ts`, a new `resolvers/location-order.resolver.test.ts`,
`resolvers/live-publish.guard.test.ts`.

- [ ] **Step 1: write the failing tests.**
  - `publishChange.test.ts`: `STOCK` at L1 and `CART` at L2 set `dataUpdatedAt` on both, in
    ONE `updateMany`; `LOCATION` and `CATALOG` set nothing; an `updateMany` that throws does
    not stop the events and does not throw (the function's contract). A clock fake gives a
    fixed `now`.
  - One writer of each kind through its resolver, so the path is proved and not only the
    helper: `upsertItemStock` (`STOCK`), `addToCart` (`CART`), `addInventoryLog` (`LOG`),
    `bulkCreateItemStocks` (an import), `removeAllLocationItems`. Each moves only its own
    location's `dataUpdatedAt`; a second location of the same household keeps its value.
  - `Location.dataUpdatedAt` is the stored value as ISO, or `null`. `Location.lastVisitedAt`
    is the CALLER's: two people, two values.
  - `markLocationVisited`: a viewer writes `lastVisitedAt`; a second call within 60 seconds
    writes nothing and answers `false`; no role: `FORBIDDEN`; a location of the person's
    other household: `FORBIDDEN` (it must be in the household they act in); no event.
  - Live guard: `markLocationVisited` in `publishesNothing`.
- [ ] **Step 2:** run: red.
- [ ] **Step 3:** T79 in `publishChange.ts`, inside the existing guard. Then the schema
  fields (T82), the mutation (T80), and the field resolvers (read the caller's preference
  once per request per household, T77's cache).
- [ ] **Step 4:** `pnpm codegen`, `oldBundleCompat.test.ts`, the full gate.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| `publishChange` sets `dataUpdatedAt` for every kind | the `LOCATION`/`CATALOG` test |
| the `updateMany` moved before the event loop and allowed to throw | "does not stop the events" |
| the 60-second skip removed | the second-call test |
| `lastVisitedAt` read without the caller's `userId` | the two-people test |

**E2E:** M.5 tests 2 and 3.

---

## Task M.3 — server: personal order, `reorderLocations`, the sort setting

**Files:** `schema/location.graphql`, `resolvers/location.resolver.ts`,
`resolvers/location-order.resolver.test.ts`, the existing `reorderLocations` tests (find
them with `git grep -ln reorderLocations -- apps/server/src`), `lib/authz.ts`
(`forgetLocationRoles` clears the new cache), `resolvers/live-publish.guard.test.ts`,
`apps/server/src/test/oldBundleCompat.test.ts` (run).

- [ ] **Step 1: write the failing tests.** Fixture: household H with three locations whose
  shared `order` is C, A, B (not by name); Mia (owner, roles on all three), Bea (member,
  roles on A and B only), and one location D in another household where Mia has a role.
  - With no preference rows, `locations` for Mia returns C, A, B with `order` 0, 1, 2.
  - Mia `reorderLocations([B, C, A])`: Mia gets B, C, A; **Bea still gets A, B** (from the
    shared order); `Location.order` in the DB is unchanged.
  - Bea `reorderLocations([B, A])` works (a member may reorder her own list); Bea
    `reorderLocations([B, A, C])` is `FORBIDDEN` or `BAD_USER_INPUT` (she has no role on C
    and C is not in her list; pick one and say which); a repeated id `BAD_USER_INPUT`; D in
    the list `FORBIDDEN`; a subset for Mia `BAD_USER_INPUT`.
  - A new location created after Mia's reorder comes LAST in Mia's list.
  - `householdLocations` for Mia uses the same personal order, including a No access row.
  - A reorder and a `locations` read in one request (two root fields) see the new order
    (the cache is cleared).
  - `myLocationSort`: `null` in the DB gives the O52 default; `setLocationSort(name)` stores
    it and the next read gives `name`; no event.
  - Live guard: `reorderLocations` moved to `publishesNothing`; `setLocationSort` added
    there.
- [ ] **Step 2:** run: red.
- [ ] **Step 3:** T76–T78 and T74's two fields. Keep `firstLocationIdOf` (the old-bundle
  `isDefault` shim) on the SHARED order: it must keep answering what `main` expects, and it
  is removed in the release after households. Say so in its comment.
- [ ] **Step 4:** update the comment at `location.resolver.ts:557–559`. `pnpm codegen`,
  `oldBundleCompat.test.ts`, the full gate.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| `reorderLocations` writes `Location.order` instead of `customOrder` | "Bea still gets A, B" |
| the set check uses `householdLocations` for everyone | Bea's `[B, A]` test |
| the preference cache not cleared by `forgetLocationRoles` | the two-root-fields test |
| locations with no `customOrder` sorted first | "a new location comes LAST" |
| `myLocationSort` returns `null` instead of the default | the default test |

**E2E:** M.5 tests 1 and 4.

---

## Task M.4 — web: **Sort by**, drag for everyone, the switcher, visits

**Files:** a new `apps/web/src/lib/locationSort.ts` and test,
`apollo/operations/locations.graphql`, `hooks/useLocations.ts` and tests, a new
`hooks/useLocationSort.ts` and test, `hooks/usePermissions.ts`, `hooks/useActiveLocation.tsx`
and tests, `routes/settings/household/locations/index.tsx` and its tests and stories,
`components/location/LocationList/` (tests, stories), `components/shared/LocationSwitcher/`
(tests, stories), `i18n/locales/en.json`, `tw.json`.

- [ ] **Step 1: write the failing tests.**
  - `locationSort.test.ts`: names `"banana"`, `"Apple"`, `"cherry"` sort as Apple, banana,
    cherry under `name` (case does not matter); two `tw` names sort with
    `localeCompare(…, 'zh-TW')`; `lastUpdated` newest first, `null` last; `lastVisited` the
    same; `custom` by `order`; ties by name, then `id`. Every fixture has an order that is
    different under each sort, or the test proves nothing.
  - Settings › Locations, cloud: a **Sort by** control with the four choices, the current one
    from `myLocationSort`; changing it calls `setLocationSort` and re-sorts at once; drag
    handles show only with **Custom**, and for every role (a member too); a drop calls
    `reorderLocations` with the list in its new order.
  - `LocationSwitcher` (O53-A): it uses `sortLocations` with the person's sort.
  - `ActiveLocationProvider`, cloud: a change of the active location calls
    `markLocationVisited` once; the first pick after load counts as a change only if O55 says
    so; local mode never calls it.
  - Local mode (O54-B): **Sort by** shows two choices only, **Name** and **Custom**. The
    choice is saved in `localStorage` under the key `location-sort` and read back after a
    reload. A missing, unknown or cloud-only value (`lastUpdated`, `lastVisited`) falls back
    to **Custom**. Every read and write is in `try/catch`, so a blocked storage still shows
    **Custom**. Drag handles show only with **Custom**, as in cloud. The switcher uses the same
    sort (O53-A). Nothing in `apps/web/src/db/` changes, and local mode never calls
    `markLocationVisited` or `setLocationSort`.
- [ ] **Step 2:** run: red.
- [ ] **Step 3:** the pure function, the documents (`dataUpdatedAt`, `lastVisitedAt` in
  `GetLocations` and `GetHouseholdLocations`; `MyLocationSort`, `SetLocationSort`,
  `MarkLocationVisited`), the hooks. `usePermissions().canReorderLocations` is `true` for
  every role in cloud (it was `manager`).
- [ ] **Step 4:** the page, the list, the switcher, the visit call. Stories for each sort.
- [ ] **Step 5:** the full gate.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| `name` sort without `sensitivity: 'base'` | the Apple/banana test |
| `null` sorted first | the `null` last tests |
| drag handles shown for every sort | the "only with Custom" test |
| `canReorderLocations` still `manager` | the member drag test |
| the switcher sorts by `order` only | the switcher test (with a fixture whose `order` differs from the chosen sort) |
| local mode ignores the stored `location-sort` (always Custom) | the local "Name survives a reload" test |
| local mode offers all four sorts | the local "two choices only" test |

**E2E:** M.5.

---

## Task M.5 — E2E: personal order and the sorts on real SQL

**Files:** a new `e2e/tests/location-sort.spec.ts`, `e2e/pages/LocationsPage.ts` (or the
existing page object for the locations list; check `ls e2e/pages`),
`e2e/playwright.config.ts`. Run the existing location specs too:
`settings/locations.spec.ts` and `location-switcher.spec.ts` in both `local` and `cloud`,
because their reorder tests now write a personal order in cloud.

| # | Test | Fixture | Mutation that must turn it red |
|---|---|---|---|
| 1 | `user can keep their own location order` | one household, Mia (owner) and Bea (member), three locations with roles for both, shared order C, A, B; two browsers | `reorderLocations` writes `Location.order`: Bea's list changes after Mia's drag |
| 2 | `user sees the location they just stocked first under last updated` | three locations; stock changed at the LAST one by name and by order | the `dataUpdatedAt` write removed from `publishChange` |
| 3 | `user sees the location they visited last first under last visited` | three locations; Mia picks the third in the switcher | `markLocationVisited` made a no-op that answers `true` |
| 4 | `user sees locations by name` | shared order not by name | `name` mapped to `custom` in `sortLocations` |
| 5 | `user sees the same sort on another device` | Mia in two browser contexts | `setLocationSort` replaced by a `localStorage` write |
| 6 | axe scans of the locations page with **Sort by** open, light and dark | — | (a scan) |
| 7 | `user can sort locations by name in local mode` (O54-B). In `settings/locations.spec.ts`, run in `local` only (skip in cloud, which test 4 covers). After a reload the list is still by name, and the switcher uses the same order | three local locations whose order is not by name | the stored `location-sort` not read back (always Custom) |

- [ ] Step 1: write the spec; run it alone with `--project=cloud`.
- [ ] Step 2: run each mutation; copy the file aside first; record red or green.
- [ ] Step 3: run `settings/locations.spec.ts` and `location-switcher.spec.ts` in `local`
  and `cloud`. Fix a cloud test that expected a shared order; say in the report which tests
  changed and why.
- [ ] Step 4: `cleanup-endpoint.spec.ts` now seeds one preference row through
  `markLocationVisited` and expects a count of at least 1.

---

## Task M.6 — H7b docs, deploy notes and the final gate

**Files:** root `CLAUDE.md` (an H7b paragraph: the table, the two columns, `publishChange`
and `dataUpdatedAt`, the personal `order`, `reorderLocations` in `publishesNothing`, the
live guard count, the cleanup count, the migration count), `apps/server/prisma/CLAUDE.md`
(the migration in `migrationDeploys.ts`; the backfill on a nullable column as a named
exception), `e2e/CLAUDE.md`, `apps/web/src/routes/settings/household/locations/CLAUDE.md`
(sort, personal order, who drags), `hooks/CLAUDE.md` (`reorderLocations` text: it is not a
household write any more), `components/CLAUDE.md`, the design (*Data model*, *Writers of
`dataUpdatedAt`*, *Migration of existing data*, *Location pages*, *Location switcher*,
*Sequencing* row H7), the phase plan's H7 outline, `docs/INDEX.md`, the H4 runbook (a new
**section 14, H7b**: one additive migration with one backfill, server first, checks after
deploy), and this plan's *What this plan got wrong* and *Status*.

- [ ] Step 1: the docs. Re-measure every count.
- [ ] Step 2: **the main session**, not a subagent, runs `pnpm --filter server
  verify:migration` against the TEST database, with the owner's consent, and records each
  new check in a table here and in section 14 of the runbook. Run it BEFORE M.5, so the E2E
  runs on a proved schema.
- [ ] Step 3: the full gate, then `pnpm test:e2e:all`.
- [ ] Step 4: `git status` clean; `git show --stat` for each commit.

---

## Deploy notes

| Part | Migration | Order | Env / Clerk |
|---|---|---|---|
| H7a | none | server before web (the new bundle selects `myHouseholds` and sends `alsoWhenMember`) | none |
| H7b | `add_location_preferences` (additive: one enum, one table, two nullable columns, one backfill `UPDATE` on a new column) | server before web (the new bundle selects `dataUpdatedAt`, `lastVisitedAt`, `myLocationSort`) | none |

- **The backfill `UPDATE` touches every `Location` row once.** Production has few locations
  (5 measured on 2026-10-05). It runs inside the migration's transaction.
- **An old bundle after H7a** still writes into the household the person acts in, with no
  check (it sends no header). After its first reload it gets the new bundle.
- **After the H7b server deploy, the shared order is frozen.** A person who reorders gets
  their own order; everyone else keeps the order they saw.
- **Runbook sections:** section 13 (H7a) and section 14 (H7b) of
  [the H4 runbook](../backend/2026-11-17-deploy-runbook-households-h4.md). After the deploy:
  as a test person in two households, switch, and create a household; in one tab, switch,
  then save in a second tab and see the message.

## Rules every task brief must pass down

- Plain English (short sentences, common words, main point first), in code comments, docs,
  commits and the report. `tw` texts use 據點王 / 搬運工 / 圍觀的 and 擁有者 / 管理者 / 成員.
- The report shape from root `CLAUDE.md`, *Pull Requests and Agent Reports*, and an explicit
  section: **what this plan got wrong**.
- Node 22.17.1. The full gate after each task. Copy files aside before a mutation; never
  `git checkout --` to undo one; never bare `git stash`.
- **No database command in a subagent.** No `prisma migrate dev`, no `verify:migration`, no
  `migrate reset`. `prisma validate` and `prisma generate` are fine.
- Every test that is about one household out of two has a person in BOTH, and checks that
  the OTHER household is unchanged. A test that needs a person to act in one household sets
  `User.activeHouseholdId` (`world.setActiveHousehold`), not a `requestCache` pin (H5b T15).
- Every sort test has a fixture in which each of the four sorts gives a different order.
- Every new mutation is in the live guard, with its reason or its event test.
- Do not change or remove an existing GraphQL field, argument or input field. Run
  `oldBundleCompat.test.ts`.
- A write hook refetches with `refetchAfterWrite`, never `awaitRefetchQueries`.
- After each commit, `git show <sha> -- <file> | grep '<a line you added>'` (lint-staged can
  rewrite a staged file).
- The web suite has one known flaky story test under load
  (`routes/shopping/index.stories.test.tsx`, Offline). Check `uptime` and re-run it alone
  before you call it a regression.

## Known gaps (expected after H7)

- **Location-scoped fields never answer `HOUSEHOLD_CHANGED`** (review F6). `cartItems`,
  `addToCart`, `updateCartItem`, `removeFromCart`, `abandonCart`, the stock writes and the
  log writes go through `requireLocationRole`, not `requireHousehold`. After a switch, a
  stale tab's cart, stock and log writes still land in the household the tab SHOWS (not the
  other one), and the tab recovers only on its next catalog read. After a leave they get
  `FORBIDDEN`, not `HOUSEHOLD_CHANGED`, so the recovery waits for a catalog read too.
- **`setActiveHousehold` at the same moment as `deleteHousehold`** can return a raw P2003
  error instead of `FORBIDDEN` (review F7, read only). The next request recovers.
- **`seenId` in `HouseholdChangeGuard` is pinned by no test** since the F2 fix. It matters
  only after `forgetHousehold`, when the page id is `null`.
- **An old bundle has no stale-tab check** (T66). It sends no header, so O21 stays open for
  it until it reloads into the new bundle.
- **`makeGql` in E2E sends no header**, so E2E seeds are never refused. On purpose: a seed
  is not a stale tab.
- **The person's other open tabs learn of a switch on their next request** (T68). A tab that
  sends nothing (no live event, no click) keeps showing the old household until it does.
- **A reorder does not reach the person's other tabs live** (T78, `publishesNothing`). They
  see it on their next refetch.
- **`dataUpdatedAt` is written after the commit** (T79). A server crash between the two
  loses one timestamp; the sort is then a little off until the next write there.
- **Visits made with an old bundle, or in local mode, are not recorded.**
- **The shared `Location.order` stays in the schema and the table.** It is the fallback for
  a person with no custom order, and the old bundle's `isDefault` shim reads it. Dropping it
  is for the release after households, with the shim.
- **No limit on how many households one person can create.** A family app; recheck if abuse
  appears.
- Carried over, still open: the old-bundle shim removal, the keyboard gap on `role="button"`
  badges, the activity table's size, and the other items in the H5, H5b, H5c and H6 plans'
  *Known gaps*.

## What this plan got wrong

Filled in from the task reports and reviews.

| Task | The plan said | What was true |
|---|---|---|
| L.1 | test "as `mutationRoleCache.test.ts` does" | the fitting pattern is `import-role-gate.resolver.test.ts` (`executeOperation` with stateful fakes) |
| L.1 | step 2 "run: red" for every test of step 1 | the "header B", "no header" and "household answers B" tests are green before the code; only the mutations prove them |
| L.1 | no fixture work named | `clearAllData` through `deleteHouseholdData` needs recorder doubles for the 6 relation-filtered models, because `ownedRowFake` throws on `{ location: { householdId } }` |
| L.2 | step 4: `myHouseholds` "reads memberships with one `findMany` (include the household name)" | two reads share `pickHousehold` directly (`user.findUnique` with ordered memberships, then `household.findMany`); the member fake has no `orderBy` or relation select |
| L.2 | T67: `myHouseholds` calls `requireHousehold(ctx, { ignoreShown: true })` | it must not call `requireHousehold` at all: that runs first sign-in. The `ignoreShown` comment in `lib/authz.ts` was fixed by the main session after L.2 |
| L.2 | step 2 "run: red" for every test | 4 of 25 are green before the code (old behaviour, negative controls) |
| L.3 | T66: send `localStorage['last-household-id']` (`getLastHouseholdId()`) on every request | that key is shared by every tab, and a switching tab writes the new id just before it reloads. A stale tab would send the NEW id and be accepted: the O21 hole. The header is the id THIS PAGE shows (`getShownHouseholdId`), read once per page load, changed only by `setLastHouseholdId` and `forgetHousehold` |
| L.3 | T72: fetch `GetHousehold` with `fetchPolicy: 'network-only'` | `no-cache`: a cache write reaches the watched `GetHousehold`, and `HouseholdChangeGuard` would start a second switch and reload |
| L.3 | T72: store `household-changed-notice = '1'` | the message needs both names, and the old name is gone after the reload. The value is JSON `{ household, oldHousehold }`, written before the reload |
| L.3 | step 1: the notice is shown "by the root" | a component, `HouseholdChangedNotice`, in `__root.tsx` beside `OfflineBanner`, with stories and a smoke test |
| L.3 | O51: no tw text for "another household" | `你目前在 {{household}}。這個頁面還停留在另一個家庭，所以剛才的變更沒有儲存。` |
| L.3 | file map: `hooks/useHousehold.ts` changes | nothing changed there. The new hooks are in `hooks/useMyHouseholds.ts` |
| L.3 | not named | `MyHouseholds` must be in `CATALOG` in `QUERIES_BY_KIND` (a rename publishes `CATALOG` only), and in `liveUpdates.test.ts` |
| L.1 | `householdIdFrom`: "a header sent twice arrives as an array" | Node joins it into one string, `"A, B"` (Node 22.17.1); only `headersDistinct` gives an array. A value with a comma or whitespace is now treated as missing |
| L.3 | T72: the notice key in `localStorage` | `sessionStorage`: the notice is for the one tab that recovered, and `localStorage` is shared by every tab |
| L.3 | not named: which id `HouseholdChangeGuard` compares with | `getShownHouseholdId()`, the id this page sends; `getLastHouseholdId()` may already hold another tab's new id |
| L.3 | T72: "once per page load (a module flag)" | a deliberate move must block it too: `clearCache()` resets the cache, the watched queries refetch with the old id and are refused. `switchToHousehold` and `forgetHousehold` set the flag before the clear |
| L.4 | step 1: Create calls `createAndSwitch` "with the trimmed name, or with `null`" | the hook takes a string and turns `""` into `null`; the dialog sends `name.trim()` |
| L.4 | step 1: the sidebar test in `HouseholdSidebar.test.tsx` | every role needs a `usePermissions` mock, so the tests are in `HouseholdSidebar.switcher.test.tsx` and `routes/settings/index.switcher.test.tsx` |
| L.4 | not named | `setup.ts` and `routes/settings/household/locations/index.cloud.test.tsx` must stub `useMyHouseholdsQuery`, `useSetActiveHouseholdMutation`, `useCreateHouseholdMutation`; without them 22 tests there fail with "Could not find client" |
| L.4 | not named | a dialog opened from a menu's `onSelect` gets focus on a Radix focus guard; open it in the menu's `onCloseAutoFocus` |
| L.4 | "While `switchTo` runs, the menu items are disabled" | true only if the menu stays open (`preventDefault` in `onSelect`) |
| L.5 | T73: `localStorage['copy-into-household']` | `sessionStorage`: the choice belongs to one tab (the same reason as review F1) |
| L.5 | step 1: the key "removed when it ends, also on an error" | it is removed when it is read, before the copy starts. Stricter: a reload in the middle of the copy cannot start a second one |
| L.5 | step 3: "add the choice to `'confirming'`" | the manual prompt (`'prompting'`) is in the same dialog since 2026-11-19, so it gets the choice too, and stores `skip` for the reload |
| L.5 | step 1: after the reload "the copy runs with no question" | true for the "whether" question only. `skip` and `replace` still ask "Import into which location?", because the new household's locations are known only after the move |
| L.5 | not named | a stored `clear` into another household needs the typed-name confirm (O40) for THAT household, BEFORE the move |
| L.5 | not named | a household in `migration-skip-households` (O12-A) is left out of the list. Asked as O57 |
| L.5 | "No household where the person may copy, and no wish for a new one" | ambiguous. Built as: no copyable household means the old sentence and Done, and no "A new household" either |
| L.5 | file map | also `hooks/useMyHouseholds.ts` (`beforeSwitch`) and 3 route tests that render `__root.tsx` with their own factory (`cooking.cloud`, `items/$id/stock`, `shopping/index.cloud`) |

## Status

**Plan written 2026-11-21** on `feature/households-h7`, based on `develop` at `9701ddff`
(plus `5cc4e741`, which records H6b as merged). Owner decisions O49–O55 answered 2026-11-21: all A, except **O54-B** (Name and Custom in
local mode, saved on the device). Nothing built.

---

## Owner questions

Each question has a recommended option, marked **(Recommended)** and listed first. The task
that needs the answer is named in brackets.

**O49 — One PR or two, and which first?** (needed before L.1)

- **A. Two PRs, H7a first (Recommended).** H7a: household switch, Create new, the stale-tab
  fix (O21), the copy choice (O22-A), tasks L.1–L.7, no migration. Then H7b: personal
  location order and the four sorts, tasks M.1–M.6, one migration.
- B. Two PRs, H7b first.
- C. One PR with all thirteen tasks.

Reason: H7a closes a bug where data lands in the wrong household; H7b is a new feature. Each
half is about the size of H6a. With A, each PR has at most one migration.

**O50 — Is the active household per person or per device?** (needed before L.1)

- **A. Per person (Recommended).** When you switch on your phone, your laptop follows: its
  next request reloads it into the same household, with a short message.
- B. Per device. The phone can stay in household A while the laptop is in B. Two tabs in the
  same browser still share one household.

Reason: A uses the column that exists, and the saved offline copy on a device never holds two
households. B needs the server to act in the household each device names, a second rule for
which household a request uses, and more tests. B is better only if one person often works
in two households at the same time on two devices.

**O51 — What does a tab show when it is refused because the household changed?** (needed
before L.3)

- **A. It reloads into the household you are in now and shows, once (Recommended):**
  "You are now in {household}. Your last change was not saved, because this page still showed
  {old household}." / 「你目前在 {household}。這個頁面還停留在 {old household}，所以剛才的變更沒有儲存。」
- B. It reloads with no message.
- C. It does not reload. It shows the message with a **Reload** button, and the person reloads.

Reason: the person must know their change was not saved, or they will think it was. A reload
at once stops a second write from the same old screen. If the old household's name is no
longer known (the person left it), the message drops the second sentence's name: "…because
this page showed another household."

**O52 — Which sort does everyone start with?** (needed before M.3)

- **A. Custom (Recommended).** Everyone sees today's order until they choose another sort.
- B. Name.

Reason: with A nothing changes on the day of the release. Each person's choice is stored, so
the default matters only until they choose.

**O53 — Does the location switcher use the chosen sort?** (needed before M.4)

- **A. Yes, the same sort as Settings › Locations (Recommended).** One setting.
- B. The switcher always uses the custom order; the sort applies to the settings list only.

Reason: the design says the switcher shows locations "in their own order". With A, "last
visited" moves the location you just picked to the top of the switcher, which some people
like and some do not. Choose B if a switcher that moves would annoy you.

**O54 — Do the sorts come to local mode (no sign-in)?** (needed before M.4)

- **A. No (Recommended).** Local mode keeps today's drag order. Nothing in the local database
  changes.
- B. Name and custom only, with the choice saved on the device.
- C. All four. The local database needs a new version for "last updated" and "last visited".

Reason: local mode has one person, so the order is already personal. The design lists local
mode as "not present" for everything households adds. B is small if you want it.

**O55 — When does a location count as "visited"?** (needed before M.2 and M.4)

- **A. When it becomes the active location (Recommended)**: picked in the switcher, opened
  from a link, or picked by the app because the old one is gone. At most once a minute per
  location.
- B. Only when the person picks it in the switcher.

Reason: A matches "where was I last". B ignores the app's own choice after a delete or a
switch of household, which the person did not make.
