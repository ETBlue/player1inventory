import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import { type LocationRole, requireLocationRole } from '../lib/authz.js'
import { cartIdFor, parseCartId } from '../lib/cartId.js'
import { ensureDefaultLocation } from '../lib/defaultLocation.js'
import { prisma } from '../lib/prisma.js'
import { mirrorStock } from '../lib/stockDualWrite.js'
import { type Context, requireAuth } from '../context.js'
import type { Cart, CartItem, Resolvers } from '../generated/graphql.js'

/**
 * Read the location out of a cart id, then check the caller may use it.
 *
 * Since PR 3b every `Cart.id` is `${locationId}:${vendorId | 'no-vendor'}`
 * (lib/cartId.ts), so a cart id that arrives from the client carries a location
 * id that also arrives from the client. It goes through `requireLocationRole`
 * before it reaches any query — that call is the one authorization seam for
 * location data (lib/authz.ts). Do NOT replace it with a
 * `row.userId === ctx.userId` test: root CLAUDE.md forbids that, because it
 * denies a legitimate `member` of a shared location.
 *
 * A pre-PR-3b cart id has no ':' at all, so it parses as a location id that no
 * `Location` row matches and this throws FORBIDDEN. That is the intended
 * behaviour for an old client: fail loudly rather than quietly read or write
 * some other location's cart.
 */
async function requireCartLocation(
  ctx: Context,
  cartId: string,
  role: LocationRole,
): Promise<string> {
  const { locationId } = parseCartId(cartId)
  await requireLocationRole(ctx, locationId, role)
  return locationId
}

/**
 * `userId` in the `where` clauses below is a query SCOPE, not an authorization
 * decision — the same distinction lib/stockDualWrite.ts records for
 * `mirrorItemStockToItem`. Authorization is `requireCartLocation` above.
 */
