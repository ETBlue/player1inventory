import type { InMemoryCache } from '@apollo/client'
import { gql } from '@apollo/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import {
  createApolloClient,
  createApolloClientForE2E,
  resolveToken,
} from './client'
import { CLIENT_ID } from './clientId'
import { createCache } from './cloudCache'

// Mirrors the `itemStocks` selection of the PantryData operation
// (`apollo/operations/itemStocks.graphql`), trimmed to the fields the cache
// key does not depend on.
const ITEM_STOCKS = gql`
  query PantryData($locationId: ID!) {
    itemStocks(locationId: $locationId) {
      id
      itemId
      locationId
      packedQuantity
    }
  }
`

const LOCATION_A = 'loc-kitchen'
const LOCATION_B = 'loc-garage'

// Disjoint stock: no ItemStock row is shared between the two locations, so a
// cache that collapsed both writes into one entry would hand back the wrong
// rows rather than a coincidentally-equal list.
const stockAtA = [
  {
    __typename: 'ItemStock',
    id: 'stock-a1',
    itemId: 'item-milk',
    locationId: LOCATION_A,
    packedQuantity: 2,
  },
  {
    __typename: 'ItemStock',
    id: 'stock-a2',
    itemId: 'item-eggs',
    locationId: LOCATION_A,
    packedQuantity: 1,
  },
]

const stockAtB = [
  {
    __typename: 'ItemStock',
    id: 'stock-b1',
    itemId: 'item-rice',
    locationId: LOCATION_B,
    packedQuantity: 5,
  },
]

type ItemStocksResult = {
  itemStocks: { id: string; itemId: string; locationId: string }[]
}

function readStocks(cache: InMemoryCache, locationId: string) {
  return cache.readQuery<ItemStocksResult>({
    query: ITEM_STOCKS,
    variables: { locationId },
  })?.itemStocks
}

function writeStocks(
  cache: InMemoryCache,
  locationId: string,
  itemStocks: typeof stockAtA,
) {
  cache.writeQuery({
    query: ITEM_STOCKS,
    variables: { locationId },
    data: { itemStocks },
  })
}

// These guard the invariant "one location's stock is never served for another",
// not the `keyArgs` line specifically: Apollo's default already keys a root field
// by all of its arguments, so these stay green if `keyArgs` is deleted today. They
// go red if a `merge`, a `keyArgs: false`, or a second argument ever collapses the
// two locations into one cache entry — which is the regression worth catching.
describe('createCache — itemStocks is cached per location', () => {
  it('user can switch back to a location and still read its own stock', () => {
    // Given a cache holding the stock of location A
    const cache = createCache()
    writeStocks(cache, LOCATION_A, stockAtA)

    // When the user switches to location B, whose stock is entirely different
    writeStocks(cache, LOCATION_B, stockAtB)

    // Then location A's rows are still the ones cached for location A
    expect(readStocks(cache, LOCATION_A)?.map((s) => s.id)).toEqual([
      'stock-a1',
      'stock-a2',
    ])
    // And location B's read is not contaminated by A's
    expect(readStocks(cache, LOCATION_B)?.map((s) => s.id)).toEqual([
      'stock-b1',
    ])
  })

  it('user never sees the previous location rendered as the active one', () => {
    // Given both locations written to the cache, B last
    const cache = createCache()
    writeStocks(cache, LOCATION_A, stockAtA)
    writeStocks(cache, LOCATION_B, stockAtB)

    // When the pantry reads the active location A
    const rows = readStocks(cache, LOCATION_A) ?? []

    // Then every row it gets belongs to A
    expect(rows).not.toHaveLength(0)
    for (const row of rows) {
      expect(row.locationId).toBe(LOCATION_A)
    }
  })
})

// Mirrors the `ItemLogs` operation (`apollo/operations/inventoryLogs.graphql`).
// Two arguments, so the `keyArgs` list in `createCache` is NOT a restatement of
// Apollo's default: drop `'locationId'` from it and both locations collapse
// into one store entry keyed by `itemId` alone.
const ITEM_LOGS = gql`
  query ItemLogs($itemId: ID!, $locationId: ID!) {
    itemLogs(itemId: $itemId, locationId: $locationId) {
      id
      itemId
      delta
      quantity
      occurredAt
    }
  }
`

