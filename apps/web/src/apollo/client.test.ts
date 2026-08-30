import type { InMemoryCache } from '@apollo/client'
import { gql } from '@apollo/client'
import { describe, expect, it } from 'vitest'
import {
  createApolloClient,
  createApolloClientForE2E,
  createCache,
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
