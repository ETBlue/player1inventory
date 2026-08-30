# Cloud Locations — PR 2 implementation plan

**Design:** `docs/features/locations/2026-08-30-cloud-locations-design.md` (§2, §3, §7, §8)
**Branch:** `feature/cloud-locations-pr2`
**Base:** `3143dbc3` (PR 1 merge)
**Status:** 🔲 Pending

PR 2 of five. PR 1 shipped the whole server surface this PR consumes — `Location`
and `ItemStock` tables, `requireLocationRole`, and the resolvers behind
`apps/server/src/schema/location.graphql` and `itemStock.graphql`. Nothing in this
plan requires a new Prisma migration.

---

## Goal

Switch the web client's cloud path onto `Location` + `ItemStock`, so cloud mode
behaves exactly as local mode does: a location switcher backed by real cloud
locations, a pantry scoped to the active location, and a search tail that
distinguishes "stocked here" from "exists globally".

## Non-goals

- Location-scoped **carts** and **inventory logs** — PR 3.
- `Cart.locationId`, the `'no-vendor'` split, composite cart ids — PR 3.
- Import / export / post-login migration / purge — PR 4.
- Dropping `Item`'s five state columns — PR 5.
- Location RBAC. `requireLocationRole` already isolates it; nothing here compares `userId`.

---

## The write-path decision (settled before planning)

The design's §8 split has a gap. PR 2 moves cloud **reads** onto `ItemStock`, but
three resolvers still write quantities to `Item`'s columns:

| Resolver | Site | Write |
|---|---|---|
| `checkout` | `apps/server/src/resolvers/cart.resolver.ts:86` | `item.update({ packedQuantity: { increment } })` |
| `consumeRecipes` | `apps/server/src/resolvers/recipe.resolver.ts:73` | `item.updateMany({ packedQuantity, unpackedQuantity })` |
| `updateItem` | `apps/server/src/resolvers/item.resolver.ts:149` | `item.update({ ...input })` |

Left alone, cloud checkout, cooking and the quantity buttons would write where
nothing reads — visibly broken on `main` between PR 2 and PR 3.

**Decision (2026-08-30, ETBlue): dual-write until PR 5.** Those three resolvers
write **both** `Item`'s columns and the corresponding `ItemStock` row. This
preserves the rollout's stated invariant — a browser on a stale bundle keeps
working through every intermediate PR — at the cost of three small server changes
and a teardown in PR 5.

**Which location do the server-side writers target?** `checkout` and
`consumeRecipes` have no location in PR 2: `Cart.locationId` does not exist until
PR 3. In this PR they write the caller's **default** location's stock
(`Location.isDefault`), and gain real scoping in PR 3. `updateItem` is different —
its caller is the client, which knows the active location, so the client sends
stock fields to `upsertItemStock(itemId, locationId)` directly (Task 9) and
`updateItem`'s dual-write covers only the legacy inline-stock path.

> **PR 5 must delete all three dual-writes.** Recorded in §8 of the design as part
> of PR 5's contract step, not left implicit here.

---

## Scope discovered during planning (not spelled out in §8's PR 2 row)

Four items the design implies but does not enumerate. Each is required for the PR
to be coherent, and each is called out so it is not mistaken for scope creep.

1. **`useLocations` is local-only today.** `apps/web/src/hooks/useLocations.ts:11-18`
   says so explicitly and carries a `CLOUD TODO`. Consequence: **in cloud mode
   today, Settings › Locations reads and writes local IndexedDB**, and the
   `LocationSwitcher` lists local locations. §3's resolution ("once `locations` has
   loaded…") cannot work until this hook is mode-branched. Task 5.
2. **Both Apollo clients need the cache policy.** `apollo/client.ts` builds
   `new InMemoryCache()` twice — once in `createApolloClient`, once in
   `createApolloClientForE2E` — with no type policies at all. A `keyArgs` added to
   only one leaves **cloud E2E exercising a different cache than production**. Task 4.
