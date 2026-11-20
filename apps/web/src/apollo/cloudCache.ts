import {
  type FieldMergeFunction,
  InMemoryCache,
  type Reference,
} from '@apollo/client'

// One cache configuration, shared by the production client and the E2E client, so
// cloud E2E exercises the same cache semantics production does. A policy added to
// only one of the two would make E2E prove nothing about the real client.
//
// `itemStocks(locationId:)` is keyed by location: two locations' stock lists are
// separate cache entries, so switching locations cannot serve the previous
// location's rows. Verified in `client.test.ts` against the exported factory.
//
// Measured caveat, so nobody mistakes this line for the thing holding the
// invariant up: Apollo already puts every argument of a root field into its store
// key, so with `locationId` as the field's only argument this `keyArgs` matches
// the default and removing it changes no behaviour (the cache test stays green
// without it). It is kept as an explicit statement of the location dimension —
// and it is load-bearing the moment `itemStocks` gains a second argument, at
// which point this list must be extended or the two calls collapse into one
// entry. The behaviour itself is guarded by `client.test.ts`, not by this line.
//
// The three inventory-log root fields are keyed the same way (PR 3a). Their
// `locationId` is one of SEVERAL arguments, so unlike `itemStocks` these lists
// are not a restatement of the default — drop `'locationId'` from one and the
// two locations collapse into a single cache entry, which serves another
// location's logs after a switch. `inventoryLogs` is absent on purpose: it
// takes no arguments and is whole-account.
//
// `vendorCart` joins them in PR 3b, and it has the same shape as `itemLogs`:
// two arguments, so dropping `'locationId'` keys every location's cart for one
// vendor into a single entry and the shopping page serves the Kitchen's cart
// while the user is looking at the Garage. Guarded by `client.test.ts`.
// `allCarts` and `allCartItems` are absent on purpose — no arguments,
// whole-account; `cartItems(cartId:)` too, because a cart id already names its
// location (`${locationId}:${vendorId | 'no-vendor'}`).
/**
 * How one page of `householdActivity` joins the cached list (households H6,
 * task J.5). The server gives rows newest first, ordered by `createdAt`, then
 * by `id` (decision T54), and log rows are never deleted on their own (T48).
 * So every page is a run of that one order, and the cached list is always
 * the top of it.
 *
 * | The page | What happens |
 * |---|---|
 * | `before: <id>` ("Load more") | the list up to that row, then the page. A row the list already holds is not added again |
 * | `before: <id>`, and the list no longer holds that row | the page is dropped. It came late, after a refetch replaced the list, and the rows between are not known. "Load more" asks again |
 * | no `before` (the first load, or a refetch after a live event or a write) | the page, then the rows the list holds AFTER the page's last row. So new rows go on top, and the pages already loaded stay |
 * | no `before`, and the list does not hold the page's last row | the page alone. Either every row of the page is new, so the rows between the page and the list are not known, or the list is empty |
 *
 * Rows are matched by `id`, never by `createdAt`: two rows can have the same
 * time.
 *
 * A refetch is always a first page: a watched query keeps the variables it
 * was mounted with, and `fetchMore` does not change them.
 */
export const mergeActivityPage: FieldMergeFunction<Reference[]> = (
  existing,
  incoming,
  { args, readField },
) => {
  const list = existing ?? []
  const idOf = (row: Reference) => readField<string>('id', row)
  const before = (args?.before as string | null | undefined) ?? null
  if (before !== null) {
    const at = list.findIndex((row) => idOf(row) === before)
    if (at === -1) return list
    const kept = list.slice(0, at + 1)
    const keptIds = new Set(kept.map(idOf))
    return [...kept, ...incoming.filter((row) => !keptIds.has(idOf(row)))]
  }
  const last = incoming[incoming.length - 1]
  if (last === undefined) return incoming
  const at = list.findIndex((row) => idOf(row) === idOf(last))
  if (at === -1) return incoming
  return [...incoming, ...list.slice(at + 1)]
}

export function createCache() {
  return new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          itemStocks: { keyArgs: ['locationId'] },
          itemLogs: { keyArgs: ['itemId', 'locationId'] },
          inventoryLogCountByItem: { keyArgs: ['itemId', 'locationId'] },
          lastPurchaseDates: { keyArgs: ['itemIds', 'locationId'] },
          vendorCart: { keyArgs: ['vendorId', 'locationId'] },
          // `HouseholdPerson` has no `id`, so its rows are not normalised.
          // A refetch after a removal brings a SHORTER list, and without a
          // policy Apollo warns that cache data may be lost. The new list is
          // always the whole answer, so it simply replaces the old one
          // (households H5b, task G.9).
          householdMembers: { merge: false },
          // The same for `LocationPerson` (households H5c, task H.4): a
          // removal or a leave brings a shorter list. One list per location:
          // `keyArgs` keeps the `locationId` in the cache key.
          locationPeople: { keyArgs: ['locationId'], merge: false },
          // The activity log comes in pages (households H6, task J.5). One
          // list per household: `before` and `first` are not in the key, so
          // every page lands in the same list. A household switch clears the
          // whole cache (`HouseholdChangeGuard`), so a list never mixes two
          // households. `mergeActivityPage` says how a page joins the list.
          householdActivity: { keyArgs: false, merge: mergeActivityPage },
        },
      },
    },
  })
}

/**
 * One cache instance for cloud mode, created before the client.
 *
 * Persistence needs to fill this in BEFORE Apollo mounts. If the first
 * queries run first, they write empty results and destroy the stored copy.
 */

/**
 * One cache instance for cloud mode, created before the client.
 *
 * Persistence needs to fill this in BEFORE Apollo mounts. If the first
 * queries run first, they write empty results and destroy the stored copy.
 *
 * It lives in its own module so `persistence.ts` can reset it without importing
 * `client.ts`. That is NOT about an import cycle — there is none, and an earlier
 * version of this comment wrongly said there was. The reason is that
 * `client.ts` creates an `HttpLink` at module load (`client.ts:41`) and pulls in
 * `graphql-ws`, `sonner` and the i18n bundle. A module that only needs to reset
 * a cache should not drag all of that in.
 *
 * It lives for the whole page lifetime, across sign-out and sign-in. That is
 * why `clearCache()` must reset it: emptying IndexedDB alone would leave the
 * previous account's rows in memory, and the default `cache-first` policy
 * would serve them to the next account.
 */
export const cloudCache = createCache()
