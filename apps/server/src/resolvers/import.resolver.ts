import { ItemModel } from '../models/Item.model.js'
import { RecipeModel } from '../models/Recipe.model.js'
import { InventoryLogModel } from '../models/InventoryLog.model.js'
import { CartModel, CartItemModel } from '../models/Cart.model.js'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Cart, CartItem, InventoryLog, Item, Recipe, Resolvers, Tag, TagType, Vendor } from '../generated/graphql.js'
import type { TagColor } from '@prisma/client'

// Strip export-only fields and reassign userId when inserting imported records
function stripForInsert(record: Record<string, unknown>, userId: string): Record<string, unknown> {
  const { id: _id, userId: _userId, createdAt: _c, updatedAt: _u, familyId: _f, ...rest } = record
  return { ...rest, userId }
}

// Build the MongoDB _id override so the imported record keeps its original ID
function withId(record: Record<string, unknown>, userId: string): Record<string, unknown> {
  return { ...stripForInsert(record, userId), _id: record.id }
}

// Mongoose 8 + ordered:false throws BulkWriteError even when some docs succeeded.
// Extract the successfully inserted docs so callers get partial results instead of an error.
// Typed `never` so `.catch(insertedDocsOrRethrow)` preserves the Promise's resolved type.
function insertedDocsOrRethrow(err: unknown): never {
  const bulkErr = err as { insertedDocs?: unknown[] }
  if (Array.isArray(bulkErr?.insertedDocs)) return bulkErr.insertedDocs as never
  throw err
}

