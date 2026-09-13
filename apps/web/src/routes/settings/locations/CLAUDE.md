### Location Management

Location CRUD at `/settings/locations`. A **Location** is a place the user stocks things — a home, a second home, a storage unit. It is the scoping unit for all stock-bearing data: every `ItemStock`, `InventoryLog`, and `ShoppingCart` belongs to exactly one location.

**`Location` type** (`packages/types/src/index.ts`): `id`, `name`, `order`, `isDefault`, `createdAt`, `updatedAt`. **Both modes** — local is the Dexie `locations` store (`isDefault` added in v18, see `src/db/CLAUDE.md`); cloud is the Prisma `Location` model behind `apps/server/src/schema/location.graphql`, added in cloud-locations PR 1.

**The default location is marked by `isDefault`, not by its id.** It always exists in both modes: locally it is seeded by the Dexie `on('populate')` hook on a fresh DB and by the v14/v15 upgrade functions on an existing one (`ensureDefaultLocation`, which writes `isDefault: true`); in cloud the `locations` query **lazily creates** one for any user who has none. It is **never deletable** and **never draggable**: `LocationList` renders a `Lock` icon in place of its drag handle and an empty spacer in place of its delete button, and `deleteLocation` throws if called with it anyway.

`DEFAULT_LOCATION_ID = 'local'` still exists (exported from `@/types`) but is now **only** the id the local seed happens to use — nothing branches on it as a *marker*. The local default's id is `'local'`; a cloud default's id is a server cuid. That is why `deleteLocation`'s guard, `LocationList`'s lock/badge and `useActiveLocation`'s fallback all read `isDefault` instead. It is **not** derivable from `order`: `LocationList` disables dragging *of* the default row, but dnd-kit's `disabled` only stops that row being picked up — another row dragged above it still displaces it.

**Operations** (`src/db/operations.ts`): `getLocations` (ordered by `order`), `createLocation(name)` (appends after the current max `order`), `updateLocation(id, updates)`, `deleteLocation(id)`, `reorderLocations(orderedIds)`.

**Delete cascade (local).** `deleteLocation` refuses the default location (`if (location.isDefault) throw`), then removes everything scoped to the location being deleted:
- its `itemStocks` rows (`where('locationId')`),
- its `inventoryLogs` (`where('locationId')`),
- its shopping carts (`id` prefixed `${locationId}:`) and every `cartItem` in them,
- finally the `locations` row itself.

Global `Item`s are **not** touched — an item stocked only in the deleted location survives as an orphan (see below). If the deleted location was the active one, `useActiveLocation` falls back to the **`isDefault`** location because the stored id no longer matches any location.

**Delete cascade (cloud).** The server cascade matches, but is narrower for now: Postgres `ON DELETE CASCADE` removes the location's `ItemStock` rows, and cloud carts and inventory logs are not location-scoped until PR 3, so there is nothing else for it to take. The cloud mutation refetches only `GetLocations` — see the comment on `useDeleteLocation` for why `PantryData` / `ItemStocksForItem` are deliberately left off that list.

**Un-stocking one item** is the narrower counterpart, `removeItemFromLocation(itemId, locationId)` — see the "Orphan items" section below and `src/routes/items/CLAUDE.md` for the Stock-tab UI that calls it.

**Hooks** (`src/hooks/useLocations.ts`): `useLocations`, `useCreateLocation`, `useUpdateLocation` (takes `{ id, updates }`), `useDeleteLocation`, `useReorderLocations`. **Dual-mode** — local reads/writes Dexie, cloud runs the `GetLocations` / `CreateLocation` / `UpdateLocation` / `DeleteLocation` / `ReorderLocations` operations. Two cloud-contract details are easy to get wrong: `UpdateLocationInput` is **name-only** (reordering must go through `useReorderLocations`, and the cloud branch throws on an `order` update rather than dropping it), and `reorderLocations` returns `[Location!]!`, whose result the cloud branch writes straight into the `GetLocations` cache entry. See `src/hooks/CLAUDE.md`.

**Active location** (`src/hooks/useActiveLocation.tsx`): a React Context exposing `{ activeLocationId, setActiveLocationId, activeLocation }`, persisted in localStorage under the per-mode key `active-location-id:<mode>`, falling back to the `isDefault` location when the stored id names none of the loaded ones. `ActiveLocationProvider` is mounted in `__root.tsx`. It also bootstraps the location's shopping carts (`bootstrapCarts`) whenever the active id changes. See `src/hooks/CLAUDE.md` for the full list of hooks that thread it.

**Route**: `src/routes/settings/locations.tsx` (layout) + `src/routes/settings/locations/index.tsx` (list). Toolbar: back button + title + an **Add** button opening `AddNameDialog`. Rename reuses the same `AddNameDialog` with a Save label. Registered in the settings nav from `src/routes/settings/index.tsx` (`MapPin` icon, `settings.locations.label`/`.description`).

**Components**:
- `src/components/location/LocationList/LocationList.tsx` — the reorderable list. One `Card` per location: drag handle (or `Lock` for the default) · `MapPin` + name + a "Default" hint · rename (pencil) · delete (trash, absent for the default). Drag-reorder via `@dnd-kit` with `PointerSensor`/`TouchSensor`/`KeyboardSensor`, mirroring `ShelfList`; keyboard instructions live in an `sr-only` paragraph (`settings.locations.dragInstructions`). Names render **as stored** — no `capitalize`, in the row label or the drag overlay. Location names are user-specified and may carry intentional casing ("iHerb pantry", "my Garage"), so they follow the vendor-name exception in the root `CLAUDE.md` "Name Display Convention" rather than the item/tag/recipe title-case rule. This matches `LocationSwitcher`, so the same location reads identically in the sidebar and here.
- `src/components/shared/LocationSwitcher/LocationSwitcher.tsx` — the global active-location selector mounted on the pantry/shopping/cooking toolbars, with a trailing "Manage locations" item linking here. Documented in `src/components/CLAUDE.md`.

**Orphan items.** Removing an item from a location (Stock tab) or deleting a location never deletes the global `Item`. An item with no `ItemStock` rows left is an **orphan**: hidden from the pantry (`getStockedItems` filters on `ItemStock`), still present in the catalog (`getAllItems`), and therefore still findable in the pantry Add combobox — selecting it there re-stocks it via copy-on-add. `deleteItem` remains the only way to remove an item everywhere.

**i18n**: `settings.locations.*` in `src/i18n/locales/{en,tw}.json`.

**Tests**: `src/routes/settings/locations/index.test.tsx` (route), `index.stories.tsx` + `index.stories.test.tsx` (stories + smoke), location operations/cascade in `src/db/operations.test.ts`, E2E in `e2e/tests/location-switcher.spec.ts` and `e2e/tests/settings/locations.spec.ts`.
