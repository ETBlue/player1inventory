import { GraphQLError } from 'graphql'
import { CartModel, CartItemModel } from '../models/Cart.model.js'
import { ItemModel } from '../models/Item.model.js'
import { InventoryLogModel } from '../models/InventoryLog.model.js'
import { requireAuth } from '../context.js'
import type { Resolvers } from '../generated/graphql.js'

export const cartResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Cart' | 'CartItem'> = {
  Query: {
    activeCart: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      let cart = await CartModel.findOne({ userId, status: 'active' })
      if (!cart) {
        cart = await CartModel.create({ userId, status: 'active' })
      }
      return { ...cart.toObject(), id: cart._id.toString() }
    },

    cartItems: async (_, { cartId }, ctx) => {
      const userId = requireAuth(ctx)
      const items = await CartItemModel.find({ cartId, userId })
      return items.map(i => ({ ...i.toObject(), id: i._id.toString() }))
    },

    cartItemCountByItem: async (_, { itemId }, ctx) => {
      const userId = requireAuth(ctx)
      return CartItemModel.countDocuments({ itemId, userId })
    },
  },

  Mutation: {
    addToCart: async (_, { cartId, itemId, quantity }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await CartItemModel.findOne({ cartId, itemId, userId })
      if (existing) {
        existing.quantity += quantity
        await existing.save()
        return { ...existing.toObject(), id: existing._id.toString() }
      }
      const item = await CartItemModel.create({ cartId, itemId, quantity, userId })
      return { ...item.toObject(), id: item._id.toString() }
    },

    updateCartItem: async (_, { id, quantity }, ctx) => {
      const userId = requireAuth(ctx)
      const item = await CartItemModel.findOneAndUpdate(
        { _id: id, userId },
        { quantity },
        { new: true },
      )
      if (!item) throw new GraphQLError('CartItem not found', { extensions: { code: 'NOT_FOUND' } })
      return { ...item.toObject(), id: item._id.toString() }
    },

    removeFromCart: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      await CartItemModel.deleteOne({ _id: id, userId })
      return true
    },

    checkout: async (_, { cartId }, ctx) => {
      const userId = requireAuth(ctx)
      const cartItems = await CartItemModel.find({ cartId, userId })
      const pinnedItems = cartItems.filter(ci => ci.quantity === 0)
      const buyingItems = cartItems.filter(ci => ci.quantity > 0)

      const now = new Date()
      for (const ci of buyingItems) {
        await ItemModel.findOneAndUpdate(
          { _id: ci.itemId, userId },
          { $inc: { packedQuantity: ci.quantity }, updatedAt: now },
        )
        await InventoryLogModel.create({
          itemId: ci.itemId,
          delta: ci.quantity,
          loggedAt: now,
          userId,
        })
      }

      await CartModel.findOneAndUpdate(
        { _id: cartId, userId },
        { status: 'completed', completedAt: now },
      )
      await CartItemModel.deleteMany({ cartId, userId })

      // Move pinned items to the new active cart
      if (pinnedItems.length > 0) {
        let newCart = await CartModel.findOne({ userId, status: 'active' })
        if (!newCart) newCart = await CartModel.create({ userId, status: 'active' })
        for (const ci of pinnedItems) {
          await CartItemModel.create({ cartId: newCart._id.toString(), itemId: ci.itemId, quantity: 0, userId })
        }
      }

      const updatedCart = await CartModel.findById(cartId)
      if (!updatedCart) throw new GraphQLError('Cart not found after checkout', { extensions: { code: 'NOT_FOUND' } })
      return { ...updatedCart.toObject(), id: updatedCart._id.toString() }
    },

    abandonCart: async (_, { cartId }, ctx) => {
      const userId = requireAuth(ctx)
      await CartItemModel.deleteMany({ cartId, userId })
      const cart = await CartModel.findOneAndUpdate(
        { _id: cartId, userId },
        { status: 'abandoned' },
        { new: true },
      )
      if (!cart) throw new GraphQLError('Cart not found', { extensions: { code: 'NOT_FOUND' } })
      return { ...cart.toObject(), id: cart._id.toString() }
    },
  },

  Cart: {
    id: (cart) => (cart as unknown as { _id: { toString(): string } })._id.toString(),
    createdAt: (cart) => (cart as unknown as { createdAt: Date }).createdAt.toISOString(),
    completedAt: (cart) => {
      const c = cart as unknown as { completedAt?: Date }
      return c.completedAt ? c.completedAt.toISOString() : null
    },
  },

  CartItem: {
    id: (cartItem) => (cartItem as unknown as { _id: { toString(): string } })._id.toString(),
  },
}
