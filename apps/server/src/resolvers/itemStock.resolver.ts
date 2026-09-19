import { GraphQLError } from 'graphql'
import { requireAuth } from '../context.js'
import { requireLocationRole } from '../lib/authz.js'
import { prisma } from '../lib/prisma.js'
import { mirrorItemStockToItem } from '../lib/stockDualWrite.js'
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

function toData(input: StockInput): Record<string, unknown> {
  const data: Record<string, unknown> = {}
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
function toGraphQL(row: PrismaItemStock): ItemStock {
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
  },

  Mutation: {
    upsertItemStock: async (_, { itemId, locationId, input }, ctx) => {
      const userId = requireAuth(ctx)
      // `isDefault` comes back on the authorized row, so the default-location
      // question is already answered here — `defaultLocationId()` in
      // lib/stockDualWrite.ts reads the same `Location.isDefault` column, and
      // calling it would be a second query for a fact we hold.
      const location = await requireLocationRole(ctx, locationId, 'member')
      const data = toData(input as StockInput)
      const existing = await prisma.itemStock.findUnique({
        where: { itemId_locationId: { itemId, locationId } },
      })
      const row = existing
        ? await prisma.itemStock.update({
            where: { itemId_locationId: { itemId, locationId } },
            data,
          })
        : await prisma.itemStock.create({
            data: {
              itemId,
              locationId,
              targetQuantity: 0,
              refillThreshold: 0,
              packedQuantity: 0,
              unpackedQuantity: 0,
              dueDate: null,
              ...data,
            },
          })
      const saved = row as unknown as PrismaItemStock

      // DUAL-WRITE, REMOVED IN PR 5 (lib/stockDualWrite.ts). This is the
      // mutation a CURRENT client sends its stock edits to (hooks/useItems.ts
      // `useUpdateItem` splits the five state fields out to here), so without
      // this a browser on a stale bundle — which reads `Item`'s columns — would
      // show quantities frozen at whatever they were before PR 2 shipped.
      //
      // ONLY for the DEFAULT location, and that condition is load-bearing: the
      // stale bundle renders one number per item with no location concept, so
      // the default location's stock is the right value to show it, and an edit
      // to any other location has no correct single value to write. Mirroring a
      // Garage edit would corrupt what the stale bundle reports for the Kitchen.
      //
      // The whole saved row is mirrored, not just the keys `input` carried, so
      // `Item`'s columns end up EQUAL to the default location's `ItemStock`
      // rather than a partial merge of it.
      if (location.isDefault) {
        await mirrorItemStockToItem(userId, itemId, saved)
      }
      return toGraphQL(saved)
    },

    // Copy-on-add, matching local `addItemToLocation` (db/operations.ts:152).
    // Since the v16 split there is nothing to copy for units, packaging,
    // expiration mode or consume amount — those are global Item fields the new
    // location shares automatically. Only targetQuantity, refillThreshold and
    // dueDate are inherited; on-hand quantities always start at 0.
    //
    // NO DUAL-WRITE HERE, and the omission is deliberate — see
    // `removeItemFromLocation` below for the shared reasoning.
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
      await requireLocationRole(ctx, locationId, 'member')
      // Only the stock row here. The global Item survives — an item removed
      // from its last location becomes an orphan: absent from the pantry but
      // still in the catalog, so it can be re-added. The location's inventory
      // logs and cart entries for THIS item cascade in PR 3c. PR 3a added
      // InventoryLog.locationId and Cart.locationId, but their FK cascade
      // fires on deleting a Location, not on removing one item from one.
      //
      // NO DUAL-WRITE onto `Item`, here or in `addItemToLocation` above, even
      // when the target IS the default location. Both mutate MEMBERSHIP, and
      // membership is exactly what `Item`'s legacy columns cannot express: the
      // pre-location schema has no "stocked here" concept, so every Item is in
      // the stale bundle's pantry with five numbers and no way to say "not
      // here". Any mirror would therefore have to invent a value rather than
      // reflect one — zeroing on remove tells a stale bundle "you have 0 of
      // this" while the item is still stocked in another location, which is a
      // fabrication, not a mirror. Neither mutation carries a user-authored
      // quantity either (`addItemToLocation` copies configuration from another
      // row and zeroes on-hand; this one writes nothing), so neither produces
      // the frozen-quantity symptom the bridge exists to prevent. The invariant
      // the dual-write actually preserves is therefore the narrower one: every
      // stock VALUE edit at the default location reaches `Item`. Membership
      // churn can leave `Item` stale until the next value edit re-syncs it, and
      // that gap is accepted for the three PRs this bridge lives.
      await prisma.itemStock.deleteMany({ where: { itemId, locationId } })
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
      const defaultLocationIds = new Set<string>()
      for (const conversion of stockConversions) {
        const location = await requireLocationRole(ctx, conversion.locationId, 'member')
        if (location.isDefault) defaultLocationIds.add(location.id)
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
        // `stockConversions`' to write, and `Item`'s copies of them are
        // written by the default-location mirror below.
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
        for (const conversion of stockConversions) {
          const data = toData(conversion.quantities as StockInput)
          const saved = await tx.itemStock.upsert({
            where: {
              itemId_locationId: { itemId, locationId: conversion.locationId },
            },
            update: data,
            create: {
              itemId,
              locationId: conversion.locationId,
              targetQuantity: 0,
              refillThreshold: 0,
              packedQuantity: 0,
              unpackedQuantity: 0,
              dueDate: null,
              ...data,
            },
          })

          // DUAL-WRITE, REMOVED IN PR 5 (lib/stockDualWrite.ts), and DEFAULT
          // LOCATION ONLY — the same rule `upsertItemStock` follows above. A
          // browser on a stale bundle reads `Item`'s five columns and has no
          // location concept, so without this a cloud unit switch would leave
          // it showing OLD-unit numbers for good.
          //
          // Written with `tx`, not through `mirrorItemStockToItem`, which uses
          // the module-level `prisma`: a mirror issued outside this
          // transaction would survive a rollback and put `Item` and
          // `ItemStock` in different units, which is what the transaction is
          // here to prevent.
          if (defaultLocationIds.has(conversion.locationId)) {
            const row = saved as unknown as PrismaItemStock
            await tx.item.updateMany({
              where: { id: itemId, userId },
              data: {
                targetQuantity: row.targetQuantity,
                refillThreshold: row.refillThreshold,
                packedQuantity: row.packedQuantity,
                unpackedQuantity: row.unpackedQuantity,
                dueDate: row.dueDate,
              },
            })
          }
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
