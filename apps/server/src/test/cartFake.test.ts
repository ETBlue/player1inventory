import { describe, expect, it } from 'vitest'
import {
  CartForeignKeyError,
  CartItemPairConstraintError,
  type CartItemRow,
  type CartRow,
  createCartFake,
  NotAUniqueWhereError,
  UnsupportedNumberWriteError,
} from './cartFake.js'
import { createHouseholdWorld } from './householdWorld.js'
import { DroppedColumnError, MissingColumnError } from './ownedRowFake.js'
import { type RollbackStore, runInTransaction } from './stockFake.js'
import { UnknownWhereKeyError } from './whereKeys.js'

// The double's OWN contract (households H3b, task B.2).
//
// Most of these behaviours are not reachable from any resolver yet: task B.4
// moves the cart resolvers onto this fake, B.5 checkout, B.6 cooking, B.7
// import. Until then this file is the only thing that stops someone deleting
// them as dead code, and it is where a mutation check runs in one second.
//
// Two members throughout (H3b rule 14): `ALICE` and `BOB` both add rows to
// one cart. With one member, "rows I added" and "rows in this cart" are the
// same set, and a scope test could not fail.

const ALICE = 'user_alice'
const BOB = 'user_bob'

function cartRow(over: Partial<CartRow> & Pick<CartRow, 'id' | 'locationId'>): CartRow {
  return { lastPurchasedAt: null, ...over }
}

function itemRow(
  over: Partial<CartItemRow> & Pick<CartItemRow, 'id' | 'cartId' | 'itemId'>,
): CartItemRow {
  return { quantity: 1, userId: ALICE, ...over }
}

/** Two carts at two locations, and rows from both members in the first. */
function seeded() {
  return createCartFake({
    carts: [
      cartRow({ id: 'loc-home:vendor-1', locationId: 'loc-home' }),
      cartRow({ id: 'loc-office:vendor-1', locationId: 'loc-office' }),
    ],
    cartItems: [
      itemRow({ id: 'ci-milk', cartId: 'loc-home:vendor-1', itemId: 'milk', quantity: 2 }),
      itemRow({
        id: 'ci-bread',
        cartId: 'loc-home:vendor-1',
        itemId: 'bread',
        quantity: 0,
        userId: BOB,
      }),
      itemRow({ id: 'ci-eggs', cartId: 'loc-office:vendor-1', itemId: 'eggs', quantity: 3 }),
    ],
  })
}