export const importResolvers: Pick<Resolvers, 'Mutation'> = {
  Mutation: {
    // -------------------------------------------------------------------------
    // Bulk create — inserts records with original IDs, skips existing ones.
    // Mongoose 8 throws BulkWriteError on duplicate keys even with ordered:false;
    // we catch it and return only the successfully inserted docs (skip semantics).
    // -------------------------------------------------------------------------
    bulkCreateItems: async (_, { items }, ctx) => {
      const userId = requireAuth(ctx)
      if (items.length === 0) return []
      const docs = items.map((item) => withId(item as unknown as Record<string, unknown>, userId))
      const inserted = await ItemModel.insertMany(docs, { ordered: false }).catch(insertedDocsOrRethrow)
      return inserted as unknown as Item[]
    },

    bulkCreateTags: async (_, { tags }, ctx) => {
      const userId = requireAuth(ctx)
      if (tags.length === 0) return []
      const ids = tags.map((t) => (t as unknown as { id: string }).id)
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
      const ids = tagTypes.map((t) => (t as unknown as { id: string }).id)
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
      const ids = vendors.map((v) => (v as unknown as { id: string }).id)
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
      const docs = recipes.map((r) => withId(r as unknown as Record<string, unknown>, userId))
      const inserted = await RecipeModel.insertMany(docs, { ordered: false }).catch(insertedDocsOrRethrow)
      return inserted as unknown as Recipe[]
    },

    bulkCreateInventoryLogs: async (_, { logs }, ctx) => {
      const userId = requireAuth(ctx)
      if (logs.length === 0) return []
      const docs = logs.map((log) => {
        const { id: _id, userId: _userId, familyId: _f, ...rest } = log as unknown as Record<string, unknown>
        return { ...rest, _id, userId, occurredAt: new Date(rest.occurredAt as string) }
      })
      const inserted = await InventoryLogModel.insertMany(docs, { ordered: false }).catch(insertedDocsOrRethrow)
      return inserted.map((l) => ({ ...l.toObject(), id: l._id.toString() })) as unknown as InventoryLog[]
    },

    bulkCreateShoppingCarts: async (_, { carts }, ctx) => {
      const userId = requireAuth(ctx)
      if (carts.length === 0) return []
      const docs = carts.map((cart) => {
        const { id: _id, userId: _userId, familyId: _f, ...rest } = cart as unknown as Record<string, unknown>
        return { ...rest, _id, userId }
      })
      const inserted = await CartModel.insertMany(docs, { ordered: false }).catch(insertedDocsOrRethrow)
      return inserted.map((c) => ({ ...c.toObject(), id: c._id.toString() })) as unknown as Cart[]
    },

    bulkCreateCartItems: async (_, { cartItems }, ctx) => {
      const userId = requireAuth(ctx)
      if (cartItems.length === 0) return []
      const docs = cartItems.map((ci) => {
        const { id: _id, userId: _userId, ...rest } = ci as unknown as Record<string, unknown>
        return { ...rest, _id, userId }
      })
      const inserted = await CartItemModel.insertMany(docs, { ordered: false }).catch(insertedDocsOrRethrow)
      return inserted.map((ci) => ({ ...ci.toObject(), id: ci._id.toString() })) as unknown as CartItem[]
    },

    // -------------------------------------------------------------------------
    // Bulk upsert — inserts or replaces records by their original ID
    // -------------------------------------------------------------------------
    bulkUpsertItems: async (_, { items }, ctx) => {
      const userId = requireAuth(ctx)
      if (items.length === 0) return []
      const ops = items.map((item) => {
        const doc = withId(item as unknown as Record<string, unknown>, userId)
        return {
          replaceOne: {
            filter: { _id: item.id },
            replacement: doc,
            upsert: true,
          },
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ItemModel.bulkWrite(ops as any)
      const ids = items.map((i) => i.id)
      const inserted = await ItemModel.find({ _id: { $in: ids } })
      return inserted as unknown as Item[]
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
      const ops = recipes.map((r) => ({
        replaceOne: {
          filter: { _id: r.id },
          replacement: withId(r as unknown as Record<string, unknown>, userId),
          upsert: true,
        },
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await RecipeModel.bulkWrite(ops as any)
      const inserted = await RecipeModel.find({ _id: { $in: recipes.map((r) => r.id) } })
      return inserted as unknown as Recipe[]
    },

    bulkUpsertInventoryLogs: async (_, { logs }, ctx) => {
      const userId = requireAuth(ctx)
      if (logs.length === 0) return []
      const ops = logs.map((log) => {
        const { id: _id, userId: _userId, familyId: _f, ...rest } = log as unknown as Record<string, unknown>
        const doc = { ...rest, _id, userId, occurredAt: new Date(rest.occurredAt as string) }
        return { replaceOne: { filter: { _id }, replacement: doc, upsert: true } }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await InventoryLogModel.bulkWrite(ops as any)
      const inserted = await InventoryLogModel.find({ _id: { $in: logs.map((l) => l.id) } })
      return inserted.map((l) => ({ ...l.toObject(), id: l._id.toString() })) as unknown as InventoryLog[]
    },

    bulkUpsertShoppingCarts: async (_, { carts }, ctx) => {
      const userId = requireAuth(ctx)
      if (carts.length === 0) return []
      const ops = carts.map((cart) => {
        const { id: _id, userId: _userId, familyId: _f, ...rest } = cart as unknown as Record<string, unknown>
        const doc = { ...rest, _id, userId }
        return { replaceOne: { filter: { _id }, replacement: doc, upsert: true } }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await CartModel.bulkWrite(ops as any)
      const inserted = await CartModel.find({ _id: { $in: carts.map((c) => c.id) } })
      return inserted.map((c) => ({ ...c.toObject(), id: c._id.toString() })) as unknown as Cart[]
    },

    bulkUpsertCartItems: async (_, { cartItems }, ctx) => {
      const userId = requireAuth(ctx)
      if (cartItems.length === 0) return []
      const ops = cartItems.map((ci) => {
        const { id: _id, userId: _userId, ...rest } = ci as unknown as Record<string, unknown>
        const doc = { ...rest, _id, userId }
        return { replaceOne: { filter: { _id }, replacement: doc, upsert: true } }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await CartItemModel.bulkWrite(ops as any)
      const inserted = await CartItemModel.find({ _id: { $in: cartItems.map((ci) => ci.id) } })
      return inserted.map((ci) => ({ ...ci.toObject(), id: ci._id.toString() })) as unknown as CartItem[]
    },

    // -------------------------------------------------------------------------
    // Clear all data — deletes all entities for the authenticated user
    // in dependency order to avoid orphan references
    // -------------------------------------------------------------------------
    clearAllData: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      // Delete in dependency order: dependents first, then dependencies
      await CartItemModel.deleteMany({ userId })
      await CartModel.deleteMany({ userId })
      await InventoryLogModel.deleteMany({ userId })
      await prisma.tag.deleteMany({ where: { userId } })
      await prisma.tagType.deleteMany({ where: { userId } })
      await RecipeModel.deleteMany({ userId })
      await prisma.vendor.deleteMany({ where: { userId } })
      await ItemModel.deleteMany({ userId })
      return true
    },
  },
}
