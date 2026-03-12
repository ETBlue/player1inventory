import { GraphQLError } from 'graphql'
import { FamilyGroupModel } from '../models/FamilyGroup.model.js'
import { requireAuth } from '../context.js'
import type { FamilyGroup, Resolvers } from '../generated/graphql.js'

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export const familyGroupResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'FamilyGroup'> = {
  Query: {
    myFamilyGroup: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      return FamilyGroupModel.findOne({ memberUserIds: userId })
    },
  },
  Mutation: {
    createFamilyGroup: async (_, { name }, ctx) => {
      const userId = requireAuth(ctx)
      const existing = await FamilyGroupModel.findOne({ memberUserIds: userId })
      if (existing)
        throw new GraphQLError('Already in a family group', {
          extensions: { code: 'CONFLICT' },
        })

      let code = generateCode()
      while (await FamilyGroupModel.findOne({ code })) {
        code = generateCode()
      }

      // Cast needed: Mongoose document has Date fields; FamilyGroup field resolvers convert them to strings
      return FamilyGroupModel.create({
        name,
        code,
        ownerUserId: userId,
        memberUserIds: [userId],
      }) as unknown as Promise<FamilyGroup>
    },
    joinFamilyGroup: async (_, { code }, ctx) => {
      const userId = requireAuth(ctx)
      const group = await FamilyGroupModel.findOne({ code })
      if (!group)
        throw new GraphQLError('Family group not found', {
          extensions: { code: 'NOT_FOUND' },
        })
      if (!group.memberUserIds.includes(userId)) {
        group.memberUserIds.push(userId)
        await group.save()
      }
      // Cast needed: Mongoose document has Date fields; FamilyGroup field resolvers convert them to strings
      return group as unknown as FamilyGroup
    },
    leaveFamilyGroup: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const group = await FamilyGroupModel.findOne({ memberUserIds: userId })
      if (!group) return false
      if (group.ownerUserId === userId)
        throw new GraphQLError('Owner must disband the group, not leave it', {
          extensions: { code: 'FORBIDDEN' },
        })
      group.memberUserIds = group.memberUserIds.filter((id) => id !== userId)
      await group.save()
      return true
    },
    disbandFamilyGroup: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const group = await FamilyGroupModel.findOne({ ownerUserId: userId })
      if (!group) return false
      await FamilyGroupModel.deleteOne({ _id: group._id })
      return true
    },
  },
  FamilyGroup: {
    id: (group) =>
      (group as unknown as { _id: { toString(): string } })._id.toString(),
    createdAt: (group) =>
      (group as unknown as { createdAt: Date }).createdAt.toISOString(),
    updatedAt: (group) =>
      (group as unknown as { updatedAt: Date }).updatedAt.toISOString(),
  },
}
