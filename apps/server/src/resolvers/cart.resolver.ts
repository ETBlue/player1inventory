import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Cart, CartItem, Resolvers } from '../generated/graphql.js'

export const cartResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Cart'> = {
  Query: {
    vendorCart: async (_, { vendorId = null }, ctx) => {
      const userId = requireAuth(ctx)
      const cartId = vendorId ?? 'no-vendor'
      let cart = await prisma.cart.findUnique({ where: { id: cartId } })
      if (!cart) {
        cart = await prisma.cart.create({ data: { id: cartId, userId } })
      }
      return cart as unknown as Cart
    },

    allCarts: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.cart.findMany({
        where: { userId },
        orderBy: [{ id: 'asc' }],
      }) as unknown as Promise<Cart[]>
    },

    cartItems: async (_, { cartId }, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.cartItem.findMany({ where: { cartId, userId } }) as unknown as Promise<CartItem[]>
    },

    cartItemCountByItem: async (_, { itemId }, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.cartItem.count({ where: { itemId, userId } })
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

    checkout: async (_, { cartId, note, logKey, logParams }, ctx) => {
      const userId = requireAuth(ctx)
      const cartItems = await prisma.cartItem.findMany({ where: { cartId, userId } })
      const buyingItems = cartItems.filter(ci => ci.quantity > 0)
      // Pinned items (quantity === 0) stay in the permanent cart — no migration needed

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
            ...(logKey ? { logKey } : {}),
            ...(logParams ? { logParams: logParams as Prisma.InputJsonValue } : {}),
          },
        })
      }

      // Update lastPurchasedAt and delete only active items
      const updatedCart = await prisma.cart.update({
        where: { id: cartId },
        data: { lastPurchasedAt: now },
      })
      await prisma.cartItem.deleteMany({
        where: { cartId, userId, quantity: { gt: 0 } },
      })

      return updatedCart as unknown as Cart
    },

    abandonCart: async (_, { cartId }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await prisma.cart.findFirst({ where: { id: cartId, userId } })
      if (!existing) throw new GraphQLError('Cart not found', { extensions: { code: 'NOT_FOUND' } })
      // Delete ALL items (including pinned)
      await prisma.cartItem.deleteMany({ where: { cartId, userId } })
      return existing as unknown as Cart
    },
  },

  // Every cart resolver above returns the raw Prisma row via `as unknown as
  // Cart`, so a JS `Date` sits in the schema's `String` slot. Without this
  // serializer graphql-js falls back to `GraphQLString.serialize`, which calls
  // `Date.prototype.valueOf()` *before* `toJSON()` and ships epoch millis
  // ("1787827334343") instead of ISO 8601 — a string `new Date()` turns into an
  // Invalid Date on the client, silently killing the shopping page's
  // "last purchased" sort. Mirrors Recipe.lastCookedAt / InventoryLog.occurredAt.
  Cart: {
    lastPurchasedAt: (cart) => {
      const d = (cart as unknown as { lastPurchasedAt: Date | string | null }).lastPurchasedAt
      if (d == null) return null
      return d instanceof Date ? d.toISOString() : d
    },
  },
}
