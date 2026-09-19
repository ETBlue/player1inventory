import { describe, expect, it } from 'vitest'
import { createStockFake, makeStock } from './stockFake.js'

// The double's OWN contract.
//
// This file exists because of a mutation check that came back green. Making
// the fake's `create` silently dedupe instead of throwing P2002 left all 155
// server tests passing — no resolver reaches a duplicate `create`, because
// every writer either upserts or checks `findUnique` first. So the constraint
// modelling was unreachable, and the comment claiming it pinned "the whole
// idempotency claim" was false.
//
// The modelling is still worth having: it is what makes a FUTURE resolver that
// creates unconditionally fail here rather than in production. But an
// unreachable guard is one refactor away from being deleted as dead code, so
// it gets its own test — the fake is the thing under test here, deliberately.

describe('stockFake models the constraints resolvers rely on', () => {
  it('a duplicate create throws P2002, the way @@unique([itemId, locationId]) does', () => {
    // Given a row already exists for (item, location)
    const fake = createStockFake()
    fake.reset(
      [{ id: 'loc_a', userId: 'user_1', isDefault: true }],
      [makeStock({ id: 'st_1', itemId: 'item_1', locationId: 'loc_a' })],
    )

    // When a second create names the same pair
    const create = fake.client.itemStock.create({
      data: { itemId: 'item_1', locationId: 'loc_a' },
    })

    // Then it is rejected with Prisma's unique-violation code, and no second
    // row was left behind
    return create.then(
      () => {
        throw new Error('expected the duplicate create to throw')
      },
      (err: { code?: string }) => {
        expect(err.code).toBe('P2002')
        expect(fake.state.itemStocks).toHaveLength(1)
      },
    )
  })

  it('a create for a different location of the same item is allowed', async () => {
    // Given the item is stocked in loc_a
    const fake = createStockFake()
    fake.reset(
      [
        { id: 'loc_a', userId: 'user_1', isDefault: true },
        { id: 'loc_b', userId: 'user_1', isDefault: false },
      ],
      [makeStock({ id: 'st_1', itemId: 'item_1', locationId: 'loc_a' })],
    )

    // When it is stocked in loc_b too — the constraint is COMPOSITE, and a
    // fake that keyed on itemId alone would wrongly reject this
    await fake.client.itemStock.create({
      data: { itemId: 'item_1', locationId: 'loc_b' },
    })

    // Then both rows stand
    expect(fake.state.itemStocks).toHaveLength(2)
  })

  it('upsert takes the update branch on an existing row rather than a second create', async () => {
    // Given a row at 2 packed
    const fake = createStockFake()
    fake.reset(
      [{ id: 'loc_a', userId: 'user_1', isDefault: true }],
      [
        makeStock({
          id: 'st_1',
          itemId: 'item_1',
          locationId: 'loc_a',
          packedQuantity: 2,
        }),
      ],
    )

    // When an upsert increments it
    await fake.client.itemStock.upsert({
      where: { itemId_locationId: { itemId: 'item_1', locationId: 'loc_a' } },
      update: { packedQuantity: { increment: 3 } },
      create: { itemId: 'item_1', locationId: 'loc_a', packedQuantity: 3 },
    })

    // Then the one row moved to 5 — `{ increment }` is applied as an
    // increment, so a writer that assigned the delta instead is
    // distinguishable
    expect(fake.state.itemStocks).toHaveLength(1)
    expect(fake.state.itemStocks[0]?.packedQuantity).toBe(5)
  })

  it('a second default location for one user throws P2002, the way the partial index does', async () => {
    // Given the user already has a default location
    const fake = createStockFake()
    fake.reset([{ id: 'loc_a', userId: 'user_1', isDefault: true }], [])

    // When another default is created for the same user
    const create = fake.client.location.create({
      data: { name: 'My Home', order: 0, isDefault: true, userId: 'user_1' },
    })

    // Then it is rejected with Prisma's unique-violation code and no row is
    // left behind. `ensureDefaultLocation` (lib/defaultLocation.ts) catches
    // exactly this and re-reads the winner, so a fake that accepted the
    // duplicate would leave that path unexercised.
    await expect(create).rejects.toMatchObject({ code: 'P2002' })
    expect(fake.state.locations).toHaveLength(1)
  })

  it('a default location for a DIFFERENT user is allowed', async () => {
    // Given user_1 has a default location
    const fake = createStockFake()
    fake.reset([{ id: 'loc_a', userId: 'user_1', isDefault: true }], [])

    // When user_2 gets one too — the index is partial and per-user, so this
    // must pass. A fake that rejected it would make "creates the default for a
    // new user" fail for the wrong reason.
    const row = await fake.client.location.create({
      data: { name: 'My Home', order: 0, isDefault: true, userId: 'user_2' },
    })

    // Then both exist
    expect(row.userId).toBe('user_2')
    expect(fake.state.locations).toHaveLength(2)
  })

  it('location.findFirst models Prisma where semantics — an absent key filters nothing', async () => {
    // Given two users, each with a default location
    const fake = createStockFake()
    fake.reset(
      [
        { id: 'loc_other', userId: 'user_1', isDefault: false },
        { id: 'loc_mine', userId: 'user_1', isDefault: true },
        { id: 'loc_theirs', userId: 'user_2', isDefault: true },
      ],
      [],
    )

    // When the caller's default is looked up
    const mine = await fake.client.location.findFirst({
      where: { userId: 'user_1', isDefault: true },
    })

    // Then it is theirs, not the first isDefault row in the table
    expect(mine?.id).toBe('loc_mine')

    // And a where clause missing `userId` matches across users — which is what
    // makes a resolver that DROPS the scope visible instead of silently green
    const unscoped = await fake.client.location.findFirst({
      where: { isDefault: true },
    })
    expect(unscoped?.id).toBe('loc_mine')
    const all = await fake.client.location.findMany({ where: { isDefault: true } })
    expect(all.map((l) => l.id)).toEqual(['loc_mine', 'loc_theirs'])
  })
})

