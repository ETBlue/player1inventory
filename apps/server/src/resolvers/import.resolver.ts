import { ItemModel } from '../models/Item.model.js'
import { requireAuth } from '../context.js'
import type { Resolvers } from '../generated/graphql.js'

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

export const importResolvers: Pick<Resolvers, 'Mutation'> = {
  Mutation: {
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
  },
}
