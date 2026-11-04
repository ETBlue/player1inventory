import { ApolloServer } from '@apollo/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── What this file covers ───────────────────────────────────────────────────
//
// The ownership guard on the eight Tag / TagType / Vendor / Shelf import
// mutations: `bulkCreateTags`, `bulkCreateTagTypes`, `bulkCreateVendors`,
// `bulkCreateShelves` and their four `bulkUpsert*` twins. Issue #327, task 4.
//
// Before the guard each of these had two holes. A `bulkUpsert*` ran
// `upsert({ where: { id } })` with `userId` inside `update`, so a payload
// naming another account's row id OVERWROTE that row and took ownership of it.
// A `bulkCreate*` treated a stranger's row as "already exists", so the
// caller's OWN row was silently dropped with no error and no count.
//
// ─── Why this file is separate from import.resolver.test.ts ──────────────────
//
// That file mocks every Prisma model as a plain `vi.fn()` call recorder, and
// task 3 armed all nine `findUnique` / `findFirst` recorders to resolve `null`
// so its 11 tests keep answering "nobody holds this id" for any id. An
// ownership assertion written against those stubs therefore CANNOT fail, and a
// recorder cannot show which `userId` a row ended up with. Root CLAUDE.md,
// "Write test doubles to model the constraint, not the happy path".
//
// `vi.mock` is per FILE, so a stateful fake cannot be mixed into that file
// without rewriting its tests. This is the fifth file written for that reason.
//
// ─── The fake ────────────────────────────────────────────────────────────────
//
// `src/test/ownedRowFake.ts` carries all four stores. Four of the things it
// models are what let these tests fail:
//
//   - `where` is applied KEY BY KEY, Prisma's own semantics. Dropping `userId`
//     from a scoped read matches MORE rows, and the two-user fixture sees it.
//   - `upsert` keeps `create` and `update` apart and applies `update` key by
//     key. That is what makes a `userId` left in an `update` payload visible
//     as a row that CHANGED OWNER.
//   - `createMany({ skipDuplicates: true })` skips a taken id and raises P2002
//     without the flag. All four `bulkCreate*` here pass the flag, and before
//     the guard that flag is what silently dropped the caller's own row.
//   - `create` / `createMany` HONOUR `data.id`, so "the payload's id was
//     written" is an assertion that can fail.
//
// ─── Since households H3a task 3.7 ───────────────────────────────────────────
//
// The four catalog stores are scoped by `householdId`, and still require
// `userId` on a create until task 3.14. `requireOwnRowOrUnclaimed` now asks
// "is this row in the caller's HOUSEHOLD", so "the caller's" row below means
// the caller's household's, and "the STRANGER's" means a row of another
// household. `householdMember` (householdFake) answers `requireHousehold`.
// Import role gating is H4, so no role is checked here.
vi.mock('../lib/prisma.js', async () => {
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const { createHouseholdFake } = await import('../test/householdFake.js')
  const T = new Date('2026-11-01T00:00:00.000Z')
  const households = createHouseholdFake({
    householdMembers: [
      { householdId: 'hh_mine', userId: 'user_import_test', role: 'owner', joinedAt: T },
      { householdId: 'hh_theirs', userId: 'user_stranger', role: 'owner', joinedAt: T },
    ],
  })
  const catalog = { scope: 'householdId' as const, requiredColumns: ['userId'] }

  const tag = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    typeId: string
    parentId: string | null
  }>({ model: 'Tag', ...catalog })

  const tagType = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    color: string
  }>({ model: 'TagType', ...catalog })

  const vendor = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
  }>({ model: 'Vendor', ...catalog })

  const shelf = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    type: string
    order: number
    filterConfig: unknown
    itemIds: string[]
    createdAt: Date
    updatedAt: Date
  }>({ model: 'Shelf', ...catalog })

  // `item` and `recipe` are here for the shelf ids. `itemIds` and the
  // recipe ids in `filterConfig` are checked against the household since
  // households H3a task 3.9.
  //
  // `item` also serves `bulkUpsertItems`, for the test that models the two
  // passes of a `replace` import. That mutation reads the item back with
  // `include: { tags, vendors }`, and no test here gives an item tags or
  // vendors, so the hook returns two empty lists.
  const item = createOwnedRowFake<{ id: string; householdId: string; userId: string; name: string }>({
    model: 'Item',
    ...catalog,
    relations: () => ({ tags: [], vendors: [] }),
  })
  // `bulkUpsertItems` clears and rewrites these junction rows. No test here
  // asserts them, so they are call recorders only.
  const itemTag = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async () => ({ count: 0 })),
  }
  const itemVendor = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async () => ({ count: 0 })),
  }
  const recipe = createOwnedRowFake<{ id: string; householdId: string; userId: string; name: string }>({
    model: 'Recipe',
    ...catalog,
  })

  // `findUnique` is wrapped in a `vi.fn` on every store on top of the fake's
  // real row matching. Two reasons: a test can COUNT the guard's lookups, and
  // a test can use `mockImplementationOnce` to make one lookup answer "nobody
  // holds this id" — which is how the closing reads below are exercised. See
  // the comment on `simulateGuardMiss`.
  const wrap = <T extends { findUnique: (...args: never[]) => unknown }>(client: T) => ({
    ...client,
    findUnique: vi.fn(client.findUnique),
  })

  return {
    prisma: {
      householdMember: households.client.householdMember,
      tag: wrap(tag.client),
      tagType: wrap(tagType.client),
      vendor: wrap(vendor.client),
      shelf: wrap(shelf.client),
      item: item.client,
      itemTag,
      itemVendor,
      recipe: recipe.client,
      // Handles onto the fakes, hung off the mocked client because a `vi.mock`
      // factory is hoisted above every import and cannot close over a
      // module-scope binding.
      $tag: tag,
      $tagType: tagType,
      $vendor: vendor,
      $shelf: shelf,
      $item: item,
      $recipe: recipe,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { OwnedRowFake } from '../test/ownedRowFake.js'

type TagRow = {
  id: string
  householdId: string
  userId: string
  name: string
  typeId: string
  parentId: string | null
}
type TagTypeRow = { id: string; householdId: string; userId: string; name: string; color: string }
type VendorRow = { id: string; householdId: string; userId: string; name: string }
type ShelfRow = {
  id: string
  householdId: string
  userId: string
  name: string
  type: string
  order: number
  filterConfig: unknown
  itemIds: string[]
  createdAt: Date
  updatedAt: Date
}

const mockPrisma = prisma as unknown as {
  tag: { findUnique: ReturnType<typeof vi.fn> }
  tagType: { findUnique: ReturnType<typeof vi.fn> }
  vendor: { findUnique: ReturnType<typeof vi.fn> }
  shelf: { findUnique: ReturnType<typeof vi.fn> }
  $tag: OwnedRowFake<TagRow>
  $tagType: OwnedRowFake<TagTypeRow>
  $vendor: OwnedRowFake<VendorRow>
  $shelf: OwnedRowFake<ShelfRow>
  $item: OwnedRowFake<{ id: string; householdId: string; userId: string; name: string }>
  $recipe: OwnedRowFake<{ id: string; householdId: string; userId: string; name: string }>
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

const USER = 'user_import_test'
const STRANGER = 'user_stranger'
const HH_MINE = 'hh_mine'
const HH_THEIRS = 'hh_theirs'

const TAG_MINE = 'tag_mine'
const TAG_THEIRS = 'tag_theirs'
const TAG_FREE = 'tag_free'

const TT_MINE = 'tt_mine'
const TT_THEIRS = 'tt_theirs'
const TT_FREE = 'tt_free'

const VEN_MINE = 'ven_mine'
const VEN_THEIRS = 'ven_theirs'
const VEN_FREE = 'ven_free'

const SHELF_MINE = 'shelf_mine'
const SHELF_THEIRS = 'shelf_theirs'
const SHELF_FREE = 'shelf_free'

const ITEM_MINE = 'item_mine'
const ITEM_THEIRS = 'item_theirs'
const ITEM_GONE = 'item_gone' // no row holds it

const REC_MINE = 'rec_mine'
const REC_THEIRS = 'rec_theirs'

const TS = new Date('2026-01-01T00:00:00.000Z')
const PAYLOAD_CREATED = '2026-02-03T04:05:06.000Z'
const PAYLOAD_UPDATED = '2026-03-04T05:06:07.000Z'

beforeEach(() => {
  vi.resetAllMocks()

  // Both tag types are seeded because `bulkCreateTags` filters out a tag whose
  // `typeId` names no TagType row. Every tag below therefore uses `TT_MINE`.
  mockPrisma.$tagType.reset([
    { id: TT_MINE, householdId: HH_MINE, userId: USER, name: 'Category', color: 'blue' },
    { id: TT_THEIRS, householdId: HH_THEIRS, userId: STRANGER, name: 'Theirs', color: 'red' },
  ])
  mockPrisma.$tag.reset([
    { id: TAG_MINE, householdId: HH_MINE, userId: USER, name: 'Dairy', typeId: TT_MINE, parentId: null },
    { id: TAG_THEIRS, householdId: HH_THEIRS, userId: STRANGER, name: 'Theirs', typeId: TT_MINE, parentId: null },
  ])
  mockPrisma.$vendor.reset([
    { id: VEN_MINE, householdId: HH_MINE, userId: USER, name: 'Costco' },
    { id: VEN_THEIRS, householdId: HH_THEIRS, userId: STRANGER, name: 'Theirs' },
  ])
  mockPrisma.$item.reset([
    { id: ITEM_MINE, householdId: HH_MINE, userId: USER, name: 'Milk' },
    { id: ITEM_THEIRS, householdId: HH_THEIRS, userId: STRANGER, name: 'Theirs' },
  ])
  mockPrisma.$recipe.reset([
    { id: REC_MINE, householdId: HH_MINE, userId: USER, name: 'Soup' },
    { id: REC_THEIRS, householdId: HH_THEIRS, userId: STRANGER, name: 'Theirs' },
  ])
  mockPrisma.$shelf.reset([
    {
      id: SHELF_MINE,
      householdId: HH_MINE, userId: USER,
      name: 'Fridge',
      type: 'manual',
      order: 0,
      filterConfig: null,
      itemIds: [],
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: SHELF_THEIRS,
      householdId: HH_THEIRS, userId: STRANGER,
      name: 'Theirs',
      type: 'manual',
      order: 0,
      filterConfig: null,
      itemIds: [],
      createdAt: TS,
      updatedAt: TS,
    },
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
 * Why this exists. With the guard in place the closing read's `householdId` filter
 * is UNREACHABLE through the GraphQL surface: the guard refuses a payload that
 * names another account's id, so no stranger's row can ever be in the closing
 * read's `id: { in: ids }` range. The design doc says the same thing — the
 * scoped reads are defence in depth, not the guard.
 *
 * So the only honest way to exercise those eight reads is to simulate the case
 * they are defence against: a future edit drops the guard, or the guard's
 * lookup misses the row. Stubbing `findUnique` for one call does exactly that
 * and leaves the stored rows legal — one row per id, one owner each. The eight
 * tests that call this are labelled, and each one goes red when `householdId` is
 * dropped from its mutation's closing `findMany`.
 *
 * What these tests do NOT prove: that the guard refuses the stranger's id.
 * That is what the four FORBIDDEN tests per model prove, and in two of these
 * eight the simulated miss lets a real write reach the stranger's row — which
 * is the point. A scoped read is not a substitute for the guard.
 */
function simulateGuardMiss(delegate: { findUnique: ReturnType<typeof vi.fn> }) {
  delegate.findUnique.mockImplementationOnce(async () => null)
}

// ─── Queries ─────────────────────────────────────────────────────────────────

const TAG_FIELDS = '{ id name typeId userId parentId }'
const CREATE_TAGS = `mutation ($tags: [TagInput!]!) { bulkCreateTags(tags: $tags) ${TAG_FIELDS} }`
const UPSERT_TAGS = `mutation ($tags: [TagInput!]!) { bulkUpsertTags(tags: $tags) ${TAG_FIELDS} }`

const TT_FIELDS = '{ id name color userId }'
const CREATE_TTS = `mutation ($tagTypes: [TagTypeInput!]!) { bulkCreateTagTypes(tagTypes: $tagTypes) ${TT_FIELDS} }`
const UPSERT_TTS = `mutation ($tagTypes: [TagTypeInput!]!) { bulkUpsertTagTypes(tagTypes: $tagTypes) ${TT_FIELDS} }`

const VEN_FIELDS = '{ id name userId }'
const CREATE_VENS = `mutation ($vendors: [VendorInput!]!) { bulkCreateVendors(vendors: $vendors) ${VEN_FIELDS} }`
const UPSERT_VENS = `mutation ($vendors: [VendorInput!]!) { bulkUpsertVendors(vendors: $vendors) ${VEN_FIELDS} }`

const SHELF_FIELDS = '{ id name type order userId itemIds }'
const CREATE_SHELVES = `mutation ($shelves: [ShelfInput!]!) { bulkCreateShelves(shelves: $shelves) ${SHELF_FIELDS} }`
const UPSERT_SHELVES = `mutation ($shelves: [ShelfInput!]!) { bulkUpsertShelves(shelves: $shelves) ${SHELF_FIELDS} }`

// ─── Input builders ──────────────────────────────────────────────────────────

const tagIn = (id: string, name: string, typeId: string = TT_MINE) => ({ id, name, typeId, parentId: null })
const ttIn = (id: string, name: string) => ({ id, name, color: 'green' })
const venIn = (id: string, name: string) => ({ id, name })
const shelfIn = (id: string, name: string) => ({
  id,
  name,
  type: 'manual',
  order: 3,
  filterConfig: null,
  itemIds: [],
  createdAt: PAYLOAD_CREATED,
  updatedAt: PAYLOAD_UPDATED,
})

// ─── Tag ─────────────────────────────────────────────────────────────────────

describe('Tag ownership', () => {
  it("user cannot import a tag under an id another account's row holds", async () => {
    // Given a payload naming the STRANGER's tag id
    const payload = [tagIn(TAG_THEIRS, 'Stolen')]

    // When the create-path import runs
    const result = await exec(CREATE_TAGS, { tags: payload })

    // Then it is refused, and the stranger's row is untouched
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$tag.state.rows).toHaveLength(2)
    expect(mockPrisma.$tag.state.rows.find((r) => r.id === TAG_THEIRS)).toMatchObject({
      name: 'Theirs',
      householdId: HH_THEIRS,
      userId: STRANGER,
    })
  })

  it("user cannot take over another account's tag", async () => {
    // Given the same payload on the upsert path, which before the guard
    // overwrote the stranger's row AND reassigned it to the caller
    const payload = [tagIn(TAG_THEIRS, 'Stolen')]

    // When the upsert-path import runs
    const result = await exec(UPSERT_TAGS, { tags: payload })

    // Then it is refused and the stranger keeps their row, name and all
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$tag.state.rows).toHaveLength(2)
    expect(mockPrisma.$tag.state.rows.find((r) => r.id === TAG_THEIRS)).toMatchObject({
      name: 'Theirs',
      householdId: HH_THEIRS,
      userId: STRANGER,
    })
  })

  it('user re-importing their own tag still replaces it', async () => {
    // Given a payload naming the caller's OWN tag id with a new name
    const payload = [tagIn(TAG_MINE, 'Renamed')]

    // When the upsert-path import runs
    const result = await exec(UPSERT_TAGS, { tags: payload })

    // Then the name is replaced and the owner is unchanged.
    //
    // The owner assertion here is a NEGATIVE CONTROL, not coverage. The row is
    // already the caller's, so putting `userId` back into the `update` payload
    // writes `USER` over `USER` and this test stays green. Measured on
    // 2026-10-28 — the plan predicted it would go red and it does not. The
    // test that DOES catch a `userId` in `update` is
    // "does not reassign a row's owner even when the guard misses it" below.
    expect(result.errors).toBeUndefined()
    const stored = mockPrisma.$tag.state.rows.find((r) => r.id === TAG_MINE)
    expect(stored?.name).toBe('Renamed')
    expect(stored).toMatchObject({ householdId: HH_MINE, userId: USER })
  })

  it('user importing a batch with one forbidden tag gets no tags written at all', async () => {
    // Given an ALLOWED row placed AHEAD of the forbidden one. The order is the
    // test: if the guard ran inside the write loop, the first row would be on
    // disk before the second was refused, and these resolvers are not
    // transactional so nothing would roll it back.
    const payload = [tagIn(TAG_FREE, 'Fine'), tagIn(TAG_THEIRS, 'Stolen')]

    // When the create-path import runs
    const result = await exec(CREATE_TAGS, { tags: payload })

    // Then nothing was written — the allowed row is absent too
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$tag.state.rows.map((r) => r.id).sort()).toEqual([TAG_MINE, TAG_THEIRS])
  })


  it("bulkUpsertTags does not reassign a row's owner even when the guard misses it", async () => {
    // Given the guard's lookup misses the stranger's row, so the upsert really
    // reaches it. This is the case `userId` being OUT of the `update` payload
    // is defence against: a future edit that drops the guard must not be able
    // to hand another account's row to the importer.
    simulateGuardMiss(mockPrisma.tag)

    // When the caller upserts under the stranger's id
    const result = await exec(UPSERT_TAGS, { tags: [tagIn(TAG_THEIRS, 'Stolen')] })

    // Then the row is still the STRANGER's. This is what goes red if `userId`
    // creeps back into `update`.
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$tag.state.rows.find((r) => r.id === TAG_THEIRS)).toMatchObject({
      householdId: HH_THEIRS,
      userId: STRANGER,
    })
  })

  it("bulkCreateTags' closing read does not return a tag the caller does not own", async () => {
    // Given the guard's lookup misses the stranger's row (see
    // `simulateGuardMiss` — the closing read is defence in depth, so this is
    // the only way to reach it)
    simulateGuardMiss(mockPrisma.tag)

    // When the create-path import names that id
    const result = await exec(CREATE_TAGS, { tags: [tagIn(TAG_THEIRS, 'Stolen')] })

    // Then the scoped closing read hands back nothing
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateTags).toEqual([])
  })

  it("bulkUpsertTags' closing read does not return a tag the caller does not own", async () => {
    simulateGuardMiss(mockPrisma.tag)
    const result = await exec(UPSERT_TAGS, { tags: [tagIn(TAG_THEIRS, 'Stolen')] })
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertTags).toEqual([])
  })
})

// ─── TagType ─────────────────────────────────────────────────────────────────

describe('TagType ownership', () => {
  it("user cannot import a tag type under an id another account's row holds", async () => {
    const result = await exec(CREATE_TTS, { tagTypes: [ttIn(TT_THEIRS, 'Stolen')] })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$tagType.state.rows).toHaveLength(2)
    expect(mockPrisma.$tagType.state.rows.find((r) => r.id === TT_THEIRS)).toMatchObject({
      name: 'Theirs',
      householdId: HH_THEIRS,
      userId: STRANGER,
    })
  })

  it("user cannot take over another account's tag type", async () => {
    const result = await exec(UPSERT_TTS, { tagTypes: [ttIn(TT_THEIRS, 'Stolen')] })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$tagType.state.rows).toHaveLength(2)
    expect(mockPrisma.$tagType.state.rows.find((r) => r.id === TT_THEIRS)).toMatchObject({
      name: 'Theirs',
      householdId: HH_THEIRS,
      userId: STRANGER,
    })
  })

  it('user re-importing their own tag type still replaces it', async () => {
    const result = await exec(UPSERT_TTS, { tagTypes: [ttIn(TT_MINE, 'Renamed')] })
    expect(result.errors).toBeUndefined()
    const stored = mockPrisma.$tagType.state.rows.find((r) => r.id === TT_MINE)
    expect(stored?.name).toBe('Renamed')
    expect(stored).toMatchObject({ householdId: HH_MINE, userId: USER })
  })

  it('user importing a batch with one forbidden tag type gets no tag types written at all', async () => {
    const payload = [ttIn(TT_FREE, 'Fine'), ttIn(TT_THEIRS, 'Stolen')]
    const result = await exec(CREATE_TTS, { tagTypes: payload })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$tagType.state.rows.map((r) => r.id).sort()).toEqual([TT_MINE, TT_THEIRS])
  })


  it("bulkUpsertTagTypes does not reassign a row's owner even when the guard misses it", async () => {
    // Given the guard's lookup misses the stranger's row, so the upsert really
    // reaches it. This is the case `userId` being OUT of the `update` payload
    // is defence against: a future edit that drops the guard must not be able
    // to hand another account's row to the importer.
    simulateGuardMiss(mockPrisma.tagType)

    // When the caller upserts under the stranger's id
    const result = await exec(UPSERT_TTS, { tagTypes: [ttIn(TT_THEIRS, 'Stolen')] })

    // Then the row is still the STRANGER's. This is what goes red if `userId`
    // creeps back into `update`.
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$tagType.state.rows.find((r) => r.id === TT_THEIRS)).toMatchObject({
      householdId: HH_THEIRS,
      userId: STRANGER,
    })
  })

  it("bulkCreateTagTypes' closing read does not return a tag type the caller does not own", async () => {
    simulateGuardMiss(mockPrisma.tagType)
    const result = await exec(CREATE_TTS, { tagTypes: [ttIn(TT_THEIRS, 'Stolen')] })
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateTagTypes).toEqual([])
  })

  it("bulkUpsertTagTypes' closing read does not return a tag type the caller does not own", async () => {
    simulateGuardMiss(mockPrisma.tagType)
    const result = await exec(UPSERT_TTS, { tagTypes: [ttIn(TT_THEIRS, 'Stolen')] })
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertTagTypes).toEqual([])
  })
})

