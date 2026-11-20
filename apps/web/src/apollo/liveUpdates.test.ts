import {
  ApolloClient,
  ApolloLink,
  gql,
  InMemoryCache,
  Observable,
} from '@apollo/client'
import { getMainDefinition } from '@apollo/client/utilities'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as generated from '@/generated/graphql'
import { elementAt } from '@/test/narrow'
import {
  LIVE_BATCH_MS,
  type LiveSocket,
  QUERIES_BY_KIND,
  queriesFor,
  startLiveUpdates,
} from './liveUpdates'

// Two cart queries and one query no cart change touches. The names are the
// real operation names, so `QUERIES_BY_KIND` matches them.
const VENDOR_CART = gql`
  query VendorCart {
    probeVendorCart
  }
`
const ALL_CARTS = gql`
  query AllCarts {
    probeAllCarts
  }
`
const GET_ITEMS = gql`
  query GetItems {
    probeItems
  }
`
const ITEM_STOCKS_FOR_ITEM = gql`
  query ItemStocksForItem {
    probeItemStocksForItem
  }
`
const ITEM_LOGS = gql`
  query ItemLogs {
    probeItemLogs
  }
`

type Emitter = {
  next: (value: ApolloLink.Result) => void
  error: (e: unknown) => void
  complete: () => void
}

/**
 * A real ApolloClient over a link the test drives:
 * - each query answers at once with a new value, and is counted by name;
 * - each subscription stays open until the test pushes an event, ends it, or
 *   the runner unsubscribes.
 */
function makeHarness() {
  const sent: string[] = []
  const subscriptions: { emit: Emitter; closed: boolean }[] = []
  let answer = 0
  const link = new ApolloLink((operation) => {
    const def = getMainDefinition(operation.query)
    if (
      def.kind === 'OperationDefinition' &&
      def.operation === 'subscription'
    ) {
      return new Observable<ApolloLink.Result>((observer) => {
        const entry = { emit: observer as Emitter, closed: false }
        subscriptions.push(entry)
        return () => {
          entry.closed = true
        }
      })
    }
    sent.push(operation.operationName ?? '?')
    answer += 1
    const field = (def.kind === 'OperationDefinition' &&
      def.selectionSet.selections[0]?.kind === 'Field' &&
      def.selectionSet.selections[0].name.value) as string
    return new Observable<ApolloLink.Result>((observer) => {
      observer.next({ data: { [field]: answer } })
      observer.complete()
    })
  })
  const client = new ApolloClient({ link, cache: new InMemoryCache() })

  const connectedListeners = new Set<() => void>()
  const socket: LiveSocket = {
    on: (_event, listener) => {
      connectedListeners.add(listener)
      return () => connectedListeners.delete(listener)
    },
  }

  return {
    client,
    socket,
    sent,
    subscriptions,
    /** Count of requests sent for one operation name. */
    count: (name: string) => sent.filter((n) => n === name).length,
    connect: () => {
      for (const l of connectedListeners) l()
    },
    listenerCount: () => connectedListeners.size,
    /** The open subscription, the one the runner listens to now. */
    live: () => {
      const open = subscriptions.filter((s) => !s.closed)
      if (open.length !== 1) {
        throw new Error(`expected 1 open subscription, found ${open.length}`)
      }
      return open[0] as { emit: Emitter }
    },
  }
}

function cartEvent(kind: string = 'CART') {
  return {
    data: {
      householdChanged: {
        __typename: 'ChangeEvent',
        kind,
        locationId: 'loc-1',
      },
    },
  }
}

/** Mounts three queries, as three components on a page would. */
async function watchAll(h: ReturnType<typeof makeHarness>) {
  const subs = [VENDOR_CART, ALL_CARTS, GET_ITEMS].map((query) =>
    h.client.watchQuery({ query }).subscribe(() => {}),
  )
  await vi.advanceTimersByTimeAsync(0)
  expect(h.sent.sort()).toEqual(['AllCarts', 'GetItems', 'VendorCart'])
  h.sent.length = 0
  return () => {
    for (const s of subs) s.unsubscribe()
  }
}

