import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    cart: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    cartItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    item: {
      update: vi.fn(),
    },
    inventoryLog: {
      create: vi.fn(),
    },
  },
}))

import { prisma } from '../lib/prisma.js'

const mockPrisma = prisma as unknown as {
  cart: {
    findFirst: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  cartItem: {
    findFirst: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  item: {
    update: ReturnType<typeof vi.fn>
  }
  inventoryLog: {
    create: ReturnType<typeof vi.fn>
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const now = new Date('2024-01-01T00:00:00.000Z')

function makeCart(overrides: Partial<{
  id: string
  status: string
  userId: string
  createdAt: Date
  completedAt: Date | null
}> = {}) {
  return {
    id: overrides.id ?? 'cart_1',
    status: overrides.status ?? 'active',
    userId: overrides.userId ?? 'user_test123',
    familyId: null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: now,
    completedAt: overrides.completedAt ?? null,
  }
}

function makeCartItem(overrides: Partial<{
  id: string
  cartId: string
  itemId: string
  quantity: number
  userId: string
}> = {}) {
  return {
    id: overrides.id ?? 'cartitem_1',
    cartId: overrides.cartId ?? 'cart_1',
    itemId: overrides.itemId ?? 'item_1',
    quantity: overrides.quantity ?? 1,
    userId: overrides.userId ?? 'user_test123',
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

// ─── activeCart ──────────────────────────────────────────────────────────────

describe('activeCart', () => {
  it('user can get existing active cart', async () => {
    // Given an active cart already exists
    const cart = makeCart()
    mockPrisma.cart.findFirst.mockResolvedValue(cart)

    // When querying activeCart
    const result = await execOp(`query { activeCart { id status createdAt } }`)

    // Then the existing cart is returned
    expect(result?.errors).toBeUndefined()
    const found = result?.data?.activeCart as { id: string; status: string; createdAt: string }
    expect(found.status).toBe('active')
    expect(found.id).toBe('cart_1')
    expect(mockPrisma.cart.create).not.toHaveBeenCalled()
  })

  it('user gets a new active cart created if none exists', async () => {
    // Given no active cart exists
    mockPrisma.cart.findFirst.mockResolvedValue(null)
    const newCart = makeCart()
    mockPrisma.cart.create.mockResolvedValue(newCart)

    // When querying activeCart
    const result = await execOp(`query { activeCart { id status createdAt } }`)

    // Then a new active cart is created and returned
    expect(result?.errors).toBeUndefined()
    const found = result?.data?.activeCart as { id: string; status: string; createdAt: string }
    expect(found.status).toBe('active')
    expect(found.id).toBeDefined()
    expect(found.createdAt).toBeDefined()
    expect(mockPrisma.cart.create).toHaveBeenCalledOnce()
  })
})

// ─── addToCart ───────────────────────────────────────────────────────────────

describe('addToCart', () => {
  it('user can add a new item to the cart', async () => {
    // Given no existing cart item for this item
    mockPrisma.cartItem.findFirst.mockResolvedValue(null)
    const cartItem = makeCartItem({ itemId: 'item_milk', quantity: 2 })
    mockPrisma.cartItem.create.mockResolvedValue(cartItem)

    // When adding an item
    const result = await execOp(
      `mutation AddToCart($cartId: ID!, $itemId: ID!, $quantity: Int!) {
        addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id cartId itemId quantity }
      }`,
      { cartId: 'cart_1', itemId: 'item_milk', quantity: 2 },
    )

    // Then the cart item is created
    expect(result?.errors).toBeUndefined()
    const created = result?.data?.addToCart as { id: string; cartId: string; itemId: string; quantity: number }
    expect(created.itemId).toBe('item_milk')
    expect(created.quantity).toBe(2)
    expect(mockPrisma.cartItem.create).toHaveBeenCalledOnce()
  })

  it('user can add the same item again — quantity is incremented (upsert)', async () => {
    // Given cart item already exists with quantity 2
    const existing = makeCartItem({ itemId: 'item_milk', quantity: 2 })
    mockPrisma.cartItem.findFirst.mockResolvedValue(existing)
    const updated = makeCartItem({ itemId: 'item_milk', quantity: 5 })
    mockPrisma.cartItem.update.mockResolvedValue(updated)

    // When adding the same item again with quantity 3
    const result = await execOp(
      `mutation AddToCart($cartId: ID!, $itemId: ID!, $quantity: Int!) {
        addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id quantity }
      }`,
      { cartId: 'cart_1', itemId: 'item_milk', quantity: 3 },
    )

    // Then the quantity is incremented to 5
    expect(result?.errors).toBeUndefined()
    const cartItem = result?.data?.addToCart as { id: string; quantity: number }
    expect(cartItem.quantity).toBe(5)
    expect(mockPrisma.cartItem.create).not.toHaveBeenCalled()
    expect(mockPrisma.cartItem.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: { quantity: 5 },
    })
  })
})

// ─── updateCartItem ──────────────────────────────────────────────────────────

describe('updateCartItem', () => {
  it('user can update the quantity of a cart item', async () => {
    // Given a cart item exists for this user
    const existing = makeCartItem({ quantity: 2 })
    mockPrisma.cartItem.findFirst.mockResolvedValue(existing)
    const updated = makeCartItem({ quantity: 5 })
    mockPrisma.cartItem.update.mockResolvedValue(updated)

    // When updating the quantity
    const result = await execOp(
      `mutation UpdateCartItem($id: ID!, $quantity: Int!) {
        updateCartItem(id: $id, quantity: $quantity) { id quantity }
      }`,
      { id: 'cartitem_1', quantity: 5 },
    )

    // Then the quantity is updated
    expect(result?.errors).toBeUndefined()
    const cartItem = result?.data?.updateCartItem as { id: string; quantity: number }
    expect(cartItem.quantity).toBe(5)
  })

  it('updating a cart item belonging to another user throws NOT_FOUND', async () => {
    // Given no cart item found for user B
    mockPrisma.cartItem.findFirst.mockResolvedValue(null)

    // When user B tries to update it
    const result = await execOp(
      `mutation UpdateCartItem($id: ID!, $quantity: Int!) {
        updateCartItem(id: $id, quantity: $quantity) { id quantity }
      }`,
      { id: 'cartitem_1', quantity: 99 },
      { userId: 'user_B' },
    )

    // Then a NOT_FOUND error is returned
    expect(result?.errors).toBeDefined()
    expect(result?.errors![0].extensions?.code).toBe('NOT_FOUND')
  })
})

// ─── cartItemCountByItem ──────────────────────────────────────────────────────

describe('cartItemCountByItem', () => {
  it('user can get the count of cart items for a given item', async () => {
    // Given prisma returns count 1
    mockPrisma.cartItem.count.mockResolvedValue(1)

    // When querying the count for that item
    const result = await execOp(
      `query CartItemCountByItem($itemId: ID!) { cartItemCountByItem(itemId: $itemId) }`,
      { itemId: 'item_1' },
    )

    // Then the count is 1
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.cartItemCountByItem).toBe(1)
  })

  it('count is scoped to the requesting user — other users\' carts are excluded', async () => {
    // Given prisma returns 0 for user B
    mockPrisma.cartItem.count.mockResolvedValue(0)

    // When user B queries the count
    const result = await execOp(
      `query CartItemCountByItem($itemId: ID!) { cartItemCountByItem(itemId: $itemId) }`,
      { itemId: 'item_1' },
      { userId: 'user_B' },
    )

    // Then the count is 0
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.cartItemCountByItem).toBe(0)
    // Verify it was called with userId: user_B
    expect(mockPrisma.cartItem.count).toHaveBeenCalledWith({ where: { itemId: 'item_1', userId: 'user_B' } })
  })
})

// ─── removeFromCart ──────────────────────────────────────────────────────────

describe('removeFromCart', () => {
  it('user can remove an item from the cart — returns true', async () => {
    // Given a cart item exists for this user
    const existing = makeCartItem()
    mockPrisma.cartItem.findFirst.mockResolvedValue(existing)
    mockPrisma.cartItem.delete.mockResolvedValue(existing)

    // When removing the item
    const result = await execOp(
      `mutation RemoveFromCart($id: ID!) { removeFromCart(id: $id) }`,
      { id: 'cartitem_1' },
    )

    // Then true is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.removeFromCart).toBe(true)
  })

  it('removing a non-existent item returns false', async () => {
    // Given no cart item found for this user
    mockPrisma.cartItem.findFirst.mockResolvedValue(null)

    // When trying to remove it
    const result = await execOp(
      `mutation RemoveFromCart($id: ID!) { removeFromCart(id: $id) }`,
      { id: 'nonexistent_id' },
    )

    // Then false is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.removeFromCart).toBe(false)
  })
})

// ─── checkout ────────────────────────────────────────────────────────────────

describe('checkout', () => {
  it('user can checkout — buying items update packedQuantity and create inventory logs', async () => {
    // Given a cart with a buying item (qty > 0)
    const buyItem = makeCartItem({ itemId: 'item_milk', quantity: 3 })
    mockPrisma.cartItem.findMany.mockResolvedValue([buyItem])
    mockPrisma.item.update.mockResolvedValue({ packedQuantity: 3, unpackedQuantity: 0 })
    mockPrisma.inventoryLog.create.mockResolvedValue({})
    const completedCart = makeCart({ status: 'completed', completedAt: new Date() })
    mockPrisma.cart.update.mockResolvedValue(completedCart)
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 })
    mockPrisma.cart.findUnique.mockResolvedValue(completedCart)

    // When checking out
    const result = await execOp(
      `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id status completedAt } }`,
      { cartId: 'cart_1' },
    )

    // Then the cart is marked completed
    expect(result?.errors).toBeUndefined()
    const updatedCart = result?.data?.checkout as { id: string; status: string; completedAt: string }
    expect(updatedCart.status).toBe('completed')
    expect(updatedCart.completedAt).toBeDefined()

    // And item's packedQuantity was incremented
    expect(mockPrisma.item.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ packedQuantity: { increment: 3 } }) }),
    )

    // And an inventory log was created
    expect(mockPrisma.inventoryLog.create).toHaveBeenCalledOnce()
  })

  it('user can checkout — pinned items (qty === 0) are moved to a new active cart', async () => {
    // Given a cart with a buying item and a pinned item
    const buyItem = makeCartItem({ id: 'ci_buy', itemId: 'item_milk', quantity: 2 })
    const pinnedItem = makeCartItem({ id: 'ci_pin', itemId: 'item_eggs', quantity: 0 })
    mockPrisma.cartItem.findMany.mockResolvedValue([buyItem, pinnedItem])
    mockPrisma.item.update.mockResolvedValue({ packedQuantity: 2, unpackedQuantity: 0 })
    mockPrisma.inventoryLog.create.mockResolvedValue({})
    const completedCart = makeCart({ status: 'completed', completedAt: new Date() })
    mockPrisma.cart.update.mockResolvedValue(completedCart)
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 2 })
    // No existing active cart found — a new one is created
    mockPrisma.cart.findFirst.mockResolvedValue(null)
    const newCart = makeCart({ id: 'cart_new', status: 'active' })
    mockPrisma.cart.create.mockResolvedValue(newCart)
    mockPrisma.cartItem.create.mockResolvedValue({})
    mockPrisma.cart.findUnique.mockResolvedValue(completedCart)

    // When checking out
    const result = await execOp(
      `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id status } }`,
      { cartId: 'cart_1' },
    )

    // Then a new active cart is created and pinned item is moved
    expect(result?.errors).toBeUndefined()
    expect(mockPrisma.cart.create).toHaveBeenCalledWith({ data: { userId: 'user_test123', status: 'active' } })
    expect(mockPrisma.cartItem.create).toHaveBeenCalledWith({
      data: { cartId: 'cart_new', itemId: 'item_eggs', quantity: 0, userId: 'user_test123' },
    })
  })

  it('user can checkout — old cart items are deleted after checkout', async () => {
    // Given a cart with a buying item
    const buyItem = makeCartItem({ quantity: 1 })
    mockPrisma.cartItem.findMany.mockResolvedValue([buyItem])
    mockPrisma.item.update.mockResolvedValue({ packedQuantity: 1, unpackedQuantity: 0 })
    mockPrisma.inventoryLog.create.mockResolvedValue({})
    const completedCart = makeCart({ status: 'completed', completedAt: new Date() })
    mockPrisma.cart.update.mockResolvedValue(completedCart)
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 })
    mockPrisma.cart.findUnique.mockResolvedValue(completedCart)

    // When checking out
    await execOp(
      `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id } }`,
      { cartId: 'cart_1' },
    )

    // Then all original cart items are removed
    expect(mockPrisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart_1', userId: 'user_test123' } })
  })
})