3. **No GraphQL fragments exist in this repo.** Every operation in
   `apps/web/src/apollo/operations/*.graphql` spells its fields out inline, so the
   design's `...ItemFields` / `...StockFields` snippet is illustrative. Task 3
   writes fields inline, matching the existing convention.
4. **`DEFAULT_LOCATION_ID` has more call sites than §3 lists.** Beyond the four in
   §3, `LocationList.tsx:197` derives the undeletable badge from
   `location.id === DEFAULT_LOCATION_ID`, and `usePostLoginMigration.ts:41` compares
   against it. The first is Task 1; the second is PR 4's and is left alone
   deliberately — noted so a reader does not think it was missed.

---

## Tasks

Each task is independently green: lint, build, both test suites, and Storybook
pass at the end of every one. Each names its mutation checks — a green test that
survives the deletion of the behaviour it nominally covers is a no-test that
reports as covered (root `CLAUDE.md`).

### Task 1 — `isDefault` on `Location`, and Dexie v18

Retires the sentinel's *undeletable-marker* job (§3 item 3) in local mode.

- `packages/types/src/index.ts` — add `isDefault: boolean` to `Location`.
- `apps/web/src/db/index.ts`:
  - `db.version(18)` restating v17's `.stores()` **unchanged** (`isDefault` is not
    indexed — the same shape v7, v11 and v17 use), with an `.upgrade()` that sets
    `isDefault: location.id === DEFAULT_LOCATION_ID` on every row.
  - `ensureDefaultLocation` writes `isDefault: true`. **Fresh databases never run
    upgrade functions** (`apps/web/src/db/CLAUDE.md`), so the `on('populate')` path
    must seed the flag too — it already routes through this function, which is why
    the fix belongs here rather than in the hook.
- `apps/web/src/db/operations.ts:1270` — `deleteLocation`'s guard becomes
  `if (location.isDefault) throw`.
- `apps/web/src/components/location/LocationList/LocationList.tsx:197` —
  `isDefault={location.isDefault}`.
- `apps/web/src/lib/importData.ts` — a restored backup may carry pre-v18 locations
  with no `isDefault`; confirm `ensureDefaultLocationRow()` (called at
  `importData.ts:1108`) leaves exactly one row flagged, and that a payload
  containing a *non-default* location does not arrive flagged.

**Tests:** `apps/web/src/db/upgradeV18.test.ts`, mirroring `upgradeV17.test.ts`.
Fixture has **three** locations — the default plus two others — so "flag the
default" is distinguishable from "flag everything".

**Mutation checks:**
- Change the upgrade to `isDefault: true` unconditionally → the "only one row is
  flagged" assertion must go RED.
- Delete `isDefault: true` from `ensureDefaultLocation` → the fresh-DB
  (`on('populate')`) test must go RED. This is the assertion that catches the
  fresh-DB trap; if it stays green the fixture is opening an already-upgraded DB.
- Revert `deleteLocation`'s guard to the id comparison → must stay green **by
  design** (both are true for the local default). Record this as a **negative
  control, not coverage** — the guard's real change is proven in Task 5, where a
  cloud default has an id that is not `'local'`.

### Task 2 — extract `joinItemStock` / `stripStockFields` to `lib/itemStock.ts`

A pure move, so that cloud calls the *same* function local does rather than a
parallel implementation (§2).

- New `apps/web/src/lib/itemStock.ts` holding `ZERO_STOCK`, `STOCK_FIELD_KEYS`,
  `pickStockFields`, `stripStockFields`, `joinItemStock` — verbatim, comments
  included, from `db/operations.ts:30-97`.
- `db/operations.ts` re-exports both public functions, so no local call site
  changes. `routes/items/$id/stock.tsx:21` keeps importing from `@/db/operations`.

**Proof this task changed nothing:** the existing `operations.test.ts` cases for
these functions pass **unmodified**. If a test needs editing, the move was not pure.
No new behaviour, so no mutation check applies — say that rather than inventing one.