// ─── Vendor ──────────────────────────────────────────────────────────────────

describe('Vendor ownership', () => {
  it("user cannot import a vendor under an id another account's row holds", async () => {
    const result = await exec(CREATE_VENS, { vendors: [venIn(VEN_THEIRS, 'Stolen')] })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$vendor.state.rows).toHaveLength(2)
    expect(mockPrisma.$vendor.state.rows.find((r) => r.id === VEN_THEIRS)).toMatchObject({
      name: 'Theirs',
      householdId: HH_THEIRS,
      userId: STRANGER,
    })
  })

  it("user cannot take over another account's vendor", async () => {
    const result = await exec(UPSERT_VENS, { vendors: [venIn(VEN_THEIRS, 'Stolen')] })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$vendor.state.rows).toHaveLength(2)
    expect(mockPrisma.$vendor.state.rows.find((r) => r.id === VEN_THEIRS)).toMatchObject({
      name: 'Theirs',
      householdId: HH_THEIRS,
      userId: STRANGER,
    })
  })

  it('user re-importing their own vendor still replaces it', async () => {
    const result = await exec(UPSERT_VENS, { vendors: [venIn(VEN_MINE, 'Renamed')] })
    expect(result.errors).toBeUndefined()
    const stored = mockPrisma.$vendor.state.rows.find((r) => r.id === VEN_MINE)
    expect(stored?.name).toBe('Renamed')
    expect(stored).toMatchObject({ householdId: HH_MINE, userId: USER })
  })

  it('user importing a batch with one forbidden vendor gets no vendors written at all', async () => {
    const payload = [venIn(VEN_FREE, 'Fine'), venIn(VEN_THEIRS, 'Stolen')]
    const result = await exec(CREATE_VENS, { vendors: payload })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$vendor.state.rows.map((r) => r.id).sort()).toEqual([VEN_MINE, VEN_THEIRS])
  })


  it("bulkUpsertVendors does not reassign a row's owner even when the guard misses it", async () => {
    // Given the guard's lookup misses the stranger's row, so the upsert really
    // reaches it. This is the case `userId` being OUT of the `update` payload
    // is defence against: a future edit that drops the guard must not be able
    // to hand another account's row to the importer.
    simulateGuardMiss(mockPrisma.vendor)

    // When the caller upserts under the stranger's id
    const result = await exec(UPSERT_VENS, { vendors: [venIn(VEN_THEIRS, 'Stolen')] })

    // Then the row is still the STRANGER's. This is what goes red if `userId`
    // creeps back into `update`.
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$vendor.state.rows.find((r) => r.id === VEN_THEIRS)).toMatchObject({
      householdId: HH_THEIRS,
      userId: STRANGER,
    })
  })

  it("bulkCreateVendors' closing read does not return a vendor the caller does not own", async () => {
    simulateGuardMiss(mockPrisma.vendor)
    const result = await exec(CREATE_VENS, { vendors: [venIn(VEN_THEIRS, 'Stolen')] })
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateVendors).toEqual([])
  })

  it("bulkUpsertVendors' closing read does not return a vendor the caller does not own", async () => {
    simulateGuardMiss(mockPrisma.vendor)
    const result = await exec(UPSERT_VENS, { vendors: [venIn(VEN_THEIRS, 'Stolen')] })
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertVendors).toEqual([])
  })
})

