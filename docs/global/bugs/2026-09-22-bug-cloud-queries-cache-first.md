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

- ~~**The per-card "last purchased" date stays stale**~~ — **fixed** by [#305](https://github.com/ETBlue/player1inventory/issues/305), see the section below.
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

---

# Follow-up 2: the per-card query is gone (issue #305)

- **Date:** 2026-09-22
- **Branch:** `refactor/itemcard-batch-purchase-dates`
- **Status:** ✅ Fixed

Removes the cause instead of working around it. **Both workarounds above are deleted.**

## What changed

`ItemCard` no longer runs a query. It takes the date as a **required** prop:

```ts
lastPurchaseDate: Date | null | undefined
```

Every container that renders `<ItemCard` already called `useItemSortData`, which reads
every visible item's date in **one** request. They now pass `purchaseDates?.get(item.id)`.

**16 render sites across 10 files** — not 5 files, as the task brief claimed. The five the
brief missed were `routes/settings/vendors/$id/items.tsx`,
`routes/settings/shelves/$shelfId/items.tsx`, `routes/settings/tags/$id/items.tsx`,
`routes/settings/recipes/$id/items.tsx` and `routes/shopping/$vendorId.tsx`. All of them
already called `useItemSortData`, so nothing new had to be wired.

### Deleted

| Thing | Where it was |
|---|---|
| `useLastPurchaseDate` | `hooks/useItems.ts` |
| `onQueryUpdated` opt-out on the resume refetch | `apollo/ApolloWrapper.tsx` |
| `SKIP_RESUME_REFETCH_KEY`, `SKIP_RESUME_REFETCH_CONTEXT` | `apollo/constants.ts` |

`grep -rn "SKIP_RESUME_REFETCH" apps/web/src` now returns nothing. `useLastPurchaseDate`
survives only in five comments that say it is gone and why, so nobody re-adds it.

The query also moved off `cache-first` by disappearing: the batch query it now reads is on
`cache-and-network`, so the "Expires in N days" estimate refreshes with the rest of the
pantry. Before, it showed whatever the restored IndexedDB snapshot held.

## Search-tail rows have no date, on purpose

Five files have a `renderTailItemCard`. Its bucket-3 rows are items **not stocked in the
active location**, so they are not in the array passed to `useItemSortData` and
`purchaseDates.get(id)` returns `undefined`. This matches the old behaviour — no stock here
means no purchase here — and the expiry chip needs `currentQuantity > 0` anyway, which such
a row never has. A comment at each of the five sites says so.

## Freshness did not get worse

The old per-card key was `['items', itemId, 'lastPurchase', { locationId }]`; the new source
is `['sort', 'purchaseDates', …]`. Checkout invalidates **both** (`useShoppingCart.ts:279`,
with `:320` / `:365` evicting the `lastPurchaseDates` root field in cloud), and purge
invalidates `['sort']` (`useItems.ts`). No refresh trigger was lost.

## Test added

Net **+3 web tests** (2206 → 2209): four new `ItemCard` prop tests, one new story plus its
smoke test, the card-count test became `it.each([3, 30])`, and three tests for the deleted
hook were removed.

### Mutation checks

Re-run independently in the main session:

| Mutation | Result |
|---|---|
| Add a per-card `useLastPurchaseDatesQuery` back into `ItemCard` | **RED, 3 tests** — both card-count cases and the resume test: `expected undefined to be 1` |
| Delete one `lastPurchaseDate={…}` prop in `PantryListView.tsx` | **RED at compile time** — `error TS2741: Property 'lastPurchaseDate' is missing … but required in type 'ItemCardProps'` |

Reported by the agent, not independently re-run: passing `undefined` to `computeExpiryDate`
gave `Unable to find an element with the text: Expires in 10 days`; adding
`onQueryUpdated: () => true` back gave `expected "refetchQueries" to be called with
arguments: [ { include: 'active' } ]`; deleting a story's date override gave `Unable to find
an element with the text: Expires in 5 days`.

**The card-count test uses `it.each([3, 30])` for a reason.** A single fixture size cannot
tell "one request" from "one request per card". With the mutation applied the counts were
`expected 4 to be 1` at 3 cards and `expected 31 to be 1` at 30 — the scaling is what the
test measures.

**Two tests stay green under the date mutation and are named as negative controls**, not as
coverage: removing a date cannot make an absent expiry chip appear.

## Known gaps

- **Tests and stories get no `tsc` enforcement for the required prop.**
  `apps/web/tsconfig.app.json` excludes `**/*.test.tsx` and `**/*.stories.tsx`, so the
  compiler checks the 16 production sites only. A future test that omits the prop compiles
  and simply renders no expiry chip.
- **A *wrong* expression would not be caught.** `tsc` catches a missing prop. Passing
  `expiryDates?.get(item.id)` instead of `purchaseDates?.get(item.id)` type-checks, and no
  test would fail. Catching that needs a container-level test per view.
- **No E2E run.** The change is prop plumbing with no new route or UI element, so no spec
  was expected to need updating, but that was not verified by running them.

## PR / commit

- `df809206` — `refactor(items): read the batch purchase date in ItemCard instead of querying per card`
- `1d1ab601` — `docs(hooks): drop the per-card purchase-date query and its two workarounds`
