import { describe, expect, it } from 'vitest'
import { buildExportPayload } from './exportData'

describe('buildExportPayload', () => {
  it('includes version and exportedAt', () => {
    const payload = buildExportPayload({
      items: [],
      tags: [],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
    })

    expect(payload.version).toBe(1)
    expect(payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('passes all entity arrays through', () => {
    const payload = buildExportPayload({
      items: [{ id: '1', name: 'Milk' }],
      tags: [{ id: 't1' }],
      tagTypes: [],
      vendors: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
    })

    expect(payload.items).toHaveLength(1)
    expect(payload.tags).toHaveLength(1)
  })
})
