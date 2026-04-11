import { GraphQLError } from 'graphql'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Resolvers, Tag, TagType } from '../generated/graphql.js'
import type { TagColor } from '@prisma/client'

export const tagResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    tagTypes: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.tagType.findMany({ where: { userId } }) as unknown as Promise<TagType[]>
    },
    tags: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.tag.findMany({ where: { userId } }) as unknown as Promise<Tag[]>
    },
    tagsByType: async (_, { typeId }, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.tag.findMany({ where: { userId, typeId } }) as unknown as Promise<Tag[]>
    },
    tagCountByType: async (_, { typeId }, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.tag.count({ where: { userId, typeId } })
    },
  },
  Mutation: {
    createTagType: async (_, { name, color }, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.tagType.create({
        data: { name, color: color as TagColor, userId },
      }) as unknown as Promise<TagType>
    },
    updateTagType: async (_, { id, name, color }, ctx) => {
      requireAuth(ctx)
      const data: Record<string, unknown> = {}
      if (name !== undefined) data.name = name
      if (color !== undefined) data.color = color as TagColor
      try {
        return await prisma.tagType.update({
          where: { id },
          data,
        }) as unknown as TagType
      } catch {
        throw new GraphQLError('TagType not found', { extensions: { code: 'NOT_FOUND' } })
      }
    },
    deleteTagType: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      // Cascade: delete all tags of this type (and their ItemTag rows via DB cascade), then delete the type
      await prisma.tag.deleteMany({ where: { typeId: id, userId } })
      try {
        await prisma.tagType.delete({ where: { id } })
        return true
      } catch {
        return false
      }
    },
    createTag: async (_, { name, typeId, parentId }, ctx) => {
      const userId = requireAuth(ctx)
      return prisma.tag.create({
        data: { name, typeId, userId, parentId: parentId ?? null },
      }) as unknown as Promise<Tag>
    },
    updateTag: async (_, { id, name, typeId, parentId }, ctx) => {
      requireAuth(ctx)
      const data: Record<string, unknown> = {}
      if (name !== undefined) data.name = name
      if (typeId !== undefined) data.typeId = typeId
      // parentId: null means "unset parent"; undefined means "no change"
      if (parentId !== undefined) data.parentId = parentId ?? null
      try {
        return await prisma.tag.update({ where: { id }, data }) as unknown as Tag
      } catch {
        throw new GraphQLError('Tag not found', { extensions: { code: 'NOT_FOUND' } })
      }
    },
    deleteTag: async (_, { id, deleteChildren }, ctx) => {
      requireAuth(ctx)
      if (deleteChildren) {
        // Collect all descendant IDs recursively, then delete in bulk
        const collectDescendants = async (parentId: string): Promise<string[]> => {
          const children = await prisma.tag.findMany({ where: { parentId }, select: { id: true } })
          const childIds = children.map((c) => c.id)
          const nested = await Promise.all(childIds.map(collectDescendants))
          return [...childIds, ...nested.flat()]
        }
        const descendantIds = await collectDescendants(id)
        const allIds = [id, ...descendantIds]
        // ItemTag rows are deleted by DB cascade (onDelete: Cascade on ItemTag.tag)
        await prisma.tag.deleteMany({ where: { id: { in: allIds } } })
        return true
      }

      // Orphan children: clear their parentId so they become top-level
      await prisma.tag.updateMany({ where: { parentId: id }, data: { parentId: null } })
      // ItemTag rows for this tag are deleted by DB cascade
      try {
        await prisma.tag.delete({ where: { id } })
        return true
      } catch {
        return false
      }
    },
  },
}
