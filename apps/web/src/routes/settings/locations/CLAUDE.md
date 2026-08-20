### Location Management

Location CRUD at `/settings/locations`. A **Location** is a place the user stocks things — a home, a second home, a storage unit. It is the scoping unit for all stock-bearing data: every `ItemStock`, `InventoryLog`, and `ShoppingCart` belongs to exactly one location.

**`Location` type** (`src/types/index.ts`): `id`, `name`, `order`, `createdAt`, `updatedAt`.

**The default location.** `DEFAULT_LOCATION_ID = 'local'` (exported from `src/types`). It always exists — seeded by the Dexie `on('populate')` hook on a fresh DB and by the v14/v15 upgrade functions on an existing one (`ensureDefaultLocation`). It is **never deletable** and **never draggable**: `LocationList` renders a `Lock` icon in place of its drag handle and an empty spacer in place of its delete button, and `deleteLocation` throws if called with it anyway. Its id is `'local'` unconditionally — it is *not* swapped to the user's id in cloud mode, because cloud has no `Location` backend to swap to.

**Operations** (`src/db/operations.ts`): `getLocations` (ordered by `order`), `createLocation(name)` (appends after the current max `order`), `updateLocation(id, updates)`, `deleteLocation(id)`, `reorderLocations(orderedIds)`.

**Delete cascade.** `deleteLocation` refuses the default location, then removes everything scoped to the location being deleted:
- its `itemStocks` rows (`where('locationId')`),
- its `inventoryLogs` (`where('locationId')`),
- its shopping carts (`id` prefixed `${locationId}:`) and every `cartItem` in them,
- finally the `locations` row itself.

Global `Item`s are **not** touched — an item stocked only in the deleted location survives as an orphan (see below). If the deleted location was the active one, `useActiveLocation` falls back to the default because the stored id no longer matches any location.

**Un-stocking one item** is the narrower counterpart, `removeItemFromLocation(itemId, locationId)` — see the "Orphan items" section below and `src/routes/items/CLAUDE.md` for the Stock-tab UI that calls it.

**Hooks** (`src/hooks/useLocations.ts`): `useLocations`, `useCreateLocation`, `useUpdateLocation` (takes `{ id, updates }`), `useDeleteLocation`, `useReorderLocations`. **Local-first only** — there is no cloud GraphQL `Location` backend yet, so these are mode-independent rather than dual-mode.

**Active location** (`src/hooks/useActiveLocation.tsx`): a React Context exposing `{ activeLocationId, setActiveLocationId, activeLocation }`, persisted in localStorage under `active-location-id`, defaulting to `DEFAULT_LOCATION_ID`. `ActiveLocationProvider` is mounted in `__root.tsx`. It also bootstraps the location's shopping carts (`bootstrapCarts`) whenever the active id changes. See `src/hooks/CLAUDE.md` for the full list of hooks that thread it.

**Route**: `src/routes/settings/locations.tsx` (layout) + `src/routes/settings/locations/index.tsx` (list). Toolbar: back button + title + an **Add** button opening `AddNameDialog`. Rename reuses the same `AddNameDialog` with a Save label. Registered in the settings nav from `src/routes/settings/index.tsx` (`MapPin` icon, `settings.locations.label`/`.description`).

**Components**:
- `src/components/location/LocationList/LocationList.tsx` — the reorderable list. One `Card` per location: drag handle (or `Lock` for the default) · `MapPin` + name + a "Default" hint · rename (pencil) · delete (trash, absent for the default). Drag-reorder via `@dnd-kit` with `PointerSensor`/`TouchSensor`/`KeyboardSensor`, mirroring `ShelfList`; keyboard instructions live in an `sr-only` paragraph (`settings.locations.dragInstructions`). Names render `capitalize`.
- `src/components/shared/LocationSwitcher/LocationSwitcher.tsx` — the global active-location selector mounted on the pantry/shopping/cooking toolbars, with a trailing "Manage locations" item linking here. Documented in `src/components/CLAUDE.md`.

**Orphan items.** Removing an item from a location (Stock tab) or deleting a location never deletes the global `Item`. An item with no `ItemStock` rows left is an **orphan**: hidden from the pantry (`getStockedItems` filters on `ItemStock`), still present in the catalog (`getAllItems`), and therefore still findable in the pantry Add combobox — selecting it there re-stocks it via copy-on-add. `deleteItem` remains the only way to remove an item everywhere.

**i18n**: `settings.locations.*` in `src/i18n/locales/{en,tw}.json`.

**Tests**: `src/routes/settings/locations/index.test.tsx` (route), `index.stories.tsx` + `index.stories.test.tsx` (stories + smoke), location operations/cascade in `src/db/operations.test.ts`, E2E in `e2e/tests/location-switcher.spec.ts` and `e2e/tests/settings/locations.spec.ts`.
