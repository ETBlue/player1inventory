# Local Database (Dexie / IndexedDB)

The local-mode data source. `index.ts` declares the Dexie schema, `operations.ts` holds every read/write. Components never touch Dexie directly — they go through the Query hooks in `src/hooks/` (see `src/hooks/CLAUDE.md`).

**Files:** `index.ts` (schema + migrations), `operations.ts` (+ `operations.test.ts`), `migrations.test.ts`, `upgradeV15.test.ts`, `upgradeV16.test.ts`, `upgradeV17.test.ts`, `upgradeV18.test.ts`, `upgradeV19V20.test.ts`, `upgradeV21.test.ts`.

## Schema versioning

One `db.version(n).stores({...})` per migration in `index.ts`. Migrations are **forward-only** and **idempotent within a bump**. Current version: **21**.

Rules:
- **Add a new version; never edit a shipped one.** An upgrade function must be valid on a database built only from committed history.
- **Fresh databases never run per-version upgrade functions** — Dexie opens them straight at the latest version. Anything an upgrade seeds must therefore also be seeded from the `on('populate')` hook. `ensureDefaultLocation` is called from both for exactly this reason.

### v14 — `locations`

Adds `locations` (`id, order, name`) and seeds the default `Location {id: 'local', name: 'My Home', order: 0}` via `ensureDefaultLocation` (which also writes `isDefault: true` since v18). See `src/routes/settings/household/locations/CLAUDE.md` for the entity itself.

### v15 — the `Item` → `Item` + `ItemStock` split

`items` keeps only **global identity** (`id, name, tagIds, vendorIds, wikidataUrl, note`, timestamps). Everything about *stocking* moves to `itemStocks` (`id, itemId, locationId, [itemId+locationId], updatedAt`) — one row per **(item × location)**. Alongside:

- `inventoryLogs` gains a `locationId` index.
- Shopping carts are re-keyed to `${locationId}:${vendorId | 'no-vendor'}`. **Parse with `parseCartId`, never a string prefix** — a vendor id containing `:` would otherwise be misread as a location.

The upgrade function moves each item's stock fields into an `ItemStock` under `'local'`, strips them from the item row, stamps `locationId` on every log, and re-keys the carts.

### v16 — global stock settings

v15 left `ItemStock` conflating two different kinds of thing. **Configuration** — how an item is packaged, measured, expires and is consumed — belongs to the item and does not vary by location. **State** — how much is here, when this one expires — genuinely does. v16 moves the configuration half back onto `Item`:

| Moved to `Item` (configuration) | Stayed on `ItemStock` (state) |
|---|---|
| `packageUnit` · `measurementUnit` · `amountPerPackage` · `targetUnit` · `consumeAmount` · `estimatedDueDays` · `expirationThreshold` · `expirationMode` | `packedQuantity` · `unpackedQuantity` · `targetQuantity` · `refillThreshold` · `dueDate` |

**`targetQuantity` stays per-location deliberately** — `targetQuantity === 0` is the "inactive here" marker that `isInactive` / `isStockedHere` / `isInactiveHere` (`lib/quantityUtils.ts`) read.

No index changes: none of the eight was indexed in v15's store definitions.

**Collapse rule** (an item stocked in three locations has three values per field; one must win):

1. the **default location**'s row, if the item is stocked there;
2. otherwise the **oldest** row by `createdAt`, tie-broken by `id` for determinism. (`updatedAt` was rejected — it also moves on quantity edits, so the winner would be wherever the user last shopped, not where the units were set.);
3. an item with **no rows at all** (an orphan) takes the field defaults (`targetUnit: 'package'`, `consumeAmount: 1`).

Idempotent: a value already on the item is only overwritten by a stock row that still carries that key, so a repeat pass over already-stripped rows is a no-op. The upgrade then deletes the eight from every stock row.

**`on('populate')` needed no change here** — v16 adds no store and seeds nothing — but `upgradeV16.test.ts` asserts fresh-DB/migrated-DB shape parity explicitly rather than assuming it.

`lib/importData.ts` applies the **same** collapse rule to a v15-shaped backup, keyed on whether any stock row still carries a configuration field. See "Cascades" below and the importer's own comments.

### v17 — the `consumeAmount: 0` backfill

