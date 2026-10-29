import { ApolloServer } from '@apollo/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── What this file covers ───────────────────────────────────────────────────
//
// The ownership guard on the four Item / Recipe import mutations:
// `bulkCreateItems`, `bulkCreateRecipes`, `bulkUpsertItems` and
// `bulkUpsertRecipes`. Issue #327, task 5.
//
// Before the guard each of these had two holes. A `bulkUpsert*` ran
// `upsert({ where: { id } })` with `userId` inside `update`, so a payload
// naming another account's row id OVERWROTE that row and took ownership of
// it. A `bulkCreate*` ran an UNSCOPED `findUnique({ where: { id } })` and
// skipped on a hit, so a stranger's row read as "already exists" and the
// caller's OWN item or recipe was dropped with no error and no count.
//
// The two upserts carry a third hole the other seven mutations do not:
// `bulkUpsertItems` runs `itemTag.deleteMany` and `itemVendor.deleteMany` on
// the payload's id, and `bulkUpsertRecipes` runs `recipeItem.deleteMany`. So
// an unguarded payload could also DELETE another account's tag, vendor and
// recipe-item links. Two tests below assert those links survive.
//
// ─── Why this file is separate from import.resolver.test.ts ──────────────────
//
// That file mocks every Prisma model as a plain `vi.fn()` call recorder, and
// task 3 armed all nine `findUnique` / `findFirst` recorders to resolve `null`
// so its 11 tests keep answering "nobody holds this id" for any id. An
// ownership assertion written against those stubs therefore CANNOT fail, and
// a recorder cannot show which `userId` a row ended up with. Root CLAUDE.md,
// "Write test doubles to model the constraint, not the happy path".
//
// `vi.mock` is per FILE, so a stateful fake cannot be mixed into that file
// without rewriting its tests. This is the sixth file written for that reason;
// `import-ownership.resolver.test.ts` (Tag, TagType, Vendor, Shelf) is its
// closest sibling and this file copies its shape.
//
// ─── The fakes ───────────────────────────────────────────────────────────────
//
// `src/test/ownedRowFake.ts` carries the `item`, `recipe` and `tag` stores.
// Four of the things it models are what let these tests fail:
//
//   - `where` is applied KEY BY KEY, Prisma's own semantics. Dropping `userId`
//     from a scoped read matches MORE rows, and the two-user fixture sees it.
//   - `upsert` keeps `create` and `update` apart and applies `update` key by
//     key. That is what makes a `userId` left in an `update` payload visible
//     as a row that CHANGED OWNER.
//   - an `update` key whose value is `undefined` counts as "not mentioned",
//     Prisma's own rule. `bulkUpsertRecipes` passes
//     `lastCookedAt: lastCookedAt ? new Date(lastCookedAt) : undefined`, so
//     this is what makes "a re-import keeps the stored date" true.
//   - `findUniqueOrThrow` raises P2025 when nothing matches. All four of these
//     mutations close with it, which is why the two closing-read tests below
//     assert an ERROR where the eight in `import-ownership.resolver.test.ts`
//     assert an empty list — those eight close with `findMany`.
//
// The three junction tables are NOT account-scoped: `ItemTag`
// (`@@id([itemId, tagId])`), `ItemVendor` (`@@id([itemId, vendorId])`) and
// `RecipeItem` (`@@id([recipeId, itemId])`) have composite primary keys and no
// `userId` column at all. So they get a small purpose-built fake below rather
// than an `ownedRowFake`, and they are wired into each owned store's
// `relations` hook so `include: { tags: true, vendors: true }` and
// `include: { items: true }` resolve.
vi.mock('../lib/prisma.js', async () => {
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')

  /**
   * A stateful double for one of the three composite-key junction tables.
   *
   * `keys` lists the columns the table has. A `where` key outside that list
   * THROWS rather than being ignored, for the reason `ownedRowFake` records:
   * a fake that ignores an unknown key returns the same rows with the filter
   * and without it, so every test passes against a resolver that dropped it.
   *
   * The composite primary key is enforced, so `createMany` without
   * `skipDuplicates` raises P2002 the way Postgres does. `bulkUpsertItems`
   * calls `itemVendor.createMany` with NO `skipDuplicates`, which is a real
   * pre-existing hazard the design records, so the fake must not paper over
   * it.
   */
  function createJunctionFake(model: string, keys: string[]) {
    const state: { rows: Record<string, unknown>[] } = { rows: [] }

    const matches = (row: Record<string, unknown>, where: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(where)) {
        if (value === undefined) continue
        if (!keys.includes(key)) {
          throw new Error(
            `junctionFake(${model}) was given a where key it does not model: '${key}'. ` +
              'It throws instead of ignoring the key, because ignoring one makes ' +
              'every test pass against a resolver that dropped the filter.',
          )
        }
        if (row[key] !== value) return false
      }
      return true
    }

    const primaryKey = (row: Record<string, unknown>) =>
      keys
        .filter((k) => k !== 'defaultAmount')
        .map((k) => String(row[k]))
        // A separator no id in the fixture contains, so two different key
        // tuples cannot join to the same string.
        .join('|')

    return {
      state,
      reset(rows: Record<string, unknown>[] = []) {
        state.rows = rows.map((r) => ({ ...r }))
      },
      client: {
        createMany: async (args: {
          data: Record<string, unknown>[]
          skipDuplicates?: boolean
        }) => {
          let count = 0
          for (const row of args.data) {
            const key = primaryKey(row)
            if (state.rows.some((r) => primaryKey(r) === key)) {
              if (args.skipDuplicates) continue
              const err = new Error(`Unique constraint failed — ${model} (${key})`) as Error & {
                code: string
              }
              err.code = 'P2002'
              throw err
            }
            state.rows.push({ ...row })
            count++
          }
          return { count }
        },
        deleteMany: async (args: { where?: Record<string, unknown> } = {}) => {
          const where = args.where ?? {}
          const before = state.rows.length
          state.rows = state.rows.filter((r) => !matches(r, where))
          return { count: before - state.rows.length }
        },
      },
    }
  }

  const itemTag = createJunctionFake('ItemTag', ['itemId', 'tagId'])
  const itemVendor = createJunctionFake('ItemVendor', ['itemId', 'vendorId'])
  const recipeItem = createJunctionFake('RecipeItem', ['recipeId', 'itemId', 'defaultAmount'])

  const item = createOwnedRowFake<{
    id: string
    userId: string
    name: string
    targetUnit: string
    consumeAmount: number
    expirationMode: string
    createdAt: Date
    updatedAt: Date
  }>({
    model: 'Item',
    // `itemToGraphQL` reads `item.tags.map(t => t.tagId)` and
    // `item.vendors.map(v => v.vendorId)`, so both names must come back.
    relations: (row) => ({
      tags: itemTag.state.rows.filter((r) => r.itemId === row.id),
      vendors: itemVendor.state.rows.filter((r) => r.itemId === row.id),
    }),
  })

  const recipe = createOwnedRowFake<{
    id: string
    userId: string
    name: string
    lastCookedAt: Date | null
  }>({
    model: 'Recipe',
    relations: (row) => ({
      items: recipeItem.state.rows.filter((r) => r.recipeId === row.id),
    }),
  })

  // Both item mutations filter the payload's `tagIds` through
  // `tag.findMany({ where: { id: { in: tagIds }, userId } })`, so a tag row
  // has to exist AND belong to the caller for a junction row to be written at
  // all. `userId` in that `where` is plan task 8; before it the read was
  // unscoped on the create path and absent on the upsert path.
  const tag = createOwnedRowFake<{ id: string; userId: string; name: string }>({
    model: 'Tag',
  })

  // Same for `vendorIds`, where plan task 8 added the filter outright — both
  // item mutations wrote every `vendorId` the payload named with no lookup at
  // all, so this store did not exist in this file before.
  const vendor = createOwnedRowFake<{ id: string; userId: string; name: string }>({
    model: 'Vendor',
  })

  // `findUnique` and `findUniqueOrThrow` are wrapped in a `vi.fn` on top of
  // the fake's real row matching. Two reasons: a test can make one lookup
  // answer "nobody holds this id" (see `simulateGuardMiss`), and a test can
  // read the `where` a closing read was called with.
  const wrap = <
    T extends {
      findUnique: (...args: never[]) => unknown
      findUniqueOrThrow: (...args: never[]) => unknown
    },
  >(
    client: T,
  ) => ({
    ...client,
    findUnique: vi.fn(client.findUnique),
    findUniqueOrThrow: vi.fn(client.findUniqueOrThrow),
  })

  return {
    prisma: {
      item: wrap(item.client),
      recipe: wrap(recipe.client),
      tag: tag.client,
      vendor: vendor.client,
      itemTag: itemTag.client,
      itemVendor: itemVendor.client,
      recipeItem: recipeItem.client,
      // Handles onto the fakes, hung off the mocked client because a `vi.mock`
      // factory is hoisted above every import and cannot close over a
      // module-scope binding.
      $item: item,
      $recipe: recipe,
      $tag: tag,
      $vendor: vendor,
      $itemTag: itemTag,
      $itemVendor: itemVendor,
      $recipeItem: recipeItem,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { OwnedRowFake } from '../test/ownedRowFake.js'

type ItemRow = {
  id: string
  userId: string
  name: string
  targetUnit: string
  consumeAmount: number
  expirationMode: string
  createdAt: Date
  updatedAt: Date
}
type RecipeRow = { id: string; userId: string; name: string; lastCookedAt: Date | null }
type TagRow = { id: string; userId: string; name: string }
type VendorRow = { id: string; userId: string; name: string }
type JunctionFake = {
  state: { rows: Record<string, unknown>[] }
  reset: (rows?: Record<string, unknown>[]) => void
}

const mockPrisma = prisma as unknown as {
  item: {
    findUnique: ReturnType<typeof vi.fn>
    findUniqueOrThrow: ReturnType<typeof vi.fn>
  }
  recipe: {
    findUnique: ReturnType<typeof vi.fn>
    findUniqueOrThrow: ReturnType<typeof vi.fn>
  }
  $item: OwnedRowFake<ItemRow>
  $recipe: OwnedRowFake<RecipeRow>
  $tag: OwnedRowFake<TagRow>
  $vendor: OwnedRowFake<VendorRow>
  $itemTag: JunctionFake
  $itemVendor: JunctionFake
  $recipeItem: JunctionFake
}

// ─── Server ──────────────────────────────────────────────────────────────────

let server: ApolloServer<Context>

beforeAll(async () => {
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

// ─── Fixture ─────────────────────────────────────────────────────────────────
//
// TWO USERS, and per model THREE ids: one row the caller's, one row the
// STRANGER's, and an id no row holds. This is the single most important
// property of the file.
//
// With a one-user fixture, "the row this account owns" and "the row that
// exists" give the SAME answer, so a resolver with no ownership check at all
// would pass every assertion. That is the vacuous-fixture failure root
// CLAUDE.md describes, which shipped four useless tests in PR D. `*_THEIRS` is
// what makes the guard distinguishable from no guard, and `*_FREE` is what
// keeps a legitimate new row provable.
//
// The junction stores are seeded two-sided for the same reason: links on the
// caller's own item and links on the stranger's item, both naming the same tag
// and the same vendor. A resolver that deleted by `tagId` instead of `itemId`,
// or that ran `deleteMany` before the guard, is then visible.

const USER = 'user_import_test'
const STRANGER = 'user_stranger'

const ITEM_MINE = 'item_mine'
const ITEM_THEIRS = 'item_theirs'
const ITEM_FREE = 'item_free'

const RECIPE_MINE = 'recipe_mine'
const RECIPE_THEIRS = 'recipe_theirs'
const RECIPE_FREE = 'recipe_free'

const TAG_ID = 'tag_dairy' // USER's
const VENDOR_ID = 'vendor_costco' // USER's

// The STRANGER's tag and vendor, and an id no row holds. Plan task 8 scoped
// the `tagId` / `vendorId` lookups in both item mutations, and these three are
// what make a scoped lookup distinguishable from an unscoped one. With only
// `TAG_ID` and `VENDOR_ID` in the stores, "a tag that exists" and "a tag the
// caller owns" give the SAME answer, so every reference test would pass
// against a resolver with no scope at all.
const TAG_THEIRS = 'tag_theirs'
const VENDOR_THEIRS = 'vendor_theirs'
const TAG_GONE = 'tag_gone' // no Tag row holds it

const TS = new Date('2026-01-01T00:00:00.000Z')
const LAST_COOKED = new Date('2026-05-06T07:08:09.000Z')
const PAYLOAD_CREATED = '2026-02-03T04:05:06.000Z'
const PAYLOAD_UPDATED = '2026-03-04T05:06:07.000Z'

const baseItem = (id: string, userId: string, name: string): ItemRow => ({
  id,
  userId,
  name,
  targetUnit: 'package',
  consumeAmount: 1,
  expirationMode: 'disabled',
  createdAt: TS,
  updatedAt: TS,
})

beforeEach(() => {
  vi.resetAllMocks()

  mockPrisma.$item.reset([
    baseItem(ITEM_MINE, USER, 'Milk'),
    baseItem(ITEM_THEIRS, STRANGER, 'Theirs'),
  ])
  mockPrisma.$recipe.reset([
    { id: RECIPE_MINE, userId: USER, name: 'Pancakes', lastCookedAt: LAST_COOKED },
    { id: RECIPE_THEIRS, userId: STRANGER, name: 'Theirs', lastCookedAt: null },
  ])
  mockPrisma.$tag.reset([
    { id: TAG_ID, userId: USER, name: 'Dairy' },
    { id: TAG_THEIRS, userId: STRANGER, name: 'Theirs' },
  ])
  // A `Vendor` row for `VENDOR_ID` has to exist now: before plan task 8 both
  // item mutations wrote a `vendorId` with no lookup, so this store was not
  // needed at all.
  mockPrisma.$vendor.reset([
    { id: VENDOR_ID, userId: USER, name: 'Costco' },
    { id: VENDOR_THEIRS, userId: STRANGER, name: 'Theirs' },
  ])
  mockPrisma.$itemTag.reset([
    { itemId: ITEM_MINE, tagId: TAG_ID },
    { itemId: ITEM_THEIRS, tagId: TAG_ID },
  ])
  mockPrisma.$itemVendor.reset([
    { itemId: ITEM_MINE, vendorId: VENDOR_ID },
    { itemId: ITEM_THEIRS, vendorId: VENDOR_ID },
  ])
  mockPrisma.$recipeItem.reset([
    { recipeId: RECIPE_MINE, itemId: ITEM_MINE, defaultAmount: 1 },
    { recipeId: RECIPE_THEIRS, itemId: ITEM_THEIRS, defaultAmount: 2 },
  ])
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONTEXT: Context = { userId: USER }

async function exec(query: string, variables: Record<string, unknown>) {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: CONTEXT },
  )
  if (response.body.kind !== 'single') throw new Error('expected a single result')
  return response.body.singleResult
}

/** The `code` of the first GraphQL error, or `undefined` when there was none. */
function errorCode(result: Awaited<ReturnType<typeof exec>>) {
  return result.errors?.[0]?.extensions?.code
}

/**
 * Make the guard's ONE unscoped lookup answer "nobody holds this id", so the
 * payload's stranger id reaches the write and the closing read.
 *
 * Why this exists. With the guard in place the closing read's `userId` filter
 * is UNREACHABLE through the GraphQL surface: the guard refuses a payload that
 * names another account's id, so no stranger's row can ever be in the closing
 * read's range. The design doc says the same thing — the scoped reads are
 * defence in depth, not the guard.
 *
 * So the only honest way to exercise those reads is to simulate the case they
 * are defence against: a future edit drops the guard, or the guard's lookup
 * misses the row. Stubbing `findUnique` for one call does exactly that and
 * leaves the stored rows legal — one row per id, one owner each.
 *
 * It reaches the UPSERT path only. On the create path a guard miss cannot
 * reach the closing read at all: `item.create` / `recipe.create` hits the
 * stranger's row as a duplicate primary key and raises P2002 first. That is
 * why the two create-path closing reads are covered by a call-shape
 * assertion below instead, and the comment there says so.
 *
 * What these tests do NOT prove: that the guard refuses the stranger's id.
 * That is what the FORBIDDEN tests per model prove, and in these the
 * simulated miss lets a real write reach the stranger's row — which is the
 * point. A scoped read is not a substitute for the guard.
 */
function simulateGuardMiss(delegate: { findUnique: ReturnType<typeof vi.fn> }) {
  delegate.findUnique.mockImplementationOnce(async () => null)
}

/** Every junction row, in a stable order, so a test can assert the whole store. */
function junctionRows(fake: JunctionFake) {
  return fake.state.rows.map((r) => JSON.stringify(r)).sort()
}

// ─── Queries ─────────────────────────────────────────────────────────────────

const ITEM_FIELDS = '{ id name userId tagIds vendorIds }'
const CREATE_ITEMS = `mutation ($items: [ItemInput!]!) { bulkCreateItems(items: $items) ${ITEM_FIELDS} }`
const UPSERT_ITEMS = `mutation ($items: [ItemInput!]!) { bulkUpsertItems(items: $items) ${ITEM_FIELDS} }`

const RECIPE_FIELDS = '{ id name userId items { itemId defaultAmount } }'
const CREATE_RECIPES = `mutation ($recipes: [RecipeInput!]!) { bulkCreateRecipes(recipes: $recipes) ${RECIPE_FIELDS} }`
const UPSERT_RECIPES = `mutation ($recipes: [RecipeInput!]!) { bulkUpsertRecipes(recipes: $recipes) ${RECIPE_FIELDS} }`

// ─── Input builders ──────────────────────────────────────────────────────────

const itemIn = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  tagIds: [],
  targetUnit: 'package',
  consumeAmount: 1,
  createdAt: PAYLOAD_CREATED,
  updatedAt: PAYLOAD_UPDATED,
  ...extra,
})

const recipeIn = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  items: [],
  ...extra,
})

// ─── Item ────────────────────────────────────────────────────────────────────

describe('Item ownership', () => {
  it("user cannot import an item under an id another account's row holds", async () => {
    // Given a payload naming the STRANGER's item id
    const payload = [itemIn(ITEM_THEIRS, 'Stolen')]

    // When the create-path import runs
    const result = await exec(CREATE_ITEMS, { items: payload })

    // Then it is refused, and the stranger's row is untouched
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$item.state.rows).toHaveLength(2)
    expect(mockPrisma.$item.state.rows.find((r) => r.id === ITEM_THEIRS)).toMatchObject({
      name: 'Theirs',
      userId: STRANGER,
    })
  })

  it("user cannot take over another account's item", async () => {
    // Given the same payload on the upsert path, which before the guard
    // overwrote the stranger's row AND reassigned it to the caller
    const payload = [itemIn(ITEM_THEIRS, 'Stolen')]

    // When the upsert-path import runs
    const result = await exec(UPSERT_ITEMS, { items: payload })

    // Then it is refused and the stranger keeps their row, name and all
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$item.state.rows).toHaveLength(2)
    expect(mockPrisma.$item.state.rows.find((r) => r.id === ITEM_THEIRS)).toMatchObject({
      name: 'Theirs',
      userId: STRANGER,
    })
  })

  it('user re-importing their own item still replaces it and keeps its owner', async () => {
    // Given a payload naming the caller's OWN item id with a new name
    const payload = [itemIn(ITEM_MINE, 'Renamed')]

    // When the upsert-path import runs
    const result = await exec(UPSERT_ITEMS, { items: payload })

    // Then the name is replaced and the owner is unchanged.
    //
    // The owner assertion here is a NEGATIVE CONTROL, not coverage. The row is
    // already the caller's, so putting `userId` back into the `update` payload
    // writes `USER` over `USER` and this test stays green. Measured on
    // 2026-10-28 — the plan predicted it would go red and it does not, the
    // same way task 4 measured it on `bulkUpsertTags`. The test that DOES
    // catch a `userId` in `update` is "does not reassign a row's owner even
    // when the guard misses it" below.
    expect(result.errors).toBeUndefined()
    const stored = mockPrisma.$item.state.rows.find((r) => r.id === ITEM_MINE)
    expect(stored?.name).toBe('Renamed')
    expect(stored?.userId).toBe(USER)
  })

  it('user importing a batch with one forbidden item gets no items written at all', async () => {
    // Given an ALLOWED row placed AHEAD of the forbidden one. The order is the
    // test: if the guard ran inside the write loop, the first row would be on
    // disk before the second was refused, and these resolvers are not
    // transactional so nothing would roll it back.
    const payload = [itemIn(ITEM_FREE, 'Fine'), itemIn(ITEM_THEIRS, 'Stolen')]

    // When the create-path import runs
    const result = await exec(CREATE_ITEMS, { items: payload })

    // Then nothing was written — the allowed row is absent too
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$item.state.rows.map((r) => r.id).sort()).toEqual([
      ITEM_MINE,
      ITEM_THEIRS,
    ])
  })

  it("user importing an item under another account's id leaves every tag and vendor link alone", async () => {
    // Given a payload naming the STRANGER's item id and carrying tag and
    // vendor links. `bulkUpsertItems` runs `itemTag.deleteMany` and
    // `itemVendor.deleteMany` on that id before it writes, so without the
    // guard this payload DELETES the stranger's links and then writes the
    // caller's over them.
    const payload = [itemIn(ITEM_THEIRS, 'Stolen', { tagIds: [TAG_ID], vendorIds: [VENDOR_ID] })]
    const tagsBefore = junctionRows(mockPrisma.$itemTag)
    const vendorsBefore = junctionRows(mockPrisma.$itemVendor)

    // When the upsert-path import runs
    const result = await exec(UPSERT_ITEMS, { items: payload })

    // Then it is refused and BOTH junction stores are byte-for-byte unchanged
    // — the stranger's links survive and no new link was written. The
    // caller's own links on `ITEM_MINE` are in the same comparison, which is
    // what makes "keeps their own tags and vendors" part of the claim.
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(junctionRows(mockPrisma.$itemTag)).toEqual(tagsBefore)
    expect(junctionRows(mockPrisma.$itemVendor)).toEqual(vendorsBefore)
  })

  it("bulkUpsertItems does not reassign a row's owner even when the guard misses it", async () => {
    // Given the guard's lookup misses the stranger's row, so the upsert really
    // reaches it. This is the case `userId` being OUT of the `update` payload
    // is defence against: a future edit that drops the guard must not be able
    // to hand another account's row to the importer.
    simulateGuardMiss(mockPrisma.item)

    // When the caller upserts under the stranger's id
    await exec(UPSERT_ITEMS, { items: [itemIn(ITEM_THEIRS, 'Stolen')] })

    // Then the row is still the STRANGER's. This is what goes red if `userId`
    // creeps back into `update`.
    //
    // No `result.errors` assertion here, unlike task 4's four: the closing
    // `findUniqueOrThrow` is scoped, finds nothing, and raises P2025, so this
    // call DOES return an error. The next test is about that error. What this
    // one asserts is the stored row's owner, which the error does not change.
    expect(mockPrisma.$item.state.rows.find((r) => r.id === ITEM_THEIRS)?.userId).toBe(STRANGER)
  })

  it("bulkUpsertItems' closing read does not return an item the caller does not own", async () => {
    // Given the guard's lookup misses the stranger's row (see
    // `simulateGuardMiss` — the closing read is defence in depth, so this is
    // the only way to reach it)
    simulateGuardMiss(mockPrisma.item)

    // When the upsert-path import names that id
    const result = await exec(UPSERT_ITEMS, { items: [itemIn(ITEM_THEIRS, 'Stolen')] })

    // Then the scoped closing read matches nothing and the mutation fails
    // instead of handing back a row the caller does not own. The eight
    // equivalent tests in `import-ownership.resolver.test.ts` assert `[]`
    // because those mutations close with `findMany`; this one closes with
    // `findUniqueOrThrow`, which raises P2025.
    //
    // Drop `userId` from that `where` and the read succeeds: `errors` becomes
    // undefined and the stranger's row comes back in `data`.
    expect(result.errors).toBeDefined()
    expect(result.data?.bulkUpsertItems).toBeFalsy()
  })

  it("bulkCreateItems' closing read is scoped to the caller", async () => {
    // A CALL-SHAPE assertion, and the only honest one available here. On the
    // create path a guard miss cannot reach the closing read: `item.create`
    // hits the stranger's row as a duplicate primary key and raises P2002
    // first. And a row this resolver did create is the caller's own by
    // construction, because `create` sets `userId` from the context. So there
    // is no payload that makes this read return a stranger's row.
    //
    // It is still worth pinning: dropping `userId` from the `where` is exactly
    // the edit `bulkCreateLocations` records as the hazard, and this assertion
    // goes red when it happens.
    const result = await exec(CREATE_ITEMS, { items: [itemIn(ITEM_FREE, 'Fine')] })

    expect(result.errors).toBeUndefined()
    expect(mockPrisma.item.findUniqueOrThrow).toHaveBeenCalledTimes(1)
    expect(mockPrisma.item.findUniqueOrThrow.mock.calls[0][0].where).toEqual({
      id: ITEM_FREE,
      userId: USER,
    })
  })
})

