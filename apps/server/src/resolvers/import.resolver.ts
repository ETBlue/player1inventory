import { ItemModel } from '../models/Item.model.js'
import { TagModel, TagTypeModel } from '../models/Tag.model.js'
import { VendorModel } from '../models/Vendor.model.js'
import { RecipeModel } from '../models/Recipe.model.js'
import { InventoryLogModel } from '../models/InventoryLog.model.js'
import { CartModel, CartItemModel } from '../models/Cart.model.js'
import { requireAuth } from '../context.js'
import type { Item, Resolvers } from '../generated/graphql.js'

interface ImportPayload {
  version: number
  exportedAt: string
  items: Array<Record<string, unknown>>
  tags: unknown[]
  tagTypes: unknown[]
  vendors: unknown[]
  recipes: unknown[]
  inventoryLogs: unknown[]
  shoppingCarts: unknown[]
  cartItems: unknown[]
}

// Strip export-only fields and reassign userId when inserting imported records
function stripForInsert(record: Record<string, unknown>, userId: string): Record<string, unknown> {
  const { id: _id, userId: _userId, createdAt: _c, updatedAt: _u, familyId: _f, ...rest } = record
  return { ...rest, userId }
}

// Build the MongoDB _id override so the imported record keeps its original ID
function withId(record: Record<string, unknown>, userId: string): Record<string, unknown> {
  return { ...stripForInsert(record, userId), _id: record.id }
}

