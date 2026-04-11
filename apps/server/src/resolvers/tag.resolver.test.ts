import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    tagType: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tag: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    itemTag: {
      deleteMany: vi.fn(),
    },
  },
}))

import { prisma } from '../lib/prisma.js'

const mockPrisma = prisma as unknown as {
  tagType: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  tag: {
    findMany: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  itemTag: {
    deleteMany: ReturnType<typeof vi.fn>
  }
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let server: ApolloServer<Context>
const ctx: Context = { userId: 'user_test123' }

beforeEach(async () => {
  vi.clearAllMocks()
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

// ─── helpers ─────────────────────────────────────────────────────────────────

async function execOp(query: string, variables?: Record<string, unknown>) {
  const r = await server.executeOperation({ query, variables }, { contextValue: ctx })
  return r.body.kind === 'single' ? r.body.singleResult : null
}

// ─── TagType resolvers ────────────────────────────────────────────────────────

describe('TagType resolvers', () => {
  it('user can create a tag type via GraphQL', async () => {
    // Given prisma.tagType.create resolves with a new tag type
    const newTagType = { id: 'tt_1', name: 'Category', color: 'teal', userId: 'user_test123', familyId: null }
    mockPrisma.tagType.create.mockResolvedValue(newTagType)

    // When creating a tag type
    const result = await execOp(
      `mutation CreateTagType($name: String!, $color: String!) {
        createTagType(name: $name, color: $color) { id name color userId }
      }`,
      { name: 'Category', color: 'teal' },
    )

    // Then the tag type is returned
    expect(result?.data?.createTagType).toMatchObject({
      id: 'tt_1',
      name: 'Category',
      color: 'teal',
      userId: 'user_test123',
    })
    expect(mockPrisma.tagType.create).toHaveBeenCalledWith({
      data: { name: 'Category', color: 'teal', userId: 'user_test123' },
    })
  })

  it('user can list their tag types', async () => {
    // Given two tag types for this user
    mockPrisma.tagType.findMany.mockResolvedValue([
      { id: 'tt_1', name: 'Category', color: 'teal', userId: 'user_test123', familyId: null },
      { id: 'tt_2', name: 'Diet', color: 'green', userId: 'user_test123', familyId: null },
    ])

    // When listing tag types
    const result = await execOp(`query { tagTypes { id name color } }`)

    // Then all tag types are returned
    const tagTypes = result?.data?.tagTypes as { id: string }[]
    expect(Array.isArray(tagTypes)).toBe(true)
    expect(tagTypes).toHaveLength(2)
    expect(mockPrisma.tagType.findMany).toHaveBeenCalledWith({ where: { userId: 'user_test123' } })
  })

  it('user can update a tag type', async () => {
    // Given an updated tag type from Prisma
    mockPrisma.tagType.update.mockResolvedValue({
      id: 'tt_1', name: 'New Name', color: 'red', userId: 'user_test123', familyId: null,
    })

    // When updating name and color
    const result = await execOp(
      `mutation UpdateTagType($id: ID!, $name: String, $color: String) {
        updateTagType(id: $id, name: $name, color: $color) { id name color }
      }`,
      { id: 'tt_1', name: 'New Name', color: 'red' },
    )

    // Then the updated tag type is returned
    const tagType = result?.data?.updateTagType as { name: string; color: string }
    expect(tagType.name).toBe('New Name')
    expect(tagType.color).toBe('red')
  })

  it('returns NOT_FOUND error when updating a non-existent tag type', async () => {
    // Given prisma.tagType.update throws
    mockPrisma.tagType.update.mockRejectedValue(new Error('Record not found'))

    // When updating a non-existent tag type
    const result = await execOp(
      `mutation UpdateTagType($id: ID!, $name: String) {
        updateTagType(id: $id, name: $name) { id }
      }`,
      { id: 'does_not_exist', name: 'Anything' },
    )

    // Then a NOT_FOUND error is returned
    expect(result?.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })

  it('user can delete a tag type', async () => {
    // Given tags under this type and the delete succeeds
    mockPrisma.tag.deleteMany.mockResolvedValue({ count: 2 })
    mockPrisma.tagType.delete.mockResolvedValue({ id: 'tt_1' })

    // When deleting a tag type
    const result = await execOp(
      `mutation DeleteTagType($id: ID!) { deleteTagType(id: $id) }`,
      { id: 'tt_1' },
    )

    // Then true is returned
    expect(result?.data?.deleteTagType).toBe(true)
    expect(mockPrisma.tag.deleteMany).toHaveBeenCalledWith({
      where: { typeId: 'tt_1', userId: 'user_test123' },
    })
  })

  it('user can get tag count per type', async () => {
    // Given 2 tags of the specified type
    mockPrisma.tag.count.mockResolvedValue(2)

    // When querying tag count for that type
    const result = await execOp(
      `query TagCountByType($typeId: String!) { tagCountByType(typeId: $typeId) }`,
      { typeId: 'tt_1' },
    )

    // Then the count is returned
    expect(result?.data?.tagCountByType).toBe(2)
    expect(mockPrisma.tag.count).toHaveBeenCalledWith({
      where: { userId: 'user_test123', typeId: 'tt_1' },
    })
  })
})

// ─── Tag resolvers ────────────────────────────────────────────────────────────

describe('Tag resolvers', () => {
  it('user can create a tag via GraphQL', async () => {
    // Given prisma.tag.create resolves with a new tag
    const newTag = { id: 'tag_1', name: 'Dairy', typeId: 'tt_1', userId: 'user_test123', familyId: null, parentId: null }
    mockPrisma.tag.create.mockResolvedValue(newTag)

    // When creating a tag
    const result = await execOp(
      `mutation CreateTag($name: String!, $typeId: String!) {
        createTag(name: $name, typeId: $typeId) { id name typeId userId }
      }`,
      { name: 'Dairy', typeId: 'tt_1' },
    )

    // Then the tag is returned
    const tag = result?.data?.createTag as { id: string; name: string; typeId: string; userId: string }
    expect(tag.name).toBe('Dairy')
    expect(tag.typeId).toBe('tt_1')
    expect(tag.userId).toBe('user_test123')
  })

  it('user can list their tags', async () => {
    // Given one tag for this user
    mockPrisma.tag.findMany.mockResolvedValue([
      { id: 'tag_1', name: 'Dairy', typeId: 'tt_1', userId: 'user_test123', familyId: null, parentId: null },
    ])

    // When listing tags
    const result = await execOp(`query { tags { id name typeId } }`)

    // Then all tags are returned
    const tags = result?.data?.tags as { id: string }[]
    expect(tags).toHaveLength(1)
    expect(mockPrisma.tag.findMany).toHaveBeenCalledWith({ where: { userId: 'user_test123' } })
  })

  it('user can list tags by type', async () => {
    // Given one tag of the requested type
    mockPrisma.tag.findMany.mockResolvedValue([
      { id: 'tag_1', name: 'Dairy', typeId: 'tt_1', userId: 'user_test123', familyId: null, parentId: null },
    ])

    // When listing tags by type
    const result = await execOp(
      `query TagsByType($typeId: String!) { tagsByType(typeId: $typeId) { id name } }`,
      { typeId: 'tt_1' },
    )

    // Then only tags of that type are returned
    const tags = result?.data?.tagsByType as { id: string; name: string }[]
    expect(tags).toHaveLength(1)
    expect(tags[0].name).toBe('Dairy')
    expect(mockPrisma.tag.findMany).toHaveBeenCalledWith({ where: { userId: 'user_test123', typeId: 'tt_1' } })
  })

  it('user can update a tag', async () => {
    // Given Prisma returns the updated tag
    mockPrisma.tag.update.mockResolvedValue({
      id: 'tag_1', name: 'New Tag', typeId: 'tt_1', userId: 'user_test123', familyId: null, parentId: null,
    })

    // When updating the tag name
    const result = await execOp(
      `mutation UpdateTag($id: ID!, $name: String) {
        updateTag(id: $id, name: $name) { id name }
      }`,
      { id: 'tag_1', name: 'New Tag' },
    )

    // Then the updated tag is returned
    expect((result?.data?.updateTag as { name: string }).name).toBe('New Tag')
  })

  it('returns NOT_FOUND error when updating a non-existent tag', async () => {
    // Given Prisma throws on update
    mockPrisma.tag.update.mockRejectedValue(new Error('Record not found'))

    // When updating a non-existent tag
    const result = await execOp(
      `mutation UpdateTag($id: ID!, $name: String) {
        updateTag(id: $id, name: $name) { id }
      }`,
      { id: 'does_not_exist', name: 'Anything' },
    )

    // Then a NOT_FOUND error is returned
    expect(result?.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
  })

  it('user can delete a tag (orphan children)', async () => {
    // Given the tag exists and delete succeeds
    mockPrisma.tag.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.tag.delete.mockResolvedValue({ id: 'tag_1' })

    // When deleting without deleteChildren
    const result = await execOp(
      `mutation DeleteTag($id: ID!) { deleteTag(id: $id) }`,
      { id: 'tag_1' },
    )

    // Then true is returned and children are orphaned
    expect(result?.data?.deleteTag).toBe(true)
    expect(mockPrisma.tag.updateMany).toHaveBeenCalledWith({
      where: { parentId: 'tag_1' }, data: { parentId: null },
    })
    expect(mockPrisma.tag.delete).toHaveBeenCalledWith({ where: { id: 'tag_1' } })
  })

  it('user can delete a tag with all its children', async () => {
    // Given a tag with one child
    mockPrisma.tag.findMany.mockResolvedValueOnce([{ id: 'tag_child' }])
    mockPrisma.tag.findMany.mockResolvedValueOnce([]) // no grandchildren
    mockPrisma.tag.deleteMany.mockResolvedValue({ count: 2 })

    // When deleting with deleteChildren=true
    const result = await execOp(
      `mutation DeleteTag($id: ID!, $deleteChildren: Boolean) { deleteTag(id: $id, deleteChildren: $deleteChildren) }`,
      { id: 'tag_1', deleteChildren: true },
    )

    // Then true is returned and all descendants are deleted
    expect(result?.data?.deleteTag).toBe(true)
    expect(mockPrisma.tag.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['tag_1', 'tag_child'] } },
    })
  })
})