function setOnLine(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  setOnLine(true)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('QUERIES_BY_KIND', () => {
  it('CART refetches the five cart queries and the activity log', () => {
    expect(QUERIES_BY_KIND.CART).toEqual([
      'VendorCart',
      'AllCarts',
      'CartItems',
      'AllCartItems',
      'CartItemCountByItem',
      // `removeAllLocationItems` logs a row and may send CART alone
      // (households H6, decision T57)
      'HouseholdActivity',
    ])
  })

  it('STOCK refetches the two stock queries and the activity log', () => {
    expect(QUERIES_BY_KIND.STOCK).toEqual([
      'PantryData',
      'ItemStocksForItem',
      'HouseholdActivity',
    ])
  })

  it('LOG refetches the three log queries', () => {
    expect(QUERIES_BY_KIND.LOG).toEqual([
      'ItemLogs',
      'InventoryLogCountByItem',
      'LastPurchaseDates',
    ])
  })

  it('LOCATION refetches every active query', () => {
    expect(QUERIES_BY_KIND.LOCATION).toBe('all')
    expect(queriesFor(['LOCATION'])).toBe('all')
  })

  it('CATALOG refetches every query that selects a catalog field, the pantry included', () => {
    // `PantryData` selects `items { name … }`, so an item rename must
    // refetch it. The household name (`GetHousehold`) is catalog too.
    expect([...(QUERIES_BY_KIND.CATALOG as readonly string[])].sort()).toEqual(
      [
        'GetHousehold',
        'GetItem',
        'GetItems',
        'GetRecipe',
        'GetRecipes',
        'GetShelf',
        'GetShelves',
        'GetTagTypes',
        'GetTags',
        'GetTagsByType',
        'GetVendors',
        // Households H6, decision T57
        'HouseholdActivity',
        // Households H6b task K.5: each offer names its household
        'MyOwnershipOffers',
        'ItemCountByRecipe',
        'ItemCountByTag',
        'ItemCountByVendor',
        'PantryData',
        'TagCountByType',
      ].sort(),
    )
  })

  it('CATALOG does not refetch the cart, stock-only or log queries', () => {
    // The cart queries select only ids and amounts. A mutation that also
    // changes carts sends CART itself (decision Q1 of the H3c-2 plan).
    const names = queriesFor(['CATALOG'])
    if (names === 'all') throw new Error('CATALOG must not refetch everything')
    // `HouseholdActivity` is in CART, STOCK and CATALOG on purpose (households
    // H6, decision T57), so it is left out here.
    for (const name of [
      ...(QUERIES_BY_KIND.CART as readonly string[]).filter(
        (n) => n !== 'HouseholdActivity',
      ),
      'ItemStocksForItem',
      ...(QUERIES_BY_KIND.LOG as readonly string[]),
    ]) {
      expect(names.has(name)).toBe(false)
    }
  })

  it('STOCK and CATALOG together give the union, with PantryData once', () => {
    expect(queriesFor(['STOCK', 'CATALOG'])).toEqual(
      new Set([
        ...(QUERIES_BY_KIND.STOCK as readonly string[]),
        ...(QUERIES_BY_KIND.CATALOG as readonly string[]),
      ]),
    )
  })

  it('names only operations that exist in apollo/operations', () => {
    // A renamed operation would silently stop being refetched. Every name
    // must have a generated `<Name>Document`.
    for (const names of Object.values(QUERIES_BY_KIND)) {
      if (names === 'all') continue
      for (const name of names) {
        expect(Object.keys(generated)).toContain(`${name}Document`)
      }
    }
  })

  it('names only queries, not mutations or subscriptions', () => {
    // A mutation name would never match an active query, so it would refetch
    // nothing, silently.
    for (const names of Object.values(QUERIES_BY_KIND)) {
      if (names === 'all') continue
      for (const name of names) {
        const doc = (generated as Record<string, unknown>)[
          `${name}Document`
        ] as {
          definitions: { kind: string; operation?: string }[]
        }
        const op = doc.definitions.find((d) => d.kind === 'OperationDefinition')
        expect(op?.operation).toBe('query')
      }
    }
  })

  it('a kind this bundle does not know refetches everything', () => {
    // A newer server can send a kind an older web bundle has no entry for.
    expect(queriesFor(['CART', 'FROM_THE_FUTURE'])).toBe('all')
    expect(queriesFor(['CART'])).toEqual(
      new Set(QUERIES_BY_KIND.CART as readonly string[]),
    )
  })
})

describe('startLiveUpdates — events', () => {
  it('user sees one refetch of the cart queries for many changes in 300 ms', async () => {
    // Given a page showing two cart queries and the item list
    const h = makeHarness()
    const unwatch = await watchAll(h)
    const stop = startLiveUpdates({ client: h.client, socket: h.socket })

    // When three cart events arrive within the batch window
    h.live().emit.next(cartEvent())
    await vi.advanceTimersByTimeAsync(100)
    h.live().emit.next(cartEvent())
    await vi.advanceTimersByTimeAsync(100)
    h.live().emit.next(cartEvent())

    // Then nothing is refetched before the window ends
    await vi.advanceTimersByTimeAsync(LIVE_BATCH_MS - 201)
    expect(h.sent).toEqual([])

    // And when it ends, each cart query is refetched exactly once
    await vi.advanceTimersByTimeAsync(1)
    expect(h.count('VendorCart')).toBe(1)
    expect(h.count('AllCarts')).toBe(1)
    // And the item list, which no cart change touches, is not
    expect(h.count('GetItems')).toBe(0)

    stop()
    unwatch()
  })

  it('refetches the union of the kinds in one window', async () => {
    // Given a page with cart queries and the item list
    const h = makeHarness()
    const unwatch = await watchAll(h)
    const stop = startLiveUpdates({ client: h.client, socket: h.socket })

    // When a CART event and an unknown kind arrive in one window
    h.live().emit.next(cartEvent())
    h.live().emit.next(cartEvent('FROM_THE_FUTURE'))
    await vi.advanceTimersByTimeAsync(LIVE_BATCH_MS)

    // Then one refetch covers both: every active query, once each
    expect(h.sent.sort()).toEqual(['AllCarts', 'GetItems', 'VendorCart'])

    stop()
    unwatch()
  })

  it('a second window after the first one refetches again', async () => {
    // Given one batch already refetched
    const h = makeHarness()
    const unwatch = await watchAll(h)
    const stop = startLiveUpdates({ client: h.client, socket: h.socket })
    h.live().emit.next(cartEvent())
    await vi.advanceTimersByTimeAsync(LIVE_BATCH_MS)
    expect(h.count('VendorCart')).toBe(1)

    // When another event comes later
    h.live().emit.next(cartEvent())
    await vi.advanceTimersByTimeAsync(LIVE_BATCH_MS)

    // Then it refetches again
    expect(h.count('VendorCart')).toBe(2)

    stop()
    unwatch()
  })

  it('stop drops a pending batch and unsubscribes', async () => {
    // Given an event waiting in the batch window
    const h = makeHarness()
    const unwatch = await watchAll(h)
    const stop = startLiveUpdates({ client: h.client, socket: h.socket })
    h.live().emit.next(cartEvent())

    // When live updates stop (sign-out)
    stop()
    await vi.advanceTimersByTimeAsync(LIVE_BATCH_MS * 2)

    // Then nothing is refetched, the subscription is closed, and the
    // `connected` listener is gone
    expect(h.sent).toEqual([])
    expect(h.subscriptions.every((s) => s.closed)).toBe(true)
    expect(h.listenerCount()).toBe(0)

    unwatch()
  })
})

describe('startLiveUpdates — the H3c-2 kinds', () => {
  /** Mounts the pantry-like set: carts, items, stock and logs. */
  async function watchMany(h: ReturnType<typeof makeHarness>) {
    const subs = [
      VENDOR_CART,
      ALL_CARTS,
      GET_ITEMS,
      ITEM_STOCKS_FOR_ITEM,
      ITEM_LOGS,
    ].map((query) => h.client.watchQuery({ query }).subscribe(() => {}))
    await vi.advanceTimersByTimeAsync(0)
    expect(h.sent).toHaveLength(5)
    h.sent.length = 0
    return () => {
      for (const s of subs) s.unsubscribe()
    }
  }

  it('user sees stock and catalog refetched together for a STOCK and a CATALOG change in one window', async () => {
    // Given a page with cart, item, stock and log queries
    const h = makeHarness()
    const unwatch = await watchMany(h)
    const stop = startLiveUpdates({ client: h.client, socket: h.socket })

    // When a STOCK event and a CATALOG event arrive in one window
    h.live().emit.next(cartEvent('STOCK'))
    h.live().emit.next(cartEvent('CATALOG'))
    await vi.advanceTimersByTimeAsync(LIVE_BATCH_MS)

    // Then the stock query and the item list are refetched once each, and
    // the cart and log queries are not
    expect(h.sent.sort()).toEqual(['GetItems', 'ItemStocksForItem'])

    stop()
    unwatch()
  })

  it('user sees every query refetched when a LOCATION change is in the window', async () => {
    // Given a page with cart, item, stock and log queries
    const h = makeHarness()
    const unwatch = await watchMany(h)
    const stop = startLiveUpdates({ client: h.client, socket: h.socket })

    // When a LOG event and a LOCATION event arrive in one window
    h.live().emit.next(cartEvent('LOG'))
    h.live().emit.next(cartEvent('LOCATION'))
    await vi.advanceTimersByTimeAsync(LIVE_BATCH_MS)

    // Then every active query is refetched, once each
    expect(h.sent.sort()).toEqual([
      'AllCarts',
      'GetItems',
      'ItemLogs',
      'ItemStocksForItem',
      'VendorCart',
    ])

    stop()
    unwatch()
  })
})

describe('startLiveUpdates — reconnect', () => {
  it('first connect refetches nothing, the second refetches every active query once', async () => {
    // Given a page with three active queries
    const h = makeHarness()
    const unwatch = await watchAll(h)
    const stop = startLiveUpdates({ client: h.client, socket: h.socket })

    // When the socket connects for the first time
    h.connect()
    await vi.advanceTimersByTimeAsync(0)

    // Then nothing is refetched: the page just loaded
    expect(h.sent).toEqual([])

    // When it connects again (after a drop or the 60-minute limit)
    h.connect()
    await vi.advanceTimersByTimeAsync(0)

    // Then every active query is refetched once, cart or not
    expect(h.sent.sort()).toEqual(['AllCarts', 'GetItems', 'VendorCart'])

    stop()
    unwatch()
  })
})

describe('startLiveUpdates — after the subscription ends', () => {
  async function startAndEnd() {
    const h = makeHarness()
    const stop = startLiveUpdates({ client: h.client, socket: h.socket })
    expect(h.subscriptions).toHaveLength(1)
    // The socket was closed with 4401, or graphql-ws gave up after 5 tries.
    // GraphQLWsLink errors the link observable; Apollo 4 turns that into
    // `{ error }` and completes.
    h.live().emit.error(new Error('4401: Unauthorized'))
    await vi.advanceTimersByTimeAsync(0)
    expect(h.subscriptions.filter((s) => !s.closed)).toHaveLength(0)
    return { h, stop }
  }

  it('subscribes again when the browser comes back online', async () => {
    const { h, stop } = await startAndEnd()

    // When the browser reports it is online
    window.dispatchEvent(new Event('online'))

    // Then one new subscription is open
    expect(h.subscriptions).toHaveLength(2)
    expect(() => h.live()).not.toThrow()

    stop()
  })

  it('subscribes again when the tab becomes visible', async () => {
    const { h, stop } = await startAndEnd()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')

    document.dispatchEvent(new Event('visibilitychange'))

    expect(h.subscriptions).toHaveLength(2)
    stop()
  })

  it('does not subscribe again while offline, or on a timer', async () => {
    const { h, stop } = await startAndEnd()

    // When time passes with no browser event
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    // And a visibility change arrives while the device is offline
    setOnLine(false)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    // Then no new subscription was opened
    expect(h.subscriptions).toHaveLength(1)
    stop()
  })

  it('does not open a second subscription while the first is still open', async () => {
    // Given a subscription that has NOT ended
    const h = makeHarness()
    const subscribe = vi.spyOn(h.client, 'subscribe')
    const stop = startLiveUpdates({ client: h.client, socket: h.socket })

    // When the browser comes online and the tab becomes visible
    window.dispatchEvent(new Event('online'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    // Then the runner asked Apollo for one subscription only. Counting the
    // link's subscriptions is not enough: Apollo shares one link
    // subscription between identical `client.subscribe` calls, so a second
    // call would not show there.
    expect(subscribe).toHaveBeenCalledTimes(1)

    // And stop leaves nothing open. A second Apollo subscriber the runner
    // lost track of would keep the shared link subscription, and so the
    // socket, open after sign-out.
    stop()
    expect(h.subscriptions.every((sub) => sub.closed)).toBe(true)
  })

  it('does not subscribe again after stop', async () => {
    const { h, stop } = await startAndEnd()
    stop()

    window.dispatchEvent(new Event('online'))

    expect(h.subscriptions).toHaveLength(1)
  })
})

describe('a GetHousehold that failed with NO_HOUSEHOLD (households H5b, task G.8)', () => {
  // The person created a household in ANOTHER tab. This tab still shows the
  // no-household screen, because its last `GetHousehold` answer was the
  // `NO_HOUSEHOLD` error. The creating tab's `createHousehold` publishes
  // `LOCATION`, and this tab must refetch the FAILED query, so
  // `NoHouseholdGate` sees the new household. Apollo keeps a query with an
  // observer "active" after an error; this test checks that, instead of
  // trusting it.
  it('user sees the new household after a LOCATION event in another tab', async () => {
    let created = false
    const sent: string[] = []
    let live: Emitter | undefined
    const link = new ApolloLink((operation) => {
      const def = getMainDefinition(operation.query)
      if (
        def.kind === 'OperationDefinition' &&
        def.operation === 'subscription'
      ) {
        return new Observable<ApolloLink.Result>((observer) => {
          live = observer as Emitter
        })
      }
      sent.push(operation.operationName ?? '?')
      return new Observable<ApolloLink.Result>((observer) => {
        observer.next(
          created
            ? {
                data: {
                  household: {
                    __typename: 'Household',
                    id: 'household-new',
                    name: 'New home',
                    role: 'owner',
                    hasOwner: true,
                    pendingTransfer: null,
                  },
                },
              }
            : {
                errors: [
                  {
                    message: 'No household',
                    extensions: { code: 'NO_HOUSEHOLD' },
                  },
                ],
              },
        )
        observer.complete()
      })
    })
    const client = new ApolloClient({ link, cache: new InMemoryCache() })
    const results: { id: string | null; error: boolean }[] = []
    const sub = client
      .watchQuery<generated.GetHouseholdQuery>({
        query: generated.GetHouseholdDocument,
        fetchPolicy: 'cache-and-network',
      })
      .subscribe((r) => {
        results.push({
          id: r.data?.household?.id ?? null,
          error: r.error !== undefined,
        })
      })
    const stop = startLiveUpdates({
      client,
      socket: { on: () => () => {} },
    })
    await vi.advanceTimersByTimeAsync(0)
    // Given the query failed with NO_HOUSEHOLD
    expect(elementAt(results, results.length - 1)).toEqual({
      id: null,
      error: true,
    })
    expect(sent).toEqual(['GetHousehold'])

    // When the other tab creates a household and its LOCATION event arrives
    created = true
    live?.next(cartEvent('LOCATION'))
    await vi.advanceTimersByTimeAsync(LIVE_BATCH_MS)

    // Then the failed query is sent again and answers the new household
    expect(sent).toEqual(['GetHousehold', 'GetHousehold'])
    expect(elementAt(results, results.length - 1)).toEqual({
      id: 'household-new',
      error: false,
    })

    stop()
    sub.unsubscribe()
  })
})
