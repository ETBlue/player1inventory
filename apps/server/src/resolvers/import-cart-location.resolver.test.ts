import { ApolloServer } from '@apollo/server'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── Why this file is separate from import.resolver.test.ts ──────────────────
//
// `import.resolver.test.ts` mocks every Prisma model as a plain `vi.fn()` call
// recorder, and at `:195` it does
//
//   p.location.findFirst.mockResolvedValue(DEFAULT_LOCATION)
//
// which answers "yes, that location is yours" for ANY id, a stranger's
// included. An ownership check written against that file's stubs therefore
// cannot fail. `p.cart.create` is a recorder too, so it cannot show which
// `locationId` column was written either. Root CLAUDE.md, "Write test doubles
// to model the constraint, not the happy path".
//
// `vi.mock` is per FILE, so the stateful fakes cannot be mixed into that file
// without rewriting its seven existing tests. This file carries its own mock
// built from two stateful fakes:
//
//   - `src/test/householdWorld.ts` for `location` (its `stockFake`) and the
//     household and role rows. Every role is a row `beforeEach` seeds: each
//     person owns one household and organizes its own locations
//     (`soloHouseholds`). So `requireLocationRole` and
//     `requireLocationInHousehold` run against real rows, and a stranger's location
//     is refused because the caller has no role on it. (Households H3a task
//     3.9 removed `derivedRoles`, which invented those rows from each
//     location's `userId`.)
//   - `src/test/shoppingFake.ts` for `cart`, so a written row can be read back
//     and its `locationId` column inspected. Its `upsert` keeps `create` and
//     `update` apart and applies `update` key by key, which is what makes a
//     wrongly MOVED cart visible.
vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createShoppingFake } = await import('../test/shoppingFake.js')
  const world = createHouseholdWorld()
  const stock = world.stock
  const shopping = createShoppingFake()
  return {
    prisma: {
      ...world.client,
      location: {
        ...world.client.location,
        // Wrapped so a test can count HOW MANY ownership checks ran, on top of
        // the fake's real row matching.
        findFirst: vi.fn(stock.client.location.findFirst),
      },
      cart: {
        findUnique: vi.fn(shopping.client.cart.findUnique),
        // Added by the ownership guard (issue #327, task 6). The guard reads
        // `cart.findUnique` first and `cart.findFirst` second, so a test that
        // re-imports a cart id a row ALREADY holds reaches `findFirst` — and
        // without this key it died with
        // "delegateFor(...).findFirst is not a function". `shoppingFake`
        // already had the method; only this mock did not expose it. Its
        // `matchesCart` applies `where` key by key, so the guard's
        // `{ id, locationId: { in } }` (households H3b task B.3; it was
        // `{ id, userId }` before) really is scoped here.
        findFirst: vi.fn(shopping.client.cart.findFirst),
        findMany: vi.fn(shopping.client.cart.findMany),
        create: vi.fn(shopping.client.cart.create),
        upsert: vi.fn(shopping.client.cart.upsert),
      },
      // Handles onto the fakes, hung off the mocked client because a `vi.mock`
      // factory is hoisted above every import and cannot close over a
      // module-scope binding.
      // Wrapped so a test can count HOW MANY location role checks ran.
      // Since households H3a task 3.5, `requireLocationRole` reads
      // `locationMember`, not `location`.
      locationMember: {
        ...world.client.locationMember,
        findFirst: vi.fn(world.client.locationMember.findFirst),
      },
      $world: world,
      $stockFake: stock,
      $shoppingFake: shopping,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import { soloHouseholds } from '../test/householdRows.js'
import type { ShoppingFake } from '../test/shoppingFake.js'
import type { StockFake } from '../test/stockFake.js'

const mockPrisma = prisma as unknown as {
  $world: HouseholdWorld
  $stockFake: StockFake
  $shoppingFake: ShoppingFake
}

// ─── Server ──────────────────────────────────────────────────────────────────

let server: ApolloServer<Context>

beforeAll(async () => {
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

// ─── Fixture ─────────────────────────────────────────────────────────────────
//
// THREE locations, and the one the tests target is NOT the default. With a
// single-location fixture "the location the cart id names" and "the caller's
// default" are the same answer, so a resolver that ignored the id entirely
// would still pass — the vacuous-fixture trap root CLAUDE.md describes.

const USER = 'user_import_cart_test'
const STRANGER = 'user_stranger'

const LOC_DEFAULT = 'loc_kitchen' // USER's default
const LOC_OTHER = 'loc_garage' // USER's, NOT default — the target
const LOC_STRANGER = 'loc_theirs' // STRANGER's — must be refused
// No `Location` row holds this id, in any account. Until households H4 task
// E.1 such a cart fell back to the caller's first location (task 8). Since E.1
// the cart-id guard refuses it.
const LOC_GONE = 'loc_deleted_by_clearAllData'

const VENDOR = 'vendor_costco'

const TS = new Date('2026-01-01T00:00:00.000Z')

// Each person owns one household and organizes their own locations.
const HH_USER = 'hh_user'
const HH_STRANGER = 'hh_stranger'

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$stockFake.reset([
    { id: LOC_OTHER, householdId: HH_USER, name: 'Garage', order: 1, createdAt: TS, updatedAt: TS },
    { id: LOC_DEFAULT, householdId: HH_USER, name: 'Kitchen', order: 0, createdAt: TS, updatedAt: TS },
    { id: LOC_STRANGER, householdId: HH_STRANGER, name: 'Theirs', order: 0, createdAt: TS, updatedAt: TS },
  ])
  mockPrisma.$world.seedHouseholds(
    soloHouseholds([
      { userId: USER, householdId: HH_USER, locationIds: [LOC_OTHER, LOC_DEFAULT] },
      { userId: STRANGER, householdId: HH_STRANGER, locationIds: [LOC_STRANGER] },
    ]),
  )
  mockPrisma.$shoppingFake.reset([], [])
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONTEXT: Context = { userId: USER }

const BULK_CREATE_CARTS = `
  mutation BulkCreateShoppingCarts($carts: [ShoppingCartInput!]!) {
    bulkCreateShoppingCarts(carts: $carts) { id lastPurchasedAt }
  }
`

const BULK_UPSERT_CARTS = `
  mutation BulkUpsertShoppingCarts($carts: [ShoppingCartInput!]!) {
    bulkUpsertShoppingCarts(carts: $carts) { id lastPurchasedAt }
  }
`

async function exec(
  query: string,
  carts: Record<string, unknown>[],
  ctx: Context = CONTEXT,
) {
  const response = await server.executeOperation(
    { query, variables: { carts } },
    { contextValue: ctx },
  )
  if (response.body.kind !== 'single') throw new Error('expected a single result')
  return response.body.singleResult
}

/**
 * The `locationId` column actually stored for a cart, read back from the fake.
 *
 * It has to be read from the fake rather than from the mutation's own result:
 * the `Cart` GraphQL type exposes only `id` and `lastPurchasedAt`
 * (schema/cart.graphql:9-12), so the column is not selectable.
 */
function storedLocationOf(id: string): string | undefined {
  return mockPrisma.$shoppingFake.state.carts.find((c) => c.id === id)?.locationId
}

const locationFindFirst = (
  prisma as unknown as { locationMember: { findFirst: ReturnType<typeof vi.fn> } }
).locationMember.findFirst

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('bulkCreateShoppingCarts — the location comes from the cart id', () => {
  it('user importing a cart gets it stored in the location its own id names', async () => {
    // Given a cart id whose prefix is the caller's NON-default location
    const id = `${LOC_OTHER}:${VENDOR}`

    // When the import runs
    const result = await exec(BULK_CREATE_CARTS, [{ id }])

    // Then the stored row carries LOC_OTHER, not the caller's default
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf(id)).toBe(LOC_OTHER)
    expect(storedLocationOf(id)).not.toBe(LOC_DEFAULT)
  })

  it('user importing a no-vendor cart gets it stored in the location its id names', async () => {
    // Given the no-vendor cart id shape, `${locationId}:no-vendor`
    const id = `${LOC_OTHER}:no-vendor`

    // When the import runs
    const result = await exec(BULK_CREATE_CARTS, [{ id }])

    // Then the location still comes from the prefix
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf(id)).toBe(LOC_OTHER)
  })

  it('user importing a cart whose vendor id contains a colon still gets the right location', async () => {
    // Given a vendor id that itself contains ':'. Neither id generator makes
    // one — `crypto.randomUUID()` locally, `@default(cuid())` in cloud — but
    // `bulkCreateVendors` stores `VendorInput.id` verbatim, so a hand-edited
    // backup can. Only a split on the FIRST colon reads this correctly.
    const id = `${LOC_OTHER}:weird:vendor:id`

    // When the import runs
    const result = await exec(BULK_CREATE_CARTS, [{ id }])

    // Then the location is the prefix, and the rest of the id is left alone
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf(id)).toBe(LOC_OTHER)
  })

  it('user importing a pre-3b backup with bare cart ids is refused and nothing is written', async () => {
    // Given a cart id with no colon at all (the pre-PR-3b shape, keyed by
    // vendor id alone), behind an allowed cart. Until households H4 task E.1
    // the bare id fell back to the caller's first location. Since then
    // `requireOwnRowOrUnclaimed` refuses an id with no location part
    // (decision T6). The web upgrades a legacy file before it sends it
    // (`upgradeLegacyPayload`), so only a hand-edited file gets here.
    const good = `${LOC_OTHER}:${VENDOR}`

    // When the import runs
    const result = await exec(BULK_CREATE_CARTS, [{ id: good }, { id: VENDOR }])

    // Then it is refused as bad input, and the allowed cart is not written
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT')
    expect(mockPrisma.$shoppingFake.state.carts).toHaveLength(0)
  })

  it('user importing a cart that names someone else is refused and nothing is written', async () => {
    // Given a cart id whose prefix is STRANGER's location
    const id = `${LOC_STRANGER}:${VENDOR}`

    // When the import runs
    const result = await exec(BULK_CREATE_CARTS, [{ id }])

    // Then the caller sees FORBIDDEN
    expect(result.errors?.[0]?.message).toBe('Forbidden')
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    // And no row was written — not into the stranger's location, and not
    // quietly into the caller's default either
    expect(mockPrisma.$shoppingFake.state.carts).toHaveLength(0)
  })

  it('user importing a cart whose location no longer exists is refused and nothing is written', async () => {
    // Given a cart id naming a location NO row holds, behind an allowed cart.
    // Until households H4 task E.1 this fell back to the caller's first
    // location (a cloud -> cloud restore once needed it, when a cloud export
    // carried no locations). Locations are now imported before carts, so a
    // missing location means a hand-edited file. The cart-id guard refuses a
    // prefix that is not a location the caller may write to (decision T6).
    const good = `${LOC_OTHER}:${VENDOR}`
    const gone = `${LOC_GONE}:${VENDOR}`

    // When the import runs
    const result = await exec(BULK_CREATE_CARTS, [{ id: good }, { id: gone }])

    // Then it is refused, and nothing is written
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.$shoppingFake.state.carts).toHaveLength(0)
  })

  it('user importing a cart id with an empty location part is refused', async () => {
    // Given `":vendor"`, reachable from a hand-edited backup. No location
    // the caller may write to has the id `''`.
    const result = await exec(BULK_CREATE_CARTS, [{ id: `:${VENDOR}` }])

    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.$shoppingFake.state.carts).toHaveLength(0)
  })

  it('refuses a stranger\'s live location even when other ids in the payload are unclaimed', async () => {
    // Given an unclaimed id — which now succeeds — ahead of a stranger's LIVE
    // location. The fallback must not swallow the refusal: "no row holds it"
    // and "a row holds it and it is not yours" are different answers.
    const gone = `${LOC_GONE}:${VENDOR}`
    const bad = `${LOC_STRANGER}:${VENDOR}`

    // When the import runs
    const result = await exec(BULK_CREATE_CARTS, [{ id: gone }, { id: bad }])

    // Then the whole mutation is refused and nothing is written
    expect(result.errors?.[0]?.message).toBe('Forbidden')
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.$shoppingFake.state.carts).toHaveLength(0)
  })

  it('user importing a mix of good and forbidden carts gets nothing written at all', async () => {
    // Given one allowed cart ahead of a forbidden one. The resolver is not
    // transactional, so the check must run BEFORE the write loop or the first
    // row would already be on disk when the second one throws.
    const good = `${LOC_OTHER}:${VENDOR}`
    const bad = `${LOC_STRANGER}:${VENDOR}`

    // When the import runs
    const result = await exec(BULK_CREATE_CARTS, [{ id: good }, { id: bad }])

    // Then it is refused and the allowed row was never written
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.$shoppingFake.state.carts).toHaveLength(0)
  })

  it('checks each distinct location once, not once per cart', async () => {
    // Given five carts across two locations
    const carts = [
      { id: `${LOC_OTHER}:v1` },
      { id: `${LOC_OTHER}:v2` },
      { id: `${LOC_DEFAULT}:v1` },
      { id: `${LOC_OTHER}:no-vendor` },
      { id: `${LOC_DEFAULT}:v2` },
    ]

    // When the import runs
    const result = await exec(BULK_CREATE_CARTS, carts)

    // Then every cart landed where its id said
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf(`${LOC_OTHER}:v1`)).toBe(LOC_OTHER)
    expect(storedLocationOf(`${LOC_DEFAULT}:v2`)).toBe(LOC_DEFAULT)
    // And the ownership check ran twice — once per DISTINCT location, not five
    // times.
    expect(locationFindFirst).toHaveBeenCalledTimes(2)
  })
})

