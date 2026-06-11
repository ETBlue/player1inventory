# Design — Location entity

**Date:** 2026-06-11
**Status:** 🔲 Pending
**Brainstorming:** `2026-06-11-brainstorming-locations.md`
**Scope:** Local-first (Dexie). Cloud (GraphQL/Apollo) changes documented as TODOs, not built.

## Goal

Introduce a **Location** entity so a user can track the same global item across multiple places (old home, self-owned house, rented storage) with **independent stock per location**, and — eventually — collaborate with different family members per location. Location becomes the unit of sharing, replacing the alpha global family-group feature.

## Data model

### The Item split

Today, nearly every meaningful field lives on `Item`. We split it into a **global identity** and a **per-location stocking profile**.

**`Item` (global)** — `packages/types/src/index.ts`
```ts
interface Item {
  id: string
  name: string
  tagIds: string[]
  vendorIds?: string[]
  createdAt: Date
  updatedAt: Date
}
```

**`ItemStock` (new — one per item × location)**
```ts
interface ItemStock {
  id: string              // uuid
  itemId: string          // → Item.id
  locationId: string      // → Location.id
  // quantities
  packedQuantity: number
  unpackedQuantity: number
  // goals
  targetQuantity: number
  refillThreshold: number
  // units
  targetUnit: 'package' | 'measurement'
  measurementUnit?: string
  packageUnit?: string
  amountPerPackage?: number
  // cooking
  consumeAmount: number
  // expiration
  expirationMode?: 'disabled' | 'date' | 'days from purchase'
  dueDate?: Date
  estimatedDueDays?: number
  expirationThreshold?: number
  createdAt: Date
  updatedAt: Date
}
```
A `(itemId, locationId)` pair is unique. An item is "stocked at" a location **iff** an `ItemStock` row exists for that pair.

**`Location` (new)**
```ts
interface Location {
  id: string              // default location: 'local' (offline) / user ID (cloud); others: uuid
  name: string
  order: number           // for drag-reorder, like Shelf
  createdAt: Date
  updatedAt: Date
  // memberUserIds: string[]  // CLOUD TODO — no local UI this iteration
}
```

**Default location.** Every user has exactly one **default location**, identified by a well-known id: the constant `'local'` in offline mode, swapped to the **user's ID** in cloud mode. It is created on first run / migration, **never deletable**, and always exists. All non-default locations use a uuid and are freely deletable.

### Touched existing entities

- **`InventoryLog`** gains `locationId: string`. Each log entry belongs to a (item × location). `lastPurchasedAt` (used by "days from purchase" expiration) is computed per (item × location) from logs.
- **`ShoppingCart`** today uses `id = vendorId | 'no-vendor'`. It becomes **per (location × vendor)**. New composite identity — see "Shopping" below.
- **`CartItem`** unchanged in shape (`cartId` now points at a location-scoped cart).

### Dexie schema migration (version 14)

`apps/web/src/db/index.ts` — add a new version. New stores:
```
locations:  'id, order, name'
itemStocks: 'id, itemId, locationId, [itemId+locationId], updatedAt'
```
Changes to existing stores:
- `items`: drop stock/unit/expiration field indexes; keep `id, name, createdAt, updatedAt`.
- `inventoryLogs`: add `locationId` to the index list.
- `shoppingCarts` / `cartItems`: re-key carts to location×vendor (see below).

**Upgrade function (v13 → v14):**
1. Create the **default** `Location` `{ id: 'local', name: 'My Home', order: 0 }` → `defaultLocationId = 'local'`.
2. For each existing `Item`: create an `ItemStock` carrying its current stock/units/expiration fields with `locationId = defaultLocationId`; strip those fields from the `Item` row.
3. For each `InventoryLog`: set `locationId = defaultLocationId`.
4. For each `ShoppingCart` / `CartItem`: re-key to the location×vendor scheme under `defaultLocationId`.

Migrations are forward-only and idempotent within the version bump.

## Active location (global, persisted)

A single app-wide **active location**, persisted (localStorage, alongside existing prefs like `theme-preference`). Surfaced via a small context/hook (`useActiveLocation()`), falling back to the **default location** when unset or when the active one is deleted.

**Switcher UI** — shared component, placed at the **left of the top toolbar** on pantry / shopping / cooking:
- Trigger: icon-sized button showing the **first letter** of the active location's name.
- Dropdown: all locations (by `order`) + a trailing **"Manage"** item → navigates to **Settings › Locations**.

Switching the active location re-scopes pantry, shopping, and cooking.

## Page behaviors

### Pantry (`/`) — scoped to active location
- Lists only items with an `ItemStock` in the active location; cards render that location's stock (single-stock, like today). Items not stocked here are absent.
- Sorting/filtering operate on the active location's stock values.
- **Add button** → the item-name input becomes a **combobox** searching *all items the user can access*:
  - **Select existing item** → create an `ItemStock` for it in the active location (see "copy-on-add" below), then it appears in the pantry.
  - **Create new item** → create the global `Item` + an `ItemStock` in the active location.
  - Local source for "all items" = every `Item` (including those only stocked elsewhere or orphaned). *(Cloud TODO: system-wide catalog.)*