export const cartResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Cart'> = {
  Query: {
    vendorCart: async (_, { vendorId = null, locationId = null }, ctx) => {
      const userId = requireAuth(ctx)

      // `locationId` is nullable for one PR-3b task only — see the doc string
      // on this field in src/schema/cart.graphql. Task 4 passes it from the web
      // client and tightens the schema to `ID!`.
      const resolvedLocationId = locationId ?? (await ensureDefaultLocation(userId))

      // `member`, not `viewer`: this query CREATES the cart when it is missing.
      await requireLocationRole(ctx, resolvedLocationId, 'member')

      const cartId = cartIdFor(resolvedLocationId, vendorId ?? null)
      let cart = await prisma.cart.findUnique({ where: { id: cartId } })
      if (!cart) {
        cart = await prisma.cart.create({
          data: { id: cartId, userId, locationId: resolvedLocationId },
        })
      }
      return cart as unknown as Cart
    },

    // Whole-account on purpose, like `inventoryLogs`. The shopping page reads
    // it to show every vendor's "last purchased" and the export path needs
    // every location's carts or the backup loses rows. Each row's location is
    // recoverable from its id.
    allCarts: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.cart.findMany({
        where: { userId },
        orderBy: [{ id: 'asc' }],
      }) as unknown as Promise<Cart[]>
    },

    cartItems: async (_, { cartId }, ctx) => {
      const userId = requireAuth(ctx)
      await requireCartLocation(ctx, cartId, 'viewer')
      return prisma.cartItem.findMany({ where: { cartId, userId } }) as unknown as Promise<CartItem[]>
    },

    // Whole-account, across every location: it answers "is this item in any
    // cart", which the item list shows regardless of the active location.
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
      await requireCartLocation(ctx, cartId, 'member')
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

    // `id` here is a CartItem id, not a cart id, so the location has to be read
    // off the row's own `cartId` after it is found.
    updateCartItem: async (_, { id, quantity }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await prisma.cartItem.findFirst({ where: { id, userId } })
      if (!existing) throw new GraphQLError('CartItem not found', { extensions: { code: 'NOT_FOUND' } })
      await requireCartLocation(ctx, existing.cartId, 'member')
      return prisma.cartItem.update({
        where: { id },
        data: { quantity },
      }) as unknown as Promise<CartItem>
    },

    removeFromCart: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await prisma.cartItem.findFirst({ where: { id, userId } })
      if (!existing) return false
      await requireCartLocation(ctx, existing.cartId, 'member')
      await prisma.cartItem.delete({ where: { id } })
      return true
    },

    checkout: async (_, { cartId, note, logKey, logParams }, ctx) => {
      const userId = requireAuth(ctx)
      // The location the CART names, since PR 3b Task 3. `requireCartLocation`
      // parses it out of the cart id and authorizes it in one step, so the
      // value below has already been through `requireLocationRole`.
      //
      // It used to be the caller's DEFAULT location, which meant a checkout
      // made while viewing the Garage moved the Kitchen's stock and wrote an
      // inventory log against the Kitchen. That was the limitation PR 3a
      // shipped; Task 1's re-key of `Cart.id` is what made the real location
      // reachable here.
      const cartLocationId = await requireCartLocation(ctx, cartId, 'member')
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

        // DUAL-WRITE, REMOVED IN PR 5 (lib/stockDualWrite.ts). The same
        // increment against the cart location's stock row. `increment` rather
        // than the item's new total, so two concurrent checkouts of one item
        // cannot lose an increment to a read-modify-write race.
        await mirrorStock(ci.itemId, cartLocationId, {
          packedQuantity: { increment: ci.quantity },
        })

        await prisma.inventoryLog.create({
          data: {
            itemId: ci.itemId,
            delta: ci.quantity,
            quantity: finalQuantity,
            occurredAt: now,
            userId,
            // The cart's own location, the same one the stock mirror above
            // wrote. A log row and the stock move it explains must never name
            // different locations.
            locationId: cartLocationId,
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

    /**
     * The cloud half of local mode's `bootstrapCarts`
     * (apps/web/src/db/operations.ts). See the doc string on this field in
     * src/schema/cart.graphql for why it is a mutation and not part of the
     * `locations` query.
     *
     * `createVendor` writes one cart, at the location the caller was looking
     * at. Every OTHER location is missing that vendor's cart until this runs
     * for it. The web client calls it when the active location changes, which
     * is exactly when local mode calls its own version.
     */
    bootstrapCarts: async (_, { locationId }, ctx) => {
      const userId = requireAuth(ctx)
      // `member`, not `viewer`: this creates rows.
      await requireLocationRole(ctx, locationId, 'member')

      const vendors = await prisma.vendor.findMany({
        where: { userId },
        select: { id: true },
      })
      // The no-vendor cart first, then one per vendor — the same set local
      // mode's `bootstrapCarts` writes.
      const wantedIds = [
        cartIdFor(locationId, null),
        ...vendors.map((v) => cartIdFor(locationId, v.id)),
      ]

      const present = await prisma.cart.findMany({
        where: { id: { in: wantedIds } },
        select: { id: true },
      })
      const presentIds = new Set(present.map((c) => c.id))
      const missing = wantedIds.filter((id) => !presentIds.has(id))

      if (missing.length > 0) {
        // `skipDuplicates`, because the read above and this write are not one
        // transaction: `vendorCart` creates a missing cart too, so a query
        // running in parallel can insert one of these ids between the two
        // statements. Without the flag that race raises P2002 and the whole
        // bootstrap fails, taking the carts that were fine with it.
        await prisma.cart.createMany({
          data: missing.map((id) => ({ id, userId, locationId })),
          skipDuplicates: true,
        })
      }

      // Scoped by `locationId`, so the caller gets this location's carts only —
      // `allCarts` is the whole-account read. `userId` here is a query SCOPE
      // (see the comment above this object), not the authorization decision;
      // that was `requireLocationRole` at the top.
      return prisma.cart.findMany({
        where: { userId, locationId },
        orderBy: [{ id: 'asc' }],
      }) as unknown as Promise<Cart[]>
    },

    abandonCart: async (_, { cartId }, ctx) => {
      const userId = requireAuth(ctx)
      await requireCartLocation(ctx, cartId, 'member')
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
