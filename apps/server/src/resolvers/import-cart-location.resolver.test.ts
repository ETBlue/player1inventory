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
//   - `src/test/stockFake.ts` for `location`, so `ensureDefaultLocation` and
//     `requireLocationRole` run against real rows. Its `location.findFirst`
//     applies `where` key by key (`where.x === undefined || row.x === where.x`),
//     so dropping `userId` from the ownership query returns MORE rows and the
//     fixture sees it.
//   - `src/test/shoppingFake.ts` for `cart`, so a written row can be read back
//     and its `locationId` column inspected. Its `upsert` keeps `create` and
//     `update` apart and applies `update` key by key, which is what makes a
//     wrongly MOVED cart visible.
vi.mock('../lib/prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const { createShoppingFake } = await import('../test/shoppingFake.js')
  const stock = createStockFake()
  const shopping = createShoppingFake()
  return {
    prisma: {
      ...stock.client,
      location: {
        ...stock.client.location,
        // Wrapped so a test can count HOW MANY ownership checks ran, on top of
        // the fake's real row matching.
        findFirst: vi.fn(stock.client.location.findFirst),
      },
      cart: {
        findUnique: vi.fn(shopping.client.cart.findUnique),
        findMany: vi.fn(shopping.client.cart.findMany),
        create: vi.fn(shopping.client.cart.create),
        upsert: vi.fn(shopping.client.cart.upsert),
      },
      // Handles onto the fakes, hung off the mocked client because a `vi.mock`
      // factory is hoisted above every import and cannot close over a
      // module-scope binding.
      $stockFake: stock,
      $shoppingFake: shopping,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { ShoppingFake } from '../test/shoppingFake.js'
import type { StockFake } from '../test/stockFake.js'

const mockPrisma = prisma as unknown as {
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
// No `Location` row holds this id, in any account. It is what a cloud → cloud
// restore leaves behind: the cart ids name the SOURCE account's locations, and
// `clearAllData` has already deleted those rows. Must fall back to the
// caller's default, NOT be refused — task 8.
const LOC_GONE = 'loc_deleted_by_clearAllData'

const VENDOR = 'vendor_costco'

const TS = new Date('2026-01-01T00:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$stockFake.reset([
    { id: LOC_OTHER, userId: USER, isDefault: false, name: 'Garage', order: 1, createdAt: TS, updatedAt: TS },
    { id: LOC_DEFAULT, userId: USER, isDefault: true, name: 'Kitchen', order: 0, createdAt: TS, updatedAt: TS },
    { id: LOC_STRANGER, userId: STRANGER, isDefault: true, name: 'Theirs', order: 0, createdAt: TS, updatedAt: TS },
  ])
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
  prisma as unknown as { location: { findFirst: ReturnType<typeof vi.fn> } }
).location.findFirst

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

  it('user importing a pre-3b backup gets its bare cart ids stored in their default location', async () => {
    // Given a cart id with no colon at all — the pre-PR-3b shape, keyed by
    // vendor id alone
    const id = VENDOR

    // When the import runs
    const result = await exec(BULK_CREATE_CARTS, [{ id }])

    // Then it falls back to the caller's default location
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf(id)).toBe(LOC_DEFAULT)
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

  it('user importing a cloud backup gets carts whose locations were deleted stored in their default location', async () => {
    // Given a cart id naming a location NO row holds. This is the cloud →
    // cloud restore case the E2E gate caught: a cloud export carries no
    // `itemStocks`, so the cart ids keep their composite form naming the
    // source account's locations, and the import's own `clearAllData` has
    // already deleted those rows. Refusing here killed the whole restore with
    // "Import failed during Forbidden."
    const id = `${LOC_GONE}:${VENDOR}`

    // When the import runs
    const result = await exec(BULK_CREATE_CARTS, [{ id }])

    // Then it falls back to the caller's default and nothing throws
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf(id)).toBe(LOC_DEFAULT)
  })

  it('user importing a cart id with an empty location part gets it stored in their default location', async () => {
    // Given `":vendor"`, reachable from a hand-edited backup. No `Location`
    // row holds the id `''`, so it is unclaimed like any other unheld id and
    // takes the same fallback. Task 4 refused this shape; task 8 unified it,
    // because a backup CAN create a location whose id is `''` —
    // `LocationInput.id` is stored verbatim — and then the role check decides.
    const id = `:${VENDOR}`

    // When the import runs
    const result = await exec(BULK_CREATE_CARTS, [{ id }])

    // Then it falls back to the caller's default
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf(id)).toBe(LOC_DEFAULT)
  })

  it('user importing a mix of live, deleted and bare cart ids gets each one placed correctly', async () => {
    // Given all three shapes in one payload. The fixture has MORE THAN ONE
    // location and the live one is NOT the default, so "the location in the
    // id" and "the caller's default" are different answers — a resolver that
    // ignored the id would fail the first assertion.
    const live = `${LOC_OTHER}:${VENDOR}`
    const gone = `${LOC_GONE}:${VENDOR}`
    const bare = VENDOR

    // When the import runs
    const result = await exec(BULK_CREATE_CARTS, [{ id: live }, { id: gone }, { id: bare }])

    // Then only the live id keeps its own location
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf(live)).toBe(LOC_OTHER)
    expect(storedLocationOf(gone)).toBe(LOC_DEFAULT)
    expect(storedLocationOf(bare)).toBe(LOC_DEFAULT)
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
    // times. `ensureDefaultLocation` is not called at all, because no id was
    // bare.
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

  it('user re-importing a pre-3b backup gets its bare cart ids stored in their default location', async () => {
    // Given a bare, pre-PR-3b cart id
    const id = VENDOR

    // When the upsert import runs
    const result = await exec(BULK_UPSERT_CARTS, [{ id }])

    // Then it falls back to the caller's default location
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf(id)).toBe(LOC_DEFAULT)
  })

  it('user re-importing a cloud backup gets carts whose locations were deleted stored in their default location', async () => {
    // Given the same deleted-location id, through the upsert path. A cloud →
    // cloud restore uses "replace conflicts", so this is the mutation the
    // failing E2E test actually ran.
    const id = `${LOC_GONE}:${VENDOR}`

    // When the upsert import runs
    const result = await exec(BULK_UPSERT_CARTS, [{ id }])

    // Then it falls back to the caller's default and nothing throws
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf(id)).toBe(LOC_DEFAULT)
  })

  it('user re-importing a mix of live and deleted cart ids gets each one placed correctly', async () => {
    // Given one live non-default location and one deleted one
    const live = `${LOC_OTHER}:${VENDOR}`
    const gone = `${LOC_GONE}:${VENDOR}`

    // When the upsert import runs
    const result = await exec(BULK_UPSERT_CARTS, [{ id: live }, { id: gone }])

    // Then the live id keeps its own location and only the deleted one falls back
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf(live)).toBe(LOC_OTHER)
    expect(storedLocationOf(gone)).toBe(LOC_DEFAULT)
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

  it('does not move an existing cart when a re-import names a different location', async () => {
    // Given a cart already stored at LOC_DEFAULT. A cart id carries its own
    // location, so the only way to re-import the SAME primary key under a
    // different location is for the stored row's column to disagree with its
    // id — which is exactly the state a pre-3b bare id leaves behind, and the
    // state a `locationId` in the upsert's `update` payload would rewrite.
    const id = VENDOR
    await exec(BULK_UPSERT_CARTS, [{ id, lastPurchasedAt: '2026-02-01T00:00:00.000Z' }])
    expect(storedLocationOf(id)).toBe(LOC_DEFAULT)

    // When the same id is re-imported while the caller's default has moved to
    // LOC_OTHER — the account's default changed between the two imports
    mockPrisma.$stockFake.reset([
      { id: LOC_OTHER, userId: USER, isDefault: true, name: 'Garage', order: 1, createdAt: TS, updatedAt: TS },
      { id: LOC_DEFAULT, userId: USER, isDefault: false, name: 'Kitchen', order: 0, createdAt: TS, updatedAt: TS },
      { id: LOC_STRANGER, userId: STRANGER, isDefault: true, name: 'Theirs', order: 0, createdAt: TS, updatedAt: TS },
    ])
    const result = await exec(BULK_UPSERT_CARTS, [
      { id, lastPurchasedAt: '2026-03-01T00:00:00.000Z' },
    ])

    // Then the row's other columns update but its location does NOT move.
    // `locationId` belongs in the upsert's `create` only — carrying it into
    // `update` would relocate every cart on each re-import.
    expect(result.errors).toBeUndefined()
    expect(storedLocationOf(id)).toBe(LOC_DEFAULT)
    expect(
      mockPrisma.$shoppingFake.state.carts.find((c) => c.id === id)?.lastPurchasedAt,
    ).toEqual(new Date('2026-03-01T00:00:00.000Z'))
  })
})
