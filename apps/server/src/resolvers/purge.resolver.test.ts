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
    shelf: { deleteMany: vi.fn() },
    itemStock: { deleteMany: vi.fn() },
    location: { deleteMany: vi.fn() },
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
  shelf: { deleteMany: ReturnType<typeof vi.fn> }
  itemStock: { deleteMany: ReturnType<typeof vi.fn> }
  location: { deleteMany: ReturnType<typeof vi.fn> }
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
    items tags tagTypes vendors recipes carts cartItems inventoryLogs shelves itemStocks locations
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
      { count: 7 },  // itemStocks (no userId, scoped through location) — must run
                     // before item.deleteMany so this count isn't pre-empted by
                     // ItemStock_itemId_fkey's ON DELETE CASCADE
      { count: 5 },  // items
      { count: 4 },  // tags
      { count: 2 },  // tagTypes
      { count: 1 },  // vendors
      { count: 6 },  // shelves
      { count: 3 },  // locations
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
      expect(data.shelves).toBe(6)
      expect(data.itemStocks).toBe(7)
      expect(data.locations).toBe(3)
    }
    // And every user-owned table was asked to delete this user's rows —
    // shelves and locations included (see purge-coverage.test.ts and issue #250).
    // itemStock has no userId — scoped through its location, like recipeItem.
    expect(p.shelf.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_purge_test' } })
    expect(p.location.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_purge_test' } })
    expect(p.itemStock.deleteMany).toHaveBeenCalledWith({
      where: { location: { userId: 'user_purge_test' } },
    })
    // And itemStock is deleted before item and before location — real
    // ItemStock_itemId_fkey is ON DELETE CASCADE, so deleting items first would
    // destroy ItemStock rows before this deleteMany could count them, and
    // ItemStock_locationId_fkey requires the FK target to still exist. Each
    // deleteMany(...) call executes synchronously while the $transaction array
    // literal is built, so mock.invocationCallOrder reflects source order.
    expect(p.itemStock.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      p.item.deleteMany.mock.invocationCallOrder[0],
    )
    expect(p.itemStock.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      p.location.deleteMany.mock.invocationCallOrder[0],
    )
  })

  it('returns zero counts when user has no data', async () => {
    // Given everything returns 0
    p.$transaction.mockResolvedValue(
      Array(14).fill({ count: 0 })
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
      expect(data.shelves).toBe(0)
      expect(data.itemStocks).toBe(0)
      expect(data.locations).toBe(0)
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
