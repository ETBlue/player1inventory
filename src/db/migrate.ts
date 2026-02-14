import { db } from './index'

export async function migrateItemsToV2(): Promise<void> {
  const items = await db.items.toArray()

  for (const item of items) {
    // Check if already migrated (has packedQuantity field)
    if ('packedQuantity' in item && item.packedQuantity !== undefined) {
      continue
    }

    // Migrate from v1 schema
    // biome-ignore lint/suspicious/noExplicitAny: Migration code needs to handle old schema data
    const updates: any = {
      targetUnit: 'package',
      packedQuantity: item.targetQuantity || 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    }

    // Map old unit field to packageUnit
    if ('unit' in item && item.unit) {
      updates.packageUnit = item.unit
    }

    await db.items.update(item.id, updates)
  }
}
