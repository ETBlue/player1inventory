import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import { FamilyGroupModel } from '../models/FamilyGroup.model.js'
import type { Context } from '../context.js'

let mongod: MongoMemoryServer
let server: ApolloServer<Context>

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
}, 120000)

afterAll(async () => {
  await server.stop()
  await mongoose.disconnect()
  await mongod.stop()
})

afterEach(async () => {
  await FamilyGroupModel.deleteMany({})
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
      expect(leaveResponse.body.singleResult.data?.leaveFamilyGroup).toBe(true)
    }
  })
})
