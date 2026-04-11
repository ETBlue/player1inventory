import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    inventoryLog: { deleteMany: vi.fn() },
    cartItem: { deleteMany: vi.fn() },
    cart: { deleteMany: vi.fn() },
    recipeItem: { deleteMany: vi.fn() },
    recipe: { deleteMany: vi.fn() },
    itemTag: { deleteMany: vi.fn() },
    itemVendor: { deleteMany: vi.fn() },
    item: { deleteMany: vi.fn() },
    tag: { deleteMany: vi.fn() },
    tagType: { deleteMany: vi.fn() },
    vendor: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '../lib/prisma.js'

const p = prisma as unknown as {
  inventoryLog: { deleteMany: ReturnType<typeof vi.fn> }
  cartItem: { deleteMany: ReturnType<typeof vi.fn> }
  cart: { deleteMany: ReturnType<typeof vi.fn> }
  recipeItem: { deleteMany: ReturnType<typeof vi.fn> }
  recipe: { deleteMany: ReturnType<typeof vi.fn> }
  itemTag: { deleteMany: ReturnType<typeof vi.fn> }
  itemVendor: { deleteMany: ReturnType<typeof vi.fn> }
  item: { deleteMany: ReturnType<typeof vi.fn> }
  tag: { deleteMany: ReturnType<typeof vi.fn> }
  tagType: { deleteMany: ReturnType<typeof vi.fn> }
  vendor: { deleteMany: ReturnType<typeof vi.fn> }
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

const PURGE_MUTATION = `mutation {
  purgeUserData {
    items tags tagTypes vendors recipes carts cartItems inventoryLogs
  }
}`

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('purgeUserData resolver', () => {
  it('user can purge all their data and receive deleted counts', async () => {
    // Given transaction returns per-entity deleted counts
    p.$transaction.mockResolvedValue([
      { count: 2 },  // inventoryLogs
      { count: 1 },  // cartItems
      { count: 1 },  // carts
      { count: 0 },  // recipeItems (junction)
      { count: 3 },  // recipes
      { count: 0 },  // itemTags (junction)
      { count: 0 },  // itemVendors (junction)
      { count: 5 },  // items
      { count: 4 },  // tags
      { count: 2 },  // tagTypes
      { count: 1 },  // vendors
    ])

    // When user calls purgeUserData
    const response = await server.executeOperation(
      { query: PURGE_MUTATION },
      { contextValue: { userId: 'user_purge_test' } },
    )

    // Then deleted counts are returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const data = response.body.singleResult.data?.purgeUserData as Record<string, number>
      expect(data.inventoryLogs).toBe(2)
      expect(data.cartItems).toBe(1)
      expect(data.carts).toBe(1)
      expect(data.recipes).toBe(3)
      expect(data.items).toBe(5)
      expect(data.tags).toBe(4)
      expect(data.tagTypes).toBe(2)
      expect(data.vendors).toBe(1)
    }
  })

  it('returns zero counts when user has no data', async () => {
    // Given everything returns 0
    p.$transaction.mockResolvedValue(
      Array(11).fill({ count: 0 })
    )

    // When purging
    const response = await server.executeOperation(
      { query: PURGE_MUTATION },
      { contextValue: { userId: 'user_empty' } },
    )

    // Then all counts are 0
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const data = response.body.singleResult.data?.purgeUserData as Record<string, number>
      expect(data.items).toBe(0)
      expect(data.tags).toBe(0)
    }
  })

  it('returns error when unauthenticated', async () => {
    // Given no userId in context
    const response = await server.executeOperation(
      { query: PURGE_MUTATION },
      { contextValue: { userId: null } },
    )

    // Then an auth error is returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeDefined()
      expect(response.body.singleResult.errors?.[0].message).toMatch(/unauthorized/i)
    }
  })
})
