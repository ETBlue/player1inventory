import { GraphQLError } from 'graphql'
import { ItemModel } from '../models/Item.model.js'
import { TagModel, TagTypeModel } from '../models/Tag.model.js'
import { requireAuth } from '../context.js'
import type { Resolvers } from '../generated/graphql.js'

export const tagResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'TagType' | 'Tag'> = {
  Query: {
    tagTypes: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return TagTypeModel.find({ userId })
    },
    tags: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return TagModel.find({ userId })
    },
    tagsByType: async (_, { typeId }, ctx) => {
      const userId = requireAuth(ctx)
      return TagModel.find({ userId, typeId })
    },
    tagCountByType: async (_, { typeId }, ctx) => {
      const userId = requireAuth(ctx)
      return TagModel.countDocuments({ userId, typeId })
    },
  },
  Mutation: {
    createTagType: async (_, { name, color }, ctx) => {
      const userId = requireAuth(ctx)
      return TagTypeModel.create({ name, color, userId })
    },
    updateTagType: async (_, { id, name, color }, ctx) => {
      const userId = requireAuth(ctx)
      const updates: Record<string, unknown> = {}
      if (name !== undefined) updates.name = name
      if (color !== undefined) updates.color = color
      const tagType = await TagTypeModel.findOneAndUpdate(
        { _id: id, userId },
        { $set: updates },
        { new: true },
      )
      if (!tagType) throw new GraphQLError('TagType not found', { extensions: { code: 'NOT_FOUND' } })
      return tagType
    },
    deleteTagType: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      // Cascade: remove all tags of this type, then clean up items
      const tags = await TagModel.find({ userId, typeId: id }, { _id: 1 })
      const tagIds = tags.map((t) => (t as unknown as { _id: { toString(): string } })._id.toString())
      if (tagIds.length > 0) {
        await ItemModel.updateMany({ userId, tagIds: { $in: tagIds } }, { $pull: { tagIds: { $in: tagIds } } })
        await TagModel.deleteMany({ userId, typeId: id })
      }
      const result = await TagTypeModel.deleteOne({ _id: id, userId })
      return result.deletedCount > 0
    },
    createTag: async (_, { name, typeId }, ctx) => {
      const userId = requireAuth(ctx)
      return TagModel.create({ name, typeId, userId })
    },
    updateTag: async (_, { id, name, typeId }, ctx) => {
      const userId = requireAuth(ctx)
      const updates: Record<string, unknown> = {}
      if (name !== undefined) updates.name = name
      if (typeId !== undefined) updates.typeId = typeId
      const tag = await TagModel.findOneAndUpdate(
        { _id: id, userId },
        { $set: updates },
        { new: true },
      )
      if (!tag) throw new GraphQLError('Tag not found', { extensions: { code: 'NOT_FOUND' } })
      return tag
    },
    deleteTag: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      // Cascade: remove tagId from all items before deleting
      await ItemModel.updateMany({ userId, tagIds: id }, { $pull: { tagIds: id } })
      const result = await TagModel.deleteOne({ _id: id, userId })
      return result.deletedCount > 0
    },
  },
  TagType: {
    id: (tagType) => (tagType as unknown as { _id: { toString(): string } })._id.toString(),
  },
  Tag: {
    id: (tag) => (tag as unknown as { _id: { toString(): string } })._id.toString(),
  },
}
