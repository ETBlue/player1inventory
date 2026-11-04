import { GraphQLError } from 'graphql'
import {
  requireCatalogIds,
  requireCatalogRole,
  requireOwnRowOrUnclaimed,
} from '../lib/authz.js'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Resolvers, Tag, TagType } from '../generated/graphql.js'
import type { TagColor } from '@prisma/client'

// ── Household scope (households H3a, task 3.7) ──
//
// Every read needs household role `member` and every write `manager`
// (design, *Household roles*), through `requireCatalogRole` (lib/authz.ts).
// Reads are filtered by the caller's household.
//
// Every write below that names an existing row then asks
// `requireOwnRowOrUnclaimed` (lib/authz.ts). It throws FORBIDDEN for a row of
// another household, so a refused call writes nothing. A `typeId` or
// `parentId` the tag will POINT AT goes through `requireCatalogIds`: another
// household's row is FORBIDDEN, and an id no row holds is BAD_USER_INPUT (as
// since `fix/catalog-write-scope`; before that it failed later, as a
// foreign-key error from Postgres). No call site here compares a `userId` or
// a `householdId`: root CLAUDE.md forbids that as an authorization check.
// Before 2026-11-04 these writes used `where: { id }` alone — see
// docs/global/bugs/2026-11-04-bug-unscoped-catalog-writes.md.

export const tagResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    tagTypes: async (_, __, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'member')
      return prisma.tagType.findMany({ where: { householdId } }) as unknown as Promise<TagType[]>
    },
    tags: async (_, __, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'member')
      return prisma.tag.findMany({ where: { householdId } }) as unknown as Promise<Tag[]>
    },
    tagsByType: async (_, { typeId }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'member')
      return prisma.tag.findMany({ where: { householdId, typeId } }) as unknown as Promise<Tag[]>
    },
    tagCountByType: async (_, { typeId }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'member')
      return prisma.tag.count({ where: { householdId, typeId } })
    },
  },
  Mutation: {
    createTagType: async (_, { name, color }, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireCatalogRole(ctx, 'manager')
      return prisma.tagType.create({
        // `userId` is still written until task 3.14 drops the column.
        data: { name, color: color as TagColor, householdId, userId },
      }) as unknown as Promise<TagType>
    },
    updateTagType: async (_, { id, name, color }, ctx) => {
      await requireCatalogRole(ctx, 'manager')
      if ((await requireOwnRowOrUnclaimed(ctx, 'tagType', id)) === 'unclaimed') {
        throw new GraphQLError('TagType not found', { extensions: { code: 'NOT_FOUND' } })
      }
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
      const householdId = await requireCatalogRole(ctx, 'manager')
      // The row check FIRST, so a refused call deletes none of the
      // household's own tags either. A missing type returns false, as before.
      if ((await requireOwnRowOrUnclaimed(ctx, 'tagType', id)) === 'unclaimed') return false
      // Cascade: delete all tags of this type (and their ItemTag rows via DB cascade), then delete the type.
      // Only the household's tags. Tag_typeId_fkey is ON DELETE NO ACTION (it
      // was RESTRICT before the add_households migration; both refuse here),
      // so if another household holds a tag of this type (`createTag` did not
      // check `typeId` before 2026-11-04), the delete below fails and this
      // returns false.
      await prisma.tag.deleteMany({ where: { typeId: id, householdId } })
      try {
        await prisma.tagType.delete({ where: { id } })
        return true
      } catch {
        return false
      }
    },
    createTag: async (_, { name, typeId, parentId }, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireCatalogRole(ctx, 'manager')
      await requireCatalogIds(ctx, householdId, 'tagType', [typeId])
      // `parentId: null` (or omitted) means a top-level tag, and is allowed.
      if (parentId != null) await requireCatalogIds(ctx, householdId, 'tag', [parentId])
      return prisma.tag.create({
        // `userId` is still written until task 3.14 drops the column.
        data: { name, typeId, householdId, userId, parentId: parentId ?? null },
      }) as unknown as Promise<Tag>
    },
    updateTag: async (_, { id, name, typeId, parentId }, ctx) => {
      const householdId = await requireCatalogRole(ctx, 'manager')
      if ((await requireOwnRowOrUnclaimed(ctx, 'tag', id)) === 'unclaimed') {
        throw new GraphQLError('Tag not found', { extensions: { code: 'NOT_FOUND' } })
      }
      // `typeId: null` cannot be written (the column is NOT NULL), so it is
      // left to Prisma to refuse, as before.
      if (typeId != null) await requireCatalogIds(ctx, householdId, 'tagType', [typeId])
      if (parentId != null) await requireCatalogIds(ctx, householdId, 'tag', [parentId])
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
      const householdId = await requireCatalogRole(ctx, 'manager')
      // The ROOT is checked first, so a refused call changes nothing.
      const scope = await requireOwnRowOrUnclaimed(ctx, 'tag', id)
      // A missing tag keeps the results it had before: true with
      // deleteChildren (an empty bulk delete), false without (a failed delete).
      if (scope === 'unclaimed') return Boolean(deleteChildren)

      // The descendant walk and the orphaning step below are scoped to the
      // household's rows by a `householdId` FILTER, not a guard. They must be:
      // until 2026-11-04 `createTag` did not check `parentId`, so another
      // household's tag may sit under this one. That tag is not deleted and
      // not written here. When this root is deleted, Postgres sets its
      // `parentId` to null (Tag_parentId_fkey is ON DELETE SET NULL).
      if (deleteChildren) {
        // Collect all descendant IDs recursively, then delete in bulk
        const collectDescendants = async (parentId: string): Promise<string[]> => {
          const children = await prisma.tag.findMany({
            where: { parentId, householdId },
            select: { id: true },
          })
          const childIds = children.map((c) => c.id)
          const nested = await Promise.all(childIds.map(collectDescendants))
          return [...childIds, ...nested.flat()]
        }
        const descendantIds = await collectDescendants(id)
        // Every id here is the household's: the root passed the check above,
        // and the walk reads only the household's rows. So the bulk delete
        // below needs no filter of its own.
        const allIds = [id, ...descendantIds]
        // ItemTag rows are deleted by DB cascade (onDelete: Cascade on ItemTag.tag)
        await prisma.tag.deleteMany({ where: { id: { in: allIds } } })
        return true
      }

      // Orphan children: clear their parentId so they become top-level
      await prisma.tag.updateMany({ where: { parentId: id, householdId }, data: { parentId: null } })
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