// ── $transaction, added in PR 3c ─────────────────────────────────────────────
//
// The fake's rollback is the thing under test here. It has to be, for the same
// reason the duplicate-create guard above has its own test: a rollback that
// silently does nothing is WORSE than no rollback at all, because every later
// atomicity test would report as covered while proving nothing.
describe('stockFake $transaction rolls back', () => {
  function twoLocationFake() {
    const fake = createStockFake()
    // TWO locations with DIFFERENT quantities. With one location, "restored
    // every row" and "restored one row" are the same assertion.
    fake.reset(
      [
        { id: 'loc_kitchen', userId: 'user_1', isDefault: true },
        { id: 'loc_garage', userId: 'user_1', isDefault: false },
      ],
      [
        makeStock({
          id: 'st_kitchen',
          itemId: 'item_1',
          locationId: 'loc_kitchen',
          packedQuantity: 2,
          unpackedQuantity: 3,
        }),
        makeStock({
          id: 'st_garage',
          itemId: 'item_1',
          locationId: 'loc_garage',
          packedQuantity: 7,
          unpackedQuantity: 11,
        }),
      ],
    )
    return fake
  }

  it('a callback that throws leaves every row at its opening value', async () => {
    // Given two stock rows with different quantities
    const fake = twoLocationFake()

    // When a transaction updates BOTH rows, creates a third, and then throws
    await expect(
      fake.client.$transaction(async (tx: typeof fake.client) => {
        await tx.itemStock.update({
          where: { itemId_locationId: { itemId: 'item_1', locationId: 'loc_kitchen' } },
          data: { packedQuantity: 100 },
        })
        await tx.itemStock.update({
          where: { itemId_locationId: { itemId: 'item_1', locationId: 'loc_garage' } },
          data: { packedQuantity: 200 },
        })
        await tx.itemStock.create({
          data: { itemId: 'item_2', locationId: 'loc_kitchen' },
        })
        throw new Error('write 4 failed')
      }),
    ).rejects.toThrow('write 4 failed')

    // Then the third row is gone — the count check, which a SHALLOW copy would
    // also pass
    expect(fake.state.itemStocks).toHaveLength(2)

    // And each row's own NESTED field is back at its opening value. This is the
    // assertion a shallow copy fails: `state.itemStocks.slice()` restores the
    // array but shares the row objects, so `packedQuantity: 100` survives.
    const kitchen = fake.state.itemStocks.find((s) => s.id === 'st_kitchen')
    const garage = fake.state.itemStocks.find((s) => s.id === 'st_garage')
    expect(kitchen?.packedQuantity).toBe(2)
    expect(kitchen?.unpackedQuantity).toBe(3)
    expect(garage?.packedQuantity).toBe(7)
    expect(garage?.unpackedQuantity).toBe(11)
  })

  it('a callback that returns keeps every write', async () => {
    // Given the same two rows
    const fake = twoLocationFake()

    // When a transaction updates one row and returns
    const result = await fake.client.$transaction(async (tx: typeof fake.client) => {
      await tx.itemStock.update({
        where: { itemId_locationId: { itemId: 'item_1', locationId: 'loc_garage' } },
        data: { packedQuantity: 200 },
      })
      return 'committed'
    })

    // Then the write stands and the callback's value comes back
    expect(result).toBe('committed')
    expect(fake.state.itemStocks.find((s) => s.id === 'st_garage')?.packedQuantity).toBe(200)
    // And the row the transaction did not touch is untouched
    expect(fake.state.itemStocks.find((s) => s.id === 'st_kitchen')?.packedQuantity).toBe(2)
  })

  it('a registered store is rolled back two levels deep', async () => {
    // Given a test file's own store, whose rows hold an ARRAY OF OBJECTS — the
    // shape `Recipe.items` has, and the one a shallow copy cannot restore
    const fake = twoLocationFake()
    const extra = {
      recipes: [
        { id: 'r_1', items: [{ itemId: 'item_1', defaultAmount: 100 }] },
        { id: 'r_2', items: [{ itemId: 'item_1', defaultAmount: 250 }] },
      ],
    }
    fake.configureTransaction({ stores: [extra] })

    // When a transaction edits a recipe item two levels down, then throws
    await expect(
      fake.client.$transaction(async () => {
        extra.recipes[0].items[0].defaultAmount = 0.2
        extra.recipes[1].items.push({ itemId: 'item_9', defaultAmount: 1 })
        throw new Error('recipe write failed')
      }),
    ).rejects.toThrow('recipe write failed')

    // Then the nested field is back at its opening value, and the pushed entry
    // is gone
    expect(extra.recipes[0].items[0].defaultAmount).toBe(100)
    expect(extra.recipes[1].items).toHaveLength(1)
  })

  it('a key added during a failed transaction does not survive the rollback', async () => {
    // Given a store with one key
    const fake = twoLocationFake()
    const extra: Record<string, unknown> = { recipes: [] }
    fake.configureTransaction({ stores: [extra] })

    // When a transaction adds a SECOND key, then throws
    await expect(
      fake.client.$transaction(async () => {
        extra.carts = [{ id: 'c_1' }]
        throw new Error('cart write failed')
      }),
    ).rejects.toThrow('cart write failed')

    // Then the added key is gone. `Object.assign(store, snapshot)` alone would
    // leave it behind, because the snapshot has no entry to overwrite it with.
    expect('carts' in extra).toBe(false)
  })

  it('the array form is refused rather than faked', async () => {
    // Given a caller reaching for prisma.$transaction([...])
    const fake = twoLocationFake()

    // When the array form is used
    const call = fake.client.$transaction([Promise.resolve(1), Promise.resolve(2)])

    // Then it throws instead of pretending to roll back. The promises in the
    // array have already run by now, so any snapshot taken here is the state
    // AFTER those writes.
    await expect(call).rejects.toThrow(/only the interactive callback form/)
  })
})