// Disjoint logs: no row is shared between the two locations, and the counts
// differ (2 vs 1). A single shared row would let a collapsed cache return a
// coincidentally-equal list.
const logsAtA = [
  {
    __typename: 'InventoryLog',
    id: 'log-a1',
    itemId: 'item-milk',
    delta: 2,
    quantity: 2,
    occurredAt: '2026-03-01T00:00:00.000Z',
  },
  {
    __typename: 'InventoryLog',
    id: 'log-a2',
    itemId: 'item-milk',
    delta: 3,
    quantity: 5,
    occurredAt: '2026-03-02T00:00:00.000Z',
  },
]

const logsAtB = [
  {
    __typename: 'InventoryLog',
    id: 'log-b1',
    itemId: 'item-milk',
    delta: 5,
    quantity: 5,
    occurredAt: '2026-03-20T00:00:00.000Z',
  },
]

type ItemLogsResult = { itemLogs: { id: string }[] }

function readLogs(cache: InMemoryCache, locationId: string) {
  return cache.readQuery<ItemLogsResult>({
    query: ITEM_LOGS,
    variables: { itemId: 'item-milk', locationId },
  })?.itemLogs
}

function writeLogs(
  cache: InMemoryCache,
  locationId: string,
  itemLogs: typeof logsAtA,
) {
  cache.writeQuery({
    query: ITEM_LOGS,
    variables: { itemId: 'item-milk', locationId },
    data: { itemLogs },
  })
}

describe('createCache — itemLogs is cached per location', () => {
  it('user can switch back to a location and still read its own logs', () => {
    // Given a cache holding Cloud Kitchen's two logs for Milk
    const cache = createCache()
    writeLogs(cache, LOCATION_A, logsAtA)

    // When the user switches to Cloud Garage, whose single log is different
    writeLogs(cache, LOCATION_B, logsAtB)

    // Then Cloud Kitchen still reads back its own two rows
    expect(readLogs(cache, LOCATION_A)?.map((l) => l.id)).toEqual([
      'log-a1',
      'log-a2',
    ])
    // And Cloud Garage reads back only its own
    expect(readLogs(cache, LOCATION_B)?.map((l) => l.id)).toEqual(['log-b1'])
  })

  it('user never sees the previous location logs rendered as the active one', () => {
    // Given both locations written to the cache, Cloud Garage last
    const cache = createCache()
    writeLogs(cache, LOCATION_A, logsAtA)
    writeLogs(cache, LOCATION_B, logsAtB)

    // When the item log page reads the active location, Cloud Garage
    const rows = readLogs(cache, LOCATION_B) ?? []

    // Then it gets Cloud Garage's one row, not Cloud Kitchen's two
    expect(rows.map((l) => l.id)).toEqual(['log-b1'])
  })
})

// Mirrors the `VendorCart` operation (`apollo/operations/shopping.graphql`).
// Two arguments, so the `keyArgs` list in `createCache` is NOT a restatement of
// Apollo's default: drop `'locationId'` from it and both locations collapse
// into one store entry keyed by `vendorId` alone, and the shopping page serves
// the Kitchen's cart while the user is looking at the Garage.
const VENDOR_CART = gql`
  query VendorCart($vendorId: ID, $locationId: ID!) {
    vendorCart(vendorId: $vendorId, locationId: $locationId) {
      id
      lastPurchasedAt
    }
  }
`

const VENDOR = 'vendor-costco'

// One vendor, two locations, two DIFFERENT carts — the composite ids PR 3b
// re-keyed `Cart.id` to, and different `lastPurchasedAt` values so a collapsed
// entry cannot return a coincidentally-equal row.
const cartAtA = {
  __typename: 'Cart',
  id: `${LOCATION_A}:${VENDOR}`,
  lastPurchasedAt: '2026-06-01T00:00:00.000Z',
}

