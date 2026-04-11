import { GraphQLError } from 'graphql'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Item, Resolvers } from '../generated/graphql.js'
import type { ExpirationMode, TargetUnit } from '@prisma/client'
import type { Item as PrismaItem, ItemTag, ItemVendor } from '@prisma/client'

// Map a Prisma item (with junction rows included) to the GraphQL Item shape.
// GraphQL schema types createdAt, updatedAt as String! and dueDate as String.
function toGraphQL(item: PrismaItem & { tags: ItemTag[]; vendors: ItemVendor[] }): Item {
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
    dueDate: item.dueDate ? item.dueDate.toISOString() : null,
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
      const { tagIds, vendorIds, dueDate, expirationMode, targetUnit, ...rest } = input

      const item = await prisma.item.create({
        data: {
          // Required-field defaults (overridden by input if provided)
          targetUnit: toTargetUnit(targetUnit) ?? 'package',
          targetQuantity: numOr(rest.targetQuantity) ?? 0,
          refillThreshold: numOr(rest.refillThreshold) ?? 0,
          packedQuantity: numOr(rest.packedQuantity) ?? 0,
          unpackedQuantity: numOr(rest.unpackedQuantity) ?? 0,
          consumeAmount: numOr(rest.consumeAmount) ?? 1,
          name: rest.name,
          packageUnit: strOr(rest.packageUnit),
          measurementUnit: strOr(rest.measurementUnit),
          amountPerPackage: numOr(rest.amountPerPackage),
          estimatedDueDays: numOr(rest.estimatedDueDays),
          expirationThreshold: numOr(rest.expirationThreshold),
          dueDate: dueDate ? new Date(dueDate) : undefined,
          expirationMode: toExpirationMode(expirationMode),
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

      const { tagIds, vendorIds, dueDate, expirationMode, targetUnit, ...rest } = input

      await prisma.item.update({
        where: { id },
        data: {
          ...(rest.name !== undefined && rest.name !== null ? { name: rest.name } : {}),
          ...(targetUnit !== undefined && targetUnit !== null ? { targetUnit: toTargetUnit(targetUnit) } : {}),
          ...(rest.targetQuantity !== undefined ? { targetQuantity: numOr(rest.targetQuantity) } : {}),
          ...(rest.refillThreshold !== undefined ? { refillThreshold: numOr(rest.refillThreshold) } : {}),
          ...(rest.packedQuantity !== undefined ? { packedQuantity: numOr(rest.packedQuantity) } : {}),
          ...(rest.unpackedQuantity !== undefined ? { unpackedQuantity: numOr(rest.unpackedQuantity) } : {}),
          ...(rest.consumeAmount !== undefined ? { consumeAmount: numOr(rest.consumeAmount) } : {}),
          ...(rest.packageUnit !== undefined ? { packageUnit: strOr(rest.packageUnit) } : {}),
          ...(rest.measurementUnit !== undefined ? { measurementUnit: strOr(rest.measurementUnit) } : {}),
          ...(rest.amountPerPackage !== undefined ? { amountPerPackage: numOr(rest.amountPerPackage) } : {}),
          ...(rest.estimatedDueDays !== undefined ? { estimatedDueDays: numOr(rest.estimatedDueDays) } : {}),
          ...(rest.expirationThreshold !== undefined ? { expirationThreshold: numOr(rest.expirationThreshold) } : {}),
          ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
          ...(expirationMode !== undefined ? { expirationMode: toExpirationMode(expirationMode) } : {}),
        },
      })

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
