import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { FakeCart, FakeCartItem } from '../test/cartItemFake.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { InventoryLogFake } from '../test/inventoryLogFake.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
//
// Every model here is a SHARED stateful fake. Each one checks its whole
// `where` once per call with `checkWhere` (src/test/whereKeys.ts), so a key or
// a filter shape it does not model THROWS instead of matching every row:
//
//   - `user`, `household`, `householdMember`, `locationMember`, `location` and
//     `itemStock` are `householdWorld` (src/test/householdWorld.ts). Every
//     role is a row `seed` writes. Nothing is derived from a location's
//     `userId`: households H3a task 3.8 removed `derivedRoles` from this file.
//   - `inventoryLog` is `inventoryLogFake`.
//   - `cartItem.deleteMany` runs the shared matcher `filterCartItems`
//     (src/test/cartItemFake.ts), so this spec and `cart.resolver.test.ts`
//     agree on what `cart: { locationId }` means.
//
// Until task 3.8 this file carried its own matchers (`stockMatches`,
// `logMatches`, an inline `location.findFirst`). Each walked `where` key by
// key and IGNORED a key it did not know, so a resolver that added a filter
// the fake could not read would have passed here silently (plan H3a task 3.8,
// step 0).
//
// NO `item` model, and that is on purpose. Until cloud locations PR 5 there
// was one, because `upsertItemStock` mirrored the saved row back onto `Item`'s
// five legacy state columns. PR 5 task 3 deleted that mirror. A fake that
// still carried an `item` store would let a reinstated mirror pass quietly.
//
// Everything is built INSIDE the factory and hung off the mocked client,
// because a `vi.mock` factory is hoisted above every import and cannot close
// over a module-scope binding.
vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createInventoryLogFake } = await import('../test/inventoryLogFake.js')
  const { filterCartItems } = await import('../test/cartItemFake.js')
  const world = createHouseholdWorld()
  const logs = createInventoryLogFake()
  const carts = {
    // `Cart` rows, because `CartItem` has NO locationId column of its own. The
    // location lives on the cart, in `Cart.locationId` (PR 3a), which is what
    // the cascade's relation filter reads.
    carts: [] as FakeCart[],
    cartItems: [] as FakeCartItem[],
    // Failure injection for the atomicity test. `cartItem.deleteMany` is the
    // LAST of the three deletes, so a throw there is what proves the two
    // before it were rolled back. A boolean rather than a function: the
    // rollback snapshot uses `structuredClone`, which throws on a function.
    failCartItemDeleteMany: false,
  }
  const cartItem = {
    deleteMany: async ({ where = {} }: { where?: Record<string, unknown> } = {}) => {
      if (carts.failCartItemDeleteMany) throw new Error('cartItem.deleteMany exploded')
      // `filterCartItems` checks the whole `where` once, before it reads a
      // row, so an unknown key throws even when the store is empty.
      const hits = new Set(filterCartItems(carts.cartItems, where, carts.carts))
      const before = carts.cartItems.length
      carts.cartItems = carts.cartItems.filter((c) => !hits.has(c))
      return { count: before - carts.cartItems.length }
    },
  }
  // The log and cart stores roll back with the world's own, so one
  // `$transaction` covers all three deletes of `removeItemFromLocation`.
  world.extend({ inventoryLog: logs.client, cartItem }, [
    logs.state as unknown as Record<string, unknown>,
    carts as unknown as Record<string, unknown>,
  ])
  return { prisma: { ...world.client, $world: world, $logs: logs, $carts: carts } }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import { makeInventoryLog } from '../test/inventoryLogFake.js'
import { makeStock } from '../test/stockFake.js'

const handles = prisma as unknown as {
  $world: HouseholdWorld
  $logs: InventoryLogFake
  $carts: {
    carts: FakeCart[]
    cartItems: FakeCartItem[]
    failCartItemDeleteMany: boolean
  }
}
const world = handles.$world
const logs = handles.$logs
const carts = handles.$carts
const stockState = world.stock.state

const server = new ApolloServer<Context>({ typeDefs, resolvers })

