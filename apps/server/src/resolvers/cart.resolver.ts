import { GraphQLError } from 'graphql'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Cart, CartItem, Resolvers } from '../generated/graphql.js'

export const cartResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Cart' | 'CartItem'> = {
  Query: {
    activeCart: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      let cart = await prisma.cart.findFirst({ where: { userId, status: 'active' } })
      if (!cart) {
        cart = await prisma.cart.create({ data: { userId, status: 'active' } })
      }
      return cart as unknown as Cart
    },

    cartItems: async (_, { cartId }, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.cartItem.findMany({ where: { cartId, userId } }) as unknown as Promise<CartItem[]>
    },

    cartItemCountByItem: async (_, { itemId }, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.cartItem.count({ where: { itemId, userId } })
    },

    shoppingCarts: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.cart.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }) as unknown as Promise<Cart[]>
    },

    allCartItems: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.cartItem.findMany({ where: { userId } }) as unknown as Promise<CartItem[]>
    },
  },

  Mutation: {
    addToCart: async (_, { cartId, itemId, quantity }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await prisma.cartItem.findFirst({ where: { cartId, itemId, userId } })
      if (existing) {
        return prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + quantity },
        }) as unknown as Promise<CartItem>
      }
      return prisma.cartItem.create({
        data: { cartId, itemId, quantity, userId },
      }) as unknown as Promise<CartItem>
    },

    updateCartItem: async (_, { id, quantity }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await prisma.cartItem.findFirst({ where: { id, userId } })
      if (!existing) throw new GraphQLError('CartItem not found', { extensions: { code: 'NOT_FOUND' } })
      return prisma.cartItem.update({
        where: { id },
        data: { quantity },
      }) as unknown as Promise<CartItem>
    },

    removeFromCart: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await prisma.cartItem.findFirst({ where: { id, userId } })
      if (!existing) return false
      await prisma.cartItem.delete({ where: { id } })
      return true
    },

    checkout: async (_, { cartId, note }, ctx) => {
      const userId = requireAuth(ctx)
      const cartItems = await prisma.cartItem.findMany({ where: { cartId, userId } })
      const pinnedItems = cartItems.filter(ci => ci.quantity === 0)
      const buyingItems = cartItems.filter(ci => ci.quantity > 0)

      const now = new Date()
      for (const ci of buyingItems) {
        const updatedItem = await prisma.item.update({
          where: { id: ci.itemId },
          data: { packedQuantity: { increment: ci.quantity }, updatedAt: now },
        })
        const finalQuantity = updatedItem.packedQuantity + updatedItem.unpackedQuantity

        await prisma.inventoryLog.create({
          data: {
            itemId: ci.itemId,
            delta: ci.quantity,
            quantity: finalQuantity,
            occurredAt: now,
            userId,
            ...(note ? { note } : {}),
          },
        })
      }

      await prisma.cart.update({
        where: { id: cartId },
        data: { status: 'completed', completedAt: now },
      })
      await prisma.cartItem.deleteMany({ where: { cartId, userId } })

      // Move pinned items to the new active cart
      if (pinnedItems.length > 0) {
        let newCart = await prisma.cart.findFirst({ where: { userId, status: 'active' } })
        if (!newCart) newCart = await prisma.cart.create({ data: { userId, status: 'active' } })
        for (const ci of pinnedItems) {
          await prisma.cartItem.create({ data: { cartId: newCart.id, itemId: ci.itemId, quantity: 0, userId } })
        }
      }

      const updatedCart = await prisma.cart.findUnique({ where: { id: cartId } })
      if (!updatedCart) throw new GraphQLError('Cart not found after checkout', { extensions: { code: 'NOT_FOUND' } })
      return updatedCart as unknown as Cart
    },

    abandonCart: async (_, { cartId }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await prisma.cart.findFirst({ where: { id: cartId, userId } })
      if (!existing) throw new GraphQLError('Cart not found', { extensions: { code: 'NOT_FOUND' } })
      await prisma.cartItem.deleteMany({ where: { cartId, userId } })
      const cart = await prisma.cart.update({
        where: { id: cartId },
        data: { status: 'abandoned' },
      })
      return cart as unknown as Cart
    },
  },

  Cart: {
    // Legacy MongoDB documents may have null for date fields — fallback to epoch string
    // to satisfy the non-nullable String! contract in the GraphQL schema.
    createdAt: (cart) => {
      const d = (cart as unknown as { createdAt: Date | null }).createdAt
      return d != null ? d.toISOString() : new Date(0).toISOString()
    },
    completedAt: (cart) => {
      const c = cart as unknown as { completedAt?: Date | null }
      return c.completedAt ? c.completedAt.toISOString() : null
    },
  },

  CartItem: {},
}