// ─── Recipe ──────────────────────────────────────────────────────────────────

describe('Recipe ownership', () => {
  it("user cannot import a recipe under an id another account's row holds", async () => {
    const result = await exec(CREATE_RECIPES, { recipes: [recipeIn(RECIPE_THEIRS, 'Stolen')] })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$recipe.state.rows).toHaveLength(2)
    expect(mockPrisma.$recipe.state.rows.find((r) => r.id === RECIPE_THEIRS)).toMatchObject({
      name: 'Theirs',
      userId: STRANGER,
    })
  })

  it("user cannot take over another account's recipe", async () => {
    const result = await exec(UPSERT_RECIPES, { recipes: [recipeIn(RECIPE_THEIRS, 'Stolen')] })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$recipe.state.rows).toHaveLength(2)
    expect(mockPrisma.$recipe.state.rows.find((r) => r.id === RECIPE_THEIRS)).toMatchObject({
      name: 'Theirs',
      userId: STRANGER,
    })
  })

  it('user re-importing their own recipe still replaces it and keeps its owner', async () => {
    const result = await exec(UPSERT_RECIPES, { recipes: [recipeIn(RECIPE_MINE, 'Renamed')] })

    // The owner assertion is a NEGATIVE CONTROL — same reason as the item
    // test above. "does not reassign a row's owner even when the guard misses
    // it" below is the test that catches a `userId` in `update`.
    expect(result.errors).toBeUndefined()
    const stored = mockPrisma.$recipe.state.rows.find((r) => r.id === RECIPE_MINE)
    expect(stored?.name).toBe('Renamed')
    expect(stored?.userId).toBe(USER)
  })

  it('user importing a batch with one forbidden recipe gets no recipes written at all', async () => {
    // The ALLOWED row goes AHEAD of the forbidden one — same reason as the
    // item batch test above.
    const payload = [recipeIn(RECIPE_FREE, 'Fine'), recipeIn(RECIPE_THEIRS, 'Stolen')]
    const result = await exec(CREATE_RECIPES, { recipes: payload })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$recipe.state.rows.map((r) => r.id).sort()).toEqual([
      RECIPE_MINE,
      RECIPE_THEIRS,
    ])
  })

  it('user re-importing their own recipe keeps its lastCookedAt when the payload omits it', async () => {
    // Given the caller's own recipe with a stored `lastCookedAt`, and a
    // payload that names the recipe but carries no date. `bulkUpsertRecipes`
    // builds `lastCookedAt: lastCookedAt ? new Date(lastCookedAt) : undefined`,
    // so the `update` payload carries the key with the value `undefined`.
    expect(mockPrisma.$recipe.state.rows.find((r) => r.id === RECIPE_MINE)?.lastCookedAt).toEqual(
      LAST_COOKED,
    )

    // When the upsert-path import runs
    const result = await exec(UPSERT_RECIPES, { recipes: [recipeIn(RECIPE_MINE, 'Renamed')] })

    // Then the stored date survives, because `ownedRowFake.applyUpdate` treats
    // a present-but-`undefined` key as "not mentioned" — Prisma's own rule,
    // and NOT the `'key' in data` test the plan and the design doc specify. If
    // the fake used `'key' in data` this assertion would fail against correct
    // code, which is why the fake is the way it is. Do not change it.
    expect(result.errors).toBeUndefined()
    const stored = mockPrisma.$recipe.state.rows.find((r) => r.id === RECIPE_MINE)
    expect(stored?.name).toBe('Renamed')
    expect(stored?.lastCookedAt).toEqual(LAST_COOKED)
  })

  it("user importing a recipe under another account's id leaves its recipe items alone", async () => {
    // Given a payload naming the STRANGER's recipe id and carrying items.
    // `bulkUpsertRecipes` runs `recipeItem.deleteMany` on that id whenever the
    // payload names `items` at all, so without the guard this payload DELETES
    // the stranger's recipe items and writes the caller's over them.
    const payload = [
      recipeIn(RECIPE_THEIRS, 'Stolen', { items: [{ itemId: ITEM_MINE, defaultAmount: 5 }] }),
    ]
    const before = junctionRows(mockPrisma.$recipeItem)

    // When the upsert-path import runs
    const result = await exec(UPSERT_RECIPES, { recipes: payload })

    // Then it is refused and the store is byte-for-byte unchanged
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(junctionRows(mockPrisma.$recipeItem)).toEqual(before)
  })

  it("bulkUpsertRecipes does not reassign a row's owner even when the guard misses it", async () => {
    // Given the guard's lookup misses the stranger's row, so the upsert really
    // reaches it — the case `userId` being OUT of `update` is defence against.
    simulateGuardMiss(mockPrisma.recipe)

    // When the caller upserts under the stranger's id
    await exec(UPSERT_RECIPES, { recipes: [recipeIn(RECIPE_THEIRS, 'Stolen')] })

    // Then the row is still the STRANGER's. This goes red if `userId` creeps
    // back into `update`. The call also returns an error, for the reason the
    // next test describes.
    expect(mockPrisma.$recipe.state.rows.find((r) => r.id === RECIPE_THEIRS)?.userId).toBe(
      STRANGER,
    )
  })

  it("bulkUpsertRecipes' closing read does not return a recipe the caller does not own", async () => {
    simulateGuardMiss(mockPrisma.recipe)
    const result = await exec(UPSERT_RECIPES, { recipes: [recipeIn(RECIPE_THEIRS, 'Stolen')] })

    // The scoped `findUniqueOrThrow` matches nothing and raises P2025, so the
    // mutation fails rather than handing back a row the caller does not own.
    // Drop `userId` from that `where` and `errors` becomes undefined and the
    // stranger's row comes back in `data`.
    expect(result.errors).toBeDefined()
    expect(result.data?.bulkUpsertRecipes).toBeFalsy()
  })

  it("bulkCreateRecipes' closing read is scoped to the caller", async () => {
    // A CALL-SHAPE assertion — same reason as the item version above: on the
    // create path `recipe.create` raises P2002 on the stranger's id before the
    // closing read is reached, and a row this resolver did create is the
    // caller's own by construction.
    const result = await exec(CREATE_RECIPES, { recipes: [recipeIn(RECIPE_FREE, 'Fine')] })

    expect(result.errors).toBeUndefined()
    expect(mockPrisma.recipe.findUniqueOrThrow).toHaveBeenCalledTimes(1)
    expect(mockPrisma.recipe.findUniqueOrThrow.mock.calls[0][0].where).toEqual({
      id: RECIPE_FREE,
      userId: USER,
    })
  })
})

