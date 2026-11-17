import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { consumeItem } from '@p1i/types'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { InventoryLogFake } from '../test/inventoryLogFake.js'

// `consumeRecipes` in one transaction (households H3b task B.6, decision D4).
//
// ── WHY A FILE OF ITS OWN ──
//
// The cook writes three models (stock, logs, recipes) and must write all of
// them or none. So each is a STATEFUL fake registered with `runInTransaction`
// (src/test/stockFake.ts) through `world.extend`, which restores them all when
// the callback throws. `recipe.resolver.test.ts` mocked `inventoryLog` and
// `recipe` as call recorders, which cannot show "nothing was written": a
// recorder keeps the call of a transaction that rolled back.
//
//   - `location`, `itemStock`, roles: `householdWorld`.
//   - `inventoryLog`: `inventoryLogFake`.
//   - `item`: `findMany` over an `ownedRowFake`; the rows carry the unit
//     settings `consumeItem` reads.
//   - `recipe`: `updateMany` over an `ownedRowFake`, for `lastCookedAt`.
//
// ── THE ROW LOCK ──
//
// The resolver locks each stock row with `SELECT … FOR UPDATE` through
// `tx.$queryRaw` before it reads it. The world's fake has no locks, so this
// file adds one: `$transaction` gives each transaction its own `tx` whose
// `$queryRaw` takes a per-row lock, held until that transaction's callback
// ends. A second transaction asking for the same row waits. That is enough to
// run two cooks AT THE SAME TIME and see whether one use is lost.
//
// `$queryRaw` accepts exactly one SQL text and throws on any other, so a
// changed or new raw query cannot pass here silently.
//
// What the fake still cannot show: Postgres's own lock wait, and a rollback
// that restores the store while another transaction waits (the snapshot is of
// the whole store, see `householdWorld.ts`). No test here runs two
// transactions where one fails.
//
// ── THE FIXTURE (H3a rule 10, H3b rule 14) ──
//
// | Person    | Household | Location roles                              |
// |-----------|-----------|---------------------------------------------|
// | ALICE     | hh_home   | LOC_HOME organizer, LOC_GARAGE organizer    |
// | BOB       | hh_home   | LOC_HOME participant                        |
// | VERA      | hh_home   | LOC_HOME viewer                             |
// | STRANGER  | hh_other  | LOC_STRANGER organizer                      |

const SQL_LOCK =
  'SELECT id FROM "ItemStock" WHERE "itemId" = ? AND "locationId" = ? FOR UPDATE'

