import { GraphQLError } from 'graphql'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../context.js'
import type { Resolvers } from '../generated/graphql.js'

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export const familyGroupResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'FamilyGroup'> = {
  Query: {
    myFamilyGroup: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const group = await prisma.familyGroup.findFirst({
        where: { memberUserIds: { has: userId } },
      })
      if (!group) return null
      return {
        ...group,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    },
  },
  Mutation: {
    createFamilyGroup: async (_, { name }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await prisma.familyGroup.findFirst({
        where: { memberUserIds: { has: userId } },
      })
      if (existing)
        throw new GraphQLError('Already in a family group', {
          extensions: { code: 'CONFLICT' },
        })

      let code = generateCode()
      while (await prisma.familyGroup.findUnique({ where: { code } })) {
        code = generateCode()
      }

      const group = await prisma.familyGroup.create({
        data: { name, code, ownerUserId: userId, memberUserIds: [userId] },
      })
      return {
        ...group,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    },

    joinFamilyGroup: async (_, { code }, ctx) => {
      const userId = requireAuth(ctx)
      const group = await prisma.familyGroup.findUnique({ where: { code } })
      if (!group)
        throw new GraphQLError('Family group not found', {
          extensions: { code: 'NOT_FOUND' },
        })

      let updated = group
      if (!group.memberUserIds.includes(userId)) {
        updated = await prisma.familyGroup.update({
          where: { id: group.id },
          data: { memberUserIds: { push: userId } },
        })
      }
      return {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    },

    leaveFamilyGroup: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const group = await prisma.familyGroup.findFirst({
        where: { memberUserIds: { has: userId } },
      })
      if (!group) return false
      if (group.ownerUserId === userId)
        throw new GraphQLError('Owner must disband the group, not leave it', {
          extensions: { code: 'FORBIDDEN' },
        })
      await prisma.familyGroup.update({
        where: { id: group.id },
        data: { memberUserIds: group.memberUserIds.filter((id) => id !== userId) },
      })
      return true
    },

    disbandFamilyGroup: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const group = await prisma.familyGroup.findFirst({
        where: { memberUserIds: { has: userId } },
      })
      if (!group) return false
      if (group.ownerUserId !== userId)
        throw new GraphQLError('Only the owner can disband the group', {
          extensions: { code: 'FORBIDDEN' },
        })
      await prisma.familyGroup.delete({ where: { id: group.id } })
      return true
    },
  },
  // No field resolvers needed — date fields are already serialised to ISO strings above
  FamilyGroup: {},
}
