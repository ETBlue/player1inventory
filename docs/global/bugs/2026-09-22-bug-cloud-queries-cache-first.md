# Bug: cloud data is stale until you open each item

- **Date:** 2026-09-22
- **Environment:** production, cloud mode, iOS home-screen app (standalone PWA)
- **Reported by:** ETBlue
- **Status:** ✅ Fixed

## Bug description

The user installed the app on an iOS home screen. In standalone mode there is no
browser reload button and no pull-to-refresh, so there is no way to ask for fresh
data.

| | |
|---|---|
| **Expected** | Opening the app shows current stock. |
| **Actual** | Stock is stale. The user has to open each item to see a current value. |

## Root cause

Twenty-two cloud queries run with **no `fetchPolicy`**, so they use Apollo's default
`cache-first`. The cloud Apollo cache is persisted to IndexedDB
(`Player1InventoryCloudCache`) and restored **before React mounts**
(`main.tsx` → `bootstrap.ts` → `persistence.ts`). That snapshot has no TTL and no
expiry. `cache-first` finds a complete result in it and **sends no request at all**.

`usePantryDataQuery` (`useItems.ts:260` and `:313`) is the query behind the pantry
stock display, which is what the user feels.

This is the same root cause as
[the location list bug](../../features/locations/2026-09-21-bug-location-list-stale-on-other-device.md)
(#301), fixed 2026-09-21. That doc states `useLocations` was "the **only** cloud list
hook without a fetch policy". **That is not correct.** Its table covered the
top-level list query in six files; other queries in those same files, and every query
in `useItems.ts`, were missed.

Full list of queries with no policy:

| File | Line | Query |
|---|---|---|
| `useItemSortData.ts` | 33 | `useLastPurchaseDatesQuery` |
| `useItems.ts` | 260 | `usePantryDataQuery` |
| `useItems.ts` | 313 | `usePantryDataQuery` |
| `useItems.ts` | 365 | `useGetItemQuery` |
| `useItems.ts` | 428 | `useLastPurchaseDatesQuery` |
| `useItems.ts` | 1135 | `useInventoryLogCountByItemQuery` |
| `useItems.ts` | 1162 | `useCartItemCountByItemQuery` |
| `useRecipes.ts` | 40 | `useGetRecipesQuery` |
| `useRecipes.ts` | 69 | `useGetRecipeQuery` |
| `useShoppingCart.ts` | 47 | `useCartItemsQuery` |
| `useShoppingCart.ts` | 486 | `useAllCartsQuery` |
| `useItemStocks.ts` | 50 | `useItemStocksForItemQuery` |
| `useTags.ts` | 45 | `useGetTagTypesQuery` |
| `useTags.ts` | 208 | `useGetTagsQuery` |
| `useTags.ts` | 250 | `useGetTagsByTypeQuery` |
| `useTags.ts` | 482 | `useTagCountByTypeQuery` |
| `useVendors.ts` | 33 | `useGetVendorsQuery` |
| `useShelves.ts` | 35 | `useGetShelvesQuery` |
| `useShelves.ts` | 64 | `useGetShelfQuery` |
| `routes/shopping/index.tsx` | 67 | `useAllCartItemsQuery` |
| `useItems.ts` | 366 | `useItemStocksForItemQuery` |
| `useShoppingCart.ts` | 524 | `useAllCartsQuery` (in `useLastPurchasedByVendor`) |

The last two rows were **missing from the first version of this table**. The sweep
script that produced it used a regular expression that stopped at the first match
inside a block, so a second query in the same block was not seen. The real count is
22, not 20. Anyone repeating this sweep should check the script's output against the
file by hand.

## Scope note

This fixes **a page load, not a live update**. An app already open will still not see
another device's change until something remounts. Refetch-on-resume is separate work.

## Fix applied

**21 queries changed to `fetchPolicy: 'cache-and-network'`**, across nine files:
`useItemSortData.ts`, `useItems.ts`, `useItemStocks.ts`, `useRecipes.ts`,
`useShoppingCart.ts`, `useTags.ts`, `useVendors.ts`, `useShelves.ts`, and
`routes/shopping/index.tsx`.

**Each one is paired with an `isError` guard:**

```ts
isError: !!cloud.error && !cloud.data   // not just !!cloud.error
```

With `cache-and-network` the network leg runs on every mount and fails when offline.
Without the guard, an offline user sees an error state over good cached data — the
opposite of what the offline mode is for.

**No `errorPolicy` was added.** `errorPolicy: 'all'` moves cached data to
`previousData` and leaves `data` undefined, which empties the list for an offline
user. Measured on Apollo Client 4.1.6 in the locations bug, and pinned RED by a test
here too.

**Also fixed, beyond the reported bug:** five hooks that already ran
`cache-and-network` had the unguarded `isError` form and reported a false error
offline — `useItemLogs`, `useVendorCart`, `useItemCountByTag`, `useItemCountByVendor`,
`useItemCountByRecipe`. The locations bug doc had recorded this as out of scope.

### Two queries stay on `cache-first`, on purpose

| Site | Reason |
|---|---|
| `useItems.ts` `useLastPurchaseDate` (`LastPurchaseDates` with one `itemId`) | Called once per `ItemCard`. `lastPurchaseDates` is keyed by `itemIds` (`apollo/cloudCache.ts:42`), so every card owns a separate cache entry and deduplication cannot merge them. Flipping it would send one request per visible card on every pantry mount. The batch call in `useItemSortData` refreshes the same dates for the whole list in one request, and that one **is** flipped. |
| `useCloudLocationId.ts:50` `useCloudLocationKnown` | Decided in the locations bug. It rides the cache write from `useLocations`' network leg. Untouched. |

### A measurement that changed the approach

The first plan was to give the network leg to only one hook of each pair that
observes the same document, the way `useCloudLocationKnown` does. That turned out to
be unnecessary. Apollo's `queryDeduplication` is on by default and is never disabled
in `apollo/client.ts`, so two identical in-flight operations collapse into **one**
network request. Both halves of each pair now carry the policy, and neither depends
on the other being mounted. Three request-counting tests pin this
(`cloudFetchPolicy.cloud.test.tsx:808`, `describe('two hooks on one document still
cost one request')`).

## Test added

**54 new tests.** `apps/web/src/hooks/cloudFetchPolicy.cloud.test.tsx` holds 53, and
one more went into `apps/web/src/routes/shopping/index.cloud.test.tsx`.

The file is table-driven over 25 query cases. Each case gets two tests:

1. **The stale-cache test.** A warm `InMemoryCache` holds a smaller or older answer
   than the `MockedProvider` link serves. Under `cache-first` the hook reads the cache
   and stops, so the assertion cannot pass. This is the fixture shape that can tell
   the two policies apart — a cache and a mock holding the same data would pass under
   both and prove nothing.
2. **The offline test.** A warm cache plus a link that fails every request. Cached
   data must survive and `isError` must stay false.

### Mutation checks

Run by the implementing agent, then **re-run independently** in the main session:

| Mutation | Result |
|---|---|
| Remove `fetchPolicy` from `usePantryDataQuery` in `useItems` — the reported symptom | **RED, exactly one test:** `user reopening the app sees what another device changed` — `AssertionError: expected [ 'Milk' ] to deeply equal [ 'Milk', 'Rice' ]`. No other case moved, so the cases are independent. |
| Revert one `isError` guard to `!!cloud.error` in `useItemStocks.ts` | **RED, exactly one test:** `AssertionError: expected true to be false` |
| Restore both | **GREEN — 53 of 53** |

The agent also reported these, which were not independently re-run: deleting every
`fetchPolicy` line turned 20 of 20 stale-cache tests RED; reverting every `isError`
guard turned 22 of 22 offline tests RED; adding `errorPolicy: 'all'` to
`useGetTagsQuery` gave `expected undefined to deeply equal [ 'Dairy', 'Frozen' ]`.

Three cases stay green under the `isError` mutation on purpose, and the test table
says why in-line: `useItemSortData` returns no `isError`, and
`useInventoryLogCountByItem` / `useCartItemCountByItem` hardcode `isError: false` in
their cloud branch. Their offline tests pin that `data` survives, not a guard.

### Suite after the fix

| Suite | Before | After |
|---|---|---|
| web | 2119 tests in 247 files | **2173 tests in 248 files** |
| server | 259 tests in 20 files | 259 tests in 20 files |

All passing. Verified in the main session, not only reported.

## Known gaps

- **`useLastPurchaseDate` stays stale.** The "last purchased" date on each pantry
  `ItemCard` still reads the restored cache. Fixing it means making `ItemCard` read
  from `useItemSortData`'s batch result instead of issuing its own one-item query —
  a refactor, not a policy change.
- **The route-level `AllCartItems` test is weaker than the other 25.** It asserts the
  options the route passed rather than driving real Apollo through a stale cache. It
  goes RED when the line is deleted, but it does not re-prove `cache-and-network`
  semantics. Moving that query into a hook in `src/hooks/` would let it join the
  table.
- **This fixes a page load, not a live update.** An app that is already open still
  will not see another device's change until something remounts. Refetch on resume is
  separate work — see the *Scope note* above.
- **No E2E coverage.** Proving the multi-device path needs two browser contexts
  sharing one cloud account.
- **`isLoading` is untouched.** It is now `true` during the network leg even when
  cached data is present, for every changed hook. Which consumers render a spinner
  over a list they already have was not audited.

## PR / commit

- `96be54e9` — `fix(cloud): refetch cloud reads on mount instead of serving a stale cache`
- `70f8a818` — `docs(hooks): record the cloud read fetch policy`
- PR: *TBD*