const cartAtB = {
  __typename: 'Cart',
  id: `${LOCATION_B}:${VENDOR}`,
  lastPurchasedAt: '2026-01-01T00:00:00.000Z',
}

type VendorCartResult = {
  vendorCart: { id: string; lastPurchasedAt: string | null }
}

function readCart(cache: InMemoryCache, locationId: string) {
  return cache.readQuery<VendorCartResult>({
    query: VENDOR_CART,
    variables: { vendorId: VENDOR, locationId },
  })?.vendorCart
}

function writeCart(
  cache: InMemoryCache,
  locationId: string,
  vendorCart: typeof cartAtA,
) {
  cache.writeQuery({
    query: VENDOR_CART,
    variables: { vendorId: VENDOR, locationId },
    data: { vendorCart },
  })
}

describe('createCache — vendorCart is cached per location', () => {
  it('user can switch back to a location and still read its own cart', () => {
    // Given a cache holding Cloud Kitchen's cart for this vendor
    const cache = createCache()
    writeCart(cache, LOCATION_A, cartAtA)

    // When the user switches to Cloud Garage, whose cart for the SAME vendor is
    // a different row
    writeCart(cache, LOCATION_B, cartAtB)

    // Then Cloud Kitchen still reads back its own cart
    expect(readCart(cache, LOCATION_A)?.id).toBe(`${LOCATION_A}:${VENDOR}`)
    // And Cloud Garage reads back only its own
    expect(readCart(cache, LOCATION_B)?.id).toBe(`${LOCATION_B}:${VENDOR}`)
  })

  it('user never sees the previous location cart rendered as the active one', () => {
    // Given both locations written to the cache, Cloud Garage last
    const cache = createCache()
    writeCart(cache, LOCATION_A, cartAtA)
    writeCart(cache, LOCATION_B, cartAtB)

    // When the shopping page reads the active location, Cloud Kitchen
    const row = readCart(cache, LOCATION_A)

    // Then it gets the Kitchen's own purchase date, not the Garage's
    expect(row?.lastPurchasedAt).toBe('2026-06-01T00:00:00.000Z')
  })
})

