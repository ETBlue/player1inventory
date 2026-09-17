import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

// `location` is the STATEFUL fake (src/test/stockFake.ts): createVendor's
// permanent cart now needs a locationId, resolved through
// ensureDefaultLocation, and a call recorder cannot answer "did it pick the
// caller's default one".
vi.mock('../lib/prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const stockFake = createStockFake()
  return {
    prisma: {
      vendor: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      cart: {
        upsert: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        findMany: vi.fn(),
      },
      cartItem: {
        deleteMany: vi.fn(),
      },
      ...stockFake.client,
      // Handle onto the fake's state, hung off the mocked client because a
      // `vi.mock` factory is hoisted above every import and cannot close over
      // a module-scope binding.
      $stockFake: stockFake,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { StockFake } from '../test/stockFake.js'

const mockPrisma = prisma as unknown as {
  vendor: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  cart: {
    upsert: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
  }
  cartItem: {
    deleteMany: ReturnType<typeof vi.fn>
  }
  $stockFake: StockFake
}

// THREE locations: the caller's default, the caller's other one, and a
// stranger's. A one-location fixture could not tell "the caller's DEFAULT
// location" apart from "the first location" or "any location".
const LOC_DEFAULT = 'loc_kitchen'
const LOC_OTHER = 'loc_garage'
const LOC_STRANGER = 'loc_theirs'

function seedLocations() {
  mockPrisma.$stockFake.reset(
    [
      // Not first on purpose.
      { id: LOC_OTHER, userId: 'user_test123', isDefault: false },
      { id: LOC_DEFAULT, userId: 'user_test123', isDefault: true },
      { id: LOC_STRANGER, userId: 'user_other', isDefault: true },
    ],
    [],
  )
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

// ─── helpers ─────────────────────────────────────────────────────────────────

async function execOp(query: string, variables?: Record<string, unknown>) {
  const r = await server.executeOperation({ query, variables }, { contextValue: ctx })
  return r.body.kind === 'single' ? r.body.singleResult : null
}

// ─── Vendor resolvers ─────────────────────────────────────────────────────────

describe('Vendor resolvers', () => {
  it('user can create a vendor via GraphQL', async () => {
    // Given prisma.vendor.create resolves with a new vendor
    const newVendor = { id: 'v_1', name: 'Costco', userId: 'user_test123' }
    mockPrisma.vendor.create.mockResolvedValue(newVendor)
    // createVendor also upserts a permanent cart with the vendor ID
    mockPrisma.cart.upsert.mockResolvedValue({ id: 'v_1', userId: 'user_test123', lastPurchasedAt: null })

    // When creating a vendor
    const result = await execOp(
      `mutation CreateVendor($name: String!) {
        createVendor(name: $name) { id name userId }
      }`,
      { name: 'Costco' },
    )

    // Then the vendor is returned
    const vendor = result?.data?.createVendor as { id: string; name: string; userId: string }
    expect(vendor.name).toBe('Costco')
    expect(vendor.userId).toBe('user_test123')
    expect(vendor.id).toBeDefined()
    expect(mockPrisma.vendor.create).toHaveBeenCalledWith({
      data: { name: 'Costco', userId: 'user_test123' },
    })
    // And a permanent cart is created/ensured for the new vendor, in the
    // caller's DEFAULT location. LOC_DEFAULT is not first in seedLocations and
    // LOC_STRANGER belongs to another user, so this fails both for a resolver
    // taking the first location and for one ignoring userId.
    //
    // The id is `${locationId}:${vendorId}` since PR 3b. A bare 'v_1' here is
    // an id the migration's guard forbids.
    expect(mockPrisma.cart.upsert).toHaveBeenCalledWith({
      where: { id: `${LOC_DEFAULT}:v_1` },
      create: { id: `${LOC_DEFAULT}:v_1`, userId: 'user_test123', locationId: LOC_DEFAULT },
      update: {},
    })
  })

  it('user can list their vendors', async () => {
    // Given one vendor for this user
    mockPrisma.vendor.findMany.mockResolvedValue([
      { id: 'v_1', name: 'Costco', userId: 'user_test123' },
    ])

    // When listing vendors
    const result = await execOp(`query { vendors { id name } }`)

    // Then all vendors are returned
    const vendors = result?.data?.vendors as { id: string }[]
    expect(Array.isArray(vendors)).toBe(true)
    expect(vendors).toHaveLength(1)
    expect(mockPrisma.vendor.findMany).toHaveBeenCalledWith({ where: { userId: 'user_test123' } })
  })

  it('user can update a vendor', async () => {
    // Given Prisma returns the updated vendor
    mockPrisma.vendor.update.mockResolvedValue({
      id: 'v_1', name: 'New Name', userId: 'user_test123',
    })

    // When updating the vendor name
    const result = await execOp(
      `mutation UpdateVendor($id: ID!, $name: String) {
        updateVendor(id: $id, name: $name) { id name }
      }`,
      { id: 'v_1', name: 'New Name' },
    )

    // Then the updated vendor is returned
    expect((result?.data?.updateVendor as { name: string }).name).toBe('New Name')
  })

  it('returns NOT_FOUND error when updating a non-existent vendor', async () => {
    // Given Prisma throws on update
    mockPrisma.vendor.update.mockRejectedValue(new Error('Record not found'))

    // When updating a non-existent vendor
    const result = await execOp(
      `mutation UpdateVendor($id: ID!, $name: String) {
        updateVendor(id: $id, name: $name) { id }
      }`,
      { id: 'does_not_exist', name: 'Anything' },
    )

    // Then a NOT_FOUND error is returned
    expect(result?.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })

  it('user can delete a vendor — its cart in EVERY location goes with it', async () => {
    // Given the vendor has a cart in two locations, and the caller also holds a
    // cart for a DIFFERENT vendor in one of them plus their own no-vendor cart.
    // Two locations, not one: with a single location "delete this vendor's
    // carts" and "delete the one cart whose id ends in the vendor id" are the
    // same set, so a resolver that handled only one location would still pass.
    mockPrisma.cart.findMany.mockResolvedValue([
      { id: `${LOC_DEFAULT}:v_1` },
      { id: `${LOC_OTHER}:v_1` },
      { id: `${LOC_DEFAULT}:v_2` },
      { id: `${LOC_DEFAULT}:no-vendor` },
    ])
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.cart.deleteMany.mockResolvedValue({ count: 2 })
    mockPrisma.vendor.delete.mockResolvedValue({ id: 'v_1' })

    // When deleting the vendor
    const result = await execOp(
      `mutation DeleteVendor($id: ID!) { deleteVendor(id: $id) }`,
      { id: 'v_1' },
    )

    // Then true is returned
    expect(result?.data?.deleteVendor).toBe(true)

    // And BOTH of that vendor's carts are deleted, in both locations
    const expectedIds = [`${LOC_DEFAULT}:v_1`, `${LOC_OTHER}:v_1`]
    expect(mockPrisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: { in: expectedIds } },
    })
    expect(mockPrisma.cart.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: expectedIds } },
    })

    // And the other vendor's cart and the no-vendor cart are NOT touched
    const deletedIds = mockPrisma.cart.deleteMany.mock.calls[0][0].where.id.in as string[]
    expect(deletedIds).not.toContain(`${LOC_DEFAULT}:v_2`)
    expect(deletedIds).not.toContain(`${LOC_DEFAULT}:no-vendor`)

    expect(mockPrisma.vendor.delete).toHaveBeenCalledWith({ where: { id: 'v_1' } })
  })

  it("deleting a vendor whose id contains ':' still finds its carts", async () => {
    // Given a vendor id that itself contains a colon. parseCartId splits on the
    // FIRST colon only, so `${locationId}:weird:vendor` parses back to the whole
    // vendor id. A resolver matching with endsWith or split(':')[1] fails here.
    mockPrisma.cart.findMany.mockResolvedValue([
      { id: `${LOC_DEFAULT}:weird:vendor` },
      { id: `${LOC_DEFAULT}:vendor` },
    ])
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.cart.deleteMany.mockResolvedValue({ count: 1 })
    mockPrisma.vendor.delete.mockResolvedValue({ id: 'weird:vendor' })

    // When deleting that vendor
    const result = await execOp(
      `mutation DeleteVendor($id: ID!) { deleteVendor(id: $id) }`,
      { id: 'weird:vendor' },
    )

    // Then only its own cart is deleted
    expect(result?.data?.deleteVendor).toBe(true)
    expect(mockPrisma.cart.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [`${LOC_DEFAULT}:weird:vendor`] } },
    })
  })

  it('returns false when deleting a non-existent vendor', async () => {
    // Given Prisma throws on delete
    mockPrisma.cart.findMany.mockResolvedValue([])
    mockPrisma.vendor.delete.mockRejectedValue(new Error('Record not found'))

    // When deleting a non-existent vendor
    const result = await execOp(
      `mutation DeleteVendor($id: ID!) { deleteVendor(id: $id) }`,
      { id: 'does_not_exist' },
    )

    // Then false is returned
    expect(result?.data?.deleteVendor).toBe(false)
  })

  it('does not return vendors belonging to another user', async () => {
    // Given no vendors for user_B
    mockPrisma.vendor.findMany.mockResolvedValue([])

    // When listing vendors as user_B
    const r = await server.executeOperation(
      { query: `query { vendors { id } }` },
      { contextValue: { userId: 'user_B' } },
    )
    const result = r.body.kind === 'single' ? r.body.singleResult : null

    // Then an empty list is returned
    expect(result?.data?.vendors).toHaveLength(0)
    expect(mockPrisma.vendor.findMany).toHaveBeenCalledWith({ where: { userId: 'user_B' } })
  })
})
