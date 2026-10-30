import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_LOCATION_ID } from '@/types'
import { db } from './index'

// The v15 split (src/db/index.ts:345) moved the per-location quantity state
// (`targetQuantity`, `refillThreshold`, `packedQuantity`, `unpackedQuantity`)
// off `items` and onto the `itemStocks` store. The v16 split
// (src/db/index.ts:457) kept the dual-unit CONFIGURATION (`packageUnit`,
// `measurementUnit`, `amountPerPackage`, `targetUnit`, `consumeAmount`) on
// `items`. So these two tests write each half to its own store and read each
// half back from the store that owns it.
describe('Item schema migration', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  it('allows creating item with dual-unit fields', async () => {
    const itemId = await db.items.add({
      id: crypto.randomUUID(),
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'package',
      consumeAmount: 0.25,
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(itemId).toBeDefined()

    const stockId = await db.itemStocks.add({
      id: crypto.randomUUID(),
      itemId,
      locationId: DEFAULT_LOCATION_ID,
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0.5,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const item = await db.items.get(itemId)
    expect(item).toBeDefined()
    expect(item?.packageUnit).toBe('bottle')
    expect(item?.measurementUnit).toBe('L')

    const stock = await db.itemStocks.get(stockId)
    expect(stock).toBeDefined()
    expect(stock?.packedQuantity).toBe(1)
    expect(stock?.unpackedQuantity).toBe(0.5)
  })

  it('allows creating item with simple tracking (no measurement unit)', async () => {
    const itemId = await db.items.add({
      id: crypto.randomUUID(),
      name: 'Eggs',
      packageUnit: 'dozen',
      targetUnit: 'package',
      consumeAmount: 1,
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(itemId).toBeDefined()

    const stockId = await db.itemStocks.add({
      id: crypto.randomUUID(),
      itemId,
      locationId: DEFAULT_LOCATION_ID,
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const item = await db.items.get(itemId)
    expect(item).toBeDefined()
    expect(item?.packageUnit).toBe('dozen')
    expect(item?.measurementUnit).toBeUndefined()

    const stock = await db.itemStocks.get(stockId)
    expect(stock).toBeDefined()
    expect(stock?.packedQuantity).toBe(1)
    expect(stock?.unpackedQuantity).toBe(0)
  })
})
