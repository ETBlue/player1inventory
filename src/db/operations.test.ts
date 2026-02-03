import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'
import { createItem, getItem, getAllItems, updateItem, deleteItem } from './operations'

describe('Item operations', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.inventoryLogs.clear()
  })

  it('creates an item', async () => {
    const item = await createItem({
      name: 'Milk',
      unit: 'gallon',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })

    expect(item.id).toBeDefined()
    expect(item.name).toBe('Milk')
    expect(item.createdAt).toBeInstanceOf(Date)
  })

  it('retrieves an item by id', async () => {
    const created = await createItem({
      name: 'Eggs',
      tagIds: [],
      targetQuantity: 12,
      refillThreshold: 6,
    })

    const retrieved = await getItem(created.id)
    expect(retrieved?.name).toBe('Eggs')
  })

  it('lists all items', async () => {
    await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })
    await createItem({ name: 'Eggs', tagIds: [], targetQuantity: 12, refillThreshold: 6 })

    const items = await getAllItems()
    expect(items).toHaveLength(2)
  })

  it('updates an item', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })

    await updateItem(item.id, { name: 'Whole Milk' })

    const updated = await getItem(item.id)
    expect(updated?.name).toBe('Whole Milk')
  })

  it('deletes an item', async () => {
    const item = await createItem({ name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 })

    await deleteItem(item.id)

    const retrieved = await getItem(item.id)
    expect(retrieved).toBeUndefined()
  })
})
