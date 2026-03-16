import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import { ItemModel } from '../models/Item.model.js'
import { VendorModel } from '../models/Vendor.model.js'
import type { Context } from '../context.js'

let mongod: MongoMemoryServer
let server: ApolloServer<Context>

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
}, 120000)

afterAll(async () => {
  await server.stop()
  await mongoose.disconnect()
  await mongod.stop()
})

afterEach(async () => {
  await VendorModel.deleteMany({})
  await ItemModel.deleteMany({})
})

const ctx: Context = { userId: 'user_test123' }

// ─── helpers ────────────────────────────────────────────────────────────────

async function createVendor(name = 'Costco') {
  const r = await server.executeOperation(
    {
      query: `mutation($name: String!) { createVendor(name: $name) { id } }`,
      variables: { name },
    },
    { contextValue: ctx },
  )
  return (r.body.kind === 'single' ? r.body.singleResult.data?.createVendor : null) as { id: string }
}

// ─── Vendor resolvers ────────────────────────────────────────────────────────

describe('Vendor resolvers', () => {
  it('user can create a vendor via GraphQL', async () => {
    const response = await server.executeOperation(
      {
        query: `mutation CreateVendor($name: String!) {
          createVendor(name: $name) { id name userId }
        }`,
        variables: { name: 'Costco' },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const vendor = response.body.singleResult.data?.createVendor as {
        id: string; name: string; userId: string
      }
      expect(vendor.name).toBe('Costco')
      expect(vendor.userId).toBe('user_test123')
      expect(vendor.id).toBeDefined()
    }
  })

  it('user can list their vendors', async () => {
    await VendorModel.create({ name: 'Costco', userId: 'user_test123' })

    const response = await server.executeOperation(
      { query: `query { vendors { id name } }` },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const vendors = response.body.singleResult.data?.vendors as { id: string }[]
      expect(Array.isArray(vendors)).toBe(true)
      expect(vendors.length).toBe(1)
    }
  })

  it('user can update a vendor', async () => {
    // Given a vendor exists
    const { id } = await createVendor('Old Name')

    // When updating the name
    const response = await server.executeOperation(
      {
        query: `mutation UpdateVendor($id: ID!, $name: String) {
          updateVendor(id: $id, name: $name) { id name }
        }`,
        variables: { id, name: 'New Name' },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect((response.body.singleResult.data?.updateVendor as { name: string }).name).toBe('New Name')
    }
  })

  it('user can delete a vendor', async () => {
    const { id } = await createVendor()

    const response = await server.executeOperation(
      {
        query: `mutation DeleteVendor($id: ID!) { deleteVendor(id: $id) }`,
        variables: { id },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.deleteVendor).toBe(true)
    }
  })

  it('deleting a vendor removes it from all item vendorIds (cascade)', async () => {
    // Given a vendor and 2 items that reference it
    const { id: vendorId } = await createVendor('Cascade Vendor')
    await ItemModel.create([
      { name: 'Milk', tagIds: [], vendorIds: [vendorId], targetUnit: 'package', targetQuantity: 1, refillThreshold: 0, packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1, userId: 'user_test123' },
      { name: 'Cheese', tagIds: [], vendorIds: [vendorId], targetUnit: 'package', targetQuantity: 1, refillThreshold: 0, packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1, userId: 'user_test123' },
    ])

    // When deleting the vendor
    await server.executeOperation(
      {
        query: `mutation DeleteVendor($id: ID!) { deleteVendor(id: $id) }`,
        variables: { id: vendorId },
      },
      { contextValue: ctx },
    )

    // Then the vendorId is removed from all items
    const items = await ItemModel.find({ userId: 'user_test123' })
    for (const item of items) {
      expect(item.vendorIds).not.toContain(vendorId)
    }
  })

  it('does not return vendors belonging to another user', async () => {
    await VendorModel.create({ name: 'Other Vendor', userId: 'user_A' })

    const response = await server.executeOperation(
      { query: `query { vendors { id } }` },
      { contextValue: { userId: 'user_B' } },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.vendors).toHaveLength(0)
    }
  })

  it('user can get item count for a vendor', async () => {
    // Given a vendor and 2 items using it
    const { id: vendorId } = await createVendor('Costco')
    await ItemModel.create([
      { name: 'Milk', tagIds: [], vendorIds: [vendorId], targetUnit: 'package', targetQuantity: 1, refillThreshold: 0, packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1, userId: 'user_test123' },
      { name: 'Cheese', tagIds: [], vendorIds: [vendorId], targetUnit: 'package', targetQuantity: 1, refillThreshold: 0, packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1, userId: 'user_test123' },
    ])

    // When querying item count for that vendor
    const response = await server.executeOperation(
      {
        query: `query ItemCountByVendor($vendorId: String!) { itemCountByVendor(vendorId: $vendorId) }`,
        variables: { vendorId },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.itemCountByVendor).toBe(2)
    }
  })
})
