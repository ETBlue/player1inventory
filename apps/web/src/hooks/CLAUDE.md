# Custom Hooks

**Navigation:**
- `useAppNavigation()` (`src/hooks/useAppNavigation.ts`) - Tracks navigation history in sessionStorage, provides `goBack()` function for smart back navigation to previous app page (fallback to home). Uses `router.history.push(previousUrl)` to preserve full URL (including search params) when going back.
- `useNavigationTracker()` (`src/hooks/useNavigationTracker.ts`) - Global hook (used in `__root.tsx`) that records every page visit as a full URL (`pathname + searchStr`) in sessionStorage. When params change on the same page, updates the last entry in place rather than appending a new one.

**Item List State:**
- `useUrlSearchAndFilters()` (`src/hooks/useUrlSearchAndFilters.ts`) - Manages search query, tag filter state, vendor/recipe filter state, and UI visibility (filters panel, tags visible) via URL params (`?q=`, `?f_<typeId>=`, `?f_vendor=id1,id2`, `?f_recipe=id1,id2`, `?filters=1`, `?tags=1`). Uses `router.history.replace` to update params in place (same history entry). Note: `filterState` only contains tag type filters — `vendor` and `recipe` keys are reserved and excluded from `filterState`. Exposes `selectedVendorIds: string[]`, `selectedRecipeIds: string[]`, `toggleVendorId(id)`, `toggleRecipeId(id)`, `clearVendorIds()`, `clearRecipeIds()`.
- `useSortFilter(storageKey)` (`src/hooks/useSortFilter.ts`) - Manages sort field and direction via localStorage key `${storageKey}-sort-prefs`. Used by all item list pages for per-page sort persistence. Accepts optional `defaultSortBy` option (defaults to `'name'`).
- `useScrollRestoration(key)` (`src/hooks/useScrollRestoration.ts`) - Saves/restores `window.scrollY` for a given key (typically the full URL). Saves scroll on component unmount (SPA navigation away); restores after data loads. Usage: call with `currentUrl` from `useRouterState`, then call `restoreScroll()` in a `useEffect` conditioned on `!isLoading`.

**Data Utilities:**
- `useVendorItemCounts()` (`src/hooks/useVendorItemCounts.ts`) - Returns `Map<vendorId, number>` of item counts per vendor, memoized with useMemo for performance
- `useItemSortData(items)` (`src/hooks/useItemSortData.ts`) - Returns `{ quantities, expiryDates, purchaseDates }` for sort operations on item lists. `quantities` is a `useMemo` (synchronous, no race condition). Local mode: `expiryDates` and `purchaseDates` are TanStack Query queries under the `['sort', ...]` key namespace. Cloud mode: uses `useLastPurchaseDatesQuery` (Apollo batch query) and derives expiry dates synchronously — no TanStack Query involved. Used by all five item list pages. Checkout explicitly invalidates `['sort', 'purchaseDates']` after purchase (local mode).
- `useItemLogs(itemId)` (`src/hooks/useInventoryLogs.ts`) - Returns inventory log entries for an item. Dual-mode: local uses TanStack Query + Dexie; cloud uses `useItemLogsQuery` (Apollo).
- `useAddInventoryLog()` (`src/hooks/useInventoryLogs.ts`) - Mutation hook to add an inventory log entry. Dual-mode: local calls `addInventoryLog`; cloud calls `useAddInventoryLogMutation` (Apollo).
