import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import { runInTransaction } from '../test/stockFake.js'
import { cartItemMatches, type FakeCart, type FakeCartItem } from '../test/cartItemFake.js'
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

// Only the five legacy state columns the PR 5 dual-write touches, plus the
// ownership scope the mirror filters on.
interface FakeItem {
  id: string
  userId: string
  targetQuantity: number
  refillThreshold: number
  packedQuantity: number
  unpackedQuantity: number
  dueDate: Date | null
}

// The two families `removeItemFromLocation` cascades. Only the columns the
// resolver filters on.
interface FakeLog {
  id: string
  itemId: string
  locationId: string
  userId: string
}


const { state, client } = vi.hoisted(() => {
  const state = {
    locations: [] as { id: string; userId: string; isDefault: boolean }[],
    items: [] as FakeItem[],
    itemStocks: [] as FakeStock[],
    inventoryLogs: [] as FakeLog[],
    // `Cart` rows, because `CartItem` has NO locationId column of its own.
    // The location lives on the cart, in `Cart.locationId` (PR 3a), which is
    // what the cascade's relation filter reads.
    carts: [] as FakeCart[],
    cartItems: [] as FakeCartItem[],
    // Failure injection for the atomicity test. `cartItem.deleteMany` is the
    // LAST of the three deletes, so a throw there is what proves the two
    // before it were rolled back. A boolean rather than a function: the
    // rollback snapshot uses `structuredClone`, which throws on a function.
    failCartItemDeleteMany: false,
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

  // Prisma's own `where` semantics on every key — `undefined ||` — so a
  // resolver that drops `locationId` from its filter becomes visible instead
  // of staying green against a hardcoded match.
  function logMatches(l: FakeLog, where: Record<string, unknown>): boolean {
    if (where.itemId !== undefined && l.itemId !== where.itemId) return false
    if (where.locationId !== undefined && l.locationId !== where.locationId) return false
    if (where.userId !== undefined && l.userId !== where.userId) return false
    return true
  }

  // The matcher is `src/test/cartItemFake.ts`'s, imported rather than copied,
  // so this spec and `cart.resolver.test.ts` agree on what
  // `cart: { locationId }` means. A local copy could quietly ignore that key,
  // and then every cascade test below would pass against a resolver with no
  // location scope at all.
  function matchesCartItem(c: FakeCartItem, where: Record<string, unknown>): boolean {
    return cartItemMatches(c, where, state.carts)
  }

  const client: Record<string, unknown> = {
    // The rollback implementation is stockFake's, imported rather than copied.
    // A second copy could silently do nothing, and then every atomicity claim
    // resting on it would report as covered. `state` is the only store this
    // file writes into.
    $transaction: async (arg: unknown): Promise<unknown> =>
      runInTransaction([state as unknown as Record<string, unknown>], client, arg),
    location: {
      findFirst: async ({ where = {} }: { where?: Record<string, unknown> }) =>
        state.locations.find(
          (l) =>
            (where.id === undefined || l.id === where.id) &&
            (where.userId === undefined || l.userId === where.userId) &&
            (where.isDefault === undefined || l.isDefault === where.isDefault),
        ) ?? null,
    },
    item: {
      // `undefined ||` on every key — Prisma's own where semantics, so a
      // resolver that drops `userId` from the scope becomes visible rather
      // than staying green against a hardcoded ownership match.
      updateMany: async ({
        where = {},
        data,
      }: {
        where?: Record<string, unknown>
        data: Partial<FakeItem>
      }) => {
        const rows = state.items.filter(
          (i) =>
            (where.id === undefined || i.id === where.id) &&
            (where.userId === undefined || i.userId === where.userId),
        )
        for (const row of rows) Object.assign(row, data)
        return { count: rows.length }
      },
    },
    itemStock: {
      findMany: async ({
        where = {},
        orderBy,
      }: {
        where?: Record<string, unknown>
        orderBy?: Record<string, 'asc' | 'desc'>
      }) => {
        const rows = state.itemStocks.filter((s) => stockMatches(s, where))
        // Only sorts when the resolver actually asks for it — mirrors
        // Postgres giving no ordering guarantee without orderBy, so a
        // resolver that drops the orderBy call gets insertion order back,
        // not an accidentally-correct sort.
        if (!orderBy) return rows
        const [[field, dir]] = Object.entries(orderBy)
        const sign = dir === 'desc' ? -1 : 1
        return [...rows].sort((a, b) => {
          const av = (a as unknown as Record<string, unknown>)[field]
          const bv = (b as unknown as Record<string, unknown>)[field]
          if (av === bv) return 0
          return (av as string) < (bv as string) ? -sign : sign
        })
      },
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        state.itemStocks.find((s) => stockMatches(s, where)) ?? null,
      create: async ({ data }: { data: Omit<FakeStock, 'id' | 'createdAt' | 'updatedAt'> }) => {
        // Models @@unique([itemId, locationId]). It guards a resolver that
        // creates unconditionally; it does NOT pin addItemToLocation's
        // already-stocked branch, which its own assertions cover — making this
        // dedupe instead of throw leaves all 17 specs here green (verified
        // 2026-08-31, correcting an earlier comment that claimed otherwise).
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
    inventoryLog: {
      deleteMany: async ({ where = {} }: { where?: Record<string, unknown> }) => {
        const before = state.inventoryLogs.length
        state.inventoryLogs = state.inventoryLogs.filter((l) => !logMatches(l, where))
        return { count: before - state.inventoryLogs.length }
      },
    },
    cartItem: {
      deleteMany: async ({ where = {} }: { where?: Record<string, unknown> }) => {
        if (state.failCartItemDeleteMany) {
          throw new Error('cartItem.deleteMany exploded')
        }
        const before = state.cartItems.length
        state.cartItems = state.cartItems.filter((c) => !matchesCartItem(c, where))
        return { count: before - state.cartItems.length }
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
    // The legacy `Item` columns the PR 5 dual-write mirrors onto. Their values
    // deliberately differ from every ItemStock row's, so "the mirror ran" and
    // "the fixture already said that" are distinguishable.
    state.items = [
      {
        id: 'item-milk',
        userId: 'user-a',
        targetQuantity: 99,
        refillThreshold: 99,
        packedQuantity: 99,
        unpackedQuantity: 99,
        dueDate: null,
      },
      {
        id: 'item-far',
        userId: 'user-a',
        targetQuantity: 99,
        refillThreshold: 99,
        packedQuantity: 99,
        unpackedQuantity: 99,
        dueDate: null,
      },
      {
        id: 'item-new',
        userId: 'user-a',
        targetQuantity: 99,
        refillThreshold: 99,
        packedQuantity: 99,
        unpackedQuantity: 99,
        dueDate: null,
      },
    ]
    state.itemStocks = [
      // dueDate is non-null so the upsert "omitted" and "cleared" cases are
      // distinguishable — with a null starting value both would look
      // identical and prove nothing.
      stock({ id: 'st-home', itemId: 'item-milk', locationId: 'loc-a', targetQuantity: 3, refillThreshold: 1, packedQuantity: 2, dueDate: new Date('2026-09-01T00:00:00.000Z') }),
      stock({ id: 'st-garage', itemId: 'item-far', locationId: 'loc-a2', targetQuantity: 9, refillThreshold: 4, packedQuantity: 7 }),
      stock({ id: 'st-theirs', itemId: 'item-rice', locationId: 'loc-b', targetQuantity: 1 }),
    ]

    // The two cascade families. `item-milk` is present at BOTH of user-a's
    // locations, so "deleted here" and "deleted everywhere" are different
    // answers — a one-location fixture cannot tell them apart.
    state.inventoryLogs = [
      { id: 'log-a1', itemId: 'item-milk', locationId: 'loc-a', userId: 'user-a' },
      { id: 'log-a2', itemId: 'item-milk', locationId: 'loc-a', userId: 'user-a' },
      // Same item, the OTHER location of the SAME user. This is the row that
      // goes red when the resolver drops `locationId` from its filter.
      { id: 'log-far', itemId: 'item-milk', locationId: 'loc-a2', userId: 'user-a' },
      // Same location, a different item.
      { id: 'log-other', itemId: 'item-bread', locationId: 'loc-a', userId: 'user-a' },
      // A stranger's row, so "the caller's location" is distinguishable from
      // "the first location in the table".
      { id: 'log-theirs', itemId: 'item-milk', locationId: 'loc-b', userId: 'user-b' },
    ]
    // Cart ids are `${locationId}:${vendorId | 'no-vendor'}` (lib/cartId.ts),
    // but the cascade filters on `Cart.locationId`, the column those ids are
    // BUILT from. Both are seeded so the two stay distinguishable — see the
    // last cart test in this file.
    state.carts = [
      { id: 'loc-a:no-vendor', locationId: 'loc-a' },
      { id: 'loc-a:ven-1', locationId: 'loc-a' },
      // A vendor id that itself contains ':'. Realistic, because `cartIdFor`
      // puts the vendor id in verbatim.
      { id: 'loc-a:ven:dor', locationId: 'loc-a' },
      // 'loc-a2:ven-1' starts with the string 'loc-a'.
      { id: 'loc-a2:ven-1', locationId: 'loc-a2' },
      { id: 'loc-b:no-vendor', locationId: 'loc-b' },
    ]
    state.cartItems = [
      { id: 'ci-a-novendor', cartId: 'loc-a:no-vendor', itemId: 'item-milk', userId: 'user-a' },
      { id: 'ci-a-vendor', cartId: 'loc-a:ven-1', itemId: 'item-milk', userId: 'user-a' },
      { id: 'ci-a-colon', cartId: 'loc-a:ven:dor', itemId: 'item-milk', userId: 'user-a' },
      // The OTHER location of the SAME user. This is the row that goes red
      // when the resolver drops `cart: { locationId }` from its delete.
      { id: 'ci-a2', cartId: 'loc-a2:ven-1', itemId: 'item-milk', userId: 'user-a' },
      // Same location, a different item.
      { id: 'ci-a-other', cartId: 'loc-a:no-vendor', itemId: 'item-bread', userId: 'user-a' },
      { id: 'ci-theirs', cartId: 'loc-b:no-vendor', itemId: 'item-milk', userId: 'user-b' },
    ]
    state.failCartItemDeleteMany = false
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

  it('itemStocksForItem returns rows ordered by locationId regardless of insertion order', async () => {
    // Given the loc-a2 row is inserted BEFORE the loc-a row — the reverse of
    // sorted order — so a resolver relying on insertion/array order would
    // return them out of order
    state.itemStocks.push(stock({ id: 'st-rev2', itemId: 'item-ordered', locationId: 'loc-a2', targetQuantity: 1 }))
    state.itemStocks.push(stock({ id: 'st-rev1', itemId: 'item-ordered', locationId: 'loc-a', targetQuantity: 2 }))

    const res = await run(`query Q($i: ID!) { itemStocksForItem(itemId: $i) { locationId } }`, { i: 'item-ordered' })

    // Then the result is still ascending by locationId
    expect(res.data?.itemStocksForItem).toEqual([{ locationId: 'loc-a' }, { locationId: 'loc-a2' }])
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

  it('upsert with dueDate omitted leaves the existing date untouched', async () => {
    // Given st-home has dueDate 2026-09-01 (set in beforeEach)
    // When input omits the dueDate key entirely
    const res = await run(
      `mutation M($i: ID!, $l: ID!, $in: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $in) { dueDate } }`,
      { i: 'item-milk', l: 'loc-a', in: { packedQuantity: 5 } },
    )
    // Then the date survives — 'dueDate' in input is false, so toData never
    // touches data.dueDate
    expect(res.data?.upsertItemStock).toEqual({ dueDate: '2026-09-01T00:00:00.000Z' })
  })

  it('upsert with dueDate explicitly null clears the existing date', async () => {
    // Given st-home has dueDate 2026-09-01
    // When input explicitly sends dueDate: null
    const res = await run(
      `mutation M($i: ID!, $l: ID!, $in: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $in) { dueDate } }`,
      { i: 'item-milk', l: 'loc-a', in: { dueDate: null } },
    )
    // Then the date is cleared — 'dueDate' in input is true even though the
    // value is null, which is exactly why a null check would be wrong here
    expect(res.data?.upsertItemStock).toEqual({ dueDate: null })
  })

  it('upsert with an explicit dueDate value sets it', async () => {
    const res = await run(
      `mutation M($i: ID!, $l: ID!, $in: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $in) { dueDate } }`,
      { i: 'item-milk', l: 'loc-a', in: { dueDate: '2026-12-25T00:00:00.000Z' } },
    )
    expect(res.data?.upsertItemStock).toEqual({ dueDate: '2026-12-25T00:00:00.000Z' })
  })

  // The PR 5 dual-write, in the ItemStock -> Item direction. A stale bundle
  // reads `Item`'s five legacy columns and has no location concept, so the
  // DEFAULT location's stock is the value it must be shown — and an edit
  // anywhere else must leave `Item` alone. Deleting these when `Item`'s columns
  // go (lib/stockDualWrite.ts).
  const UPSERT = `mutation M($i: ID!, $l: ID!, $in: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $in) { packedQuantity } }`
  const itemColumns = (id: string) => {
    const row = state.items.find((i) => i.id === id)
    if (!row) throw new Error(`no fixture item ${id}`)
    const { id: _id, userId: _userId, ...columns } = row
    return columns
  }

  it('user editing stock at their default location also updates the item\'s legacy columns', async () => {
    // Given loc-a is user-a's default and item-milk's Item columns all read 99
    expect(state.locations.find((l) => l.id === 'loc-a')?.isDefault).toBe(true)

    // When the user sets packedQuantity there
    const res = await run(UPSERT, { i: 'item-milk', l: 'loc-a', in: { packedQuantity: 5 } })

    // Then BOTH halves moved: the ItemStock row, and the Item columns a stale
    // bundle still reads — mirrored as the whole saved row, so they equal the
    // default location's stock rather than a partial merge of it
    expect(res.data?.upsertItemStock).toEqual({ packedQuantity: 5 })
    expect(state.itemStocks.find((s) => s.id === 'st-home')?.packedQuantity).toBe(5)
    expect(itemColumns('item-milk')).toEqual({
      targetQuantity: 3,
      refillThreshold: 1,
      packedQuantity: 5,
      unpackedQuantity: 0,
      dueDate: new Date('2026-09-01T00:00:00.000Z'),
    })
  })

  it('user editing stock at a non-default location leaves the item\'s legacy columns alone', async () => {
    // Given loc-a2 is NOT user-a's default, and item-far is stocked only there
    expect(state.locations.find((l) => l.id === 'loc-a2')?.isDefault).toBe(false)

    // When the user sets packedQuantity there
    const res = await run(UPSERT, { i: 'item-far', l: 'loc-a2', in: { packedQuantity: 5 } })

    // Then only the ItemStock row moved. There is no correct single value to
    // write onto `Item` for a non-default location, so a stale bundle keeps
    // showing the default location's numbers rather than the Garage's.
    expect(res.data?.upsertItemStock).toEqual({ packedQuantity: 5 })
    expect(state.itemStocks.find((s) => s.id === 'st-garage')?.packedQuantity).toBe(5)
    expect(itemColumns('item-far')).toEqual({
      targetQuantity: 99,
      refillThreshold: 99,
      packedQuantity: 99,
      unpackedQuantity: 99,
      dueDate: null,
    })
  })

  it('creating a stock row at the default location mirrors the whole new row', async () => {
    // Given item-new has no ItemStock anywhere, and Item columns reading 99
    // When it is stocked at the default location with a partial input
    await run(UPSERT, { i: 'item-new', l: 'loc-a', in: { targetQuantity: 4, packedQuantity: 1 } })

    // Then the fields the input omitted land as the new row's zeroes, not as
    // the leftover 99s — the mirror copies the saved row, not the input
    expect(itemColumns('item-new')).toEqual({
      targetQuantity: 4,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
      dueDate: null,
    })
  })

  it('the mirror never writes another user\'s item', async () => {
    // Given user-b owns item-rice, and user-a upserts it into their OWN
    // default location — `upsertItemStock` authorizes the LOCATION, not the
    // item, so the stock row is written and the mirror is reached
    state.items.push({
      id: 'item-rice',
      userId: 'user-b',
      targetQuantity: 99,
      refillThreshold: 99,
      packedQuantity: 99,
      unpackedQuantity: 99,
      dueDate: null,
    })

    // When user-a upserts it at loc-a (their default)
    await run(UPSERT, { i: 'item-rice', l: 'loc-a', in: { packedQuantity: 5 } })

    // Then user-b's Item columns are untouched — the mirror's where clause
    // scopes to the caller, so a foreign id matches no row
    expect(itemColumns('item-rice')).toEqual({
      targetQuantity: 99,
      refillThreshold: 99,
      packedQuantity: 99,
      unpackedQuantity: 99,
      dueDate: null,
    })
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

  it('add to location with no sourceLocationId picks the most recently updated source', async () => {
    // Given item-tiebreak is stocked at two OTHER locations with distinct
    // updatedAt — sourceLocationId omitted means the resolver must choose,
    // and targetQuantity distinguishes which one it chose (not coincidence)
    state.locations.push({ id: 'loc-a3', userId: 'user-a', isDefault: false })
    state.itemStocks.push(
      stock({
        id: 'st-older', itemId: 'item-tiebreak', locationId: 'loc-a',
        targetQuantity: 10, updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      stock({
        id: 'st-newer', itemId: 'item-tiebreak', locationId: 'loc-a2',
        targetQuantity: 20, updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      }),
    )

    // When adding to a third location without specifying a source
    const res = await run(
      `mutation M($i: ID!, $l: ID!) { addItemToLocation(itemId: $i, locationId: $l) { targetQuantity } }`,
      { i: 'item-tiebreak', l: 'loc-a3' },
    )

    // Then the more recently updated row (loc-a2, targetQuantity 20) won,
    // not the older one (loc-a, targetQuantity 10)
    expect(res.data?.addItemToLocation).toEqual({ targetQuantity: 20 })
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

  // ─── the remove cascade (PR 3c) ─────────────────────────────────────────
  //
  // The cloud counterpart of local's `removeItemFromLocation`
  // (apps/web/src/db/operations.ts): the stock row, the item's inventory logs
  // at that location, and the item's entries in that location's carts.

  const REMOVE = `mutation M($i: ID!, $l: ID!) { removeItemFromLocation(itemId: $i, locationId: $l) }`

  it('user removing an item from a location also deletes its logs there', async () => {
    // Given item-milk has two logs at loc-a and one at loc-a2
    // When the user removes it from loc-a
    const res = await run(REMOVE, { i: 'item-milk', l: 'loc-a' })

    // Then only loc-a's two went. log-far proves the delete was scoped to one
    // location, not to the item.
    expect(res.data?.removeItemFromLocation).toBe(true)
    expect(state.inventoryLogs.map((l) => l.id).sort()).toEqual([
      'log-far', 'log-other', 'log-theirs',
    ])
  })

  it('user removing an item from a location also deletes its cart entries there', async () => {
    // Given item-milk sits in three of loc-a's carts and in one of loc-a2's
    // When the user removes it from loc-a
    const res = await run(REMOVE, { i: 'item-milk', l: 'loc-a' })

    // Then loc-a's three went and loc-a2's stayed. ci-a2 is the guard: drop
    // `cart: { locationId }` from the resolver's delete and this assertion
    // goes red, because every one of item-milk's entries would go.
    expect(res.data?.removeItemFromLocation).toBe(true)
    expect(state.cartItems.map((c) => c.id).sort()).toEqual([
      'ci-a-other', 'ci-a2', 'ci-theirs',
    ])
  })

  it('a cart entry is matched by its cart\'s locationId, not by the text of its cart id', async () => {
    // Given a cart whose id TEXT and whose `locationId` COLUMN disagree.
    // Production cannot reach this state — `cartIdFor` builds the id out of
    // the column — and that is the point: it is the only fixture that can
    // tell the two apart. Reading the column is right, because the column is
    // the source and the id is derived from it.
    state.carts = [
      // Id says loc-a2. Column says loc-a.
      { id: 'loc-a2:ven-9', locationId: 'loc-a' },
      // Id says loc-a. Column says loc-a2.
      { id: 'loc-a:ven-9', locationId: 'loc-a2' },
    ]
    state.cartItems = [
      { id: 'ci-column-here', cartId: 'loc-a2:ven-9', itemId: 'item-milk', userId: 'user-a' },
      { id: 'ci-column-away', cartId: 'loc-a:ven-9', itemId: 'item-milk', userId: 'user-a' },
    ]

    // When the user removes item-milk from loc-a
    await run(REMOVE, { i: 'item-milk', l: 'loc-a' })

    // Then the row whose CART is at loc-a went, and the row whose cart id only
    // LOOKS like loc-a stayed. A resolver that parsed the cart id would have
    // deleted exactly the other one.
    expect(state.cartItems.map((c) => c.id)).toEqual(['ci-column-away'])
  })

  it('a removal that fails partway leaves every earlier delete undone', async () => {
    // Given the last of the three deletes throws
    state.failCartItemDeleteMany = true

    // When the user removes item-milk from loc-a
    const res = await run(REMOVE, { i: 'item-milk', l: 'loc-a' })

    // Then the mutation reports the failure
    expect(res.errors?.[0]?.message).toMatch(/exploded/)
    // And the stock row and the logs that were deleted BEFORE the throw are
    // back. Without a transaction they would be gone and only the cart
    // entries would remain, which is a half-applied removal.
    expect(state.itemStocks.some((s) => s.id === 'st-home')).toBe(true)
    expect(state.inventoryLogs.map((l) => l.id).sort()).toEqual([
      'log-a1', 'log-a2', 'log-far', 'log-other', 'log-theirs',
    ])
    expect(state.cartItems).toHaveLength(6)
  })

  it('a refused removal deletes nothing at all', async () => {
    // Given loc-b belongs to user-b
    // When user-a tries to remove item-milk from it
    const res = await run(REMOVE, { i: 'item-milk', l: 'loc-b' })

    // Then the role check refused before any delete ran
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(state.inventoryLogs).toHaveLength(5)
    expect(state.cartItems).toHaveLength(6)
  })
})
