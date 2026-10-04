import { beforeEach, describe, expect, it, vi } from 'vitest'

// The stateful `location` + `itemStock` double from src/test/stockFake.ts.
//
// It is the right double for this module rather than a `vi.fn()` because the
// questions here are all about STATE: what an omitted field leaves behind,
// what `{ increment: n }` adds to, and what the saved row reads back as. A
// `vi.fn()` recording the upsert argument would pass against an implementation
// that assigned where it should increment — the assertion would only repeat
// the argument the test itself passed in.
//
// The fake applies `{ increment: n }` as an increment on its UPDATE path
// (`applyNumber` in stockFake.ts), which is what makes the increment tests
// below able to fail. On its CREATE path it coerces with `?? 0` and would
// store the object verbatim, so a `writeStock` that forgot to resolve an
// increment into a plain number for a brand-new row fails here too — on the
// value, loudly, rather than silently.
vi.mock('./prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const stockFake = createStockFake()
  return { prisma: { ...stockFake.client, $stockFake: stockFake } }
})

import { writeStock } from './itemStockWrite.js'
import { prisma } from './prisma.js'
import { makeStock, type StockFake } from '../test/stockFake.js'

const stockFake = (prisma as unknown as { $stockFake: StockFake }).$stockFake

// TWO locations, and `item-milk` stocked at BOTH with DIFFERENT numbers.
//
// One location would make every assertion here vacuous: "wrote the location I
// named" and "wrote every row for this item" give the same answer when there
// is only one row. The two rows also carry different values, so "the write
// landed" and "the fixture already said that" stay distinguishable.
const HOME = 'loc-home'
const GARAGE = 'loc-garage'

function reset() {
  stockFake.reset(
    [
      { id: HOME, userId: 'user-a', isDefault: true },
      { id: GARAGE, userId: 'user-a', isDefault: false },
    ],
    [
      makeStock({
        id: 'st-home',
        itemId: 'item-milk',
        locationId: HOME,
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 2,
        unpackedQuantity: 3,
        dueDate: new Date('2026-09-01T00:00:00.000Z'),
      }),
      makeStock({
        id: 'st-garage',
        itemId: 'item-milk',
        locationId: GARAGE,
        targetQuantity: 9,
        refillThreshold: 4,
        packedQuantity: 7,
        unpackedQuantity: 8,
      }),
    ],
  )
}

const rowAt = (locationId: string, itemId = 'item-milk') =>
  stockFake.state.itemStocks.find((s) => s.itemId === itemId && s.locationId === locationId)

