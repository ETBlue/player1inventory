import { ApolloServer } from '@apollo/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── What this file covers ───────────────────────────────────────────────────
//
// The ownership guard on the two InventoryLog import mutations:
// `bulkCreateInventoryLogs` and `bulkUpsertInventoryLogs`. Issue #327, task 7.
//
// Before the guard each had the two holes the other eight models had.
// `bulkUpsertInventoryLogs` ran `upsert({ where: { id } })` with `userId`
// inside `update`, so a payload naming another account's log id OVERWROTE that
// row and took ownership of it. `bulkCreateInventoryLogs` ran an UNSCOPED
// `findUnique({ where: { id } })` and skipped on a hit, so a stranger's log
// read as "already exists" and the caller's OWN log was dropped with no error
// and no count.
//
// ─── Two guards, in this order ───────────────────────────────────────────────
//
// Both mutations already had a location guard: `resolveLogLocations` sends
// every `locationId` the payload names to `requireLocationRole`. The new
// log-id guard runs AFTER it, so a forbidden location is still refused first
// and the 9 tests in `import-inventoryLog-location.resolver.test.ts` keep the
// error they assert.
//
// The two guards cover different columns, and neither replaces the other:
//
//   - `resolveLogLocations` guards the location a log is written TO.
//   - `requireOwnRowIdsOrUnclaimed` guards the log's OWN primary key.
//
// Why the log-id guard is reachable at all, given the location guard: a log's
// location arrives in its own input field, `InventoryLogInput.locationId`, and
// has nothing to do with its id. So `LOG_THEIRS` below is a row the STRANGER
// owns, stored at the stranger's location, while the PAYLOAD that names its id
// carries `locationId: LOC_OTHER` — a location the caller really owns. The
// location guard therefore passes that payload and only the log-id guard can
// refuse it. This is the trap task 6 hit with carts, where the location rides
// inside the cart's own id; here the two are independent fields, so the payload
// had to be written with the caller's own location on purpose.
//
// One test asserts that ordering directly, by counting the log-id guard's own
// lookup.
//
// ─── Why this file is separate from the other two ────────────────────────────
//
// `import.resolver.test.ts` mocks every Prisma model as a plain `vi.fn()` call
// recorder, and task 3 armed all nine `findUnique` / `findFirst` recorders to
// resolve `null` so its 11 tests keep answering "nobody holds this id" for any
// id. An ownership assertion written against those stubs therefore CANNOT
// fail, and a recorder cannot show which `userId` a row ended up with. Root
// CLAUDE.md, "Write test doubles to model the constraint, not the happy path".
//
// It is also separate from `import-inventoryLog-location.resolver.test.ts`,
// whose subject is the `locationId` COLUMN each log lands in. `vi.mock` is per
// FILE, and that file's `inventoryLog` store is `inventoryLogFake`, which makes
// no owner assertions possible — see the next block for why this file uses a
// different fake.
//
// ─── The fakes, and why `ownedRowFake` rather than `inventoryLogFake` ────────
//
//   - `src/test/stockFake.ts` for `location`, so `resolveLogLocations`,
//     `requireLocationRole` and `ensureDefaultLocation` run against real rows.
//   - `src/test/ownedRowFake.ts` for `inventoryLog` and `item`.
//
// `inventoryLogFake` already carries a `findFirst` with the same key-by-key
// `where` semantics, so the guard WOULD run against it. It was not reused
// because three constraints this file's assertions rest on are modelled only
// by `ownedRowFake`:
//
//   1. `create` enforces the PRIMARY KEY with P2002. `inventoryLogFake.insert`
//      pushes a duplicate id without complaint, so "the create path skips a row
//      the caller already owns" would pass there even if the skip were gone —
//      the second row would simply be appended.
//   2. An unknown `where` key THROWS instead of being ignored.
//      `inventoryLogFake.matchesLog` checks five named keys and ignores
//      everything else, which is the `cartItemFake` failure of PR 3c: a
//      resolver that dropped a filter would keep every test green.
//   3. `create` REQUIRES a `userId`. `inventoryLogFake` casts `data.userId` and
//      would store `undefined` as the owner without a word.
//
// `ownedRowFake` models `where` on `id` and `userId` only, which is all these
// two mutations ask of `inventoryLog`: `{ id }` and `{ id, userId }` from the
// guard, and `upsert({ where: { id } })`. It stores every other column handed
// to it, so `locationId` can still be read back.
//
// `item` is here only because `bulkCreateInventoryLogs` checks that the
// payload's `itemId` exists before it writes. That check is still UNSCOPED, and
// plan task 8 closes it, not this one.
vi.mock('../lib/prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')

  const stock = createStockFake()

  const inventoryLog = createOwnedRowFake<{
    id: string
    userId: string
    itemId: string
    locationId: string
    delta: number | null
    quantity: number | null
    occurredAt: Date | null
    note: string | null
  }>({ model: 'InventoryLog' })

  const item = createOwnedRowFake<{ id: string; userId: string; name: string }>({
    model: 'Item',
  })

  return {
    prisma: {
      ...stock.client,
      location: {
        ...stock.client.location,
        // Wrapped so a test can count how many location checks ran.
        findFirst: vi.fn(stock.client.location.findFirst),
      },
      inventoryLog: {
        ...inventoryLog.client,
        // `findUnique` is wrapped in a `vi.fn` on top of the fake's real row
        // matching, for two reasons: a test can make one lookup answer "nobody
        // holds this id" (see `simulateGuardMiss`), and a test can assert the
        // guard's lookup did NOT run, which is how the two guards' ORDER is
        // pinned.
        findUnique: vi.fn(inventoryLog.client.findUnique),
      },
      item: item.client,
      // Handles onto the fakes, hung off the mocked client because a `vi.mock`
      // factory is hoisted above every import and cannot close over a
      // module-scope binding.
      $stockFake: stock,
      $log: inventoryLog,
      $item: item,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { OwnedRowFake } from '../test/ownedRowFake.js'
import type { StockFake } from '../test/stockFake.js'

type LogRow = {
  id: string
  userId: string
  itemId: string
  locationId: string
  delta: number | null
  quantity: number | null
  occurredAt: Date | null
  note: string | null
}
type ItemRow = { id: string; userId: string; name: string }

const mockPrisma = prisma as unknown as {
  inventoryLog: { findUnique: ReturnType<typeof vi.fn> }
  location: { findFirst: ReturnType<typeof vi.fn> }
  $stockFake: StockFake
  $log: OwnedRowFake<LogRow>
  $item: OwnedRowFake<ItemRow>
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
// THREE LOCATIONS, two of them the caller's — copied from
// `import-inventoryLog-location.resolver.test.ts`. With ONE location, "the
// location the payload names" and "the caller's default location" give the SAME
// answer, so a resolver that ignored the input entirely and wrote everything to
// the default would pass every assertion — the vacuous-fixture trap root
// CLAUDE.md describes. `LOC_OTHER` is the caller's and is NOT the default, so a
// hardcoded default is visible. `LOC_STRANGER` belongs to another account, so
// an unscoped location lookup is visible too.
//
// TWO USERS, and THREE log ids: one row the caller's, one row the STRANGER's,
// and an id no row holds. This is the single most important property of the
// file. With a one-user fixture, "the row this account owns" and "the row that
// exists" give the same answer, so a resolver with no ownership check at all
// would pass everything. `LOG_THEIRS` is what makes the guard distinguishable
// from no guard, and `LOG_FREE` is what keeps a legitimate new row provable.
//
// The stranger's log is stored at LOC_STRANGER, but every payload that NAMES
// its id carries `locationId: LOC_OTHER`. See the "Two guards" block at the
// head of this file: if a payload named LOC_STRANGER instead,
// `resolveLogLocations` would throw first and these tests would pass with the
// log-id guard deleted.

const USER = 'user_import_log_own_test'
const STRANGER = 'user_stranger'

const LOC_DEFAULT = 'loc_kitchen' // USER's default
const LOC_OTHER = 'loc_garage' // USER's, NOT default
const LOC_STRANGER = 'loc_theirs' // STRANGER's — must be refused

const ITEM = 'item_milk' // USER's

const LOG_MINE = 'log_mine' // USER's, at LOC_OTHER
const LOG_THEIRS = 'log_theirs' // STRANGER's, at LOC_STRANGER — must be refused
const LOG_FREE = 'log_free' // no log row holds it

const TS = new Date('2026-01-01T00:00:00.000Z')
const STORED_OCCURRED = new Date('2026-02-01T00:00:00.000Z')
const PAYLOAD_OCCURRED = '2026-03-01T10:00:00.000Z'

beforeEach(() => {
  // `resetAllMocks`, not `clearAllMocks`. `clearAllMocks` empties the call
  // lists but LEAVES A QUEUED `mockImplementationOnce` in place, so a
  // `simulateGuardMiss` the test under it never reached would fire inside the
  // NEXT test instead — task 6 measured exactly that and recorded it in
  // `import-ownership-cart.resolver.test.ts`. Since Vitest 2, `mockReset`
  // restores the implementation handed to `vi.fn(impl)`, so the two wrapped
  // delegates keep the fakes' real row matching.
  vi.resetAllMocks()

  mockPrisma.$stockFake.reset([
    { id: LOC_OTHER, userId: USER, isDefault: false, name: 'Garage', order: 1, createdAt: TS, updatedAt: TS },
    { id: LOC_DEFAULT, userId: USER, isDefault: true, name: 'Kitchen', order: 0, createdAt: TS, updatedAt: TS },
    { id: LOC_STRANGER, userId: STRANGER, isDefault: true, name: 'Theirs', order: 0, createdAt: TS, updatedAt: TS },
  ])

  mockPrisma.$log.reset([
    {
      id: LOG_MINE,
      userId: USER,
      itemId: ITEM,
      locationId: LOC_OTHER,
      delta: 1,
      quantity: 1,
      occurredAt: STORED_OCCURRED,
      note: null,
    },
    {
      id: LOG_THEIRS,
      userId: STRANGER,
      itemId: ITEM,
      locationId: LOC_STRANGER,
      delta: 7,
      quantity: 7,
      occurredAt: STORED_OCCURRED,
      note: 'theirs',
    },
  ])

  mockPrisma.$item.reset([{ id: ITEM, userId: USER, name: 'Milk' }])
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONTEXT: Context = { userId: USER }

async function exec(query: string, logs: Record<string, unknown>[]) {
  const response = await server.executeOperation(
    { query, variables: { logs } },
    { contextValue: CONTEXT },
  )
  if (response.body.kind !== 'single') throw new Error('expected a single result')
  return response.body.singleResult
}

/** The `code` of the first GraphQL error, or `undefined` when there was none. */
function errorCode(result: Awaited<ReturnType<typeof exec>>) {
  return result.errors?.[0]?.extensions?.code
}

function storedLog(id: string) {
  return mockPrisma.$log.state.rows.find((r) => r.id === id)
}

/**
 * Make the guard's ONE unscoped lookup answer "nobody holds this id", so the
 * payload's stranger id reaches the write.
 *
 * Why this exists. The test "user re-importing their own log keeps its owner"
 * CANNOT catch a `userId` left in the `update` payload: the row is already the
 * caller's, so writing `USER` over `USER` changes nothing. Tasks 4, 5 and 6 all
 * measured that and all recorded it. So the `userId`-out-of-`update` half of
 * this fix needs a case where the upsert really reaches a row that is NOT the
 * caller's — which the guard, working correctly, makes unreachable through
 * GraphQL.
 *
 * Stubbing `findUnique` for one call simulates exactly the case that half is
 * defence against: a future edit drops the guard, or the guard's lookup misses
 * the row. It leaves the stored rows legal — one row per id, one owner each. It
 * depends on `requireOwnRowOrUnclaimed` reading `findUnique` BEFORE
 * `findFirst`; if that order ever changes, this helper stops working and the
 * tests using it go red rather than silently passing.
 *
 * It reaches the UPSERT path only. On the create path a guard miss cannot get
 * as far: `inventoryLog.create` hits the stranger's row as a duplicate primary
 * key and `ownedRowFake` raises P2002 first.
 *
 * What these tests do NOT prove: that the guard refuses the stranger's id. That
 * is what the FORBIDDEN tests prove, and here the simulated miss lets a real
 * write reach the stranger's row — which is the point.
 */
function simulateGuardMiss(delegate: { findUnique: ReturnType<typeof vi.fn> }) {
  delegate.findUnique.mockImplementationOnce(async () => null)
}

// ─── Queries ─────────────────────────────────────────────────────────────────

const LOG_FIELDS = '{ id itemId locationId quantity }'
const CREATE_LOGS = `mutation ($logs: [InventoryLogInput!]!) { bulkCreateInventoryLogs(logs: $logs) ${LOG_FIELDS} }`
const UPSERT_LOGS = `mutation ($logs: [InventoryLogInput!]!) { bulkUpsertInventoryLogs(logs: $logs) ${LOG_FIELDS} }`

// ─── Input builder ───────────────────────────────────────────────────────────
//
// `locationId` defaults to LOC_OTHER — a location the CALLER owns — so
// `resolveLogLocations` passes every payload below unless a test overrides it
// on purpose. See the "Two guards" block at the head of the file.

const logIn = (
  id: string,
  extra: { locationId?: string; quantity?: number; delta?: number } = {},
) => ({
  id,
  itemId: ITEM,
  delta: extra.delta ?? 1,
  quantity: extra.quantity ?? 1,
  occurredAt: PAYLOAD_OCCURRED,
  locationId: extra.locationId ?? LOC_OTHER,
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InventoryLog ownership', () => {
  it("user cannot import a log under an id another account's row holds", async () => {
    // Given a payload naming the STRANGER's log id, under a location the CALLER
    // owns, so the location guard refuses nothing — only the log-id guard can
    // stop it.
    const payload = [logIn(LOG_THEIRS, { quantity: 99 })]

    // When the create-path import runs
    const result = await exec(CREATE_LOGS, payload)

    // Then it is refused, and the stranger's row is untouched. Before the guard
    // this returned `[]` with NO error: the unscoped `findUnique` found the
    // stranger's row and the caller's own log was silently dropped.
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$log.state.rows).toHaveLength(2)
    expect(storedLog(LOG_THEIRS)).toMatchObject({
      userId: STRANGER,
      locationId: LOC_STRANGER,
      quantity: 7,
      note: 'theirs',
    })
  })

  it("user cannot take over another account's inventory log", async () => {
    // Given the same payload on the upsert path, which before the guard
    // overwrote the stranger's row AND reassigned it to the caller
    const payload = [logIn(LOG_THEIRS, { quantity: 99 })]

    // When the upsert-path import runs
    const result = await exec(UPSERT_LOGS, payload)

    // Then it is refused and the stranger keeps their row, every column of it
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$log.state.rows).toHaveLength(2)
    expect(storedLog(LOG_THEIRS)).toMatchObject({
      userId: STRANGER,
      locationId: LOC_STRANGER,
      quantity: 7,
      occurredAt: STORED_OCCURRED,
      note: 'theirs',
    })
  })

  it('user re-importing their own log keeps its owner', async () => {
    // Given a payload naming the caller's OWN log id with a new quantity
    const payload = [logIn(LOG_MINE, { quantity: 5 })]

    // When the upsert-path import runs
    const result = await exec(UPSERT_LOGS, payload)

    // Then the quantity is replaced and the owner is unchanged.
    //
    // The owner assertion here is a NEGATIVE CONTROL, not coverage. The row is
    // already the caller's, so putting `userId` back into the `update` payload
    // writes `USER` over `USER` and this test stays green. Measured on
    // 2026-10-28, the same way tasks 4, 5 and 6 measured it. The test that DOES
    // catch a `userId` in `update` is "does not reassign a row's owner even
    // when the guard misses it" below.
    expect(result.errors).toBeUndefined()
    expect(storedLog(LOG_MINE)).toMatchObject({
      userId: USER,
      locationId: LOC_OTHER,
      quantity: 5,
      occurredAt: new Date(PAYLOAD_OCCURRED),
    })
  })

  it('user importing a batch with one forbidden log gets no logs written at all', async () => {
    // Given an ALLOWED row placed AHEAD of the forbidden one. The order is the
    // test: if the guard ran inside the write loop, the first row would be on
    // disk before the second was refused, and these resolvers are not
    // transactional so nothing would roll it back.
    const payload = [logIn(LOG_FREE), logIn(LOG_THEIRS)]

    // When the create-path import runs
    const result = await exec(CREATE_LOGS, payload)

    // Then nothing was written — the allowed row is absent too
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.$log.state.rows.map((r) => r.id).sort()).toEqual(
      [LOG_MINE, LOG_THEIRS].sort(),
    )
  })

  it("bulkUpsertInventoryLogs does not reassign a row's owner even when the guard misses it", async () => {
    // Given the guard's lookup misses the stranger's row, so the upsert really
    // reaches it. This is the case `userId` being OUT of the `update` payload
    // is defence against: a future edit that drops the guard must not be able
    // to hand another account's log to the importer.
    simulateGuardMiss(mockPrisma.inventoryLog)

    // When the caller upserts under the stranger's id
    const result = await exec(UPSERT_LOGS, [logIn(LOG_THEIRS, { quantity: 99 })])

    // Then the row is still the STRANGER's, and it has not MOVED either —
    // `locationId` is out of `update` too. This is what goes red if `userId`
    // creeps back in.
    //
    // The mutation itself succeeds: these two resolvers have no closing read to
    // refuse, which is why the guard is the only thing standing here.
    expect(result.errors).toBeUndefined()
    expect(storedLog(LOG_THEIRS)?.userId).toBe(STRANGER)
    expect(storedLog(LOG_THEIRS)?.locationId).toBe(LOC_STRANGER)
    // The other columns DID follow the payload, which is what proves the
    // upsert really reached the row rather than being refused somewhere else.
    expect(storedLog(LOG_THEIRS)?.quantity).toBe(99)
  })

  it("user importing a log that names a stranger's location is refused before the log-id guard runs", async () => {
    // Given a log id no row holds, naming the STRANGER's location. Both guards
    // answer FORBIDDEN with the same message, so the error alone cannot say
    // which one fired. Counting the log-id guard's own lookup can.
    const payload = [logIn(LOG_FREE, { locationId: LOC_STRANGER })]

    // When the create-path import runs
    const result = await exec(CREATE_LOGS, payload)

    // Then it is refused, and the log-id guard never ran: the location check
    // threw first. That ORDER is what keeps the 9 tests in
    // `import-inventoryLog-location.resolver.test.ts` asserting the error they
    // assert. Move `requireOwnRowIdsOrUnclaimed` above `resolveLogLocations`
    // and this goes red.
    expect(errorCode(result)).toBe('FORBIDDEN')
    expect(mockPrisma.inventoryLog.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.$log.state.rows).toHaveLength(2)
  })

  it('user re-importing a log they already own on the create path skips it instead of failing', async () => {
    // Given the caller's OWN log id on the CREATE path, with a new quantity.
    // The create path must skip a row it already holds rather than raise P2002.
    // The per-row `findUnique` this used to do was unscoped; the skip now comes
    // from the guard's returned `ownIds` set.
    const payload = [logIn(LOG_MINE, { quantity: 42 })]

    // When the create-path import runs
    const result = await exec(CREATE_LOGS, payload)

    // Then nothing is returned, nothing is written, and the stored quantity is
    // the one that was already there — "skip conflicts" means skip, and no
    // P2002 escapes.
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateInventoryLogs).toEqual([])
    expect(mockPrisma.$log.state.rows).toHaveLength(2)
    expect(storedLog(LOG_MINE)?.quantity).toBe(1)
  })

  it('user importing a log under a free id gets it written at the location the payload names', async () => {
    // Given an id no row holds. A guard that refused everything would pass
    // every test above, so this is what keeps a legitimate import provable.
    const payload = [logIn(LOG_FREE, { quantity: 3 })]

    // When the create-path import runs
    const result = await exec(CREATE_LOGS, payload)

    // Then the row is written, owned by the caller, at the NON-default location
    // the payload named
    expect(result.errors).toBeUndefined()
    expect(storedLog(LOG_FREE)).toMatchObject({
      userId: USER,
      locationId: LOC_OTHER,
      quantity: 3,
    })
    expect(storedLog(LOG_FREE)?.locationId).not.toBe(LOC_DEFAULT)
  })
})
