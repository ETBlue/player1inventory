import { GraphQLError } from 'graphql'
import { requireAuth } from '../context.js'
import { requireLocationRole } from '../lib/authz.js'
import { writeStock } from '../lib/itemStockWrite.js'
import { prisma } from '../lib/prisma.js'
import { buildItemUpdateData, toGraphQL as itemToGraphQL } from './item.resolver.js'
import type { Item, ItemStock, Resolvers } from '../generated/graphql.js'
import type { Prisma, ItemStock as PrismaItemStock } from '@prisma/client'

// The five state fields, all optional on input. A key absent from `input` is
// left untouched on an existing row — this is a merge, not a replace.
type StockInput = {
  targetQuantity?: number | null
  refillThreshold?: number | null
  packedQuantity?: number | null
  unpackedQuantity?: number | null
  dueDate?: string | null
}

// Narrower than `StockWrite`: every number here is a plain number, never
// Prisma's `{ increment: n }` form. That matters because `applyUnitSwitch`
// below spreads this result into an `itemStock.create`, where a column typed
// `number` cannot take the increment object. `StockData` is still assignable
// to `StockWrite`, so `writeStock` takes it unchanged.
type StockData = {
  targetQuantity?: number
  refillThreshold?: number
  packedQuantity?: number
  unpackedQuantity?: number
  dueDate?: Date | null
}

function toData(input: StockInput): StockData {
  const data: StockData = {}
  if (input.targetQuantity != null) data.targetQuantity = input.targetQuantity
  if (input.refillThreshold != null) data.refillThreshold = input.refillThreshold
  if (input.packedQuantity != null) data.packedQuantity = input.packedQuantity
  if (input.unpackedQuantity != null) data.unpackedQuantity = input.unpackedQuantity
  if ('dueDate' in input) data.dueDate = input.dueDate ? new Date(input.dueDate) : null
  return data
}

// Map a Prisma ItemStock row to the GraphQL shape. GraphQL schema types
// createdAt/updatedAt as String! and dueDate as String — Date objects must be
// explicitly ISO-stringified here rather than left for the default String
// scalar serializer, which coerces via Date.valueOf() (epoch milliseconds)
// before it ever reaches toJSON(). Mirrors item.resolver.ts's toGraphQL.
export function toGraphQL(row: PrismaItemStock): ItemStock {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
  } as unknown as ItemStock
}

