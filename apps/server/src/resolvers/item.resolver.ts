import { GraphQLError } from 'graphql'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Item, Resolvers, UpdateItemInput } from '../generated/graphql.js'
import type { ExpirationMode, Prisma, TargetUnit } from '@prisma/client'
import type { Item as PrismaItem, ItemTag, ItemVendor } from '@prisma/client'

// Map a Prisma item (with junction rows included) to the GraphQL Item shape.
// GraphQL schema types createdAt and updatedAt as String!.
// Exported for shelf.resolver.ts's applyShelfFilterPicks, which also returns
// an Item! and needs the same mapping.
//
// The spread carries every remaining Prisma column, so the five per-location
// state fields cloud locations PR 5 dropped from `type Item` leave the payload
// on their own once the migration (task 5) drops the columns. Nothing here
// names them.
export function toGraphQL(item: PrismaItem & { tags: ItemTag[]; vendors: ItemVendor[] }): Item {
  // Prisma enum for 'days from purchase' is 'days_from_purchase' — map back to display string
  const expirationMode =
    item.expirationMode === 'days_from_purchase'
      ? 'days from purchase'
      : (item.expirationMode as string)

  return {
    ...item,
    expirationMode,
    tagIds: item.tags.map((t) => t.tagId),
    vendorIds: item.vendors.map((v) => v.vendorId),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  } as unknown as Item
}

// Convert GraphQL expirationMode string ('days from purchase') to Prisma enum value
function toExpirationMode(value: string | null | undefined): ExpirationMode | undefined {
  if (value === null || value === undefined) return undefined
  if (value === 'days from purchase') return 'days_from_purchase'
  return value as ExpirationMode
}

// Convert GraphQL targetUnit string to Prisma TargetUnit enum
function toTargetUnit(value: string | null | undefined): TargetUnit | undefined {
  if (value === null || value === undefined) return undefined
  return value as TargetUnit
}

// Coerce InputMaybe<number> (number | null | undefined) → number | undefined (null→undefined)
function numOr(v: number | null | undefined): number | undefined {
  return v ?? undefined
}

// Coerce InputMaybe<string> → string | undefined
function strOr(v: string | null | undefined): string | undefined {
  return v ?? undefined
}

/**
 * Build the `prisma.item.update` data for an `UpdateItemInput`.
 *
 * Only keys the input actually CARRIED become columns. An absent key means
 * "leave it alone", a key present with null means "clear it" — which is why
 * every line tests `!== undefined` on the input rather than on the value.
 *
 * Extracted from `updateItem` so `applyUnitSwitch`
 * (itemStock.resolver.ts) writes the Item half of a unit switch through the
 * same mapping instead of a second copy that could drift from it.
 *
 * It maps CONFIGURATION only. Cloud locations PR 5 dropped the five
 * per-location state fields from `UpdateItemInput`, so there is no longer any
 * way to reach an `ItemStock` column from here — stock is written by
 * `upsertItemStock` / `writeStock`, which name their location.
 */
export function buildItemUpdateData(input: UpdateItemInput): Prisma.ItemUpdateInput {
  const { expirationMode, targetUnit, ...rest } = input
  return {
    ...(rest.name !== undefined && rest.name !== null ? { name: rest.name } : {}),
    ...(targetUnit !== undefined && targetUnit !== null ? { targetUnit: toTargetUnit(targetUnit) } : {}),
    ...(rest.consumeAmount !== undefined ? { consumeAmount: numOr(rest.consumeAmount) } : {}),
    ...(rest.packageUnit !== undefined ? { packageUnit: strOr(rest.packageUnit) } : {}),
    ...(rest.measurementUnit !== undefined ? { measurementUnit: strOr(rest.measurementUnit) } : {}),
    ...(rest.amountPerPackage !== undefined ? { amountPerPackage: numOr(rest.amountPerPackage) } : {}),
    ...(rest.estimatedDueDays !== undefined ? { estimatedDueDays: numOr(rest.estimatedDueDays) } : {}),
    ...(rest.expirationThreshold !== undefined ? { expirationThreshold: numOr(rest.expirationThreshold) } : {}),
    ...(expirationMode !== undefined ? { expirationMode: toExpirationMode(expirationMode) } : {}),
    // Issue #335. Both are nullable TEXT columns, so `strOr` turning an
    // explicit null into `undefined` would mean "leave it alone" and the user
    // could never clear a note. Pass the value through as it arrived: null
    // clears the column, a string sets it, and an absent key is not listed
    // here at all.
    ...(rest.wikidataUrl !== undefined ? { wikidataUrl: rest.wikidataUrl } : {}),
    ...(rest.note !== undefined ? { note: rest.note } : {}),
  }
}

