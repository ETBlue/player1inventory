import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { FamilyGroupModel } from './FamilyGroup.model.js'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
}, 120000)

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

afterEach(async () => {
  await FamilyGroupModel.deleteMany({})
})

describe('FamilyGroupModel', () => {
  it('user can create a family group', async () => {
    // Given valid family group data
    const group = await FamilyGroupModel.create({
      name: 'The Smiths',
      code: 'PX7K2M',
      ownerUserId: 'user_owner123',
      memberUserIds: ['user_owner123'],
    })

    // Then group is persisted
    expect(group.id).toBeDefined()
    expect(group.name).toBe('The Smiths')
    expect(group.code).toBe('PX7K2M')
    expect(group.ownerUserId).toBe('user_owner123')
    expect(group.createdAt).toBeInstanceOf(Date)
  })

  it('rejects a group without a name', async () => {
    await expect(
      FamilyGroupModel.create({
        code: 'ABC123',
        ownerUserId: 'user_123',
        memberUserIds: [],
      }),
    ).rejects.toThrow()
  })
})