### Task 3 — GraphQL documents and codegen

- `apps/web/src/apollo/operations/locations.graphql` — `GetLocations`,
  `CreateLocation`, `UpdateLocation`, `DeleteLocation`, `ReorderLocations`.
  Every selection includes `isDefault`.
- `apps/web/src/apollo/operations/itemStocks.graphql`:

```graphql
query PantryData($locationId: ID!) {
  items { id name ... }               # fields inline, per repo convention
  itemStocks(locationId: $locationId) {
    id itemId locationId
    targetQuantity refillThreshold packedQuantity unpackedQuantity
    dueDate createdAt updatedAt
  }
}
```

  plus `ItemStocksForItem($itemId: ID!)`, `UpsertItemStock`, `AddItemToLocation`,
  `RemoveItemFromLocation`.

- Run `pnpm codegen` from the repo root and commit `apps/web/src/generated/graphql.ts`.

**One operation, not two round trips** — `PantryData` asks for both root fields so
the pantry issues a single request (§2).

**Date fields arrive as ISO strings.** PR 1's `toGraphQL` mappers guarantee this;
the client still parses them through `lib/deserialization.ts`'s `parseWireDate`
rather than `new Date(raw)`, which is what issue #263 was about.

### Task 4 — Apollo cache: `keyArgs: ['locationId']`

- `apps/web/src/apollo/client.ts` — extract a single `createCache()` and use it in
  **both** `createApolloClient` and `createApolloClientForE2E`:

```ts
function createCache() {
  return new InMemoryCache({
    typePolicies: {
      Query: { fields: { itemStocks: { keyArgs: ['locationId'] } } },
    },
  })
}
```

`ItemStock` normalizes by `id` on its own; the root **field** is what needs keying.
Without it, switching locations overwrites the cached list and the pantry renders
the previous location's stock (§2).

**Test:** two locations with disjoint stock. Query location A, then B, then read A
from the cache — A's rows must come back, not B's.

**Mutation check:** delete `keyArgs` → the test must go RED. This one is
non-negotiable: it is the only evidence the policy does anything.

### Task 5 — `useLocations` gains a cloud branch

- `apps/web/src/hooks/useLocations.ts` — branch on `useDataMode()`, mirroring
  `useShelves`. Cloud reads `GetLocations`; create / update / delete / reorder call
  the cloud mutations. Delete the `CLOUD TODO` comment block at lines 11–18.
- A `deserializeLocation` in `lib/deserialization.ts`, using `parseWireDate`.

**Tests:** cloud mode lists cloud locations and **not** local Dexie ones — the
fixture seeds *different* names in each store, so a hook that ignored the mode
would fail rather than coincidentally match.

**Mutation checks:**
- Force the hook to the local branch in cloud mode → the "lists cloud locations"
  test must go RED.
