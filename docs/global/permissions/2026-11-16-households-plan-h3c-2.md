# Plan — households H3c-2, live updates for stock, logs, locations and the catalog

Design: [2026-11-16-households-h3c-design.md](2026-11-16-households-h3c-design.md) (its *Result*
section records how H3c-1 was built).
Brainstorming: [2026-11-16-brainstorming-households-h3c.md](2026-11-16-brainstorming-households-h3c.md).
H3c-1 plan, with its *What this plan got wrong* table:
[2026-11-16-households-plan-h3c-1.md](2026-11-16-households-plan-h3c-1.md). Read that table first.
Branch `feature/households-h3c-2`, worktree `.worktrees/feature-households`, from `develop` at
`951f7a76` (after #379). The PR goes into `develop`.

**Goal:** every write another member can see sends a live event. At the end the guard test's
`waitingForH3c2` list is empty, and a change to stock, logs, locations or the catalog shows in
another open tab without a reload.

**Execution:** `superpowers:subagent-driven-development`. One fresh subagent per task, a review
between tasks, the full gate after each task (root `CLAUDE.md`, *Verification Gate*), and
`pnpm test:e2e:all` once at the end. Every brief passes down the plain-English rule and the
report structure, and asks what this plan got wrong.

## What the user gets

Once merged **and deployed** (with `VITE_GRAPHQL_WS_URL` set, see the H3c-1 runbook):

- The pantry, item pages, logs, the location switcher, settings lists (tags, vendors, recipes,
  shelves) and the household name update by themselves when another tab or device changes
  them.
- A checkout or a cooked recipe updates the pantry quantities in other tabs, not only the cart.
- Deleting an item, a location or all data removes the matching rows in other tabs too.

Until H5 (invites), this shows only between one person's own tabs and devices.

## What the developer gets

- **The guard test becomes complete.** Every `Mutation` field is in `publishes` or
  `publishesNothing`. `waitingForH3c2` is deleted, so a new mutation must pick one of two.
- **One map on the web** (`QUERIES_BY_KIND`) for all five kinds, typed by the enum.
- **Costs:**
  - About 50 more `publishChange` calls, each with a per-mutation test.
  - More refetches: every catalog change refetches the catalog queries in every open tab of
    the household. Only active queries are refetched, and the 300 ms batch merges a burst.
  - The `cloud` E2E project grows by the new live specs.

## Facts this plan is built on (checked 2026-11-16 at `951f7a76`)

| Fact | Where |
|---|---|
| `enum ChangeKind { CART }`; `ChangeEvent { kind, locationId }` | `apps/server/src/schema/live.graphql` |
| Server event type `ChangeEvent = { kind: 'CART'; householdId; locationId: string \| null; sourceClientId? }` | `apps/server/src/lib/liveEvents.ts` |
| `publishChange(ctx, kind, locations)`: one kind per call, one event per location, the location's household, never throws | `apps/server/src/lib/publishChange.ts` |
| `shouldDeliver`: `locationId` set → `requireLocationRole(viewer)`; `null` → `requireHouseholdRole(event.householdId, 'member')` | `apps/server/src/resolvers/live.resolver.ts` |
| Guard test: 62 fields; `publishes` 11, `publishesNothing` 0, `waitingForH3c2` 51 | `apps/server/src/resolvers/live-publish.guard.test.ts` |
| Per-mutation test pattern: a recording listener on `liveEvents`, a fixture with a user in two households, a transaction-depth counter | `apps/server/src/resolvers/cart-live-publish.resolver.test.ts` |
| `QUERIES_BY_KIND: Record<ChangeKind, readonly string[]>`, `CART` only; an unknown kind refetches all active queries | `apps/web/src/apollo/liveUpdates.ts` |
| `PantryData` selects `items { name … }` AND `itemStocks(locationId)` | `apps/web/src/apollo/operations/itemStocks.graphql` |
| `vendorCart` is a QUERY that creates a missing cart | `apps/server/src/resolvers/cart.resolver.ts:180` |
| `clearAllData` clears the caller's household, owner only | `apps/server/src/resolvers/import.resolver.ts:2156` |
| Web query names: `PantryData`, `ItemStocksForItem`, `AllItemStocks`; `ItemLogs`, `InventoryLogCountByItem`, `LastPurchaseDates`, `InventoryLogs`; `GetLocations`; `GetItem`, `GetItems`, `ItemCountByTag`, `ItemCountByVendor`, `ItemCountByRecipe`, `GetRecipes`, `GetRecipe`, `GetShelves`, `GetShelf`, `GetTagTypes`, `GetTags`, `GetTagsByType`, `TagCountByType`, `GetVendors`, `GetHousehold`; carts as in H3c-1 | `apps/web/src/apollo/operations/*.graphql` |

## Decisions made in this plan

- **Q1 — events stay honest: a mutation publishes every kind it changed.** The web map stays
  one kind → its own queries. A delete that cascades into carts publishes `CART` too, for each
  location where cart rows went. The alternative, mapping `CATALOG` to the cart queries on
  the web, would refetch carts on every item rename, and hides what really changed.
- **Q2 — `LOCATION` and `CATALOG` events are household-level (`locationId: null`).** The role
  check is household membership. Reason: a deleted location cannot pass
  `requireLocationRole`, so a location-level `LOCATION` event about a delete would never be
  delivered. The location list is a household-level screen anyway (it is filtered by role when
  refetched).
- **Q3 — `LOCATION` refetches every active query.** A location change touches the switcher, the
  pantry, carts and stock pages, and it is rare. In `QUERIES_BY_KIND` it maps to `'all'` (the
  map's value type widens to `readonly string[] | 'all'`).
- **Q4 — a location deleted with its rows sends no `CART`/`STOCK`/`LOG` event for that
  location.** They would be refused by the role check. The `LOCATION` event (refetch all)
  covers them.
- **Q5 — `publishChange` takes several kinds** (`kinds: Kind[]`) and publishes one event per
  (kind, location). A household-level helper, `publishHouseholdChange(ctx, kinds, householdId)`,
  publishes with `locationId: null`. Both keep the H3c-1 rules: after commit, never throw,
  `sourceClientId: ctx.clientId`.
- **Q6 — the `CATALOG` map includes `PantryData`, and any other query that selects catalog
  fields.** Task D.1 reads every web document and lists which kinds each query depends on; the
  map is built from that list, not from file names. Example: if `CartItems` selects item
  names, `CATALOG` must refetch it too.
- **Q7 — `vendorCart` publishes nothing.** It creates an EMPTY cart, so no other screen shows
  different content. Recorded in the guard test file under a short "queries that write" note,
  because the guard reads only `Mutation` fields. D.4 confirms the cart is empty when created;
  if not, it publishes `CART`.
- **Q8 — imports.** Each bulk mutation publishes once per (kind, location) for the rows it
  wrote, in `finally`, as the H3c-1 cart imports do (they are not one transaction).

### Expected kinds per mutation

D.2–D.4 check each row against the resolver and correct this table if the code says
otherwise.

| Mutation | Kinds |
|---|---|
| `checkout` | `CART`, `STOCK`, `LOG` at the cart's location |
| `consumeRecipes` | `STOCK`, `LOG` at the location; `CATALOG` (recipe `lastCookedAt`) |
| `addInventoryLog` | `LOG` (and `STOCK` if it changes quantities: check) |
| `addItemToLocation`, `upsertItemStock` | `STOCK` |
| `applyUnitSwitch` | `STOCK`, `LOG`, and `CATALOG` if it changes the item's units |
| `removeItemFromLocation` | `STOCK`, `LOG` (if it deletes logs), `CART` at that location |
| `bulkCreate`/`bulkUpsert` `ItemStocks` / `InventoryLogs` | `STOCK` / `LOG` per location |
| `createLocation`, `updateLocation`, `reorderLocations`, `bulkCreate`/`bulkUpsert` `Locations` | `LOCATION` |
| `deleteLocation` | `LOCATION` |
| `clearAllData` | `LOCATION` and `CATALOG` |
| `deleteItem` | `CATALOG`; `CART`, `STOCK`, `LOG` at each location where it deleted rows |
| `createVendor` | `CATALOG`; `CART` at the location of the cart it made |
| `deleteVendor` | `CART` (as now) and `CATALOG` |
| `renameHousehold` | `CATALOG` |
| every other catalog mutation (items, tags, tag types, vendors, recipes, shelves, their imports) | `CATALOG` |

## Task D.1 — the new kinds, end to end, with the web map

**Files:** `live.graphql`; `liveEvents.ts`; `publishChange.ts` (+ test); `live.resolver.ts`
(+ test, only if needed); `apps/web/src/apollo/liveUpdates.ts` (+ test); codegen output.

1. `enum ChangeKind { CART STOCK LOG LOCATION CATALOG }`; the server `ChangeEvent['kind']`
   union to match. **The schema change and the web map go in one commit**: the map is
   `Record<ChangeKind, …>`, so `tsc` fails between them, and codegen is all-or-nothing.
2. `publishChange(ctx, kinds, locations)` (Q5) and `publishHouseholdChange(ctx, kinds,
   householdId)`. Update the 11 H3c-1 call sites to the new signature. Tests: one event per
   (kind, location); no duplicates; never throws; household-level events carry
   `locationId: null`.
3. `shouldDeliver`: check that household-level events of any kind go through the membership
   branch. Add a test for a `LOCATION` event about a deleted location (it must still be
   delivered to members) and for a non-member (refused).
4. Web: read every document in `apps/web/src/apollo/operations/` and write a table (in the
   test file or a comment) of which kinds each query depends on (Q6). Build
   `QUERIES_BY_KIND` from it. `LOCATION` → `'all'` (Q3). The existing test "every name is a
   real operation" covers the new names.
5. Tests: each kind's map; a batch of `STOCK` + `CATALOG` refetches the union; `LOCATION` in a
   batch refetches everything.
6. Mutation checks: drop `PantryData` from `CATALOG` → a test red; make household-level events
   use `requireLocationRole` → the deleted-location test red.

## Task D.2 — stock and logs

**Files:** `itemStock.resolver.ts`, `inventoryLog.resolver.ts`, `recipe.resolver.ts`
(`consumeRecipes`), `cart.resolver.ts` (`checkout`), `import.resolver.ts` (stock and log
imports); a new `stock-live-publish.resolver.test.ts`; the guard test.

1. Publish as in the table: `checkout` adds `STOCK` and `LOG`; `consumeRecipes`,
   `addInventoryLog`, `addItemToLocation`, `upsertItemStock`, `applyUnitSwitch`,
   `removeItemFromLocation`, `bulkCreate`/`bulkUpsert` `ItemStocks` and `InventoryLogs`.
2. Move each from `waitingForH3c2` to `publishes`, with all its kinds.
3. Per-mutation tests, as in H3c-1: exactly the expected events, the right `locationId` and
   household (two-household fixture), nothing on a refusal or a rollback, after commit.
4. Mutation checks: remove `STOCK` from `checkout` → red; publish `consumeRecipes` inside its
   transaction → red; give a stock import's event the caller's household → red.

## Task D.3 — locations and clear-all

**Files:** `location.resolver.ts`, `import.resolver.ts` (`clearAllData`, location imports);
`location-live-publish.resolver.test.ts`; the guard test.

1. `LOCATION` (household-level) from `createLocation`, `updateLocation`, `reorderLocations`,
   `deleteLocation`, the two location imports; `clearAllData` → `LOCATION` and `CATALOG`.
2. Tests as in D.2, plus: a member with no role at the deleted location still gets the
   `LOCATION` event; a user of another household does not.
3. Mutation checks: publish `deleteLocation` before its transaction commits → red; publish its
   event with the deleted `locationId` instead of `null` → the delivery test red.

## Task D.4 — the catalog

**Files:** `item.resolver.ts`, `tag.resolver.ts`, `vendor.resolver.ts`, `recipe.resolver.ts`,
`shelf.resolver.ts`, `household.resolver.ts`, `import.resolver.ts` (catalog imports);
`catalog-live-publish.resolver.test.ts`; the guard test.

1. `CATALOG` from every catalog mutation in the table; `deleteItem` and `createVendor` also
   publish their cart (and stock and log) kinds at the right locations; `deleteVendor` adds
   `CATALOG`; `renameHousehold`.
2. `vendorCart` (Q7): confirm the created cart is empty; record the decision in the guard
   test file.
3. **Delete `waitingForH3c2`** from the guard test. The rule becomes "every field is in
   `publishes` or `publishesNothing`". Update its comment and the `guardProblems` tests.
4. Tests as in D.2. A table-driven test is fine for the ~35 plain `CATALOG` mutations, if each
   row really calls the resolver and checks the event.
5. Mutation checks: remove `publishChange` from `updateTag` → red; drop `CART` from
   `deleteItem` → red; put a field back in no list → the guard red.

## Task D.5 — E2E

**Files:** a new `e2e/tests/live-pantry.spec.ts` (or one spec per area, the task decides);
`e2e/playwright.config.ts` (`cloud` `testMatch`, `local` `testIgnore`).

Reuse the `live-cart.spec.ts` helpers (warm-up that waits for its own refetch,
`routeWebSocket` message counts). Consider moving them to `e2e/helpers/` first.

1. **Stock:** the browser shows the pantry; another member changes a quantity through
   `makeGql`; the pantry shows the new number with no reload.
2. **Catalog:** another member renames an item; the pantry (or item page) shows the new name.
3. **Location:** another member creates a location; the location switcher shows it.
4. **Checkout:** another member checks out a cart; the browser's pantry quantity changes.
5. Mutation checks: remove `STOCK` from `upsertItemStock` → test 1 red; remove `PantryData`
   from `CATALOG` in the web map → test 2 red.
6. Run the new spec alone several times, then the whole `cloud` project.

## Task D.6 — docs, runbook and the final gate

1. The H3c-1 runbook: add a short H3c-2 section (no migration, no new setting; the smoke test
   adds a pantry change), or a new runbook file if the task finds a reason.
2. Root `CLAUDE.md` *Live updates* section: five kinds, Q2/Q3, the guard test's two lists,
   updated counts.
3. The design's *Result* section gets an H3c-2 part; this plan's *As built* notes, *What this
   plan got wrong* and *Status*; `docs/INDEX.md`; the households plan's H3 table.
4. The full gate, then `pnpm test:e2e:all`.

## Status

Not started.