// ─── Shelf ───────────────────────────────────────────────────────────────────

describe('Shelf ownership', () => {
  it("user cannot import a shelf under an id another account's row holds", async () => {
    const result = await exec(CREATE_SHELVES, { shelves: [shelfIn(SHELF_THEIRS, 'Stolen')] })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$shelf.state.rows).toHaveLength(2)
    expect(mockPrisma.$shelf.state.rows.find((r) => r.id === SHELF_THEIRS)).toMatchObject({
      name: 'Theirs',
      householdId: HH_THEIRS,
      userId: STRANGER,
    })
  })

  it("user cannot take over another account's shelf", async () => {
    const result = await exec(UPSERT_SHELVES, { shelves: [shelfIn(SHELF_THEIRS, 'Stolen')] })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$shelf.state.rows).toHaveLength(2)
    expect(mockPrisma.$shelf.state.rows.find((r) => r.id === SHELF_THEIRS)).toMatchObject({
      name: 'Theirs',
      householdId: HH_THEIRS,
      userId: STRANGER,
    })
  })

  it('user re-importing their own shelf still replaces it', async () => {
    const result = await exec(UPSERT_SHELVES, { shelves: [shelfIn(SHELF_MINE, 'Renamed')] })
    expect(result.errors).toBeUndefined()
    const stored = mockPrisma.$shelf.state.rows.find((r) => r.id === SHELF_MINE)
    expect(stored?.name).toBe('Renamed')
    expect(stored).toMatchObject({ householdId: HH_MINE, userId: USER })
  })

  it('user importing a batch with one forbidden shelf gets no shelves written at all', async () => {
    const payload = [shelfIn(SHELF_FREE, 'Fine'), shelfIn(SHELF_THEIRS, 'Stolen')]
    const result = await exec(CREATE_SHELVES, { shelves: payload })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$shelf.state.rows.map((r) => r.id).sort()).toEqual([
      SHELF_MINE,
      SHELF_THEIRS,
    ])
  })


  it("bulkUpsertShelves does not reassign a row's owner even when the guard misses it", async () => {
    // Given the guard's lookup misses the stranger's row, so the upsert really
    // reaches it. This is the case `userId` being OUT of the `update` payload
    // is defence against: a future edit that drops the guard must not be able
    // to hand another account's row to the importer.
    simulateGuardMiss(mockPrisma.shelf)

    // When the caller upserts under the stranger's id
    const result = await exec(UPSERT_SHELVES, { shelves: [shelfIn(SHELF_THEIRS, 'Stolen')] })

    // Then the row is still the STRANGER's. This is what goes red if `userId`
    // creeps back into `update`.
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$shelf.state.rows.find((r) => r.id === SHELF_THEIRS)).toMatchObject({
      householdId: HH_THEIRS,
      userId: STRANGER,
    })
  })

  it("bulkCreateShelves' closing read does not return a shelf the caller does not own", async () => {
    simulateGuardMiss(mockPrisma.shelf)
    const result = await exec(CREATE_SHELVES, { shelves: [shelfIn(SHELF_THEIRS, 'Stolen')] })
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateShelves).toEqual([])
  })

  it("bulkUpsertShelves' closing read does not return a shelf the caller does not own", async () => {
    simulateGuardMiss(mockPrisma.shelf)
    const result = await exec(UPSERT_SHELVES, { shelves: [shelfIn(SHELF_THEIRS, 'Stolen')] })
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertShelves).toEqual([])
  })
})