// ─── Cross-model references: Item → Tag, Item → Vendor ───────────────────────
//
// Plan task 8. The guards above protect each row's OWN primary key. These
// protect the OTHER id in a reference — the `tagId` and `vendorId` the payload
// attaches its own item to.
//
// Before task 8 the create path filtered `tagIds` through an UNSCOPED
// `tag.findMany`, and nothing at all checked `vendorIds` on either path or
// `tagIds` on the upsert path. So the caller's own item could carry an
// `ItemTag` or `ItemVendor` row pointing at a STRANGER's tag or vendor.
//
// A reference the caller may not use is SKIPPED, not refused — the item still
// lands, only the edge is dropped. The resolver comments say why: a partial
// backup legitimately names a tag the user has since deleted, and making "not
// yours" distinguishable from "not there" turns the mutation into a probe for
// another account's ids. The `TAG_GONE` test below is what pins the two
// answers as the same.

describe('Item → Tag and Item → Vendor references', () => {
  it("user importing an item tagged with another account's tag gets the item and no tag link", async () => {
    // Given a FREE item id carrying the STRANGER's tag id
    const payload = [itemIn(ITEM_FREE, 'Fine', { tagIds: [TAG_THEIRS] })]

    // When the create-path import runs
    const result = await exec(CREATE_ITEMS, { items: payload })

    // Then the item is written and owned by the caller, and NO `ItemTag` row
    // names it. The two junction stores still hold exactly the two rows per
    // table the fixture seeded.
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$item.state.rows.find((r) => r.id === ITEM_FREE)?.userId).toBe(USER)
    expect(mockPrisma.$itemTag.state.rows.filter((r) => r.itemId === ITEM_FREE)).toEqual([])
    // And the returned row says so too, so the client cannot be told the link
    // exists when it does not.
    expect(
      (result.data?.bulkCreateItems as { id: string; tagIds: string[] }[])[0].tagIds,
    ).toEqual([])
  })

  it("user importing an item tagged with a tag that no longer exists gets the same answer", async () => {
    // Given a FREE item id carrying an id NO tag row holds. This is the
    // NEGATIVE CONTROL for the `continue`-not-FORBIDDEN decision: a deleted
    // tag and a stranger's tag must be indistinguishable, or the mutation
    // tells the caller which ids exist in other accounts.
    const payload = [itemIn(ITEM_FREE, 'Fine', { tagIds: [TAG_GONE] })]

    // When the create-path import runs
    const result = await exec(CREATE_ITEMS, { items: payload })

    // Then the answer is the same as the test above: item written, no link, no
    // error.
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$item.state.rows.find((r) => r.id === ITEM_FREE)?.userId).toBe(USER)
    expect(mockPrisma.$itemTag.state.rows.filter((r) => r.itemId === ITEM_FREE)).toEqual([])
  })

  it('user importing an item tagged with their own tag gets the tag link', async () => {
    // Given a FREE item id carrying the CALLER's own tag id. Without this, a
    // filter that returned nothing at all would pass every test above.
    const payload = [itemIn(ITEM_FREE, 'Fine', { tagIds: [TAG_ID] })]

    // When the create-path import runs
    const result = await exec(CREATE_ITEMS, { items: payload })

    // Then the link is written
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$itemTag.state.rows.filter((r) => r.itemId === ITEM_FREE)).toEqual([
      { itemId: ITEM_FREE, tagId: TAG_ID },
    ])
  })

  it("user importing an item from another account's vendor gets the item and no vendor link", async () => {
    // Given a FREE item id carrying the STRANGER's vendor id
    const payload = [itemIn(ITEM_FREE, 'Fine', { vendorIds: [VENDOR_THEIRS] })]

    // When the create-path import runs
    const result = await exec(CREATE_ITEMS, { items: payload })

    // Then the item is written and NO `ItemVendor` row names it
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$item.state.rows.find((r) => r.id === ITEM_FREE)?.userId).toBe(USER)
    expect(mockPrisma.$itemVendor.state.rows.filter((r) => r.itemId === ITEM_FREE)).toEqual([])
  })

  it('user importing an item from their own vendor gets the vendor link', async () => {
    // Given a FREE item id carrying the CALLER's own vendor id
    const payload = [itemIn(ITEM_FREE, 'Fine', { vendorIds: [VENDOR_ID] })]

    // When the create-path import runs
    const result = await exec(CREATE_ITEMS, { items: payload })

    // Then the link is written
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$itemVendor.state.rows.filter((r) => r.itemId === ITEM_FREE)).toEqual([
      { itemId: ITEM_FREE, vendorId: VENDOR_ID },
    ])
  })

  // The two upsert negatives are SEPARATE tests, one per reference, on purpose.
  // A single test asserting both junction stores goes red for either filter,
  // so its red text cannot say WHICH one broke — the "name the specific
  // branch" rule in root CLAUDE.md. Split, each filter has its own signal.

  it("user replacing their own item cannot attach another account's tag to it", async () => {
    // Given the CALLER's OWN item id on the upsert path, carrying the
    // STRANGER's tag. `bulkUpsertItems` deletes this item's links first and
    // rewrites them, so before task 8 this payload left `ITEM_MINE` pointing
    // at the stranger's tag.
    const payload = [itemIn(ITEM_MINE, 'Renamed', { tagIds: [TAG_THEIRS] })]

    // When the upsert-path import runs
    const result = await exec(UPSERT_ITEMS, { items: payload })

    // Then the item is replaced and carries NO tag link: the old one was
    // deleted by `deleteMany`, which is correct, and the new one was not
    // written.
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$item.state.rows.find((r) => r.id === ITEM_MINE)?.name).toBe('Renamed')
    expect(mockPrisma.$itemTag.state.rows.filter((r) => r.itemId === ITEM_MINE)).toEqual([])
  })

  it("user replacing their own item cannot attach another account's vendor to it", async () => {
    // Given the CALLER's OWN item id on the upsert path, carrying the
    // STRANGER's vendor
    const payload = [itemIn(ITEM_MINE, 'Renamed', { vendorIds: [VENDOR_THEIRS] })]

    // When the upsert-path import runs
    const result = await exec(UPSERT_ITEMS, { items: payload })

    // Then the item is replaced and carries NO vendor link
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$item.state.rows.find((r) => r.id === ITEM_MINE)?.name).toBe('Renamed')
    expect(mockPrisma.$itemVendor.state.rows.filter((r) => r.itemId === ITEM_MINE)).toEqual([])
  })

  it('user replacing their own item keeps the tag and vendor links they do own', async () => {
    // Given the CALLER's OWN item id carrying their OWN tag and vendor. This
    // is the positive half of the test above — a filter that dropped
    // everything would pass that one.
    const payload = [itemIn(ITEM_MINE, 'Renamed', { tagIds: [TAG_ID], vendorIds: [VENDOR_ID] })]

    // When the upsert-path import runs
    const result = await exec(UPSERT_ITEMS, { items: payload })

    // Then both links are rewritten
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$itemTag.state.rows.filter((r) => r.itemId === ITEM_MINE)).toEqual([
      { itemId: ITEM_MINE, tagId: TAG_ID },
    ])
    expect(mockPrisma.$itemVendor.state.rows.filter((r) => r.itemId === ITEM_MINE)).toEqual([
      { itemId: ITEM_MINE, vendorId: VENDOR_ID },
    ])
  })
})