describe('writeStock', () => {
  beforeEach(reset)

  it('creates a row with zero defaults for the fields the write omits', async () => {
    // Given item-bread is stocked nowhere
    expect(rowAt(HOME, 'item-bread')).toBeUndefined()

    // When only two of the five fields are written
    const saved = await writeStock('item-bread', HOME, {
      targetQuantity: 4,
      packedQuantity: 1,
    })

    // Then the other three open at 0 and dueDate at null — a NULL column, not
    // an absent key. `undefined` here would reach Prisma as "do not set this
    // column", which for a NOT NULL numeric column is an error rather than a
    // zero.
    expect(saved.targetQuantity).toBe(4)
    expect(saved.packedQuantity).toBe(1)
    expect(saved.refillThreshold).toBe(0)
    expect(saved.unpackedQuantity).toBe(0)
    expect(saved.dueDate).toBeNull()
    expect(saved.dueDate).not.toBeUndefined()
  })

  it('updates an existing row and leaves the fields it does not name alone', async () => {
    // Given st-home carries five non-default values (reset)
    // When only packedQuantity is written
    await writeStock('item-milk', HOME, { packedQuantity: 5 })

    // Then that one column moved and the other four kept their values. This
    // is a merge, not a replace — a replace would zero targetQuantity,
    // refillThreshold and unpackedQuantity and clear the date.
    expect(rowAt(HOME)).toMatchObject({
      packedQuantity: 5,
      targetQuantity: 3,
      refillThreshold: 1,
      unpackedQuantity: 3,
      dueDate: new Date('2026-09-01T00:00:00.000Z'),
    })
  })

  it('writes only the location it is given', async () => {
    // Given item-milk is stocked at BOTH locations with different numbers
    // When the write names the Garage
    await writeStock('item-milk', GARAGE, { packedQuantity: 1 })

    // Then the Garage row moved and the Home row did not. This is the
    // assertion a one-location fixture cannot make.
    expect(rowAt(GARAGE)?.packedQuantity).toBe(1)
    expect(rowAt(HOME)?.packedQuantity).toBe(2)
  })

  it('returns the saved row, carrying the RESULTING total and not the delta', async () => {
    // Given st-home starts at packed 2 and unpacked 3, so its on-hand total
    // is 5. The starting values are non-zero ON PURPOSE: with a row at 0/0,
    // "the delta the caller passed in" and "the row's total afterwards" are
    // the same number, and this assertion could not tell the two sources
    // apart.
    expect(rowAt(HOME)).toMatchObject({ packedQuantity: 2, unpackedQuantity: 3 })

    // When 5 more packed units are added
    const saved = await writeStock('item-milk', HOME, {
      packedQuantity: { increment: 5 },
    })

    // Then the returned row reads 7 + 3, a total of 10 — the number
    // `checkout`'s inventory log has to record. The delta was 5 and the
    // written field alone would read 5, so neither of those can be mistaken
    // for this.
    expect(saved.packedQuantity).toBe(7)
    expect(saved.unpackedQuantity).toBe(3)
    expect(saved.packedQuantity + saved.unpackedQuantity).toBe(10)

    // And the returned row is the STORED row, not a copy of the write
    expect(saved.packedQuantity).toBe(rowAt(HOME)?.packedQuantity)
    expect(saved.id).toBe('st-home')
  })

  it('applies { increment: n } to an existing row as old + n', async () => {
    // Given st-garage holds packed 7
    // When an increment of 4 is written
    const saved = await writeStock('item-milk', GARAGE, {
      packedQuantity: { increment: 4 },
    })

    // Then the row reads 11, not 4. An implementation that assigned the
    // increment instead of adding it would leave 4 here — and `checkout`
    // uses this form precisely so two concurrent checkouts of one item
    // cannot lose an increment to a read-modify-write race.
    expect(saved.packedQuantity).toBe(11)
    expect(saved.packedQuantity).not.toBe(4)
  })

  it('seeds a brand-new row from { increment: n } as a plain n', async () => {
    // Given item-bread has no row at the Garage
    expect(rowAt(GARAGE, 'item-bread')).toBeUndefined()

    // When the first write for it is an increment
    const saved = await writeStock('item-bread', GARAGE, {
      packedQuantity: { increment: 6 },
    })

    // Then the new row opens at 6 — the row's implicit 0 plus the increment —
    // as a NUMBER. Passing Prisma the `{ increment: 6 }` object in a `create`
    // is an error, so this is the assertion that keeps `seed()` honest.
    expect(saved.packedQuantity).toBe(6)
    expect(typeof saved.packedQuantity).toBe('number')
  })

  it('an EMPTY write still creates the row, at every zero default', async () => {
    // This is where `writeStock` differs from the `mirrorStock` it replaces.
    // `mirrorStock` returned early on an empty `data` and wrote nothing; a
    // function that must return the saved row cannot decline to write one.
    //
    // It changes no caller. `mirrorStockToDefaultLocation` makes the same
    // empty test itself before calling, which is the guard that stops
    // `updateItem` stocking every renamed item in the default location; and
    // `upsertItemStock` already created a row of zeroes for an empty input,
    // because its GraphQL field returns `ItemStock!`.
    //
    // Given item-bread is stocked nowhere
    // When an empty write names the Home location
    const saved = await writeStock('item-bread', HOME, {})

    // Then the row exists, at zeroes, and comes back
    expect(saved).toMatchObject({
      itemId: 'item-bread',
      locationId: HOME,
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      dueDate: null,
    })
    expect(rowAt(HOME, 'item-bread')).toBeDefined()
  })

  it('an EMPTY write against an existing row changes none of its values', async () => {
    // Given st-home's five values (reset)
    // When an empty write names it
    const saved = await writeStock('item-milk', HOME, {})

    // Then every value survives. An empty `update` payload must not be read
    // as "set these columns to their defaults".
    expect(saved).toMatchObject({
      id: 'st-home',
      targetQuantity: 3,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 3,
      dueDate: new Date('2026-09-01T00:00:00.000Z'),
    })
    expect(stockFake.state.itemStocks).toHaveLength(2)
  })

  it('clears dueDate when the write says null, and keeps it when the write omits it', async () => {
    // Given st-home carries a dueDate
    // When the write names dueDate: null
    const cleared = await writeStock('item-milk', HOME, { dueDate: null })
    expect(cleared.dueDate).toBeNull()

    // When a later write omits the key entirely
    reset()
    const kept = await writeStock('item-milk', HOME, { packedQuantity: 9 })

    // Then the date survives. "Set it to null" and "do not mention it" are
    // different writes, and a fixture starting at null could not tell them
    // apart.
    expect(kept.dueDate).toEqual(new Date('2026-09-01T00:00:00.000Z'))
  })
})
