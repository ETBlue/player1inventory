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

The first fix (PR #304) covered **a page load, not a live update**. An app already open
still did not see another device's change until something remounted. Refetch on resume
was done next, in the follow-up below.

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

---

# Follow-up: the spinner regression, and refetch on resume

- **Date:** 2026-09-22
- **Branch:** `fix/loading-guard-and-resume-refetch`, stacked on `fix/cloud-queries-cache-first`
- **Status:** ✅ Fixed

Two changes that had to land together. The first repairs damage the fetch-policy fix did.
The second is what the user originally asked for.

## Change 1: `cache-and-network` hid cached data behind a spinner

`cache-and-network` delivers cached data **and** keeps Apollo's `loading` true until the
network answers. Measured directly with the test harness:

```
PROBE >>> isLoading = true | cached data present = ["Milk"]
```

The hooks passed that straight through (`isLoading: cloud.loading || !locationKnown`), and
**ten components** gate their whole render on it — `PantryListView.tsx:239`,
`ShelfGroupView.tsx:151`, `routes/items/$id.tsx:90` and seven more:

```ts
if (isLoading) {
  return <LoadingSpinner />
}
```

So PR #304 made the pantry hide data it already had, on every mount, until the network
answered. On a slow connection that is seconds of spinner over data in memory. It undoes
part of what the PWA offline work was for.

**Fix:** `isLoading` now means "nothing to show", not "a request is in flight".

```ts
isLoading: (cloud.loading && !cloud.data) || !locationKnown
```

Applied at **24 sites**. One is left alone on purpose: `useLastPurchaseDate` is still on
`cache-first`, which reports `loading: false` as soon as it serves a cached answer, so the
guard there would be dead code no test could fail on.

`isFetching` keeps its meaning — "a request is in flight". It exists on `useItems` and
`useStockedItems` only, and no component read it before this work.

### The count in the first brief was wrong

The brief said 22 hooks, from `grep "isLoading: cloud\.loading"`. That pattern misses three
sites that destructure the field instead (`isLoading: cloudLoading || ...`), two of which
needed the guard. The real number is **25 cloud `isLoading` sites, 24 guarded**. A grep on
`isLoading:` alone finds them all.

## Change 2: refetch when the app comes back to the front

`apps/web/src/apollo/ApolloWrapper.tsx` already listened to `visibilitychange` to save the
cache when hidden. It now also refetches when the app becomes visible:

| Guard | Reason |
|---|---|
| `document.visibilityState === 'visible'` | Only on resume, not on hide |
| `if (isOffline()) return` | An offline resume must not fire failing requests |
| At least `RESUME_REFETCH_MIN_GAP_MS` (30 seconds) since the last one | People switch apps constantly on mobile. 30 seconds is the shortest gap that reads as "I went away and came back" rather than "I glanced at a notification" |

The gap clock starts at **mount**, not at zero. Starting at zero would refetch on a resume
three seconds after launch, when every query on screen had just run its network leg.

`setLastSyncedAt` is **not** stamped after a resume refetch. `save()` already stamps every
5 seconds while online, so a stamp here would be replaced within five seconds.

Local mode is untouched — the effect still returns early on `!userId`.

## Change 3: the resume refetch must skip one query

`refetchQueries({ include: 'active' })` refetches every active query whatever its fetch
policy. `useLastPurchaseDate` runs once per `ItemCard`, so a large pantry would send one
request per card on every resume. Measured with a counting `ApolloLink`:

```
cards=20 | active=20 | requests before resume=0 | after=20 | delta=20
```

**Fix:** the per-card query carries a context marker and the resume refetch skips it.

```ts
onQueryUpdated: (q) => q.options.context?.[SKIP_RESUME_REFETCH_KEY] !== true
```

### Why not skip by operation name

The obvious guard is `q.queryName !== 'LastPurchaseDates'`. **It is wrong**, and it was what
the task brief asked for. There is only one operation with that name
(`apollo/operations/inventoryLogs.graphql:24`), and **two** hooks run it:

| Caller | Variables | Should refresh on resume? |
|---|---|---|
| `useLastPurchaseDate` (`useItems.ts:503`) | `itemIds: [oneId]`, one query per card | No — this is the cost |
| `useItemSortData` (`useItemSortData.ts:40`) | `itemIds: [all visible ids]`, one query total | Yes — it feeds the list's sort and expiry dates |

A name-based guard skips both, so the whole list's dates would stop refreshing. Confirmed
by mutation, in the main session as well as by the implementing agent: swapping the context
check for the name check gives `AssertionError: expected 4 to be 5` — the batch request was
skipped too.

The per-card date stays stale. That is an accepted trade, tracked in
[issue #305](https://github.com/ETBlue/player1inventory/issues/305), which removes the
per-card query entirely by making `ItemCard` read `useItemSortData`'s batch result. Both
this skip and the `cache-first` comment go away with it.

## Test added

**33 new tests.** 24 `isLoading` cases and 1 join test in `cloudFetchPolicy.cloud.test.tsx`,
6 in `ApolloWrapper.test.tsx` for the resume path, 2 more there for the skip, plus 1
assertion in `useItems.test.tsx` that the hook really sets the marker.

**The fixture is the test, twice over:**

- Every `isLoading` case serves its answer after a **60 ms delay**, so the network leg is
  genuinely in flight when the assertion runs. Without the delay the request could already
  have settled, `loading` would be false for the ordinary reason, and the test could not
  fail.
- The skip tests count **real requests** through a counting `ApolloLink`, with 3 marked
  per-card queries, 1 unmarked batch query and 1 unrelated query. A test that only checked
  "`refetchQueries` was called" would prove nothing, and a guard that skipped everything
  would still pass it.

### Mutation checks

Re-run independently in the main session, not only reported by the agent:

| Mutation | Result |
|---|---|
| Remove `&& !cloud.data` from `usePantryDataQuery` in `useStockedItems` | **RED** — `cached data is not a spinner`: `expected true to be false` |
| Replace `if (isOffline()) return` with `if (false) return` | **RED** — `user returning while offline sends no requests`: `expected "refetchQueries" to not be called at all, but actually been called 1 times` |
| Swap the context check for `q.queryName !== 'LastPurchaseDates'` | **RED** — `user returning to the app sends no per-card purchase-date request`: `expected 4 to be 5` |

Reported by the agents, not independently re-run: removing all 24 guards turned exactly 24
tests RED; removing `onQueryUpdated` entirely gave `expected 8 to be 5`;
`onQueryUpdated: () => false` gave `expected 4 to be 5` and `expected 1 to be 2`; removing
the context marker from `useItems.ts` turned the `useItems.test.tsx` assertion RED. The
resume path has six more mutations covering the visibility check, the gap check, the hidden
case, the mount-time clock and the `!userId` early return.

### A test that was passing for the wrong reason

The first version of the join test asserted `isLoading === false` immediately after
`act(() => client.refetchQueries(...))`. It stayed green under mutation. A probe showed
why:

```
PROBE before refetch loading= false ns= 7
PROBE after  refetch loading= false ns= 7   ← still the pre-refetch state
PROBE +10ms          loading= true  ns= 4
```

Apollo does not flip a query to loading synchronously, so `act()` returned before the
loading state was delivered and the assertion was reading the state from *before* the
refetch. Fixed by waiting on `isFetching === true` first.

### Suite

| Suite | Before this branch | After |
|---|---|---|
| web | 2173 tests in 248 files | **2206 tests in 248 files** |
| server | 259 tests in 20 files | 259 tests in 20 files |

All passing, verified in the main session.

## Known gaps

- **The per-card "last purchased" date stays stale** — [#305](https://github.com/ETBlue/player1inventory/issues/305).
- **The resume refetch fires only on `visibilitychange`.** It does not listen to `pageshow`
  (bfcache restore) or to the `online` event. A user who comes back while offline and then
  regains signal will not refetch until the next resume.
- **No E2E coverage.** Proving the resume path needs a real backgrounded app; proving the
  spinner needs a slow network in a browser.

## PR / commit

- `c74da651` — `fix(cloud): stop hiding cached data behind a spinner`
- `48993e82` — `feat(cloud): refetch when the app comes back to the front`
- `77554492` — `perf(cloud): stop sending one request per card on resume`
- `d413984c` — `docs(hooks): record the isLoading guard and the resume refetch`
