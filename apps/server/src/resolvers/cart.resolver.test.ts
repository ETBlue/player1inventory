import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

// `cart` stays a plain `vi.fn()` call recorder: every assertion on it is "was
// this called with X". This file tests `vendorCart` and `allCarts` only. The
// other cart resolvers are tested on the stateful `cartFake`:
// `cart-shared.resolver.test.ts` (task B.4) and `cart-checkout.resolver.test.ts`
// (task B.5, `checkout`).
//
// `user`, `household`, `householdMember`, `locationMember`, `location` and
// `itemStock` are `householdWorld` (src/test/householdWorld.ts). Every role is
// a row `seedLocations` writes. Nothing is derived from a location's `userId`:
// households H3a task 3.8 removed `derivedRoles` from this file.
//
// `item` has `findMany` only, over a household-scoped `ownedRowFake` store.
vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const world = createHouseholdWorld()
  const items = createOwnedRowFake({
    model: 'Item',
    scope: 'householdId',
    rows: [
      { id: 'item_milk', householdId: 'hh_test', userId: 'user_test123' },
      { id: 'item_bread', householdId: 'hh_test', userId: 'user_member' },
      { id: 'item_theirs', householdId: 'hh_other', userId: 'user_other' },
    ],
  })
  const recorders = {
    cart: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    item: { findMany: items.client.findMany },
  }
  // On the world's own client, so the `tx` of first sign-in's transaction
  // (lib/household.ts) has every model too.
  world.extend(recorders)
  return {
    prisma: {
      ...world.client,
      // Handle onto the world, hung off the mocked client because a
      // `vi.mock` factory is hoisted above every import and cannot close over
      // a module-scope binding.
      $world: world,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { LocationRole } from '../lib/authz.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import { createCartFake } from '../test/cartFake.js'

const mockPrisma = prisma as unknown as {
  cart: {
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  $world: HouseholdWorld
}

const world = mockPrisma.$world
const stockFake = world.stock

// TWO locations for the caller, plus one belonging to somebody else — which
// is ALSO flagged isDefault:
//
//   - `vendorCart` takes the location it is GIVEN. Its `locationId` is `ID!`
//     since PR 3b Task 4 and the default-location fallback is gone, so the
//     "viewing a NON-default location" test names LOC_OTHER — the only fixture
//     that can tell "the location I asked for" apart from "the caller's
//     default". LOC_STRANGER belongs to somebody else and is ALSO flagged
//     isDefault, which is what makes the FORBIDDEN case real.
const LOC_DEFAULT = 'loc_kitchen'
const LOC_OTHER = 'loc_garage'
const LOC_STRANGER = 'loc_theirs'
// In the caller's OWN household, but the caller holds no role on it; only
// user_member does (households H3b task B.3). A read scoped by household
// instead of by location role would wrongly include it.
const LOC_NOROLE = 'loc_attic'

// ── The three-person fixture (plan H3a, rule 10) ──
//
// | Person        | Household | Household role | Location roles                                 |
// |---------------|-----------|----------------|------------------------------------------------|
// | user_test123  | hh_test   | owner          | LOC_DEFAULT: set by the test (organizer by     |
// |               |           |                | default); LOC_OTHER: organizer                 |
// | user_member   | hh_test   | member         | LOC_DEFAULT: a role DIFFERENT from the         |
// |               |           |                | caller's; LOC_OTHER: organizer                 |
// | user_other    | hh_other  | owner          | LOC_STRANGER: organizer                        |
//
// `user_B`, whom the cross-user tests sign in as, is in no household at all,
// so every location-scoped call of theirs is refused.
function seedLocations(options: { callerRole?: LocationRole } = {}) {
  const callerRole = options.callerRole ?? 'organizer'
  world.reset()
  stockFake.reset(
    [
      // Deliberately NOT first in the array: a mirror that took `locations[0]`
      // instead of the `isDefault` row would still pass with the default first.
      { id: LOC_OTHER, householdId: 'hh_test' },
      { id: LOC_DEFAULT, householdId: 'hh_test' },
      { id: LOC_STRANGER, householdId: 'hh_other' },
      { id: LOC_NOROLE, householdId: 'hh_test' },
    ],
    [],
  )
  world.seedHouseholds({
    households: [householdRow('hh_test', 'user_test123'), householdRow('hh_other', 'user_other')],
    householdMembers: [
      householdMemberRow('hh_test', 'user_test123', 'owner'),
      householdMemberRow('hh_test', 'user_member', 'member'),
      householdMemberRow('hh_other', 'user_other', 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_DEFAULT, 'user_test123', callerRole),
      locationMemberRow(
        LOC_DEFAULT,
        'user_member',
        callerRole === 'participant' ? 'organizer' : 'participant',
      ),
      locationMemberRow(LOC_OTHER, 'user_test123', 'organizer'),
      locationMemberRow(LOC_OTHER, 'user_member', 'organizer'),
      locationMemberRow(LOC_STRANGER, 'user_other', 'organizer'),
      locationMemberRow(LOC_NOROLE, 'user_member', 'organizer'),
    ],
  })
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const now = new Date('2024-01-01T00:00:00.000Z')

// No `userId`: households H3b task B.3 dropped `Cart.userId`. The location
// is read from the id, the same way `cartIdFor` builds it.
function makeCart(overrides: Partial<{
  id: string
  lastPurchasedAt: Date | null
}> = {}) {
  const id = overrides.id ?? `${LOC_DEFAULT}:no-vendor`
  return {
    id,
    locationId: id.slice(0, id.indexOf(':')),
    lastPurchasedAt: overrides.lastPurchasedAt ?? null,
  }
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let server: ApolloServer<Context>
const ctx: Context = { userId: 'user_test123' }

beforeEach(async () => {
  vi.clearAllMocks()
  seedLocations()
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function execOp(query: string, variables?: Record<string, unknown>, context = ctx) {
  const r = await server.executeOperation({ query, variables }, { contextValue: context })
  return r.body.kind === 'single' ? r.body.singleResult : null
}

// ─── vendorCart ──────────────────────────────────────────────────────────────

describe('vendorCart', () => {
  it('user can get existing vendor cart by vendor ID', async () => {
    // Given a cart with the composite id exists, carrying a Prisma `Date`
    const cart = makeCart({ id: `${LOC_DEFAULT}:vendor_1`, lastPurchasedAt: now })
    mockPrisma.cart.findUnique.mockResolvedValue(cart)

    // When querying vendorCart
    const result = await execOp(
      `query VendorCart($vendorId: ID, $locationId: ID!) {
        vendorCart(vendorId: $vendorId, locationId: $locationId) { id lastPurchasedAt }
      }`,
      { vendorId: 'vendor_1', locationId: LOC_DEFAULT },
    )

    // Then the cart is looked up by `${locationId}:${vendorId}`, not by the
    // bare vendor id. A resolver that looked up 'vendor_1' would find nothing,
    // fall into its create branch and make a DUPLICATE cart under the old
    // shape — silently, because Cart.id is a String either way.
    expect(result?.errors).toBeUndefined()
    expect(mockPrisma.cart.findUnique).toHaveBeenCalledWith({
      where: { id: `${LOC_DEFAULT}:vendor_1` },
    })
    const found = result?.data?.vendorCart as { id: string; lastPurchasedAt: string | null }
    expect(found.id).toBe(`${LOC_DEFAULT}:vendor_1`)
    expect(found.lastPurchasedAt).toBe(now.toISOString())
    expect(mockPrisma.cart.create).not.toHaveBeenCalled()
  })

  it('user gets a new vendor cart created if none exists for that vendor', async () => {
    // Given no cart exists for vendor_2
    mockPrisma.cart.findUnique.mockResolvedValue(null)
    const newCart = makeCart({ id: `${LOC_DEFAULT}:vendor_2` })
    mockPrisma.cart.create.mockResolvedValue(newCart)

    // When querying vendorCart
    const result = await execOp(
      `query VendorCart($vendorId: ID, $locationId: ID!) {
        vendorCart(vendorId: $vendorId, locationId: $locationId) { id }
      }`,
      { vendorId: 'vendor_2', locationId: LOC_DEFAULT },
    )

    // Then a new cart is created at the location the caller NAMED. Since
    // Task 4 there is no default-location fallback for it to be confused with;
    // the "viewing a NON-default location" case below is what proves the
    // resolver follows the argument rather than the caller's default.
    expect(result?.errors).toBeUndefined()
    expect(mockPrisma.cart.create).toHaveBeenCalledWith({
      data: { id: `${LOC_DEFAULT}:vendor_2`, locationId: LOC_DEFAULT },
    })
  })

  it('user gets a new no-vendor cart created if none exists', async () => {
    // Given no cart exists for the no-vendor id in this location
    mockPrisma.cart.findUnique.mockResolvedValue(null)
    const newCart = makeCart({ id: `${LOC_DEFAULT}:no-vendor` })
    mockPrisma.cart.create.mockResolvedValue(newCart)

    // When querying vendorCart with a null vendorId
    const result = await execOp(
      `query VendorCart($vendorId: ID, $locationId: ID!) {
        vendorCart(vendorId: $vendorId, locationId: $locationId) { id lastPurchasedAt }
      }`,
      { vendorId: null, locationId: LOC_DEFAULT },
    )

    // Then the new cart id is `${locationId}:no-vendor`.
    //
    // The location prefix is what fixes the cross-user leak design §5 names:
    // before PR 3b this id was the literal 'no-vendor', one row shared by the
    // whole database, so the first user to open it owned everybody's.
    expect(result?.errors).toBeUndefined()
    const found = result?.data?.vendorCart as { id: string; lastPurchasedAt: string | null }
    expect(found.id).toBe(`${LOC_DEFAULT}:no-vendor`)
    // And a never-purchased cart keeps a null lastPurchasedAt (not epoch 0)
    expect(found.lastPurchasedAt).toBeNull()
    expect(mockPrisma.cart.create).toHaveBeenCalledOnce()
    expect(mockPrisma.cart.create).toHaveBeenCalledWith({
      data: { id: `${LOC_DEFAULT}:no-vendor`, locationId: LOC_DEFAULT },
    })
  })

  it('null vendorId falls back to no-vendor cart', async () => {
    // Given a no-vendor cart exists in the default location
    const cart = makeCart({ id: `${LOC_DEFAULT}:no-vendor` })
    mockPrisma.cart.findUnique.mockResolvedValue(cart)

    // When querying vendorCart with null vendorId
    const result = await execOp(
      `query VendorCart($vendorId: ID, $locationId: ID!) {
        vendorCart(vendorId: $vendorId, locationId: $locationId) { id }
      }`,
      { vendorId: null, locationId: LOC_DEFAULT },
    )

    // Then the no-vendor cart is returned
    expect(result?.errors).toBeUndefined()
    const found = result?.data?.vendorCart as { id: string }
    expect(found.id).toBe(`${LOC_DEFAULT}:no-vendor`)
  })

  it('user viewing a NON-default location gets that location\'s cart', async () => {
    // Given the caller asks for their Garage, not their Kitchen
    mockPrisma.cart.findUnique.mockResolvedValue(null)
    mockPrisma.cart.create.mockResolvedValue(makeCart({ id: `${LOC_OTHER}:vendor_1` }))

    // When querying vendorCart with an explicit locationId
    const result = await execOp(
      `query VendorCart($vendorId: ID, $locationId: ID!) {
        vendorCart(vendorId: $vendorId, locationId: $locationId) { id }
      }`,
      { vendorId: 'vendor_1', locationId: LOC_OTHER },
    )

    // Then BOTH the lookup and the create name the Garage, not the default.
    // This is the assertion that a single-location fixture could not make.
    expect(result?.errors).toBeUndefined()
    expect(mockPrisma.cart.findUnique).toHaveBeenCalledWith({
      where: { id: `${LOC_OTHER}:vendor_1` },
    })
    expect(mockPrisma.cart.create).toHaveBeenCalledWith({
      data: { id: `${LOC_OTHER}:vendor_1`, locationId: LOC_OTHER },
    })
  })

  it('omitting locationId is refused — the default-location fallback is gone', async () => {
    // Given a client that sends no locationId. Until PR 3b Task 4 the server
    // fell back to the caller's default location, so a cart opened while
    // viewing the Garage quietly returned the Kitchen's. The field is `ID!`
    // now — see src/schema/cart.graphql.
    mockPrisma.cart.findUnique.mockResolvedValue(null)
    mockPrisma.cart.create.mockResolvedValue(makeCart({ id: `${LOC_DEFAULT}:vendor_1` }))

    // When querying vendorCart without one
    const result = await execOp(
      `query VendorCartNoLocation($vendorId: ID) { vendorCart(vendorId: $vendorId) { id } }`,
      { vendorId: 'vendor_1' },
    )

    // Then the request fails at validation and NO cart is read or written.
    // Loud, at the schema layer, rather than a quiet read of a location the
    // caller did not ask for.
    expect(result?.errors?.[0]?.extensions?.code).toBe('GRAPHQL_VALIDATION_FAILED')
    expect(mockPrisma.cart.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.cart.create).not.toHaveBeenCalled()
  })

  it("asking for another user's location is FORBIDDEN", async () => {
    // Given LOC_STRANGER belongs to user_other, and is flagged isDefault there
    // When the caller names it
    const result = await execOp(
      `query VendorCart($vendorId: ID, $locationId: ID!) {
        vendorCart(vendorId: $vendorId, locationId: $locationId) { id }
      }`,
      { vendorId: 'vendor_1', locationId: LOC_STRANGER },
    )

    // Then the request is refused before any cart query runs
    expect(result?.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.cart.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.cart.create).not.toHaveBeenCalled()
  })
})

// ─── allCarts ────────────────────────────────────────────────────────────────

describe('allCarts', () => {
  // A stateful `cart.findMany` (src/test/cartFake.ts) over carts at four
  // locations, so the answer depends on the `where` the resolver sends. The
  // fake refuses a `userId` key on `Cart`, the way Prisma does since
  // households H3b task B.3 dropped the column.
  function seedCarts() {
    const fake = createCartFake({
      carts: [
        makeCart({ id: `${LOC_DEFAULT}:no-vendor`, lastPurchasedAt: now }),
        makeCart({ id: `${LOC_OTHER}:vendor_1` }),
        makeCart({ id: `${LOC_NOROLE}:no-vendor` }),
        makeCart({ id: `${LOC_STRANGER}:no-vendor` }),
      ],
    })
    mockPrisma.cart.findMany.mockImplementation(fake.client.cart.findMany)
  }

  it('user can get the carts of every location they have a role on', async () => {
    // Given carts at the caller's two locations, at LOC_NOROLE (the caller's
    // household, but only user_member has a role there) and at another
    // household's location
    seedCarts()

    // When querying allCarts
    const result = await execOp(`query { allCarts { id lastPurchasedAt } }`)

    // Then only the carts of the caller's two locations come back, each
    // lastPurchasedAt ISO 8601 (or null). `allCarts` feeds
    // useLastPurchasedByVendor() → the shopping page's "last purchased" sort,
    // so the wire format matters here specifically.
    expect(result?.errors).toBeUndefined()
    const found = result?.data?.allCarts as { id: string; lastPurchasedAt: string | null }[]
    expect(found.map((c) => c.id)).toEqual([
      `${LOC_OTHER}:vendor_1`,
      `${LOC_DEFAULT}:no-vendor`,
    ])
    expect(found[1].lastPurchasedAt).toBe(now.toISOString())
    expect(found[0].lastPurchasedAt).toBeNull()
  })

  it('user sees a cart nobody "owns" when they share its location', async () => {
    // Given the same carts, read by user_member, who has a role on LOC_NOROLE
    // as well as the two locations the caller has
    seedCarts()

    // When user_member queries allCarts
    const result = await execOp(`query { allCarts { id } }`, undefined, { userId: 'user_member' })

    // Then they get the three carts at their three locations, including the
    // two the caller sees too. Nothing is filtered by who made a cart
    expect(result?.errors).toBeUndefined()
    const found = result?.data?.allCarts as { id: string }[]
    expect(found.map((c) => c.id)).toEqual([
      `${LOC_NOROLE}:no-vendor`,
      `${LOC_OTHER}:vendor_1`,
      `${LOC_DEFAULT}:no-vendor`,
    ])
  })

  it('a location viewer still sees the carts there (it is a read)', async () => {
    // Given the caller is only a viewer at LOC_DEFAULT
    seedLocations({ callerRole: 'viewer' })
    seedCarts()

    const result = await execOp(`query { allCarts { id } }`)

    // Then the LOC_DEFAULT cart is still listed
    expect(result?.errors).toBeUndefined()
    const found = result?.data?.allCarts as { id: string }[]
    expect(found.map((c) => c.id)).toContain(`${LOC_DEFAULT}:no-vendor`)
  })
})

// ─── Moved (households H3b tasks B.4 and B.5) ─────────────────────────────────
//
// The tests of `cartItems`, `cartItemCountByItem`, `allCartItems`,
// `addToCart`, `updateCartItem`, `removeFromCart` and `abandonCart` live in
// `cart-shared.resolver.test.ts` (task B.4), and the tests of `checkout` in
// `cart-checkout.resolver.test.ts` (task B.5). Both run on the stateful
// `cartFake`, with two members in one cart.

// ─── Households H3a task 3.8: location roles and the household's items ───────
//
// Every cart write needs location role `participant`; a read needs `viewer`.
// Only `vendorCart` is tested here; the other writes and the reads are in
// `cart-shared.resolver.test.ts` (task B.4) and
// `cart-checkout.resolver.test.ts` (task B.5).
// Until task 3.8 every caller in this file was an `organizer` (the old
// `derivedRoles` adapter), so a call site that asked for `organizer` by
// mistake, or for `viewer`, passed every test here.

const CART_ID = `${LOC_DEFAULT}:no-vendor`

// Each write, with the mocks it needs to succeed. `wrote` names the recorder
// that holds its write, so a refusal can be shown to write nothing.
const WRITES: Array<{
  name: string
  query: string
  variables: Record<string, unknown>
  arrange: () => void
  wrote: () => ReturnType<typeof vi.fn>
}> = [
  {
    name: 'vendorCart (creates the cart when it is missing)',
    query: `query Q($l: ID!) { vendorCart(vendorId: null, locationId: $l) { id } }`,
    variables: { l: LOC_DEFAULT },
    arrange: () => {
      mockPrisma.cart.findUnique.mockResolvedValue(null)
      mockPrisma.cart.create.mockResolvedValue(makeCart({ id: CART_ID }))
    },
    wrote: () => mockPrisma.cart.create,
  },
]

describe('cart writes need location role participant', () => {
  for (const op of WRITES) {
    it(`a location viewer cannot use ${op.name}, and nothing is written`, async () => {
      // Given the caller is only a viewer at LOC_DEFAULT, and user_member is a
      // participant there
      seedLocations({ callerRole: 'viewer' })
      op.arrange()

      const result = await execOp(op.query, op.variables)

      expect(result?.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
      expect(op.wrote()).not.toHaveBeenCalled()
    })

    it(`a location participant can use ${op.name}`, async () => {
      seedLocations({ callerRole: 'participant' })
      op.arrange()

      const result = await execOp(op.query, op.variables)

      expect(result?.errors).toBeUndefined()
      expect(op.wrote()).toHaveBeenCalled()
    })
  }
})