// ─── Cross-model reference: Tag → TagType ────────────────────────────────────
//
// Plan task 8. The guards above protect each row's OWN primary key. This
// protects the OTHER id — the `typeId` a tag is attached to.
//
// `bulkCreateTags` already filtered out a tag whose `typeId` named no
// `TagType` row, but that read was UNSCOPED, so a tag of the caller's could
// point at a STRANGER's tag type. Plan task 8 added `userId` to it.
//
// The filter already SKIPPED the whole tag row rather than refusing the
// mutation, and task 8 keeps that: a tag whose type the caller may not use is
// dropped exactly like a tag whose type was deleted. `TT_FREE` below is the
// negative control that pins the two answers as the same.
//
// `bulkUpsertTags` got the same skip in households H3a task 3.9, for both
// `typeId` and `parentId`. Its tests are in the next block.

describe('Tag → TagType references', () => {
  it("user importing a tag under another account's tag type gets no tag written", async () => {
    // Given a FREE tag id whose `typeId` names the STRANGER's tag type
    const payload = [tagIn(TAG_FREE, 'Fine', TT_THEIRS)]

    // When the create-path import runs
    const result = await exec(CREATE_TAGS, { tags: payload })

    // Then the tag is skipped: nothing is returned and the two seeded tags are
    // all that remain
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateTags).toEqual([])
    expect(mockPrisma.$tag.state.rows.map((r) => r.id).sort()).toEqual(
      [TAG_MINE, TAG_THEIRS].sort(),
    )
  })

  it('user importing a tag under a tag type that no longer exists gets the same answer', async () => {
    // Given a FREE tag id whose `typeId` names an id NO tag type holds. This
    // is the NEGATIVE CONTROL for the skip-not-FORBIDDEN decision: a deleted
    // tag type and a stranger's tag type must be indistinguishable, or the
    // mutation tells the caller which ids exist in other accounts.
    const payload = [tagIn(TAG_FREE, 'Fine', TT_FREE)]

    // When the create-path import runs
    const result = await exec(CREATE_TAGS, { tags: payload })

    // Then the answer is the same as above
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateTags).toEqual([])
    expect(mockPrisma.$tag.state.rows.map((r) => r.id).sort()).toEqual(
      [TAG_MINE, TAG_THEIRS].sort(),
    )
  })

  it('user importing a tag under their own tag type gets it written', async () => {
    // Given a FREE tag id under the CALLER's OWN tag type. A filter that
    // dropped everything would pass both tests above.
    const payload = [tagIn(TAG_FREE, 'Fine', TT_MINE)]

    // When the create-path import runs
    const result = await exec(CREATE_TAGS, { tags: payload })

    // Then the tag is written, owned by the caller, under the type it named
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$tag.state.rows.find((r) => r.id === TAG_FREE)).toMatchObject({
      householdId: HH_MINE,
      userId: USER,
      typeId: TT_MINE,
    })
  })
})

