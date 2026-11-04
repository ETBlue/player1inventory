// Each hand-written Prisma fake must REFUSE a `where` key it does not model,
// and a filter shape it does not model. See `whereKeys.ts` for why.
//
// Most tests here use an EMPTY store, or a `where` whose outer keys match no
// row, on purpose. Those are the two cases a per-row check never reaches:
// `Array.filter` never calls the matcher on an empty store, and a matcher
// returns early before it reaches a nested filter. A fake that checked per row
// would answer `[]` or `null` there, with no error.
import { describe, expect, it } from 'vitest'
import { filterCartItems } from './cartItemFake.js'
import { createInventoryLogFake, makeInventoryLog } from './inventoryLogFake.js'
import {
  createOwnedRowFake,
  UnsupportedWhereFilterError as OwnedFilterError,
  UnsupportedWhereKeyError as OwnedKeyError,
} from './ownedRowFake.js'
import { createShoppingFake } from './shoppingFake.js'
import { createStockFake, makeStock } from './stockFake.js'
import { UnknownWhereKeyError, UnsupportedWhereFilterError } from './whereKeys.js'

const UNKNOWN = { householdId: 'h-1' }

function stockFakeWithOneRow() {
  const fake = createStockFake()
  fake.reset(
    [{ id: 'loc-1', userId: 'user-1', isDefault: true, name: 'Home', order: 0 }],
    [makeStock({ id: 'stock-1', itemId: 'item-1', locationId: 'loc-1' })],
  )
  return fake
}

function shoppingFakeWithOneRowEach() {
  const fake = createShoppingFake()
  fake.reset(
    [{ id: 'vendor-1', name: 'Costco', userId: 'user-1' }],
    [{ id: 'cart-1', userId: 'user-1', locationId: 'loc-1', lastPurchasedAt: null }],
  )
  return fake
}

function logFakeWithOneRow() {
  const fake = createInventoryLogFake()
  fake.reset([
    makeInventoryLog({ id: 'log-1', itemId: 'item-1', userId: 'user-1', locationId: 'loc-1' }),
  ])
  return fake
}

const cartRow = { id: 'ci-1', cartId: 'cart-1', itemId: 'item-1', userId: 'user-1' }
const carts = [{ id: 'cart-1', locationId: 'loc-1' }]

describe('stockFake refuses an unknown where key', () => {
  it('location: names the key and the fake', async () => {
    const fake = stockFakeWithOneRow()
    await expect(fake.client.location.findMany({ where: UNKNOWN })).rejects.toThrow(
      UnknownWhereKeyError,
    )
    await expect(fake.client.location.findFirst({ where: UNKNOWN })).rejects.toThrow(
      /stockFake\(location\).*'householdId'/,
    )
  })

  it('itemStock: names the key and the fake', async () => {
    const fake = stockFakeWithOneRow()
    await expect(fake.client.itemStock.findMany({ where: UNKNOWN })).rejects.toThrow(
      /stockFake\(itemStock\).*'householdId'/,
    )
  })

  it('itemStock.location: refuses an unknown key inside the relation filter', async () => {
    const fake = stockFakeWithOneRow()
    await expect(
      fake.client.itemStock.findMany({ where: { location: UNKNOWN } }),
    ).rejects.toThrow(/stockFake\(itemStock\).*'location\.householdId'/)
  })

  it('every location method refuses it on an EMPTY store', async () => {
    const { location } = createStockFake().client
    const calls = [
      location.findFirst({ where: UNKNOWN }),
      location.findUnique({ where: UNKNOWN }),
      location.findMany({ where: UNKNOWN }),
      location.upsert({ where: UNKNOWN, update: {}, create: { userId: 'u' } }),
    ]
    for (const call of calls) await expect(call).rejects.toThrow(UnknownWhereKeyError)
  })

  it('every itemStock method refuses it on an EMPTY store', async () => {
    const { itemStock } = createStockFake().client
    const calls = [
      itemStock.findUnique({ where: UNKNOWN }),
      itemStock.findFirst({ where: UNKNOWN }),
      itemStock.findMany({ where: UNKNOWN }),
      itemStock.update({ where: UNKNOWN, data: {} }),
      itemStock.upsert({ where: UNKNOWN, update: {}, create: { itemId: 'i', locationId: 'l' } }),
      itemStock.delete({ where: UNKNOWN }),
      itemStock.deleteMany({ where: UNKNOWN }),
    ]
    for (const call of calls) await expect(call).rejects.toThrow(UnknownWhereKeyError)
  })

  it('refuses a nested unknown key when the outer key matches no row', async () => {
    // Given one stock row, and an outer key that matches none
    const fake = stockFakeWithOneRow()
    // Then the nested `location` filter is still checked
    await expect(
      fake.client.itemStock.findMany({ where: { itemId: 'no-such-item', location: UNKNOWN } }),
    ).rejects.toThrow(/'location\.householdId'/)
  })

  it('refuses an operator object on a plain-equality key', async () => {
    const fake = stockFakeWithOneRow()
    await expect(
      fake.client.itemStock.findMany({ where: { itemId: { in: ['item-1'] } } }),
    ).rejects.toThrow(UnsupportedWhereFilterError)
    await expect(
      fake.client.location.findMany({ where: { userId: { not: 'user-2' } } }),
    ).rejects.toThrow(UnsupportedWhereFilterError)
  })

  it('still accepts the compound key and the location relation filter it models', async () => {
    const fake = stockFakeWithOneRow()
    const byCompound = await fake.client.itemStock.findUnique({
      where: { itemId_locationId: { itemId: 'item-1', locationId: 'loc-1' } },
    })
    expect(byCompound?.id).toBe('stock-1')
    const byOwner = await fake.client.itemStock.findMany({
      where: { location: { userId: 'user-1' } },
    })
    expect(byOwner.map((r) => r.id)).toEqual(['stock-1'])
  })

  it('still skips a key whose value is undefined, as Prisma does', async () => {
    const fake = stockFakeWithOneRow()
    const rows = await fake.client.itemStock.findMany({ where: { householdId: undefined } })
    expect(rows.map((r) => r.id)).toEqual(['stock-1'])
  })
})

