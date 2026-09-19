import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// `applyUnitSwitch` writes three kinds of row in ONE `prisma.$transaction`, so
// the double has to be able to roll back. `src/test/stockFake.ts` models
// `location` + `itemStock` and now models `$transaction` too (PR 3c Task 1);
// this file adds the `item`, `recipe` and `recipeItem` models the resolver also
// touches, and registers its own store with the fake so one rollback covers
// all five models.
//
// A plain `vi.fn()` mock could not prove any of this: "wrapped in
// $transaction" and "four sequential prisma calls" record the same calls
// before the failure.

interface FakeItem {
  id: string
  userId: string
  name: string
  targetUnit: string
  amountPerPackage: number | null
  consumeAmount: number
  // The five legacy state columns PR 5 drops. The dual-write mirrors the
  // DEFAULT location's converted quantities onto them.
  targetQuantity: number
  refillThreshold: number
  packedQuantity: number
  unpackedQuantity: number
  dueDate: Date | null
  createdAt: Date
  updatedAt: Date
}

interface FakeRecipe {
  id: string
  userId: string
  name: string
  lastCookedAt: Date | null
}

interface FakeRecipeItem {
  recipeId: string
  itemId: string
  defaultAmount: number
}

interface ExtraState {
  items: FakeItem[]
  recipes: FakeRecipe[]
  recipeItems: FakeRecipeItem[]
  recipeWriteFails: boolean
  // An index signature so this satisfies `RollbackStore` — `configureTransaction`
  // deep-copies every own enumerable property.
  [key: string]: unknown
}

// Everything is built INSIDE the `vi.mock` factory and hung off the mocked
// prisma: a factory is hoisted above every import and cannot close over a
// module-scope binding. Same shape `item.resolver.test.ts` uses.
vi.mock('../lib/prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const stockFake = createStockFake()

  const extra: ExtraState = {
    items: [],
    recipes: [],
    recipeItems: [],
    // Test control: when true, `recipeItem.createMany` rejects. That is the
    // LAST write the resolver issues, so it is the one that proves the earlier
    // item and stock writes were rolled back.
    recipeWriteFails: false,
  }

  type Where = Record<string, unknown>

  const matchesItem = (row: FakeItem, where: Where) =>
    // Prisma's own `where` semantics — an absent key filters nothing. A fake
    // that hardcoded `row.userId === where.userId` would keep the scope test
    // green after the resolver dropped the scope.
    (where.id === undefined || row.id === where.id) &&
    (where.userId === undefined || row.userId === where.userId)

  const withRelations = (row: FakeItem) => ({ ...row, tags: [], vendors: [] })

  const item = {
    findFirst: async ({ where = {} }: { where?: Where } = {}) =>
      extra.items.find((i) => matchesItem(i, where)) ?? null,
    findUniqueOrThrow: async ({ where = {} }: { where?: Where } = {}) => {
      const row = extra.items.find((i) => matchesItem(i, where))
      if (!row) throw new Error(`Item not found: ${String(where.id)}`)
      return withRelations(row)
    },
    update: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      const row = extra.items.find((i) => matchesItem(i, where))
      if (!row) throw new Error('Item not found')
      Object.assign(row, data, { updatedAt: new Date() })
      return withRelations(row)
    },
    updateMany: async ({
      where = {},
      data,
    }: {
      where?: Where
      data: Record<string, unknown>
    }) => {
      const rows = extra.items.filter((i) => matchesItem(i, where))
      for (const row of rows) Object.assign(row, data)
      return { count: rows.length }
    },
  }

  const recipe = {
    findFirst: async ({ where = {} }: { where?: Where } = {}) =>
      extra.recipes.find(
        (r) =>
          (where.id === undefined || r.id === where.id) &&
          (where.userId === undefined || r.userId === where.userId),
      ) ?? null,
  }

  const recipeItem = {
    deleteMany: async ({ where = {} }: { where?: Where } = {}) => {
      const before = extra.recipeItems.length
      extra.recipeItems = extra.recipeItems.filter((ri) => ri.recipeId !== where.recipeId)
      return { count: before - extra.recipeItems.length }
    },
    createMany: async ({ data }: { data: FakeRecipeItem[] }) => {
      if (extra.recipeWriteFails) throw new Error('recipeItem.createMany failed')
      extra.recipeItems.push(...data)
      return { count: data.length }
    },
  }

  // ONE merged client. It is both the module-level `prisma` and the `tx` the
  // $transaction callback receives, so the only thing separating
  // "transactional" from "four sequential prisma calls" is whether
  // $transaction's snapshot/restore wrapped them.
  const client = { ...stockFake.client, item, recipe, recipeItem }
  stockFake.configureTransaction({ txClient: client, stores: [extra] })

  return { prisma: { ...client, $stockFake: stockFake, $extra: extra } }
})

