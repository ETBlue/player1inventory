import type { InMemoryCache } from '@apollo/client'
import { gql } from '@apollo/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createApolloClient,
  createApolloClientForE2E,
  createCache,
  resolveToken,
} from './client'

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
