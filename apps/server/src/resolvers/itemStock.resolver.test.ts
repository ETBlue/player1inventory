import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

interface FakeStock {
  id: string
  itemId: string
  locationId: string
  targetQuantity: number
  refillThreshold: number
  packedQuantity: number
  unpackedQuantity: number
  dueDate: Date | null
  createdAt: Date
  updatedAt: Date
}

const { state, client } = vi.hoisted(() => {
  const state = {
    locations: [] as { id: string; userId: string; isDefault: boolean }[],
    itemStocks: [] as FakeStock[],
  }
  let seq = 0

  function stockMatches(s: FakeStock, where: Record<string, unknown>): boolean {
    if (where.itemId !== undefined && s.itemId !== where.itemId) return false
    if (where.locationId !== undefined && s.locationId !== where.locationId) return false
    const loc = where.location as { userId?: string } | undefined
    if (loc?.userId !== undefined) {
      const l = state.locations.find((x) => x.id === s.locationId)
      if (l?.userId !== loc.userId) return false
    }
    const compound = where.itemId_locationId as { itemId: string; locationId: string } | undefined
    if (compound && (s.itemId !== compound.itemId || s.locationId !== compound.locationId)) return false
    return true
  }

  const client = {
    location: {
      findFirst: async ({ where = {} }: { where?: Record<string, unknown> }) =>
        state.locations.find(
          (l) =>
            (where.id === undefined || l.id === where.id) &&
            (where.userId === undefined || l.userId === where.userId),
        ) ?? null,
    },
    itemStock: {
      findMany: async ({ where = {} }: { where?: Record<string, unknown> }) =>
        state.itemStocks.filter((s) => stockMatches(s, where)),
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        state.itemStocks.find((s) => stockMatches(s, where)) ?? null,
      create: async ({ data }: { data: Omit<FakeStock, 'id' | 'createdAt' | 'updatedAt'> }) => {
        // Models @@unique([itemId, locationId]). A fake that silently deduped
        // here would hide the P2002 real Postgres throws and leave the
        // already-stocked branch of addItemToLocation unpinned.
        if (state.itemStocks.some((s) => s.itemId === data.itemId && s.locationId === data.locationId)) {
          throw new Error('Unique constraint failed on the fields: (`itemId`,`locationId`)')
        }
        const row: FakeStock = { ...data, id: `st-${++seq}`, createdAt: new Date(), updatedAt: new Date() }
        state.itemStocks.push(row)
        return row
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Partial<FakeStock> }) => {
        const row = state.itemStocks.find((s) => stockMatches(s, where))
        if (!row) throw new Error('ItemStock not found')
        Object.assign(row, data, { updatedAt: new Date() })
        return row
      },
      deleteMany: async ({ where = {} }: { where?: Record<string, unknown> }) => {
        const before = state.itemStocks.length
        state.itemStocks = state.itemStocks.filter((s) => !stockMatches(s, where))
        return { count: before - state.itemStocks.length }
      },
    },
  }
  return { state, client }
})

vi.mock('../lib/prisma.js', () => ({ prisma: client }))

const server = new ApolloServer<Context>({ typeDefs, resolvers })

async function run(query: string, variables: Record<string, unknown> = {}, userId: string | null = 'user-a') {
  const res = await server.executeOperation({ query, variables }, { contextValue: { userId } })
  if (res.body.kind !== 'single') throw new Error('expected single result')
  return res.body.singleResult
}

function stock(over: Partial<FakeStock> & Pick<FakeStock, 'id' | 'itemId' | 'locationId'>): FakeStock {
  return {
    targetQuantity: 0, refillThreshold: 0, packedQuantity: 0, unpackedQuantity: 0,
    dueDate: null, createdAt: new Date(), updatedAt: new Date(), ...over,
  }
}

