# Cloud Locations — PR 2 implementation plan

**Design:** `docs/features/locations/2026-08-30-cloud-locations-design.md` (§2, §3, §7, §8)
**Branch:** `feature/cloud-locations-pr2`
**Base:** `3143dbc3` (PR 1 merge)
**Status:** ✅ Implemented (Tasks 1–10, plus the unplanned 6b, 6c and 9b)

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
write **both** `Item`'s columns and the corresponding `ItemStock` row, and a
fourth site — the reverse mirror in `upsertItemStock` — was added during Task 9b
once the client stopped sending stock to `updateItem` at all.

### What "a stale bundle keeps working" actually means (corrected during implementation)

§8 of the design states the invariant unconditionally, and **that is wrong**. State
it precisely, because the unqualified version invites someone to assume a guarantee
the code does not provide:

| Case | Preserved for a stale bundle? |
|---|---|
| A stock **value** edit at the **default** location (quantity buttons, Stock tab on the default page, checkout, cooking) | **Yes** — `mirrorItemStockToItem` writes `Item`'s five columns |
| A stock **value** edit at a **non-default** location | **No, by design.** `Item` has one set of columns and no location concept; there is no correct single value to write. Mirroring one would let a Garage edit corrupt what the stale bundle reports for the Kitchen |
| **Membership** changes — `addItemToLocation` / `removeItemFromLocation` | **No, deliberately.** These mutate *which locations an item is stocked in*, which `Item`'s columns cannot express at all. Any mirror would invent a value rather than reflect one |
| **Atomicity** of the mirror | **No.** The mirror is a second Prisma statement, not part of a `$transaction`. `ItemStock` can be written and the `Item` mirror fail; `ItemStock` is the source of truth from PR 2 on, so the divergence is in the stale bundle's favour, but it is a real window and is accepted for the three PRs the bridge lives |

The invariant that *is* held: **a stale bundle keeps working for the single-location
user editing their default location's stock** — which, per the production rehearsal
in the design's §7, is every current production account (one user, one location).

The cost is four small server changes and a teardown in PR 5.

**Which location do the server-side writers target?** `checkout` and
`consumeRecipes` have no location in PR 2: `Cart.locationId` does not exist until
PR 3. In this PR they write the caller's **default** location's stock
(`Location.isDefault`), and gain real scoping in PR 3. `updateItem` is different —
its caller is the client, which knows the active location, so the client sends
stock fields to `upsertItemStock(itemId, locationId)` directly (Task 9) and
`updateItem`'s dual-write covers only the legacy inline-stock path.

> **PR 5 must delete all FOUR dual-writes** — the three above plus
> `mirrorItemStockToItem` (Task 9b). The design's §8 carries the full table;
> `grep -rn "REMOVED IN PR 5" apps/server/src` is the checklist.

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

**Test:** two locations with disjoint stock. Query location A, then B, then read A
from the cache — A's rows must come back, not B's. Run it against a cache from
**each** factory, so "the policy reached both clients" is asserted rather than assumed.

> **Corrected after implementation (2026-08-30).** This task was written expecting
> `keyArgs` to be load-bearing, with the mutation check "non-negotiable: it is the
> only evidence the policy does anything." **Measured, that is false.** Apollo
> Client 4 already keys a root field by all of its arguments, so
> `keyArgs: ['locationId']` on a single-argument field is a no-op, and deleting it
> **cannot** turn the test red. Design §2 carries the probe output and is corrected
> there too.
>
> The mutation actually run was `keyArgs: false` — the only configuration that
> produces the collapse the design described. All four tests went red on it, so the
> test is not vacuous. Asserting on Apollo's literal store-key format would also
> have gone red, and was deliberately **not** done: that tests Apollo's internals,
> not this app's behaviour.
>
> **What this task really fixes** is the two separate `new InMemoryCache()` calls —
> a policy added to one would have left cloud E2E on a different cache than
> production. That risk was real and is closed.

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

### Task 6b — every cross-mode data path must target a LOCAL location id (unplanned)

**Not in the original plan; found while implementing Task 6, and a direct consequence
of it.** Once the active-location slot became per-mode, `useActiveLocation().activeLocationId`
is *the current mode's* id and the two id spaces are disjoint. Three sites still fed the
**cloud** cuid into a **local** data operation. They had worked only by accident: before
Task 6 the cloud active id was the literal `'local'`, which is also a valid local location id.

| Site | Was | Symptom |
|---|---|---|
| `DataModeCard`'s cloud→local copy (`doSwitch` / `doSignOut`) | passed the cuid to `importLocalData` as the target location | `ItemStock` rows written under a local location that does not exist — **empty local pantry after the reload** |
| `ImportCard`'s cloud branch | passed the cuid to `resolveFlattenLocationId` | a backup file is always local-shaped, so a cuid matched nothing and **every multi-location backup was refused outright** |
| `usePostLoginMigration` | passed the cuid as `importCloudData`'s `locationId` | flattening by a cuid matches no `ItemStock` row: **every item uploads zeroed, every cart is dropped** — and the one-shot ref blocks any retry |

