# Bug: Expiration Badge Stale After Purchase Complete

## Bug Description

After completing a purchase (checkout) in the shopping cart, the expiration badge on the pantry page does not update — it shows the old expiration status until the user manually refreshes the page.

## Root Cause

`useCheckout()` in `apps/web/src/hooks/useShoppingCart.ts` invalidates `['items']` after checkout. In TanStack Query v5, `invalidateQueries({ queryKey: ['items'] })` fuzzy-matches `['items', itemId, 'lastPurchase']` and marks those queries as `isInvalidated: true`. However, the default `refetchType: 'active'` only triggers an immediate background refetch for queries with **active observers** (mounted components).

When the user is on the shopping page, the pantry's `ItemCard` components are unmounted — their `useLastPurchaseDate` observers are inactive. The queries get marked stale but are NOT refetched. When the user navigates back to the pantry, React renders the cached (stale) `lastPurchase` date for one frame before the newly-mounted observer triggers a refetch, causing a visible flash of the old expiration badge.

## Fix Applied

In `useCheckout()`, changed `invalidateQueries({ queryKey: ['items'] })` to `invalidateQueries({ queryKey: ['items'], refetchType: 'all' })` in all three execution paths:

1. Local mode `onSuccess` callback
2. Cloud mode `mutate()` `.then()` handler
3. Cloud mode `mutateAsync()` sequential `await`

`refetchType: 'all'` triggers an immediate background refetch for ALL matching queries — both active (mounted components) and inactive (unmounted) — so cached data is fresh before the user navigates to pantry.

**File:** `apps/web/src/hooks/useShoppingCart.ts` (lines 239, 263, 291)

In addition, for cloud mode, `useLastPurchaseDatesQuery` (Apollo) was not being refetched because TanStack Query invalidations have no effect on Apollo queries. The initial fix added `{ query: LastPurchaseDatesDocument }` (no variables) to the `refetchQueries` array, but this did not work: Apollo matches cache entries by document + variables, so `LastPurchaseDates()` (no variables) does not match `LastPurchaseDates({"itemIds":["item-1"]})` stored in the cache. Apollo served stale `cache-first` data when pantry remounted.

The correct fix is Apollo cache eviction. After the checkout mutation resolves:

1. `{ query: LastPurchaseDatesDocument }` was **removed** from both `refetchQueries` arrays — it doesn't work without variables
2. `client.cache.evict({ id: 'ROOT_QUERY', fieldName: 'lastPurchaseDates' })` + `client.cache.gc()` was added in both the `mutate()` `.then()` handler and after the `mutateAsync()` await

Cache eviction removes all `lastPurchaseDates` entries from the Apollo cache regardless of their variable set. On pantry remount, `useLastPurchaseDatesQuery` finds no cached data and fetches fresh results from the server.

`useApolloClient()` is called unconditionally at the top of `useCheckout()` (required by React's Rules of Hooks). It is safe to call in local mode because `apps/web/src/main.tsx` always wraps the app in an `ApolloProvider` — in local mode it uses a no-op `localModeApolloClient` (empty `ApolloLink`). The eviction call itself only executes inside the `if (mode === 'cloud')` branch.

**File:** `apps/web/src/hooks/useShoppingCart.ts`

## Tests Added

**Unit test** — `apps/web/src/hooks/useShoppingCart.test.ts`, describe block:
`useCheckout (local mode) — refetches lastPurchase for inactive queries`

Scenario:
1. Seeds `['items', 'item-1', 'lastPurchase']` via `prefetchQuery` (registers queryFn) to simulate a previously-visited pantry page
2. Forces stale data into the cache (simulates time passing)
3. Runs `useCheckout().mutateAsync()` with no active observer (no ItemCard mounted)
4. Asserts the `queryFn` was called (background refetch fired)
5. Asserts cached value is the fresh post-checkout date

**E2E test** — `e2e/tests/shopping.spec.ts`:
`user can see expiration badge updated after checkout without manual refresh`

Scenario:
1. Seeds item with `expirationMode: 'days from purchase'`, `estimatedDueDays: 7`, old inventory log (90 days ago), and active cart via `page.evaluate()` + IndexedDB
2. Navigates to pantry, asserts "Expired 83 days ago" badge is visible
3. Navigates to shopping, confirms cart item is checked
4. Clicks Done → Confirm, waits for Done button to become disabled (checkout complete)
5. Navigates to pantry without refresh, asserts "Expires in 7 days" badge is visible
6. Asserts old "Expired" badge is gone

## PR / Commit

Fix commit: `eb82189` — `fix(checkout): refetch lastPurchase queries for all items after checkout`
E2E test commit: `11187d6` — `test(e2e): add expiration badge post-checkout E2E test`