export const itemResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    items: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const items = await prisma.item.findMany({
        where: { userId },
        include: { tags: true, vendors: true },
      })
      return items.map(toGraphQL)
    },

    item: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      const item = await prisma.item.findFirst({
        where: { id, userId },
        include: { tags: true, vendors: true },
      })
      return item ? toGraphQL(item) : null
    },

    itemCountByTag: async (_, { tagId }, ctx) => {
      requireAuth(ctx)
      return prisma.itemTag.count({ where: { tagId } })
    },

    itemCountByVendor: async (_, { vendorId }, ctx) => {
      requireAuth(ctx)
      return prisma.itemVendor.count({ where: { vendorId } })
    },

    itemCountByRecipe: async (_, { recipeId }, ctx) => {
      requireAuth(ctx)
      return prisma.recipeItem.count({ where: { recipeId } })
    },
  },

  Mutation: {
    createItem: async (_, { input }, ctx) => {
      const userId = requireAuth(ctx)
      const { tagIds, vendorIds, expirationMode, targetUnit, ...rest } = input

      // CONFIGURATION only. Cloud locations PR 5 removed the five per-location
      // state fields from `CreateItemInput`, so nothing is written for them
      // here and no value is lost: `schema.prisma` declares all four
      // quantities `Float @default(0)` and `dueDate DateTime?`, so an omitted
      // column lands on exactly the zero this code used to write by hand.
      // Task 5 drops the columns outright.
      //
      // The new item's opening stock row is the client's second step —
      // `upsertItemStock(itemId, locationId)`, which `useItems`'
      // `runCloudCreate` calls right after this mutation.
      const item = await prisma.item.create({
        data: {
          // Required-field defaults (overridden by input if provided)
          targetUnit: toTargetUnit(targetUnit) ?? 'package',
          // Default 1 (designer ruling, 2026-08-24, reversing 6302ee97's 0),
          // mirroring local mode's createItem (apps/web/src/db/operations.ts):
          // a brand-new item must be valid by nature, so it never opens on
          // ItemForm's `consumeAmount > 0` error. An explicit 0 from a client
          // still survives `??` and still means "no step size".
          consumeAmount: numOr(rest.consumeAmount) ?? 1,
          name: rest.name,
          packageUnit: strOr(rest.packageUnit),
          measurementUnit: strOr(rest.measurementUnit),
          amountPerPackage: numOr(rest.amountPerPackage),
          estimatedDueDays: numOr(rest.estimatedDueDays),
          expirationThreshold: numOr(rest.expirationThreshold),
          expirationMode: toExpirationMode(expirationMode),
          // Issue #335. `strOr` maps an absent or null input to `undefined`,
          // which Prisma writes as NULL on these two nullable columns — the
          // same "no value" the local Dexie `Item` stores by leaving the
          // optional field off. Never '' : an empty string is a different
          // stored value from "never set".
          wikidataUrl: strOr(rest.wikidataUrl),
          note: strOr(rest.note),
          userId,
        },
      })

      if (tagIds?.length) {
        await prisma.itemTag.createMany({
          data: tagIds.map((tagId) => ({ itemId: item.id, tagId })),
        })
      }
      if (vendorIds?.length) {
        await prisma.itemVendor.createMany({
          data: vendorIds.map((vendorId) => ({ itemId: item.id, vendorId })),
        })
      }

      const full = await prisma.item.findUniqueOrThrow({
        where: { id: item.id },
        include: { tags: true, vendors: true },
      })
      return toGraphQL(full)
    },

    updateItem: async (_, { id, input }, ctx) => {
      const userId = requireAuth(ctx)

      // Verify ownership
      const existing = await prisma.item.findFirst({ where: { id, userId } })
      if (!existing) {
        throw new GraphQLError('Item not found', { extensions: { code: 'NOT_FOUND' } })
      }

      const { tagIds, vendorIds } = input

      // `Item` only, and `UpdateItemInput` now makes that the only option:
      // cloud locations PR 5 removed the five per-location state fields from
      // it. Until PR 5 this mutation ALSO mirrored any inline stock fields
      // onto the caller's default `ItemStock` row, for a browser on a pre-PR-2
      // bundle that sent them here with no location to name. Stock is written
      // by `upsertItemStock(itemId, locationId)` and nothing else.
      await prisma.item.update({ where: { id }, data: buildItemUpdateData(input) })

      // Replace junction rows wholesale when the field is explicitly provided
      if (tagIds !== undefined && tagIds !== null) {
        await prisma.itemTag.deleteMany({ where: { itemId: id } })
        if (tagIds.length) {
          await prisma.itemTag.createMany({
            data: tagIds.map((tagId) => ({ itemId: id, tagId })),
          })
        }
      }

      if (vendorIds !== undefined && vendorIds !== null) {
        await prisma.itemVendor.deleteMany({ where: { itemId: id } })
        if (vendorIds.length) {
          await prisma.itemVendor.createMany({
            data: vendorIds.map((vendorId) => ({ itemId: id, vendorId })),
          })
        }
      }

      const full = await prisma.item.findUniqueOrThrow({
        where: { id },
        include: { tags: true, vendors: true },
      })
      return toGraphQL(full)
    },

    deleteItem: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      // Verify ownership before deleting
      const existing = await prisma.item.findFirst({ where: { id, userId } })
      if (!existing) return false
      // Cascade handles InventoryLog, RecipeItem, CartItem, ItemTag, ItemVendor via onDelete: Cascade
      await prisma.item.delete({ where: { id } })
      return true
    },
  },
}