describe('bulkUpsertShoppingCarts — the location comes from the cart id', () => {
  it('user re-importing a cart gets it stored in the location its own id names', async () => {
    // Given a cart id naming the caller's NON-default location, for an id that
    // does not exist yet
    const id = `${LOC_OTHER}:${VENDOR}`

    // When the upsert import runs
    const result = await exec(BULK_UPSERT_CARTS, [{ id }])

    // Then the created row carries LOC_OTHER
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf(id)).toBe(LOC_OTHER)
    expect(storedLocationOf(id)).not.toBe(LOC_DEFAULT)
  })

  it('user re-importing bare or deleted-location cart ids is refused and nothing is written', async () => {
    // Given the two shapes the old fallback accepted (see the create tests
    // above), each behind an allowed cart, through the upsert path
    const good = `${LOC_OTHER}:${VENDOR}`

    // When the upsert import runs with each
    const bare = await exec(BULK_UPSERT_CARTS, [{ id: good }, { id: VENDOR }])
    const gone = await exec(BULK_UPSERT_CARTS, [{ id: good }, { id: `${LOC_GONE}:${VENDOR}` }])

    // Then both are refused and nothing is written
    expect(bare.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT')
    expect(gone.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.$shoppingFake.state.carts).toHaveLength(0)
  })

  it('refuses a stranger\'s live location on re-import even when other ids are unclaimed', async () => {
    // Given an unclaimed id ahead of a stranger's LIVE location
    const gone = `${LOC_GONE}:${VENDOR}`
    const bad = `${LOC_STRANGER}:${VENDOR}`

    // When the upsert import runs
    const result = await exec(BULK_UPSERT_CARTS, [{ id: gone }, { id: bad }])

    // Then the whole mutation is refused and nothing is written
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.$shoppingFake.state.carts).toHaveLength(0)
  })

  it('user re-importing a cart that names someone else is refused and nothing is written', async () => {
    // Given a cart id whose prefix is STRANGER's location
    const id = `${LOC_STRANGER}:${VENDOR}`

    // When the upsert import runs
    const result = await exec(BULK_UPSERT_CARTS, [{ id }])

    // Then the caller sees FORBIDDEN and no row exists
    expect(result.errors?.[0]?.message).toBe('Forbidden')
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.$shoppingFake.state.carts).toHaveLength(0)
  })

  it('user re-importing a mix of good and forbidden carts gets nothing written at all', async () => {
    // Given one allowed cart ahead of a forbidden one
    const good = `${LOC_OTHER}:${VENDOR}`
    const bad = `${LOC_STRANGER}:${VENDOR}`

    // When the upsert import runs
    const result = await exec(BULK_UPSERT_CARTS, [{ id: good }, { id: bad }])

    // Then it is refused and the allowed row was never written
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.$shoppingFake.state.carts).toHaveLength(0)
  })

  it('refuses to re-import a stored cart whose location is not the one its id names', async () => {
    // Given a cart stored at LOC_DEFAULT under an id that names LOC_OTHER.
    // The old import fallback could leave such a row (it kept the id and
    // changed the location). The caller organizes both locations, so only
    // the prefix rule can refuse it (households H4 task E.1, decision T6).
    //
    // Until E.1 this test re-imported such a row and checked that the upsert
    // did not MOVE it. The guard now refuses the row first, so that path is
    // reached only when the guard misses.
    // `import-ownership-cart.resolver.test.ts` keeps that case ("does not move
    // a stranger's cart even when the guard misses it").
    const id = `${LOC_OTHER}:${VENDOR}`
    const stored = new Date('2026-02-01T00:00:00.000Z')
    mockPrisma.$shoppingFake.reset([], [{ id, locationId: LOC_DEFAULT, lastPurchasedAt: stored }])

    // When the same id is re-imported with a new date
    const result = await exec(BULK_UPSERT_CARTS, [
      { id, lastPurchasedAt: '2026-03-01T00:00:00.000Z' },
    ])

    // Then it is refused, and the row is unchanged: not moved, same date
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(storedLocationOf(id)).toBe(LOC_DEFAULT)
    expect(
      mockPrisma.$shoppingFake.state.carts.find((c) => c.id === id)?.lastPurchasedAt,
    ).toEqual(stored)
  })
})