describe('cartItemFake refuses an unknown where key', () => {
  it('names the key and the fake', () => {
    expect(() => filterCartItems([cartRow], UNKNOWN, carts)).toThrow(
      /cartItemFake\(cartItem\).*'householdId'/,
    )
  })

  it('refuses an unknown key inside the cart relation filter', () => {
    expect(() => filterCartItems([cartRow], { cart: UNKNOWN }, carts)).toThrow(
      /cartItemFake\(cartItem\).*'cart\.householdId'/,
    )
  })

  it('refuses it on an EMPTY store', () => {
    expect(() => filterCartItems([], UNKNOWN, [])).toThrow(UnknownWhereKeyError)
  })

  it('refuses a nested unknown key when the outer key matches no row', () => {
    expect(() =>
      filterCartItems([cartRow], { itemId: 'no-such-item', cart: UNKNOWN }, carts),
    ).toThrow(/'cart\.householdId'/)
  })

  it('refuses an operator object on a plain-equality key', () => {
    expect(() => filterCartItems([cartRow], { cartId: { in: ['cart-1'] } }, carts)).toThrow(
      UnsupportedWhereFilterError,
    )
  })

  it('still accepts id: { in } and cart: { locationId }, which it models', () => {
    expect(filterCartItems([cartRow], { id: { in: ['ci-1'] } }, carts)).toEqual([cartRow])
    expect(filterCartItems([cartRow], { cart: { locationId: 'loc-1' } }, carts)).toEqual([
      cartRow,
    ])
    expect(filterCartItems([cartRow], { cart: { locationId: 'loc-2' } }, carts)).toEqual([])
  })

  it('still skips a key whose value is undefined', () => {
    expect(filterCartItems([cartRow], { householdId: undefined }, carts)).toEqual([cartRow])
  })
})

describe('shoppingFake refuses an unknown where key', () => {
  it('vendor: names the key and the fake', async () => {
    const fake = shoppingFakeWithOneRowEach()
    await expect(fake.client.vendor.findMany({ where: UNKNOWN })).rejects.toThrow(
      /shoppingFake\(vendor\).*'householdId'/,
    )
  })

  it('cart: names the key and the fake', async () => {
    const fake = shoppingFakeWithOneRowEach()
    await expect(fake.client.cart.findMany({ where: UNKNOWN })).rejects.toThrow(
      /shoppingFake\(cart\).*'householdId'/,
    )
  })

  it('every vendor and cart method refuses it on an EMPTY store', async () => {
    const { vendor, cart } = createShoppingFake().client
    const calls = [
      vendor.findMany({ where: UNKNOWN }),
      vendor.delete({ where: UNKNOWN }),
      cart.findUnique({ where: UNKNOWN }),
      cart.findFirst({ where: UNKNOWN }),
      cart.findMany({ where: UNKNOWN }),
      cart.upsert({ where: UNKNOWN, create: { id: 'c' }, update: {} }),
      cart.deleteMany({ where: UNKNOWN }),
    ]
    for (const call of calls) await expect(call).rejects.toThrow(UnknownWhereKeyError)
  })

  it('refuses an operator object on a plain-equality key', async () => {
    const fake = shoppingFakeWithOneRowEach()
    await expect(
      fake.client.vendor.findMany({ where: { userId: { in: ['user-1'] } } }),
    ).rejects.toThrow(UnsupportedWhereFilterError)
    await expect(
      fake.client.cart.findMany({ where: { locationId: { in: ['loc-1'] } } }),
    ).rejects.toThrow(UnsupportedWhereFilterError)
  })

  it('still accepts cart id: { in }, which it models', async () => {
    const fake = shoppingFakeWithOneRowEach()
    const rows = await fake.client.cart.findMany({ where: { id: { in: ['cart-1'] } } })
    expect(rows.map((r) => r.id)).toEqual(['cart-1'])
  })

  it('refuses a second operator next to { in }', async () => {
    // The matcher reads only `.in`, so a `not` beside it would be dropped
    const fake = shoppingFakeWithOneRowEach()
    await expect(
      fake.client.cart.findMany({ where: { id: { in: ['cart-1'], not: 'cart-1' } } }),
    ).rejects.toThrow(UnsupportedWhereFilterError)
  })

  it('still skips a key whose value is undefined', async () => {
    const fake = shoppingFakeWithOneRowEach()
    const vendors = await fake.client.vendor.findMany({ where: { householdId: undefined } })
    const cartRows = await fake.client.cart.findMany({ where: { householdId: undefined } })
    expect(vendors.map((r) => r.id)).toEqual(['vendor-1'])
    expect(cartRows.map((r) => r.id)).toEqual(['cart-1'])
  })
})