// Households H5b, task G.9. `HouseholdPerson` has no `id`, so a refetch that
// brings a shorter list (after a removal) would warn "Cache data may be lost".
describe('createCache — householdMembers is replaced, not merged', () => {
  const MEMBERS = gql`
    query HouseholdMembers {
      householdMembers {
        userId
        displayName
      }
    }
  `
  const row = (userId: string) => ({
    __typename: 'HouseholdPerson',
    userId,
    displayName: userId,
  })

  it('user sees the shorter list after a removal, with no data-loss warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cache = createCache()
    cache.writeQuery({
      query: MEMBERS,
      data: { householdMembers: [row('a'), row('b')] },
    })
    cache.writeQuery({ query: MEMBERS, data: { householdMembers: [row('a')] } })

    const read = cache.readQuery<{ householdMembers: { userId: string }[] }>({
      query: MEMBERS,
    })
    expect(read?.householdMembers.map((p) => p.userId)).toEqual(['a'])
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('both Apollo clients share the cache configuration', () => {
  // The E2E client exists to exercise the production code path; a policy applied
  // to only one of the two caches would make cloud E2E prove nothing.
  it.each([
    ['production', () => createApolloClient(async () => null)],
    ['e2e', () => createApolloClientForE2E('e2e-user')],
  ])('%s client keeps two locations stock separate', (_name, makeClient) => {
    // Given a client built by the app's own factory
    const cache = makeClient().cache as InMemoryCache

    // When two locations' disjoint stock is written through it
    writeStocks(cache, LOCATION_A, stockAtA)
    writeStocks(cache, LOCATION_B, stockAtB)

    // Then each location reads back its own rows
    expect(readStocks(cache, LOCATION_A)?.map((s) => s.id)).toEqual([
      'stock-a1',
      'stock-a2',
    ])
    expect(readStocks(cache, LOCATION_B)?.map((s) => s.id)).toEqual([
      'stock-b1',
    ])
  })
})

function setOnLine(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createApolloClient — a mutation refused offline', () => {
  const WAITING_QUERY = gql`
    query OfflineProbeList {
      offlineProbeList
    }
  `
  const REFUSED_MUTATION = gql`
    mutation OfflineProbeSave {
      offlineProbeSave
    }
  `

  it('does not make a waiting query send again', async () => {
    // Given a query that waits on the network, through the production client
    // The first request waits until the test releases it. Any later request
    // answers at once, so a wrong resend fails on the count below instead of
    // hanging until the test times out.
    let releaseFirst: (() => void) | undefined
    const answer = () =>
      new Response(JSON.stringify({ data: { offlineProbeList: ['a'] } }), {
        headers: { 'content-type': 'application/json' },
      })
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          if (releaseFirst) resolve(answer())
          else releaseFirst = () => resolve(answer())
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    setOnLine(true)
    const client = createApolloClient(async () => null)
    try {
      const query = client.query({
        query: WAITING_QUERY,
        fetchPolicy: 'network-only',
      })
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

      // When the device goes offline and a mutation is refused
      setOnLine(false)
      await expect(
        client.mutate({ mutation: REFUSED_MUTATION }),
      ).rejects.toThrow('Offline')
      setOnLine(true)

      // Then the waiting query's answer is passed on, and it was sent once.
      // `offlineWriteLink` refuses the mutation before it reaches
      // `createStaleReadRetryLink`, so the refusal is not counted.
      releaseFirst?.()
      expect((await query).data).toEqual({ offlineProbeList: ['a'] })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
      await client.clearStore()
    }
  })
})

describe('both Apollo clients send the app language', () => {
  // Households H3a, decision H3: the server names a new household and its
  // first location in the language this header carries. Both clients are
  // tested, because the E2E client exists to run the code users run.
  const LANGUAGE_PROBE = gql`
    query LanguageProbe {
      languageProbe
    }
  `

  function headerSent(fetchMock: ReturnType<typeof vi.fn>): string | null {
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    return new Headers(init?.headers).get('x-app-language')
  }

  it.each([
    ['production', () => createApolloClient(async () => null)],
    ['e2e', () => createApolloClientForE2E('e2e-user')],
  ])('%s client sends x-app-language from the current language', async (_name, makeClient) => {
    // Given the app is in Traditional Chinese
    const before = i18n.language
    await i18n.changeLanguage('tw')
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { languageProbe: 'ok' } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    setOnLine(true)
    const client = makeClient()
    try {
      // When the client sends a query
      await client.query({ query: LANGUAGE_PROBE, fetchPolicy: 'network-only' })

      // Then the request carries the language
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(headerSent(fetchMock)).toBe('tw')

      // And a language change applies to the next request
      await i18n.changeLanguage('en')
      fetchMock.mockClear()
      await client.query({ query: LANGUAGE_PROBE, fetchPolicy: 'network-only' })
      expect(headerSent(fetchMock)).toBe('en')
    } finally {
      vi.unstubAllGlobals()
      await client.clearStore()
      await i18n.changeLanguage(before)
    }
  })
})

describe('both Apollo clients send the tab id', () => {
  // Households H3c-1, decision P4: the server does not send a change back to
  // the tab whose `x-client-id` made it.
  const TAB_PROBE = gql`
    query TabProbe {
      tabProbe
    }
  `

  it.each([
    ['production', () => createApolloClient(async () => null)],
    ['e2e', () => createApolloClientForE2E('e2e-user')],
  ])('%s client sends x-client-id on every HTTP request', async (_name, makeClient) => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { tabProbe: 'ok' } }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    setOnLine(true)
    const client = makeClient()
    try {
      // When the client sends two queries
      await client.query({ query: TAB_PROBE, fetchPolicy: 'network-only' })
      await client.query({ query: TAB_PROBE, fetchPolicy: 'network-only' })

      // Then both carry this page load's tab id
      expect(fetchMock).toHaveBeenCalledTimes(2)
      for (const call of fetchMock.mock.calls as unknown as [
        string,
        RequestInit,
      ][]) {
        expect(new Headers(call[1].headers).get('x-client-id')).toBe(CLIENT_ID)
      }
    } finally {
      vi.unstubAllGlobals()
      await client.clearStore()
    }
  })
})

