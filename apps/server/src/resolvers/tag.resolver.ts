import { GraphQLError } from 'graphql'
import { ItemModel } from '../models/Item.model.js'
import { TagModel, TagTypeModel } from '../models/Tag.model.js'
import { requireAuth } from '../context.js'
import type { Resolvers, Tag, TagType } from '../generated/graphql.js'

export const tagResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'TagType' | 'Tag'> = {
  Query: {
    tagTypes: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return TagTypeModel.find({ userId }) as unknown as Promise<TagType[]>
    },
    tags: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return TagModel.find({ userId }) as unknown as Promise<Tag[]>
    },
    tagsByType: async (_, { typeId }, ctx) => {
      const userId = requireAuth(ctx)
      return TagModel.find({ userId, typeId }) as unknown as Promise<Tag[]>
    },
    tagCountByType: async (_, { typeId }, ctx) => {
      const userId = requireAuth(ctx)
      return TagModel.countDocuments({ userId, typeId })
    },
  },
  Mutation: {
    createTagType: async (_, { name, color }, ctx) => {
      const userId = requireAuth(ctx)
      return TagTypeModel.create({ name, color, userId }) as unknown as Promise<TagType>
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
      return tagType as unknown as TagType
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
    createTag: async (_, { name, typeId, parentId }, ctx) => {
      const userId = requireAuth(ctx)
      return TagModel.create({ name, typeId, userId, ...(parentId !== undefined && { parentId }) }) as unknown as Promise<Tag>
    },
    updateTag: async (_, { id, name, typeId, parentId }, ctx) => {
      const userId = requireAuth(ctx)
      const updates: Record<string, unknown> = {}
      if (name !== undefined) updates.name = name
      if (typeId !== undefined) updates.typeId = typeId
      if (parentId !== undefined) updates.parentId = parentId
      if (parentId === null) updates.parentId = undefined
      const tag = await TagModel.findOneAndUpdate(
        { _id: id, userId },
        { $set: updates },
        { new: true },
      )
      if (!tag) throw new GraphQLError('Tag not found', { extensions: { code: 'NOT_FOUND' } })
      return tag as unknown as Tag
    },
    deleteTag: async (_, { id, deleteChildren }, ctx) => {
      const userId = requireAuth(ctx)
      // Helper: recursively delete a tag and all its descendants
      const deleteTagAndChildren = async (tagId: string): Promise<void> => {
        const children = await TagModel.find({ userId, parentId: tagId }, { _id: 1 })
        for (const child of children) {
          await deleteTagAndChildren((child as unknown as { _id: { toString(): string } })._id.toString())
        }
        await ItemModel.updateMany({ userId, tagIds: tagId }, { $pull: { tagIds: tagId } })
        await TagModel.deleteOne({ _id: tagId, userId })
      }

      if (deleteChildren) {
        // Recursively delete all child tags and their descendants
        await deleteTagAndChildren(id)
        return true
      }

      // Orphan children: unset parentId on direct children so they become top-level
      await TagModel.updateMany({ userId, parentId: id }, { $unset: { parentId: '' } })
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
