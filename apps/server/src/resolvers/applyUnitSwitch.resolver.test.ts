import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// `applyUnitSwitch` writes three kinds of row in ONE `prisma.$transaction`, so
// the double has to be able to roll back.
//
// - `user`, `household`, `householdMember`, `locationMember`, `location` and
//   `itemStock` are `householdWorld` (src/test/householdWorld.ts), whose
//   `$transaction` models rollback (stockFake's `runInTransaction`). Every
//   role is a row `seed` writes. Nothing is derived from a location's
//   `userId`: households H3a task 3.8 removed `derivedRoles` from this file.
// - `item` and `recipe` are household-scoped `ownedRowFake` stores. They
//   check every `where` and throw on a key they do not model. Until task 3.8
//   this file had its own matchers, which ignored an unknown key.
// - `recipeItem` is a small store here, registered with the world, so one
//   rollback covers all five models.
//
// A plain `vi.fn()` mock could not prove any of this: "wrapped in
// $transaction" and "four sequential prisma calls" record the same calls
// before the failure.

interface FakeItem {
  id: string
  householdId: string
  userId: string
  name: string
  targetUnit: string
  amountPerPackage: number | null
  consumeAmount: number
  createdAt: Date
  updatedAt: Date
}

interface FakeRecipe {
  id: string
  householdId: string
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
  recipeItems: FakeRecipeItem[]
  recipeWriteFails: boolean
  // An index signature so this satisfies `RollbackStore` — the rollback
  // deep-copies every own enumerable property.
  [key: string]: unknown
}