describe('itemStock resolvers', () => {
  beforeEach(() => {
    // TWO locations for user-a, plus one for user-b. `item-far` is stocked
    // ONLY at loc-a2 — without it, "stocks here" and "all stocks" would be the
    // same set and every scoping assertion below would be vacuous.
    state.locations = [
      { id: 'loc-a', userId: 'user-a', isDefault: true },
      { id: 'loc-a2', userId: 'user-a', isDefault: false },
      { id: 'loc-b', userId: 'user-b', isDefault: true },
    ]
    state.itemStocks = [
      stock({ id: 'st-home', itemId: 'item-milk', locationId: 'loc-a', targetQuantity: 3, refillThreshold: 1, packedQuantity: 2 }),
      stock({ id: 'st-garage', itemId: 'item-far', locationId: 'loc-a2', targetQuantity: 9, refillThreshold: 4, packedQuantity: 7 }),
      stock({ id: 'st-theirs', itemId: 'item-rice', locationId: 'loc-b', targetQuantity: 1 }),
    ]
  })

  it('user can read the stocks of one location only', async () => {
    // Given user-a has stock in two locations
    // When they read loc-a
    const res = await run(`query Q($l: ID!) { itemStocks(locationId: $l) { id itemId } }`, { l: 'loc-a' })

    // Then the loc-a2 row is absent — this is the assertion a one-location
    // fixture could not make
    expect(res.data?.itemStocks).toEqual([{ id: 'st-home', itemId: 'item-milk' }])
  })

  it('user cannot read another user\'s location stocks', async () => {
    const res = await run(`query Q($l: ID!) { itemStocks(locationId: $l) { id } }`, { l: 'loc-b' })
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
  })

  it('user can read every location\'s stock for one item', async () => {
    state.itemStocks.push(stock({ id: 'st-extra', itemId: 'item-milk', locationId: 'loc-a2', targetQuantity: 5 }))
    const res = await run(`query Q($i: ID!) { itemStocksForItem(itemId: $i) { locationId } }`, { i: 'item-milk' })
    expect(res.data?.itemStocksForItem).toEqual([{ locationId: 'loc-a' }, { locationId: 'loc-a2' }])
  })

  it('itemStocksForItem excludes another user\'s rows', async () => {
    // Given user-b also stocks an item id that user-a stocks
    state.itemStocks.push(stock({ id: 'st-b2', itemId: 'item-milk', locationId: 'loc-b' }))
    const res = await run(`query Q($i: ID!) { itemStocksForItem(itemId: $i) { locationId } }`, { i: 'item-milk' })
    expect(res.data?.itemStocksForItem).toEqual([{ locationId: 'loc-a' }])
  })

  it('user can upsert a stock that does not exist yet', async () => {
    const res = await run(
      `mutation M($i: ID!, $l: ID!, $in: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $in) { targetQuantity packedQuantity } }`,
      { i: 'item-new', l: 'loc-a2', in: { targetQuantity: 4, packedQuantity: 1 } },
    )
    expect(res.data?.upsertItemStock).toEqual({ targetQuantity: 4, packedQuantity: 1 })
  })

  it('user can upsert a stock that already exists, merging fields', async () => {
    const res = await run(
      `mutation M($i: ID!, $l: ID!, $in: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $in) { targetQuantity refillThreshold packedQuantity } }`,
      { i: 'item-milk', l: 'loc-a', in: { packedQuantity: 5 } },
    )
    // refillThreshold and targetQuantity are untouched by a partial input
    expect(res.data?.upsertItemStock).toEqual({ targetQuantity: 3, refillThreshold: 1, packedQuantity: 5 })
  })

  it('user cannot upsert into another user\'s location', async () => {
    const res = await run(
      `mutation M($i: ID!, $l: ID!, $in: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $in) { id } }`,
      { i: 'item-milk', l: 'loc-b', in: { packedQuantity: 99 } },
    )
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(state.itemStocks.find((s) => s.id === 'st-theirs')?.packedQuantity).toBe(0)
  })

  it('add to location inherits target and refill but zeroes quantities', async () => {
    // Given item-milk is stocked at loc-a with packed 2
    // When it is added to loc-a2 sourcing from loc-a
    const res = await run(
      `mutation M($i: ID!, $l: ID!, $s: ID) { addItemToLocation(itemId: $i, locationId: $l, sourceLocationId: $s) { targetQuantity refillThreshold packedQuantity unpackedQuantity } }`,
      { i: 'item-milk', l: 'loc-a2', s: 'loc-a' },
    )
    // Then configuration-like state carries over but on-hand quantities do not
    expect(res.data?.addItemToLocation).toEqual({
      targetQuantity: 3, refillThreshold: 1, packedQuantity: 0, unpackedQuantity: 0,
    })
  })

  it('add to location is a no-op when already stocked there', async () => {
    const res = await run(
      `mutation M($i: ID!, $l: ID!) { addItemToLocation(itemId: $i, locationId: $l) { id packedQuantity } }`,
      { i: 'item-milk', l: 'loc-a' },
    )
    // Returns the existing row untouched rather than throwing on @@unique
    expect(res.data?.addItemToLocation).toEqual({ id: 'st-home', packedQuantity: 2 })
    expect(state.itemStocks.filter((s) => s.itemId === 'item-milk')).toHaveLength(1)
  })

  it('add to location zeroes everything when there is no source row', async () => {
    const res = await run(
      `mutation M($i: ID!, $l: ID!) { addItemToLocation(itemId: $i, locationId: $l) { targetQuantity refillThreshold packedQuantity } }`,
      { i: 'item-orphan', l: 'loc-a2' },
    )
    expect(res.data?.addItemToLocation).toEqual({ targetQuantity: 0, refillThreshold: 0, packedQuantity: 0 })
  })

  it('user can remove an item from one location, leaving the others', async () => {
    state.itemStocks.push(stock({ id: 'st-extra', itemId: 'item-milk', locationId: 'loc-a2' }))
    const res = await run(`mutation M($i: ID!, $l: ID!) { removeItemFromLocation(itemId: $i, locationId: $l) }`, {
      i: 'item-milk', l: 'loc-a',
    })
    expect(res.data?.removeItemFromLocation).toBe(true)
    expect(state.itemStocks.map((s) => s.id).sort()).toEqual(['st-extra', 'st-garage', 'st-theirs'])
  })

  it('user cannot remove an item from another user\'s location', async () => {
    const res = await run(`mutation M($i: ID!, $l: ID!) { removeItemFromLocation(itemId: $i, locationId: $l) }`, {
      i: 'item-rice', l: 'loc-b',
    })
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(state.itemStocks.some((s) => s.id === 'st-theirs')).toBe(true)
  })
})
