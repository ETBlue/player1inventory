# Custom Hooks

**Navigation:**
- `useAppNavigation()` (`src/hooks/useAppNavigation.ts`) - Tracks navigation history in sessionStorage, provides `goBack()` function for smart back navigation to previous app page (fallback to home). Uses `router.history.push(previousUrl)` to preserve full URL (including search params) when going back.
- `useNavigationTracker()` (`src/hooks/useNavigationTracker.ts`) - Global hook (used in `__root.tsx`) that records every page visit as a full URL (`pathname + searchStr`) in sessionStorage. When params change on the same page, updates the last entry in place rather than appending a new one.

**Item List State:**
- `useUrlSearchAndFilters()` (`src/hooks/useUrlSearchAndFilters.ts`) - Manages search query, tag filter state, vendor/recipe filter state, and UI visibility (filters panel, tags visible) via URL params (`?q=`, `?f_<typeId>=`, `?f_vendor=id1,id2`, `?f_recipe=id1,id2`, `?filters=1`, `?tags=1`). Uses `router.history.replace` to update params in place (same history entry). Note: `filterState` only contains tag type filters — `vendor` and `recipe` keys are reserved and excluded from `filterState`. Exposes `selectedVendorIds: string[]`, `selectedRecipeIds: string[]`, `toggleVendorId(id)`, `toggleRecipeId(id)`, `clearVendorIds()`, `clearRecipeIds()`.
- `useSortFilter(storageKey)` (`src/hooks/useSortFilter.ts`) - Manages sort field and direction via localStorage key `${storageKey}-sort-prefs`. Used by all item list pages for per-page sort persistence. Accepts optional `defaultSortBy` option (defaults to `'name'`).
- `useScrollRestoration(key, scrollRef)` (`src/hooks/useScrollRestoration.ts`) - Saves/restores the scroll position of a scroll container element for a given key (typically the full URL). The app shell pins `<main>` to the viewport so the window never scrolls — list views scroll inside an inner `overflow-y-auto` container, so the hook operates on `scrollRef.current.scrollTop` / `.scrollTo`, not `window`. Saves scroll on component unmount (SPA navigation away); restores after data loads. Usage: attach a `useRef<HTMLDivElement>(null)` to the scroll container, call with `currentUrl` from `useRouterState` + the ref, then call `restoreScroll()` in a `useEffect` conditioned on `!isLoading`. For the 4 detail-page Items tabs (tags/vendors/recipes/shelves) the scroll container is owned by `LayoutInnerPages` and shared via `<Outlet>`; those callers read the ref from `useInnerPageScrollRef()` (a context exposed by `LayoutInnerPages`).

**Data Utilities:**
- `useVendorItemCounts()` (`src/hooks/useVendorItemCounts.ts`) - Returns `Map<vendorId, number>` of item counts per vendor, memoized with useMemo for performance
- `useItemSortData(items)` (`src/hooks/useItemSortData.ts`) - Returns `{ quantities, expiryDates, purchaseDates }` for sort operations on item lists. `quantities` is a `useMemo` (synchronous, no race condition). Local mode: `expiryDates` and `purchaseDates` are TanStack Query queries under the `['sort', ...]` key namespace. Cloud mode: uses `useLastPurchaseDatesQuery` (Apollo batch query) and derives expiry dates synchronously — no TanStack Query involved. Used by all five item list pages. Checkout explicitly invalidates `['sort', 'purchaseDates']` after purchase (local mode).
- `useItemLogs(itemId)` (`src/hooks/useInventoryLogs.ts`) - Returns inventory log entries for an item. Dual-mode: local uses TanStack Query + Dexie; cloud uses `useItemLogsQuery` (Apollo).
- `useAddInventoryLog()` (`src/hooks/useInventoryLogs.ts`) - Mutation hook to add an inventory log entry. Dual-mode: local calls `addInventoryLog`; cloud calls `useAddInventoryLogMutation` (Apollo).
- `useConsumeRecipes()` (`src/hooks/useRecipes.ts`) - Batch mutation hook for cooking done. Sends all item quantity updates, inventory logs, and recipe `lastCookedAt` stamps in a single call. Dual-mode: local uses `consumeRecipesBatch` (Dexie transaction); cloud calls `useConsumeRecipesMutation` (Apollo). Used exclusively by the cooking page `handleConfirmDone`.

**Shopping:**
- `useVendorCart(vendorId: string | null)` (`src/hooks/useShoppingCart.ts`) - Gets or creates the active cart for a specific vendor (null = "No vendor" cart). Local: TanStack Query keyed `['cart', 'vendor', vendorId]`. Cloud fallback: single active cart.
- `useAllActiveCarts()` (`src/hooks/useShoppingCart.ts`) - Returns all active carts (one per vendor). Local: TanStack Query keyed `['cart', 'all-active']`. Cloud fallback: single cart wrapped in array.
- `useLastPurchasedByVendor()` (`src/hooks/useShoppingCart.ts`) - Returns a `Map<vendorId, Date | null>` of the most recent `completedAt` per vendor, derived from completed carts. Local mode only (cloud returns empty map; server-side sort deferred). Query key `['cart', 'last-purchased-by-vendor']`. Drives the `'recent'` sort on the shopping index.

**Cloud / Auth:**
- `usePostLoginMigration()` (`src/hooks/usePostLoginMigration.ts`) - Cloud mode only. Detects when a signed-in user has local IndexedDB items and has not been prompted before (localStorage `migration-prompted` key). Exposes `state: MigrationState`, `dismiss()`, and `importData(conflictResolution)`. `importData` calls `fetchLocalPayload()` then `importCloudData()` to migrate local data to cloud. Used by `PostLoginMigrationDialog`.

**Location:**
- `useLocations()` (`src/hooks/useLocations.ts`) - Returns all locations. Local-first only (no cloud GraphQL backend yet) — mode-independent. Also exposes `useCreateLocation`, `useUpdateLocation`, `useDeleteLocation`, `useReorderLocations`.
- `useActiveLocation()` (`src/hooks/useActiveLocation.tsx`) - React Context hook exposing `{ activeLocationId, setActiveLocationId, activeLocation }`. The active id is persisted in localStorage under `active-location-id` (`ACTIVE_LOCATION_STORAGE_KEY`), defaults to `DEFAULT_LOCATION_ID` (`'local'`), and falls back to the default if the stored id no longer matches any location (e.g. it was deleted). The provider `ActiveLocationProvider` is mounted in `__root.tsx` (wraps the whole app) and reads the location list via `useLocations`. **INERT (PR B):** consumed only by `LocationSwitcher` to display/persist the active location — it does NOT yet scope any page data (scoping arrives in PR D).

**Shelf:**
- `useShelvesQuery()` (`src/hooks/useShelves.ts`) - Returns all shelves. Dual-mode: local uses TanStack Query + Dexie; cloud uses `useGetShelvesQuery` (Apollo).
- `useShelfQuery(id)` (`src/hooks/useShelves.ts`) - Returns a single shelf by ID. Dual-mode.
- `useCreateShelfMutation()` / `useUpdateShelfMutation()` / `useDeleteShelfMutation()` (`src/hooks/useShelves.ts`) - CRUD mutations. Dual-mode.
- `useReorderShelvesMutation()` / `useReorderShelfItemsMutation()` (`src/hooks/useShelves.ts`) - Reorder mutations. Dual-mode.
- Note: `FilterConfig` only holds `tagIds`, `vendorIds`, `recipeIds`. Sort is handled globally via `useSortFilter`.
