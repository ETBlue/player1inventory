import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Cart, CartItem, InventoryLog, Item, Recipe, Resolvers, Tag, TagType, Vendor } from '../generated/graphql.js'
import type { CartStatus, ExpirationMode, TagColor, TargetUnit } from '@prisma/client'

// Map a Prisma item (with junction rows) to the GraphQL Item shape
function itemToGraphQL(item: {
  id: string
  name: string
  targetUnit: TargetUnit
  targetQuantity: number
  refillThreshold: number
  packedQuantity: number
  unpackedQuantity: number
  consumeAmount: number
  packageUnit?: string | null
  measurementUnit?: string | null
  amountPerPackage?: number | null
  dueDate?: Date | null
  estimatedDueDays?: number | null
  expirationThreshold?: number | null
  expirationMode: ExpirationMode
  userId: string
  familyId?: string | null
  createdAt: Date
  updatedAt: Date
  tags: { tagId: string }[]
  vendors: { vendorId: string }[]
}): Item {
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

export const importResolvers: Pick<Resolvers, 'Mutation'> = {
  Mutation: {
    // -------------------------------------------------------------------------
    // Bulk create — inserts records with original IDs, skips existing ones.
    // -------------------------------------------------------------------------
    bulkCreateItems: async (_, { items }, ctx) => {
      const userId = requireAuth(ctx)
      if (items.length === 0) return []
      const results: Item[] = []
      for (const item of items) {
        const { id, tagIds, vendorIds, createdAt, updatedAt, dueDate, targetUnit, expirationThreshold, ...rest } = item
        // Skip if already exists
        const existing = await prisma.item.findUnique({ where: { id } })
        if (existing) continue
        const expirationMode = (rest as { expirationMode?: string }).expirationMode
        const created = await prisma.item.create({
          data: {
            id,
            ...rest,
            targetUnit: targetUnit as TargetUnit,
            expirationThreshold: expirationThreshold ?? undefined,
            expirationMode: expirationMode
              ? (expirationMode === 'days from purchase' ? 'days_from_purchase' : expirationMode as ExpirationMode)
              : 'disabled',
            dueDate: dueDate ? new Date(dueDate) : undefined,
            createdAt: new Date(createdAt),
            updatedAt: new Date(updatedAt),
            userId,
          },
        })
        if (tagIds?.length) {
          await prisma.itemTag.createMany({
            data: tagIds.map((tagId) => ({ itemId: id, tagId })),
            skipDuplicates: true,
          })
        }
        if (vendorIds?.length) {
          await prisma.itemVendor.createMany({
            data: vendorIds.map((vendorId) => ({ itemId: id, vendorId })),
            skipDuplicates: true,
          })
        }
        const full = await prisma.item.findUniqueOrThrow({
          where: { id: created.id },
          include: { tags: true, vendors: true },
        })
        results.push(itemToGraphQL(full))
      }
      return results
    },

    bulkCreateTags: async (_, { tags }, ctx) => {
      const userId = requireAuth(ctx)
      if (tags.length === 0) return []
      const ids = tags.map((t) => t.id)
      const docs = tags.map((tag) => {
        const { id, userId: _u, familyId: _f, ...rest } = tag as unknown as Record<string, unknown>
        return { id: id as string, ...rest, userId }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.tag.createMany({ data: docs as any, skipDuplicates: true })
      const inserted = await prisma.tag.findMany({ where: { id: { in: ids } } })
      return inserted as unknown as Tag[]
    },

    bulkCreateTagTypes: async (_, { tagTypes }, ctx) => {
      const userId = requireAuth(ctx)
      if (tagTypes.length === 0) return []
      const ids = tagTypes.map((t) => t.id)
      const docs = tagTypes.map((tt) => {
        const { id, userId: _u, familyId: _f, ...rest } = tt as unknown as Record<string, unknown>
        return { id: id as string, ...rest, color: (rest as { color: string }).color as TagColor, userId }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.tagType.createMany({ data: docs as any, skipDuplicates: true })
      const inserted = await prisma.tagType.findMany({ where: { id: { in: ids } } })
      return inserted as unknown as TagType[]
    },

    bulkCreateVendors: async (_, { vendors }, ctx) => {
      const userId = requireAuth(ctx)
      if (vendors.length === 0) return []
      const ids = vendors.map((v) => v.id)
      const docs = vendors.map((v) => {
        const { id, userId: _u, familyId: _f, ...rest } = v as unknown as Record<string, unknown>
        return { id: id as string, ...rest, userId }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.vendor.createMany({ data: docs as any, skipDuplicates: true })
      const inserted = await prisma.vendor.findMany({ where: { id: { in: ids } } })
      return inserted as unknown as Vendor[]
    },

    bulkCreateRecipes: async (_, { recipes }, ctx) => {
      const userId = requireAuth(ctx)
      if (recipes.length === 0) return []
      const results: Recipe[] = []
      for (const recipe of recipes) {
        const { id, items, lastCookedAt } = recipe
        const existing = await prisma.recipe.findUnique({ where: { id } })
        if (existing) continue
        await prisma.recipe.create({
          data: {
            id,
            name: recipe.name,
            userId,
            lastCookedAt: lastCookedAt ? new Date(lastCookedAt) : undefined,
          },
        })
        if (items?.length) {
          await prisma.recipeItem.createMany({
            data: items.map((i) => ({ recipeId: id, itemId: i.itemId, defaultAmount: i.defaultAmount })),
            skipDuplicates: true,
          })
        }
        const full = await prisma.recipe.findUniqueOrThrow({ where: { id }, include: { items: true } })
        results.push(full as unknown as Recipe)
      }
      return results
    },

    bulkCreateInventoryLogs: async (_, { logs }, ctx) => {
      const userId = requireAuth(ctx)
      if (logs.length === 0) return []
      const results: InventoryLog[] = []
      for (const log of logs) {
        const { id, occurredAt, note, ...rest } = log
        const existing = await prisma.inventoryLog.findUnique({ where: { id } })
        if (existing) continue
        const created = await prisma.inventoryLog.create({
          data: {
            id,
            ...rest,
            occurredAt: new Date(occurredAt),
            note: note ?? undefined,
            userId,
          },
        })
        results.push({
          ...created,
          occurredAt: created.occurredAt.toISOString(),
        } as unknown as InventoryLog)
      }
      return results
    },

    bulkCreateShoppingCarts: async (_, { carts }, ctx) => {
      const userId = requireAuth(ctx)
      if (carts.length === 0) return []
      const results: Cart[] = []
      for (const cart of carts) {
        const { id, status, createdAt, completedAt } = cart
        const existing = await prisma.cart.findUnique({ where: { id } })
        if (existing) continue
        const created = await prisma.cart.create({
          data: {
            id,
            status: status as CartStatus,
            createdAt: new Date(createdAt),
            completedAt: completedAt ? new Date(completedAt) : undefined,
            userId,
          },
        })
        results.push({
          ...created,
          createdAt: created.createdAt.toISOString(),
          completedAt: created.completedAt ? created.completedAt.toISOString() : null,
        } as unknown as Cart)
      }
      return results
    },

    bulkCreateCartItems: async (_, { cartItems }, ctx) => {
      const userId = requireAuth(ctx)
      if (cartItems.length === 0) return []
      const results: CartItem[] = []
      for (const ci of cartItems) {
        const { id, cartId, itemId, quantity } = ci
        const existing = await prisma.cartItem.findUnique({ where: { id } })
        if (existing) continue
        const created = await prisma.cartItem.create({
          data: { id, cartId, itemId, quantity, userId },
        })
        results.push(created as unknown as CartItem)
      }
      return results
    },

    // -------------------------------------------------------------------------
    // Bulk upsert — inserts or replaces records by their original ID
    // -------------------------------------------------------------------------
    bulkUpsertItems: async (_, { items }, ctx) => {
      const userId = requireAuth(ctx)
      if (items.length === 0) return []
      const results: Item[] = []
      for (const item of items) {
        const { id, tagIds, vendorIds, createdAt, updatedAt, dueDate, targetUnit, expirationThreshold, ...rest } = item
        const expirationMode = (rest as { expirationMode?: string }).expirationMode
        const data = {
          ...rest,
          targetUnit: targetUnit as TargetUnit,
          expirationThreshold: expirationThreshold ?? undefined,
          expirationMode: expirationMode
            ? (expirationMode === 'days from purchase' ? 'days_from_purchase' : expirationMode as ExpirationMode)
            : 'disabled',
          dueDate: dueDate ? new Date(dueDate) : undefined,
          createdAt: new Date(createdAt),
          updatedAt: new Date(updatedAt),
          userId,
        }
        await prisma.item.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        })
        // Replace junction rows
        await prisma.itemTag.deleteMany({ where: { itemId: id } })
        await prisma.itemVendor.deleteMany({ where: { itemId: id } })
        if (tagIds?.length) {
          await prisma.itemTag.createMany({
            data: tagIds.map((tagId) => ({ itemId: id, tagId })),
          })
        }
        if (vendorIds?.length) {
          await prisma.itemVendor.createMany({
            data: vendorIds.map((vendorId) => ({ itemId: id, vendorId })),
          })
        }
        const full = await prisma.item.findUniqueOrThrow({
          where: { id },
          include: { tags: true, vendors: true },
        })
        results.push(itemToGraphQL(full))
      }
      return results
    },

    bulkUpsertTags: async (_, { tags }, ctx) => {
      const userId = requireAuth(ctx)
      if (tags.length === 0) return []
      await Promise.all(
        tags.map((tag) => {
          const { id, userId: _u, familyId: _f, ...rest } = tag as unknown as Record<string, unknown>
          const data = { ...rest, userId }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return prisma.tag.upsert({ where: { id: id as string }, create: { id: id as string, ...data } as any, update: data as any })
        }),
      )
      const inserted = await prisma.tag.findMany({ where: { id: { in: tags.map((t) => t.id) } } })
      return inserted as unknown as Tag[]
    },

    bulkUpsertTagTypes: async (_, { tagTypes }, ctx) => {
      const userId = requireAuth(ctx)
      if (tagTypes.length === 0) return []
      await Promise.all(
        tagTypes.map((tt) => {
          const { id, userId: _u, familyId: _f, ...rest } = tt as unknown as Record<string, unknown>
          const data = { ...rest, color: (rest as { color: string }).color as TagColor, userId }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return prisma.tagType.upsert({ where: { id: id as string }, create: { id: id as string, ...data } as any, update: data as any })
        }),
      )
      const inserted = await prisma.tagType.findMany({ where: { id: { in: tagTypes.map((t) => t.id) } } })
      return inserted as unknown as TagType[]
    },

    bulkUpsertVendors: async (_, { vendors }, ctx) => {
      const userId = requireAuth(ctx)
      if (vendors.length === 0) return []
      await Promise.all(
        vendors.map((v) => {
          const { id, userId: _u, familyId: _f, ...rest } = v as unknown as Record<string, unknown>
          const data = { ...rest, userId }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return prisma.vendor.upsert({ where: { id: id as string }, create: { id: id as string, ...data } as any, update: data as any })
        }),
      )
      const inserted = await prisma.vendor.findMany({ where: { id: { in: vendors.map((v) => v.id) } } })
      return inserted as unknown as Vendor[]
    },

    bulkUpsertRecipes: async (_, { recipes }, ctx) => {
      const userId = requireAuth(ctx)
      if (recipes.length === 0) return []
      const results: Recipe[] = []
      for (const recipe of recipes) {
        const { id, items, lastCookedAt } = recipe
        const data = {
          name: recipe.name,
          userId,
          lastCookedAt: lastCookedAt ? new Date(lastCookedAt) : undefined,
        }
        await prisma.recipe.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        })
        if (items != null) {
          await prisma.recipeItem.deleteMany({ where: { recipeId: id } })
          if (items.length) {
            await prisma.recipeItem.createMany({
              data: items.map((i) => ({ recipeId: id, itemId: i.itemId, defaultAmount: i.defaultAmount })),
            })
          }
        }
        const full = await prisma.recipe.findUniqueOrThrow({ where: { id }, include: { items: true } })
        results.push(full as unknown as Recipe)
      }
      return results
    },

    bulkUpsertInventoryLogs: async (_, { logs }, ctx) => {
      const userId = requireAuth(ctx)
      if (logs.length === 0) return []
      const results: InventoryLog[] = []
      for (const log of logs) {
        const { id, occurredAt, note, ...rest } = log
        const data = {
          ...rest,
          occurredAt: new Date(occurredAt),
          note: note ?? undefined,
          userId,
        }
        const upserted = await prisma.inventoryLog.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        })
        results.push({
          ...upserted,
          occurredAt: upserted.occurredAt.toISOString(),
        } as unknown as InventoryLog)
      }
      return results
    },

    bulkUpsertShoppingCarts: async (_, { carts }, ctx) => {
      const userId = requireAuth(ctx)
      if (carts.length === 0) return []
      const results: Cart[] = []
      for (const cart of carts) {
        const { id, status, createdAt, completedAt } = cart
        const data = {
          status: status as CartStatus,
          createdAt: new Date(createdAt),
          completedAt: completedAt ? new Date(completedAt) : undefined,
          userId,
        }
        const upserted = await prisma.cart.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        })
        results.push({
          ...upserted,
          createdAt: upserted.createdAt.toISOString(),
          completedAt: upserted.completedAt ? upserted.completedAt.toISOString() : null,
        } as unknown as Cart)
      }
      return results
    },

    bulkUpsertCartItems: async (_, { cartItems }, ctx) => {
      const userId = requireAuth(ctx)
      if (cartItems.length === 0) return []
      const results: CartItem[] = []
      for (const ci of cartItems) {
        const { id, cartId, itemId, quantity } = ci
        const data = { cartId, itemId, quantity, userId }
        const upserted = await prisma.cartItem.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        })
        results.push(upserted as unknown as CartItem)
      }
      return results
    },

    // -------------------------------------------------------------------------
    // Clear all data — deletes all entities for the authenticated user
    // in dependency order to avoid orphan references
    // -------------------------------------------------------------------------
    clearAllData: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      await prisma.$transaction([
        prisma.inventoryLog.deleteMany({ where: { userId } }),
        prisma.cartItem.deleteMany({ where: { userId } }),
        prisma.cart.deleteMany({ where: { userId } }),
        prisma.recipeItem.deleteMany({ where: { recipe: { userId } } }),
        prisma.recipe.deleteMany({ where: { userId } }),
        prisma.itemTag.deleteMany({ where: { item: { userId } } }),
        prisma.itemVendor.deleteMany({ where: { item: { userId } } }),
        prisma.item.deleteMany({ where: { userId } }),
        prisma.tag.deleteMany({ where: { userId } }),
        prisma.tagType.deleteMany({ where: { userId } }),
        prisma.vendor.deleteMany({ where: { userId } }),
      ])
      return true
    },
  },
}
