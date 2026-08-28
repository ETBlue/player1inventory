# Local Database (Dexie / IndexedDB)

The local-mode data source. `index.ts` declares the Dexie schema, `operations.ts` holds every read/write. Components never touch Dexie directly — they go through the Query hooks in `src/hooks/` (see `src/hooks/CLAUDE.md`).

**Files:** `index.ts` (schema + migrations), `operations.ts` (+ `operations.test.ts`), `migrations.test.ts`, `upgradeV15.test.ts`, `upgradeV16.test.ts`, `upgradeV17.test.ts`.

## Schema versioning

One `db.version(n).stores({...})` per migration in `index.ts`. Migrations are **forward-only** and **idempotent within a bump**. Current version: **17**.

Rules:
- **Add a new version; never edit a shipped one.** An upgrade function must be valid on a database built only from committed history.
- **Fresh databases never run per-version upgrade functions** — Dexie opens them straight at the latest version. Anything an upgrade seeds must therefore also be seeded from the `on('populate')` hook. `ensureDefaultLocation` is called from both for exactly this reason.

### v14 — `locations`

Adds `locations` (`id, order, name`) and seeds the default `Location {id: 'local', name: 'My Home', order: 0}` via `ensureDefaultLocation`. See `src/routes/settings/locations/CLAUDE.md` for the entity itself.

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

## The Item/ItemStock join

An item is **"stocked at" a location iff an `ItemStock` row exists for the pair.** Reads join the two: `useItems`/`useItem` return a `PantryItem` (global `Item` + the active location's stock) via `joinItemStock` / `stripStockFields`, both exported from `operations.ts` so the Stock-tab pager re-joins against a different location with the same implementation.

`PantryItem = Item & StockFields & { stockId?, locationId? }` — unchanged by v16. A read site says `item.packageUnit` or `item.packedQuantity` without caring which half it came from; only the writes have to route. `StockConfigFields` (in `packages/types`) names the global half for helpers that need both (`quantityUtils`, `expiration`).

**Writes route by field.** `updateItem(id, updates, locationId)` sends the five state fields to `locationId`'s `ItemStock` and everything else — identity *and* configuration — to the `Item`, where it applies to every location at once. `addItemToLocation`'s copy-on-add therefore inherits only `targetQuantity`, `refillThreshold` and `dueDate`: there is no configuration left on a row to copy.

`getStockedItems(locationId)` filters on `ItemStock` (the pantry's data source); `getAllItems()` does not (the Add combobox catalog). That difference is what makes an **orphan** — an item with no stock rows left — invisible in the pantry but still re-addable.

**Cloud mode has no `Location` and no `ItemStock`** (deliberately deferred): a cloud `Item` still carries its stock inline and its carts are keyed bare. Nothing in the cloud path may call the location-scoped operations. v16 *narrows* that divergence rather than widening it — the cloud `Item` (GraphQL type, both its inputs, and the Prisma model) already carried all eight configuration fields, so they now mean the same thing on both sides and only the five state fields remain cloud-inline.

**v17 has no cloud counterpart yet.** `createItem` in `apps/server/src/resolvers/item.resolver.ts` moved `1 → 0 → 1` on the same two commits as local mode, and it always sends an explicit value, so Prisma's `consumeAmount Float @default(1)` never applied — cloud rows created in that window hold a real `0`. Repairing them needs a Prisma data migration (`UPDATE "Item" SET "consumeAmount" = 1 WHERE "consumeAmount" = 0`); it is deliberately not written here, and is the designer's call because it would also overwrite any intentional `0` a client sent.

## Cascades

- `deleteItem(id)` — removes the item everywhere: its stock rows, logs, cart entries, and recipe references.
- `deleteLocation(id)` — refuses the default location, then removes that location's `itemStocks`, `inventoryLogs`, carts and cart items. Global `Item`s survive.
- `removeItemFromLocation(itemId, locationId)` — the narrow one: that pair's `ItemStock`, that location's logs for the item, and its entries in that location's carts. The cart rows themselves, the other locations, and the global `Item` all survive.

Cascades run as sequential awaits rather than one Dexie transaction, consistently across all three.

## Transactional batches

Three operations wrap their writes in a single `db.transaction('rw', …)`. All three must declare **every** table they touch (touching an undeclared one throws at runtime, not compile time) and none may `await` a non-Dexie promise inside the body — a Dexie transaction is zone-scoped, and awaiting a foreign promise can detach the zone so later writes commit *outside* the transaction. **This does not force a caller to compute everything up front**: a plain Dexie read (`db.items.get`, `db.recipes.get`, …) is itself a Dexie promise, so it stays inside the zone and is safe to await mid-transaction — the hazard is specifically a *non*-Dexie await (a network call, a timer, another library's promise), and only `applyShelfFilterPicksBatch` below actually needs the distinction; the other two do compute their rows first, but that is a property of what they happen to need, not a rule the transaction imposes.

- **`consumeRecipesBatch`** — cooking's "done": quantities, logs and `lastCookedAt` over `items`, `itemStocks`, `inventoryLogs`, `recipes`. Callers compute the finished rows first and hand them over.
- **`applyUnitSwitchBatch`** — the Info tab's unit switch over `items`, `itemStocks`, `recipes`: the `Item`'s configuration, one `ItemStock` per location whose tracked quantities the switch moves, and one recipe per `defaultAmount` expressed in the old unit. As separate writes a failure partway left the item on the **new** unit while some locations and recipes still held **old**-unit numbers — mixed units, silently. It shares `updateItem`'s field routing via the internal `writeItemUpdate` rather than re-deriving the rule. Callers compute the finished rows first and hand them over.
- **`applyShelfFilterPicksBatch`** (PR D, unified item search) — a filter shelf's per-axis picks over `items`, `recipes`: unions the picked tag/vendor ids onto the item and, when a recipe axis was picked, appends `{ itemId, defaultAmount: consumeAmount || 1 }` to that recipe's `items`. Unlike the two above, it deliberately does **NOT** take finished rows from the caller — it re-reads `db.items.get(itemId)` and (when a recipe pick is present) `db.recipes.get(recipeId)` *inside* the transaction and unions against those fresh rows, so a stale React render closure that captured the item/recipe before some other write landed cannot double-append an id. Both reads are ordinary Dexie promises, so this does not violate the zone-detachment hazard above — it is a deliberate departure from the other two operations' *habit*, not their *rule*.

> Details of the location-scoped behaviour live with their features: `src/routes/settings/locations/CLAUDE.md` (locations, delete cascade, orphans), `src/routes/items/CLAUDE.md` (the Stock pager and what removal destroys), `src/routes/CLAUDE.md` (active-location scoping).