Two module-level helpers were added to `useActiveLocation.tsx` to serve the two shapes:
- `readStoredLocationId(mode)` — pure localStorage read (legacy-key read-through included),
  for callers that only need an id to **match** a payload;
- `resolveLocalActiveLocationId()` — async; the local slot **validated** against the local
  `locations` table, `isDefault` fallback, for callers that **write** into local Dexie.

### Task 6c — the migration warning must name the LOCAL locations (unplanned)

`PostLoginMigrationDialog` warns, before a local → cloud copy that carries one location's
stock, about the locations left behind — so the locations at risk are the **local** ones.
It read them with `useLocations()`, dual-mode since Task 5, and the active id with
`useActiveLocation()`, per-mode since Task 6. In cloud mode — the only mode this dialog runs
in — both name **cloud** rows. The warning therefore enumerated locations that were never at
risk and could stay silent when a local location really would be left behind, while gating a
destructive one-shot copy on the wrong list.

Fixed by reading local Dexie directly and resolving the local active id through
`resolveLocalActiveLocationId()`. Tests seed the two stores so they **disagree** (two local
vs one cloud, and one local vs two cloud); both go red against the pre-fix component.

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

### Task 9b — `NewItemDialog` stocks existing items in cloud (unplanned)

**A bypass Task 8's sweep missed.** The dialog was create-only in cloud, on two premises
Tasks 7 and 8 falsified: that cloud items carry no `stockId` (the `PantryData` join sets
one) and that `useAddItemToLocation` throws in cloud (it has had a cloud branch since
Task 8). Removed `handleSelectExisting`'s `if (!isLocal) return`, the `isLocal` term in
`isSelectable`, and the `stocked = isLocal ? … : true` render gate — **the component no
longer reads `useDataMode` at all**.

The cloud-only i18n string `items.addDialog.alreadyExists` went with the branch: it existed
because "cloud has no locations", which stopped being true when `useLocations` became
dual-mode, and it would now contradict a selectable row. The location-naming
`alreadyStockedHere` covers both modes.

**Method note worth carrying forward:** this was found by re-reading every remaining
`useDataMode()` call site for a *premise* that PR 2 had falsified, rather than by grepping
for `isCloud` near stock fields — which is what Task 8's table did, and which is why it was
missed. A bypass phrased as `isLocal ? … : true` matches no `isCloud` grep.

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

### Task 10b — the fresh-cloud-session bugs E2E caught (unplanned)

**Two real regressions, found only by running cloud E2E.** Both come from the same window:
on a fresh cloud session there is no `active-location-id:cloud` slot, so `activeLocationId`
is `DEFAULT_LOCATION_ID` — the `'local'` sentinel — until `GetLocations` resolves. Thirteen
cloud specs failed; the whole suite is green afterwards.

**They were invisible to unit tests because of the fixtures.** Every cloud test in
`useItemStockWrites.cloud.test.tsx` seeds `active-location-id:cloud` with a real cuid, which
**pre-resolves the exact thing that breaks** — the canonical weak fixture this repo's rules
describe, in a file whose own header claims "THE FIXTURE IS THE TEST".

**1. Location-scoped WRITES were sent with the sentinel.** A read in that window merely
re-runs with the corrected id; a write is refused by `requireLocationRole` (`FORBIDDEN`) and
lost. Creating an item from the pantry's Add dialog created the `Item`, had its follow-up
`upsertItemStock(locationId: 'local')` rejected, and left the dialog open with the item
stocked nowhere. The provider's correction cannot help: `activeLocationId` is state, and a
handler that already started reads the value from the render it started in. Fixed by a new
`useCloudLocationId()` that resolves the target **at call time** from Apollo (`GetLocations`,
`cache-first` — a hit costs nothing, a miss awaits the in-flight request), used by all four
cloud write paths.

**2. `refetchQueries` by NAME refetched a query the app had declined to make.** With the
write fixed, the create still hung. `PantryData` was gated to skip while the location was
unresolved — but Apollo registers the ObservableQuery anyway, and a **name-based**
`refetchQueries: ['PantryData']` refetches every observer with that name, `skip` included.
That parked observer refetched with `locationId: 'local'`, returned `FORBIDDEN`, and under
`awaitRefetchQueries: true` **rejected the mutation that had already succeeded**. Fixed by
targeting the refetch at the location just written (`stockListRefetches(locationId)`), which
is also strictly more correct — another location's list is unaffected by the write, and
anything unmounted is already covered by the cache eviction. `ItemStocksForItem` stays a
name: its only variable is an item id, which is always valid.

