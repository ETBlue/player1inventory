import type { ApolloClient, ObservableQuery } from '@apollo/client'
import {
  type ChangeKind,
  HouseholdChangedDocument,
  type HouseholdChangedSubscription,
} from '@/generated/graphql'
import { isOffline } from '@/hooks/useIsOffline'

// Live updates, the web side (households H3c-1, task C.5).
//
// One subscription to `householdChanged` per tab. An event carries no data,
// only its kind and location. The tab answers by refetching the ACTIVE
// queries (ones a mounted component is watching) that show that kind.
//
// | What happens                         | What the runner does                        |
// |--------------------------------------|---------------------------------------------|
// | an event                             | add its kind to a pending set; 300 ms after |
// |                                      | the first one, refetch once for all kinds   |
// | the socket connects for the 1st time | nothing: every query on screen just loaded  |
// | the socket connects again            | refetch every active query once: events     |
// |                                      | sent while it was closed are lost           |
// | the subscription ends (4401, or the  | wait for `online` or the tab becoming       |
// | client gave up after 5 tries)        | visible, then subscribe again, once         |
// | stop (sign-out, client replaced)     | unsubscribe; the socket is lazy and closes  |
//
// The tab that made a change never gets its own event back (the server checks
// the tab id, `clientId.ts`). It still updates itself from the mutation
// result, as it did before live updates.

/** How long to collect events before one refetch. Design, *On an event*. */
export const LIVE_BATCH_MS = 300

/**
 * The queries each kind of change can make stale, by operation name.
 *
 * A `Record` over `ChangeKind`, so when the server's `ChangeKind` enum gains
 * a kind, codegen widens the type and `tsc` fails here until the kind has an
 * entry.
 *
 * `'all'` means "refetch every active query". `LOCATION` uses it (decision
 * Q3 of the H3c-2 plan): a location change touches the switcher, the pantry,
 * carts and stock pages, and it is rare.
 *
 * Built from what each QUERY in `apollo/operations/*.graphql` selects, not
 * from file names (decision Q6). Read on 2026-11-16, households H3c-2 task
 * D.1:
 *
 * | Query                  | Selects                                    | Kinds            |
 * |------------------------|--------------------------------------------|------------------|
 * | `PantryData`           | `items { name … }` and `itemStocks`        | CATALOG, STOCK   |
 * | `ItemStocksForItem`    | `itemStocksForItem` (stock rows only)      | STOCK            |
 * | `ItemLogs`             | `itemLogs`                                 | LOG              |
 * | `InventoryLogCountByItem` | a count of logs                         | LOG              |
 * | `LastPurchaseDates`    | dates read from purchase logs              | LOG              |
 * | `GetLocations`         | `locations`, incl. the caller's `myRole`   | LOCATION         |
 * | `GetHouseholdLocations` | `householdLocations`, `myRole`, `hasOrganizer` | LOCATION     |
 * | `GetItem`, `GetItems`  | items                                      | CATALOG          |
 * | `ItemCountByTag` / `ByVendor` / `ByRecipe` | counts of item links   | CATALOG          |
 * | `GetRecipes`, `GetRecipe` | recipes, incl. `lastCookedAt`           | CATALOG          |
 * | `GetShelves`, `GetShelf` | shelves                                  | CATALOG          |
 * | `GetTagTypes`, `GetTags`, `GetTagsByType`, `TagCountByType` | tags  | CATALOG          |
 * | `GetVendors`           | vendors                                    | CATALOG          |
 * | `GetHousehold`         | the household `name` (and the caller's `role`) | CATALOG      |
 * | `VendorCart`, `AllCarts` | cart `id`, `lastPurchasedAt`             | CART             |
 * | `CartItems`, `AllCartItems` | `cartId`, `itemId`, `quantity`        | CART             |
 * | `CartItemCountByItem`  | a count of cart rows                       | CART             |
 *
 * Every `LOCATION` row above is covered by `'all'` anyway. A role change
 * (households H5b, H5c) must publish `LOCATION`, so `myRole` and
 * `hasOrganizer` refresh the same way (H5 task F.1).
 *
 * The cart queries select only ids and amounts, no item or vendor field, so
 * `CATALOG` does not refetch them. A mutation that deletes cart rows as a
 * side effect (`deleteItem`, `deleteVendor`, `removeItemFromLocation`) must
 * send `CART` as well (decision Q1), so the map stays one kind → its own
 * queries.
 *
 * Left out on purpose, because they are never ACTIVE (no mounted component
 * watches them; `lib/exportData.ts` and `lib/importData.ts` run them once
 * with `client.query`): `InventoryLogs`, `ShoppingCarts` and `AllItemStocks`
 * (`export.graphql`). `AllCartItems` is in `export.graphql` too, but
 * `useShoppingCart` also watches it, so it is in `CART`.
 * `ItemStockIdsAtLocation` (`itemStocks.graphql`) is left out for the same
 * reason: `lib/importData.ts` runs it once, with `fetchPolicy: 'no-cache'`,
 * after a cloud import (decision O9), and no component watches it.
 *
 * `GetHousehold`'s `role` changes with `setHouseholdRole` (households H5b
 * task G.5). It publishes `LOCATION`, which is `'all'`, so `GetHousehold`
 * is refetched with every other active query.
 */