describe('cartFake: CartItem @@unique([cartId, itemId])', () => {
  it('create refuses a second row for the same cart and item, with P2002', async () => {
    // Given Alice's milk row in the home cart
    const fake = seeded()

    // When Bob adds milk to the same cart as a NEW row
    const write = fake.client.cartItem.create({
      data: { cartId: 'loc-home:vendor-1', itemId: 'milk', quantity: 1, userId: BOB },
    })

    // Then the database refuses it, and nothing is written
    await expect(write).rejects.toBeInstanceOf(CartItemPairConstraintError)
    await expect(write).rejects.toMatchObject({ code: 'P2002' })
    expect(fake.state.cartItems.filter((r) => r.itemId === 'milk')).toHaveLength(1)
  })

  it('create accepts the same item in another cart, and another item in the same cart', async () => {
    // Given the seeded rows
    const fake = seeded()

    // When milk goes into the office cart, and cheese into the home cart
    await fake.client.cartItem.create({
      data: { cartId: 'loc-office:vendor-1', itemId: 'milk', quantity: 1, userId: BOB },
    })
    await fake.client.cartItem.create({
      data: { cartId: 'loc-home:vendor-1', itemId: 'cheese', quantity: 1, userId: BOB },
    })

    // Then both rows exist: the rule is on the PAIR, not on either column
    expect(fake.state.cartItems).toHaveLength(5)
  })

  it('createMany without skipDuplicates refuses the whole call when one row clashes with a stored row', async () => {
    // Given the seeded rows
    const fake = seeded()

    // When a payload holds one new row and one that clashes with Alice's milk
    const write = fake.client.cartItem.createMany({
      data: [
        { cartId: 'loc-home:vendor-1', itemId: 'cheese', quantity: 1, userId: BOB },
        { cartId: 'loc-home:vendor-1', itemId: 'milk', quantity: 1, userId: BOB },
      ],
    })

    // Then P2002, and NOT EVEN the new row is written: it is one statement
    await expect(write).rejects.toBeInstanceOf(CartItemPairConstraintError)
    expect(fake.state.cartItems.map((r) => r.itemId).sort()).toEqual(['bread', 'eggs', 'milk'])
  })

  it('createMany without skipDuplicates refuses two rows of one payload with the same pair', async () => {
    // Given an empty cart
    const fake = createCartFake({ carts: [cartRow({ id: 'c', locationId: 'l' })] })

    // When one payload names the same item twice
    const write = fake.client.cartItem.createMany({
      data: [
        { cartId: 'c', itemId: 'milk', quantity: 1, userId: ALICE },
        { cartId: 'c', itemId: 'milk', quantity: 2, userId: BOB },
      ],
    })

    // Then P2002 and nothing is written
    await expect(write).rejects.toMatchObject({ code: 'P2002' })
    expect(fake.state.cartItems).toHaveLength(0)
  })

  it('createMany with skipDuplicates skips every clashing row, stored or in the payload', async () => {
    // Given the seeded rows
    const fake = seeded()

    // When a payload holds a clash with a stored row, a new row, and a second
    // copy of that new row
    const result = await fake.client.cartItem.createMany({
      data: [
        { cartId: 'loc-home:vendor-1', itemId: 'milk', quantity: 9, userId: BOB },
        { cartId: 'loc-home:vendor-1', itemId: 'cheese', quantity: 1, userId: BOB },
        { cartId: 'loc-home:vendor-1', itemId: 'cheese', quantity: 5, userId: ALICE },
      ],
      skipDuplicates: true,
    })

    // Then only the first cheese row is written, and the stored milk is untouched
    expect(result).toEqual({ count: 1 })
    const home = fake.state.cartItems.filter((r) => r.cartId === 'loc-home:vendor-1')
    expect(home.find((r) => r.itemId === 'milk')?.quantity).toBe(2)
    expect(home.filter((r) => r.itemId === 'cheese').map((r) => r.quantity)).toEqual([1])
  })

  it('createMany with skipDuplicates still refuses a foreign-key error', async () => {
    // Given the seeded rows
    const fake = seeded()

    // When a row names a cart that does not exist
    const write = fake.client.cartItem.createMany({
      data: [{ cartId: 'no-such-cart', itemId: 'milk', quantity: 1, userId: BOB }],
      skipDuplicates: true,
    })

    // Then P2003: ON CONFLICT covers unique keys only
    await expect(write).rejects.toBeInstanceOf(CartForeignKeyError)
    await expect(write).rejects.toMatchObject({ code: 'P2003' })
  })

  it('update refuses to move a row onto a pair another row holds', async () => {
    // Given Alice's milk and Bob's bread in one cart
    const fake = seeded()

    // When the bread row is changed to name milk
    const write = fake.client.cartItem.update({ where: { id: 'ci-bread' }, data: { itemId: 'milk' } })

    // Then P2002, and the bread row is unchanged
    await expect(write).rejects.toBeInstanceOf(CartItemPairConstraintError)
    expect(fake.state.cartItems.find((r) => r.id === 'ci-bread')?.itemId).toBe('bread')
  })

  it('upsert by a NEW id still raises P2002 when its pair is taken', async () => {
    // Given Alice's milk row
    const fake = seeded()

    // When an import upserts by an id no row holds, for the same cart and item
    // (the `bulkUpsertCartItems` path task B.7 must handle)
    const write = fake.client.cartItem.upsert({
      where: { id: 'ci-from-backup' },
      create: {
        id: 'ci-from-backup',
        cartId: 'loc-home:vendor-1',
        itemId: 'milk',
        quantity: 4,
        userId: BOB,
      },
      update: { quantity: 4 },
    })

    // Then the create half is refused
    await expect(write).rejects.toBeInstanceOf(CartItemPairConstraintError)
  })
})