**3. `bulkCreateItems` / `bulkUpsertItems` wrote no `ItemStock`.** The import surface is flat
until PR 4, but the cloud pantry has read `ItemStock` since Task 7 — so a cloud import
completed "successfully" with **every imported item stocked nowhere and invisible**, no error
anywhere. Fixed by the same `mirrorStockToDefaultLocation` bridge the other dual-writes use;
it becomes the fifth entry on PR 5's teardown list (design §8).

**Spec change, not a product change:** `shopping.spec.ts`'s cloud seed built its item with a
raw `createItem` GraphQL call and never stocked it — a back door the app itself never takes,
since `useCreateItem`'s cloud branch always follows the create with an `upsertItemStock`. The
seed now does the same two steps.

**Mutation checks run:**
- Reduce `useCloudLocationId` to `return activeLocationId` → both new
  `a fresh cloud session, before GetLocations has resolved` tests go RED, and the five
  pre-existing tests in that file stay GREEN (proving the fix leaves the already-resolved
  path alone).
- Disable `bulkCreateItems`' mirror → the new import-resolver test goes RED.

---

## Deferred work — recorded here because this is where the next reader will look

Nothing in this section is a defect of PR 2. Each item is either explicitly out of
scope or a pre-existing condition, and each is named so it is not rediscovered as a
surprise.

### Owed by PR 3

1. **`applyUnitSwitch` is missing from the schema.** Design §2 lists it as a
   requirement; PR 1 shipped `itemStock.graphql` without it. `useApplyUnitSwitch`
   therefore still throws in cloud (`LOCAL_ONLY_UNIT_SWITCH`) — **not** for want of an
   `ItemStock` backend but for want of the mutation. Consequence: **a cloud unit switch
   leaves every location's tracked quantities in the OLD unit**, and no test fails on it
   (`buildStockConversions` gates on `isLocal`, so the confirmation dialog never even
   lists conversions the cloud branch could not write). Design §2 carries the same note.

2. **`removeItemFromLocation` has no cloud cascade.** The resolver deletes the
   `ItemStock` row only, because cloud carts and inventory logs gain a `locationId` in
   PR 3. That is why the Stock tab's confirmation line *"Inventory logs: N · Cart
   entries: N"* renders in **local mode only** — printing local numbers beside a cloud
   removal would name rows it will not touch. When the cascade lands, the counts should
   become dual-mode and their queries belong in `useRemoveItemFromLocation`'s cloud
   refetch list.

3. **The `defaultLocationId` call sites.** `checkout`, `consumeRecipes` and
   `mirrorItemStockToItem` all target the caller's default location. This is not merely
   coarse — it is **incoherent for a shared location**: under the location RBAC design a
   `member` has no `isDefault` row for someone else's location, so `defaultLocationId`
   names a location that is not the one being acted on. See the design's new §3
   subsection. PR 3 giving carts and consumption their own `locationId` is what makes
   these paths correct.

3b. **Two `isCloud` partition bypasses survived Task 8.** Task 8 was titled "delete
   every `isCloud` stock bypass" and its table listed three. Two more are still in the
   tree, both switching off the "not stocked here" partition:

   | Site | Code |
   |---|---|
   | `apps/web/src/routes/shopping/index.tsx:166` | `!isCloud && (vendorCartCounts.get(vendorId)?.count ?? 0) === 0` |
   | `apps/web/src/routes/cooking.tsx:180` | `!isCloud && getAvailableRecipeItems(recipe).length === 0` |

   They are correctly blocked on PR 3, not merely missed: a cloud `Cart` has no
   `locationId`, and `consumeRecipes` writes the caller's default location, so cloud has
   no per-location answer to give. But they were never written down here, which is how a
   deferred item turns into a forgotten one. Found on 2026-09-14 while bringing
   `location-not-stocked-here.spec.ts` into the cloud project — two of its five cases
   assert on a divider that cloud never renders, so they stay `test.skip` until PR 3
   removes both guards. See `2026-09-14-cloud-e2e-location-coverage-plan.md`.

   This is the same failure mode the note further up this plan describes: a bypass
   phrased as `!isCloud && …` matches a grep for `isCloud` but reads as ordinary logic,
   so it survives a review that scans for `if (isCloud)`.

### Owed by PR 4

