import { ApolloServer } from '@apollo/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── What this file covers ───────────────────────────────────────────────────
//
// The `importCheck` query (households H4 task E.2, decisions T1, T3 and T8).
// It answers two questions about the ids of an import file, before anything
// is written:
//
//   - `anotherHousehold`: is any id a row, or a location, of a household
//     other than the target?
//   - `blockedLocationIds`: which locations of the target household may the
//     caller not write to (below `participant`)?
//
// ─── The fixture (plan H4 rules 16 and 17) ───────────────────────────────────
//
// | Person   | Household role                  | Location roles                          |
// |----------|---------------------------------|-----------------------------------------|
// | caller   | hh-a: set by each test; hh-b: manager | loc-a organizer, loc-a-view viewer, loc-b organizer |
// | other    | hh-a: member                    | loc-a-none organizer                    |
// | stranger | hh-c: owner                     | loc-c organizer                         |
//
// The caller is in TWO households. The target is hh-a, pinned through
// `ctx.requestCache.householdId`. Since H5b `ensureHousehold` gives a fixed
// answer (decision T14), but the pin says which household on purpose.
// `importCheck` is a QUERY, and a query is not wrapped by
// `forgetRolesAroundEach`, so the pin holds (decision T15 forgets it only
// around a `Mutation` field). The caller organizes loc-b, in hh-b. So a check that
// asks "does the caller have a role on this location" instead of "is this
// location in the target household" says loc-b is fine, and the tests below
// see the difference.
//
// Every "another household" fixture also holds rows of hh-a and free ids
// (rule 17), so a check that flags every taken id, or every id, fails too.

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const { createCartFake } = await import('../test/cartFake.js')

  const world = createHouseholdWorld()
  type CatalogRow = { id: string; householdId: string; name: string }
  const catalog = (model: string) =>
    createOwnedRowFake<CatalogRow>({ model, scope: 'householdId' })
  const item = catalog('Item')
  const tag = catalog('Tag')
  const tagType = catalog('TagType')
  const vendor = catalog('Vendor')
  const recipe = catalog('Recipe')
  const shelf = catalog('Shelf')
  // `userId` on a log is its AUTHOR. The store is built with the default
  // `userId` scope only because `create` needs one; no test filters by it.
  const inventoryLog = createOwnedRowFake<{ id: string; userId: string; locationId: string }>({
    model: 'InventoryLog',
    columns: ['locationId'],
  })
  const carts = createCartFake()

  return {
    prisma: {
      ...world.client,
      item: item.client,
      tag: tag.client,
      tagType: tagType.client,
      vendor: vendor.client,
      recipe: recipe.client,
      shelf: shelf.client,
      inventoryLog: inventoryLog.client,
      cart: carts.client.cart,
      cartItem: carts.client.cartItem,
      $world: world,
      $catalog: { item, tag, tagType, vendor, recipe, shelf },
      $log: inventoryLog,
      $carts: carts,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { CartFake } from '../test/cartFake.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { OwnedRowFake } from '../test/ownedRowFake.js'
import type { HouseholdRole } from '../lib/authz.js'

type CatalogRow = { id: string; householdId: string; name: string }
type CatalogKey = 'items' | 'tags' | 'tagTypes' | 'vendors' | 'recipes' | 'shelves'

const mock = prisma as unknown as {
  $world: HouseholdWorld
  $catalog: Record<
    'item' | 'tag' | 'tagType' | 'vendor' | 'recipe' | 'shelf',
    OwnedRowFake<CatalogRow>
  >
  $log: OwnedRowFake<{ id: string; userId: string; locationId: string }>
  $carts: CartFake
}

let server: ApolloServer<Context>

beforeAll(async () => {
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

const T = new Date('2026-11-16T00:00:00.000Z')

/** The model name of the store behind each input key. */
const CATALOG_STORE: Record<CatalogKey, keyof typeof mock.$catalog> = {
  items: 'item',
  tags: 'tag',
  tagTypes: 'tagType',
  vendors: 'vendor',
  recipes: 'recipe',
  shelves: 'shelf',
}

function seed(callerRoleInA: HouseholdRole = 'owner') {
  const world = mock.$world
  world.reset()
  const stockRow = (id: string, locationId: string) => ({
    id,
    itemId: 'item-a',
    locationId,
    targetQuantity: 1,
    refillThreshold: 0,
    packedQuantity: 1,
    unpackedQuantity: 0,
    dueDate: null,
    createdAt: T,
    updatedAt: T,
  })
  world.stock.reset(
    [
      { id: 'loc-a', householdId: 'hh-a', name: 'Kitchen', order: 0 },
      { id: 'loc-a-view', householdId: 'hh-a', name: 'Garage', order: 1 },
      { id: 'loc-a-none', householdId: 'hh-a', name: 'Attic', order: 2 },
      { id: 'loc-a-part', householdId: 'hh-a', name: 'Shed', order: 3 },
      { id: 'loc-b', householdId: 'hh-b', name: 'Office', order: 0 },
      { id: 'loc-c', householdId: 'hh-c', name: 'Theirs', order: 0 },
    ],
    [
      stockRow('stock-a', 'loc-a'),
      stockRow('stock-b', 'loc-b'),
      stockRow('stock-view', 'loc-a-view'),
    ],
  )
  const household = (id: string, ownerId: string) => ({
    id,
    name: `${id} name`,
    ownerId,
    ownerGoneAt: null,
    createdAt: T,
    updatedAt: T,
  })
  world.seedHouseholds({
    households: [
      household('hh-a', 'owner-a'),
      household('hh-b', 'owner-b'),
      household('hh-c', 'stranger'),
    ],
    householdMembers: [
      // hh-a keeps an owner even when the caller is a manager or member
      ...(callerRoleInA === 'owner'
        ? []
        : [{ householdId: 'hh-a', userId: 'owner-a', role: 'owner' as const, joinedAt: T }]),
      { householdId: 'hh-a', userId: 'caller', role: callerRoleInA, joinedAt: T },
      { householdId: 'hh-a', userId: 'other', role: 'member' as const, joinedAt: T },
      { householdId: 'hh-b', userId: 'owner-b', role: 'owner' as const, joinedAt: T },
      { householdId: 'hh-b', userId: 'caller', role: 'manager' as const, joinedAt: T },
      { householdId: 'hh-c', userId: 'stranger', role: 'owner' as const, joinedAt: T },
    ],
    locationMembers: [
      { locationId: 'loc-a', userId: 'caller', role: 'organizer' as const, createdAt: T },
      { locationId: 'loc-a-view', userId: 'caller', role: 'viewer' as const, createdAt: T },
      { locationId: 'loc-a-part', userId: 'caller', role: 'participant' as const, createdAt: T },
      { locationId: 'loc-a-none', userId: 'other', role: 'organizer' as const, createdAt: T },
      { locationId: 'loc-b', userId: 'caller', role: 'organizer' as const, createdAt: T },
      { locationId: 'loc-c', userId: 'stranger', role: 'organizer' as const, createdAt: T },
    ],
  })

  // One row of hh-a, hh-b and hh-c in each catalog model: `items-a`,
  // `items-b`, `items-c`, `tags-a`, ...
  for (const [key, model] of Object.entries(CATALOG_STORE)) {
    const store = mock.$catalog[model]
    store.reset(
      ['a', 'b', 'c'].map((h) => ({ id: `${key}-${h}`, householdId: `hh-${h}`, name: h })),
    )
  }

  mock.$log.reset([
    { id: 'log-a', userId: 'other', locationId: 'loc-a' },
    { id: 'log-a-view', userId: 'caller', locationId: 'loc-a-view' },
    { id: 'log-b', userId: 'caller', locationId: 'loc-b' },
  ])
  mock.$carts.reset({
    carts: [
      { id: 'loc-a:v1', locationId: 'loc-a', lastPurchasedAt: null },
      { id: 'loc-b:v1', locationId: 'loc-b', lastPurchasedAt: null },
      // Stored at loc-b although its id names loc-a. The old import fallback
      // could make such a row (plan H4, *Facts*).
      { id: 'loc-a:moved', locationId: 'loc-b', lastPurchasedAt: null },
      // A cart at the viewer location, and one stored there although its id
      // names loc-a, where the caller is organizer.
      { id: 'loc-a-view:v1', locationId: 'loc-a-view', lastPurchasedAt: null },
      { id: 'loc-a:at-view', locationId: 'loc-a-view', lastPurchasedAt: null },
      // Old fallback rows whose id names a location that does not exist
      // (yet): one stored at loc-a (hh-a), one at loc-b (hh-b).
      { id: 'loc-new:v1', locationId: 'loc-a', lastPurchasedAt: null },
      { id: 'ghost:v1', locationId: 'loc-b', lastPurchasedAt: null },
    ],
    cartItems: [
      { id: 'ci-a', cartId: 'loc-a:v1', itemId: 'items-a', quantity: 1, userId: 'other' },
      { id: 'ci-b', cartId: 'loc-b:v1', itemId: 'items-b', quantity: 1, userId: 'caller' },
      { id: 'ci-view', cartId: 'loc-a-view:v1', itemId: 'items-a', quantity: 1, userId: 'other' },
    ],
  })
}

/** The caller, with the target household pinned to hh-a. */
const CALLER: Context = {
  userId: 'caller',
  requestCache: { householdId: Promise.resolve('hh-a') },
}

const QUERY = /* GraphQL */ `
  query ImportCheck($ids: ImportCheckInput!, $forClear: Boolean) {
    importCheck(ids: $ids, forClear: $forClear) {
      anotherHousehold
      blockedLocationIds
      renameBlockedLocationIds
      missingLocationIds
      missingItemIds
      blockedRows {
        inventoryLogs
        itemStocks
        carts
        cartItems
      }
    }
  }
`

type Answer = {
  anotherHousehold: boolean
  blockedLocationIds: string[]
  renameBlockedLocationIds: string[]
  missingLocationIds: string[]
  missingItemIds: string[]
  blockedRows: { inventoryLogs: string[]; itemStocks: string[]; carts: string[]; cartItems: string[] }
}

/** The answer for a file with nothing wrong, with `changes` on top. */
function expected(changes: Partial<Omit<Answer, 'blockedRows'>> & { blockedRows?: Partial<Answer['blockedRows']> } = {}): Answer {
  const { blockedRows, ...rest } = changes
  return {
    anotherHousehold: false,
    blockedLocationIds: [],
    renameBlockedLocationIds: [],
    missingLocationIds: [],
    missingItemIds: [],
    ...rest,
    blockedRows: { inventoryLogs: [], itemStocks: [], carts: [], cartItems: [], ...blockedRows },
  }
}

type Ids = Partial<
  Record<
    | CatalogKey
    | 'locations'
    | 'locationRefs'
    | 'itemRefs'
    | 'inventoryLogs'
    | 'carts'
    | 'cartItems'
    | 'itemStocks',
    string[]
  >
>

async function check(ids: Ids, forClear?: boolean) {
  // A fresh context every call, so no cached answer leaks between calls.
  const contextValue: Context = {
    ...CALLER,
    requestCache: { householdId: Promise.resolve('hh-a') },
  }
  const response = await server.executeOperation(
    { query: QUERY, variables: { ids, ...(forClear === undefined ? {} : { forClear }) } },
    { contextValue },
  )
  if (response.body.kind !== 'single') throw new Error('expected a single result')
  return response.body.singleResult
}

function answer(result: Awaited<ReturnType<typeof check>>) {
  if (result.errors) throw new Error(`unexpected errors: ${JSON.stringify(result.errors)}`)
  return (result.data as { importCheck: Answer }).importCheck
}

function errorCode(result: Awaited<ReturnType<typeof check>>) {
  return result.errors?.[0]?.extensions?.code
}

beforeEach(() => {
  vi.restoreAllMocks()
  seed()
})

describe('importCheck: rows of another household', () => {
  it.each(Object.keys(CATALOG_STORE) as CatalogKey[])(
    "a %s id of household B is another household's, next to rows of A and free ids",
    async (key) => {
      // Given a file with a row of hh-a, a free id, and a row of hh-b, where
      // the caller is a manager too
      const result = answer(await check({ [key]: [`${key}-a`, `${key}-free`, `${key}-b`] }))
      // Then the file is refused
      expect(result).toEqual(expected({ anotherHousehold: true }))
    },
  )

  it.each(Object.keys(CATALOG_STORE) as CatalogKey[])(
    'a file with only rows of A and free ids is not refused (%s)',
    async (key) => {
      const result = answer(await check({ [key]: [`${key}-a`, `${key}-free`] }))
      expect(result).toEqual(expected())
    },
  )

  it("a stranger's row (household C) is another household's", async () => {
    const result = answer(await check({ items: ['items-a', 'items-c'] }))
    expect(result.anotherHousehold).toBe(true)
  })

  it("a log stored at household B's location is another household's, though the caller organizes it", async () => {
    // Given log-b is at loc-b, in hh-b, where the caller is organizer. The
    // file also holds a log of A and a free id.
    const result = answer(await check({ inventoryLogs: ['log-a', 'log-free', 'log-b'] }))
    expect(result.anotherHousehold).toBe(true)
    // And without log-b the same file passes
    expect(answer(await check({ inventoryLogs: ['log-a', 'log-free'] })).anotherHousehold).toBe(
      false,
    )
  })

  it("a location of household B in the file is another household's", async () => {
    const result = answer(await check({ locations: ['loc-a', 'loc-new', 'loc-b'] }))
    expect(result.anotherHousehold).toBe(true)
    expect(answer(await check({ locations: ['loc-a', 'loc-new'] })).anotherHousehold).toBe(false)
  })

  it("a stock row stored at household B's location is another household's", async () => {
    const result = answer(await check({ itemStocks: ['stock-a', 'stock-free', 'stock-b'] }))
    expect(result.anotherHousehold).toBe(true)
    expect(answer(await check({ itemStocks: ['stock-a', 'stock-free'] })).anotherHousehold).toBe(
      false,
    )
  })

  it("a cart item in a cart at household B's location is another household's", async () => {
    const result = answer(await check({ cartItems: ['ci-a', 'ci-free', 'ci-b'] }))
    expect(result.anotherHousehold).toBe(true)
    expect(answer(await check({ cartItems: ['ci-a', 'ci-free'] })).anotherHousehold).toBe(false)
  })

  it("a cart id whose prefix is the stranger's location is another household's, with no cart row yet", async () => {
    // Given no cart row holds `loc-c:v9`. Only its prefix names loc-c.
    const result = answer(await check({ carts: ['loc-a:v1', 'loc-a:v9', 'loc-c:v9'] }))
    expect(result.anotherHousehold).toBe(true)
    // And a cart id at a location of A, taken or free, passes
    expect(answer(await check({ carts: ['loc-a:v1', 'loc-a:v9'] })).anotherHousehold).toBe(false)
  })

  it("a stored cart whose id names A but which sits at household B's location is another household's", async () => {
    // The prefix loc-a is writable, so the stored cart is read
    const result = answer(await check({ carts: ['loc-a:v1', 'loc-a:moved'] }))
    expect(result.anotherHousehold).toBe(true)
  })

  it('a cart id with no location prefix is refused as bad input', async () => {
    expect(errorCode(await check({ carts: ['loc-a:v1', 'no-vendor'] }))).toBe('BAD_USER_INPUT')
  })

  it('an empty file passes', async () => {
    expect(answer(await check({}))).toEqual(expected())
  })
})

describe('importCheck: locations the caller cannot write', () => {
  it('a location row of A where the caller has no role or is viewer is blocked; a free one is not', async () => {
    const result = answer(
      await check({ locations: ['loc-a', 'loc-a-none', 'loc-a-view', 'loc-new'] }),
    )
    expect(result).toEqual(expected({ blockedLocationIds: ['loc-a-none', 'loc-a-view'] }))
  })

  it('a location the file only points at is blocked the same way', async () => {
    const result = answer(await check({ locationRefs: ['loc-a', 'loc-a-view'] }))
    expect(result).toEqual(expected({ blockedLocationIds: ['loc-a-view'] }))
  })

  it('a cart id at a viewer location blocks that location', async () => {
    const result = answer(await check({ carts: ['loc-a-view:v1'] }))
    expect(result).toEqual(expected({ blockedLocationIds: ['loc-a-view'] }))
  })

  it("on clear nothing is blocked, because clearAllData deletes the household's locations first", async () => {
    // Given the same file as above, by the owner, for clear. A row of hh-b
    // next to it is still another household's.
    const result = answer(
      await check(
        {
          locations: ['loc-a', 'loc-a-none', 'loc-a-view'],
          items: ['items-b'],
          inventoryLogs: ['log-a-view'],
        },
        true,
      ),
    )
    expect(result).toEqual(expected({ anotherHousehold: true }))
  })
})

// Review finding 3: the import drops rows by the location the PAYLOAD names.
// A row whose id is taken at a blocked location, but whose payload names a
// writable one, is not dropped that way, and its mutation refuses the batch.
// So the rows themselves are returned. The stored location is NOT added to
// `blockedLocationIds`: the file does not name it, and the caller may have no
// role there, so the web could not show its name.
describe('importCheck: rows stored at a location the caller cannot write', () => {
  it('a log, a stock row and a cart item stored at the viewer location are blocked rows, next to rows that pass', async () => {
    const result = answer(
      await check({
        inventoryLogs: ['log-a', 'log-free', 'log-a-view'],
        itemStocks: ['stock-a', 'stock-free', 'stock-view'],
        cartItems: ['ci-a', 'ci-free', 'ci-view'],
      }),
    )
    expect(result).toEqual(
      expected({
        blockedRows: {
          inventoryLogs: ['log-a-view'],
          itemStocks: ['stock-view'],
          cartItems: ['ci-view'],
        },
      }),
    )
  })

  it('a cart whose id names a writable location but which is stored at the viewer location is a blocked row', async () => {
    // `cartVerdict` refuses it: "own" means stored at the location its id
    // names. loc-a:v1 next to it passes.
    const result = answer(await check({ carts: ['loc-a:v1', 'loc-a:v9', 'loc-a:at-view'] }))
    expect(result).toEqual(expected({ blockedRows: { carts: ['loc-a:at-view'] } }))
  })

  it('on clear no row is blocked', async () => {
    const result = answer(
      await check({ inventoryLogs: ['log-a-view'], carts: ['loc-a:at-view'] }, true),
    )
    expect(result).toEqual(expected())
  })
})

// Review finding 1: a location the file only points at (a stock row's or a
// log's `locationId`, a cart id's prefix) is refused by its mutation when no
// location will hold it. Only the file's location ROWS are created.
describe('importCheck: references to locations that will not exist', () => {
  it('a referenced location no row holds is missing; a free location ROW is not', async () => {
    // Given `phantom` is only pointed at, `loc-new` is a row of the file, and
    // loc-a is a writable location of A. No cart row holds `phantom:v1`.
    const result = answer(
      await check({
        locations: ['loc-new'],
        locationRefs: ['loc-a', 'phantom'],
        carts: ['phantom:v1', 'loc-a:v1'],
      }),
    )
    expect(result).toEqual(expected({ missingLocationIds: ['phantom'] }))
  })

  it("on clear a referenced location of A is missing, because the clear deletes it; one the file holds a row for is not", async () => {
    const result = answer(
      await check({ locations: ['loc-a'], locationRefs: ['loc-a-view'] }, true),
    )
    expect(result).toEqual(expected({ missingLocationIds: ['loc-a-view'] }))
  })

  it("a referenced location of household B is another household's, not missing", async () => {
    const result = answer(await check({ locationRefs: ['loc-a', 'loc-b'] }))
    expect(result).toEqual(expected({ anotherHousehold: true }))
  })
})

// Review finding 2: `requireOwnItemStockRefs` REFUSES a stock row whose item
// is not in the household. The file's own items are created first, so only a
// stock `itemId` that is not an item of the file is a reference.
describe('importCheck: items stock rows point at', () => {
  it("a referenced item of household B is another household's", async () => {
    const result = answer(await check({ itemRefs: ['items-a', 'items-b'] }))
    expect(result).toEqual(expected({ anotherHousehold: true }))
  })

  it('a referenced item no row holds is missing; an item of A is not', async () => {
    const result = answer(await check({ itemRefs: ['items-a', 'item-free'] }))
    expect(result).toEqual(expected({ missingItemIds: ['item-free'] }))
  })

  it('on clear a referenced item of A is missing, because the clear deletes it', async () => {
    const result = answer(await check({ itemRefs: ['items-a'] }, true))
    expect(result).toEqual(expected({ missingItemIds: ['items-a'] }))
  })
})

// Decision T6: the cart table is read for a cart id only when the location
// its id names will be writable when the cart is written. A caller never
// learns whether a cart id is taken at an EXISTING location they cannot
// write. (Review finding 4 of E.2.)
describe('importCheck: which cart ids are read', () => {
  function askedCartIds(findMany: { mock: { calls: unknown[][] } }) {
    return findMany.mock.calls.flatMap(
      (call) => (call[0] as { where: { id: { in: string[] } } }).where.id.in,
    )
  }

  it('reads no cart for a prefix of another household or of a viewer location', async () => {
    const findMany = vi.spyOn(prisma.cart, 'findMany')
    const findUnique = vi.spyOn(prisma.cart, 'findUnique')
    const findFirst = vi.spyOn(prisma.cart, 'findFirst')
    const result = answer(await check({ carts: ['loc-c:no-vendor', 'loc-b:v1', 'loc-a-view:v1'] }))
    expect(result).toEqual(expected({ anotherHousehold: true, blockedLocationIds: ['loc-a-view'] }))
    expect(findMany).not.toHaveBeenCalled()
    expect(findUnique).not.toHaveBeenCalled()
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('reads the cart ids whose prefix is writable or names no location yet, and no other', async () => {
    const findMany = vi.spyOn(prisma.cart, 'findMany')
    await check({ carts: ['loc-a:v1', 'loc-c:no-vendor', 'loc-a-view:v1', 'loc-new:v1'] })
    expect(askedCartIds(findMany).sort()).toEqual(['loc-a:v1', 'loc-new:v1'])
  })

  it('on clear reads the cart ids whose prefix is in the target or names no location, not another household', async () => {
    const findMany = vi.spyOn(prisma.cart, 'findMany')
    await check({ carts: ['loc-a-view:v1', 'loc-c:no-vendor', 'loc-new:v1'] }, true)
    expect(askedCartIds(findMany).sort()).toEqual(['loc-a-view:v1', 'loc-new:v1'])
  })
})

// Second review of E.2. `cartVerdict` runs when the cart is WRITTEN: after
// the file's locations are created, and with `forClear` after `clearAllData`.
// So a prefix that is free now can be writable then, and a stored cart with
// that id is refused because it is not at the location its id names.
describe('importCheck: a stored cart whose prefix becomes writable during the import', () => {
  it('a cart id naming a location the file creates, stored at a location of A, is a blocked row', async () => {
    // Given the file creates loc-new and holds loc-new:v1. The cloud already
    // holds loc-new:v1, stored at loc-a. loc-a:v1 next to it passes.
    const result = answer(
      await check({ locations: ['loc-new'], carts: ['loc-new:v1', 'loc-a:v1'] }),
    )
    expect(result).toEqual(expected({ blockedRows: { carts: ['loc-new:v1'] } }))
  })

  it("a cart id naming a free location, stored in household B, is another household's", async () => {
    const result = answer(await check({ locations: ['ghost'], carts: ['ghost:v1', 'loc-a:v1'] }))
    expect(result).toEqual(expected({ anotherHousehold: true }))
  })

  it("on clear a cart the file writes again, stored in household B, is another household's", async () => {
    // Given the file holds location loc-a and cart loc-a:moved. The cloud
    // cart loc-a:moved is stored at loc-b, in hh-b, so the clear keeps it,
    // and `cartVerdict` refuses it after the file creates loc-a again.
    const result = answer(
      await check({ locations: ['loc-a'], carts: ['loc-a:v1', 'loc-a:moved'] }, true),
    )
    expect(result).toEqual(expected({ anotherHousehold: true }))
  })

  it('on clear a cart stored at a location of A is fine: the clear deletes it', async () => {
    const result = answer(
      await check({ locations: ['loc-a', 'loc-new'], carts: ['loc-a:at-view', 'loc-new:v1'] }, true),
    )
    expect(result).toEqual(expected())
  })
})

// Found while checking E.3: on `replace` the web sends every location row that
// already exists to `bulkUpsertLocations`, which asks `organizer` (a rename).
// A location where the caller is only `participant` is refused for the whole
// batch.
describe('importCheck: location rows the caller may not rename', () => {
  it('a location row where the caller is participant is reported; organizer and free rows are not', async () => {
    const result = answer(
      await check({ locations: ['loc-a', 'loc-a-part', 'loc-new'], locationRefs: ['loc-a-part'] }),
    )
    expect(result).toEqual(expected({ renameBlockedLocationIds: ['loc-a-part'] }))
  })

  it('a location the file only points at is not reported: nothing renames it', async () => {
    expect(answer(await check({ locationRefs: ['loc-a-part'] }))).toEqual(expected())
  })

  it('on clear nothing is reported: the file creates every location again', async () => {
    expect(answer(await check({ locations: ['loc-a-part'] }, true))).toEqual(expected())
  })
})

// Task E.3, decision T12: both location imports refuse such an id for the
// whole batch.
describe('importCheck: location ids the import refuses', () => {
  it.each(['local', 'a:b'])('a location row with the id %s is bad input', async (id) => {
    expect(errorCode(await check({ locations: ['loc-a', id] }))).toBe('BAD_USER_INPUT')
  })
})

describe('importCheck: the household role', () => {
  it('a household member is refused', async () => {
    seed('member')
    expect(errorCode(await check({ items: ['items-a'] }))).toBe('FORBIDDEN')
  })

  it('a manager passes without forClear, and is refused with forClear: true', async () => {
    seed('manager')
    expect(answer(await check({ items: ['items-a'] })).anotherHousehold).toBe(false)
    expect(answer(await check({ items: ['items-a'] }, false)).anotherHousehold).toBe(false)
    expect(errorCode(await check({ items: ['items-a'] }, true))).toBe('FORBIDDEN')
  })

  it('the owner passes with forClear: true', async () => {
    seed('owner')
    expect(answer(await check({ items: ['items-a'] }, true)).anotherHousehold).toBe(false)
  })

  it('a member is refused even for an empty file, so the check is also the role gate', async () => {
    // Given the caller is a manager of hh-b, and only a member of hh-a, the
    // target
    seed('member')
    expect(errorCode(await check({}))).toBe('FORBIDDEN')
  })

  // Review finding 5: the role check runs BEFORE any read and before the
  // size check.
  it("a member's call reads no catalog row", async () => {
    seed('member')
    const findMany = vi.spyOn(prisma.item, 'findMany')
    expect(errorCode(await check({ items: ['items-a', 'items-b'] }))).toBe('FORBIDDEN')
    expect(findMany).not.toHaveBeenCalled()
  })

  it('a member who sends 1001 ids is refused for the role, not for the size', async () => {
    seed('member')
    const ids = Array.from({ length: 1001 }, (_, i) => `i-${i}`)
    expect(errorCode(await check({ items: ids }))).toBe('FORBIDDEN')
  })
})

describe('importCheck: the size limit (decision T3)', () => {
  const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${i}`)

  it('1001 ids in one call, across lists, are refused as bad input', async () => {
    expect(
      errorCode(
        await check({ items: ids('i', 600), tags: ids('t', 200), locationRefs: ids('l', 100), itemRefs: ids('r', 101) }),
      ),
    ).toBe('BAD_USER_INPUT')
  })

  it('1000 ids in one call pass', async () => {
    expect(answer(await check({ items: ids('i', 600), tags: ids('t', 400) }))).toEqual(expected())
  })
})