export const importResolvers: Pick<Resolvers, 'Mutation'> = {
  Mutation: {
    // -------------------------------------------------------------------------
    // Legacy blob import (kept for backwards compatibility)
    // -------------------------------------------------------------------------
    importData: async (_, { payload }, ctx) => {
      const userId = requireAuth(ctx)

      const data = JSON.parse(payload) as ImportPayload

      const items = data.items ?? []
      if (items.length > 0) {
        const docs = items.map(({ id: _id, userId: _userId, createdAt: _c, updatedAt: _u, ...rest }) => ({
          ...rest,
          userId,
        }))
        await ItemModel.insertMany(docs)
      }

      return { itemCount: items.length }
    },

    // -------------------------------------------------------------------------
    // Bulk create — inserts records with original IDs, skips existing ones
    // -------------------------------------------------------------------------
    bulkCreateItems: async (_, { items }, ctx) => {
      const userId = requireAuth(ctx)
      if (items.length === 0) return []
      const docs = items.map((item) => withId(item as unknown as Record<string, unknown>, userId))
      const inserted = await ItemModel.insertMany(docs, { ordered: false })
      return inserted as unknown as Item[]
    },

    bulkCreateTags: async (_, { tags }, ctx) => {
      const userId = requireAuth(ctx)
      if (tags.length === 0) return []
      const docs = tags.map((tag) => withId(tag as unknown as Record<string, unknown>, userId))
      return TagModel.insertMany(docs, { ordered: false })
    },

    bulkCreateTagTypes: async (_, { tagTypes }, ctx) => {
      const userId = requireAuth(ctx)
      if (tagTypes.length === 0) return []
      const docs = tagTypes.map((tt) => withId(tt as unknown as Record<string, unknown>, userId))
      return TagTypeModel.insertMany(docs, { ordered: false })
    },

    bulkCreateVendors: async (_, { vendors }, ctx) => {
      const userId = requireAuth(ctx)
      if (vendors.length === 0) return []
      const docs = vendors.map((v) => withId(v as unknown as Record<string, unknown>, userId))
      return VendorModel.insertMany(docs, { ordered: false })
    },

    bulkCreateRecipes: async (_, { recipes }, ctx) => {
      const userId = requireAuth(ctx)
      if (recipes.length === 0) return []
      const docs = recipes.map((r) => withId(r as unknown as Record<string, unknown>, userId))
      return RecipeModel.insertMany(docs, { ordered: false })
    },

    bulkCreateInventoryLogs: async (_, { logs }, ctx) => {
      const userId = requireAuth(ctx)
      if (logs.length === 0) return []
      const docs = logs.map((log) => {
        const { id: _id, userId: _userId, familyId: _f, ...rest } = log as unknown as Record<string, unknown>
        return { ...rest, _id, userId, occurredAt: new Date(rest.occurredAt as string) }
      })
      const inserted = await InventoryLogModel.insertMany(docs, { ordered: false })
      return inserted.map((l) => ({ ...l.toObject(), id: l._id.toString() }))
    },

    bulkCreateShoppingCarts: async (_, { carts }, ctx) => {
      const userId = requireAuth(ctx)
      if (carts.length === 0) return []
      const docs = carts.map((cart) => {
        const { id: _id, userId: _userId, familyId: _f, ...rest } = cart as unknown as Record<string, unknown>
        return { ...rest, _id, userId }
      })
      const inserted = await CartModel.insertMany(docs, { ordered: false })
      return inserted.map((c) => ({ ...c.toObject(), id: c._id.toString() }))
    },

    bulkCreateCartItems: async (_, { cartItems }, ctx) => {
      const userId = requireAuth(ctx)
      if (cartItems.length === 0) return []
      const docs = cartItems.map((ci) => {
        const { id: _id, userId: _userId, ...rest } = ci as unknown as Record<string, unknown>
        return { ...rest, _id, userId }
      })
      const inserted = await CartItemModel.insertMany(docs, { ordered: false })
      return inserted.map((ci) => ({ ...ci.toObject(), id: ci._id.toString() }))
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
      await ItemModel.bulkWrite(ops)
      const ids = items.map((i) => i.id)
      const inserted = await ItemModel.find({ _id: { $in: ids } })
      return inserted as unknown as Item[]
    },

    bulkUpsertTags: async (_, { tags }, ctx) => {
      const userId = requireAuth(ctx)
      if (tags.length === 0) return []
      const ops = tags.map((tag) => ({
        replaceOne: {
          filter: { _id: tag.id },
          replacement: withId(tag as unknown as Record<string, unknown>, userId),
          upsert: true,
        },
      }))
      await TagModel.bulkWrite(ops)
      return TagModel.find({ _id: { $in: tags.map((t) => t.id) } })
    },

    bulkUpsertTagTypes: async (_, { tagTypes }, ctx) => {
      const userId = requireAuth(ctx)
      if (tagTypes.length === 0) return []
      const ops = tagTypes.map((tt) => ({
        replaceOne: {
          filter: { _id: tt.id },
          replacement: withId(tt as unknown as Record<string, unknown>, userId),
          upsert: true,
        },
      }))
      await TagTypeModel.bulkWrite(ops)
      return TagTypeModel.find({ _id: { $in: tagTypes.map((t) => t.id) } })
    },

    bulkUpsertVendors: async (_, { vendors }, ctx) => {
      const userId = requireAuth(ctx)
      if (vendors.length === 0) return []
      const ops = vendors.map((v) => ({
        replaceOne: {
          filter: { _id: v.id },
          replacement: withId(v as unknown as Record<string, unknown>, userId),
          upsert: true,
        },
      }))
      await VendorModel.bulkWrite(ops)
      return VendorModel.find({ _id: { $in: vendors.map((v) => v.id) } })
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
      await RecipeModel.bulkWrite(ops)
      return RecipeModel.find({ _id: { $in: recipes.map((r) => r.id) } })
    },

    bulkUpsertInventoryLogs: async (_, { logs }, ctx) => {
      const userId = requireAuth(ctx)
      if (logs.length === 0) return []
      const ops = logs.map((log) => {
        const { id: _id, userId: _userId, familyId: _f, ...rest } = log as unknown as Record<string, unknown>
        const doc = { ...rest, _id, userId, occurredAt: new Date(rest.occurredAt as string) }
        return { replaceOne: { filter: { _id }, replacement: doc, upsert: true } }
      })
      await InventoryLogModel.bulkWrite(ops)
      const inserted = await InventoryLogModel.find({ _id: { $in: logs.map((l) => l.id) } })
      return inserted.map((l) => ({ ...l.toObject(), id: l._id.toString() }))
    },

    bulkUpsertShoppingCarts: async (_, { carts }, ctx) => {
      const userId = requireAuth(ctx)
      if (carts.length === 0) return []
      const ops = carts.map((cart) => {
        const { id: _id, userId: _userId, familyId: _f, ...rest } = cart as unknown as Record<string, unknown>
        const doc = { ...rest, _id, userId }
        return { replaceOne: { filter: { _id }, replacement: doc, upsert: true } }
      })
      await CartModel.bulkWrite(ops)
      const inserted = await CartModel.find({ _id: { $in: carts.map((c) => c.id) } })
      return inserted.map((c) => ({ ...c.toObject(), id: c._id.toString() }))
    },

    bulkUpsertCartItems: async (_, { cartItems }, ctx) => {
      const userId = requireAuth(ctx)
      if (cartItems.length === 0) return []
      const ops = cartItems.map((ci) => {
        const { id: _id, userId: _userId, ...rest } = ci as unknown as Record<string, unknown>
        const doc = { ...rest, _id, userId }
        return { replaceOne: { filter: { _id }, replacement: doc, upsert: true } }
      })
      await CartItemModel.bulkWrite(ops)
      const inserted = await CartItemModel.find({ _id: { $in: cartItems.map((ci) => ci.id) } })
      return inserted.map((ci) => ({ ...ci.toObject(), id: ci._id.toString() }))
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
      await TagModel.deleteMany({ userId })
      await TagTypeModel.deleteMany({ userId })
      await RecipeModel.deleteMany({ userId })
      await VendorModel.deleteMany({ userId })
      await ItemModel.deleteMany({ userId })
      return true
    },
  },
}
