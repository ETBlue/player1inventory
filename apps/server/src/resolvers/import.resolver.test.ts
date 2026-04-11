import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    item: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    itemTag: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    itemVendor: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    tag: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    tagType: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    vendor: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    recipe: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    recipeItem: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    inventoryLog: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    cart: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    cartItem: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '../lib/prisma.js'

const p = prisma as unknown as {
  item: {
    findUnique: ReturnType<typeof vi.fn>
    findUniqueOrThrow: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
  itemTag: {
    createMany: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  itemVendor: {
    createMany: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  tag: {
    createMany: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
  tagType: {
    createMany: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
  vendor: {
    createMany: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
  recipe: {
    findUnique: ReturnType<typeof vi.fn>
    findUniqueOrThrow: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
  recipeItem: {
    createMany: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  inventoryLog: {
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  cart: {
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  cartItem: {
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
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

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONTEXT: Context = { userId: 'user_import_test' }

function makeItemInput(overrides: Partial<Record<string, unknown>> & { id: string }) {
  const { id, ...rest } = overrides
  return {
    id,
    name: 'Milk',
    tagIds: [],
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...rest,
  }
}

function makePrismaItem(id: string, name = 'Milk') {
  return {
    id,
    name,
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    expirationMode: 'disabled',
    userId: 'user_import_test',
    familyId: null,
    packageUnit: null,
    measurementUnit: null,
    amountPerPackage: null,
    dueDate: null,
    estimatedDueDays: null,
    expirationThreshold: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    vendors: [],
  }
}

const BULK_CREATE_ITEMS = `
  mutation BulkCreateItems($items: [ItemInput!]!) {
    bulkCreateItems(items: $items) { id name userId }
  }
`

const BULK_UPSERT_ITEMS = `
  mutation BulkUpsertItems($items: [ItemInput!]!) {
    bulkUpsertItems(items: $items) { id name }
  }
`

const CLEAR_ALL_DATA = `mutation { clearAllData }`

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('bulkCreateItems', () => {
  it('user can bulk-create items with original IDs', async () => {
    // Given no existing item
    p.item.findUnique.mockResolvedValue(null)
    const prismaItem = makePrismaItem('item_abc123', 'Milk')
    p.item.create.mockResolvedValue(prismaItem)
    p.itemTag.createMany.mockResolvedValue({ count: 0 })
    p.itemVendor.createMany.mockResolvedValue({ count: 0 })
    p.item.findUniqueOrThrow.mockResolvedValue(prismaItem)

    // When calling bulkCreateItems
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: { items: [makeItemInput({ id: 'item_abc123', name: 'Milk' })] },
      },
      { contextValue: CONTEXT },
    )

    // Then the item is returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.bulkCreateItems as Array<{ id: string; name: string; userId: string }>
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe('item_abc123')
      expect(items[0].name).toBe('Milk')
      expect(items[0].userId).toBe('user_import_test')
    }
  })

  it('skips duplicate IDs instead of throwing', async () => {
    // Given item_existing already exists and item_new does not
    p.item.findUnique
      .mockResolvedValueOnce({ id: 'item_existing' }) // exists — skip
      .mockResolvedValueOnce(null) // new — create
    const prismaItem = makePrismaItem('item_new', 'New Item')
    p.item.create.mockResolvedValue(prismaItem)
    p.itemTag.createMany.mockResolvedValue({ count: 0 })
    p.itemVendor.createMany.mockResolvedValue({ count: 0 })
    p.item.findUniqueOrThrow.mockResolvedValue(prismaItem)

    // When bulk-creating with one conflicting and one new ID
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: {
          items: [
            makeItemInput({ id: 'item_existing', name: 'Duplicate' }),
            makeItemInput({ id: 'item_new', name: 'New Item' }),
          ],
        },
      },
      { contextValue: CONTEXT },
    )

    // Then only the new item is returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.bulkCreateItems as Array<{ id: string }>
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe('item_new')
    }
  })

  it('assigns the authenticated userId to imported items', async () => {
    // Given a new item
    p.item.findUnique.mockResolvedValue(null)
    const prismaItem = { ...makePrismaItem('item_xyz', 'Eggs'), userId: 'new_user' }
    p.item.create.mockResolvedValue(prismaItem)
    p.itemTag.createMany.mockResolvedValue({ count: 0 })
    p.itemVendor.createMany.mockResolvedValue({ count: 0 })
    p.item.findUniqueOrThrow.mockResolvedValue(prismaItem)

    // When a different user imports
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: { items: [makeItemInput({ id: 'item_xyz', name: 'Eggs' })] },
      },
      { contextValue: { userId: 'new_user' } },
    )

    // Then userId on the returned item matches the authenticated user
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.bulkCreateItems as Array<{ userId: string }>
      expect(items[0].userId).toBe('new_user')
    }
  })

  it('rejects unauthenticated bulk-create requests', async () => {
    // Given no userId in context
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: { items: [makeItemInput({ id: 'item_abc' })] },
      },
      { contextValue: { userId: null } },
    )

    // Then it is rejected with UNAUTHENTICATED
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors?.[0].extensions?.code).toBe('UNAUTHENTICATED')
    }
  })
})

describe('bulkUpsertItems', () => {
  it('user can upsert items — creates if absent, replaces if present', async () => {
    // Given both items upserted successfully
    const item1 = makePrismaItem('item_existing', 'Updated Name')
    const item2 = makePrismaItem('item_new', 'Brand New')
    p.item.upsert.mockResolvedValueOnce(item1).mockResolvedValueOnce(item2)
    p.itemTag.deleteMany.mockResolvedValue({ count: 0 })
    p.itemVendor.deleteMany.mockResolvedValue({ count: 0 })
    p.itemTag.createMany.mockResolvedValue({ count: 0 })
    p.itemVendor.createMany.mockResolvedValue({ count: 0 })
    p.item.findUniqueOrThrow.mockResolvedValueOnce(item1).mockResolvedValueOnce(item2)

    // When upserting both
    const response = await server.executeOperation(
      {
        query: BULK_UPSERT_ITEMS,
        variables: {
          items: [
            makeItemInput({ id: 'item_existing', name: 'Updated Name' }),
            makeItemInput({ id: 'item_new', name: 'Brand New' }),
          ],
        },
      },
      { contextValue: CONTEXT },
    )

    // Then both items are returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.bulkUpsertItems as Array<{ id: string; name: string }>
      expect(items).toHaveLength(2)
      expect(items[0].name).toBe('Updated Name')
      expect(items[1].name).toBe('Brand New')
    }
  })
})

describe('clearAllData', () => {
  it('user can clear all their data', async () => {
    // Given transaction resolves
    p.$transaction.mockResolvedValue([
      { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 },
      { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 },
      { count: 0 }, { count: 0 }, { count: 0 },
    ])

    // When calling clearAllData
    const response = await server.executeOperation(
      { query: CLEAR_ALL_DATA },
      { contextValue: CONTEXT },
    )

    // Then it returns true
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      expect(response.body.singleResult.data?.clearAllData).toBe(true)
    }
  })
})
