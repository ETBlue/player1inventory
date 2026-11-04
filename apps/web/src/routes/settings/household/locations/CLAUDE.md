### Location Management

Location CRUD at `/settings/household/locations`. A **Location** is a place the user stocks things — a home, a second home, a storage unit. It is the scoping unit for all stock-bearing data: every `ItemStock`, `InventoryLog`, and `ShoppingCart` belongs to exactly one location.

**`Location` type** (`packages/types/src/index.ts`): `id`, `name`, `order`, `isDefault?`, `createdAt`, `updatedAt`. `isDefault` is optional and **local only** since households task 3.12: cloud rows never carry it. **Both modes** — local is the Dexie `locations` store (`isDefault` added in v18, see `src/db/CLAUDE.md`); cloud is the Prisma `Location` model behind `apps/server/src/schema/location.graphql`, added in cloud-locations PR 1.

**Local mode has a default location; cloud mode does not** (households task 3.12).

| | Local | Cloud |
|---|---|---|
| Default location | "My Home", `isDefault: true`, id `DEFAULT_LOCATION_ID = 'local'` | none. Rows carry no `isDefault`: the `GetLocations` document stopped selecting it. The server still declares the field until task 3.14 |
| Can a row be deleted? | every row except the default. `LocationList` shows a `Lock` icon instead of the drag handle and a spacer instead of Delete, and `deleteLocation` (Dexie) throws if called anyway | every row. The server refuses to delete the household's **last** location with the error code `LAST_LOCATION` (decision H13) |
| Fallback when the active id names no location | the `isDefault` row, then the first row | the **first** location. The server returns the list by `order` |

`LocationList` locks a row only when `location.isDefault === true`. Never read the flag as a plain boolean: it is `undefined` on every cloud row.

**A failed delete shows a toast** (`handleDelete` in `index.tsx`). It reads the error code with `hasGraphQLErrorCode` (`src/lib/graphqlErrorCode.ts`), never the message text:

| Error | Toast (`settings.locations.*`) |
|---|---|
| `LAST_LOCATION` | `deleteLastError`: "You cannot delete your last location. Add another location first." |
| anything else (another code, offline, a Dexie error) | `deleteError`: "Could not delete this location. Please try again." |

Before task 3.12 the page called `deleteLocation.mutate(location.id)` with no `onError`, so a refused delete showed nothing.

`DEFAULT_LOCATION_ID = 'local'` still exists (exported from `@/types`). It is the id of the local default only. In local mode the default is also not derivable from `order`: `LocationList` disables dragging *of* the default row, but dnd-kit's `disabled` only stops that row being picked up — another row dragged above it still displaces it.

**Operations** (`src/db/operations.ts`): `getLocations` (ordered by `order`), `createLocation(name)` (appends after the current max `order`), `updateLocation(id, updates)`, `deleteLocation(id)`, `reorderLocations(orderedIds)`.

**Delete cascade (local).** `deleteLocation` refuses the default location (`if (location.isDefault) throw`), then removes everything scoped to the location being deleted:
- its `itemStocks` rows (`where('locationId')`),
- its `inventoryLogs` (`where('locationId')`),
- its shopping carts (`id` prefixed `${locationId}:`) and every `cartItem` in them,
- finally the `locations` row itself.

Global `Item`s are **not** touched — an item stocked only in the deleted location survives as an orphan (see below). If the deleted location was the active one, `useActiveLocation` falls back to the **`isDefault`** location (local) because the stored id no longer matches any location.

**Delete cascade (cloud).** Postgres `ON DELETE CASCADE` removes the location's `ItemStock` rows and — since PR 3a gave both tables a `locationId` with the same rule — its `Cart` rows (and their `CartItem`s, which cascade from `Cart`) and its `InventoryLog` rows. That matches what local mode deletes. What does NOT match is the client cache: the cloud mutation refetches only `GetLocations`, so `AllCarts` / `AllCartItems` / `ItemLogs` observers can still hold deleted rows. **No reader can reach those rows**, which is why they are not refetched — each of the three is narrowed by location before anything renders it (checked 2026-10-07; this had been recorded as an open gap). That narrowing is by LOCATION and so does not cover a household switch. See the comment on `useDeleteLocation` for why `PantryData` / `ItemStocksForItem` are deliberately left off that list.