// ─── bulkUpsertTags: `typeId` and `parentId` ─────────────────────────────────
//
// Households H3a task 3.9. Until then `bulkUpsertTags` wrote both ids as the
// payload gave them, so a tag of the caller's could point at another
// household's tag type, or hang under another household's tag. Now a tag
// whose type or parent the caller may not use is SKIPPED, as `bulkCreateTags`
// skips it. The `*_FREE` tests are the negative controls: "not yours" and
// "not there" give the same answer.

describe('bulkUpsertTags: the tag type and the parent', () => {
  const tagRow = (id: string) => mockPrisma.$tag.state.rows.find((r) => r.id === id)

  it("user replacing tags cannot put a tag under another household's tag type", async () => {
    // Given a FREE tag id whose `typeId` names the STRANGER's tag type
    const result = await exec(UPSERT_TAGS, { tags: [tagIn(TAG_FREE, 'Fine', TT_THEIRS)] })

    // Then the tag is skipped
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertTags).toEqual([])
    expect(tagRow(TAG_FREE)).toBeUndefined()
  })

  it('user replacing tags gets the same answer for a tag type that no longer exists', async () => {
    const result = await exec(UPSERT_TAGS, { tags: [tagIn(TAG_FREE, 'Fine', TT_FREE)] })

    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertTags).toEqual([])
    expect(tagRow(TAG_FREE)).toBeUndefined()
  })

  it("user replacing tags cannot hang a tag under another household's tag", async () => {
    // Given a FREE tag id under the caller's own type, whose `parentId` names
    // the STRANGER's tag
    const result = await exec(UPSERT_TAGS, {
      tags: [{ ...tagIn(TAG_FREE, 'Fine'), parentId: TAG_THEIRS }],
    })

    // Then the tag is skipped, and the stranger's tag gains no child
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertTags).toEqual([])
    expect(tagRow(TAG_FREE)).toBeUndefined()
  })

  it('user replacing tags gets the same answer for a parent that no longer exists', async () => {
    const result = await exec(UPSERT_TAGS, {
      tags: [{ ...tagIn(TAG_FREE, 'Fine'), parentId: 'tag_gone' }],
    })

    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertTags).toEqual([])
    expect(tagRow(TAG_FREE)).toBeUndefined()
  })

  it('user replacing tags gets no child written when its parent in the same payload is skipped', async () => {
    // Given a NEW parent whose `typeId` names the STRANGER's tag type, and a
    // child under the caller's own type whose `parentId` names that parent.
    // The parent is skipped for its type, so the child has no parent it can
    // use. A pass that counted every payload id as written at the start would
    // write the child under a parent that never lands.
    const result = await exec(UPSERT_TAGS, {
      tags: [
        tagIn('tag_bad_parent', 'Parent', TT_THEIRS),
        { ...tagIn('tag_orphan', 'Child'), parentId: 'tag_bad_parent' },
      ],
    })

    // Then both are skipped, and only the two seeded tags remain
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertTags).toEqual([])
    expect(tagRow('tag_bad_parent')).toBeUndefined()
    expect(tagRow('tag_orphan')).toBeUndefined()
    expect(mockPrisma.$tag.state.rows.map((r) => r.id).sort()).toEqual(
      [TAG_MINE, TAG_THEIRS].sort(),
    )
  })

  it('user replacing tags can hang a tag under their own tag, or under a tag of the same payload', async () => {
    // Given a child under the caller's existing tag, and a second child whose
    // parent comes LATER in the same payload. The positive half: a filter
    // that dropped every parent would pass the tests above.
    const result = await exec(UPSERT_TAGS, {
      tags: [
        { ...tagIn('tag_child_a', 'Child A'), parentId: TAG_MINE },
        { ...tagIn('tag_child_b', 'Child B'), parentId: 'tag_new_parent' },
        tagIn('tag_new_parent', 'New parent'),
      ],
    })

    // Then all three are written, each under the parent it named
    expect(result.errors).toBeUndefined()
    expect(tagRow('tag_child_a')).toMatchObject({ parentId: TAG_MINE, householdId: HH_MINE })
    expect(tagRow('tag_child_b')).toMatchObject({ parentId: 'tag_new_parent', householdId: HH_MINE })
    expect(tagRow('tag_new_parent')).toMatchObject({ parentId: null, householdId: HH_MINE })
  })
})

