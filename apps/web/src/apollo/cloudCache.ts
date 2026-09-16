import { InMemoryCache } from '@apollo/client'

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
