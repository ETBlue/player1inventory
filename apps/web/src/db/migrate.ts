import { db } from './index'

// Legacy v1 → v2 item migration (added stock fields onto Item). As of Dexie v15
// the stock fields live on ItemStock, so this migration is obsolete: the v15
// upgrade fn owns the Item → Item + ItemStock split. We keep this function as a
// no-op for DBs already at v15+ to avoid re-adding stock fields onto item rows.
export async function migrateItemsToV2(): Promise<void> {
  if (db.verno >= 15) return

  // biome-ignore lint/suspicious/noExplicitAny: legacy migration reads pre-v15 item rows that still carry stock fields
  const items = (await db.items.toArray()) as any[]

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