import { prisma } from '../lib/prisma.js'
import type { StockFake } from '../test/stockFake.js'

const mockPrisma = prisma as unknown as {
  $stockFake: StockFake
  $extra: ExtraState
}
const stockFake = mockPrisma.$stockFake
const extra = mockPrisma.$extra

const server = new ApolloServer<Context>({ typeDefs, resolvers })

async function run(
  query: string,
  variables: Record<string, unknown> = {},
  userId: string | null = 'user_a',
) {
  const res = await server.executeOperation({ query, variables }, { contextValue: { userId } })
  if (res.body.kind !== 'single') throw new Error('expected single result')
  return res.body.singleResult
}

const MUTATION = `
  mutation M($input: ApplyUnitSwitchInput!) {
    applyUnitSwitch(input: $input) {
      id
      name
      targetUnit
      amountPerPackage
      targetQuantity
      unpackedQuantity
    }
  }
`

const LOC_KITCHEN = 'loc_kitchen'
const LOC_GARAGE = 'loc_garage'
const LOC_THEIRS = 'loc_theirs'

// Flour is tracked in grams, 500 g per pack, and stocked in BOTH of user_a's
// locations with DIFFERENT numbers. That is what makes "converted every
// location" distinguishable from "converted the default one" — with one
// location, or with equal numbers, both implementations give the same answer.
//
// `loc_theirs` belongs to user_b, so "the caller's locations" is also
// distinguishable from "every location in the table".
function seed() {
  stockFake.reset(
    [
      { id: LOC_KITCHEN, userId: 'user_a', isDefault: true },
      { id: LOC_GARAGE, userId: 'user_a', isDefault: false },
      { id: LOC_THEIRS, userId: 'user_b', isDefault: true },
    ],
    [
      {
        id: 'st_kitchen',
        itemId: 'item_flour',
        locationId: LOC_KITCHEN,
        targetQuantity: 1000,
        refillThreshold: 200,
        packedQuantity: 2,
        unpackedQuantity: 250,
        dueDate: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'st_garage',
        itemId: 'item_flour',
        locationId: LOC_GARAGE,
        targetQuantity: 3000,
        refillThreshold: 500,
        packedQuantity: 1,
        unpackedQuantity: 750,
        dueDate: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  )
  extra.items = [
    {
      id: 'item_flour',
      userId: 'user_a',
      name: 'Flour',
      targetUnit: 'measurement',
      amountPerPackage: 500,
      consumeAmount: 100,
      // Deliberately unlike either location's numbers, so "the mirror ran" and
      // "the fixture already said that" are different observations.
      targetQuantity: 99,
      refillThreshold: 99,
      packedQuantity: 99,
      unpackedQuantity: 99,
      dueDate: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ]
  extra.recipes = [
    { id: 'r_bread', userId: 'user_a', name: 'Bread', lastCookedAt: null },
    { id: 'r_theirs', userId: 'user_b', name: 'Not mine', lastCookedAt: null },
  ]
  extra.recipeItems = [
    { recipeId: 'r_bread', itemId: 'item_flour', defaultAmount: 200 },
    { recipeId: 'r_bread', itemId: 'item_salt', defaultAmount: 5 },
  ]
  extra.recipeWriteFails = false
}

// Grams → packages at 500 g per package. The CLIENT does this arithmetic; the
// resolver only writes what it is handed (same contract as local's
// `applyUnitSwitchBatch`).
const KITCHEN_AFTER = { targetQuantity: 2, refillThreshold: 0.4, unpackedQuantity: 0.5 }
const GARAGE_AFTER = { targetQuantity: 6, refillThreshold: 1, unpackedQuantity: 1.5 }

const fullSwitch = {
  itemId: 'item_flour',
  updates: { targetUnit: 'package', amountPerPackage: 500, consumeAmount: 0.2 },
  stockConversions: [
    { locationId: LOC_KITCHEN, quantities: KITCHEN_AFTER },
    { locationId: LOC_GARAGE, quantities: GARAGE_AFTER },
  ],
  recipeUpdates: [
    {
      recipeId: 'r_bread',
      items: [
        { itemId: 'item_flour', defaultAmount: 0.4 },
        { itemId: 'item_salt', defaultAmount: 5 },
      ],
    },
  ],
}

const stockAt = (locationId: string) =>
  stockFake.state.itemStocks.find(
    (s) => s.itemId === 'item_flour' && s.locationId === locationId,
  )

const flour = () => extra.items.find((i) => i.id === 'item_flour')

describe('applyUnitSwitch', () => {
  beforeEach(() => {
    seed()
  })

  it('user can switch an item to packages and every stocked location converts', async () => {
    // Given flour tracked in grams in two locations with different quantities
    // When the user switches it to packages
    const res = await run(MUTATION, { input: fullSwitch })

    // Then the item's global configuration is on the new unit
    expect(res.errors).toBeUndefined()
    expect(res.data?.applyUnitSwitch).toMatchObject({
      id: 'item_flour',
      targetUnit: 'package',
      amountPerPackage: 500,
    })

    // And BOTH locations hold their OWN converted numbers. The garage's row is
    // the assertion a default-location-only implementation fails.
    expect(stockAt(LOC_KITCHEN)).toMatchObject({
      targetQuantity: 2,
      refillThreshold: 0.4,
      unpackedQuantity: 0.5,
    })
    expect(stockAt(LOC_GARAGE)).toMatchObject({
      targetQuantity: 6,
      refillThreshold: 1,
      unpackedQuantity: 1.5,
    })

    // And `packedQuantity` is untouched in both — it counts sealed packages,
    // which are packages in either unit
    expect(stockAt(LOC_KITCHEN)?.packedQuantity).toBe(2)
    expect(stockAt(LOC_GARAGE)?.packedQuantity).toBe(1)

    // And the recipe's amount for this item is rewritten, the other item's left
    expect(extra.recipeItems).toEqual([
      { recipeId: 'r_bread', itemId: 'item_flour', defaultAmount: 0.4 },
      { recipeId: 'r_bread', itemId: 'item_salt', defaultAmount: 5 },
    ])
  })

  it("the DEFAULT location's converted numbers are mirrored onto Item's legacy columns", async () => {
    // Given the dual-write bridge is still in place (removed in PR 5)
    // When the switch runs
    await run(MUTATION, { input: fullSwitch })

    // Then `Item` holds the KITCHEN's numbers (the default location), never the
    // garage's — a stale bundle renders one number per item and the default
    // location's is the only correct one to show it
    expect(flour()).toMatchObject({
      targetQuantity: 2,
      refillThreshold: 0.4,
      unpackedQuantity: 0.5,
    })
  })

  it('a switch that names only a NON-default location leaves Item’s legacy columns alone', async () => {
    // Given a conversion for the garage only
    const input = { ...fullSwitch, stockConversions: [{ locationId: LOC_GARAGE, quantities: GARAGE_AFTER }] }

    // When the switch runs
    const res = await run(MUTATION, { input })

    // Then the garage converted
    expect(res.errors).toBeUndefined()
    expect(stockAt(LOC_GARAGE)?.targetQuantity).toBe(6)
    // And `Item` still holds its fixture values — mirroring a garage edit would
    // make a stale bundle report the garage's numbers as the kitchen's
    expect(flour()?.targetQuantity).toBe(99)
    expect(flour()?.unpackedQuantity).toBe(99)
  })

  it('a failure on the LAST write rolls the item and every location back', async () => {
    // Given the recipe write will fail
    extra.recipeWriteFails = true

    // When the switch runs
    const res = await run(MUTATION, { input: fullSwitch })

    // Then the mutation reports the failure
    expect(res.errors?.[0]?.message).toMatch(/recipeItem.createMany failed/)

    // And NOTHING landed: the item is still on the old unit ...
    expect(flour()).toMatchObject({ targetUnit: 'measurement', consumeAmount: 100 })
    // ... and both locations still hold their OLD-unit quantities
    expect(stockAt(LOC_KITCHEN)).toMatchObject({
      targetQuantity: 1000,
      refillThreshold: 200,
      unpackedQuantity: 250,
    })
    expect(stockAt(LOC_GARAGE)).toMatchObject({
      targetQuantity: 3000,
      refillThreshold: 500,
      unpackedQuantity: 750,
    })
    // And the recipe's old amount survives — the delete was rolled back too
    expect(extra.recipeItems).toEqual([
      { recipeId: 'r_bread', itemId: 'item_flour', defaultAmount: 200 },
      { recipeId: 'r_bread', itemId: 'item_salt', defaultAmount: 5 },
    ])
  })

  it('a caller without a role on the SECOND location gets FORBIDDEN and nothing is written', async () => {
    // Given conversions naming the caller's kitchen FIRST and a stranger's
    // location second. Checking only the first location would let this through.
    const input = {
      ...fullSwitch,
      stockConversions: [
        { locationId: LOC_KITCHEN, quantities: KITCHEN_AFTER },
        { locationId: LOC_THEIRS, quantities: GARAGE_AFTER },
      ],
    }

    // When the switch runs
    const res = await run(MUTATION, { input })

    // Then the whole mutation is refused
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')

    // And the first location was NOT converted. Converting only the locations
    // the caller may write would leave the item in mixed units — the exact
    // corruption the transaction exists to prevent.
    expect(stockAt(LOC_KITCHEN)).toMatchObject({
      targetQuantity: 1000,
      unpackedQuantity: 250,
    })
    // And the item is still on the old unit
    expect(flour()).toMatchObject({ targetUnit: 'measurement' })
  })

  it("a caller cannot switch another user's item", async () => {
    // Given user_b, who owns none of these rows
    const res = await run(MUTATION, { input: fullSwitch }, 'user_b')

    // Then the location check refuses first, and nothing changed
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(flour()).toMatchObject({ targetUnit: 'measurement' })
  })

  it("a recipe the caller does not own is refused before any write", async () => {
    // Given a recipe belonging to user_b
    const input = {
      ...fullSwitch,
      recipeUpdates: [{ recipeId: 'r_theirs', items: [{ itemId: 'item_flour', defaultAmount: 1 }] }],
    }

    // When the switch runs
    const res = await run(MUTATION, { input })

    // Then it is refused and no location converted
    expect(res.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
    expect(stockAt(LOC_KITCHEN)?.targetQuantity).toBe(1000)
    expect(stockAt(LOC_GARAGE)?.targetQuantity).toBe(3000)
  })

  it('a location the item is not stocked in yet gets a row created', async () => {
    // Given the item has no row in the garage
    stockFake.reset(stockFake.state.locations, [stockFake.state.itemStocks[0]])

    // When the switch names it anyway
    const res = await run(MUTATION, { input: fullSwitch })

    // Then the row is created with the converted numbers, not skipped
    expect(res.errors).toBeUndefined()
    expect(stockAt(LOC_GARAGE)).toMatchObject({
      targetQuantity: 6,
      refillThreshold: 1,
      unpackedQuantity: 1.5,
    })
  })
})
