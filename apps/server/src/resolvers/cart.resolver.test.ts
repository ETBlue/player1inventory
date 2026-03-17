import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import { CartModel, CartItemModel } from '../models/Cart.model.js'
import { ItemModel } from '../models/Item.model.js'
import { InventoryLogModel } from '../models/InventoryLog.model.js'
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
  await CartModel.deleteMany({})
  await CartItemModel.deleteMany({})
  await ItemModel.deleteMany({})
  await InventoryLogModel.deleteMany({})
})

const ctx: Context = { userId: 'user_test123' }

// ─── helpers ────────────────────────────────────────────────────────────────

async function getActiveCart(ctxOverride = ctx) {
  const r = await server.executeOperation(
    { query: `query { activeCart { id status createdAt } }` },
    { contextValue: ctxOverride },
  )
  return (r.body.kind === 'single' ? r.body.singleResult.data?.activeCart : null) as {
    id: string
    status: string
    createdAt: string
  }
}

async function addToCart(cartId: string, itemId: string, quantity: number, ctxOverride = ctx) {
  const r = await server.executeOperation(
    {
      query: `mutation AddToCart($cartId: ID!, $itemId: ID!, $quantity: Int!) {
        addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id cartId itemId quantity }
      }`,
      variables: { cartId, itemId, quantity },
    },
    { contextValue: ctxOverride },
  )
  return (r.body.kind === 'single' ? r.body.singleResult.data?.addToCart : null) as {
    id: string
    cartId: string
    itemId: string
    quantity: number
  }
}

async function createItem(name = 'Milk') {
  return ItemModel.create({
    name,
    tagIds: [],
    targetUnit: 'package',
    targetQuantity: 5,
    refillThreshold: 2,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    userId: 'user_test123',
  })
}

// ─── activeCart ──────────────────────────────────────────────────────────────

describe('activeCart', () => {
  it('user can get existing active cart', async () => {
    // Given an active cart already exists
    await CartModel.create({ userId: 'user_test123', status: 'active' })

    // When querying activeCart
    const response = await server.executeOperation(
      { query: `query { activeCart { id status } }` },
      { contextValue: ctx },
    )

    // Then the existing cart is returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const cart = response.body.singleResult.data?.activeCart as { id: string; status: string }
      expect(cart.status).toBe('active')
      expect(cart.id).toBeDefined()
      const total = await CartModel.countDocuments({ userId: 'user_test123', status: 'active' })
      expect(total).toBe(1)
    }
  })

  it('user gets a new active cart created if none exists', async () => {
    // Given no active cart exists

    // When querying activeCart
    const response = await server.executeOperation(
      { query: `query { activeCart { id status createdAt } }` },
      { contextValue: ctx },
    )

    // Then a new active cart is created and returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const cart = response.body.singleResult.data?.activeCart as { id: string; status: string; createdAt: string }
      expect(cart.status).toBe('active')
      expect(cart.id).toBeDefined()
      expect(cart.createdAt).toBeDefined()
      const total = await CartModel.countDocuments({ userId: 'user_test123', status: 'active' })
      expect(total).toBe(1)
    }
  })
})

// ─── addToCart ───────────────────────────────────────────────────────────────

describe('addToCart', () => {
  it('user can add a new item to the cart', async () => {
    // Given an active cart
    const cart = await getActiveCart()

    // When adding an item
    const response = await server.executeOperation(
      {
        query: `mutation AddToCart($cartId: ID!, $itemId: ID!, $quantity: Int!) {
          addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id cartId itemId quantity }
        }`,
        variables: { cartId: cart.id, itemId: 'item_milk', quantity: 2 },
      },
      { contextValue: ctx },
    )

    // Then the cart item is created
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const cartItem = response.body.singleResult.data?.addToCart as {
        id: string
        cartId: string
        itemId: string
        quantity: number
      }
      expect(cartItem.cartId).toBe(cart.id)
      expect(cartItem.itemId).toBe('item_milk')
      expect(cartItem.quantity).toBe(2)
    }
  })

  it('user can add the same item again — quantity is incremented (upsert)', async () => {
    // Given a cart with an item already added
    const cart = await getActiveCart()
    await addToCart(cart.id, 'item_milk', 2)

    // When adding the same item again
    const response = await server.executeOperation(
      {
        query: `mutation AddToCart($cartId: ID!, $itemId: ID!, $quantity: Int!) {
          addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id quantity }
        }`,
        variables: { cartId: cart.id, itemId: 'item_milk', quantity: 3 },
      },
      { contextValue: ctx },
    )

    // Then the quantity is incremented on the existing item (not a new item created)
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const cartItem = response.body.singleResult.data?.addToCart as { id: string; quantity: number }
      expect(cartItem.quantity).toBe(5)
      const total = await CartItemModel.countDocuments({ cartId: cart.id })
      expect(total).toBe(1)
    }
  })
})