- Delete `isDefault` from the `GetLocations` selection set → the cloud
  delete-guard test must go RED (this is where Task 1's negative control is
  finally discharged: a cloud default's id is a cuid, not `'local'`).

### Task 6 — `useActiveLocation`: per-mode key, and delete the validity shortcut

**The sharpest edge in the feature.** `useActiveLocation.tsx:62` returns early when
the active id equals `DEFAULT_LOCATION_ID`, *before* checking it against the loaded
list. In cloud that makes `'local'` permanently valid: never corrected, and every
location-scoped query returns empty — a silently empty pantry, not a cosmetic
fallback.

- Storage key becomes per-mode: `active-location-id:local` / `active-location-id:cloud`.
  The bare `active-location-id` key is read once and migrated into the **local**
  slot, so existing users are not reset.
- The stored id is re-read when the mode changes, not only on mount.
- **Delete line 62 entirely.** No id is special-cased as always-valid.
- The fallback target becomes the `isDefault` location, not the literal:
  `locations.find((l) => l.isDefault)?.id ?? locations[0]?.id`. Line 65's
  `setActiveLocationId(DEFAULT_LOCATION_ID)` changes with it.
- `FALLBACK_ACTIVE_LOCATION` (line 119) keeps `DEFAULT_LOCATION_ID` — it is the
  provider-less story/unit-render default and has no list to consult. Its comment
  is updated to say that, so a reader does not think it was missed.

**Tests:**
- Cloud, stored id `'local'`, locations loaded → active id is corrected to the
  cloud default. **This is the test the whole task exists for.**
- Switching local → cloud → local restores each mode's own last location.
- An existing user with the bare key keeps their location after upgrade.
- A deleted location falls back to the `isDefault` one.

**Mutation checks:**
- Restore line 62 → the cloud-`'local'` correction test must go RED.
- Revert to a single shared storage key → the mode-switch test must go RED.
- Change the fallback back to `DEFAULT_LOCATION_ID` → the deleted-location test
  must go RED **in cloud** (in local it will not — the local default's id *is*
  `'local'`; the fixture must be a cloud one for this check to mean anything).

### Task 7 — `PantryData` wiring

- `useItems()` — cloud runs `PantryData({ locationId: activeLocationId })` and maps
  `items` through `joinItemStock(item, stockByItemId.get(item.id), activeLocationId)`.
  An item with no row gets `stockId: undefined`, exactly as local.
- `useStockedItems()` — derives from the **same** query result: the items having a
  row in `itemStocks`. No second request (§2).
- `useItem(id)` — the detail page needs the active location's stock for one item.

**Tests:** every one uses **two** locations, with a fixture stocked only at the
*other* location. With one location, "count items stocked here" and "count all
items" return the same number — the canonical vacuous fixture here (§7).

**Mutation checks:**
- Drop the `locationId` variable so the query always asks for the default → the
  two-location test must go RED.
- Make `useStockedItems` return all items → its test must go RED. If it stays
  green, the fixture has no item that is unstocked here, and it must be fixed.

### Task 8 — delete every `isCloud` stock bypass

Each deletion gets a cloud test that **would have failed while the bypass
existed** — otherwise "the bypasses are gone" is an unverified claim (§7).

| Site | Today | After |
|---|---|---|
| `hooks/useShowStock.ts:30` | `isCloud \|\| isStockedHere(item)` | `isStockedHere(item)` — the hook loses its mode dependency entirely |
| `hooks/useItemSearchTail.ts:76` | `if (isCloud) { … }` — the block commented **"THE ONE CLOUD BYPASS … DELETE THIS BRANCH"** | deleted; the split below is already correct for both modes |
| `hooks/useItemSearchTailWiring.tsx:115` | `canAddToLocation = !isCloud && !!activeLocation` | `canAddToLocation = !!activeLocation` |
| `hooks/useItems.ts:338,387,492` | `if (mode !== 'local') throw new Error(LOCAL_ONLY_LOCATION_MUTATION)` | cloud calls `addItemToLocation` / `removeItemFromLocation`; the constant is deleted |
| `routes/items/$id/stock.tsx:430` | `CloudStockTab` placeholder | a real all-locations pager over `itemStocksForItem` |

The comment blocks explaining each bypass go with them. Several assert *why* cloud
behaves differently; leaving them would make the file lie about itself.

**Mutation checks:**
- Restore the `isCloud ||` in `useShowStock` → the cloud test asserting an
  unstocked item's zeros are **not** rendered as real stock must go RED.
- Restore `useItemSearchTail`'s branch → the cloud test asserting a
  not-stocked-here match lands in bucket 3 must go RED.
- Restore the `LOCAL_ONLY_LOCATION_MUTATION` throw → the cloud add-to-location
  test must go RED.

### Task 9 — writes: `upsertItemStock` from the client, dual-write on the server

**Client:**
- `useUpdateItem` in cloud splits its input: configuration fields → `updateItem`,
  the five stock fields → `upsertItemStock(itemId, activeLocationId, …)`. The
  Stock-tab pager passes the location on the page being viewed, as local already does.
- `useCreateItem` in cloud creates the item, then stocks it in the active location —
  unless `catalogOnly`, which now means something in cloud too (its doc comment
  currently ends "No-op in cloud mode, which has no `ItemStock` backend" — that
  sentence is deleted).

**Server (the dual-write decided above):**
- `cart.resolver.ts` `checkout` — also increments the default location's `ItemStock`.
- `recipe.resolver.ts` `consumeRecipes` — also sets it.
- `item.resolver.ts` `updateItem` — also mirrors any inline stock fields it receives.
- Each gets a comment naming **PR 5** as the removal point.

**Server test discipline** (`apps/server` has hit both of these):
- The Prisma fake must enforce `@@unique([itemId, locationId])` by actually
  throwing `P2002` — otherwise `upsertItemStock`'s idempotency is unpinned.
- The fake's `findFirst` must model Prisma's own semantics
  (`where.x === undefined || row.x === where.x`), never a hardcoded ownership
  match, or dropping a scope from a resolver leaves the guard green.

**Mutation checks:**
- Delete the `ItemStock` half of `checkout`'s dual-write → the new server test must
  go RED while the *existing* checkout tests stay green (proving the old path is
  genuinely still intact, which is the whole point of dual-writing).
- Delete the `Item` half → the existing checkout tests must go RED. Both halves
  need their own failing test or the dual-write is only half-covered.
- Point the client's `upsertItemStock` at a hardcoded default location → Task 7's
  two-location test must go RED.

> **Observed while planning, not fixed here:** `cart.resolver.ts:86` calls
> `prisma.item.update({ where: { id: ci.itemId } })` with no `userId` in the where
> clause. The `cartItem` it comes from *is* scoped to the caller, so this is not a
> demonstrated vector — but the item scope is inherited rather than asserted. Out
> of scope for PR 2; worth a look when PR 3 rewrites this resolver.

### Task 10 — documentation and the verification gate

- `apps/web/src/db/CLAUDE.md` — the v18 migration.
- `apps/web/src/hooks/CLAUDE.md` — `useLocations` is no longer local-only;
  `useShowStock` no longer takes a mode.
- `apps/web/src/routes/CLAUDE.md`, `routes/items/CLAUDE.md`,
  `routes/settings/locations/CLAUDE.md` — cloud parity.
- Root `CLAUDE.md` — only if a pattern changed.
- `docs/INDEX.md` — status.
- The design doc's §8 PR 5 row gains the dual-write teardown.

---

## Verification

Run from the repo root after **every** task, each with an explicit path (do not
rely on `cd` persisting between Bash calls):

```bash
(cd apps/web && pnpm lint)
pnpm build 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports" || echo "OK"
pnpm test          # BOTH suites — web + server
```

`pnpm test` at the **root**, never `(cd apps/web && …)`: Task 9 changes three
server resolvers, and a web-only run cannot fail on a broken one. The root
`pnpm build` is likewise the full build — it runs `pnpm codegen` (catching drift
from Task 3) and type-checks both apps.

**Final task only:**

```bash
pnpm test:e2e --grep "items|shopping|cooking|settings|shelves|vendors-group|recipes-group|a11y"
```

`shelves|vendors-group|recipes-group` are mandatory — all three cover the pantry
page and none of their filenames contains a route name. `a11y` always.

Only one E2E suite can run per machine (`e2e/CLAUDE.md`), and never concurrently
with `pnpm build` or `pnpm test` — a starved machine produces disjoint failure sets
that look like code regressions.

### Standing rules for this PR

- **Every location test needs two locations**, with a fixture stocked only at the
  *other* one. One location makes "stocked here" and "exists" indistinguishable.
- **Report which mutations ran and that each went red.** "I added tests" and "I
  verified these tests fail without the behaviour" are different claims.
- **Negative controls stay green and are named as such** — Task 1's `deleteLocation`
  check is one. They are not coverage.
- **Explanatory comments are claims.** This PR deletes several that assert why cloud
  differs; any comment written to replace them gets verified against the code first.