describe('resolveToken', () => {
  it('returns the token when online', async () => {
    // Given the device is online and Clerk answers
    setOnLine(true)

    // When a token is requested
    const token = await resolveToken(async () => 'real-token')

    // Then the real token is used
    expect(token).toBe('real-token')
  })

  it('does not wait for Clerk when offline', async () => {
    // Given the device is offline and Clerk never answers
    setOnLine(false)
    const neverResolves = () => new Promise<string | null>(() => {})

    // When a token is requested
    const startedAt = Date.now()
    const token = await resolveToken(neverResolves)
    const elapsed = Date.now() - startedAt

    // Then it gives up at once, without waiting for the timeout.
    // Without the offline check this still returns null, but only after
    // TOKEN_TIMEOUT_MS. Asserting the time is what pins the fast path.
    expect(token).toBeNull()
    expect(elapsed).toBeLessThan(100)
  })

  it('gives up when Clerk is slow but the device is online', async () => {
    // Given Clerk never answers, which is what a failed script load looks like
    setOnLine(true)
    const neverResolves = () => new Promise<string | null>(() => {})

    // When a token is requested
    const token = await resolveToken(neverResolves, 50)

    // Then it stops waiting after the timeout
    expect(token).toBeNull()
  })
})

// Households H5c, task H.4. `LocationPerson` has no `id` either. A refetch
// after a role is removed brings a shorter list for that location, which
// without a policy warns "Cache data may be lost".
describe('createCache — locationPeople is replaced, not merged', () => {
  const PEOPLE = gql`
    query LocationPeople($locationId: ID!) {
      locationPeople(locationId: $locationId) {
        userId
        displayName
      }
    }
  `
  const row = (userId: string) => ({
    __typename: 'LocationPerson',
    userId,
    displayName: userId,
  })

  it('user sees the shorter list after a removal, with no data-loss warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cache = createCache()
    const variables = { locationId: 'loc-k' }
    cache.writeQuery({
      query: PEOPLE,
      variables,
      data: { locationPeople: [row('a'), row('b')] },
    })
    cache.writeQuery({
      query: PEOPLE,
      variables,
      data: { locationPeople: [row('a')] },
    })

    const read = cache.readQuery<{ locationPeople: { userId: string }[] }>({
      query: PEOPLE,
      variables,
    })
    expect(read?.locationPeople.map((p) => p.userId)).toEqual(['a'])
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('two locations keep their own lists', () => {
    // A control: the policy must not drop the `locationId` from the key
    const cache = createCache()
    cache.writeQuery({
      query: PEOPLE,
      variables: { locationId: 'loc-k' },
      data: { locationPeople: [row('a')] },
    })
    cache.writeQuery({
      query: PEOPLE,
      variables: { locationId: 'loc-g' },
      data: { locationPeople: [row('b'), row('c')] },
    })
    const read = (locationId: string) =>
      cache
        .readQuery<{ locationPeople: { userId: string }[] }>({
          query: PEOPLE,
          variables: { locationId },
        })
        ?.locationPeople.map((p) => p.userId)
    expect(read('loc-k')).toEqual(['a'])
    expect(read('loc-g')).toEqual(['b', 'c'])
  })
})

// Households H6, task J.5: the activity log comes in pages (decision T54).
// "Load more" sends `before:` the last id and must ADD its rows. A refetch
// after a live event sends the first page again (the watched query keeps its
// first variables) and must put the new rows on top, without losing the
// pages already loaded and without showing a row twice.
describe('createCache — householdActivity joins its pages', () => {
  const ACTIVITY = gql`
    query HouseholdActivity($before: ID, $first: Int) {
      householdActivity(before: $before, first: $first) {
        id
        createdAt
      }
    }
  `
  // Newest first. Rows `a` and `b` have the SAME time, as two writes in one
  // millisecond would; the server orders them by id.
  const TIMES: Record<string, string> = {
    x: '2026-11-20T10:09:00.000Z',
    y: '2026-11-20T10:08:00.000Z',
    a: '2026-11-20T10:07:00.000Z',
    b: '2026-11-20T10:07:00.000Z',
    c: '2026-11-20T10:06:00.000Z',
    d: '2026-11-20T10:05:00.000Z',
    e: '2026-11-20T10:04:00.000Z',
  }
  const row = (id: string) => ({
    __typename: 'HouseholdActivityEntry',
    id,
    createdAt: TIMES[id],
  })

  function write(
    cache: ReturnType<typeof createCache>,
    variables: { before?: string; first: number },
    ids: string[],
  ) {
    cache.writeQuery({
      query: ACTIVITY,
      variables,
      data: { householdActivity: ids.map(row) },
    })
  }

  function read(cache: ReturnType<typeof createCache>) {
    return cache
      .readQuery<{ householdActivity: { id: string }[] }>({
        query: ACTIVITY,
        variables: { first: 2 },
      })
      ?.householdActivity.map((r) => r.id)
  }

  it('user can load more and sees the next page after the first', () => {
    const cache = createCache()
    write(cache, { first: 2 }, ['a', 'b'])
    write(cache, { before: 'b', first: 2 }, ['c', 'd'])
    expect(read(cache)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('user sees a new row on top after a refetch, and keeps the pages already loaded', () => {
    // Given two pages are shown
    const cache = createCache()
    write(cache, { first: 2 }, ['a', 'b'])
    write(cache, { before: 'b', first: 2 }, ['c', 'd'])

    // When a live event reads the first page again, and one row is new
    write(cache, { first: 2 }, ['x', 'a'])

    // Then the new row is on top, and no row is lost or shown twice
    expect(read(cache)).toEqual(['x', 'a', 'b', 'c', 'd'])
  })

  it('a refetch with the same rows changes nothing', () => {
    const cache = createCache()
    write(cache, { first: 2 }, ['a', 'b'])
    write(cache, { before: 'b', first: 2 }, ['c'])
    write(cache, { first: 2 }, ['a', 'b'])
    expect(read(cache)).toEqual(['a', 'b', 'c'])
  })

  it('a refetch that is all new rows replaces the list, so there is no gap', () => {
    // Given one page [a, b] is shown
    const cache = createCache()
    write(cache, { first: 2 }, ['a', 'b'])

    // When two new rows arrived, so the first page is now [x, y]. The rows
    // between y and a are not known, so a and b cannot stay below y.
    write(cache, { first: 2 }, ['x', 'y'])

    // Then the list is the new page; "Load more" brings a and b back
    expect(read(cache)).toEqual(['x', 'y'])
  })

  it('a page loaded after a refetch goes after the row it was asked for', () => {
    // Given [x, a, b] after a refetch
    const cache = createCache()
    write(cache, { first: 2 }, ['a', 'b'])
    write(cache, { first: 2 }, ['x', 'a'])
    expect(read(cache)).toEqual(['x', 'a', 'b'])

    // When the next two pages arrive
    write(cache, { before: 'b', first: 2 }, ['c', 'd'])
    write(cache, { before: 'd', first: 2 }, ['e'])

    // Then every row shows once, in order
    expect(read(cache)).toEqual(['x', 'a', 'b', 'c', 'd', 'e'])
  })

  it('a page asked after a row the list no longer holds is dropped, so there is no gap', () => {
    // A late "Load more" answer that arrives after a refetch replaced the
    // list: its `before` row is gone, so the rows between are not known.
    const cache = createCache()
    write(cache, { first: 2 }, ['x', 'y'])
    write(cache, { before: 'b', first: 2 }, ['c', 'd'])
    expect(read(cache)).toEqual(['x', 'y'])
  })
})