// ─── Cross-model reference: Recipe → Item ────────────────────────────────────
//
// Plan task 8. Both recipe mutations wrote every `items[].itemId` the payload
// named straight into `RecipeItem` with NO lookup at all, so a recipe of the
// caller's could list a STRANGER's item as an ingredient.
//
// `ITEM_THEIRS` is the stranger's item from the fixture at the top of the
// file, so no new fixture is needed here.

describe('Recipe → Item references', () => {
  it("user importing a recipe with another account's item gets the recipe and no ingredient", async () => {
    // Given a FREE recipe id listing the STRANGER's item as an ingredient
    const payload = [
      recipeIn(RECIPE_FREE, 'Fine', { items: [{ itemId: ITEM_THEIRS, defaultAmount: 3 }] }),
    ]

    // When the create-path import runs
    const result = await exec(CREATE_RECIPES, { recipes: payload })

    // Then the recipe is written, owned by the caller, with no `RecipeItem`
    // row naming it
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$recipe.state.rows.find((r) => r.id === RECIPE_FREE)?.userId).toBe(USER)
    expect(mockPrisma.$recipeItem.state.rows.filter((r) => r.recipeId === RECIPE_FREE)).toEqual([])
  })

  it('user importing a recipe with their own item gets the ingredient', async () => {
    // Given a FREE recipe id listing the CALLER's OWN item
    const payload = [
      recipeIn(RECIPE_FREE, 'Fine', { items: [{ itemId: ITEM_MINE, defaultAmount: 3 }] }),
    ]

    // When the create-path import runs
    const result = await exec(CREATE_RECIPES, { recipes: payload })

    // Then the ingredient is written
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$recipeItem.state.rows.filter((r) => r.recipeId === RECIPE_FREE)).toEqual([
      { recipeId: RECIPE_FREE, itemId: ITEM_MINE, defaultAmount: 3 },
    ])
  })

  it("user replacing their own recipe cannot add another account's item as an ingredient", async () => {
    // Given the CALLER's OWN recipe id on the upsert path, listing the
    // STRANGER's item. `bulkUpsertRecipes` deletes this recipe's ingredients
    // first and rewrites them, so before task 8 this payload left
    // `RECIPE_MINE` pointing at the stranger's item.
    const payload = [
      recipeIn(RECIPE_MINE, 'Pancakes', { items: [{ itemId: ITEM_THEIRS, defaultAmount: 9 }] }),
    ]

    // When the upsert-path import runs
    const result = await exec(UPSERT_RECIPES, { recipes: payload })

    // Then the recipe has no ingredients: the old one was deleted, which is
    // correct, and the stranger's was not written
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$recipeItem.state.rows.filter((r) => r.recipeId === RECIPE_MINE)).toEqual([])
  })

  it('user replacing their own recipe keeps the ingredients they do own', async () => {
    // Given the CALLER's OWN recipe id listing their OWN item with a new
    // amount. This is the positive half — a filter that dropped everything
    // would pass the test above.
    const payload = [
      recipeIn(RECIPE_MINE, 'Pancakes', { items: [{ itemId: ITEM_MINE, defaultAmount: 9 }] }),
    ]

    // When the upsert-path import runs
    const result = await exec(UPSERT_RECIPES, { recipes: payload })

    // Then the ingredient is rewritten with the payload's amount
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$recipeItem.state.rows.filter((r) => r.recipeId === RECIPE_MINE)).toEqual([
      { recipeId: RECIPE_MINE, itemId: ITEM_MINE, defaultAmount: 9 },
    ])
  })
})