// ─── removeFromCart ──────────────────────────────────────────────────────────

describe('removeFromCart', () => {
  it('user can remove an item from the cart — returns true', async () => {
    // Given a cart with an item
    const cart = await getActiveCart()
    const cartItem = await addToCart(cart.id, 'item_milk', 1)

    // When removing the item
    const response = await server.executeOperation(
      {
        query: `mutation RemoveFromCart($id: ID!) { removeFromCart(id: $id) }`,
        variables: { id: cartItem.id },
      },
      { contextValue: ctx },
    )

    // Then true is returned and item is gone
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.removeFromCart).toBe(true)
      const remaining = await CartItemModel.countDocuments({ _id: cartItem.id })
      expect(remaining).toBe(0)
    }
  })

  it('removing a non-existent item returns false', async () => {
    // Given a cart item id that does not exist
    const nonExistentId = new mongoose.Types.ObjectId().toString()

    // When trying to remove it
    const response = await server.executeOperation(
      {
        query: `mutation RemoveFromCart($id: ID!) { removeFromCart(id: $id) }`,
        variables: { id: nonExistentId },
      },
      { contextValue: ctx },
    )

    // Then false is returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.removeFromCart).toBe(false)
    }
  })
})

// ─── checkout ────────────────────────────────────────────────────────────────

describe('checkout', () => {
  it('user can checkout — buying items update packedQuantity and create inventory logs', async () => {
    // Given a cart with a buying item (qty > 0)
    const cart = await getActiveCart()
    const item = await createItem('Milk')
    await addToCart(cart.id, item._id.toString(), 3)

    // When checking out
    const response = await server.executeOperation(
      {
        query: `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id status completedAt } }`,
        variables: { cartId: cart.id },
      },
      { contextValue: ctx },
    )

    // Then the cart is marked completed
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const updatedCart = response.body.singleResult.data?.checkout as {
        id: string
        status: string
        completedAt: string
      }
      expect(updatedCart.status).toBe('completed')
      expect(updatedCart.completedAt).toBeDefined()
    }

    // And the item's packedQuantity is incremented
    const updatedItem = await ItemModel.findById(item._id)
    expect(updatedItem?.packedQuantity).toBe(3)

    // And an InventoryLog entry is created
    const log = await InventoryLogModel.findOne({ itemId: item._id.toString() })
    expect(log).not.toBeNull()
    expect(log?.delta).toBe(3)
  })

  it('user can checkout — pinned items (qty === 0) are moved to a new active cart', async () => {
    // Given a cart with a pinned item (qty === 0) and a buying item (qty > 0)
    const cart = await getActiveCart()
    const buyItem = await createItem('Milk')
    const pinnedItem = await createItem('Eggs')
    await addToCart(cart.id, buyItem._id.toString(), 2)
    // Pin the second item by adding then setting qty to 0 directly (addToCart requires qty > 0 to be meaningful)
    await CartItemModel.create({ cartId: cart.id, itemId: pinnedItem._id.toString(), quantity: 0, userId: 'user_test123' })

    // When checking out
    await server.executeOperation(
      {
        query: `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id status } }`,
        variables: { cartId: cart.id },
      },
      { contextValue: ctx },
    )

    // Then a new active cart is created
    const newActiveCart = await CartModel.findOne({ userId: 'user_test123', status: 'active' })
    expect(newActiveCart).not.toBeNull()

    // And the pinned item is in the new cart
    const movedItem = await CartItemModel.findOne({
      cartId: newActiveCart!._id.toString(),
      itemId: pinnedItem._id.toString(),
    })
    expect(movedItem).not.toBeNull()
    expect(movedItem?.quantity).toBe(0)
  })

  it('user can checkout — old cart items are deleted after checkout', async () => {
    // Given a cart with items
    const cart = await getActiveCart()
    const item = await createItem()
    await addToCart(cart.id, item._id.toString(), 1)

    // When checking out
    await server.executeOperation(
      {
        query: `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id } }`,
        variables: { cartId: cart.id },
      },
      { contextValue: ctx },
    )

    // Then all original cart items are removed
    const remaining = await CartItemModel.countDocuments({ cartId: cart.id })
    expect(remaining).toBe(0)
  })
})