**Copy-on-add:** when adding an existing item that already has stock elsewhere, the new `ItemStock` **inherits all fields except `packedQuantity` & `unpackedQuantity`** (which start at 0). Source row = the active location's stock if present, else the item's most-recently-updated `ItemStock`.

### Shopping (`/shopping`, `/shopping/:vendorId`) — scoped to active location
- Carts are per **(location × vendor)**. Cart key scheme: `${locationId}:${vendorId | 'no-vendor'}`.
- Checkout consumes from the **active location's** `ItemStock`; writes `InventoryLog` rows with `locationId`.
- Only items stocked in the active location (with that vendor) appear in its carts.

### Cooking (`/cooking`) — scoped to active location
- Recipes stay global. Cooking deducts from the active location's `ItemStock` using its per-location `consumeAmount`.
- A recipe item not stocked in the active location is shown as unavailable (zero/greyed) rather than consumed.

### Item detail — new **"Stock" tab**
Split today's combined Stock-Status + Item-Info tab so **Stock** is its own tab. The Stock tab is an **all-locations pager**:
- **Dots** centered under the top toolbar — one per location. The **currently-viewed** location's dot is highlighted; the **active** location is additionally marked (persistent indicator) so context is always clear.
- **Left/right chevron** buttons at the tab's edges slide between locations.
- Opens on the **active location**.
- Per page:
  - **Stocked** → the existing stock-status form (quantities, goals, units, expiration) for that location + a **"Remove from location"** button (deletes that `ItemStock`; cascades its logs/cart entries for that location).
  - **Not stocked** → empty state with a centered **"Add to location"** CTA (creates the `ItemStock` via copy-on-add).
- Desktop: same pager (dots + chevrons), wider layout.

Item-Info fields that are **global** (name, tags, vendors) remain on their existing tabs (Settings/Tags/Vendors), unaffected by the pager.

### Settings › Locations (new page)
- New route under `settings/locations/`, registered in the settings nav.
- List of locations with **drag-reorder** (mirror the existing shelf-list reorder pattern).
- Add / rename / delete.
- **Delete rules:** the **default location** (`id = 'local'` / user ID) can **never** be deleted — it has no delete control. Non-default locations are freely deletable. Deleting cascades the location's `ItemStock` rows, its carts/cart-items, and its inventory logs. If the deleted location was active, fall back to the **default** location.
- **No member UI** this iteration (cloud-deferred).

## Hooks & operations

- **DB operations** (`apps/web/src/db/operations.ts`): add `location*` CRUD + reorder; add `itemStock*` CRUD incl. copy-on-add; update `createItem`/`deleteItem`, checkout, cooking-consume, and log queries to be location-aware. Update `operations.test.ts`.
- **Query hooks** (`apps/web/src/hooks/`): `useLocations`, `useActiveLocation`, `useItemStock(itemId, locationId)`, `useItemStocks(itemId)`; revise item/pantry/shopping/cooking hooks to thread `locationId`. Maintain the existing dual-mode (local/cloud) hook shape — local path implemented, cloud path stubbed/guarded.
- Components never touch Dexie directly (existing rule).

## Family-sharing handling

The alpha cloud `FamilyGroupCard` and its GraphQL plumbing are **untested drafts**. This iteration: **hide/remove the family-group card from settings** to avoid two competing "sharing" concepts. Keep the GraphQL types in place but document that **per-location membership** is the cloud sharing model going forward.

## Cloud TODOs (deferred, document only)

1. GraphQL `Location` + `ItemStock` types, resolvers, Prisma models; migrate the `Item.familyId` notion to per-location membership.
2. Per-location **member lists** + invite/join/leave; rework or remove the global `FamilyGroup`.
3. System-wide **item / vendor / tag catalogs** backing the pantry combobox's "all items you can access."
4. Multi-user **stock sync** per location.

## Testing

- **Unit:** Dexie v14 upgrade (migration correctness), location CRUD + delete cascade + last-location guard, copy-on-add field inheritance, location-scoped checkout/cooking/log queries.
- **Stories:** location switcher, Settings › Locations list, Stock-tab pager (stocked / not-stocked / active-marked states), pantry combobox add.
- **E2E (`e2e/tests/`):** switch active location re-scopes pantry/shopping/cooking; add existing item to a location; remove from location; add a new page to `a11y.spec.ts` for Settings › Locations (light + dark). Run `pnpm test:e2e --grep "items|shopping|cooking|settings|a11y"` at finish.

## Open implementation notes (resolve during planning)

- Exact cart re-key migration for `no-vendor` carts across locations.
- Whether the pantry combobox shows items already stocked in the active location (likely filtered out) vs. all.
- Active-location indicator styling on the Stock-tab dots (distinct from the "currently-viewed" highlight).

---

*Implementation plans (phased) to follow via the writing-plans workflow.*