describe('cartFake: CartItem upsert on cartId_itemId', () => {
  it('two adds of one item from two members give one row with the sum and the first adder kept', async () => {
    // Given Alice's milk row with 2
    const fake = seeded()

    // When Bob adds 3 milk the way task B.4's addToCart will
    const row = await fake.client.cartItem.upsert({
      where: { cartId_itemId: { cartId: 'loc-home:vendor-1', itemId: 'milk' } },
      create: { cartId: 'loc-home:vendor-1', itemId: 'milk', quantity: 3, userId: BOB },
      update: { quantity: { increment: 3 } },
    })

    // Then there is still one milk row, with 5, and "added by" is still Alice
    const milk = fake.state.cartItems.filter((r) => r.itemId === 'milk' && r.cartId === 'loc-home:vendor-1')
    expect(milk).toHaveLength(1)
    expect(milk[0]).toMatchObject({ id: 'ci-milk', quantity: 5, userId: ALICE })
    expect(row).toMatchObject({ quantity: 5, userId: ALICE })
  })

  it('creates the row from the create half when the pair is free', async () => {
    // Given no cheese row
    const fake = seeded()

    // When Bob upserts cheese
    await fake.client.cartItem.upsert({
      where: { cartId_itemId: { cartId: 'loc-home:vendor-1', itemId: 'cheese' } },
      create: { cartId: 'loc-home:vendor-1', itemId: 'cheese', quantity: 3, userId: BOB },
      update: { quantity: { increment: 3 } },
    })

    // Then the row has the create half's amount and Bob as the adder
    expect(fake.state.cartItems.find((r) => r.itemId === 'cheese')).toMatchObject({
      quantity: 3,
      userId: BOB,
    })
  })

  it('a plain number in update SETS the amount (the import replace path)', async () => {
    // Given Alice's milk row with 2
    const fake = seeded()

    // When it is upserted with a plain 7
    await fake.client.cartItem.upsert({
      where: { cartId_itemId: { cartId: 'loc-home:vendor-1', itemId: 'milk' } },
      create: { cartId: 'loc-home:vendor-1', itemId: 'milk', quantity: 7, userId: BOB },
      update: { quantity: 7 },
    })

    // Then the amount is 7, not 9
    expect(fake.state.cartItems.find((r) => r.id === 'ci-milk')?.quantity).toBe(7)
  })

  it('update applies { increment } to the stored amount', async () => {
    // Given Alice's milk row with 2
    const fake = seeded()

    // When it is incremented by 0.5
    await fake.client.cartItem.update({
      where: { id: 'ci-milk' },
      data: { quantity: { increment: 0.5 } },
    })

    // Then the amount is 2.5
    expect(fake.state.cartItems.find((r) => r.id === 'ci-milk')?.quantity).toBe(2.5)
  })

  it('refuses a number operation it does not model', async () => {
    const fake = seeded()
    await expect(
      fake.client.cartItem.update({ where: { id: 'ci-milk' }, data: { quantity: { decrement: 1 } } }),
    ).rejects.toBeInstanceOf(UnsupportedNumberWriteError)
  })

  it('refuses a cartId_itemId missing one of its two keys', async () => {
    const fake = seeded()
    await expect(
      fake.client.cartItem.upsert({
        where: { cartId_itemId: { cartId: 'loc-home:vendor-1' } },
        create: { cartId: 'loc-home:vendor-1', itemId: 'milk', quantity: 1, userId: BOB },
        update: { quantity: { increment: 1 } },
      }),
    ).rejects.toThrow(/cartId_itemId/)
  })

  it('update, delete, findUnique and upsert refuse a where that is not unique', async () => {
    // Given the seeded rows
    const fake = seeded()
    const notUnique = { cartId: 'loc-home:vendor-1', itemId: 'milk' }

    // Then each one throws, as Prisma does for a non-unique WhereUniqueInput
    await expect(
      fake.client.cartItem.update({ where: notUnique, data: { quantity: 1 } }),
    ).rejects.toBeInstanceOf(NotAUniqueWhereError)
    await expect(fake.client.cartItem.delete({ where: notUnique })).rejects.toBeInstanceOf(
      NotAUniqueWhereError,
    )
    await expect(fake.client.cartItem.findUnique({ where: notUnique })).rejects.toBeInstanceOf(
      NotAUniqueWhereError,
    )
    await expect(
      fake.client.cartItem.upsert({ where: notUnique, create: {}, update: {} }),
    ).rejects.toBeInstanceOf(NotAUniqueWhereError)
  })

  it('update and delete raise P2025 when no row matches', async () => {
    const fake = seeded()
    await expect(
      fake.client.cartItem.update({ where: { id: 'nope' }, data: { quantity: 1 } }),
    ).rejects.toMatchObject({ code: 'P2025' })
    await expect(fake.client.cartItem.delete({ where: { id: 'nope' } })).rejects.toMatchObject({
      code: 'P2025',
    })
  })
})

