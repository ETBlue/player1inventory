import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './index'
import { addToCart } from './operations'

// Exercises the real v18 → v19 → v20 upgrade (households H3b task B.8): a
// database is created at version 18 holding duplicate cart rows, closed, then
// reopened through the app's `db` (version 20), so Dexie runs version 19's
// merge and then builds version 20's unique index `&[cartId+itemId]`.
//
// The fixture is built so that each wrong merge gives a different database:
//
// | rows                              | what a wrong merge would do            |
// |-----------------------------------|----------------------------------------|
// | a pair: ci-b (2) + ci-a (3)       | keep the highest id; keep the first row |
// | a group of three, ids out of order | sum only two; keep the first id seen   |
// | the same item in ANOTHER cart     | merge by item alone, across carts      |
// | a clean cart with one row each    | touch rows that have no duplicate      |
//
// The lowest id of each group is written LAST or in the middle, never first, so
// "keep the first row read" and "keep the lowest id" give different answers.

const V18_STORES = {
  items: 'id, name, createdAt, updatedAt',
  itemStocks: 'id, itemId, locationId, [itemId+locationId], updatedAt',
  tags: 'id, typeId, parentId, createdAt',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, locationId, occurredAt, createdAt',
  shoppingCarts: 'id',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
  recipes: 'id, name, lastCookedAt',
  shelves: 'id, name, type, order',
  locations: 'id, order, name',
}

const CART_A = 'local:vendor-a'
const CART_B = 'local:vendor-b'
const CLEAN_CART = 'local:no-vendor'

async function seedV18Database(): Promise<void> {
  const v18 = new Dexie('Player1Inventory')
  v18.version(18).stores(V18_STORES)
  await v18.open()

  await v18.table('cartItems').bulkPut([
    // A pair in cart A: milk. Lowest id is ci-a, written second.
    { id: 'ci-b', cartId: CART_A, itemId: 'milk', quantity: 2 },
    { id: 'ci-a', cartId: CART_A, itemId: 'milk', quantity: 3 },
    // A group of three in cart A: eggs. Lowest id ci-e1 is in the middle.
    { id: 'ci-e3', cartId: CART_A, itemId: 'eggs', quantity: 1 },
    { id: 'ci-e1', cartId: CART_A, itemId: 'eggs', quantity: 4 },
    { id: 'ci-e2', cartId: CART_A, itemId: 'eggs', quantity: 10 },
    // The same item (milk) in ANOTHER cart: one row, must stay separate.
    { id: 'ci-0-other', cartId: CART_B, itemId: 'milk', quantity: 7 },
    // A clean cart: one row per item, nothing to merge.
    { id: 'ci-clean-1', cartId: CLEAN_CART, itemId: 'bread', quantity: 1 },
    { id: 'ci-clean-2', cartId: CLEAN_CART, itemId: 'jam', quantity: 0 },
  ])

  v18.close()
}

function byId(rows: Array<{ id: string }>) {
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : 1))
}

describe('v18 → v20 upgrade (one row per item per cart)', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
    await seedV18Database()
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  it('user’s duplicate cart rows become one row per item, with the sum and the lowest id', async () => {
    // Given a version-18 database holding a pair, a group of three, the same
    // item in another cart, and a clean cart
    // When the app opens it at version 20
    await db.open()

    // Then each pair has exactly one row: the lowest id, holding the sum.
    // Every other row is exactly as stored.
    expect(byId(await db.cartItems.toArray())).toEqual([
      { id: 'ci-0-other', cartId: CART_B, itemId: 'milk', quantity: 7 },
      { id: 'ci-a', cartId: CART_A, itemId: 'milk', quantity: 5 },
      { id: 'ci-clean-1', cartId: CLEAN_CART, itemId: 'bread', quantity: 1 },
      { id: 'ci-clean-2', cartId: CLEAN_CART, itemId: 'jam', quantity: 0 },
      { id: 'ci-e1', cartId: CART_A, itemId: 'eggs', quantity: 15 },
    ])
  })

  it('the upgraded database refuses a second row for a pair', async () => {
    // Given the upgraded database
    await db.open()
    expect(db.verno).toBe(20)

    // When a second row for milk in cart A is added by hand
    // Then the unique index refuses it
    await expect(
      db.cartItems.add({
        id: 'ci-z',
        cartId: CART_A,
        itemId: 'milk',
        quantity: 1,
      }),
    ).rejects.toThrow(/ConstraintError|uniqueness|Key already exists/i)
    expect(await db.cartItems.where('cartId').equals(CART_A).count()).toBe(2)
  })
})

describe('a fresh database at version 20', () => {
  beforeEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete('Player1Inventory')
  })

  it('has the unique index and refuses a second row for a pair', async () => {
    // Given no database at all (so Dexie opens straight at version 20, runs
    // `on('populate')`, and runs no upgrade)
    await db.open()
    expect(db.verno).toBe(20)

    // Then the compound index exists and is unique
    const index = db.cartItems.schema.idxByName['[cartId+itemId]']
    expect(index?.unique).toBe(true)

    // And it refuses a second row for one pair
    await db.cartItems.add({
      id: 'ci-1',
      cartId: CART_A,
      itemId: 'milk',
      quantity: 1,
    })
    await expect(
      db.cartItems.add({
        id: 'ci-2',
        cartId: CART_A,
        itemId: 'milk',
        quantity: 1,
      }),
    ).rejects.toThrow()
    // But the same item in another cart is fine
    await db.cartItems.add({
      id: 'ci-3',
      cartId: CART_B,
      itemId: 'milk',
      quantity: 1,
    })
    expect(await db.cartItems.count()).toBe(2)

    // And the populate seed still ran: the default location exists
    expect((await db.locations.toArray()).map((l) => l.id)).toEqual(['local'])
  })

  it('user adding the same item twice at the same time gets one row with the sum', async () => {
    // Given a fresh database
    await db.open()

    // When two adds of the same item to the same cart run at the same time
    const [first, second] = await Promise.all([
      addToCart(CART_A, 'milk', 2),
      addToCart(CART_A, 'milk', 3),
    ])

    // Then there is one row, holding the sum
    const rows = await db.cartItems.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.quantity).toBe(5)
    // And both calls returned that same row: the second saw the first's write
    expect(first.id).toBe(second.id)
    expect([first.quantity, second.quantity].sort()).toEqual([2, 5])
  })
})