// ─── Shelves: `itemIds` and the `filterConfig` ids ───────────────────────────
//
// Households H3a task 3.9. Until then both shelf imports wrote these arrays as
// the payload gave them, so a shelf of the caller's could name another
// household's items, tags, vendors and recipes. Now each id of ANOTHER
// household's row is DROPPED and the shelf still lands: the same "skip the
// edge" the item import does for `tagIds` and `vendorIds`.
//
// An id NO row holds is KEPT (`ITEM_GONE` and the `*_LATER` ids), the same
// rule as `createShelf`'s `missing: 'allow'`. The first version of task 3.9
// dropped it, and that lost shelf contents on a `replace` import: the web
// client writes a new shelf in its first pass, and a row that conflicts with a
// cloud row by name only in its second pass. The last test below models those
// two passes. See `householdShelfRefs` in import.resolver.ts.

const ITEM_LATER = 'item_later'
const TAG_LATER = 'tag_later'

describe('shelf imports drop the ids of other households', () => {
  const mixed = {
    id: SHELF_FREE,
    name: 'Mixed',
    type: 'filter',
    order: 3,
    itemIds: [ITEM_THEIRS, ITEM_MINE],
    filterConfig: {
      tagIds: [TAG_THEIRS, TAG_MINE],
      vendorIds: [VEN_MINE, VEN_THEIRS],
      recipeIds: [REC_THEIRS, REC_MINE],
    },
    createdAt: PAYLOAD_CREATED,
    updatedAt: PAYLOAD_UPDATED,
  }

  const missing = {
    ...mixed,
    name: 'Not yet there',
    itemIds: [ITEM_GONE, ITEM_MINE],
    filterConfig: {
      tagIds: ['tag_gone'],
      vendorIds: ['ven_gone'],
      recipeIds: ['rec_gone'],
    },
  }

  for (const [label, query] of [
    ['bulkCreateShelves', CREATE_SHELVES],
    ['bulkUpsertShelves', UPSERT_SHELVES],
  ] as const) {
    it(`${label}: user importing a shelf loses the ids of another household`, async () => {
      // Given a new shelf naming, in each array, one id of the caller's
      // household and one of another household
      const result = await exec(query, { shelves: [mixed] })

      // Then the shelf lands, with each array cut down to the caller's ids,
      // in the payload's order
      expect(result.errors).toBeUndefined()
      expect(mockPrisma.$shelf.state.rows.find((r) => r.id === SHELF_FREE)).toMatchObject({
        householdId: HH_MINE,
        itemIds: [ITEM_MINE],
        filterConfig: {
          tagIds: [TAG_MINE],
          vendorIds: [VEN_MINE],
          recipeIds: [REC_MINE],
        },
      })
    })

    it(`${label}: user importing a shelf keeps ids that no row holds yet`, async () => {
      // Given a new shelf naming, in each array, an id no row holds (and, in
      // `itemIds`, one of the caller's own items beside it)
      const result = await exec(query, { shelves: [missing] })

      // Then every id is kept, in the payload's order
      expect(result.errors).toBeUndefined()
      expect(mockPrisma.$shelf.state.rows.find((r) => r.id === SHELF_FREE)).toMatchObject({
        householdId: HH_MINE,
        itemIds: [ITEM_GONE, ITEM_MINE],
        filterConfig: {
          tagIds: ['tag_gone'],
          vendorIds: ['ven_gone'],
          recipeIds: ['rec_gone'],
        },
      })
    })

    it(`${label}: user importing a shelf with no filter keeps no filter`, async () => {
      // Given a shelf with `filterConfig: null` and an empty item list
      const result = await exec(query, { shelves: [shelfIn(SHELF_FREE, 'Plain')] })

      // Then neither is invented
      expect(result.errors).toBeUndefined()
      const row = mockPrisma.$shelf.state.rows.find((r) => r.id === SHELF_FREE)
      expect(row?.itemIds).toEqual([])
      expect(row?.filterConfig ?? null).toBeNull()
    })
  }

  it('user replacing data keeps a new shelf that names an item and a tag written in the second pass', async () => {
    // Given the order the web client uses on `replace` (apps/web/src/lib/
    // importData.ts): a create pass, then an upsert pass. The item and the tag
    // share a NAME with a cloud row but not an id, so the client sends them
    // on the upsert pass. The new shelf that names them goes on the create
    // pass, before either row exists.
    const created = await exec(CREATE_SHELVES, {
      shelves: [
        {
          ...mixed,
          name: 'Two passes',
          itemIds: [ITEM_LATER],
          filterConfig: { tagIds: [TAG_LATER] },
        },
      ],
    })
    expect(created.errors).toBeUndefined()

    // When the upsert pass writes the item and the tag
    const items = await exec(
      'mutation ($items: [ItemInput!]!) { bulkUpsertItems(items: $items) { id } }',
      {
        items: [
          {
            id: ITEM_LATER,
            name: 'Milk',
            tagIds: [],
            targetUnit: 'package',
            consumeAmount: 1,
            createdAt: PAYLOAD_CREATED,
            updatedAt: PAYLOAD_UPDATED,
          },
        ],
      },
    )
    expect(items.errors).toBeUndefined()
    const tags = await exec(UPSERT_TAGS, { tags: [tagIn(TAG_LATER, 'Dairy')] })
    expect(tags.errors).toBeUndefined()

    // Then the shelf still names both, and both are rows of the caller's
    // household
    expect(mockPrisma.$shelf.state.rows.find((r) => r.id === SHELF_FREE)).toMatchObject({
      itemIds: [ITEM_LATER],
      filterConfig: { tagIds: [TAG_LATER] },
    })
    expect(mockPrisma.$item.state.rows.find((r) => r.id === ITEM_LATER)).toMatchObject({
      householdId: HH_MINE,
    })
    expect(mockPrisma.$tag.state.rows.find((r) => r.id === TAG_LATER)).toMatchObject({
      householdId: HH_MINE,
    })
  })
})