async function run(query: string, variables: Record<string, unknown> = {}, userId: string | null = 'user-a') {
  const res = await server.executeOperation({ query, variables }, { contextValue: { userId } })
  if (res.body.kind !== 'single') throw new Error('expected single result')
  return res.body.singleResult
}

const stock = makeStock

// ── The fixture ──
//
// | Person | Household | Household role | Location roles                    |
// |--------|-----------|----------------|-----------------------------------|
// | user-a | hh-a      | owner          | loc-a, loc-a2, loc-a3: organizer  |
// | user-b | hh-b      | owner          | loc-b: organizer                  |
//
// `loc-a3` is in the fixture so the "most recently updated source" test has
// a third location to add to.
function seed() {
  world.reset()
  world.stock.reset(
    [
      { id: 'loc-a', userId: 'user-a', householdId: 'hh-a', isDefault: true },
      { id: 'loc-a2', userId: 'user-a', householdId: 'hh-a', isDefault: false },
      { id: 'loc-a3', userId: 'user-a', householdId: 'hh-a', isDefault: false },
      { id: 'loc-b', userId: 'user-b', householdId: 'hh-b', isDefault: true },
    ],
    [],
  )
  world.seedHouseholds({
    households: [householdRow('hh-a', 'user-a'), householdRow('hh-b', 'user-b')],
    householdMembers: [
      householdMemberRow('hh-a', 'user-a', 'owner'),
      householdMemberRow('hh-b', 'user-b', 'owner'),
    ],
    locationMembers: [
      locationMemberRow('loc-a', 'user-a', 'organizer'),
      locationMemberRow('loc-a2', 'user-a', 'organizer'),
      locationMemberRow('loc-a3', 'user-a', 'organizer'),
      locationMemberRow('loc-b', 'user-b', 'organizer'),
    ],
  })
}

