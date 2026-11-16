import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import {
  householdOfLocation,
  type LocationRole,
  locationIdsWithRole,
  requireHousehold,
  requireLocationItems,
  requireLocationRole,
  roleAtLeast,
} from '../lib/authz.js'
import { cartIdFor, getPackedTotal, parseCartId } from '@p1i/types'
import { prisma } from '../lib/prisma.js'
import { ensureStockAtLocation, writeStock } from '../lib/itemStockWrite.js'
import { publishChange } from '../lib/publishChange.js'
import { type Context, requireAuth } from '../context.js'
import type { Cart, CartItem, Resolvers } from '../generated/graphql.js'

/**
 * Read the location out of a cart id, then check the caller may use it.
 *
 * Since PR 3b every `Cart.id` is `${locationId}:${vendorId | 'no-vendor'}`
 * (`cartIdFor` in `@p1i/types`), so a cart id that arrives from the client carries a location
 * id that also arrives from the client. It goes through `requireLocationRole`
 * before it reaches any query — that call is the one authorization seam for
 * location data (lib/authz.ts). Do NOT replace it with a
 * `row.userId === ctx.userId` test: root CLAUDE.md forbids that, because it
 * denies a legitimate `participant` of a shared location.
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
 * Find a cart row for a WRITE (`updateCartItem`, `removeFromCart`), and check
 * the caller may change it.
 *
 * Returns `null` both for an id no row holds and for a row at a location the
 * caller holds NO role on. The two must look the same, so a stranger cannot
 * use these mutations to learn which cart-item ids exist. That keeps what the
 * code did before households H3b: the old lookup was `{ id, userId }`, so a
 * stranger's id and an unknown id were both "not found".
 *
 * A caller who holds a role there, but a weaker one than `role` (a `viewer`),
 * gets `FORBIDDEN` from `requireCartLocation`. That tells them nothing new:
 * a viewer can already read every row of the cart through `cartItems`.
 *
 * `locationIdsWithRole` is the same membership rule as `requireLocationRole`
 * (decision H18), so "has some role" here and the role check below cannot
 * disagree about a stale `LocationMember` row.
 */
async function findCartItemForWrite(ctx: Context, id: string, role: LocationRole) {
  const row = await prisma.cartItem.findUnique({ where: { id } })
  if (!row) return null
  const { locationId } = parseCartId(row.cartId)
  if (!(await locationIdsWithRole(ctx)).includes(locationId)) return null
  await requireCartLocation(ctx, row.cartId, role)
  return row
}

/** See the `timeout` option on `checkout`'s transaction. */
export const CHECKOUT_TIMEOUT_MS = 30_000

/**
 * The refusal when the cart a checkout names is not the cart the screen
 * showed (plan decision P4). The web reads `extensions.code`, never the
 * message: it refetches the cart and asks the user to check and try again.
 */
function cartChanged(): GraphQLError {
  return new GraphQLError(
    'This cart changed after it was loaded. Load it again and retry the checkout.',
    { extensions: { code: 'CART_CHANGED' } },
  )
}

function byKey<K extends string>(key: K) {
  return (a: Record<K, string>, b: Record<K, string>) =>
    a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0
}

type StoredRow = { id: string; cartId: string; itemId: string; quantity: number }

/**
 * Compare the rows a checkout names with the cart's rows being bought, and
 * return the rows to buy. Throws `CART_CHANGED` when the two differ in any way:
 *
 * | Input                                                | Why it is refused                              |
 * |------------------------------------------------------|------------------------------------------------|
 * | an id that is not a row of this cart being bought    | unknown, in another cart, or pinned (amount 0) |
 * | an amount that differs from the stored amount        | someone changed it after the screen loaded     |
 * | the same id twice                                    | the screen cannot show one row twice           |
 * | a stored row being bought that the input leaves out  | someone added it after the screen loaded       |
 *
 * `stored` must already be only the rows being bought (`quantity > 0`). A
 * pinned row is therefore "not a row being bought" here.
 *
 * An EMPTY input with no stored rows being bought is accepted, as it was
 * before task B.5: the checkout writes no stock and no log, and stamps
 * `lastPurchasedAt`. The web's Done button is disabled when nothing is being
 * bought, so only a direct API call reaches it. An empty input while the cart
 * HAS rows being bought is the last row of the table: `CART_CHANGED`.
 */
