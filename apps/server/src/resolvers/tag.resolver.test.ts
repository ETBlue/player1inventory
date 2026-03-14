import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import { ItemModel } from '../models/Item.model.js'
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
  await ItemModel.deleteMany({})
})

const ctx: Context = { userId: 'user_test123' }

// ─── helpers ────────────────────────────────────────────────────────────────

async function createTagType(name = 'Category', color = 'teal') {
  const r = await server.executeOperation(
    {
      query: `mutation($name: String!, $color: String!) {
        createTagType(name: $name, color: $color) { id }
      }`,
      variables: { name, color },
    },
    { contextValue: ctx },
  )
  return (r.body.kind === 'single' ? r.body.singleResult.data?.createTagType : null) as { id: string }
}

async function createTag(name: string, typeId: string) {
  const r = await server.executeOperation(
    {
      query: `mutation($name: String!, $typeId: String!) {
        createTag(name: $name, typeId: $typeId) { id }
      }`,
      variables: { name, typeId },
    },
    { contextValue: ctx },
  )
  return (r.body.kind === 'single' ? r.body.singleResult.data?.createTag : null) as { id: string }
}

// ─── TagType resolvers ───────────────────────────────────────────────────────

describe('TagType resolvers', () => {
  it('user can create a tag type via GraphQL', async () => {
    const response = await server.executeOperation(
      {
        query: `mutation CreateTagType($name: String!, $color: String!) {
          createTagType(name: $name, color: $color) { id name color userId }
        }`,
        variables: { name: 'Category', color: 'teal' },
      },
      { contextValue: ctx },
    )

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
    await TagTypeModel.create({ name: 'Category', color: 'teal', userId: 'user_test123' })

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

  it('user can update a tag type', async () => {
    // Given a tag type exists
    const { id } = await createTagType('Old Name', 'teal')

    // When updating name and color
    const response = await server.executeOperation(
      {
        query: `mutation UpdateTagType($id: ID!, $name: String, $color: String) {
          updateTagType(id: $id, name: $name, color: $color) { id name color }
        }`,
        variables: { id, name: 'New Name', color: 'red' },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const tagType = response.body.singleResult.data?.updateTagType as { name: string; color: string }
      expect(tagType.name).toBe('New Name')
      expect(tagType.color).toBe('red')
    }
  })

  it('user can delete a tag type', async () => {
    const { id } = await createTagType()

    const response = await server.executeOperation(
      {
        query: `mutation DeleteTagType($id: ID!) { deleteTagType(id: $id) }`,
        variables: { id },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.deleteTagType).toBe(true)
    }
  })

  it('does not return tag types belonging to another user', async () => {
    await TagTypeModel.create({ name: 'Other User Type', color: 'teal', userId: 'user_A' })

    const response = await server.executeOperation(
      { query: `query { tagTypes { id } }` },
      { contextValue: { userId: 'user_B' } },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.tagTypes).toHaveLength(0)
    }
  })

  it('user can get tag count per type', async () => {
    // Given a tag type with 2 tags
    const { id: typeId } = await createTagType()
    await createTag('Dairy', typeId)
    await createTag('Meat', typeId)

    // When querying tag count for that type
    const response = await server.executeOperation(
      {
        query: `query TagCountByType($typeId: String!) { tagCountByType(typeId: $typeId) }`,
        variables: { typeId },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.tagCountByType).toBe(2)
    }
  })
})

// ─── Tag resolvers ───────────────────────────────────────────────────────────

describe('Tag resolvers', () => {
  it('user can create a tag via GraphQL', async () => {
    const { id: typeId } = await createTagType()

    const response = await server.executeOperation(
      {
        query: `mutation CreateTag($name: String!, $typeId: String!) {
          createTag(name: $name, typeId: $typeId) { id name typeId userId }
        }`,
        variables: { name: 'Dairy', typeId },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const tag = response.body.singleResult.data?.createTag as {
        id: string; name: string; typeId: string; userId: string
      }
      expect(tag.name).toBe('Dairy')
      expect(tag.typeId).toBe(typeId)
      expect(tag.userId).toBe('user_test123')
    }
  })

  it('user can list their tags', async () => {
    await TagModel.create({ name: 'Dairy', typeId: 'type_1', userId: 'user_test123' })

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

  it('user can list tags by type', async () => {
    // Given two tags in different types
    const { id: typeId } = await createTagType()
    await createTag('Dairy', typeId)
    await TagModel.create({ name: 'Other', typeId: 'other_type', userId: 'user_test123' })

    const response = await server.executeOperation(
      {
        query: `query TagsByType($typeId: String!) { tagsByType(typeId: $typeId) { id name } }`,
        variables: { typeId },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      const tags = response.body.singleResult.data?.tagsByType as { id: string; name: string }[]
      expect(tags).toHaveLength(1)
      expect(tags[0].name).toBe('Dairy')
    }
  })

  it('user can update a tag', async () => {
    const { id: typeId } = await createTagType()
    const { id } = await createTag('Old Tag', typeId)

    const response = await server.executeOperation(
      {
        query: `mutation UpdateTag($id: ID!, $name: String) {
          updateTag(id: $id, name: $name) { id name }
        }`,
        variables: { id, name: 'New Tag' },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect((response.body.singleResult.data?.updateTag as { name: string }).name).toBe('New Tag')
    }
  })

  it('user can delete a tag', async () => {
    const { id: typeId } = await createTagType()
    const { id } = await createTag('To Delete', typeId)

    const response = await server.executeOperation(
      {
        query: `mutation DeleteTag($id: ID!) { deleteTag(id: $id) }`,
        variables: { id },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.deleteTag).toBe(true)
    }
  })

  it('does not return tags belonging to another user', async () => {
    await TagModel.create({ name: 'Other Tag', typeId: 'type_1', userId: 'user_A' })

    const response = await server.executeOperation(
      { query: `query { tags { id } }` },
      { contextValue: { userId: 'user_B' } },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.tags).toHaveLength(0)
    }
  })

  it('user can get item count for a tag', async () => {
    // Given a tag and 2 items using it
    const { id: typeId } = await createTagType()
    const { id: tagId } = await createTag('Dairy', typeId)
    await ItemModel.create([
      { name: 'Milk', tagIds: [tagId], targetUnit: 'package', targetQuantity: 1, refillThreshold: 0, packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1, userId: 'user_test123' },
      { name: 'Cheese', tagIds: [tagId], targetUnit: 'package', targetQuantity: 1, refillThreshold: 0, packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1, userId: 'user_test123' },
    ])

    // When querying item count for that tag
    const response = await server.executeOperation(
      {
        query: `query ItemCountByTag($tagId: String!) { itemCountByTag(tagId: $tagId) }`,
        variables: { tagId },
      },
      { contextValue: ctx },
    )

    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.data?.itemCountByTag).toBe(2)
    }
  })
})
