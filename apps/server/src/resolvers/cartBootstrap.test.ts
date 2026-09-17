import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
//
// PR 3b Task 2: cloud copies local mode's two halves of cart creation.
// `createVendor` writes ONE cart, at the location the caller is looking at
// (apps/web/src/db/operations.ts `createVendor`). Every other location gets
// that vendor's cart from `bootstrapCarts` when it becomes active
// (operations.ts `bootstrapCarts`). Neither half is a read path.
//
// BOTH tables are stateful fakes here, unlike `cart.resolver.test.ts` which
// uses call recorders. The question this file asks spans two mutations — "after
// I create a vendor in the Kitchen and switch to the Garage, does the vendor
// have a cart in the Garage" — and only an end state can answer it. A recorder
// would stay green if the two halves built ids that did not match each other.
vi.mock('../lib/prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const { createShoppingFake } = await import('../test/shoppingFake.js')
  const stockFake = createStockFake()
  const shoppingFake = createShoppingFake()
  return {
    prisma: {
      ...stockFake.client,
      ...shoppingFake.client,
      // Handles onto the fakes' state, hung off the mocked client because a
      // `vi.mock` factory is hoisted above every import and cannot close over
      // a module-scope binding.
      $stockFake: stockFake,
      $shoppingFake: shoppingFake,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { StockFake } from '../test/stockFake.js'
import type { ShoppingFake } from '../test/shoppingFake.js'

const mockPrisma = prisma as unknown as {
  $stockFake: StockFake
  $shoppingFake: ShoppingFake
}

const stockFake = mockPrisma.$stockFake
const shoppingFake = mockPrisma.$shoppingFake

// THREE locations. The caller's default (Kitchen), the caller's non-default one
// (Garage), and a stranger's — which is ALSO flagged isDefault.
//
// Every test below puts the thing under test at the GARAGE, the non-default
// one. With a single location "the location the caller asked for" and "the
// caller's default location" are the same value, so the test would pass against
// a resolver that ignored the argument entirely (root CLAUDE.md → the fixture
// is what fails, not the assertion). The stranger's row makes "the caller's
// location" distinguishable from "the first default location in the table".
const LOC_DEFAULT = 'loc_kitchen'
const LOC_OTHER = 'loc_garage'
const LOC_STRANGER = 'loc_theirs'

const ctx: Context = { userId: 'user_test123' }
let server: ApolloServer<Context>

beforeEach(async () => {
  vi.clearAllMocks()
  stockFake.reset(
    [
      // The default is deliberately NOT first: a resolver that took
      // `locations[0]` would otherwise pass by coincidence.
      { id: LOC_OTHER, userId: 'user_test123', isDefault: false },
      { id: LOC_DEFAULT, userId: 'user_test123', isDefault: true },
      { id: LOC_STRANGER, userId: 'user_other', isDefault: true },
    ],
    [],
  )
  shoppingFake.reset([], [])
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function execOp(
  query: string,
  variables?: Record<string, unknown>,
  context = ctx,
) {
  const r = await server.executeOperation({ query, variables }, { contextValue: context })
  return r.body.kind === 'single' ? r.body.singleResult : null
}

const CREATE_VENDOR = `mutation CreateVendor($name: String!, $locationId: ID!) {
  createVendor(name: $name, locationId: $locationId) { id name }
}`

const BOOTSTRAP = `mutation Bootstrap($locationId: ID!) {
  bootstrapCarts(locationId: $locationId) { id }
}`

function cartIds(): string[] {
  return shoppingFake.state.carts.map((c) => c.id).sort()
}

// ─── createVendor: the first half ────────────────────────────────────────────

describe('createVendor pre-creates the cart at ONE location', () => {
  it('user creating a vendor while viewing the Garage gets the cart THERE', async () => {
    // Given the caller is looking at their Garage, which is NOT their default
    // When they create a vendor
    const result = await execOp(CREATE_VENDOR, { name: 'Costco', locationId: LOC_OTHER })

    // Then the vendor's cart exists in the Garage
    expect(result?.errors).toBeUndefined()
    const vendorId = (result?.data?.createVendor as { id: string }).id
    expect(cartIds()).toEqual([`${LOC_OTHER}:${vendorId}`])

    // And NOT in the Kitchen. This is the assertion a one-location fixture
    // could not make: it is what tells "the location asked for" apart from
    // "the caller's default location".
    expect(cartIds()).not.toContain(`${LOC_DEFAULT}:${vendorId}`)

    // And the cart row carries the same location its id names
    expect(shoppingFake.state.carts[0]).toMatchObject({
      locationId: LOC_OTHER,
      userId: 'user_test123',
    })
  })

  it('omitting locationId is refused — the default-location fallback is gone', async () => {
    // Given no locationId is sent. Until PR 3b Task 4 the server fell back to
    // the caller's DEFAULT location, so a vendor created while viewing the
    // Garage got its cart in the Kitchen. The argument is `ID!` now — see
    // src/schema/vendor.graphql.
    const result = await execOp(
      `mutation CreateVendorNoLocation($name: String!) {
        createVendor(name: $name) { id name }
      }`,
      { name: 'Costco' },
    )

    // Then the request fails at validation, and neither a vendor nor a cart is
    // written. Loud, at the schema layer, rather than a quiet write to a
    // location the caller did not name.
    expect(result?.errors?.[0]?.extensions?.code).toBe('GRAPHQL_VALIDATION_FAILED')
    expect(shoppingFake.state.vendors).toHaveLength(0)
    expect(cartIds()).toEqual([])
  })

  it("creating a vendor at another user's location is FORBIDDEN, and writes nothing", async () => {
    // Given a location id belonging to somebody else
    // When the caller sends it
    const result = await execOp(CREATE_VENDOR, { name: 'Costco', locationId: LOC_STRANGER })

    // Then the mutation is refused by requireLocationRole
    expect(result?.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')

    // And neither the vendor nor a cart was written. The role check runs BEFORE
    // the vendor row, so a refusal leaves no orphan vendor behind.
    expect(shoppingFake.state.vendors).toHaveLength(0)
    expect(shoppingFake.state.carts).toHaveLength(0)
  })
})

// ─── bootstrapCarts: the second half ─────────────────────────────────────────

describe('bootstrapCarts fills in the locations createVendor skipped', () => {
  it('user switching to the Garage finds the cart for a vendor made in the Kitchen', async () => {
    // Given a vendor created while the Kitchen was active
    const created = await execOp(CREATE_VENDOR, { name: 'Costco', locationId: LOC_DEFAULT })
    const vendorId = (created?.data?.createVendor as { id: string }).id
    // And that vendor has NO cart in the Garage yet — this is the gap Task 2
    // closes, and the state the assertion below has to move away from
    expect(cartIds()).not.toContain(`${LOC_OTHER}:${vendorId}`)

    // When the user switches to the Garage, which is what calls this mutation
    const result = await execOp(BOOTSTRAP, { locationId: LOC_OTHER })

    // Then the Garage has both the vendor's cart and the no-vendor cart
    expect(result?.errors).toBeUndefined()
    expect(cartIds()).toContain(`${LOC_OTHER}:${vendorId}`)
    expect(cartIds()).toContain(`${LOC_OTHER}:no-vendor`)

    // And the Kitchen gained nothing: it still holds only the one cart
    // createVendor wrote. A bootstrap that ignored its argument and wrote every
    // location would add `${LOC_DEFAULT}:no-vendor` here.
    expect(cartIds().filter((id) => id.startsWith(`${LOC_DEFAULT}:`))).toEqual([
      `${LOC_DEFAULT}:${vendorId}`,
    ])
  })

  it('bootstrapCarts returns that location\'s carts, not every location\'s', async () => {
    // Given one vendor, with its cart already in the Kitchen
    const created = await execOp(CREATE_VENDOR, { name: 'Costco', locationId: LOC_DEFAULT })
    const vendorId = (created?.data?.createVendor as { id: string }).id

    // When the Garage is bootstrapped
    const result = await execOp(BOOTSTRAP, { locationId: LOC_OTHER })

    // Then exactly the Garage's two carts come back, in id order
    const returned = (result?.data?.bootstrapCarts as { id: string }[]).map((c) => c.id)
    expect(returned).toEqual(
      [`${LOC_OTHER}:${vendorId}`, `${LOC_OTHER}:no-vendor`].sort(),
    )
    // And the Kitchen's cart is NOT in the result
    expect(returned).not.toContain(`${LOC_DEFAULT}:${vendorId}`)
  })

  it('running bootstrapCarts twice creates nothing the second time', async () => {
    // Given the Garage has been bootstrapped once
    await execOp(CREATE_VENDOR, { name: 'Costco', locationId: LOC_DEFAULT })
    await execOp(BOOTSTRAP, { locationId: LOC_OTHER })
    const after = cartIds()

    // When it is bootstrapped again — the active location changes back and
    // forth all the time
    const result = await execOp(BOOTSTRAP, { locationId: LOC_OTHER })

    // Then no duplicate id is attempted. `Cart.id` is a primary key and the
    // fake raises P2002 on a second insert, so a resolver that skipped its
    // "which of these already exist" read would fail here, not pass quietly.
    expect(result?.errors).toBeUndefined()
    expect(cartIds()).toEqual(after)
  })

  it("bootstrapCarts ignores another user's vendors", async () => {
    // Given the caller has one vendor and a stranger has another
    const created = await execOp(CREATE_VENDOR, { name: 'Costco', locationId: LOC_DEFAULT })
    const vendorId = (created?.data?.createVendor as { id: string }).id
    shoppingFake.state.vendors.push({
      id: 'vendor_stranger',
      name: 'Their Shop',
      userId: 'user_other',
    })

    // When the caller bootstraps their Garage
    await execOp(BOOTSTRAP, { locationId: LOC_OTHER })

    // Then only their own vendor got a cart. The fake models Prisma's `where`
    // semantics, so dropping `where: { userId }` from the vendor read would
    // create `${LOC_OTHER}:vendor_stranger` here.
    expect(cartIds()).toEqual(
      [
        `${LOC_DEFAULT}:${vendorId}`,
        `${LOC_OTHER}:${vendorId}`,
        `${LOC_OTHER}:no-vendor`,
      ].sort(),
    )
  })

  it("bootstrapping another user's location is FORBIDDEN, and writes nothing", async () => {
    // Given a location id belonging to somebody else
    // When the caller sends it
    const result = await execOp(BOOTSTRAP, { locationId: LOC_STRANGER })

    // Then it is refused, and no cart was created under that location
    expect(result?.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(shoppingFake.state.carts).toHaveLength(0)
  })

  it('a location with no vendors still gets its no-vendor cart', async () => {
    // Given the caller has no vendors at all
    // When they switch to the Garage
    const result = await execOp(BOOTSTRAP, { locationId: LOC_OTHER })

    // Then the Garage gets the no-vendor cart on its own. Local mode's
    // bootstrapCarts writes that one unconditionally too.
    expect(result?.errors).toBeUndefined()
    expect(cartIds()).toEqual([`${LOC_OTHER}:no-vendor`])
  })
})