describe('inventoryLogFake refuses an unknown where key', () => {
  it('names the key and the fake', async () => {
    const fake = logFakeWithOneRow()
    await expect(fake.client.findMany({ where: UNKNOWN })).rejects.toThrow(
      /inventoryLogFake\(inventoryLog\).*'householdId'/,
    )
  })

  it('every method refuses it on an EMPTY store', async () => {
    const { client } = createInventoryLogFake()
    const calls = [
      client.findMany({ where: UNKNOWN }),
      client.findFirst({ where: UNKNOWN }),
      client.count({ where: UNKNOWN }),
      client.findUnique({ where: UNKNOWN }),
      client.upsert({ where: UNKNOWN, create: {}, update: {} }),
    ]
    for (const call of calls) await expect(call).rejects.toThrow(UnknownWhereKeyError)
  })

  it('refuses an operator object on a plain-equality key', async () => {
    const fake = logFakeWithOneRow()
    await expect(
      fake.client.findMany({ where: { locationId: { in: ['loc-1'] } } }),
    ).rejects.toThrow(UnsupportedWhereFilterError)
  })

  it('refuses a number operator it does not model', async () => {
    const fake = logFakeWithOneRow()
    await expect(fake.client.findMany({ where: { delta: { not: 0 } } })).rejects.toThrow(
      UnsupportedWhereFilterError,
    )
  })

  it('still accepts delta: { gt }, which it models', async () => {
    const fake = logFakeWithOneRow()
    expect((await fake.client.findMany({ where: { delta: { gt: 0 } } })).length).toBe(1)
    expect((await fake.client.findMany({ where: { delta: { gt: 5 } } })).length).toBe(0)
  })

  it('still skips a key whose value is undefined', async () => {
    const fake = logFakeWithOneRow()
    const rows = await fake.client.findMany({ where: { householdId: undefined } })
    expect(rows.map((r) => r.id)).toEqual(['log-1'])
  })
})

describe('ownedRowFake checks its where once per call too', () => {
  type Row = { id: string; userId: string; typeId?: string | null }

  it('every method refuses an unknown key on an EMPTY store', async () => {
    const { client } = createOwnedRowFake<Row>({ model: 'Tag' })
    const calls = [
      client.findUnique({ where: UNKNOWN }),
      client.findFirst({ where: UNKNOWN }),
      client.findMany({ where: UNKNOWN }),
      client.findUniqueOrThrow({ where: UNKNOWN }),
      client.upsert({ where: UNKNOWN, create: { userId: 'u' }, update: {} }),
      client.update({ where: UNKNOWN, data: {} }),
      client.updateMany({ where: UNKNOWN, data: {} }),
      client.delete({ where: UNKNOWN }),
      client.deleteMany({ where: UNKNOWN }),
    ]
    for (const call of calls) await expect(call).rejects.toThrow(UnknownWhereKeyError)
  })

  it('refuses an unknown filter shape on an EMPTY store', async () => {
    const { client } = createOwnedRowFake<Row>({ model: 'Tag', columns: ['typeId'] })
    await expect(client.findMany({ where: { id: { contains: 'x' } } })).rejects.toThrow(
      UnsupportedWhereFilterError,
    )
    await expect(client.findMany({ where: { typeId: { not: null } } })).rejects.toThrow(
      UnsupportedWhereFilterError,
    )
  })

  it('still accepts null on an extra column, and { in } on id', async () => {
    const { client } = createOwnedRowFake<Row>({
      model: 'Tag',
      columns: ['typeId'],
      rows: [{ id: 't-1', userId: 'u', typeId: null }],
    })
    expect((await client.findMany({ where: { typeId: null } })).length).toBe(1)
    expect((await client.findMany({ where: { id: { in: ['t-1'] } } })).length).toBe(1)
  })
})

describe('one error class per purpose', () => {
  it("ownedRowFake's error names are the shared classes", () => {
    // So one `instanceof` catches an unknown key from any of the five fakes
    expect(OwnedKeyError).toBe(UnknownWhereKeyError)
    expect(OwnedFilterError).toBe(UnsupportedWhereFilterError)
  })
})