export const itemStockResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    itemStocks: async (_, { locationId }, ctx) => {
      await requireLocationRole(ctx, locationId, 'viewer')
      const rows = await prisma.itemStock.findMany({ where: { locationId } })
      return (rows as unknown as PrismaItemStock[]).map(toGraphQL)
    },

    itemStocksForItem: async (_, { itemId }, ctx) => {
      const userId = requireAuth(ctx)
      // Scoped THROUGH the location — ItemStock has no userId of its own.
      // Postgres gives no ordering guarantee for findMany without orderBy; a
      // stable order is genuinely better for the client, not just testable.
      const rows = await prisma.itemStock.findMany({
        where: { itemId, location: { userId } },
        orderBy: { locationId: 'asc' },
      })
      return (rows as unknown as PrismaItemStock[]).map(toGraphQL)
    },

    // Whole-account, across every location the caller owns. Cloud export needs
    // all of it in one request; `itemStocks(locationId:)` would cost one
    // request per location.
    //
    // `requireAuth`, NOT `requireLocationRole`: that helper takes a single
    // `locationId` and this query names none. The scope is the relation filter
    // `location: { userId }` — ItemStock has no userId of its own, by design
    // (root CLAUDE.md, Authorization), and this is the same shape
    // `itemStocksForItem` above and `purgeUserData` already use.
    allItemStocks: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      // Postgres gives no ordering guarantee for findMany without orderBy, and
      // an export that reorders its rows on every run produces a different
      // file each time. `locationId` alone is not enough here: unlike
      // `itemStocksForItem`, this query spans several items, so many rows share
      // one location. `(locationId, itemId)` IS a total order, because
      // @@unique([itemId, locationId]) (prisma/schema.prisma:282) makes the
      // pair unique — no two rows can tie.
      const rows = await prisma.itemStock.findMany({
        where: { location: { userId } },
        orderBy: [{ locationId: 'asc' }, { itemId: 'asc' }],
      })
      return (rows as unknown as PrismaItemStock[]).map(toGraphQL)
    },
  },

  Mutation: {
    upsertItemStock: async (_, { itemId, locationId, input }, ctx) => {
      // No `requireAuth` of its own: `requireLocationRole` runs it first, so
      // an unauthenticated caller still fails before any read.
      await requireLocationRole(ctx, locationId, 'member')
      const data = toData(input as StockInput)
      // `writeStock` (lib/itemStockWrite.ts) is the one place per-location
      // stock is written. This resolver used to hold its own
      // `findUnique`-then-`update`-or-`create` block with the same zero
      // defaults — a second copy of the same upsert, which is how the two
      // could have drifted apart on what an omitted field means.
      //
      // One write, and nothing after it. Until cloud locations PR 5 this was
      // followed by a REVERSE mirror onto `Item`'s five legacy state columns,
      // run only when the location written was the caller's default, so a
      // browser on a pre-PR-2 bundle kept seeing its quantities move. PR 5
      // drops those columns: `ItemStock` is the only place a quantity lives
      // and there is nothing to mirror it onto. That is also why this resolver
      // no longer reads `isDefault` off the authorized row.
      const saved = await writeStock(itemId, locationId, data)
      return toGraphQL(saved)
    },

    // Copy-on-add, matching local `addItemToLocation` (db/operations.ts:152).
    // Since the v16 split there is nothing to copy for units, packaging,
    // expiration mode or consume amount — those are global Item fields the new
    // location shares automatically. Only targetQuantity, refillThreshold and
    // dueDate are inherited; on-hand quantities always start at 0.
    //
    // Neither this mutation nor `removeItemFromLocation` ever mirrored onto
    // `Item`'s legacy state columns, and that was deliberate rather than an
    // oversight — see `removeItemFromLocation` below. The columns are gone
    // since cloud locations PR 5, so nothing here has to mirror anything.
    addItemToLocation: async (_, { itemId, locationId, sourceLocationId }, ctx) => {
      const userId = requireAuth(ctx)
      await requireLocationRole(ctx, locationId, 'member')

      const existing = await prisma.itemStock.findUnique({
        where: { itemId_locationId: { itemId, locationId } },
      })
      if (existing) return toGraphQL(existing as unknown as PrismaItemStock)

      const all = (await prisma.itemStock.findMany({
        where: { itemId, location: { userId } },
      })) as unknown as PrismaItemStock[]
      const source =
        (sourceLocationId ? all.find((s) => s.locationId === sourceLocationId) : undefined) ??
        [...all].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]

      const row = await prisma.itemStock.create({
        data: {
          itemId,
          locationId,
          targetQuantity: source?.targetQuantity ?? 0,
          refillThreshold: source?.refillThreshold ?? 0,
          dueDate: source?.dueDate ?? null,
          packedQuantity: 0,
          unpackedQuantity: 0,
        },
      })
      return toGraphQL(row as unknown as PrismaItemStock)
    },

    removeItemFromLocation: async (_, { itemId, locationId }, ctx) => {
      const userId = requireAuth(ctx)
      await requireLocationRole(ctx, locationId, 'member')
      // Three deletes, matching local's `removeItemFromLocation`
      // (apps/web/src/db/operations.ts): the stock row, this item's inventory
      // logs at this location, and this item's entries in this location's
      // carts. The carts themselves survive — every item in the location
      // shares them.
      //
      // The global Item survives too. An item removed from its last location
      // becomes an orphan: absent from the pantry but still in the catalog, so
      // it can be re-added. PR 3a added InventoryLog.locationId and
      // Cart.locationId, but their FK cascade fires on deleting a Location,
      // not on removing one item from one — so this resolver does it.
      //
      // HISTORY, kept so the absence is not read as an oversight. Between PRs
      // 2 and 4b a dual-write bridge copied the default location's stock onto
      // `Item`'s five legacy state columns. This mutation and
      // `addItemToLocation` above were the two stock mutations that never
      // joined it, because both mutate MEMBERSHIP and `Item`'s columns could
      // not express membership at all — the pre-location schema has no
      // "stocked here" concept, so any mirror here would have had to invent a
      // value (zeroing on remove would tell a pre-PR-2 browser "you have 0 of
      // this" while the item was still stocked elsewhere). Cloud locations
      // PR 5 dropped the columns and the bridge, so the question no longer
      // arises for any mutation.

      // One transaction: three deletes that must not half-apply. A stock row
      // deleted while its logs survive leaves the location's history pointing
      // at an item that is no longer stocked there, and a cart entry that
      // outlives its stock row is bought into a location the item has left.
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.itemStock.deleteMany({ where: { itemId, locationId } })

        // `locationId` alone, with NO `?? DEFAULT_LOCATION_ID` fallback. Local
        // needs one because Dexie logs written before the Location feature
        // carry none; cloud's `InventoryLog.locationId` is NOT NULL since PR
        // 3a, so a fallback here would tell the next reader that NULLs are
        // possible when they are not.
        await tx.inventoryLog.deleteMany({ where: { itemId, locationId } })

        // `cart: { locationId }` is a relation filter on `Cart.locationId`,
        // the real column PR 3a added. `CartItem` itself has no `locationId`,
        // so the location has to come from its cart either way; this asks the
        // database for it in one statement instead of reading every cart entry
        // for the item and re-deriving the location from the cart id string in
        // JavaScript.
        //
        // `cartItemCountByItem` (resolvers/cart.resolver.ts) filters the SAME
        // way. The Stock tab shows that count in the confirmation dialog, so
        // the two must agree on what "in this location" means — a number the
        // removal then does not match would be a lie to the user.
        await tx.cartItem.deleteMany({ where: { itemId, userId, cart: { locationId } } })
      })
      return true
    },

    // One unit switch, all-or-nothing. The cloud counterpart of local's
    // `applyUnitSwitchBatch` (apps/web/src/db/operations.ts), which does the
    // same over `items`, `itemStocks` and `recipes` in one Dexie transaction.
    //
    // A switch touches three kinds of row: the Item's configuration, one
    // ItemStock per location holding quantities in the OLD unit, and one
    // recipe per `defaultAmount` expressed in it. Written separately, a
    // failure partway leaves the item on the NEW unit while some locations
    // and recipes still hold old-unit numbers — mixed units, silently, with
    // no error for the user to act on. So it is one `prisma.$transaction`.
    applyUnitSwitch: async (_, { input }, ctx) => {
      const userId = requireAuth(ctx)
      const { itemId, updates, stockConversions, recipeUpdates } = input

      // ── AUTHORIZATION: every location, before anything is written ────────
      //
      // `stockConversions` names several locations. Decided 2026-09-20: if the
      // caller lacks `member` on ANY of them, the whole mutation fails with
      // FORBIDDEN and nothing changes.
      //
      // Converting only the locations the caller may write would leave the
      // item in mixed units across locations — the exact corruption the
      // transaction exists to prevent, just authorized rather than accidental.
      //
      // The checks run BEFORE the transaction opens, so a refusal has written
      // nothing even if rollback were broken.
      //
      // This cannot fire today: every Location belongs to one user under the
      // current flat `userId` scoping. It is written this way so location RBAC
      // is one function body later (lib/authz.ts) rather than N call sites.
      //
      // The return value is dropped. Until cloud locations PR 5 this loop also
      // collected which of the named locations was the caller's DEFAULT, for a
      // mirror onto `Item`'s five legacy state columns inside the transaction
      // below. PR 5 drops those columns, so `isDefault` is nothing this
      // resolver needs to know.
      for (const conversion of stockConversions) {
        await requireLocationRole(ctx, conversion.locationId, 'member')
      }

      // Ownership of the Item and of every recipe, also before the
      // transaction. These are query SCOPES (`where: { id, userId }`), the
      // same shape `updateItem` and `updateRecipe` already use — not a
      // `row.userId === ctx.userId` comparison, which root CLAUDE.md forbids
      // as an authorization check.
      const item = await prisma.item.findFirst({ where: { id: itemId, userId } })
      if (!item) {
        throw new GraphQLError('Item not found', { extensions: { code: 'NOT_FOUND' } })
      }
      for (const update of recipeUpdates) {
        const recipe = await prisma.recipe.findFirst({
          where: { id: update.recipeId, userId },
        })
        if (!recipe) {
          throw new GraphQLError('Recipe not found', { extensions: { code: 'NOT_FOUND' } })
        }
      }

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // The Item's own configuration — `targetUnit`, `amountPerPackage`,
        // `consumeAmount` and the rest — through the SAME mapping `updateItem`
        // uses. The five per-location state keys are dropped first: they are
        // `stockConversions`' to write, never the Item's. (`UpdateItemInput`
        // still carries them until PR 5 task 4 removes them, which is why the
        // deletes below are still needed.)
        const itemData = buildItemUpdateData(updates)
        delete itemData.targetQuantity
        delete itemData.refillThreshold
        delete itemData.packedQuantity
        delete itemData.unpackedQuantity
        delete itemData.dueDate
        if (Object.keys(itemData).length > 0) {
          await tx.item.update({ where: { id: itemId }, data: itemData })
        }

        // EVERY named location, not just the default one. The conversion
        // factor (`amountPerPackage`) is global, so every stocked location
        // converts by it.
        //
        // `tx` is passed to `writeStock` as its fourth argument, and that is
        // required, not tidiness: `writeStock` defaults to the module-level
        // `prisma`, so omitting it here would issue the write OUTSIDE this
        // transaction, where it would survive a rollback and leave `Item` on
        // the new unit with a location still holding old-unit numbers.
        //
        // This loop held its own `tx.itemStock.upsert` until cloud locations
        // PR 5 task 3 — a third copy of the same upsert, with its own
        // hand-written list of the five zero defaults — because `writeStock`
        // took no client parameter then.
        for (const conversion of stockConversions) {
          const data = toData(conversion.quantities as StockInput)
          await writeStock(itemId, conversion.locationId, data, tx)
        }

        // Replace each recipe's item list wholesale — the shape
        // `updateRecipe(items:)` already takes, and the same full replacement
        // local mode writes to `Recipe.items`.
        for (const update of recipeUpdates) {
          await tx.recipeItem.deleteMany({ where: { recipeId: update.recipeId } })
          if (update.items.length) {
            await tx.recipeItem.createMany({
              data: update.items.map((i) => ({
                recipeId: update.recipeId,
                itemId: i.itemId,
                defaultAmount: i.defaultAmount,
              })),
            })
          }
        }
      })

      const full = await prisma.item.findUniqueOrThrow({
        where: { id: itemId },
        include: { tags: true, vendors: true },
      })
      return itemToGraphQL(full) as Item
    },
  },
}
