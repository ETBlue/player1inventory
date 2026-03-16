import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { VendorModel } from './Vendor.model.js'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
}, 120000)

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

describe('VendorModel', () => {
  afterEach(() => VendorModel.deleteMany({}))

  it('user can create a vendor', async () => {
    // Given valid vendor data
    const vendor = await VendorModel.create({
      name: 'Costco',
      userId: 'user_test123',
    })

    // Then vendor is persisted with id
    expect(vendor.id).toBeDefined()
    expect(vendor.name).toBe('Costco')
    expect(vendor.userId).toBe('user_test123')
  })

  it('rejects a vendor without a required name', async () => {
    await expect(
      VendorModel.create({ userId: 'user_test123' }),
    ).rejects.toThrow()
  })

  it('rejects a vendor without a required userId', async () => {
    await expect(
      VendorModel.create({ name: 'Costco' }),
    ).rejects.toThrow()
  })
})
