import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import {
  requireCatalogIds,
  requireCatalogRole,
  requireHousehold,
  requireLocationItems,
  requireLocationRole,
} from '../lib/authz.js'
import { prisma } from '../lib/prisma.js'
import { writeStock } from '../lib/itemStockWrite.js'
import { notConsumableError, requireConsumableAttachments } from '../lib/consumable.js'
import { publishChange, publishHouseholdChange } from '../lib/publishChange.js'
import { consumeItem, getPackedTotal } from '@p1i/types'
import { requireAuth } from '../context.js'
import type { Recipe, Resolvers } from '../generated/graphql.js'

// See the `timeout` comment at the end of `consumeRecipes`.
const COOKING_TIMEOUT_MS = 30_000

// ── Household scope (households H3a, task 3.7) ──
//
// Reading recipes needs household role `member`; creating, editing and
// deleting one needs `manager` (design, *Household roles*), through
// `requireCatalogRole` (lib/authz.ts). Reads are filtered by the household.
//
// Marking a recipe as cooked is NOT a catalog edit. `updateRecipeLastCookedAt`
// and the `lastCookedAt` write in `consumeRecipes` record that someone
// cooked, which is a location right (design, *Location roles*: participants
// "edit pantry, shopping, cooking"). So they need only `member`. Asking for
// `manager` there would stop a member who may cook from cooking.
export const recipeResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Recipe'> = {
  Query: {
    recipes: async (_, __, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'member')
      const recipes = await prisma.recipe.findMany({
        where: { householdId },
        include: { items: true },
      })
      return recipes as unknown as Recipe[]
    },
    recipe: async (_, { id }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'member')
      const recipe = await prisma.recipe.findFirst({
        where: { id, householdId },
        include: { items: true },
      })
      return recipe as unknown as Recipe | null
    },
  },
  Mutation: {
    createRecipe: async (_, { name, items }, ctx) => {
      requireAuth(ctx)
      const householdId = await requireCatalogRole(ctx, 'manager')
      // Issue #273: every item the recipe names must be the household's.
      // Checked BEFORE the recipe is created, so a refused call writes nothing.
      await requireCatalogIds(ctx, householdId, 'item', (items ?? []).map((i) => i.itemId))
      // Only consumable items can be in a recipe (lib/consumable.ts). A new
      // recipe holds no link yet, so every non-consumable item is refused.
      await requireConsumableAttachments(
        householdId,
        (items ?? []).map((i) => i.itemId),
        async () => new Set<string>(),
      )
      const recipe = await prisma.recipe.create({ data: { name, householdId } })
      // `CATALOG` in `finally` (households H3c-2 task D.4): the recipe and
      // its ingredient rows are separate writes, so once the recipe is saved
      // other tabs must hear about it even if a later write fails.
      try {
        if (items?.length) {
          await prisma.recipeItem.createMany({
            data: items.map(i => ({ recipeId: recipe.id, itemId: i.itemId, defaultAmount: i.defaultAmount })),
          })
        }
        return await (prisma.recipe.findUniqueOrThrow({ where: { id: recipe.id }, include: { items: true } }) as unknown as Promise<Recipe>)
      } finally {
        await publishHouseholdChange(ctx, ['CATALOG'], householdId)
      }
    },
    updateRecipe: async (_, { id, name, items }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'manager')
      const existing = await prisma.recipe.findFirst({ where: { id, householdId } })
      if (!existing) throw new GraphQLError('Recipe not found', { extensions: { code: 'NOT_FOUND' } })
      // Issue #273: checked BEFORE any write, so a refused call changes nothing.
      await requireCatalogIds(ctx, householdId, 'item', (items ?? []).map((i) => i.itemId))
      // Only consumable items can be in a recipe (lib/consumable.ts). Also
      // before any write. A link the recipe already holds is not refused.
      await requireConsumableAttachments(
        householdId,
        (items ?? []).map((i) => i.itemId),
        async () =>
          new Set(
            (
              await prisma.recipeItem.findMany({ where: { recipeId: id }, select: { itemId: true } })
            ).map((r) => r.itemId),
          ),
      )
      const data: { name?: string } = {}
      if (name != null) data.name = name
      await prisma.recipe.update({ where: { id }, data })
      // `CATALOG` in `finally`, for the same reason as `createRecipe`.
      try {
        if (items != null) {
          await prisma.recipeItem.deleteMany({ where: { recipeId: id } })
          if (items.length) {
            await prisma.recipeItem.createMany({
              data: items.map(i => ({ recipeId: id, itemId: i.itemId, defaultAmount: i.defaultAmount })),
            })
          }
        }
        return await (prisma.recipe.findUniqueOrThrow({ where: { id }, include: { items: true } }) as unknown as Promise<Recipe>)
      } finally {
        await publishHouseholdChange(ctx, ['CATALOG'], householdId)
      }
    },
    updateRecipeLastCookedAt: async (_, { id }, ctx) => {
      // `member`, not `manager`: see the comment at the top of this file.
      const householdId = await requireCatalogRole(ctx, 'member')
      const existing = await prisma.recipe.findFirst({ where: { id, householdId } })
      if (!existing) throw new GraphQLError('Recipe not found', { extensions: { code: 'NOT_FOUND' } })
      const saved = await prisma.recipe.update({
        where: { id },
        data: { lastCookedAt: new Date() },
        include: { items: true },
      })
      // `CATALOG` (households H3c-2 task D.4): the recipe list shows when
      // each recipe was last cooked.
      await publishHouseholdChange(ctx, ['CATALOG'], householdId)
      return saved as unknown as Recipe
    },
    consumeRecipes: async (_, { input }, ctx) => {
      const userId = requireAuth(ctx)
      const { occurredAt, recipeIds, items, locationId: consumeLocationId } = input
      const occurredAtDate = new Date(occurredAt)

      // `consumeLocationId` is the location the cook names. It used to be the
      // caller's DEFAULT location, because `ConsumeRecipesInput` carried no
      // location at all — so cooking while viewing the Garage took the stock
      // out of the Kitchen. Task 3 added the field; Task 4 made it REQUIRED and
      // removed the default-location fallback.

      // `participant`, not `viewer`: this mutation writes stock and log rows there.
      // The id arrives from the client, so it goes through the one
      // authorization seam (lib/authz.ts) before any query sees it. A refusal
      // throws out of the WHOLE mutation before the first write.
      await requireLocationRole(ctx, consumeLocationId, 'participant')
      // Every item cooked must be an item of the cook location's household
      // (households H3a, task 3.8). AFTER the role check (H3a rule 12): the
      // other order tells a stranger which location ids exist.
      await requireLocationItems(
        ctx,
        consumeLocationId,
        items.map((item) => item.itemId),
      )
      // Only the household's recipes are marked as cooked, below. Read here,
      // before any write. `requireHousehold` is the `member` check: see the
      // comment at the top of this file.
      const householdId = await requireHousehold(ctx)

      // `delta` is the log's signed change, minus the amount used (see
      // `ConsumeRecipesItemInput` in src/schema/recipe.graphql). A cook only
      // takes stock away, so 0 or more is refused. The web never sends one:
      // the cooking page only lists items with an amount above 0. Refusing
      // rather than ignoring the row means a client with the sign the wrong
      // way round fails loudly instead of ADDING stock through `consumeItem`,
      // which does not expect a negative amount.
      for (const item of items) {
        if (!(item.delta < 0)) {
          throw new GraphQLError(
            `delta must be below 0 (the amount used, negated); got ${item.delta} for item ${item.itemId}`,
            { extensions: { code: 'BAD_USER_INPUT' } },
          )
        }
      }

      // ── ONE TRANSACTION (households H3b task B.6, decision D4) ──
      //
      // Every stock row, every log and every recipe mark is written, or none
      // is. Until B.6 each item had its own try/catch and no transaction, so
      // one failing item left the others written and the cook half done, and
      // a failing recipe mark was ignored.
      //
      // How many recipe rows the cook marked. Set inside the callback, read
      // only after `$transaction` has resolved, for the live event below.
      let recipesMarked = 0
      const result = await prisma.$transaction(
        async (tx) => {
          // The unit settings `consumeItem` needs live on `Item`, not on
          // `ItemStock`. Read in the transaction, once for all items.
          const itemIds = [...new Set(items.map((i) => i.itemId))]
          const itemRows = await tx.item.findMany({
            where: { id: { in: itemIds } },
            select: {
              id: true,
              targetUnit: true,
              measurementUnit: true,
              amountPerPackage: true,
              consumeAmount: true,
              consumable: true,
            },
          })
          // Cooking is only for consumable items (owner decision 2026-11-26,
          // lib/consumable.ts). Checked before the first write, so a refused
          // cook writes nothing. `=== false`: the column is NOT NULL.
          const notConsumable = itemRows.filter((i) => i.consumable === false).map((i) => i.id)
          if (notConsumable.length > 0) throw notConsumableError(notConsumable)
          const itemById = new Map(itemRows.map((i) => [i.id, i]))

          // Items in id order, so two cooks lock the same stock rows in the
          // same order and cannot deadlock on each other. A stable sort keeps
          // two rows for one item in the order they were sent.
          const ordered = [...items].sort((a, b) =>
            a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0,
          )

          for (const item of ordered) {
            const unit = itemById.get(item.itemId)
            // `requireLocationItems` checked every id above, so this is only a
            // row deleted in the moment between. Fail, and roll back.
            if (!unit) {
              throw new GraphQLError(`Item ${item.itemId} not found`, {
                extensions: { code: 'NOT_FOUND' },
              })
            }

            // ── THE ROW LOCK ──
            //
            // Postgres runs at READ COMMITTED. Checkout can add with a plain
            // `{ increment }`, but cooking cannot: `consumeItem` is not a
            // sum. It opens packages, rounds to the consume step and stops at
            // zero, so the new numbers depend on the old ones. If two cooks
            // both READ the row before either writes, both compute from the
            // same old numbers and the second write replaces the first. One
            // use is lost — the bug this task fixes.
            //
            // So the row is locked first, with `SELECT … FOR UPDATE`. A second
            // cook of the same item waits here until the first commits. In
            // READ COMMITTED every statement sees the latest committed data,
            // so its read below then sees the first cook's result.
            //
            // Chosen over a conditional write (`updateMany` where the stored
            // numbers still equal the ones read, re-read and retry when the
            // count is 0) because the lock needs no retry limit, never fails a
            // cook under contention, and does not compare floats for equality.
            //
            // An item with no row here locks nothing, and that is safe: two
            // such cooks both compute from 0 and both write 0, and
            // `writeStock` is one upsert, so neither fails.
            await tx.$queryRaw`SELECT id FROM "ItemStock" WHERE "itemId" = ${item.itemId} AND "locationId" = ${consumeLocationId} FOR UPDATE`

            const stock = await tx.itemStock.findUnique({
              where: { itemId_locationId: { itemId: item.itemId, locationId: consumeLocationId } },
            })

            // The shared rule (`@p1i/types`), the same function local mode and
            // the web use. It changes the object it is given. `-delta` is the
            // amount used. An item not stocked here starts at 0 and stays at 0.
            const next: Parameters<typeof consumeItem>[0] = {
              targetQuantity: stock?.targetQuantity ?? 0,
              refillThreshold: stock?.refillThreshold ?? 0,
              packedQuantity: stock?.packedQuantity ?? 0,
              unpackedQuantity: stock?.unpackedQuantity ?? 0,
              targetUnit: unit.targetUnit,
              measurementUnit: unit.measurementUnit ?? undefined,
              amountPerPackage: unit.amountPerPackage ?? undefined,
              consumeAmount: unit.consumeAmount,
            }
            consumeItem(next, -item.delta)

            // Only the two quantities. `consumeItem` also drops `dueDate` when
            // the stock reaches 0, but cooking has never cleared it in either
            // mode (local `consumeRecipesBatch` writes the same two columns),
            // and B.6 does not change that.
            //
            // An item with no row here gets one, as before B.6: `writeStock`
            // upserts, so the row opens at the computed numbers (0 and 0).
            const after = await writeStock(
              item.itemId,
              consumeLocationId,
              {
                packedQuantity: next.packedQuantity,
                unpackedQuantity: next.unpackedQuantity,
              },
              tx,
            )

            await tx.inventoryLog.create({
              data: {
                itemId: item.itemId,
                // The full amount used, even when the stock ran out and fell
                // by less. The log records what the cook used.
                delta: item.delta,
                // The on-hand total in PACKAGE units after the cook, computed
                // here from the saved row. The client sent this number until
                // B.6. `getPackedTotal` is the shared rule.
                quantity: getPackedTotal({
                  packedQuantity: after.packedQuantity,
                  unpackedQuantity: after.unpackedQuantity,
                  amountPerPackage: unit.amountPerPackage ?? undefined,
                }),
                occurredAt: occurredAtDate,
                userId,
                // The cook's own location, the same one the stock write above
                // used. A log row and the stock move it explains must never
                // name different locations.
                locationId: consumeLocationId,
                ...(item.note ? { note: item.note } : {}),
                ...(item.logKey ? { logKey: item.logKey } : {}),
                ...(item.logParams ? { logParams: item.logParams as Prisma.InputJsonValue } : {}),
              },
            })
          }

          // Marked after the stock, in id order, one row at a time, so two
          // cooks lock recipe rows in the same order too. Until B.6 a failure
          // here was ignored ("best-effort"). Now it rolls the whole cook back:
          // a cook that took the stock but did not mark the recipe would be
          // half done.
          for (const recipeId of [...new Set(recipeIds)].sort()) {
            const { count } = await tx.recipe.updateMany({
              where: { id: recipeId, householdId },
              data: { lastCookedAt: new Date() },
            })
            recipesMarked += count
          }

          // Every entry succeeded: a failure threw above and rolled back.
          // See `ConsumeRecipesResult` in src/schema/recipe.graphql.
          return {
            itemResults: items.map((item) => ({ itemId: item.itemId, success: true })),
            allSucceeded: true,
          }
        },
        // Prisma's interactive transaction times out after 5 s by default. A
        // cook makes 4 queries per item (lock, read, upsert, log) plus one per
        // recipe and one item read, each a round trip to the database. 30 s,
        // the same as `checkout`, leaves room for a large cook on a slow
        // connection. Hitting it is safe: Prisma rolls everything back.
        { timeout: COOKING_TIMEOUT_MS },
      )

      // ── THE LIVE EVENTS (households H3c-2 task D.2) ──
      //
      // After `$transaction` has resolved, so a cook that rolled back reaches
      // no subscriber. `STOCK` and `LOG` at the cook's location, when it
      // cooked at least one item (each item writes one stock row and one
      // log). `CATALOG` for the household whose recipes it marked, when it
      // marked one: `lastCookedAt` is shown on the recipe pages and the
      // cooking page. That household is the CALLER's (`requireHousehold`
      // above), because the recipes are filtered by it. It is not always the
      // household of the cook's location: a person in two households can cook
      // at a location of the second one and mark recipes of the first.
      if (items.length > 0) {
        await publishChange(ctx, ['STOCK', 'LOG'], [{ locationId: consumeLocationId }])
      }
      if (recipesMarked > 0) {
        await publishHouseholdChange(ctx, ['CATALOG'], householdId)
      }
      return result
    },
    deleteRecipe: async (_, { id }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'manager')
      const existing = await prisma.recipe.findFirst({ where: { id, householdId } })
      if (!existing) return false
      // RecipeItem rows cascade-delete via DB constraint
      await prisma.recipe.delete({ where: { id } })
      await publishHouseholdChange(ctx, ['CATALOG'], householdId)
      return true
    },
    // The Recipes tab of the item page saves its whole list with one call
    // (docs/features/items/2026-11-27-item-relations-save-design.md, *Server:
    // `setItemRecipes` (PR A)*). Every refusal comes before the first write.
    setItemRecipes: async (_, { itemId, recipeIds }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'manager')

      // The item must be the household's. Another household's item gives the
      // same NOT_FOUND as a missing one, as in `updateItem`.
      const existing = await prisma.item.findFirst({ where: { id: itemId, householdId } })
      if (!existing) throw new GraphQLError('Item not found', { extensions: { code: 'NOT_FOUND' } })

      // The argument is a set: a repeated id is folded, not refused.
      // Issue #273: another household's recipe is FORBIDDEN, an id no row
      // holds is BAD_USER_INPUT. Checked before any write.
      const ids = [...new Set(recipeIds)]
      await requireCatalogIds(ctx, householdId, 'recipe', ids)

      const changed = await prisma.$transaction(async (tx) => {
        const item = await tx.item.findFirst({
          where: { id: itemId, householdId },
          select: { consumable: true, consumeAmount: true },
        })
        if (!item) throw new GraphQLError('Item not found', { extensions: { code: 'NOT_FOUND' } })

        // `recipe: { householdId }`: `RecipeItem` has no `householdId`.
        // Before issue #273 a recipe of ANOTHER household could be made to
        // hold this item. Without the filter that recipe would be in
        // `toRemove`, and this write would change another household's recipe.
        const current = new Set(
          (
            await tx.recipeItem.findMany({
              where: { itemId, recipe: { householdId } },
              select: { recipeId: true },
            })
          ).map((r) => r.recipeId),
        )
        const wanted = new Set(ids)
        const toAdd = ids.filter((id) => !current.has(id))
        const toRemove = [...current].filter((id) => !wanted.has(id))

        // Only consumable items can be in a recipe (lib/consumable.ts). Only
        // an ADD is refused: a non-consumable item can still leave an old
        // recipe. `=== false`: the column is NOT NULL.
        if (toAdd.length > 0 && item.consumable === false) throw notConsumableError([itemId])

        if (toRemove.length > 0) {
          await tx.recipeItem.deleteMany({ where: { itemId, recipeId: { in: toRemove } } })
        }
        if (toAdd.length > 0) {
          // The same rule as the other places that add an item to a recipe
          // (owner answer 4A): the item's amount per use, or 1 when that is 0.
          const defaultAmount = item.consumeAmount > 0 ? item.consumeAmount : 1
          // `skipDuplicates`: the key is `(recipeId, itemId)`. Two saves at
          // the same moment can both read "not linked" for one recipe; the
          // second must not fail with P2002. A row the other save wrote keeps
          // its amount. No lock: the last save wins per recipe.
          await tx.recipeItem.createMany({
            data: toAdd.map((recipeId) => ({ recipeId, itemId, defaultAmount })),
            skipDuplicates: true,
          })
        }
        return [...toAdd, ...toRemove]
      })

      // Nothing changed: no event, and an empty answer.
      if (changed.length === 0) return []
      // After the commit, so a save that rolled back reaches no subscriber.
      await publishHouseholdChange(ctx, ['CATALOG'], householdId)
      const recipes = await prisma.recipe.findMany({
        where: { id: { in: changed }, householdId },
        include: { items: true },
      })
      return recipes as unknown as Recipe[]
    },
  },
  Recipe: {
    lastCookedAt: (recipe) => {
      const d = (recipe as unknown as { lastCookedAt: Date | null }).lastCookedAt
      return d != null ? d.toISOString() : null
    },
    // Map Prisma RecipeItem[] (junction rows) to GraphQL RecipeItem[] shape
    items: (recipe) => {
      const r = recipe as unknown as { items: { itemId: string; defaultAmount: number }[] }
      return r.items?.map(i => ({ itemId: i.itemId, defaultAmount: i.defaultAmount })) ?? []
    },
  },
}