function matchCheckoutInput(
  stored: StoredRow[],
  input: ReadonlyArray<{ cartItemId: string; quantity: number }>,
): StoredRow[] {
  const byId = new Map(stored.map((r) => [r.id, r]))
  const seen = new Set<string>()
  for (const { cartItemId, quantity } of input) {
    const row = byId.get(cartItemId)
    if (!row) throw cartChanged()
    if (seen.has(cartItemId)) throw cartChanged()
    if (row.quantity !== quantity) throw cartChanged()
    seen.add(cartItemId)
  }
  if (seen.size !== stored.length) throw cartChanged()
  return stored
}

/**
 * ── HOW CART DATA IS SCOPED (households H3b) ──
 *
 * A cart belongs to its LOCATION and is shared by everyone with a role there.
 * Nothing in this file scopes a cart read or write by a person.
 *
 *   `Cart.userId`     — dropped in task B.3 (migration
 *                       20261114000000_shared_carts).
 *   `CartItem.userId` — kept, but it means "added by". It is written once, in
 *                       the `create` half of `addToCart`'s upsert, and never
 *                       in an `update`. It is NEVER a `where` key (rule 13 of
 *                       the H3b plan).
 *
 * Who may do what (design D3):
 *
 * | Resolver              | Scope                                          | Role         |
 * |-----------------------|------------------------------------------------|--------------|
 * | `cartItems`           | `{ cartId }`                                   | `viewer`     |
 * | `cartItemCountByItem` | carts at `locationIdsWithRole`, or at the one  | `viewer`     |
 * |                       | `locationId` given                             |              |
 * | `allCartItems`        | carts at `locationIdsWithRole`, one household  | any role     |
 * | `addToCart`           | one row per `(cartId, itemId)`, `increment`    | `participant`|
 * | `updateCartItem`,     | the row by `id`, then its cart's location      | `participant`|
 * | `removeFromCart`      |                                                |              |
 * | `abandonCart`         | every row of `{ cartId }`, pinned ones too     | `participant`|
 * | `checkout`            | the rows of `{ cartId }` with `quantity > 0`,  | `participant`|
 * |                       | which must equal the input, in one transaction |              |
 *
 * This replaces the issue #358 warning that stood here until task B.4. That
 * warning listed six `CartItem.userId` filters that would answer the wrong
 * question in a shared cart. Task B.4 removed four of them (`cartItems`,
 * `cartItemCountByItem`, `allCartItems`, `abandonCart`'s delete) and
 * `addToCart`'s lookup. Task B.5 removed the last two, `checkout`'s read and
 * its delete. **No cart read or write in this file names `userId` in a
 * `where` any more.** The only `userId` left is the "added by" value in
 * `addToCart`'s `create` and the author of `checkout`'s inventory logs.
 *
 * Authorization is `requireCartLocation` / `requireLocationRole` /
 * `locationIdsWithRole` (lib/authz.ts). Never `row.userId === ctx.userId`.
 *
 * The tests: `cart.resolver.test.ts` runs every resolver here against the
 * stateful `cartFake` (src/test/cartFake.ts), with two members adding rows to
 * one cart, so "rows I added" and "rows in this cart" give different answers.
 * The fake THROWS on a `userId` where key.
 */
