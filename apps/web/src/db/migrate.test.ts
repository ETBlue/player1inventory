import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './index'
import { migrateItemsToV2 } from './migrate'

describe('migrateItemsToV2', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  // As of Dexie v15 the stock/unit fields live on ItemStock, not Item, and the
  // v15 upgrade fn owns the Item → Item + ItemStock split. The legacy v1 → v2
  // item migration is now a guarded no-op for DBs already at v15+ so it never
  // re-adds stock fields onto item rows.
  it('is a no-op at v15+ (does not re-add stock fields onto items)', async () => {
    expect(db.verno).toBeGreaterThanOrEqual(15)

    await db.items.put({
      id: '1',
      name: 'Global Item',
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      // biome-ignore lint/suspicious/noExplicitAny: Item no longer carries stock fields; assert they are not added
    } as any)

    await migrateItemsToV2()

    const item = (await db.items.get('1')) as
      | Record<string, unknown>
      | undefined
    expect(item).toBeDefined()
    // No stock fields are written back onto the global item row.
    expect(item?.packedQuantity).toBeUndefined()
    expect(item?.targetUnit).toBeUndefined()
    expect(item?.consumeAmount).toBeUndefined()
  })
})