Every item whose `consumeAmount` is exactly `0` — or not a finite number — becomes `1`. Nothing else moves, and no store or index changes (`consumeAmount` is not indexed), so v17 restates v16's `.stores()` unchanged, as v7 and v11 do.

**Why:** for roughly 24 hours (`6302ee97`, 2026-08-23 → `9e323fa6`, 2026-08-24) both create paths defaulted a new item's `consumeAmount` to `0`, meaning "unconfigured" — deliberately, so `ItemForm`'s `consumeAmount > 0` validation would flag the item as needing setup. The designer reversed that on 2026-08-24 (a new item must be **valid by nature**) and the default went back to `1`, but the validation stayed. Items created inside that window are therefore stuck on "Must be greater than 0." until edited by hand. This is data repair for a specific, dated regression — not general munging.

`1` is the canonical fallback v16 already uses (its orphan default and its undefined-value backfill are both `1`), and the value both create paths now produce.

**What is deliberately NOT touched:**

- **Fractional values.** `0.5` is a legitimate step size; only *exactly* `0` is the unconfigured marker.
- **Negative values.** Nothing in the app can write one (`numericInputProps` parses through `Number.isFinite`, the form rejects `<= 0`), so guessing at one is out of scope.
- **A future explicit `0`.** `createItem`'s `?? 1` still lets a caller pass a real `0` meaning "no step size" — v17 is a one-time repair of stored rows, not a floor on the field.

Non-finite is covered even though the form cannot produce it; **missing is genuinely reachable** — a restored backup whose item row and whose winning stock row both lack the key keeps it unset (`lib/importData.ts`).

**`on('populate')` needed no change.** v17 adds no store and seeds no row — it only rewrites existing `items`. A database created fresh at v17 has no items at populate time, and every row written afterwards comes from `createItem`, which defaults `consumeAmount ?? 1`. `upgradeV17.test.ts` asserts that fresh-DB state explicitly rather than assuming it.