export const QUERIES_BY_KIND: Record<ChangeKind, readonly string[] | 'all'> = {
  CART: [
    'VendorCart',
    'AllCarts',
    'CartItems',
    'AllCartItems',
    'CartItemCountByItem',
  ],
  STOCK: ['PantryData', 'ItemStocksForItem'],
  LOG: ['ItemLogs', 'InventoryLogCountByItem', 'LastPurchaseDates'],
  LOCATION: 'all',
  CATALOG: [
    'PantryData',
    'GetItem',
    'GetItems',
    'ItemCountByTag',
    'ItemCountByVendor',
    'ItemCountByRecipe',
    'GetRecipes',
    'GetRecipe',
    'GetShelves',
    'GetShelf',
    'GetTagTypes',
    'GetTags',
    'GetTagsByType',
    'TagCountByType',
    'GetVendors',
    'GetHousehold',
  ],
}

/**
 * The operation names to refetch for a set of kinds, or `'all'`.
 *
 * `'all'` when one kind maps to `'all'` (`LOCATION`), or when a kind is not
 * in the map. The second happens when the server is newer than this bundle
 * (a new kind deployed before the web). Refetching everything is slower but
 * never wrong; refetching nothing would leave the screen stale with no sign
 * of it.
 */
export function queriesFor(kinds: Iterable<string>): Set<string> | 'all' {
  const names = new Set<string>()
  for (const kind of kinds) {
    const list = (
      QUERIES_BY_KIND as Record<string, readonly string[] | 'all' | undefined>
    )[kind]
    if (list === undefined || list === 'all') return 'all'
    for (const name of list) names.add(name)
  }
  return names
}

/** Refetch the active queries for these kinds. Never throws. */
export function refetchForKinds(client: ApolloClient, kinds: Iterable<string>) {
  const names = queriesFor(kinds)
  // `include: 'active'` plus a filter, NOT `include: [names]`. With a list of
  // names, Apollo 4.1.6 warns in the console for every name that no mounted
  // query uses (`getObservableQueries`, invariant 90), which would be most of
  // them on most pages. A list of names also includes `standby` queries,
  // which `'active'` leaves out.
  const filter =
    names === 'all'
      ? {}
      : {
          onQueryUpdated: (oq: ObservableQuery) =>
            oq.queryName !== undefined && names.has(oq.queryName),
        }
  // The promise rejects when one refetch fails (offline, an expired token).
  // The cached data stays on screen; the next event or reconnect tries again.
  void client.refetchQueries({ include: 'active', ...filter }).catch(() => {})
}

/** The part of a `graphql-ws` client the runner uses. */
export interface LiveSocket {
  on(event: 'connected', listener: () => void): () => void
}

export interface LiveUpdatesOptions {
  client: ApolloClient
  socket: LiveSocket
  /** Tests only. */
  batchMs?: number
}

/**
 * Starts live updates for one Apollo client. Returns the stop function.
 *
 * The caller decides WHEN to run it (cloud mode, signed in): see
 * `LiveUpdatesRunner.tsx`.
 */
export function startLiveUpdates({
  client,
  socket,
  batchMs = LIVE_BATCH_MS,
}: LiveUpdatesOptions): () => void {
  let stopped = false
  let ended = false
  let connects = 0
  let pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let subscription: { unsubscribe(): void } | undefined

  const flush = () => {
    timer = undefined
    const kinds = pending
    pending = new Set()
    refetchForKinds(client, kinds)
  }

  // Counted per start, not per page load. A start after sign-in begins at 0,
  // and the pages that sign-in mounts load fresh data anyway. A subscribe
  // again after the subscription ended opens a NEW socket, which counts as a
  // reconnect here, and that refetch is what catches up on lost events.
  const offConnected = socket.on('connected', () => {
    connects += 1
    if (connects > 1) {
      void client.refetchQueries({ include: 'active' }).catch(() => {})
    }
  })

  const subscribe = () => {
    ended = false
    subscription = client
      // `no-cache`: an event is a signal, not data to keep. Without it Apollo
      // writes every event into the cache, which is then saved to IndexedDB.
      .subscribe<HouseholdChangedSubscription>({
        query: HouseholdChangedDocument,
        fetchPolicy: 'no-cache',
      })
      .subscribe({
        next: (result) => {
          // Apollo 4 delivers a socket error as `{ error }` here and then
          // completes, so `complete` below handles it.
          const kind = result.data?.householdChanged.kind
          if (!kind) return
          pending.add(kind)
          // A fixed window from the FIRST event, not a debounce: a steady
          // stream of events still refetches every 300 ms instead of never.
          if (timer === undefined) timer = setTimeout(flush, batchMs)
        },
        error: () => {
          ended = true
        },
        complete: () => {
          ended = true
        },
      })
  }

  // The subscription ends for good after close code 4401 (no user, token
  // rejected), or when graphql-ws gave up after 5 failed tries in a row
  // (Clerk or the network could not be reached, or the device was offline
  // for about a minute). It does not end on a 60-minute age close: graphql-ws
  // retries that by itself.
  //
  // Subscribe again only on a browser event that means "things may work
  // now": back online, or the user came back to the tab. Never on a timer,
  // so a server that keeps refusing gets one try per such event, not a loop.
  const resume = () => {
    if (stopped || !ended || isOffline()) return
    subscribe()
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') resume()
  }
  window.addEventListener('online', resume)
  document.addEventListener('visibilitychange', onVisibilityChange)

  subscribe()

  return () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    window.removeEventListener('online', resume)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    offConnected()
    // The socket client is lazy: with no subscription left it closes the
    // socket (code 1000). This is what closes it on sign-out.
    subscription?.unsubscribe()
  }
}
