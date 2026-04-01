import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ItemModel } from './Item.model.js'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
}, 120000)

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

describe('ItemModel', () => {
  afterEach(() => ItemModel.deleteMany({}))

  it('user can create an item', async () => {
    // Given valid item data
    const item = await ItemModel.create({
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      userId: 'user_test123',
    })

    // Then item is persisted with id and timestamps
    expect(item.id).toBeDefined()
    expect(item.name).toBe('Milk')
    expect(item.userId).toBe('user_test123')
    expect(item.createdAt).toBeInstanceOf(Date)
  })

  it('defaults expirationMode to disabled', async () => {
    // Given an item created without expirationMode
    const item = await ItemModel.create({
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      userId: 'user_test123',
    })

    // Then expirationMode defaults to 'disabled'
    expect(item.expirationMode).toBe('disabled')
  })

  it('stores expirationMode when provided', async () => {
    // Given an item with expirationMode set
    const item = await ItemModel.create({
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      userId: 'user_test123',
      expirationMode: 'days from purchase',
    })

    // Then expirationMode is stored correctly
    expect(item.expirationMode).toBe('days from purchase')
  })

  it('rejects an item without a required name', async () => {
    // Given item data missing the required name field
    await expect(
      ItemModel.create({
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        userId: 'user_test123',
      }),
    ).rejects.toThrow()
  })
})
