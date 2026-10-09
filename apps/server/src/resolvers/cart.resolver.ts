import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import { type LocationRole, requireLocationRole } from '../lib/authz.js'
import { cartIdFor, parseCartId } from '../lib/cartId.js'
import { isBeingBought } from '../lib/checkout.js'
import { prisma } from '../lib/prisma.js'
import { ensureStockAtLocation, writeStock } from '../lib/itemStockWrite.js'
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
 * decision. Root CLAUDE.md forbids `row.userId === ctx.userId` as a GUARD; it
 * does not forbid `userId` inside a `where` clause, which only narrows what
 * the query can match. Authorization is `requireCartLocation` above.
 *
 * This note used to cite `mirrorItemStockToItem` in lib/stockDualWrite.ts as
 * the other place the distinction was written down. Cloud locations PR 5
 * deleted that module; the rule did not change.
 */
export const cartResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Cart'> = {
  Query: {
    // `locationId` is REQUIRED since PR 3b Task 4. There is no default-location
    // fallback any more: the web client sends the active location, and an
    // omitted argument is now a codegen error rather than a silent read of the
    // wrong location.
    vendorCart: async (_, { vendorId = null, locationId }, ctx) => {
      const userId = requireAuth(ctx)

      // `member`, not `viewer`: this query CREATES the cart when it is missing.
      await requireLocationRole(ctx, locationId, 'member')

      const cartId = cartIdFor(locationId, vendorId ?? null)
      let cart = await prisma.cart.findUnique({ where: { id: cartId } })
      if (!cart) {
        cart = await prisma.cart.create({
          data: { id: cartId, userId, locationId },
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

    // With no `locationId`: whole-account, across every location. It answers
    // "is this item in any cart", which the item list shows regardless of the
    // active location.
    //
    // With one: only that location's carts. The Stock tab's remove
    // confirmation asks this way, so the number must equal exactly what
    // `removeItemFromLocation` (resolvers/itemStock.resolver.ts) deletes.
    // Both use the SAME filter — `cart: { locationId }` — so one rule decides
    // membership. If the two ever disagreed, the dialog would show a number
    // the removal does not match.
    //
    // `CartItem` has no `locationId` column of its own. The location lives on
    // its CART, in `Cart.locationId`, which PR 3a added. `cart: { locationId }`
    // is a Prisma relation filter on that column, so the database answers in
    // one statement. Do not go back to reading every row and splitting its
    // cart id in JavaScript: the id is derived from this column, and a filter
    // on the derived string can drift from a filter on the source.
    cartItemCountByItem: async (_, { itemId, locationId }, ctx) => {
      const userId = requireAuth(ctx)
      if (!locationId) return prisma.cartItem.count({ where: { itemId, userId } })
      await requireLocationRole(ctx, locationId, 'viewer')
      return prisma.cartItem.count({ where: { itemId, userId, cart: { locationId } } })
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

    checkout: async (_, { cartId, items, note, logKey, logParams }, ctx) => {
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
      // `isBeingBought` is `quantity > 0` (lib/checkout.js). Pinned items
      // (quantity === 0) stay in the permanent cart — no migration needed.
      const buyingItems = cartItems.filter(isBeingBought)

      // The on-hand total each log row will record, as the CLIENT computed it.
      // Built once here, not re-derived per item inside the loop below.
      //
      // ── WHY THE CLIENT SENDS THIS NUMBER ──
      //
      // The log's `quantity` is the item's on-hand total in PACKAGE units. An
      // item sold in packs keeps a fractional remainder in `unpackedQuantity`,
      // and turning that remainder back into a fraction of a pack needs
      // `amountPerPackage` — a global field on `Item`, not on `ItemStock`. The
      // only stock data this resolver can reach is the per-location
      // `ItemStock` row, so it cannot do the conversion.
      //
      // The log's `quantity` used to be computed below, after the stock write,
      // as `stock.packedQuantity + stock.unpackedQuantity` — the two columns
      // added raw. Local mode runs `getPackedTotal({ packedQuantity,
      // unpackedQuantity, amountPerPackage }) + cartItem.quantity` instead
      // (apps/web/src/db/operations.ts and src/lib/quantityUtils.ts). The two
      // disagree whenever an item has an `amountPerPackage` AND a non-zero
      // `unpackedQuantity`: with `amountPerPackage` 6, 2 packed and 3 unpacked,
      // buying 1 gave local 3.5 and cloud 6. That is issue #336.
      //
      // `consumeRecipes` already works this way — `ConsumeRecipesItemInput`
      // carries a client-computed `quantity` for the same reason
      // (src/schema/recipe.graphql).
      //
      // `delta` stays server-side as `ci.quantity`. Only the converted total
      // needs a field the server cannot see.
      const quantityByItemId = new Map(items.map((i) => [i.itemId, i.quantity]))

      // Resolve every bought item's total BEFORE the first write, so a missing
      // entry cannot leave half a checkout behind. `.map` runs to completion
      // before the loop below starts, and `checkout` has no transaction.
      //
      // ── THERE IS NO FALLBACK, ON PURPOSE ──
      //
      // Falling back to `stock.packedQuantity + stock.unpackedQuantity` would
      // restore the exact bug above, silently, for any client that stopped
      // sending the field. A loud `BAD_USER_INPUT` naming the item is the
      // chosen cost. It means checkout fails for a cloud client running an old
      // bundle, until the user accepts the service-worker update prompt.
      //
      // ── THE ACCEPTED RACE ──
      //
      // The client computes these numbers from the cart it rendered. If another
      // device adds a cart item between that render and the checkout, the new
      // item has no entry here and the whole checkout fails. The user refetches
      // and retries. Rare with one account per user, so this is recorded rather
      // than solved.
      //
      // ── THE FILTER MUST MATCH ──
      //
      // The client sends one entry per cart item that `isBeingBought` accepts —
      // the same rule as `buyingItems` above. Both sides now call a function
      // named for that rule instead of repeating `ci.quantity > 0`: the client
      // imports it from `@p1i/types`, this file keeps a second copy, and
      // `src/lib/checkout.test.ts` compares the two. If the rule changes,
      // change both copies in the same commit, or a legitimate checkout starts
      // failing on this error.
      const purchases = buyingItems.map((ci) => {
        const quantity = quantityByItemId.get(ci.itemId)
        if (quantity === undefined) {
          throw new GraphQLError(
            `checkout: no quantity was supplied for item '${ci.itemId}'. ` +
              'Every cart item with a quantity above zero needs an entry in `items`.',
            { extensions: { code: 'BAD_USER_INPUT' } },
          )
        }
        return { ci, quantity }
      })

      const now = new Date()

      for (const { ci, quantity: finalQuantity } of purchases) {
        // Stock the item at the cart's location if it is not stocked there yet,
        // the same copy-on-add local `checkout` has always run
        // (apps/web/src/db/operations.ts). A no-op on the normal path, where
        // the row already exists.
        //
        // Without it, `writeStock`'s `create` branch opened the row with
        // `targetQuantity: 0` and `refillThreshold: 0` — and
        // `targetQuantity === 0` is exactly what every reader treats as "not
        // active at this location" (`isInactiveHere`,
        // apps/web/src/lib/quantityUtils.ts). So the item arrived holding stock
        // it could not be shopped for again. `ensureStockAtLocation` inherits
        // those two and `dueDate` from a source row instead.
        //
        // **Not reachable from the UI today**, and fixed anyway: the cart page
        // lists only items stocked at the location, and the item-search tail's
        // third bucket offers "add to location", not "add to cart". This is the
        // defensive path, and the two modes disagreeing on it is the thing
        // being removed before households.
        await ensureStockAtLocation(ci.itemId, cartLocationId, userId)

        // The cart location's own stock row, and since PR 5 the ONLY place the
        // purchase is recorded — `Item`'s five stock columns are gone, and with
        // them the `prisma.item.update` that used to run here first.
        //
        // `increment` rather than a total computed in JavaScript, so two
        // concurrent checkouts of one item cannot lose an increment to a
        // read-modify-write race.
        //
        // The return value is no longer read. Until issue #336 this was `const
        // stock = await writeStock(...)` and the next line added the saved
        // row's two quantity columns together to get the log's `quantity`. That
        // number now arrives in `items` — see the block above — so the saved
        // row is not needed here. `writeStock` still returns the saved row,
        // and `upsertItemStock` (resolvers/itemStock.resolver.ts) is now its
        // only caller that reads it.
        await writeStock(ci.itemId, cartLocationId, {
          packedQuantity: { increment: ci.quantity },
        })

        await prisma.inventoryLog.create({
          data: {
            itemId: ci.itemId,
            delta: ci.quantity,
            quantity: finalQuantity,
            occurredAt: now,
            userId,
            // The cart's own location, the same one the stock write above
            // used. A log row and the stock move it explains must never name
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