**Cloud is NOT covered.** The equivalent Postgres rows can carry a `0` from the same window (the resolver's default moved 1 → 0 → 1 alongside local mode) and no Prisma migration backfills them — see the cloud note under **The Item/ItemStock join** below.

### v18 — `Location.isDefault`

Adds a boolean `isDefault` to `locations`, backfilled `isDefault: location.id === DEFAULT_LOCATION_ID`. Nothing else moves, and no store or index changes (`isDefault` is **not** indexed), so v18 restates v17's `.stores()` unchanged, as v7, v11 and v17 do.

**Why a column rather than a derivation.** The default location has to be identifiable in **cloud** too, where its id is a server cuid, not the `'local'` sentinel. `order` cannot stand in for it: `LocationList` disables dragging *of* the default row, but dnd-kit's `disabled` only stops that row being picked up — another row dragged above it still displaces it, so the default's `order` is not stable.

**What the flag replaces.** `deleteLocation`'s guard is now `if (location.isDefault) throw`, not an id comparison, and `LocationList` derives its lock/no-delete affordance from `location.isDefault`. `DEFAULT_LOCATION_ID` survives only as the id the local seed happens to use — nothing branches on it as a *marker* any more. In local mode both spellings are true of the same row, which is why the id-comparison mutation check on `deleteLocation` stays green; the guard's real change is pinned by the **cloud** delete-guard test, where the default's id is a cuid.

**`on('populate')` DID need a change** — this is the v14/v15 trap, not the v16/v17 one. A fresh database never runs the upgrade functions, so the backfill above would never fire for a brand-new user and their seeded default would carry no flag at all: undeletable-by-id would still work, but `deleteLocation`'s new guard and `LocationList`'s badge would both read `undefined`. The seed routes through `ensureDefaultLocation`, which the populate hook calls, so the flag is written **there** — one function serving both paths. `upgradeV18.test.ts` asserts the fresh-DB case explicitly rather than assuming it, and its migration fixture carries **three** locations (the default plus two others) so "flag the default" is distinguishable from "flag everything".

**Restored backups.** A pre-v18 payload carries locations with no `isDefault`. `importData.ts` calls `ensureDefaultLocationRow()` after the location rows land, which seeds the `'local'` row only if it is absent — so a payload containing non-default locations does not arrive flagged, and exactly one row ends up flagged.

### v19 and v20 — one row per item per cart

Households H3b task B.8 (design decision D6). Cloud got `@@unique([cartId, itemId])` in task
B.3; local mode gets the same rule.

| Version | Stores | Upgrade |
|---|---|---|
| 19 | same as 18 | merges rows with the same `(cartId, itemId)`: keeps the **lowest** id (plain string order), sets its `quantity` to the sum, deletes the others. A pair with one row is not touched |
| 20 | `cartItems: 'id, cartId, itemId, &[cartId+itemId]'` | none |

**Why two versions.** Dexie creates a version's new indexes **before** it runs that version's
upgrade. With the merge and the unique index in one version, IndexedDB tries to build the
index over rows that still hold duplicates, the upgrade transaction aborts, and `db.open()`
fails. Measured with fake-indexeddb: moving the index into version 19 makes the open fail with
`AbortError`, and two tests in `upgradeV19V20.test.ts` go red.

**Why the lowest id.** The cloud migration of task B.3 keeps the lowest id too, and both import
paths create a merged pair under its lowest free id. So a backup made before the merge finds
its row under the same id after it, and `skip` sees it as already imported.

**`cartId` and `itemId` keep their own indexes** — reads use `where('cartId')` and
`where('itemId')`.

**`on('populate')` needed no change.** A fresh database opens straight at version 20, with the
index and no rows to merge. `upgradeV19V20.test.ts` checks this: a fresh database is at
version 20, the index is unique, a second row for a pair is refused, and the default location
is still seeded.

**Two writers had to change before the index could land**, because each could create a second
row for a pair:

- `addToCart` (`operations.ts`) runs its read and its write in one `rw` transaction on
  `cartItems`. IndexedDB runs two read-write transactions on one table one after the other, so
  two calls at once give one row with the sum. Without the transaction the second `add` throws
  `ConstraintError` (measured).
- the local import (`importLocalCartItems` in `lib/importData.ts`) merges a backup's rows by
  pair and follows decision P3 of the H3b plan, the same rule as the cloud mutations: `skip`
  and `clear` ADD to a stored pair and skip a whole pair when any of its ids is stored;
  `replace` SETS the pair's amount; no write moves a row. Before task B.8 it used `bulkAdd` and
  `bulkPut`, so `replace` moved a row whose id the backup named under another pair.

### v21 — `Item.consumable`

Consumable items PR 2 (`docs/features/items/2026-11-25-item-consumable-design.md`). Same
stores as 20 (`consumable` is not indexed). The upgrade sets `consumable: true` on every
item whose value is not a boolean; a stored `false` or `true` stays. `createItem` writes
`consumable ?? true`.

**Readers do not rely on the backfill.** `Item.consumable` is optional, and every reader
uses `isConsumable(item)` (`@p1i/types`), which reads a missing or `null` value as `true`.
A backup file from before the field can still bring an item with no value; the local
import writes `isConsumable(raw)` for it (`deserializeItem` in `lib/importData.ts`).

**`on('populate')` needed no change.** A fresh database has no items at populate time.
`upgradeV21.test.ts` checks a version-20 database with three items (no value, `false`,
`true`, so "set where missing" differs from "set everywhere") and a fresh database.
`upgradeV19V20.test.ts` now checks `verno` is at least 20, not exactly 20.

## The Item/ItemStock join

An item is **"stocked at" a location iff an `ItemStock` row exists for the pair.** Reads join the two: `useItems`/`useItem` return a `PantryItem` (global `Item` + the active location's stock) via `joinItemStock` / `stripStockFields`, both exported from `operations.ts` so the Stock-tab pager re-joins against a different location with the same implementation.

`PantryItem = Item & StockFields & { stockId?, locationId? }` — unchanged by v16. A read site says `item.packageUnit` or `item.packedQuantity` without caring which half it came from; only the writes have to route. `StockConfigFields` (in `packages/types`) names the global half for helpers that need both (`quantityUtils`, `expiration`).

**Writes route by field.** `updateItem(id, updates, locationId)` sends the five state fields to `locationId`'s `ItemStock` and everything else — identity *and* configuration — to the `Item`, where it applies to every location at once. `addItemToLocation`'s copy-on-add therefore inherits only `targetQuantity`, `refillThreshold` and `dueDate`: there is no configuration left on a row to copy.

`getStockedItems(locationId)` filters on `ItemStock` (the pantry's data source); `getAllItems()` does not (the Add combobox catalog). That difference is what makes an **orphan** — an item with no stock rows left — invisible in the pantry but still re-addable.

**Cloud has `Location` and `ItemStock` too** (cloud-locations PR 1 shipped the Prisma models and the GraphQL surface; PR 2 moved the web client onto them). The cloud path reads `PantryData($locationId)` and runs the result through the **same** `joinItemStock` / `stripStockFields` this file's local path calls — they live in `lib/itemStock.ts` for exactly that reason, with `operations.ts` re-exporting them so no local call site changed. A cloud item unstocked in the active location therefore arrives with `stockId: undefined` and zeroed quantities, exactly as a local one does.

**That divergence is now closed.** Cloud locations PR 5 dropped the five state columns from the cloud `Item` — from the Prisma model, from the `Item` GraphQL type, and from `CreateItemInput`, `UpdateItemInput` and `ItemInput`. The PR-2 server dual-write (`lib/stockDualWrite.ts`) is deleted with them, so cloud and local now agree: configuration on `Item`, per-location state on `ItemStock`, and nothing to strip off a cloud `Item`. The price was the one thing PRs 1 to 4b all avoided — **a browser on a pre-PR-5 bundle gets a blank pantry until it reloads**, because its `GetItems` and `PantryData` documents still select five fields that no longer exist and GraphQL validation rejects the whole operation. See `docs/global/backend/2026-10-05-deploy-runbook-item-column-drop.md`. `joinItemStock` and `stripStockFields` both **stay** — they operate on a `PantryItem`, which still carries the five joined from `ItemStock`, and local mode uses them throughout. Cloud **carts and inventory logs became location-scoped in PR 3a and PR 3b** — `Cart.locationId`, `InventoryLog.locationId`, and `Cart.id` re-keyed to `${locationId}:${vendorId | 'no-vendor'}` — so the `isCloud` bypasses shopping and cooking used to carry are gone too. v16 had already narrowed the configuration half — the cloud `Item` carried all eight configuration fields before this — so PR 2 closed what was left on the state half.

**v17 has no cloud counterpart yet.** `createItem` in `apps/server/src/resolvers/item.resolver.ts` moved `1 → 0 → 1` on the same two commits as local mode, and it always sends an explicit value, so Prisma's `consumeAmount Float @default(1)` never applied — cloud rows created in that window hold a real `0`. Repairing them needs a Prisma data migration (`UPDATE "Item" SET "consumeAmount" = 1 WHERE "consumeAmount" = 0`); it is deliberately not written here, and is the designer's call because it would also overwrite any intentional `0` a client sent.

## Cascades

- `deleteItem(id)` — removes the item everywhere: its stock rows, logs, cart entries, and recipe references.
- `deleteLocation(id)` — refuses the default location, then removes that location's `itemStocks`, `inventoryLogs`, carts and cart items. Global `Item`s survive.
- `removeItemFromLocation(itemId, locationId)` — the narrow one: that pair's `ItemStock`, that location's logs for the item, and its entries in that location's carts. The cart rows themselves, the other locations, and the global `Item` all survive.

Cascades run as sequential awaits rather than one Dexie transaction, consistently across all three.

## Transactional batches

Four operations wrap their writes in a single `db.transaction('rw', …)`. (Since households H3b task B.8, `addToCart` and the import's `importLocalCartItems` also run in one `rw` transaction on `cartItems` alone; see v19 and v20 above.) All of them must declare **every** table they touch (touching an undeclared one throws at runtime, not compile time) and none may `await` a non-Dexie promise inside the body — a Dexie transaction is zone-scoped, and awaiting a foreign promise can detach the zone so later writes commit *outside* the transaction. **This does not force a caller to compute everything up front**: a plain Dexie read (`db.items.get`, `db.recipes.get`, …) is itself a Dexie promise, so it stays inside the zone and is safe to await mid-transaction — the hazard is specifically a *non*-Dexie await (a network call, a timer, another library's promise), and only `applyShelfFilterPicksBatch` below actually needs the distinction; `consumeRecipesBatch` and `applyUnitSwitchBatch` do compute their rows first, but that is a property of what they happen to need, not a rule the transaction imposes.

- **`consumeRecipesBatch`** — cooking's "done": quantities, logs and `lastCookedAt` over `items`, `itemStocks`, `inventoryLogs`, `recipes`. Callers compute the finished rows first and hand them over.
- **`applyUnitSwitchBatch`** — the Info tab's unit switch over `items`, `itemStocks`, `recipes`: the `Item`'s configuration, one `ItemStock` per location whose tracked quantities the switch moves, and one recipe per `defaultAmount` expressed in the old unit. As separate writes a failure partway left the item on the **new** unit while some locations and recipes still held **old**-unit numbers — mixed units, silently. It shares `updateItem`'s field routing via the internal `writeItemUpdate` rather than re-deriving the rule. Callers compute the finished rows first and hand them over.
- **`updateItem`** (since 2026-11-25, inventory log layout) — the write behind the Stock tab Save and Quick update, over `items`, `itemStocks`, `inventoryLogs`, and `recipes` since 2026-11-26: an update with `consumable: false` removes the item from every recipe in the same transaction (see *Only consumable items in a recipe* below). It reads the stock row before and after `writeItemUpdate`, and when the on-hand total changed (`stockCountChange` from `@p1i/types`, the same rule as the server's `upsertItemStock`) it adds ONE `stockCount` log row: `delta` and `quantity` in packs, no `note`, no `logParams`. Both totals use the item's `amountPerPackage` AFTER the write. The log is here, NOT in `upsertItemStock` or `writeItemUpdate`: `checkout`, `createItem`, `addItemToLocation` and `applyUnitSwitchBatch` write stock through those too, and none of them is a stock count. A failing log write rolls the stock write back (pinned in `operations.test.ts`, *stock count log rows*). `getLastPurchaseDate` counts a `stockCount` row with `delta > 0` like any other row that added stock (since 2026-11-26, reversing option A; `docs/features/items/2026-11-26-expiry-from-last-restock-design.md`).
- **`applyShelfFilterPicksBatch`** (PR D, unified item search) — a filter shelf's per-axis picks over `items`, `recipes`: unions the picked tag/vendor ids onto the item and, when a recipe axis was picked, appends `{ itemId, defaultAmount: consumeAmount || 1 }` to that recipe's `items`. Unlike `consumeRecipesBatch` and `applyUnitSwitchBatch`, it deliberately does **NOT** take finished rows from the caller — it re-reads `db.items.get(itemId)` and (when a recipe pick is present) `db.recipes.get(recipeId)` *inside* the transaction and unions against those fresh rows, so a stale React render closure that captured the item/recipe before some other write landed cannot double-append an id. Both reads are ordinary Dexie promises, so this does not violate the zone-detachment hazard above — it is a deliberate departure from the other two operations' *habit*, not their *rule*.

## Only consumable items in a recipe

Owner decision 2026-11-26, the same rules as the server (`apps/server/src/lib/consumable.ts`):
`createRecipe`, `updateRecipe`, `applyShelfFilterPicksBatch` and the recipe lists of
`applyUnitSwitchBatch` refuse a NEW link to a non-consumable item with `NotConsumableError`
(`lib/recipeConsumables.ts`), and `consumeRecipesBatch` refuses one; nothing is written. A link
the recipe already holds is not refused. `updateItem` and `applyUnitSwitchBatch` that set
`consumable: false` remove the item from every recipe in the same transaction (after the
recipe updates, so a list that still names it cannot bring it back). `importLocalData` ends
every strategy with `removeNonConsumableRecipeLinks()`, so a backup's link to a non-consumable
item is dropped, not refused. `createRecipe` and `updateRecipe` became `rw` transactions over
`items` and `recipes` for the check. Tests: `operations.consumable.test.ts`.

> Details of the location-scoped behaviour live with their features: `src/routes/settings/household/locations/CLAUDE.md` (locations, delete cascade, orphans), `src/routes/items/CLAUDE.md` (the Stock pager and what removal destroys), `src/routes/CLAUDE.md` (active-location scoping).