// Everything is built INSIDE the `vi.mock` factory and hung off the mocked
// prisma: a factory is hoisted above every import and cannot close over a
// module-scope binding.
vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const { checkWhere } = await import('../test/whereKeys.js')
  const world = createHouseholdWorld()
  const catalog = { scope: 'householdId' as const }
  const items = createOwnedRowFake<FakeItem>({
    model: 'Item',
    ...catalog,
    relations: () => ({ tags: [], vendors: [] }),
  })
  const recipes = createOwnedRowFake<FakeRecipe>({ model: 'Recipe', ...catalog })

  const extra: ExtraState = {
    recipeItems: [],
    // Test control: when true, `recipeItem.createMany` rejects. That is the
    // LAST write the resolver issues, so it is the one that proves the earlier
    // item and stock writes were rolled back.
    recipeWriteFails: false,
  }

  const recipeItem = {
    deleteMany: async ({ where = {} }: { where?: Record<string, unknown> } = {}) => {
      checkWhere('applyUnitSwitch.test(recipeItem)', where, { recipeId: 'equals' })
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

  world.extend(
    {
      item: {
        findMany: items.client.findMany,
        findUniqueOrThrow: items.client.findUniqueOrThrow,
        update: items.client.update,
        // NO `updateMany`, on purpose. Until cloud locations PR 5 the resolver
        // ran `tx.item.updateMany` inside the transaction, to copy the DEFAULT
        // location's converted quantities onto `Item`'s five legacy state
        // columns. PR 5 task 3 deleted that block. Without the method a
        // reinstated copy throws `tx.item.updateMany is not a function`.
      },
      recipe: { findFirst: recipes.client.findFirst },
      recipeItem,
    },
    [
      items.state as unknown as Record<string, unknown>,
      recipes.state as unknown as Record<string, unknown>,
      extra,
    ],
  )

  return { prisma: { ...world.client, $world: world, $items: items, $recipes: recipes, $extra: extra } }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { OwnedRowFake } from '../test/ownedRowFake.js'

const mockPrisma = prisma as unknown as {
  $world: HouseholdWorld
  $items: OwnedRowFake<FakeItem>
  $recipes: OwnedRowFake<FakeRecipe>
  $extra: ExtraState
}
const world = mockPrisma.$world
const stockFake = world.stock
const items = mockPrisma.$items
const recipes = mockPrisma.$recipes
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
//
// ── The people (plan H3a, rule 10) ──
//
// | Person | Household | Household role | Location roles                                  |
// |--------|-----------|----------------|-------------------------------------------------|
// | user_a | hh_a      | owner          | loc_kitchen, loc_garage: organizer              |
// | user_m | hh_a      | member         | loc_kitchen, loc_garage: participant            |
// | user_v | hh_a      | manager        | loc_kitchen: participant; loc_garage: viewer    |
// | user_b | hh_b      | owner          | loc_theirs: organizer                           |
//
// A unit switch is a catalog edit AND a stock write, so it needs household
// `manager` AND location `participant` on every location it names. user_m
// has the location role but not the household role; user_v has the household
// role but only `viewer` on the garage.
function seed() {
  world.reset()
  stockFake.reset(
    [
      { id: LOC_KITCHEN, householdId: 'hh_a' },
      { id: LOC_GARAGE, householdId: 'hh_a' },
      { id: LOC_THEIRS, householdId: 'hh_b' },
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
  world.seedHouseholds({
    households: [householdRow('hh_a', 'user_a'), householdRow('hh_b', 'user_b')],
    householdMembers: [
      householdMemberRow('hh_a', 'user_a', 'owner'),
      householdMemberRow('hh_a', 'user_m', 'member'),
      householdMemberRow('hh_a', 'user_v', 'manager'),
      householdMemberRow('hh_b', 'user_b', 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_KITCHEN, 'user_a', 'organizer'),
      locationMemberRow(LOC_GARAGE, 'user_a', 'organizer'),
      locationMemberRow(LOC_KITCHEN, 'user_m', 'participant'),
      locationMemberRow(LOC_GARAGE, 'user_m', 'participant'),
      locationMemberRow(LOC_KITCHEN, 'user_v', 'participant'),
      locationMemberRow(LOC_GARAGE, 'user_v', 'viewer'),
      locationMemberRow(LOC_THEIRS, 'user_b', 'organizer'),
    ],
  })
  const created = new Date('2026-01-01T00:00:00.000Z')
  const item = (id: string, householdId: string, name: string): FakeItem => ({
    id,
    householdId,
    userId: householdId === 'hh_a' ? 'user_a' : 'user_b',
    name,
    targetUnit: 'measurement',
    amountPerPackage: 500,
    consumeAmount: 100,
    createdAt: created,
    updatedAt: created,
  })
  items.reset([
    item('item_flour', 'hh_a', 'Flour'),
    item('item_salt', 'hh_a', 'Salt'),
    item('item_theirs', 'hh_b', 'Not mine'),
  ])
  recipes.reset([
    { id: 'r_bread', householdId: 'hh_a', userId: 'user_a', name: 'Bread', lastCookedAt: null },
    { id: 'r_theirs', householdId: 'hh_b', userId: 'user_b', name: 'Not mine', lastCookedAt: null },
  ])
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

const flour = () => items.state.rows.find((i) => i.id === 'item_flour')

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

  // Two tests stood here until cloud locations PR 5 task 3. Both asserted
  // `Item`'s five legacy state columns after a switch — one that the DEFAULT
  // location's converted numbers were copied onto them, one that a
  // non-default-only switch left them alone. PR 5 deletes the columns and the
  // copy, so the second lost its subject entirely: with no default-location
  // branch left in the resolver, a switch naming only the garage takes exactly
  // the same path as one naming the kitchen.

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

// ─── Households H3a task 3.8: roles and the household's items ────────────────

describe('applyUnitSwitch needs household manager AND location participant', () => {
  beforeEach(() => {
    seed()
  })

  it('a household member who is a location participant cannot switch the unit, and nothing changes', async () => {
    // Given user_m may write both locations' stock, but is only a household
    // `member`, and a unit switch edits the catalog
    const res = await run(MUTATION, { input: fullSwitch }, 'user_m')

    // Then it is refused, and nothing was written
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(flour()).toMatchObject({ targetUnit: 'measurement' })
    expect(stockAt(LOC_KITCHEN)?.targetQuantity).toBe(1000)
    expect(stockAt(LOC_GARAGE)?.targetQuantity).toBe(3000)
  })

  it('a household manager who is only a viewer at one location cannot switch, and nothing changes', async () => {
    // Given user_v is a household `manager`, a participant at the kitchen and
    // only a viewer at the garage
    const res = await run(MUTATION, { input: fullSwitch }, 'user_v')

    // Then it is refused, and not even the kitchen converted
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(flour()).toMatchObject({ targetUnit: 'measurement' })
    expect(stockAt(LOC_KITCHEN)?.targetQuantity).toBe(1000)
  })

  it('a household manager who is a location participant can switch the unit', async () => {
    // Given the switch names only the kitchen, where user_v is a participant
    const input = {
      ...fullSwitch,
      stockConversions: [{ locationId: LOC_KITCHEN, quantities: KITCHEN_AFTER }],
    }

    // When user_v switches
    const res = await run(MUTATION, { input }, 'user_v')

    // Then it works
    expect(res.errors).toBeUndefined()
    expect(flour()).toMatchObject({ targetUnit: 'package' })
    expect(stockAt(LOC_KITCHEN)?.targetQuantity).toBe(2)
  })
})

describe('applyUnitSwitch takes only the household\'s items', () => {
  beforeEach(() => {
    seed()
  })

  it("user cannot switch another household's item, even at their own locations", async () => {
    // Given item_theirs is hh_b's, and both locations are hh_a's
    const res = await run(MUTATION, { input: { ...fullSwitch, itemId: 'item_theirs' } })

    // Then it is refused, and nothing changed
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(items.state.rows.find((i) => i.id === 'item_theirs')).toMatchObject({
      targetUnit: 'measurement',
    })
    expect(stockFake.state.itemStocks.some((s) => s.itemId === 'item_theirs')).toBe(false)
  })

  it("user cannot switch an item that names no location, when it is another household's", async () => {
    // With no location to check, only the catalog check can refuse it
    const res = await run(MUTATION, {
      input: { ...fullSwitch, itemId: 'item_theirs', stockConversions: [], recipeUpdates: [] },
    })
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(items.state.rows.find((i) => i.id === 'item_theirs')).toMatchObject({
      targetUnit: 'measurement',
    })
  })

  it("a recipe update that names another household's item is refused, and nothing changes", async () => {
    // Given the bread recipe update names hh_b's item
    const input = {
      ...fullSwitch,
      recipeUpdates: [
        {
          recipeId: 'r_bread',
          items: [
            { itemId: 'item_flour', defaultAmount: 0.4 },
            { itemId: 'item_theirs', defaultAmount: 1 },
          ],
        },
      ],
    }

    // When the switch runs
    const res = await run(MUTATION, { input })

    // Then it is refused before any write
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(flour()).toMatchObject({ targetUnit: 'measurement' })
    expect(extra.recipeItems).toEqual([
      { recipeId: 'r_bread', itemId: 'item_flour', defaultAmount: 200 },
      { recipeId: 'r_bread', itemId: 'item_salt', defaultAmount: 5 },
    ])
  })

  it('an item id no row holds is refused with BAD_USER_INPUT', async () => {
    const res = await run(MUTATION, {
      input: { ...fullSwitch, itemId: 'item_ghost', stockConversions: [], recipeUpdates: [] },
    })
    expect(res.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT')
  })

  it("a location of another household cannot hold the item's converted stock", async () => {
    // Given user_a is ALSO a participant at hh_b's location. Nobody can be in
    // two households before H5, but nothing in the schema stops it. user_a is
    // hh_a's owner, so the catalog check alone passes hh_a's item_flour.
    world.households.state.householdMembers.push(householdMemberRow('hh_b', 'user_a', 'member'))
    world.households.state.locationMembers.push(
      locationMemberRow(LOC_THEIRS, 'user_a', 'participant'),
    )
    const input = {
      ...fullSwitch,
      stockConversions: [{ locationId: LOC_THEIRS, quantities: GARAGE_AFTER }],
      recipeUpdates: [],
    }

    // When user_a switches hh_a's flour and names hh_b's location
    const res = await run(MUTATION, { input })

    // Then it is refused: the item and the location are in different
    // households. No flour row appears at hh_b's location, and the item is
    // still on the old unit.
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(stockAt(LOC_THEIRS)).toBeUndefined()
    expect(flour()).toMatchObject({ targetUnit: 'measurement' })
  })

  // In the per-location loop, `requireLocationRole` must run BEFORE
  // `requireLocationItems`. Run the other way round, an existing foreign
  // location plus an item id no row holds gives BAD_USER_INPUT, while an
  // unknown location gives FORBIDDEN, so a stranger could tell which location
  // ids exist (task 3.8 review).
  it("a stranger naming another household's location gets FORBIDDEN, even for a missing item", async () => {
    // Given user_a (hh_a's owner, so the catalog role check passes) holds no
    // role on hh_b's LOC_THEIRS, and no item has the id item_ghost
    const input = {
      ...fullSwitch,
      itemId: 'item_ghost',
      stockConversions: [{ locationId: LOC_THEIRS, quantities: GARAGE_AFTER }],
      recipeUpdates: [],
    }

    // When user_a runs the switch
    const res = await run(MUTATION, { input })

    // Then the answer is FORBIDDEN, the same as for an unknown location, and
    // no row appears at LOC_THEIRS
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(stockAt(LOC_THEIRS)).toBeUndefined()
  })

  it('an unknown location with a missing item gets the same FORBIDDEN (control)', async () => {
    // A negative control: green in both orders. It shows the answer above
    // matches this one.
    const res = await run(MUTATION, {
      input: {
        ...fullSwitch,
        itemId: 'item_ghost',
        stockConversions: [{ locationId: 'loc_does_not_exist', quantities: GARAGE_AFTER }],
        recipeUpdates: [],
      },
    })
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
  })
})