// ─── abandonCart ─────────────────────────────────────────────────────────────

describe('abandonCart', () => {
  it('user can abandon a cart — cart status becomes abandoned and items are deleted', async () => {
    // Given a cart exists for this user
    const cart = makeCart()
    mockPrisma.cart.findFirst.mockResolvedValue(cart)
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 2 })
    const abandonedCart = makeCart({ status: 'abandoned' })
    mockPrisma.cart.update.mockResolvedValue(abandonedCart)

    // When abandoning the cart
    const result = await execOp(
      `mutation AbandonCart($cartId: ID!) { abandonCart(cartId: $cartId) { id status } }`,
      { cartId: 'cart_1' },
    )

    // Then the cart is marked as abandoned
    expect(result?.errors).toBeUndefined()
    const abandoned = result?.data?.abandonCart as { id: string; status: string }
    expect(abandoned.status).toBe('abandoned')

    // And all cart items are deleted
    expect(mockPrisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart_1', userId: 'user_test123' } })
  })
})

// ─── Cross-user isolation ─────────────────────────────────────────────────────

describe('cross-user isolation', () => {
  it('user cannot see another user\'s cart items', async () => {
    // Given prisma returns empty list for user B
    mockPrisma.cartItem.findMany.mockResolvedValue([])

    // When user B queries cart items
    const result = await execOp(
      `query CartItems($cartId: ID!) { cartItems(cartId: $cartId) { id } }`,
      { cartId: 'cart_1' },
      { userId: 'user_B' },
    )

    // Then no items are returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.cartItems).toHaveLength(0)
    expect(mockPrisma.cartItem.findMany).toHaveBeenCalledWith({ where: { cartId: 'cart_1', userId: 'user_B' } })
  })

  it('user cannot remove another user\'s cart item', async () => {
    // Given no cart item found for user B
    mockPrisma.cartItem.findFirst.mockResolvedValue(null)

    // When user B tries to remove that cart item
    const result = await execOp(
      `mutation RemoveFromCart($id: ID!) { removeFromCart(id: $id) }`,
      { id: 'cartitem_1' },
      { userId: 'user_B' },
    )

    // Then false is returned (item not found for user B)
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.removeFromCart).toBe(false)
  })

  it('user cannot abandon another user\'s cart', async () => {
    // Given no cart found for user B
    mockPrisma.cart.findFirst.mockResolvedValue(null)

    // When user B tries to abandon it
    const result = await execOp(
      `mutation AbandonCart($cartId: ID!) { abandonCart(cartId: $cartId) { id } }`,
      { cartId: 'cart_1' },
      { userId: 'user_B' },
    )

    // Then an error is returned
    expect(result?.errors).toBeDefined()
    expect(result?.errors![0].message).toContain('Cart not found')
  })
})

// ─── Legacy null fields ───────────────────────────────────────────────────────

describe('legacy null fields', () => {
  it('shoppingCarts returns epoch string for records where createdAt is null', async () => {
    // Given a cart with null createdAt (legacy record)
    const legacyCart = { ...makeCart({ status: 'completed' }), createdAt: null }
    mockPrisma.cart.findMany.mockResolvedValue([legacyCart])

    // When querying shoppingCarts
    const result = await execOp(`query { shoppingCarts { id status createdAt } }`)

    // Then createdAt is the epoch string, not null (GraphQL non-nullable String! contract upheld)
    expect(result?.errors).toBeUndefined()
    const carts = result?.data?.shoppingCarts as { id: string; status: string; createdAt: string }[]
    expect(carts[0].createdAt).toBe(new Date(0).toISOString())
  })
})