4. **`usePostLoginMigration` and its dialog disagree about which local location.** The
   hook copies by the **unvalidated** `readStoredLocationId('local')`; the dialog now
   warns by the **validated** `resolveLocalActiveLocationId()` (Task 6c). They agree
   whenever the slot names a live local location — and diverge when it names a **deleted**
   one, in which case the dialog warns about the right set while the copy flattens by an
   id no `ItemStock` row carries: **every item uploads with zeroed stock and every cart
   is dropped, silently**, and the one-shot ref blocks a retry. Fixing it means deciding
   whether the copy id should also be validated, which is PR 4's call (the source comment
   in `usePostLoginMigration.ts` says so too).

5. **`locationResolved` still validates the CLOUD active id against the CLOUD list.**
   Since Task 6b the copy target is the local slot, so this gate no longer guards it. It
   is kept because it still delays the destructive one-shot copy until the session has
   stabilised — but design §6 already schedules its `activeLocationId === DEFAULT_LOCATION_ID`
   branch for removal in PR 4, and this is the same gate.

### Standing caveats (not scheduled — carried forward)

6. **No unit test runs the resolvers against real SQL.** Every `apps/server` test uses a
   hand-written stateful Prisma fake (`src/test/`).

   Cloud E2E *does* use real Postgres. `E2E_TEST_MODE=true` makes `prisma.ts` point at
   `TEST_DATABASE_URL`, a dedicated Neon branch. But it only runs the spec files listed in
   the `cloud` project's `testMatch` in `e2e/playwright.config.ts` — nine files today. So
   the right statement is: **a resolver that no cloud spec covers has never run against
   SQL at all.** Caveat 10 below lists what is missing and why.

   **A manual cloud smoke test is owed for checkout and cooking.** These are the two
   dual-write paths PR 2 added, and no automated test runs them end to end.

   > **Corrected 2026-09-13.** This caveat used to say "cloud E2E is gated on
   > `TEST_CLOUD_MODE`, which is set nowhere". That was true until PR 0 of this series
   > replaced those guards with the `baseURL !== CLOUD_WEB_URL` pattern. `grep -rn
   > TEST_CLOUD_MODE` now finds nothing outside old docs. The sentence contradicted
   > caveat 10, which correctly names `testMatch` as the blocker. The same stale sentence
   > lived in the root `CLAUDE.md` and was copied into several PR 2 task briefs before
   > anyone checked it — see commit `456ff93e`.

7. **`$transaction` rollback is deliberately not modelled in the fake.** An atomicity
   test written against it would be vacuous. Named here so nobody writes one and reports
   it as coverage — design §7 says the same about `applyUnitSwitch`.

8. **`upsertItemStock` authorizes the location, not the item.** It calls
   `requireLocationRole` on the target location and then writes an `ItemStock` for
   `itemId` without asserting the item's own scope. Pre-existing and analogous to the
   note already recorded against `cart.resolver.ts:86`, which calls
   `prisma.item.update({ where: { id: ci.itemId } })` with no `userId`. Neither is a
   demonstrated vector today (both inherit scope from a row that *is* scoped), but both
   assert nothing. Worth closing when RBAC lands, behind the same
   `requireLocationRole`-shaped helper — never as `row.userId === ctx.userId`.

10. **No cloud E2E covers any location surface — audited 2026-09-04, Task 10.** Six specs
   exercise locations (`settings/locations`, `location-switcher`, `item-stock-pager`,
   `item-stock-input`, `location-not-stocked-here`, `unified-item-search`), and the
   `cloud` project's `testMatch` in `e2e/playwright.config.ts` selects **none** of them —
   so their `test.skip(baseURL === CLOUD_WEB_URL, …)` guards are dead code. The blocker
   is not the backend (PR 1 shipped it): **every fixture seeds IndexedDB through
   `page.evaluate()`**, which writes nothing a cloud-mode app reads, so widening
   `testMatch` alone would turn six green specs red. Cloud coverage needs a GraphQL- or
   UI-driven seed helper — real work, and PR 3's natural home since it rewrites carts and
   logs anyway. Task 10 corrected the stale *reasons* in those files (they all claimed
   "no cloud Location/ItemStock backend") but deliberately did **not** attempt the
   migration. This is the E2E half of caveat 6: cloud locations are covered by unit tests
   and by nothing else.

### Separate follow-up issue — NOT part of this PR

9. **`apps/web/tsconfig.app.json` excludes tests and stories from the type-check.** Its
   `exclude` is `["**/*.test.ts", "**/*.test.tsx", "**/*.stories.tsx"]`, so `pnpm build`
   never type-checks them and `pnpm test` (esbuild) does not either. **Measured
   2026-09-04**, by re-running `tsc` with `exclude: []` and `types` widened to include
   `vitest/globals`: **672 pre-existing errors** in those files. It cost this PR real
   time **three separate times** — a change looks green everywhere, and the type error surfaces only
   when someone runs `tsc` over the excluded set by hand. **Propose it as its own issue**;
   fixing it here would bury PR 2 under an unrelated 676-error cleanup.
