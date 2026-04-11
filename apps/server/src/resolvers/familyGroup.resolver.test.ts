import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

vi.mock('../lib/prisma.js', () => {
  const store: Record<string, {
    id: string
    name: string
    code: string
    ownerUserId: string
    memberUserIds: string[]
    createdAt: Date
    updatedAt: Date
  }> = {}

  const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    return Object.values(store).find((g) => {
      const memberFilter = where.memberUserIds as { has?: string } | undefined
      if (memberFilter?.has) return g.memberUserIds.includes(memberFilter.has)
      if (where.ownerUserId) return g.ownerUserId === where.ownerUserId
      return false
    }) ?? null
  })

  const findUnique = vi.fn(async ({ where }: { where: { id?: string; code?: string } }) => {
    if (where.id) return store[where.id] ?? null
    if (where.code) return Object.values(store).find((g) => g.code === where.code) ?? null
    return null
  })

  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const id = `grp_${Math.random().toString(36).slice(2)}`
    const now = new Date()
    const group = {
      id,
      name: data.name as string,
      code: data.code as string,
      ownerUserId: data.ownerUserId as string,
      memberUserIds: data.memberUserIds as string[],
      createdAt: now,
      updatedAt: now,
    }
    store[id] = group
    return group
  })

  const update = vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const group = store[where.id]
    if (!group) throw new Error('Not found')
    if (data.memberUserIds) {
      if ((data.memberUserIds as { push?: string }).push) {
        group.memberUserIds = [...group.memberUserIds, (data.memberUserIds as { push: string }).push]
      } else {
        group.memberUserIds = data.memberUserIds as string[]
      }
    }
    group.updatedAt = new Date()
    return group
  })

  const del = vi.fn(async ({ where }: { where: { id: string } }) => {
    delete store[where.id]
    return { count: 1 }
  })

  return {
    prisma: {
      familyGroup: {
        findFirst,
        findUnique,
        create,
        update,
        delete: del,
      },
    },
  }
})

let server: ApolloServer<Context>

beforeAll(async () => {
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

// Re-import prisma mock to clear store between tests
beforeEach(async () => {
  const { prisma } = await import('../lib/prisma.js')
  // Clear the in-memory store by resetting all mock implementations
  vi.clearAllMocks()
  // Re-attach the store-based implementations after clearing
  const store: Record<string, {
    id: string
    name: string
    code: string
    ownerUserId: string
    memberUserIds: string[]
    createdAt: Date
    updatedAt: Date
  }> = {}

  ;(prisma.familyGroup.findFirst as ReturnType<typeof vi.fn>).mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    return Object.values(store).find((g) => {
      const memberFilter = where.memberUserIds as { has?: string } | undefined
      if (memberFilter?.has) return g.memberUserIds.includes(memberFilter.has)
      if (where.ownerUserId) return g.ownerUserId === where.ownerUserId
      return false
    }) ?? null
  })

  ;(prisma.familyGroup.findUnique as ReturnType<typeof vi.fn>).mockImplementation(async ({ where }: { where: { id?: string; code?: string } }) => {
    if (where.id) return store[where.id] ?? null
    if (where.code) return Object.values(store).find((g) => g.code === where.code) ?? null
    return null
  })

  ;(prisma.familyGroup.create as ReturnType<typeof vi.fn>).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const id = `grp_${Math.random().toString(36).slice(2)}`
    const now = new Date()
    const group = {
      id,
      name: data.name as string,
      code: data.code as string,
      ownerUserId: data.ownerUserId as string,
      memberUserIds: data.memberUserIds as string[],
      createdAt: now,
      updatedAt: now,
    }
    store[id] = group
    return group
  })

  ;(prisma.familyGroup.update as ReturnType<typeof vi.fn>).mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const group = store[where.id]
    if (!group) throw new Error('Not found')
    if (data.memberUserIds) {
      if ((data.memberUserIds as { push?: string }).push) {
        group.memberUserIds = [...group.memberUserIds, (data.memberUserIds as { push: string }).push]
      } else {
        group.memberUserIds = data.memberUserIds as string[]
      }
    }
    group.updatedAt = new Date()
    return group
  })

  ;(prisma.familyGroup.delete as ReturnType<typeof vi.fn>).mockImplementation(async ({ where }: { where: { id: string } }) => {
    delete store[where.id]
    return { count: 1 }
  })
})

describe('FamilyGroup resolvers', () => {
  it('user can create a family group', async () => {
    // Given an authenticated user
    const context: Context = { userId: 'user_owner123' }

    // When they create a family group
    const response = await server.executeOperation(
      {
        query: `mutation { createFamilyGroup(name: "The Smiths") { id name code ownerUserId } }`,
      },
      { contextValue: context },
    )

    // Then the group is created with a generated code
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const group = response.body.singleResult.data?.createFamilyGroup as { id: string; name: string; code: string; ownerUserId: string }
      expect(group.name).toBe('The Smiths')
      expect(group.code).toHaveLength(6)
      expect(group.ownerUserId).toBe('user_owner123')
    }
  })

  it('user can join a family group by code', async () => {
    // Given a group exists
    const owner: Context = { userId: 'user_owner' }
    const createResponse = await server.executeOperation(
      { query: `mutation { createFamilyGroup(name: "Test Family") { code } }` },
      { contextValue: owner },
    )
    const code =
      createResponse.body.kind === 'single'
        ? (createResponse.body.singleResult.data?.createFamilyGroup as { code: string }).code
        : null

    // When another user joins by code
    const joiner: Context = { userId: 'user_joiner' }
    const joinResponse = await server.executeOperation(
      {
        query: `mutation JoinGroup($code: String!) { joinFamilyGroup(code: $code) { memberUserIds } }`,
        variables: { code },
      },
      { contextValue: joiner },
    )

    // Then they are added to the group
    expect(joinResponse.body.kind).toBe('single')
    if (joinResponse.body.kind === 'single') {
      expect(joinResponse.body.singleResult.errors).toBeUndefined()
      const members = joinResponse.body.singleResult.data?.joinFamilyGroup as { memberUserIds: string[] }
      expect(members.memberUserIds).toContain('user_joiner')
    }
  })

  it('user can leave a family group', async () => {
    // Given a user is in a group as a member
    const owner: Context = { userId: 'user_owner' }
    const member: Context = { userId: 'user_member' }
    const createResponse = await server.executeOperation(
      { query: `mutation { createFamilyGroup(name: "Test Family") { code } }` },
      { contextValue: owner },
    )
    const code =
      createResponse.body.kind === 'single'
        ? (createResponse.body.singleResult.data?.createFamilyGroup as { code: string }).code
        : null
    await server.executeOperation(
      { query: `mutation { joinFamilyGroup(code: "${code}") { id } }` },
      { contextValue: member },
    )

    // When the member leaves
    const leaveResponse = await server.executeOperation(
      { query: `mutation { leaveFamilyGroup }` },
      { contextValue: member },
    )

    // Then they are removed from the group
    expect(leaveResponse.body.kind).toBe('single')
    if (leaveResponse.body.kind === 'single') {
      expect(leaveResponse.body.singleResult.errors).toBeUndefined()
      expect(leaveResponse.body.singleResult.data?.leaveFamilyGroup).toBe(true)
    }
  })

  it('myFamilyGroup returns null when user is not in any group', async () => {
    // Given a user with no group
    const response = await server.executeOperation(
      { query: `query { myFamilyGroup { id name } }` },
      { contextValue: { userId: 'user_no_group' } },
    )

    // Then null is returned with no errors
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      expect(response.body.singleResult.data?.myFamilyGroup).toBeNull()
    }
  })
})
