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
vi.mock('../lib/prisma.js', async () => {
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')

  const tag = createOwnedRowFake<{
    id: string
    userId: string
    name: string
    typeId: string
    parentId: string | null
  }>({ model: 'Tag' })

  const tagType = createOwnedRowFake<{
    id: string
    userId: string
    name: string
    color: string
  }>({ model: 'TagType' })

  const vendor = createOwnedRowFake<{ id: string; userId: string; name: string }>({
    model: 'Vendor',
  })

  const shelf = createOwnedRowFake<{
    id: string
    userId: string
    name: string
    type: string
    order: number
    filterConfig: unknown
    itemIds: string[]
    createdAt: Date
    updatedAt: Date
  }>({ model: 'Shelf' })

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
      tag: wrap(tag.client),
      tagType: wrap(tagType.client),
      vendor: wrap(vendor.client),
      shelf: wrap(shelf.client),
      // Handles onto the fakes, hung off the mocked client because a `vi.mock`
      // factory is hoisted above every import and cannot close over a
      // module-scope binding.
      $tag: tag,
      $tagType: tagType,
      $vendor: vendor,
      $shelf: shelf,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { OwnedRowFake } from '../test/ownedRowFake.js'

type TagRow = { id: string; userId: string; name: string; typeId: string; parentId: string | null }
type TagTypeRow = { id: string; userId: string; name: string; color: string }
type VendorRow = { id: string; userId: string; name: string }
type ShelfRow = {
  id: string
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

const TS = new Date('2026-01-01T00:00:00.000Z')
const PAYLOAD_CREATED = '2026-02-03T04:05:06.000Z'
const PAYLOAD_UPDATED = '2026-03-04T05:06:07.000Z'

beforeEach(() => {
  vi.resetAllMocks()

  // Both tag types are seeded because `bulkCreateTags` filters out a tag whose
  // `typeId` names no TagType row. Every tag below therefore uses `TT_MINE`.
  mockPrisma.$tagType.reset([
    { id: TT_MINE, userId: USER, name: 'Category', color: 'blue' },
    { id: TT_THEIRS, userId: STRANGER, name: 'Theirs', color: 'red' },
  ])
  mockPrisma.$tag.reset([
    { id: TAG_MINE, userId: USER, name: 'Dairy', typeId: TT_MINE, parentId: null },
    { id: TAG_THEIRS, userId: STRANGER, name: 'Theirs', typeId: TT_MINE, parentId: null },
  ])
  mockPrisma.$vendor.reset([
    { id: VEN_MINE, userId: USER, name: 'Costco' },
    { id: VEN_THEIRS, userId: STRANGER, name: 'Theirs' },
  ])
  mockPrisma.$shelf.reset([
    {
      id: SHELF_MINE,
      userId: USER,
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
      userId: STRANGER,
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
 * Why this exists. With the guard in place the closing read's `userId` filter
 * is UNREACHABLE through the GraphQL surface: the guard refuses a payload that
 * names another account's id, so no stranger's row can ever be in the closing
 * read's `id: { in: ids }` range. The design doc says the same thing — the
 * scoped reads are defence in depth, not the guard.
 *
 * So the only honest way to exercise those eight reads is to simulate the case
 * they are defence against: a future edit drops the guard, or the guard's
 * lookup misses the row. Stubbing `findUnique` for one call does exactly that
 * and leaves the stored rows legal — one row per id, one owner each. The eight
 * tests that call this are labelled, and each one goes red when `userId` is
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

const tagIn = (id: string, name: string) => ({ id, name, typeId: TT_MINE, parentId: null })
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
    expect(stored?.userId).toBe(USER)
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
    expect(mockPrisma.$tag.state.rows.find((r) => r.id === TAG_THEIRS)?.userId).toBe(STRANGER)
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
      userId: STRANGER,
    })
  })

  it("user cannot take over another account's tag type", async () => {
    const result = await exec(UPSERT_TTS, { tagTypes: [ttIn(TT_THEIRS, 'Stolen')] })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$tagType.state.rows).toHaveLength(2)
    expect(mockPrisma.$tagType.state.rows.find((r) => r.id === TT_THEIRS)).toMatchObject({
      name: 'Theirs',
      userId: STRANGER,
    })
  })

  it('user re-importing their own tag type still replaces it', async () => {
    const result = await exec(UPSERT_TTS, { tagTypes: [ttIn(TT_MINE, 'Renamed')] })
    expect(result.errors).toBeUndefined()
    const stored = mockPrisma.$tagType.state.rows.find((r) => r.id === TT_MINE)
    expect(stored?.name).toBe('Renamed')
    expect(stored?.userId).toBe(USER)
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
    expect(mockPrisma.$tagType.state.rows.find((r) => r.id === TT_THEIRS)?.userId).toBe(STRANGER)
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
      userId: STRANGER,
    })
  })

  it("user cannot take over another account's vendor", async () => {
    const result = await exec(UPSERT_VENS, { vendors: [venIn(VEN_THEIRS, 'Stolen')] })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$vendor.state.rows).toHaveLength(2)
    expect(mockPrisma.$vendor.state.rows.find((r) => r.id === VEN_THEIRS)).toMatchObject({
      name: 'Theirs',
      userId: STRANGER,
    })
  })

  it('user re-importing their own vendor still replaces it', async () => {
    const result = await exec(UPSERT_VENS, { vendors: [venIn(VEN_MINE, 'Renamed')] })
    expect(result.errors).toBeUndefined()
    const stored = mockPrisma.$vendor.state.rows.find((r) => r.id === VEN_MINE)
    expect(stored?.name).toBe('Renamed')
    expect(stored?.userId).toBe(USER)
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
    expect(mockPrisma.$vendor.state.rows.find((r) => r.id === VEN_THEIRS)?.userId).toBe(STRANGER)
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
      userId: STRANGER,
    })
  })

  it("user cannot take over another account's shelf", async () => {
    const result = await exec(UPSERT_SHELVES, { shelves: [shelfIn(SHELF_THEIRS, 'Stolen')] })
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$shelf.state.rows).toHaveLength(2)
    expect(mockPrisma.$shelf.state.rows.find((r) => r.id === SHELF_THEIRS)).toMatchObject({
      name: 'Theirs',
      userId: STRANGER,
    })
  })

  it('user re-importing their own shelf still replaces it', async () => {
    const result = await exec(UPSERT_SHELVES, { shelves: [shelfIn(SHELF_MINE, 'Renamed')] })
    expect(result.errors).toBeUndefined()
    const stored = mockPrisma.$shelf.state.rows.find((r) => r.id === SHELF_MINE)
    expect(stored?.name).toBe('Renamed')
    expect(stored?.userId).toBe(USER)
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
    expect(mockPrisma.$shelf.state.rows.find((r) => r.id === SHELF_THEIRS)?.userId).toBe(STRANGER)
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