const hooks: {
  // Called before each log row is written; a test throws here to fail one item.
  beforeLog?: (data: { itemId: string }) => void
  // Called before each recipe mark; a test throws here to fail the mark.
  beforeRecipeMark?: () => void
} = {}

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createInventoryLogFake } = await import('../test/inventoryLogFake.js')
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const world = createHouseholdWorld()
  const logs = createInventoryLogFake()
  const items = createOwnedRowFake<{
    id: string
    householdId: string
    targetUnit: 'package' | 'measurement'
    measurementUnit: string | null
    amountPerPackage: number | null
    consumeAmount: number
  }>({ model: 'Item', scope: 'householdId' })
  const recipes = createOwnedRowFake<{
    id: string
    householdId: string
    lastCookedAt: Date | null
  }>({ model: 'Recipe', scope: 'householdId' })

  // Taken before `extend` replaces `world.client.itemStock` below.
  const stockClient = world.client.itemStock
  world.extend(
    {
      inventoryLog: {
        ...logs.client,
        create: async (args: { data: { itemId: string } }) => {
          hooks.beforeLog?.(args.data)
          return logs.client.create(args as Parameters<typeof logs.client.create>[0])
        },
      },
      item: { findMany: items.client.findMany },
      // One change to the stock store, for this file only: A GAP AFTER THE
      // READ. The read waits one macrotask before it returns. Without it, the
      // fake runs one cook's read and write with no other cook in between, so
      // a resolver with no row lock still passes the concurrent test. With it,
      // the other cook runs in that gap: it reads the same old numbers unless
      // the lock makes it wait. That gap is what READ COMMITTED allows in
      // Postgres.
      //
      // (This wrapper also copied every row `findUnique` and `upsert`
      // returned, because `stockFake` returned the LIVE row. Since 2026-11-15
      // `stockFake` returns copies itself, so that part is gone.)
      itemStock: {
        ...stockClient,
        findUnique: async (args: Parameters<typeof stockClient.findUnique>[0]) => {
          const row = await stockClient.findUnique(args)
          await new Promise((resolve) => setTimeout(resolve, 0))
          return row
        },
      },
      recipe: {
        updateMany: async (args: Parameters<typeof recipes.client.updateMany>[0]) => {
          hooks.beforeRecipeMark?.()
          return recipes.client.updateMany(args)
        },
      },
    },
    [
      logs.state as unknown as Record<string, unknown>,
      recipes.state as unknown as Record<string, unknown>,
    ],
  )

  // ── The row lock (see the file comment) ──
  // `tails` holds, per row key, a promise that resolves when the last
  // transaction that asked for the row has ended.
  const tails = new Map<string, Promise<void>>()
  const lockOrder: string[] = []

  async function lockingTransaction(fn: unknown, options?: unknown): Promise<unknown> {
    if (typeof fn !== 'function') return world.client.$transaction(fn)
    // Recorded so a test can see the resolver asked for a timeout.
    lastTransactionOptions.value = options
    return world.client.$transaction(async (tx: Record<string, unknown>) => {
      const held = new Set<string>()
      const releases: Array<() => void> = []
      const txWithLock = {
        ...tx,
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          if (strings.join('?') !== SQL_LOCK) {
            throw new Error(`The fake $queryRaw does not know this SQL: ${strings.join('?')}`)
          }
          const [itemId, locationId] = values as [string, string]
          const key = `${itemId}@${locationId}`
          lockOrder.push(itemId)
          if (!held.has(key)) {
            held.add(key)
            const before = tails.get(key) ?? Promise.resolve()
            let release!: () => void
            const mine = new Promise<void>((r) => {
              release = r
            })
            tails.set(key, before.then(() => mine))
            releases.push(release)
            await before
          }
          const row = world.stock.state.itemStocks.find(
            (s) => s.itemId === itemId && s.locationId === locationId,
          )
          return row ? [{ id: row.id }] : []
        },
      }
      try {
        return await (fn as (tx: unknown) => Promise<unknown>)(txWithLock)
      } finally {
        for (const release of releases) release()
      }
    })
  }
  const lastTransactionOptions: { value: unknown } = { value: undefined }

  return {
    prisma: {
      ...world.client,
      $transaction: lockingTransaction,
      $world: world,
      $logs: logs,
      $items: items,
      $recipes: recipes,
      $lockOrder: lockOrder,
      $lastTransactionOptions: lastTransactionOptions,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import { makeStock } from '../test/stockFake.js'

type ItemRow = {
  id: string
  householdId: string
  targetUnit: 'package' | 'measurement'
  measurementUnit: string | null
  amountPerPackage: number | null
  consumeAmount: number
}
type RecipeRow = { id: string; householdId: string; lastCookedAt: Date | null }

const handles = prisma as unknown as {
  $world: HouseholdWorld
  $logs: InventoryLogFake
  $items: { reset: (rows: ItemRow[]) => void }
  $recipes: { reset: (rows: RecipeRow[]) => void; state: { rows: RecipeRow[] } }
  $lockOrder: string[]
  $lastTransactionOptions: { value: unknown }
}
const world = handles.$world
const logs = handles.$logs
const recipes = handles.$recipes

const ALICE = 'user_alice'
const BOB = 'user_bob'
const VERA = 'user_vera'
const STRANGER = 'user_stranger'

const LOC_HOME = 'loc_home'
const LOC_GARAGE = 'loc_garage'
const LOC_STRANGER = 'loc_stranger'

function itemRow(id: string, overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    id,
    householdId: 'hh_home',
    targetUnit: 'package',
    measurementUnit: null,
    amountPerPackage: null,
    consumeAmount: 1,
    ...overrides,
  }
}

function seed() {
  hooks.beforeLog = undefined
  hooks.beforeRecipeMark = undefined
  handles.$lockOrder.length = 0
  handles.$lastTransactionOptions.value = undefined
  world.reset()
  world.stock.reset(
    [
      { id: LOC_HOME, householdId: 'hh_home' },
      { id: LOC_GARAGE, householdId: 'hh_home' },
      { id: LOC_STRANGER, householdId: 'hh_other' },
    ],
    [
      makeStock({ id: 'st_milk_home', itemId: 'item_milk', locationId: LOC_HOME, packedQuantity: 3 }),
      makeStock({ id: 'st_bread_home', itemId: 'item_bread', locationId: LOC_HOME, packedQuantity: 5 }),
      // 6 ml to a bottle, tracked in ml: 2 bottles and 1 ml loose.
      makeStock({ id: 'st_oil_home', itemId: 'item_oil', locationId: LOC_HOME, packedQuantity: 2, unpackedQuantity: 1 }),
      // The same item at two other locations. A cook that wrote the wrong
      // location, or every location, would change these.
      makeStock({ id: 'st_milk_garage', itemId: 'item_milk', locationId: LOC_GARAGE, packedQuantity: 40 }),
      makeStock({ id: 'st_milk_stranger', itemId: 'item_milk', locationId: LOC_STRANGER, packedQuantity: 99 }),
    ],
  )
  world.seedHouseholds({
    households: [householdRow('hh_home', ALICE), householdRow('hh_other', STRANGER)],
    householdMembers: [
      householdMemberRow('hh_home', ALICE, 'owner'),
      householdMemberRow('hh_home', BOB, 'member'),
      householdMemberRow('hh_home', VERA, 'member'),
      householdMemberRow('hh_other', STRANGER, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_HOME, ALICE, 'organizer'),
      locationMemberRow(LOC_HOME, BOB, 'participant'),
      locationMemberRow(LOC_HOME, VERA, 'viewer'),
      locationMemberRow(LOC_GARAGE, ALICE, 'organizer'),
      locationMemberRow(LOC_STRANGER, STRANGER, 'organizer'),
    ],
  })
  handles.$items.reset([
    itemRow('item_milk'),
    itemRow('item_bread'),
    // Not stocked anywhere.
    itemRow('item_eggs'),
    itemRow('item_oil', { targetUnit: 'measurement', measurementUnit: 'ml', amountPerPackage: 6 }),
    itemRow('item_theirs', { householdId: 'hh_other' }),
  ])
  recipes.reset([
    { id: 'recipe_home', householdId: 'hh_home', lastCookedAt: null },
    { id: 'recipe_other', householdId: 'hh_other', lastCookedAt: null },
  ])
  logs.reset([])
}

const server = new ApolloServer<Context>({ typeDefs, resolvers })

const CONSUME = `mutation Consume($input: ConsumeRecipesInput!) {
  consumeRecipes(input: $input) { allSucceeded itemResults { itemId success error } }
}`

type ItemInput = { itemId: string; delta: number; note?: string; logKey?: string; logParams?: unknown }

async function cook(
  items: ItemInput[],
  userId: string,
  options: { locationId?: string; recipeIds?: string[] } = {},
) {
  const res = await server.executeOperation(
    {
      query: CONSUME,
      variables: {
        input: {
          occurredAt: '2026-11-15T12:00:00.000Z',
          recipeIds: options.recipeIds ?? [],
          items,
          locationId: options.locationId ?? LOC_HOME,
        },
      },
    },
    { contextValue: { userId } },
  )
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult
}

function code(res: { errors?: ReadonlyArray<{ extensions?: Record<string, unknown> }> }) {
  return res.errors?.[0]?.extensions?.code
}

function stockAt(itemId: string, locationId = LOC_HOME) {
  return world.stock.state.itemStocks.find((s) => s.itemId === itemId && s.locationId === locationId)
}

function lastCookedAt(recipeId: string) {
  return recipes.state.rows.find((r) => r.id === recipeId)?.lastCookedAt ?? null
}

/** Everything `consumeRecipes` can write, as plain data, for a before/after compare. */
function writable() {
  return structuredClone({
    itemStocks: world.stock.state.itemStocks,
    logs: logs.state.logs,
    recipes: recipes.state.rows,
  })
}

beforeEach(() => {
  seed()
})

// ─── the server computes the numbers ─────────────────────────────────────────

describe('consumeRecipes computes the new stock on the server', () => {
  it('user cooking has the amount used taken off the stock row, and a log written', async () => {
    // Given 3 packs of milk at home
    // When ALICE uses 1, through a recipe
    const res = await cook(
      [{ itemId: 'item_milk', delta: -1, note: 'consumed via Pasta', logKey: 'cooking.log.consumedVia', logParams: { recipes: 'Pasta' } }],
      ALICE,
      { recipeIds: ['recipe_home'] },
    )

    // Then every item reports success (a failure would be an error instead)
    expect(res.errors).toBeUndefined()
    expect(res.data?.consumeRecipes).toEqual({
      allSucceeded: true,
      itemResults: [{ itemId: 'item_milk', success: true, error: null }],
    })
    // And the stock fell by 1
    expect(stockAt('item_milk')).toMatchObject({ packedQuantity: 2, unpackedQuantity: 0 })
    // And one log, with the full delta, the total the SERVER computed, the
    // cook as author, and the cook's location
    expect(logs.state.logs).toHaveLength(1)
    expect(logs.state.logs[0]).toMatchObject({
      itemId: 'item_milk',
      delta: -1,
      quantity: 2,
      userId: ALICE,
      locationId: LOC_HOME,
      occurredAt: new Date('2026-11-15T12:00:00.000Z'),
      note: 'consumed via Pasta',
      logKey: 'cooking.log.consumedVia',
      logParams: { recipes: 'Pasta' },
    })
    // And the recipe is marked as cooked
    expect(lastCookedAt('recipe_home')).toBeInstanceOf(Date)
  })

  it('two cooks of the same item one after the other, from the same screen, both count', async () => {
    // Given ALICE and BOB both see 3 packs of milk, and each uses 1. Before
    // B.6 each screen sent "2 left", and the second write replaced the first.
    const first = await cook([{ itemId: 'item_milk', delta: -1 }], ALICE)
    const second = await cook([{ itemId: 'item_milk', delta: -1 }], BOB)

    // Then both uses are taken off: 3 - 1 - 1 = 1
    expect(first.errors).toBeUndefined()
    expect(second.errors).toBeUndefined()
    expect(stockAt('item_milk')?.packedQuantity).toBe(1)
    // And each log total is the stock after ITS cook
    expect(logs.state.logs.map((l) => l.quantity)).toEqual([2, 1])
  })

  it('two cooks of the same item AT THE SAME TIME both count: the row lock makes the second wait', async () => {
    // Given two cooks sent together. Without the lock both read 3 packs
    // before either writes, both compute 2, and one use is lost.
    const [a, b] = await Promise.all([
      cook([{ itemId: 'item_milk', delta: -1 }], ALICE),
      cook([{ itemId: 'item_milk', delta: -1 }], BOB),
    ])

    expect(a.errors).toBeUndefined()
    expect(b.errors).toBeUndefined()
    expect(stockAt('item_milk')?.packedQuantity).toBe(1)
    expect(logs.state.logs.map((l) => l.quantity).sort()).toEqual([1, 2])
  })

  // OLD-BUNDLE SHIM. Remove with the three deprecated fields of
  // `ConsumeRecipesItemInput`, in the release after households (see
  // `recipe.graphql` and `src/test/oldBundleCompat.test.ts`). Until the owner
  // chose to deploy the server first (2026-11-17), this test said the old
  // shape is refused.
  it('user on an old bundle can cook: the final numbers it sends are ignored, delta is used', async () => {
    // Given 3 packs of milk, and the pre-B.6 input shape with final numbers
    // that are wrong on purpose (a stale screen would send such numbers)
    const res = await cook(
      [{ itemId: 'item_milk', delta: -1, packedQuantity: 50, unpackedQuantity: 7, quantity: 51 } as ItemInput],
      ALICE,
    )

    // Then the cook works, and the stock and the log follow delta (-1) only
    expect(res.errors).toBeUndefined()
    expect(stockAt('item_milk')).toMatchObject({ packedQuantity: 2, unpackedQuantity: 0 })
    expect(logs.state.logs).toHaveLength(1)
    expect(logs.state.logs[0]).toMatchObject({ itemId: 'item_milk', delta: -1, quantity: 2 })
  })

  it.each([0, 1])('a delta of %d is refused with BAD_USER_INPUT, and nothing is written', async (delta) => {
    // A cook only takes stock away. A delta of 0 or more is a client bug.
    const before = writable()
    const res = await cook([{ itemId: 'item_milk', delta }], ALICE, { recipeIds: ['recipe_home'] })

    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(writable()).toEqual(before)
  })
})

// ─── the shared rule ─────────────────────────────────────────────────────────

describe('consumeRecipes applies the shared consumeItem rule', () => {
  it('stock that runs out stops at 0, and the log keeps the full delta', async () => {
    // Given 3 packs of milk, and a cook that uses 5
    const res = await cook([{ itemId: 'item_milk', delta: -5 }], ALICE)

    // Then the stock is 0, not -2
    expect(res.errors).toBeUndefined()
    expect(stockAt('item_milk')).toMatchObject({ packedQuantity: 0, unpackedQuantity: 0 })
    // And the log says 5 were used, with 0 left
    expect(logs.state.logs[0]).toMatchObject({ delta: -5, quantity: 0 })
  })

  it('an item tracked in measurement opens a package, and the log total is in packages', async () => {
    // Given oil: 2 bottles of 6 ml and 1 ml loose. A cook uses 4 ml.
    const res = await cook([{ itemId: 'item_oil', delta: -4 }], ALICE)

    // Then the 1 loose ml is used, one bottle is opened for the other 3 ml,
    // and 3 ml of it are left: 1 bottle and 3 ml
    expect(res.errors).toBeUndefined()
    expect(stockAt('item_oil')).toMatchObject({ packedQuantity: 1, unpackedQuantity: 3 })
    // And the log total is 1 + 3/6 = 1.5 packages
    expect(logs.state.logs[0]).toMatchObject({ delta: -4, quantity: 1.5 })

    // And these are the numbers the web's `consumeItem` gives for the same
    // stock (the same shared function, `@p1i/types`)
    const web = {
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 2,
      unpackedQuantity: 1,
      targetUnit: 'measurement' as const,
      measurementUnit: 'ml',
      amountPerPackage: 6,
      consumeAmount: 1,
    }
    consumeItem(web, 4)
    expect(stockAt('item_oil')).toMatchObject({
      packedQuantity: web.packedQuantity,
      unpackedQuantity: web.unpackedQuantity,
    })
  })

  it('an item with no stock row at the location gets one at 0, and a log, as before B.6', async () => {
    // Given eggs are stocked nowhere. The cooking page never offers them, but
    // a direct API call can. Before B.6 the client computed 0 and 0 from its
    // zeroed join, and `writeStock` created the row.
    const res = await cook([{ itemId: 'item_eggs', delta: -2 }], ALICE)

    expect(res.errors).toBeUndefined()
    expect(stockAt('item_eggs')).toMatchObject({ packedQuantity: 0, unpackedQuantity: 0, targetQuantity: 0 })
    expect(logs.state.logs[0]).toMatchObject({ itemId: 'item_eggs', delta: -2, quantity: 0 })
  })
})

// ─── one transaction ─────────────────────────────────────────────────────────

describe('consumeRecipes writes everything or nothing', () => {
  it('a failure on the second item rolls back the first item, its log and the recipe mark', async () => {
    // Given a cook of bread and milk. Items are written in id order, so bread
    // is written first. The milk log fails.
    hooks.beforeLog = (data) => {
      if (data.itemId === 'item_milk') throw new Error('disk full')
    }
    const before = writable()

    const res = await cook(
      [
        { itemId: 'item_milk', delta: -1 },
        { itemId: 'item_bread', delta: -2 },
      ],
      ALICE,
      { recipeIds: ['recipe_home'] },
    )

    // Then the whole cook fails: an error, not one entry in itemResults
    expect(res.errors).toBeDefined()
    expect(res.data?.consumeRecipes ?? null).toBeNull()
    // And bread's stock and its log are rolled back, and the recipe is not
    // marked
    expect(writable()).toEqual(before)
    expect(stockAt('item_bread')?.packedQuantity).toBe(5)
  })

  it('a failure while marking the recipe rolls back every item and every log', async () => {
    // Until B.6 a failure here was ignored ("best-effort") after the stock was
    // already written.
    hooks.beforeRecipeMark = () => {
      throw new Error('connection lost')
    }
    const before = writable()

    const res = await cook(
      [
        { itemId: 'item_milk', delta: -1 },
        { itemId: 'item_bread', delta: -2 },
      ],
      ALICE,
      { recipeIds: ['recipe_home'] },
    )

    expect(res.errors).toBeDefined()
    expect(writable()).toEqual(before)
  })

  it('the transaction allows 30 s, like checkout', async () => {
    await cook([{ itemId: 'item_milk', delta: -1 }], ALICE)
    expect(handles.$lastTransactionOptions.value).toEqual({ timeout: 30_000 })
  })

  it('stock rows are locked in item id order, so two cooks cannot deadlock', async () => {
    // Given the items are sent out of id order
    await cook(
      [
        { itemId: 'item_oil', delta: -1 },
        { itemId: 'item_bread', delta: -1 },
        { itemId: 'item_milk', delta: -1 },
      ],
      ALICE,
    )

    // Then the rows were locked in id order
    expect(handles.$lockOrder).toEqual(['item_bread', 'item_milk', 'item_oil'])
  })
})

// ─── which location, and who ─────────────────────────────────────────────────

describe('consumeRecipes writes the location the cook names', () => {
  it("user cooking at the Garage takes the Garage's stock, and logs it there", async () => {
    const res = await cook([{ itemId: 'item_milk', delta: -1 }], ALICE, { locationId: LOC_GARAGE })

    expect(res.errors).toBeUndefined()
    expect(stockAt('item_milk', LOC_GARAGE)?.packedQuantity).toBe(39)
    expect(stockAt('item_milk', LOC_HOME)?.packedQuantity).toBe(3)
    expect(stockAt('item_milk', LOC_STRANGER)?.packedQuantity).toBe(99)
    expect(logs.state.logs[0]).toMatchObject({ locationId: LOC_GARAGE })
  })

  it("only the household's recipes are marked as cooked", async () => {
    const res = await cook([{ itemId: 'item_milk', delta: -1 }], ALICE, {
      recipeIds: ['recipe_home', 'recipe_other'],
    })

    expect(res.errors).toBeUndefined()
    expect(lastCookedAt('recipe_home')).toBeInstanceOf(Date)
    expect(lastCookedAt('recipe_other')).toBeNull()
  })
})

describe('consumeRecipes needs location role participant', () => {
  it('a household co-member who is a location participant can cook', async () => {
    // BOB is a household `member` and a `participant` at LOC_HOME. ALICE is
    // the other member there, so "my location" and "a shared location" differ.
    const res = await cook([{ itemId: 'item_milk', delta: -1 }], BOB, { recipeIds: ['recipe_home'] })

    expect(res.errors).toBeUndefined()
    expect(stockAt('item_milk')?.packedQuantity).toBe(2)
    expect(logs.state.logs[0]).toMatchObject({ userId: BOB })
    expect(lastCookedAt('recipe_home')).toBeInstanceOf(Date)
  })

  it('a location viewer cannot cook, and nothing is written', async () => {
    const before = writable()
    const res = await cook([{ itemId: 'item_milk', delta: -1 }], VERA, { recipeIds: ['recipe_home'] })

    expect(code(res)).toBe('FORBIDDEN')
    expect(writable()).toEqual(before)
  })

  it("a stranger cooking at another household's location is FORBIDDEN, and nothing is written", async () => {
    const before = writable()
    const res = await cook([{ itemId: 'item_milk', delta: -1 }], STRANGER, { recipeIds: ['recipe_home'] })

    expect(code(res)).toBe('FORBIDDEN')
    expect(writable()).toEqual(before)
  })

  // H3a rule 12: `requireLocationRole` runs BEFORE `requireLocationItems`. In
  // the other order an existing foreign location with a missing item gives
  // BAD_USER_INPUT, and a stranger could tell which location ids exist.
  it('a stranger gets FORBIDDEN at an existing location even for a missing item', async () => {
    const res = await cook([{ itemId: 'item_ghost', delta: -1 }], STRANGER)
    expect(code(res)).toBe('FORBIDDEN')
  })

  it("cooking another household's item is FORBIDDEN, and nothing is written", async () => {
    const before = writable()
    const res = await cook(
      [
        { itemId: 'item_milk', delta: -1 },
        { itemId: 'item_theirs', delta: -1 },
      ],
      ALICE,
    )

    expect(code(res)).toBe('FORBIDDEN')
    expect(writable()).toEqual(before)
  })

  it('cooking an item id no row holds is BAD_USER_INPUT, and nothing is written', async () => {
    const before = writable()
    const res = await cook([{ itemId: 'item_ghost', delta: -1 }], ALICE)

    expect(code(res)).toBe('BAD_USER_INPUT')
    expect(writable()).toEqual(before)
  })
})

// Moved from `recipe.resolver.test.ts` in task B.6, unchanged in what it pins.
describe('consumeRecipes for a brand-new account', () => {
  it('a user with no locations gets one, and the cook still lands there (issue #287)', async () => {
    // Given an account with no household and no location, only a User row.
    // In the server `ensureUserOrLog` makes that row before any resolver runs.
    world.reset()
    const NEW = 'user_new'
    world.users.reset([
      {
        id: NEW,
        displayName: 'New',
        email: null,
        lastSeenAt: null,
        deletedAt: null,
        householdSetupAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    // The client reads its location list first: `requireHousehold` creates
    // the household and its first location, "Home" (lib/household.ts).
    const listed = await server.executeOperation(
      { query: 'query { locations { id name } }' },
      { contextValue: { userId: NEW } },
    )
    if (listed.body.kind !== 'single') throw new Error('expected a single result')
    expect(listed.body.singleResult.errors).toBeUndefined()
    const created = world.stock.state.locations[0]
    expect(world.stock.state.locations).toHaveLength(1)
    expect(created).toMatchObject({ name: 'Home' })
    handles.$items.reset([itemRow('item_milk', { householdId: created?.householdId ?? 'none' })])

    // When they cook there
    const res = await cook([{ itemId: 'item_milk', delta: -1 }], NEW, { locationId: created?.id })

    // Then it succeeds, and the stock row is made at that location
    expect(res.errors).toBeUndefined()
    expect(world.stock.state.itemStocks).toEqual([
      expect.objectContaining({ itemId: 'item_milk', locationId: created?.id, packedQuantity: 0 }),
    ])
    expect(logs.state.logs[0]).toMatchObject({ locationId: created?.id, delta: -1 })
  })
})
