import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { TagModel, TagTypeModel } from './Tag.model.js'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
}, 120000)

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

describe('TagTypeModel', () => {
  afterEach(() => TagTypeModel.deleteMany({}))

  it('user can create a tag type', async () => {
    // Given valid tag type data
    const tagType = await TagTypeModel.create({
      name: 'Category',
      color: 'teal',
      userId: 'user_test123',
    })

    // Then tag type is persisted with id
    expect(tagType.id).toBeDefined()
    expect(tagType.name).toBe('Category')
    expect(tagType.color).toBe('teal')
    expect(tagType.userId).toBe('user_test123')
  })

  it('rejects a tag type without a required name', async () => {
    await expect(
      TagTypeModel.create({ color: 'teal', userId: 'user_test123' }),
    ).rejects.toThrow()
  })
})

describe('TagModel', () => {
  afterEach(() => TagModel.deleteMany({}))

  it('user can create a tag', async () => {
    // Given valid tag data
    const tag = await TagModel.create({
      name: 'Dairy',
      typeId: 'tagtype_123',
      userId: 'user_test123',
    })

    // Then tag is persisted with id
    expect(tag.id).toBeDefined()
    expect(tag.name).toBe('Dairy')
    expect(tag.typeId).toBe('tagtype_123')
    expect(tag.userId).toBe('user_test123')
  })

  it('rejects a tag without a required name', async () => {
    await expect(
      TagModel.create({ typeId: 'tagtype_123', userId: 'user_test123' }),
    ).rejects.toThrow()
  })
})
