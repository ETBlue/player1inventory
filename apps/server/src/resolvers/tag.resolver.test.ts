import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import { TagModel, TagTypeModel } from '../models/Tag.model.js'
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
  await TagTypeModel.deleteMany({})
  await TagModel.deleteMany({})
})

const ctx: Context = { userId: 'user_test123' }

describe('TagType resolvers', () => {
  it('user can create a tag type via GraphQL', async () => {
    // When user creates a tag type
    const response = await server.executeOperation(
      {
        query: `mutation CreateTagType($name: String!, $color: String!) {
          createTagType(name: $name, color: $color) { id name color userId }
        }`,
        variables: { name: 'Category', color: 'teal' },
      },
      { contextValue: ctx },
    )

    // Then tag type is returned with userId
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const tagType = response.body.singleResult.data?.createTagType as {
        id: string; name: string; color: string; userId: string
      }
      expect(tagType.name).toBe('Category')
      expect(tagType.color).toBe('teal')
      expect(tagType.userId).toBe('user_test123')
      expect(tagType.id).toBeDefined()
    }
  })

  it('user can list their tag types', async () => {
    // Given a tag type exists
    await TagTypeModel.create({ name: 'Category', color: 'teal', userId: 'user_test123' })

    // When user queries tag types
    const response = await server.executeOperation(
      { query: `query { tagTypes { id name color } }` },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const tagTypes = response.body.singleResult.data?.tagTypes as { id: string }[]
      expect(Array.isArray(tagTypes)).toBe(true)
      expect(tagTypes.length).toBe(1)
    }
  })
})

describe('Tag resolvers', () => {
  it('user can create a tag via GraphQL', async () => {
    // Given a tag type exists
    const tagType = await TagTypeModel.create({ name: 'Category', color: 'teal', userId: 'user_test123' })

    // When user creates a tag
    const response = await server.executeOperation(
      {
        query: `mutation CreateTag($name: String!, $typeId: String!) {
          createTag(name: $name, typeId: $typeId) { id name typeId userId }
        }`,
        variables: { name: 'Dairy', typeId: tagType.id },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const tag = response.body.singleResult.data?.createTag as {
        id: string; name: string; typeId: string; userId: string
      }
      expect(tag.name).toBe('Dairy')
      expect(tag.typeId).toBe(tagType.id)
      expect(tag.userId).toBe('user_test123')
    }
  })

  it('user can list their tags', async () => {
    // Given a tag exists
    await TagModel.create({ name: 'Dairy', typeId: 'type_1', userId: 'user_test123' })

    // When user queries tags
    const response = await server.executeOperation(
      { query: `query { tags { id name typeId } }` },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const tags = response.body.singleResult.data?.tags as { id: string }[]
      expect(Array.isArray(tags)).toBe(true)
      expect(tags.length).toBe(1)
    }
  })
})