describe('cartFake: CartItem where', () => {
  it('refuses userId as a where key, on every read and write (H3b rule 13)', async () => {
    // Given the seeded rows
    const fake = seeded()
    const where = { cartId: 'loc-home:vendor-1', userId: ALICE }

    // Then a userId scope throws instead of quietly hiding Bob's rows
    await expect(fake.client.cartItem.findMany({ where })).rejects.toBeInstanceOf(
      UnknownWhereKeyError,
    )
    await expect(fake.client.cartItem.count({ where })).rejects.toBeInstanceOf(UnknownWhereKeyError)
    await expect(fake.client.cartItem.deleteMany({ where })).rejects.toBeInstanceOf(
      UnknownWhereKeyError,
    )
    await expect(
      fake.client.cartItem.findFirst({ where: { id: 'ci-milk', userId: ALICE } }),
    ).rejects.toBeInstanceOf(UnknownWhereKeyError)
  })

  it('refuses an unknown key on an EMPTY store', async () => {
    const fake = createCartFake()
    await expect(
      fake.client.cartItem.findMany({ where: { householdId: 'h' } }),
    ).rejects.toBeInstanceOf(UnknownWhereKeyError)
  })

  it('cartId selects the rows of both members in that cart', async () => {
    const fake = seeded()
    const rows = await fake.client.cartItem.findMany({ where: { cartId: 'loc-home:vendor-1' } })
    expect(rows.map((r) => r.userId).sort()).toEqual([ALICE, BOB])
  })

  it('cartId takes { in: [...] }', async () => {
    const fake = seeded()
    const result = await fake.client.cartItem.deleteMany({
      where: { cartId: { in: ['loc-office:vendor-1', 'no-such-cart'] } },
    })
    expect(result).toEqual({ count: 1 })
    expect(fake.state.cartItems.map((r) => r.id).sort()).toEqual(['ci-bread', 'ci-milk'])
  })

  it('quantity: { gt: 0 } selects only rows being bought, not pinned rows', async () => {
    // Given milk (2) and pinned bread (0) in the home cart
    const fake = seeded()

    // When checkout's read runs
    const rows = await fake.client.cartItem.findMany({
      where: { cartId: 'loc-home:vendor-1', quantity: { gt: 0 } },
    })

    // Then only milk comes back
    expect(rows.map((r) => r.id)).toEqual(['ci-milk'])
  })

  it('the cart relation filter reads the Cart ROW, not the text of the cart id', async () => {
    // Given a cart whose id says one location and whose column says another
    const fake = createCartFake({
      carts: [cartRow({ id: 'loc-home:vendor-1', locationId: 'loc-office' })],
      cartItems: [itemRow({ id: 'ci', cartId: 'loc-home:vendor-1', itemId: 'milk' })],
    })

    // Then the filter follows the column
    expect(await fake.client.cartItem.count({ where: { cart: { locationId: 'loc-office' } } })).toBe(1)
    expect(await fake.client.cartItem.count({ where: { cart: { locationId: 'loc-home' } } })).toBe(0)
  })

  it('the cart relation filter takes { in: [...] } (carts at every location with a role)', async () => {
    // Given rows at home and at the office
    const fake = seeded()

    // When the caller has a role at home only
    const rows = await fake.client.cartItem.findMany({
      where: { cart: { locationId: { in: ['loc-home', 'loc-elsewhere'] } } },
    })

    // Then only the home rows come back, both members' rows included
    expect(rows.map((r) => r.id).sort()).toEqual(['ci-bread', 'ci-milk'])
  })

  it('count with itemId and a location counts only that location', async () => {
    const fake = seeded()
    await fake.client.cartItem.create({
      data: { cartId: 'loc-office:vendor-1', itemId: 'milk', quantity: 1, userId: BOB },
    })
    expect(
      await fake.client.cartItem.count({ where: { itemId: 'milk', cart: { locationId: 'loc-home' } } }),
    ).toBe(1)
    expect(await fake.client.cartItem.count({ where: { itemId: 'milk' } })).toBe(2)
  })
})