**Un-stocking one item** is the narrower counterpart, `removeItemFromLocation(itemId, locationId)` — see the "Orphan items" section below and `src/routes/items/CLAUDE.md` for the Stock-tab UI that calls it.

**Hooks** (`src/hooks/useLocations.ts`): `useLocations`, `useCreateLocation`, `useUpdateLocation` (takes `{ id, updates }`), `useDeleteLocation`, `useReorderLocations`. **Dual-mode** — local reads/writes Dexie, cloud runs the `GetLocations` / `CreateLocation` / `UpdateLocation` / `DeleteLocation` / `ReorderLocations` operations. Two cloud-contract details are easy to get wrong: `UpdateLocationInput` is **name-only** (reordering must go through `useReorderLocations`, and the cloud branch throws on an `order` update rather than dropping it), and `reorderLocations` returns `[Location!]!`, whose result the cloud branch writes straight into the `GetLocations` cache entry. See `src/hooks/CLAUDE.md`.

**Active location** (`src/hooks/useActiveLocation.tsx`): a React Context exposing `{ activeLocationId, setActiveLocationId, activeLocation }`, persisted in localStorage under the per-mode key `active-location-id:<mode>`, falling back, when the stored id names none of the loaded ones, to the `isDefault` location in local mode and to the first location in cloud mode. `ActiveLocationProvider` is mounted in `__root.tsx`. It also bootstraps the location's shopping carts (`bootstrapCarts`) whenever the active id changes. See `src/hooks/CLAUDE.md` for the full list of hooks that thread it.

**Route**: `src/routes/settings/household/locations.tsx` (layout) + `src/routes/settings/household/locations/index.tsx` (list). Toolbar: back button (mobile only, `lg:hidden`, because on desktop the household sidebar has Back) + title + an **Add** button opening `AddNameDialog`. Rename reuses the same `AddNameDialog` with a Save label. Linked from the household sidebar (`src/components/global/Sidebar/HouseholdSidebar.tsx`) and the mobile `/settings` accordion (`src/routes/settings/index.tsx`), both with the `MapPin` icon and `settings.locations.label`/`.description`.

**Components**:
- `src/components/location/LocationList/LocationList.tsx` — the reorderable list. One `Card` per location: drag handle (or `Lock` for the local default) · `MapPin` + name + a "Default" hint · rename (pencil) · delete (trash, absent for the local default). A cloud row is never the default, so every cloud row has a drag handle and a delete button (stories `CloudLocations` and `CloudLastLocation`). Drag-reorder via `@dnd-kit` with `PointerSensor`/`TouchSensor`/`KeyboardSensor`, mirroring `ShelfList`; keyboard instructions live in an `sr-only` paragraph (`settings.locations.dragInstructions`). Names render **as stored** — no `capitalize`, in the row label or the drag overlay. Location names are user-specified and may carry intentional casing ("iHerb pantry", "my Garage"), so they follow the vendor-name exception in the root `CLAUDE.md` "Name Display Convention" rather than the item/tag/recipe title-case rule. This matches `LocationSwitcher`, so the same location reads identically in the sidebar and here.
- `src/components/shared/LocationSwitcher/LocationSwitcher.tsx` — the global active-location selector mounted on the pantry/shopping/cooking toolbars, with a trailing "Manage locations" item linking here. Documented in `src/components/CLAUDE.md`.

**Orphan items.** Removing an item from a location (Stock tab) or deleting a location never deletes the global `Item`. An item with no `ItemStock` rows left is an **orphan**: hidden from the pantry (`getStockedItems` filters on `ItemStock`), still present in the catalog (`getAllItems`), and therefore still findable in the pantry Add combobox — selecting it there re-stocks it via copy-on-add. `deleteItem` remains the only way to remove an item everywhere.

**i18n**: `settings.locations.*` in `src/i18n/locales/{en,tw}.json`.

**Tests**: `src/routes/settings/household/locations/index.test.tsx` (route, local), `index.cloud.test.tsx` (route, cloud: the `LAST_LOCATION` toast and the general one), `index.stories.tsx` + `index.stories.test.tsx` (stories + smoke), location operations/cascade in `src/db/operations.test.ts`, E2E in `e2e/tests/location-switcher.spec.ts` and `e2e/tests/settings/locations.spec.ts`.
