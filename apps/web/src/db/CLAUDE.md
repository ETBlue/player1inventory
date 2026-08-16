# Local Database (Dexie / IndexedDB)

The local-mode data source. `index.ts` declares the Dexie schema, `operations.ts` holds every read/write. Components never touch Dexie directly — they go through the Query hooks in `src/hooks/` (see `src/hooks/CLAUDE.md`).

**Files:** `index.ts` (schema + migrations), `operations.ts` (+ `operations.test.ts`), `migrations.test.ts`, `upgradeV15.test.ts`.

## Schema versioning

One `db.version(n).stores({...})` per migration in `index.ts`. Migrations are **forward-only** and **idempotent within a bump**. Current version: **15**.

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

## The Item/ItemStock join

An item is **"stocked at" a location iff an `ItemStock` row exists for the pair.** Reads join the two: `useItems`/`useItem` return a `PantryItem` (global `Item` + the active location's stock) via `joinItemStock` / `stripStockFields`, both exported from `operations.ts` so the Stock-tab pager re-joins against a different location with the same implementation.

`getStockedItems(locationId)` filters on `ItemStock` (the pantry's data source); `getAllItems()` does not (the Add combobox catalog). That difference is what makes an **orphan** — an item with no stock rows left — invisible in the pantry but still re-addable.

**Cloud mode has no `Location` and no `ItemStock`** (deliberately deferred): a cloud `Item` still carries its stock inline and its carts are keyed bare. Nothing in the cloud path may call the location-scoped operations.

## Cascades

- `deleteItem(id)` — removes the item everywhere: its stock rows, logs, cart entries, and recipe references.
- `deleteLocation(id)` — refuses the default location, then removes that location's `itemStocks`, `inventoryLogs`, carts and cart items. Global `Item`s survive.
- `removeItemFromLocation(itemId, locationId)` — the narrow one: that pair's `ItemStock`, that location's logs for the item, and its entries in that location's carts. The cart rows themselves, the other locations, and the global `Item` all survive.

Cascades run as sequential awaits rather than one Dexie transaction, consistently across all three.

> Details of the location-scoped behaviour live with their features: `src/routes/settings/locations/CLAUDE.md` (locations, delete cascade, orphans), `src/routes/items/CLAUDE.md` (the Stock pager and what removal destroys), `src/routes/CLAUDE.md` (active-location scoping).
