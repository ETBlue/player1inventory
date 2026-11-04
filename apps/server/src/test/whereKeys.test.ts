// Each hand-written Prisma fake must REFUSE a `where` key it does not model.
// See `whereKeys.ts` for why. These tests call each fake through its public
// API, with one row in the store, so a fake that ignored the key would return
// that row instead of throwing.
import { describe, expect, it } from 'vitest'
import { cartItemMatches } from './cartItemFake.js'
import { createInventoryLogFake, makeInventoryLog } from './inventoryLogFake.js'
import { createShoppingFake } from './shoppingFake.js'
import { createStockFake, makeStock } from './stockFake.js'
import { UnknownWhereKeyError } from './whereKeys.js'

function stockFakeWithOneRow() {
  const fake = createStockFake()
  fake.reset(
    [{ id: 'loc-1', userId: 'user-1', isDefault: true, name: 'Home', order: 0 }],
    [makeStock({ id: 'stock-1', itemId: 'item-1', locationId: 'loc-1' })],
  )
  return fake
}

describe('stockFake refuses an unknown where key', () => {
  it('location: names the key and the fake', async () => {
    const fake = stockFakeWithOneRow()
    await expect(
      fake.client.location.findMany({ where: { householdId: 'h-1' } }),
    ).rejects.toThrow(UnknownWhereKeyError)
    await expect(
      fake.client.location.findFirst({ where: { householdId: 'h-1' } }),
    ).rejects.toThrow(/stockFake\(location\).*'householdId'/)
  })

  it('itemStock: names the key and the fake', async () => {
    const fake = stockFakeWithOneRow()
    await expect(
      fake.client.itemStock.findMany({ where: { householdId: 'h-1' } }),
    ).rejects.toThrow(/stockFake\(itemStock\).*'householdId'/)
  })

  it('itemStock.location: refuses an unknown key inside the relation filter', async () => {
    const fake = stockFakeWithOneRow()
    await expect(
      fake.client.itemStock.findMany({ where: { location: { householdId: 'h-1' } } }),
    ).rejects.toThrow(/stockFake\(itemStock\.location\).*'householdId'/)
  })

  it('still skips a key whose value is undefined, as Prisma does', async () => {
    const fake = stockFakeWithOneRow()
    const rows = await fake.client.itemStock.findMany({ where: { householdId: undefined } })
    expect(rows.map((r) => r.id)).toEqual(['stock-1'])
  })
})

describe('cartItemFake refuses an unknown where key', () => {
  const row = { id: 'ci-1', cartId: 'cart-1', itemId: 'item-1', userId: 'user-1' }
  const carts = [{ id: 'cart-1', locationId: 'loc-1' }]

  it('names the key and the fake', () => {
    expect(() => cartItemMatches(row, { householdId: 'h-1' }, carts)).toThrow(
      /cartItemFake\(cartItem\).*'householdId'/,
    )
  })

  it('refuses an unknown key inside the cart relation filter', () => {
    expect(() => cartItemMatches(row, { cart: { householdId: 'h-1' } }, carts)).toThrow(
      /cartItemFake\(cartItem\.cart\).*'householdId'/,
    )
  })

  it('still skips a key whose value is undefined', () => {
    expect(cartItemMatches(row, { householdId: undefined }, carts)).toBe(true)
  })
})

describe('shoppingFake refuses an unknown where key', () => {
  function fakeWithOneRowEach() {
    const fake = createShoppingFake()
    fake.reset(
      [{ id: 'vendor-1', name: 'Costco', userId: 'user-1' }],
      [{ id: 'cart-1', userId: 'user-1', locationId: 'loc-1', lastPurchasedAt: null }],
    )
    return fake
  }

  it('vendor: names the key and the fake', async () => {
    const fake = fakeWithOneRowEach()
    await expect(
      fake.client.vendor.findMany({ where: { householdId: 'h-1' } }),
    ).rejects.toThrow(/shoppingFake\(vendor\).*'householdId'/)
  })

  it('cart: names the key and the fake', async () => {
    const fake = fakeWithOneRowEach()
    await expect(
      fake.client.cart.findMany({ where: { householdId: 'h-1' } }),
    ).rejects.toThrow(/shoppingFake\(cart\).*'householdId'/)
  })
})

describe('inventoryLogFake refuses an unknown where key', () => {
  it('names the key and the fake', async () => {
    const fake = createInventoryLogFake()
    fake.reset([
      makeInventoryLog({ id: 'log-1', itemId: 'item-1', userId: 'user-1', locationId: 'loc-1' }),
    ])
    await expect(fake.client.findMany({ where: { householdId: 'h-1' } })).rejects.toThrow(
      /inventoryLogFake\(inventoryLog\).*'householdId'/,
    )
  })
})
