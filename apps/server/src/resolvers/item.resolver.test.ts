import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    item: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    itemTag: {
      count: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    itemVendor: {
      count: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    recipeItem: {
      count: vi.fn(),
    },
  },
}))

import { prisma } from '../lib/prisma.js'

const mockPrisma = prisma as unknown as {
  item: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    findUniqueOrThrow: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  itemTag: {
    count: ReturnType<typeof vi.fn>
    createMany: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  itemVendor: {
    count: ReturnType<typeof vi.fn>
    createMany: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  recipeItem: {
    count: ReturnType<typeof vi.fn>
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const now = new Date('2024-01-01T00:00:00.000Z')

function makeItem(overrides: Partial<{
  id: string; name: string; userId: string;
  tagIds: string[]; vendorIds: string[];
  tags: { tagId: string }[]; vendors: { vendorId: string }[];
}> = {}) {
  return {
    id: overrides.id ?? 'item_1',
    name: overrides.name ?? 'Milk',
    packageUnit: null,
    measurementUnit: null,
    amountPerPackage: null,
    targetUnit: 'package',
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    dueDate: null,
    estimatedDueDays: null,
    expirationThreshold: null,
    expirationMode: 'disabled',
    userId: overrides.userId ?? 'user_test123',
    familyId: null,
    createdAt: now,
    updatedAt: now,
    tags: (overrides.tagIds ?? []).map((tagId) => ({ itemId: overrides.id ?? 'item_1', tagId })),
    vendors: (overrides.vendorIds ?? []).map((vendorId) => ({ itemId: overrides.id ?? 'item_1', vendorId })),
    ...overrides,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function execOp(query: string, variables?: Record<string, unknown>, context = ctx) {
  const r = await server.executeOperation({ query, variables }, { contextValue: context })
  return r.body.kind === 'single' ? r.body.singleResult : null
}

// ─── Item resolvers ───────────────────────────────────────────────────────────

describe('Item resolvers', () => {
  it('user can create an item via GraphQL', async () => {
    // Given Prisma create and findUniqueOrThrow return a valid item
    const item = makeItem({ name: 'Milk' })
    mockPrisma.item.create.mockResolvedValue(item)
    mockPrisma.item.findUniqueOrThrow.mockResolvedValue(item)

    // When user creates an item
    const result = await execOp(
      `mutation CreateItem($input: CreateItemInput!) {
        createItem(input: $input) { id name userId tagIds vendorIds createdAt updatedAt }
      }`,
      { input: { name: 'Milk' } },
    )

    // Then item is returned with userId and mapped fields
    expect(result?.errors).toBeUndefined()
    const created = result?.data?.createItem as { id: string; name: string; userId: string; tagIds: string[]; vendorIds: string[] }
    expect(created.name).toBe('Milk')
    expect(created.userId).toBe('user_test123')
    expect(created.id).toBe('item_1')
    expect(created.tagIds).toEqual([])
    expect(created.vendorIds).toEqual([])
  })

  it('user can create an item with tagIds and vendorIds', async () => {
    // Given an item with associated tags and vendors
    const item = makeItem({ tagIds: ['tag_1'], vendorIds: ['vendor_1'] })
    mockPrisma.item.create.mockResolvedValue(item)
    mockPrisma.itemTag.createMany.mockResolvedValue({ count: 1 })
    mockPrisma.itemVendor.createMany.mockResolvedValue({ count: 1 })
    mockPrisma.item.findUniqueOrThrow.mockResolvedValue(item)

    // When creating with tag and vendor ids
    const result = await execOp(
      `mutation CreateItem($input: CreateItemInput!) {
        createItem(input: $input) { id tagIds vendorIds }
      }`,
      { input: { name: 'Milk', tagIds: ['tag_1'], vendorIds: ['vendor_1'] } },
    )

    // Then junction rows are created and ids are returned
    expect(result?.errors).toBeUndefined()
    const created = result?.data?.createItem as { tagIds: string[]; vendorIds: string[] }
    expect(created.tagIds).toEqual(['tag_1'])
    expect(created.vendorIds).toEqual(['vendor_1'])
    expect(mockPrisma.itemTag.createMany).toHaveBeenCalledWith({
      data: [{ itemId: 'item_1', tagId: 'tag_1' }],
    })
    expect(mockPrisma.itemVendor.createMany).toHaveBeenCalledWith({
      data: [{ itemId: 'item_1', vendorId: 'vendor_1' }],
    })
  })

  it('user can list their items', async () => {
    // Given two items for this user
    const items = [makeItem({ id: 'item_1', name: 'Eggs' }), makeItem({ id: 'item_2', name: 'Butter' })]
    mockPrisma.item.findMany.mockResolvedValue(items)

    // When querying items
    const result = await execOp(`query { items { id name } }`)

    // Then all items are returned
    expect(result?.errors).toBeUndefined()
    const list = result?.data?.items as { id: string; name: string }[]
    expect(list).toHaveLength(2)
    expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_test123' },
      include: { tags: true, vendors: true },
    })
  })

  it('user can fetch a single item by id', async () => {
    // Given an item in the database
    const item = makeItem({ id: 'item_1', name: 'Butter' })
    mockPrisma.item.findFirst.mockResolvedValue(item)

    // When fetching by id
    const result = await execOp(
      `query GetItem($id: ID!) { item(id: $id) { id name } }`,
      { id: 'item_1' },
    )

    // Then the item is returned
    expect(result?.errors).toBeUndefined()
    expect((result?.data?.item as { name: string }).name).toBe('Butter')
    expect(mockPrisma.item.findFirst).toHaveBeenCalledWith({
      where: { id: 'item_1', userId: 'user_test123' },
      include: { tags: true, vendors: true },
    })
  })

  it('returns null when item is not found', async () => {
    // Given no item exists for the id
    mockPrisma.item.findFirst.mockResolvedValue(null)

    // When fetching a non-existent id
    const result = await execOp(
      `query GetItem($id: ID!) { item(id: $id) { id name } }`,
      { id: 'does_not_exist' },
    )

    // Then null is returned (no error)
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.item).toBeNull()
  })

  it('user can update an item name', async () => {
    // Given an existing item
    const existing = makeItem({ id: 'item_1', name: 'Oil' })
    const updated = makeItem({ id: 'item_1', name: 'Olive Oil' })
    mockPrisma.item.findFirst.mockResolvedValue(existing)
    mockPrisma.item.update.mockResolvedValue(updated)
    mockPrisma.item.findUniqueOrThrow.mockResolvedValue(updated)

    // When updating the name
    const result = await execOp(
      `mutation UpdateItem($id: ID!, $input: UpdateItemInput!) {
        updateItem(id: $id, input: $input) { id name }
      }`,
      { id: 'item_1', input: { name: 'Olive Oil' } },
    )

    // Then the updated name is returned
    expect(result?.errors).toBeUndefined()
    expect((result?.data?.updateItem as { name: string }).name).toBe('Olive Oil')
  })

  it('updateItem replaces tagIds wholesale when tagIds is provided', async () => {
    // Given an item that already has tags
    const existing = makeItem({ id: 'item_1', tagIds: ['tag_old'] })
    const updated = makeItem({ id: 'item_1', tagIds: ['tag_new'] })
    mockPrisma.item.findFirst.mockResolvedValue(existing)
    mockPrisma.item.update.mockResolvedValue(updated)
    mockPrisma.itemTag.deleteMany.mockResolvedValue({ count: 1 })
    mockPrisma.itemTag.createMany.mockResolvedValue({ count: 1 })
    mockPrisma.item.findUniqueOrThrow.mockResolvedValue(updated)

    // When updating tagIds to a new set
    const result = await execOp(
      `mutation UpdateItem($id: ID!, $input: UpdateItemInput!) {
        updateItem(id: $id, input: $input) { id tagIds }
      }`,
      { id: 'item_1', input: { tagIds: ['tag_new'] } },
    )

    // Then old tags are deleted and new tags are inserted
    expect(result?.errors).toBeUndefined()
    expect(mockPrisma.itemTag.deleteMany).toHaveBeenCalledWith({ where: { itemId: 'item_1' } })
    expect(mockPrisma.itemTag.createMany).toHaveBeenCalledWith({
      data: [{ itemId: 'item_1', tagId: 'tag_new' }],
    })
    const upd = result?.data?.updateItem as { tagIds: string[] }
    expect(upd.tagIds).toEqual(['tag_new'])
  })

  it('returns NOT_FOUND when updating a non-existent item', async () => {
    // Given no item for the given id+userId
    mockPrisma.item.findFirst.mockResolvedValue(null)

    // When updating a non-existent item
    const result = await execOp(
      `mutation UpdateItem($id: ID!, $input: UpdateItemInput!) {
        updateItem(id: $id, input: $input) { id }
      }`,
      { id: 'does_not_exist', input: { name: 'Anything' } },
    )

    // Then a NOT_FOUND error is returned
    expect(result?.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })

  it('user can delete an item', async () => {
    // Given the item exists (ownership check passes)
    mockPrisma.item.findFirst.mockResolvedValue(makeItem())
    mockPrisma.item.delete.mockResolvedValue(makeItem())

    // When deleting
    const result = await execOp(
      `mutation DeleteItem($id: ID!) { deleteItem(id: $id) }`,
      { id: 'item_1' },
    )

    // Then true is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.deleteItem).toBe(true)
    expect(mockPrisma.item.delete).toHaveBeenCalledWith({ where: { id: 'item_1' } })
  })

  it('deleteItem returns false when item does not exist', async () => {
    // Given item not found for this user
    mockPrisma.item.findFirst.mockResolvedValue(null)

    // When attempting to delete
    const result = await execOp(
      `mutation DeleteItem($id: ID!) { deleteItem(id: $id) }`,
      { id: 'ghost_item' },
    )

    // Then false is returned without error
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.deleteItem).toBe(false)
    expect(mockPrisma.item.delete).not.toHaveBeenCalled()
  })

  it('does not return items belonging to another user', async () => {
    // Given no items for user B
    mockPrisma.item.findMany.mockResolvedValue([])

    // When user B queries items
    const result = await execOp(
      `query { items { id name } }`,
      undefined,
      { userId: 'user_B' },
    )

    // Then an empty list is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.items).toHaveLength(0)
    expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_B' },
      include: { tags: true, vendors: true },
    })
  })

  it('rejects unauthenticated requests', async () => {
    // When querying without authentication
    const result = await execOp(
      `query { items { id name } }`,
      undefined,
      { userId: null },
    )

    // Then UNAUTHENTICATED error is returned
    expect(result?.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED')
  })

  it('itemCountByTag returns count from prisma.itemTag.count', async () => {
    // Given 3 items tagged with tag_1
    mockPrisma.itemTag.count.mockResolvedValue(3)

    // When querying count by tag
    const result = await execOp(
      `query ItemCountByTag($tagId: String!) { itemCountByTag(tagId: $tagId) }`,
      { tagId: 'tag_1' },
    )

    // Then the count is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.itemCountByTag).toBe(3)
    expect(mockPrisma.itemTag.count).toHaveBeenCalledWith({ where: { tagId: 'tag_1' } })
  })

  it('itemCountByVendor returns count from prisma.itemVendor.count', async () => {
    // Given 2 items from vendor_1
    mockPrisma.itemVendor.count.mockResolvedValue(2)

    // When querying count by vendor
    const result = await execOp(
      `query ItemCountByVendor($vendorId: String!) { itemCountByVendor(vendorId: $vendorId) }`,
      { vendorId: 'vendor_1' },
    )

    // Then the count is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.itemCountByVendor).toBe(2)
    expect(mockPrisma.itemVendor.count).toHaveBeenCalledWith({ where: { vendorId: 'vendor_1' } })
  })

  it('itemCountByRecipe returns count from prisma.recipeItem.count', async () => {
    // Given 4 items in recipe_1
    mockPrisma.recipeItem.count.mockResolvedValue(4)

    // When querying count by recipe
    const result = await execOp(
      `query ItemCountByRecipe($recipeId: String!) { itemCountByRecipe(recipeId: $recipeId) }`,
      { recipeId: 'recipe_1' },
    )

    // Then the count is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.itemCountByRecipe).toBe(4)
    expect(mockPrisma.recipeItem.count).toHaveBeenCalledWith({ where: { recipeId: 'recipe_1' } })
  })

  it('createdAt and updatedAt are ISO strings in the GraphQL response', async () => {
    // Given an item with known date values
    const item = makeItem()
    mockPrisma.item.findMany.mockResolvedValue([item])

    // When querying items
    const result = await execOp(`query { items { createdAt updatedAt } }`)

    // Then dates are returned as ISO strings (satisfying String! contract)
    expect(result?.errors).toBeUndefined()
    const items = result?.data?.items as { createdAt: string; updatedAt: string }[]
    expect(items[0].createdAt).toBe(now.toISOString())
    expect(items[0].updatedAt).toBe(now.toISOString())
  })

  it('dueDate is an ISO string when set', async () => {
    // Given an item with a dueDate
    const due = new Date('2024-06-01T00:00:00.000Z')
    const item = { ...makeItem(), dueDate: due }
    mockPrisma.item.findMany.mockResolvedValue([item])

    // When querying items
    const result = await execOp(`query { items { dueDate } }`)

    // Then dueDate is an ISO string
    expect(result?.errors).toBeUndefined()
    const items = result?.data?.items as { dueDate: string | null }[]
    expect(items[0].dueDate).toBe(due.toISOString())
  })
})
