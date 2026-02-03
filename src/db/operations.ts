import { db } from './index'
import type { Item, InventoryLog } from '@/types'

// Item operations
type CreateItemInput = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>

export async function createItem(input: CreateItemInput): Promise<Item> {
  const now = new Date()
  const item: Item = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }
  await db.items.add(item)
  return item
}

export async function getItem(id: string): Promise<Item | undefined> {
  return db.items.get(id)
}

export async function getAllItems(): Promise<Item[]> {
  return db.items.toArray()
}

export async function updateItem(id: string, updates: Partial<Omit<Item, 'id' | 'createdAt'>>): Promise<void> {
  await db.items.update(id, { ...updates, updatedAt: new Date() })
}

export async function deleteItem(id: string): Promise<void> {
  await db.items.delete(id)
}

// InventoryLog operations
type CreateLogInput = {
  itemId: string
  delta: number
  occurredAt: Date
  note?: string
}

export async function addInventoryLog(input: CreateLogInput): Promise<InventoryLog> {
  const currentQty = await getCurrentQuantity(input.itemId)
  const now = new Date()

  const log: InventoryLog = {
    id: crypto.randomUUID(),
    itemId: input.itemId,
    delta: input.delta,
    quantity: currentQty + input.delta,
    note: input.note,
    occurredAt: input.occurredAt,
    createdAt: now,
  }

  await db.inventoryLogs.add(log)
  return log
}

export async function getItemLogs(itemId: string): Promise<InventoryLog[]> {
  return db.inventoryLogs.where('itemId').equals(itemId).sortBy('occurredAt')
}

export async function getCurrentQuantity(itemId: string): Promise<number> {
  const logs = await db.inventoryLogs
    .where('itemId')
    .equals(itemId)
    .sortBy('createdAt')

  if (logs.length === 0) return 0

  return logs[logs.length - 1].quantity
}

export async function getLastPurchaseDate(itemId: string): Promise<Date | null> {
  const logs = await db.inventoryLogs
    .where('itemId')
    .equals(itemId)
    .filter(log => log.delta > 0)
    .toArray()

  if (logs.length === 0) return null

  const latest = logs.reduce((a, b) =>
    a.occurredAt > b.occurredAt ? a : b
  )
  return latest.occurredAt
}