describe('cartFake: CartItem create', () => {
  it('requires userId (added by), and every other NOT NULL column', async () => {
    const fake = seeded()
    for (const missing of ['cartId', 'itemId', 'userId', 'quantity']) {
      const data: Record<string, unknown> = {
        cartId: 'loc-home:vendor-1',
        itemId: 'cheese',
        quantity: 1,
        userId: BOB,
      }
      delete data[missing]
      await expect(fake.client.cartItem.create({ data })).rejects.toBeInstanceOf(MissingColumnError)
    }
  })

  it('refuses a cart that does not exist, with P2003', async () => {
    const fake = seeded()
    await expect(
      fake.client.cartItem.create({
        data: { cartId: 'no-such-cart', itemId: 'milk', quantity: 1, userId: BOB },
      }),
    ).rejects.toMatchObject({ code: 'P2003' })
  })

  it('honours data.id and refuses a taken id with P2002', async () => {
    const fake = seeded()
    const row = await fake.client.cartItem.create({
      data: { id: 'ci-mine', cartId: 'loc-home:vendor-1', itemId: 'cheese', quantity: 1, userId: BOB },
    })
    expect(row.id).toBe('ci-mine')
    await expect(
      fake.client.cartItem.create({
        data: { id: 'ci-mine', cartId: 'loc-office:vendor-1', itemId: 'jam', quantity: 1, userId: BOB },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('returns a copy, so changing the result does not change the store', async () => {
    const fake = seeded()
    const row = await fake.client.cartItem.findFirst({ where: { id: 'ci-milk' } })
    if (!row) throw new Error('ci-milk not found')
    row.quantity = 99
    expect(fake.state.cartItems.find((r) => r.id === 'ci-milk')?.quantity).toBe(2)
  })
})

describe('cartFake: Cart', () => {
  it('create needs no userId, and refuses one (task B.3 drops the column)', async () => {
    // Given an empty store
    const fake = createCartFake()

    // When a cart is created with id and location only
    const row = await fake.client.cart.create({ data: { id: 'loc-home:vendor-1', locationId: 'loc-home' } })

    // Then it is written, with no lastPurchasedAt yet
    expect(row).toEqual({ id: 'loc-home:vendor-1', locationId: 'loc-home', lastPurchasedAt: null })

    // And a write that names userId is refused, as Prisma refuses an unknown argument
    await expect(
      fake.client.cart.create({ data: { id: 'c2', locationId: 'loc-home', userId: ALICE } }),
    ).rejects.toBeInstanceOf(DroppedColumnError)
    await expect(
      fake.client.cart.upsert({
        where: { id: 'c3' },
        create: { id: 'c3', locationId: 'loc-home' },
        update: { userId: ALICE },
      }),
    ).rejects.toBeInstanceOf(DroppedColumnError)
  })

  it('refuses userId as a where key', async () => {
    const fake = seeded()
    await expect(fake.client.cart.findMany({ where: { userId: ALICE } })).rejects.toBeInstanceOf(
      UnknownWhereKeyError,
    )
  })

  it('requires locationId', async () => {
    const fake = createCartFake()
    await expect(fake.client.cart.create({ data: { id: 'c' } })).rejects.toBeInstanceOf(
      MissingColumnError,
    )
  })

  it('findMany filters by locationId { in } and sorts by id', async () => {
    const fake = seeded()
    await fake.client.cart.create({ data: { id: 'loc-home:a-vendor', locationId: 'loc-home' } })
    const rows = await fake.client.cart.findMany({
      where: { locationId: { in: ['loc-home'] } },
      orderBy: [{ id: 'asc' }],
    })
    expect(rows.map((r) => r.id)).toEqual(['loc-home:a-vendor', 'loc-home:vendor-1'])
  })

  it('refuses an orderBy it does not model', async () => {
    const fake = seeded()
    await expect(
      fake.client.cart.findMany({ orderBy: [{ lastPurchasedAt: 'desc' }] }),
    ).rejects.toThrow(/orderBy/)
  })

  it('createMany with skipDuplicates skips a taken id; without it, P2002 and nothing written', async () => {
    const fake = seeded()
    await expect(
      fake.client.cart.createMany({
        data: [
          { id: 'loc-home:vendor-2', locationId: 'loc-home' },
          { id: 'loc-home:vendor-1', locationId: 'loc-home' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
    expect(fake.state.carts).toHaveLength(2)

    const result = await fake.client.cart.createMany({
      data: [
        { id: 'loc-home:vendor-2', locationId: 'loc-home' },
        { id: 'loc-home:vendor-1', locationId: 'loc-home' },
      ],
      skipDuplicates: true,
    })
    expect(result).toEqual({ count: 1 })
    expect(fake.state.carts).toHaveLength(3)
  })

  it('upsert keeps create and update apart', async () => {
    const fake = seeded()
    const when = new Date('2026-11-15T00:00:00Z')
    await fake.client.cart.upsert({
      where: { id: 'loc-home:vendor-1' },
      create: { id: 'loc-home:vendor-1', locationId: 'loc-other' },
      update: { lastPurchasedAt: when },
    })
    expect(fake.state.carts.find((c) => c.id === 'loc-home:vendor-1')).toEqual({
      id: 'loc-home:vendor-1',
      locationId: 'loc-home',
      lastPurchasedAt: when,
    })
  })

  it('delete takes the cart rows with it (onDelete: Cascade)', async () => {
    const fake = seeded()
    await fake.client.cart.delete({ where: { id: 'loc-home:vendor-1' } })
    expect(fake.state.cartItems.map((r) => r.id)).toEqual(['ci-eggs'])
  })

  it('deleteMany takes the rows of every deleted cart with it', async () => {
    const fake = seeded()
    const result = await fake.client.cart.deleteMany({
      where: { id: { in: ['loc-home:vendor-1', 'loc-office:vendor-1'] } },
    })
    expect(result).toEqual({ count: 2 })
    expect(fake.state.cartItems).toEqual([])
  })
})

describe('cartFake: rollback through runInTransaction', () => {
  it('restores both stores when the transaction throws, and keeps them when it returns', async () => {
    // Given the seeded rows, registered as ONE rollback store
    const fake = seeded()
    const stores = [fake.state as unknown as RollbackStore]
    const tx = fake.client

    // When a transaction adds to a row, deletes a cart, creates a row, then throws
    const failed = runInTransaction(stores, tx, async (t: typeof tx) => {
      await t.cartItem.update({ where: { id: 'ci-milk' }, data: { quantity: { increment: 10 } } })
      await t.cart.delete({ where: { id: 'loc-office:vendor-1' } })
      await t.cartItem.create({
        data: { cartId: 'loc-home:vendor-1', itemId: 'cheese', quantity: 1, userId: BOB },
      })
      throw new Error('stock write failed')
    })

    // Then every write is undone
    await expect(failed).rejects.toThrow('stock write failed')
    expect(fake.state.carts.map((c) => c.id).sort()).toEqual([
      'loc-home:vendor-1',
      'loc-office:vendor-1',
    ])
    expect(fake.state.cartItems.map((r) => [r.id, r.quantity]).sort()).toEqual([
      ['ci-bread', 0],
      ['ci-eggs', 3],
      ['ci-milk', 2],
    ])

    // And the client still works on the restored arrays
    await runInTransaction(stores, tx, async (t: typeof tx) => {
      await t.cartItem.deleteMany({ where: { cartId: 'loc-home:vendor-1', quantity: { gt: 0 } } })
    })
    expect(fake.state.cartItems.map((r) => r.id).sort()).toEqual(['ci-bread', 'ci-eggs'])
  })

  it('rolls back through householdWorld.extend, together with the stock store', async () => {
    // Given a world with a location and a stock row, and the cart fake added to it
    const world = createHouseholdWorld()
    const fake = seeded()
    world.extend({ cart: fake.client.cart, cartItem: fake.client.cartItem }, [
      fake.state as unknown as RollbackStore,
    ])
    world.stock.reset(
      [{ id: 'loc-home', householdId: 'hh', name: 'Home', order: 0 }],
      [],
    )
    const client = world.client as unknown as typeof world.client & typeof fake.client

    // When a transaction deletes the bought rows and then throws
    await expect(
      client.$transaction(async (tx: unknown) => {
        const t = tx as typeof client
        await t.cartItem.deleteMany({ where: { cartId: 'loc-home:vendor-1', quantity: { gt: 0 } } })
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    // Then the rows are back
    expect(fake.state.cartItems.map((r) => r.id).sort()).toEqual(['ci-bread', 'ci-eggs', 'ci-milk'])
  })
})