export const cartResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Cart'> = {
  Query: {
    // `locationId` is REQUIRED since PR 3b Task 4. There is no default-location
    // fallback any more: the web client sends the active location, and an
    // omitted argument is now a codegen error rather than a silent read of the
    // wrong location.
    vendorCart: async (_, { vendorId = null, locationId }, ctx) => {
      requireAuth(ctx)

      // `viewer`: this is a read (households H5 task F.2, decision T7). Until
      // F.2 it asked `participant`, because it creates a missing cart, so a
      // viewer who opened the Shopping page got FORBIDDEN.
      const { role } = await requireLocationRole(ctx, locationId, 'viewer')

      const cartId = cartIdFor(locationId, vendorId ?? null)
      const cart = await prisma.cart.findUnique({ where: { id: cartId } })
      if (cart) return cart as unknown as Cart
      // A read must not write for a role that may not write. A viewer gets an
      // empty cart with the id the row WILL have, and nothing is saved. When
      // a participant opens it later, the row is made with that same id, so
      // the viewer's cached cart stays right.
      if (!roleAtLeast(role, 'participant')) {
        return { id: cartId, lastPurchasedAt: null } as unknown as Cart
      }
      // No `userId` since households H3b: a cart belongs to its location
      // and has no owner.
      const created = await prisma.cart.create({
        data: { id: cartId, locationId },
      })
      return created as unknown as Cart
    },

    // Every location the caller has a role on, like `inventoryLogs`. The
    // shopping page reads it to show every vendor's "last purchased", and the
    // export path needs every location's carts or the backup loses rows. Each
    // row's location is recoverable from its id.
    //
    // Scoped by location role since households H3b task B.3, when
    // `Cart.userId` was dropped. Any role counts, `viewer` included, because
    // this is a read. `allCartItems` below uses the same scope (task B.4).
    //
    // One household only since households H4 task E.5 (decision T15): the
    // caller's household. A person in two households must not export, or see
    // on the shopping page, the carts of the other one.
    allCarts: async (_, __, ctx) => {
      requireAuth(ctx)
      const locationIds = await locationIdsWithRole(ctx, 'viewer', {
        householdId: await requireHousehold(ctx),
      })
      return prisma.cart.findMany({
        where: { locationId: { in: locationIds } },
        orderBy: [{ id: 'asc' }],
      }) as unknown as Promise<Cart[]>
    },

    // Every row of the cart, whoever added it. `viewer` is enough: a read.
    cartItems: async (_, { cartId }, ctx) => {
      requireAuth(ctx)
      await requireCartLocation(ctx, cartId, 'viewer')
      return prisma.cartItem.findMany({ where: { cartId } }) as unknown as Promise<CartItem[]>
    },

    // With no `locationId`: the carts at every location the caller holds a
    // role on (`locationIdsWithRole`), whoever added the rows. It answers "is
    // this item in any cart", which the item list shows regardless of the
    // active location. A location the caller holds no role on is not counted,
    // even in the caller's own household.
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
      requireAuth(ctx)
      if (!locationId) {
        // One household: the caller's (households H5 task F.2, decision T5).
        // A person in two households holds roles in both, and the item list
        // asks about the household it shows.
        const locationIds = await locationIdsWithRole(ctx, 'viewer', {
          householdId: await requireHousehold(ctx),
        })
        return prisma.cartItem.count({ where: { itemId, cart: { locationId: { in: locationIds } } } })
      }
      // The role check runs first, so a location the caller holds no role on
      // is refused before anything is counted.
      await requireLocationRole(ctx, locationId, 'viewer')
      return prisma.cartItem.count({ where: { itemId, cart: { locationId } } })
    },

    // Every row in the carts at every location the caller holds a role on,
    // whoever added it. The export reads this, so a backup keeps the rows a
    // co-member added. Any role counts, `viewer` included: it is a read.
    // One household only since households H4 task E.5, like `allCarts`.
    allCartItems: async (_, __, ctx) => {
      requireAuth(ctx)
      const locationIds = await locationIdsWithRole(ctx, 'viewer', {
        householdId: await requireHousehold(ctx),
      })
      return prisma.cartItem.findMany({
        where: { cart: { locationId: { in: locationIds } } },
      }) as unknown as Promise<CartItem[]>
    },
  },

  Mutation: {
    addToCart: async (_, { cartId, itemId, quantity }, ctx) => {
      const userId = requireAuth(ctx)
      const locationId = await requireCartLocation(ctx, cartId, 'participant')
      // The item must be an item of the cart's location's household
      // (households H3a, task 3.8). Before, any item id was taken on trust.
      await requireLocationItems(ctx, locationId, [itemId])
      // One row per item per cart (`@@unique([cartId, itemId])`, task B.3),
      // whoever adds it (design D2). Two adds of one item sum into one row.
      //
      // `increment`, not a total computed here, so two people adding at the
      // same moment cannot lose one add to a read-then-write race.
      //
      // `userId` ("added by") is in `create` only. An add to an existing row
      // keeps the first adder: never put `userId` in `update`.
      //
      // The amount is taken as sent, as before task B.4: no check for zero or
      // a negative number. Adding 0 to a new item makes a pinned row
      // (`quantity` 0); adding to a pinned row makes it a row being bought.
      const written = await prisma.cartItem.upsert({
        where: { cartId_itemId: { cartId, itemId } },
        create: { cartId, itemId, quantity, userId },
        update: { quantity: { increment: quantity } },
      })
      // After the write (households H3c-1, task C.4). See `publishChange`.
      await publishChange(ctx, ['CART'], [{ locationId }])
      return written as unknown as CartItem
    },

    // `id` here is a CartItem id, not a cart id, so the location has to be read
    // off the row's own `cartId` after it is found. Any member with
    // `participant` there may change a row, whoever added it.
    updateCartItem: async (_, { id, quantity }, ctx) => {
      requireAuth(ctx)
      const existing = await findCartItemForWrite(ctx, id, 'participant')
      // The same answer for an unknown id and for a stranger's row.
      if (!existing) throw new GraphQLError('CartItem not found', { extensions: { code: 'NOT_FOUND' } })
      const updated = await prisma.cartItem.update({
        where: { id },
        data: { quantity },
      })
      await publishChange(ctx, ['CART'], [{ locationId: parseCartId(existing.cartId).locationId }])
      return updated as unknown as CartItem
    },

    removeFromCart: async (_, { id }, ctx) => {
      requireAuth(ctx)
      const existing = await findCartItemForWrite(ctx, id, 'participant')
      // `false` for an unknown id and for a stranger's row alike.
      if (!existing) return false
      await prisma.cartItem.delete({ where: { id } })
      await publishChange(ctx, ['CART'], [{ locationId: parseCartId(existing.cartId).locationId }])
      return true
    },

    // ── CHECKOUT: ONE TRANSACTION, AND THE SCREEN MUST MATCH THE CART ──
    //
    // Households H3b task B.5, design section 3 (decision D1). A shared cart
    // can change under the screen that shows it: a co-member adds a row,
    // changes an amount, or checks the cart out first. So the client sends
    // the rows it showed (`{ cartItemId, quantity }`) and this resolver buys
    // exactly those rows, or nothing.
    //
    // The client no longer sends the log total. The server reads `Item`
    // (`amountPerPackage`) and the stock row itself, and computes the total
    // with `getPackedTotal` from `@p1i/types`, the rule local mode uses.
    //
    // Steps, all inside one interactive transaction:
    //
    //   1. read the rows being bought (`quantity > 0`), whoever added them;
    //   2. compare them with the input (`matchCheckoutInput`): any difference
    //      is `CART_CHANGED`, and nothing is written;
    //   3. CLAIM each row: delete it with a `where` that also names the amount
    //      the screen showed, and require exactly 1 deleted row;
    //   4. per row: stock the item at the cart's location if needed, add the
    //      amount, write the log;
    //   5. stamp `Cart.lastPurchasedAt`.
    //
    // Pinned rows (`quantity` 0) are not read, not claimed and stay.
    checkout: async (_, { cartId, items, note, logKey, logParams }, ctx) => {
      const userId = requireAuth(ctx)
      // The location the CART names (PR 3b Task 3). `requireCartLocation`
      // parses it out of the cart id and authorizes it in one step. A stranger,
      // and a cart id at a location that does not exist, both get the same
      // `FORBIDDEN` from `requireLocationRole`.
      const cartLocationId = await requireCartLocation(ctx, cartId, 'participant')
      // The locations a copy-on-add may copy stock settings from: the ones the
      // caller holds a role on (households H3a, task 3.8). Read once, before
      // the transaction opens, because it reads only membership rows.
      //
      // Only the CART's household (households H5 task F.2, decision T5). Not
      // the caller's (`requireHousehold`): a person in two households can
      // check out a cart of either, and the item is the cart's household's.
      const sourceLocationIds = await locationIdsWithRole(ctx, 'viewer', {
        householdId: await householdOfLocation(cartLocationId),
      })

      // `await`, so the event below is published only after the transaction
      // has COMMITTED. A `CART_CHANGED` refusal, or any other throw, rolls
      // back and leaves this function before the publish.
      const purchased = await prisma.$transaction(
        async (tx) => {
          // Step 1. No `userId` filter (H3b rule 13): a co-member's rows are
          // bought too. `quantity: { gt: 0 }` is the SQL form of
          // `isBeingBought` (`@p1i/types`), the rule the screen uses.
          const stored = await tx.cartItem.findMany({
            where: { cartId, quantity: { gt: 0 } },
          })

          // Step 2. Throws `CART_CHANGED` before anything is written.
          const bought = matchCheckoutInput(stored, items)

          // Step 3. ── WHY THE CLAIM, AND WHY IT NAMES THE AMOUNT ──
          //
          // Postgres runs at READ COMMITTED. Two checkouts of the same cart can
          // both run step 1 before either commits, and both pass step 2. If
          // each then wrote stock and deleted the rows only at the end, both
          // would add the purchase to stock: the second `deleteMany` would
          // just delete 0 rows and nobody would notice. The purchase would be
          // counted twice.
          //
          // So each row is deleted with a count check: it must be 1. In
          // Postgres the second transaction's DELETE waits for the first
          // transaction's lock on that row. When the first commits, the
          // second re-checks its `where` against the committed state, finds
          // the row gone, deletes 0 rows, and throws `CART_CHANGED`. The
          // throw rolls back everything the second transaction did.
          //
          // The COUNT CHECK is what makes this correct, not the order: a
          // failed claim after the stock writes would roll them back too.
          // Claiming first is still the better order. It fails before any
          // stock row is written or locked, and every checkout then locks
          // cart rows before stock rows, never the other way round.
          //
          // The `where` names the amount the screen showed, not only the id.
          // A co-member's `updateCartItem` that commits between step 1 and
          // this line changes the amount; the re-check then finds no row with
          // that amount, and the checkout is refused instead of buying an
          // amount nobody saw.
          //
          // Rows are claimed in id order, so two checkouts of one cart always
          // wait on the rows in the same order.
          for (const row of [...bought].sort(byKey('id'))) {
            const { count } = await tx.cartItem.deleteMany({
              where: { id: row.id, cartId, quantity: row.quantity },
            })
            if (count !== 1) throw cartChanged()
          }

          // `amountPerPackage` lives on `Item`, not on `ItemStock`. Read in
          // the same transaction, once for all rows.
          const itemIds = [...new Set(bought.map((r) => r.itemId))]
          const itemRows = await tx.item.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, amountPerPackage: true },
          })
          const amountPerPackageOf = new Map(
            itemRows.map((i) => [i.id, i.amountPerPackage ?? undefined]),
          )

          const now = new Date()
          // Stock rows are written in item id order, so two checkouts that buy
          // the same items from different carts lock the stock rows in the
          // same order and cannot deadlock on each other.
          for (const row of [...bought].sort(byKey('itemId'))) {
            // Copy-on-add (since 2026-10-07): stock the item at the cart's
            // location if it is not stocked there yet, inheriting
            // `targetQuantity`, `refillThreshold` and `dueDate` from another
            // location the caller can read. Without it `writeStock` would
            // open the row at `targetQuantity: 0`, which every reader treats
            // as "not active at this location". A no-op on the normal path.
            await ensureStockAtLocation(row.itemId, cartLocationId, sourceLocationIds, null, tx)

            // `increment`, not a total computed here: another checkout of a
            // different cart may add to the same stock row at the same time.
            // The row this returns is the saved row, read under that row's
            // lock, so the total below includes every committed purchase.
            const after = await writeStock(
              row.itemId,
              cartLocationId,
              { packedQuantity: { increment: row.quantity } },
              tx,
            )

            // The log's `quantity` is the on-hand total in PACKAGE units after
            // the purchase: the unpacked remainder becomes a fraction of a
            // pack. Issue #336: the raw `packed + unpacked` logged 6 where
            // local mode logged 3.5. `getPackedTotal` is the shared rule.
            //
            // The bought amount is already counted in packs and must not be
            // divided by `amountPerPackage`. Here it is inside
            // `after.packedQuantity`, which `getPackedTotal` never divides, so
            // only the unpacked remainder is converted. Local `checkout`
            // (apps/web/src/db/operations.ts) gives the same number.
            const total = getPackedTotal({
              packedQuantity: after.packedQuantity,
              unpackedQuantity: after.unpackedQuantity,
              amountPerPackage: amountPerPackageOf.get(row.itemId),
            })

            await tx.inventoryLog.create({
              data: {
                itemId: row.itemId,
                delta: row.quantity,
                quantity: total,
                occurredAt: now,
                // The person who checked out. "Who did it", not a scope.
                userId,
                // The cart's own location, the same one the stock write above
                // used. A log row and the stock move it explains must never
                // name different locations.
                locationId: cartLocationId,
                ...(note ? { note } : {}),
                ...(logKey ? { logKey } : {}),
                ...(logParams ? { logParams: logParams as Prisma.InputJsonValue } : {}),
              },
            })
          }

          const cart = (await tx.cart.update({
            where: { id: cartId },
            data: { lastPurchasedAt: now },
          })) as unknown as Cart
          return { cart, boughtCount: bought.length }
        },
        // Prisma's interactive transaction times out after 5 s by default.
        // A checkout makes about 4 queries per row (copy-on-add check, stock
        // upsert, log create, claim) plus 3, each a network round trip to the
        // database. 5 s is about 300 such round trips at 15 ms, so a cart of
        // around 70 rows could reach it. 30 s leaves room for a large cart on
        // a slow connection. Hitting the limit is still safe: Prisma rolls
        // the whole checkout back, and the user gets an error and retries.
        { timeout: CHECKOUT_TIMEOUT_MS },
      )
      // One call, every kind the checkout changed at the cart's location
      // (households H3c-2 task D.2, decision Q1): the cart rows it claimed
      // (`CART`), the stock it added to (`STOCK`) and the logs it wrote
      // (`LOG`). An empty cart writes only `lastPurchasedAt`, so it changes
      // no stock and no log, and sends `CART` alone.
      await publishChange(
        ctx,
        purchased.boughtCount > 0 ? ['CART', 'STOCK', 'LOG'] : ['CART'],
        [{ locationId: cartLocationId }],
      )
      return purchased.cart
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
      requireAuth(ctx)
      // `participant`, not `viewer`: this creates rows.
      await requireLocationRole(ctx, locationId, 'participant')

      // Every vendor of the LOCATION's household, whoever made it (households
      // H3a, task 3.8). Until then this read `where: { userId }`, so a
      // location got carts only for the vendors the caller had made, not for
      // a vendor another member added to the shared catalog.
      const householdId = await householdOfLocation(locationId)
      const vendors = await prisma.vendor.findMany({
        where: { householdId },
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
        const { count } = await prisma.cart.createMany({
          data: missing.map((id) => ({ id, locationId })),
          skipDuplicates: true,
        })
        // Only when this call really made a cart. `count` is 0 when a
        // parallel `vendorCart` made every missing one first.
        if (count > 0) await publishChange(ctx, ['CART'], [{ locationId, householdId }])
      }

      // Scoped by `locationId`, so the caller gets this location's carts only —
      // `allCarts` is the read across locations. The authorization decision
      // was `requireLocationRole` at the top. (Until households H3b this also
      // filtered by `Cart.userId`, which is gone.)
      return prisma.cart.findMany({
        where: { locationId },
        orderBy: [{ id: 'asc' }],
      }) as unknown as Promise<Cart[]>
    },

    abandonCart: async (_, { cartId }, ctx) => {
      requireAuth(ctx)
      await requireCartLocation(ctx, cartId, 'participant')
      // The lookup is by the cart's id alone since households H3b task B.3,
      // when `Cart.userId` was dropped. `requireCartLocation` above is the
      // authorization decision.
      const existing = await prisma.cart.findUnique({ where: { id: cartId } })
      if (!existing) throw new GraphQLError('Cart not found', { extensions: { code: 'NOT_FOUND' } })
      // Delete EVERY row of the cart: pinned rows too, and the rows a
      // co-member added (task B.4). The cart itself stays.
      const { count } = await prisma.cartItem.deleteMany({ where: { cartId } })
      // Nothing to tell other tabs when the cart was already empty.
      if (count > 0) await publishChange(ctx, ['CART'], [{ locationId: existing.locationId }])
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