describe('itemStock resolvers', () => {
  beforeEach(() => {
    seed()
    // TWO stocked locations for user-a, plus one for user-b. `item-far` is
    // stocked ONLY at loc-a2 — without it, "stocks here" and "all stocks"
    // would be the same set and every scoping assertion below would be
    // vacuous.
    stockState.itemStocks = [
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
    logs.reset([
      makeInventoryLog({ id: 'log-a1', itemId: 'item-milk', locationId: 'loc-a', userId: 'user-a' }),
      makeInventoryLog({ id: 'log-a2', itemId: 'item-milk', locationId: 'loc-a', userId: 'user-a' }),
      // Same item, the OTHER location of the SAME user. This is the row that
      // goes red when the resolver drops `locationId` from its filter.
      makeInventoryLog({ id: 'log-far', itemId: 'item-milk', locationId: 'loc-a2', userId: 'user-a' }),
      // Same location, a different item.
      makeInventoryLog({ id: 'log-other', itemId: 'item-bread', locationId: 'loc-a', userId: 'user-a' }),
      // A stranger's row, so "the caller's location" is distinguishable from
      // "the first location in the table".
      makeInventoryLog({ id: 'log-theirs', itemId: 'item-milk', locationId: 'loc-b', userId: 'user-b' }),
    ])
    // Cart ids are `${locationId}:${vendorId | 'no-vendor'}` (lib/cartId.ts),
    // but the cascade filters on `Cart.locationId`, the column those ids are
    // BUILT from. Both are seeded so the two stay distinguishable — see the
    // last cart test in this file.
    carts.carts = [
      { id: 'loc-a:no-vendor', locationId: 'loc-a' },
      { id: 'loc-a:ven-1', locationId: 'loc-a' },
      // A vendor id that itself contains ':'. Realistic, because `cartIdFor`
      // puts the vendor id in verbatim.
      { id: 'loc-a:ven:dor', locationId: 'loc-a' },
      // 'loc-a2:ven-1' starts with the string 'loc-a'.
      { id: 'loc-a2:ven-1', locationId: 'loc-a2' },
      { id: 'loc-b:no-vendor', locationId: 'loc-b' },
    ]
    carts.cartItems = [
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
    carts.failCartItemDeleteMany = false
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
    stockState.itemStocks.push(stock({ id: 'st-extra', itemId: 'item-milk', locationId: 'loc-a2', targetQuantity: 5 }))
    const res = await run(`query Q($i: ID!) { itemStocksForItem(itemId: $i) { locationId } }`, { i: 'item-milk' })
    expect(res.data?.itemStocksForItem).toEqual([{ locationId: 'loc-a' }, { locationId: 'loc-a2' }])
  })

  it('itemStocksForItem excludes another user\'s rows', async () => {
    // Given user-b also stocks an item id that user-a stocks
    stockState.itemStocks.push(stock({ id: 'st-b2', itemId: 'item-milk', locationId: 'loc-b' }))
    const res = await run(`query Q($i: ID!) { itemStocksForItem(itemId: $i) { locationId } }`, { i: 'item-milk' })
    expect(res.data?.itemStocksForItem).toEqual([{ locationId: 'loc-a' }])
  })

  it('itemStocksForItem returns rows ordered by locationId regardless of insertion order', async () => {
    // Given the loc-a2 row is inserted BEFORE the loc-a row — the reverse of
    // sorted order — so a resolver relying on insertion/array order would
    // return them out of order
    stockState.itemStocks.push(stock({ id: 'st-rev2', itemId: 'item-ordered', locationId: 'loc-a2', targetQuantity: 1 }))
    stockState.itemStocks.push(stock({ id: 'st-rev1', itemId: 'item-ordered', locationId: 'loc-a', targetQuantity: 2 }))

    const res = await run(`query Q($i: ID!) { itemStocksForItem(itemId: $i) { locationId } }`, { i: 'item-ordered' })

    // Then the result is still ascending by locationId
    expect(res.data?.itemStocksForItem).toEqual([{ locationId: 'loc-a' }, { locationId: 'loc-a2' }])
  })

  // `allItemStocks` — whole-account, every location at once. The fixture's two
  // user-a locations are what make these assertions mean anything: with one
  // location, "all of the caller's stock" and "this location's stock" would be
  // the same set and the query could not be told apart from `itemStocks`.
  const ALL = `query Q { allItemStocks { id locationId } }`

  it('user can read stock from every location they own', async () => {
    // Given st-home is at loc-a and st-garage is at loc-a2 — two DIFFERENT
    // locations of user-a (beforeEach)
    // When user-a reads allItemStocks
    const res = await run(ALL)

    // Then both locations' rows come back. A resolver scoped to one location
    // would return only one of these two.
    expect(res.data?.allItemStocks).toEqual([
      { id: 'st-home', locationId: 'loc-a' },
      { id: 'st-garage', locationId: 'loc-a2' },
    ])
  })

  it('user cannot read another user\'s stock', async () => {
    // Given st-theirs is stocked at loc-b, which belongs to user-b
    // When user-a reads allItemStocks
    const res = await run(ALL)

    // Then st-theirs is absent. This is the assertion that goes red when the
    // resolver drops `where: { location: { userId } }`.
    const ids = (res.data?.allItemStocks as { id: string }[]).map((s) => s.id)
    expect(ids).not.toContain('st-theirs')
    expect(ids).toEqual(['st-home', 'st-garage'])
  })

  it('user with no locations reads an empty list', async () => {
    // Given user-c owns no location, so none of the three fixture rows is
    // reachable through a location of theirs
    const res = await run(ALL, {}, 'user-c')

    // Then an empty array, not null and not an error — the field is
    // [ItemStock!]!, so a null would be a schema violation the client sees as
    // a failed export rather than an empty one
    expect(res.errors).toBeUndefined()
    expect(res.data?.allItemStocks).toEqual([])
  })

  it('allItemStocks orders by locationId then itemId regardless of insertion order', async () => {
    // Given two more rows at loc-a, inserted in DESCENDING itemId order and
    // after the loc-a2 row already in the fixture. Rows sharing a location is
    // the case `locationId` alone cannot order — it is why this query needs a
    // second sort key where `itemStocksForItem` does not.
    stockState.itemStocks.push(stock({ id: 'st-z', itemId: 'item-zucchini', locationId: 'loc-a' }))
    stockState.itemStocks.push(stock({ id: 'st-b', itemId: 'item-bread', locationId: 'loc-a' }))

    const res = await run(ALL)

    // Then loc-a's three rows come first, sorted by itemId within the
    // location, and loc-a2 last
    expect(res.data?.allItemStocks).toEqual([
      { id: 'st-b', locationId: 'loc-a' }, // item-bread
      { id: 'st-home', locationId: 'loc-a' }, // item-milk
      { id: 'st-z', locationId: 'loc-a' }, // item-zucchini
      { id: 'st-garage', locationId: 'loc-a2' }, // item-far
    ])
  })

  it('allItemStocks serializes dates as ISO strings, not epoch milliseconds', async () => {
    // Given st-home carries a dueDate (beforeEach)
    const res = await run(`query Q { allItemStocks { id dueDate createdAt updatedAt } }`)

    // Then every date field is an ISO string. Without toGraphQL the default
    // String scalar coerces a Date via valueOf() and these come out as epoch
    // millisecond digits.
    const rows = res.data?.allItemStocks as {
      id: string
      dueDate: string | null
      createdAt: string
      updatedAt: string
    }[]
    const home = rows.find((r) => r.id === 'st-home')
    expect(home?.dueDate).toBe('2026-09-01T00:00:00.000Z')
    for (const row of rows) {
      expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
      expect(row.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
    }
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

  it('upsert with an empty input still returns a row of zeroes', async () => {
    // Given item-new is stocked nowhere, and the input names no field at all
    // When it is upserted
    const res = await run(
      `mutation M($i: ID!, $l: ID!, $in: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $in) { targetQuantity refillThreshold packedQuantity unpackedQuantity dueDate } }`,
      { i: 'item-new', l: 'loc-a2', in: {} },
    )

    // Then a row comes back, at zeroes. `upsertItemStock` returns
    // `ItemStock!`, so declining to write would make this field null and the
    // whole mutation an error. `writeStock` (lib/itemStockWrite.ts) therefore
    // has NO empty-data early return, unlike the `mirrorStock` it replaced —
    // this is the test that would catch one being added.
    expect(res.errors).toBeUndefined()
    expect(res.data?.upsertItemStock).toEqual({
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      dueDate: null,
    })
  })

  // `upsertItemStock` writes the location it is GIVEN. Four tests here used to
  // assert the other half of the PR 2 dual-write — the default location's row
  // copied back onto `Item`'s five legacy state columns — and went with those
  // columns in cloud locations PR 5. What survives is the half that is now the
  // whole behaviour: the named location moves and no other row appears.
  const UPSERT = `mutation M($i: ID!, $l: ID!, $in: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $in) { packedQuantity } }`

  it('user editing stock at a non-default location writes THAT location, not the default', async () => {
    // Given loc-a2 is NOT user-a's default, and item-far is stocked only there
    expect(stockState.locations.find((l) => l.id === 'loc-a2')?.isDefault).toBe(false)
    expect(stockState.itemStocks.filter((s) => s.itemId === 'item-far')).toHaveLength(1)

    // When the user sets packedQuantity there
    const res = await run(UPSERT, { i: 'item-far', l: 'loc-a2', in: { packedQuantity: 5 } })

    // Then the garage row moved, and item-far STILL has exactly one row. A
    // resolver that ignored `locationId` and wrote the caller's default would
    // create a second row at loc-a and leave st-garage at its fixture 7, so
    // the length is the assertion that tells the two apart.
    expect(res.data?.upsertItemStock).toEqual({ packedQuantity: 5 })
    const far = stockState.itemStocks.filter((s) => s.itemId === 'item-far')
    expect(far).toHaveLength(1)
    expect(far[0]).toMatchObject({ id: 'st-garage', locationId: 'loc-a2', packedQuantity: 5 })
  })

  it('user cannot upsert into another user\'s location', async () => {
    const res = await run(
      `mutation M($i: ID!, $l: ID!, $in: ItemStockInput!) { upsertItemStock(itemId: $i, locationId: $l, input: $in) { id } }`,
      { i: 'item-milk', l: 'loc-b', in: { packedQuantity: 99 } },
    )
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(stockState.itemStocks.find((s) => s.id === 'st-theirs')?.packedQuantity).toBe(0)
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
    expect(stockState.itemStocks.filter((s) => s.itemId === 'item-milk')).toHaveLength(1)
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
    stockState.itemStocks.push(
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
    stockState.itemStocks.push(stock({ id: 'st-extra', itemId: 'item-milk', locationId: 'loc-a2' }))
    const res = await run(`mutation M($i: ID!, $l: ID!) { removeItemFromLocation(itemId: $i, locationId: $l) }`, {
      i: 'item-milk', l: 'loc-a',
    })
    expect(res.data?.removeItemFromLocation).toBe(true)
    expect(stockState.itemStocks.map((s) => s.id).sort()).toEqual(['st-extra', 'st-garage', 'st-theirs'])
  })

  it('user cannot remove an item from another user\'s location', async () => {
    const res = await run(`mutation M($i: ID!, $l: ID!) { removeItemFromLocation(itemId: $i, locationId: $l) }`, {
      i: 'item-rice', l: 'loc-b',
    })
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(stockState.itemStocks.some((s) => s.id === 'st-theirs')).toBe(true)
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
    expect(logs.state.logs.map((l) => l.id).sort()).toEqual([
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
    expect(carts.cartItems.map((c) => c.id).sort()).toEqual([
      'ci-a-other', 'ci-a2', 'ci-theirs',
    ])
  })

  it('a cart entry is matched by its cart\'s locationId, not by the text of its cart id', async () => {
    // Given a cart whose id TEXT and whose `locationId` COLUMN disagree.
    // Production cannot reach this state — `cartIdFor` builds the id out of
    // the column — and that is the point: it is the only fixture that can
    // tell the two apart. Reading the column is right, because the column is
    // the source and the id is derived from it.
    carts.carts = [
      // Id says loc-a2. Column says loc-a.
      { id: 'loc-a2:ven-9', locationId: 'loc-a' },
      // Id says loc-a. Column says loc-a2.
      { id: 'loc-a:ven-9', locationId: 'loc-a2' },
    ]
    carts.cartItems = [
      { id: 'ci-column-here', cartId: 'loc-a2:ven-9', itemId: 'item-milk', userId: 'user-a' },
      { id: 'ci-column-away', cartId: 'loc-a:ven-9', itemId: 'item-milk', userId: 'user-a' },
    ]

    // When the user removes item-milk from loc-a
    await run(REMOVE, { i: 'item-milk', l: 'loc-a' })

    // Then the row whose CART is at loc-a went, and the row whose cart id only
    // LOOKS like loc-a stayed. A resolver that parsed the cart id would have
    // deleted exactly the other one.
    expect(carts.cartItems.map((c) => c.id)).toEqual(['ci-column-away'])
  })

  it('a removal that fails partway leaves every earlier delete undone', async () => {
    // Given the last of the three deletes throws
    carts.failCartItemDeleteMany = true

    // When the user removes item-milk from loc-a
    const res = await run(REMOVE, { i: 'item-milk', l: 'loc-a' })

    // Then the mutation reports the failure
    expect(res.errors?.[0]?.message).toMatch(/exploded/)
    // And the stock row and the logs that were deleted BEFORE the throw are
    // back. Without a transaction they would be gone and only the cart
    // entries would remain, which is a half-applied removal.
    expect(stockState.itemStocks.some((s) => s.id === 'st-home')).toBe(true)
    expect(logs.state.logs.map((l) => l.id).sort()).toEqual([
      'log-a1', 'log-a2', 'log-far', 'log-other', 'log-theirs',
    ])
    expect(carts.cartItems).toHaveLength(6)
  })

  it('a refused removal deletes nothing at all', async () => {
    // Given loc-b belongs to user-b
    // When user-a tries to remove item-milk from it
    const res = await run(REMOVE, { i: 'item-milk', l: 'loc-b' })

    // Then the role check refused before any delete ran
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(logs.state.logs).toHaveLength(5)
    expect(carts.cartItems).toHaveLength(6)
  })
})
