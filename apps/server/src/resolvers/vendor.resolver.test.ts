import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    vendor: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { prisma } from '../lib/prisma.js'

const mockPrisma = prisma as unknown as {
  vendor: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let server: ApolloServer<Context>
const ctx: Context = { userId: 'user_test123' }

beforeEach(async () => {
  vi.clearAllMocks()
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
    const newVendor = { id: 'v_1', name: 'Costco', userId: 'user_test123', familyId: null }
    mockPrisma.vendor.create.mockResolvedValue(newVendor)

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
  })

  it('user can list their vendors', async () => {
    // Given one vendor for this user
    mockPrisma.vendor.findMany.mockResolvedValue([
      { id: 'v_1', name: 'Costco', userId: 'user_test123', familyId: null },
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
      id: 'v_1', name: 'New Name', userId: 'user_test123', familyId: null,
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

  it('user can delete a vendor', async () => {
    // Given Prisma delete succeeds (ItemVendor rows cascade automatically)
    mockPrisma.vendor.delete.mockResolvedValue({ id: 'v_1' })

    // When deleting a vendor
    const result = await execOp(
      `mutation DeleteVendor($id: ID!) { deleteVendor(id: $id) }`,
      { id: 'v_1' },
    )

    // Then true is returned
    expect(result?.data?.deleteVendor).toBe(true)
    expect(mockPrisma.vendor.delete).toHaveBeenCalledWith({ where: { id: 'v_1' } })
  })

  it('returns false when deleting a non-existent vendor', async () => {
    // Given Prisma throws on delete
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