// ─── abandonCart ─────────────────────────────────────────────────────────────

describe('abandonCart', () => {
  it('user can abandon a cart — cart status becomes abandoned and items are deleted', async () => {
    // Given a cart with items
    const cart = await getActiveCart()
    await addToCart(cart.id, 'item_milk', 2)
    await addToCart(cart.id, 'item_eggs', 1)

    // When abandoning the cart
    const response = await server.executeOperation(
      {
        query: `mutation AbandonCart($cartId: ID!) { abandonCart(cartId: $cartId) { id status } }`,
        variables: { cartId: cart.id },
      },
      { contextValue: ctx },
    )

    // Then the cart is marked as abandoned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const abandonedCart = response.body.singleResult.data?.abandonCart as { id: string; status: string }
      expect(abandonedCart.status).toBe('abandoned')
    }

    // And all cart items are deleted
    const remaining = await CartItemModel.countDocuments({ cartId: cart.id })
    expect(remaining).toBe(0)
  })
})

// ─── Cross-user isolation ─────────────────────────────────────────────────────

describe('cross-user isolation', () => {
  it('user cannot see another user\'s cart items', async () => {
    // Given user A has an active cart with items
    const cartA = await getActiveCart({ userId: 'user_A' })
    await addToCart(cartA.id, 'item_milk', 2, { userId: 'user_A' })

    // When user B queries cart items for user A's cart
    const response = await server.executeOperation(
      {
        query: `query CartItems($cartId: ID!) { cartItems(cartId: $cartId) { id } }`,
        variables: { cartId: cartA.id },
      },
      { contextValue: { userId: 'user_B' } },
    )

    // Then no items are returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.cartItems).toHaveLength(0)
    }
  })

  it('user cannot remove another user\'s cart item', async () => {
    // Given user A has an item in their cart
    const cartA = await getActiveCart({ userId: 'user_A' })
    const cartItem = await addToCart(cartA.id, 'item_milk', 1, { userId: 'user_A' })

    // When user B tries to remove that cart item
    const response = await server.executeOperation(
      {
        query: `mutation RemoveFromCart($id: ID!) { removeFromCart(id: $id) }`,
        variables: { id: cartItem.id },
      },
      { contextValue: { userId: 'user_B' } },
    )

    // Then false is returned (item not found for user B)
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.removeFromCart).toBe(false)
    }

    // And the item still exists for user A
    const stillExists = await CartItemModel.findById(cartItem.id)
    expect(stillExists).not.toBeNull()
  })

  it('user cannot abandon another user\'s cart', async () => {
    // Given user A has an active cart
    const cartA = await getActiveCart({ userId: 'user_A' })

    // When user B tries to abandon it
    const response = await server.executeOperation(
      {
        query: `mutation AbandonCart($cartId: ID!) { abandonCart(cartId: $cartId) { id } }`,
        variables: { cartId: cartA.id },
      },
      { contextValue: { userId: 'user_B' } },
    )

    // Then an error is returned (cart not found for user B)
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeDefined()
      expect(response.body.singleResult.errors![0].message).toContain('Cart not found')
    }

    // And the original cart is still active
    const cart = await CartModel.findById(cartA.id)
    expect(cart?.status).toBe('active')
  })
})
