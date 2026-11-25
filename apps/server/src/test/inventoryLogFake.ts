// A stateful Prisma double for `inventoryLog`.
//
// ── WHY IT EXISTS ──
//
// Before PR 3a Task 2, inventoryLog.resolver.test.ts mocked `inventoryLog` as
// four plain `vi.fn()` call recorders. A recorder returns whatever the test
// told it to return, so it cannot tell a location-scoped query apart from an
// unscoped one: delete `locationId` from a resolver's `where` and every
// assertion still passes. Root CLAUDE.md, "Write test doubles to model the
// constraint, not the happy path".
//
// ── WHAT IT MODELS ──
//
//   - Prisma `where` semantics, key by key: `where.x === undefined ||
//     row.x === where.x`. Never a hardcoded ownership or location match. A
//     resolver that drops `locationId`, `userId` or `itemId` from its `where`
//     therefore returns MORE rows, and a fixture holding rows at two
//     locations sees the difference.
//   - `delta: { gt: n }`, the filter `lastPurchaseDates` uses to skip
//     consumption logs and find purchases.
//   - `logKey`, `OR` and `NOT`, with SQL's NULL rules (design 2026-11-25,
//     inventory log layout). `lastPurchaseDates` skips stock count rows with
//     `OR: [{ logKey: null }, { logKey: { not: 'stockCount' } }]`. In SQL,
//     `logKey <> 'x'` and `NOT (logKey = 'x')` are both NULL for a NULL
//     column, so the row is NOT returned. This fake does the same, so a
//     resolver that drops the `logKey: null` branch, or uses `NOT` instead of
//     the `OR`, loses the old NULL-key purchase rows here too.
//   - `orderBy: { occurredAt: 'asc' | 'desc' }`, so "most recent" is a real
//     sort rather than the order the fixture happened to be seeded in.
//   - `create` stores the row, so a write can be read back through the same
//     `where` the read path uses. That is what makes "addInventoryLog wrote it
//     at the location I named" testable. It KEEPS `data.id` when the caller
//     supplies one and invents a sequential id otherwise: `addInventoryLog`
//     supplies none, while the bulk import mutations must preserve the
//     payload's original ids.
//   - `findUnique` and `upsert` by id, which is how the bulk import mutations
//     decide between skipping, inserting and replacing a row. `upsert` keeps
//     `create` and `update` separate, so a resolver that wrongly carried
//     `locationId` into `update` would be visible as a MOVED row.
//
// ── WHAT IT DOES NOT MODEL ──
//
// Transactions, cascades, and `logParams` JSON coercion. Also NULL ordering:
// Postgres puts NULLs last under ASC, while this fake sorts a null
// `occurredAt` as epoch 0, which is first. No test here seeds more than one
// row with a null `occurredAt`, so no assertion depends on the difference —
// but a future test that does must not trust this fake for ordering.

import { checkWhere, type WhereSpec } from './whereKeys.js'

export interface FakeInventoryLog {
  id: string
  itemId: string
  userId: string
  locationId: string
  // Nullable because legacy cloud rows predating the delta/quantity columns
  // carry NULL, and the resolver's field resolvers coalesce them.
  delta: number | null
  quantity: number | null
  occurredAt: Date | null
  note: string | null
  logKey?: string | null
  logParams?: Record<string, unknown> | null
}

type Where = Record<string, unknown>

type NumberFilter = { gt?: number; gte?: number; lt?: number; lte?: number }

function matchesNumber(value: number | null, filter: unknown): boolean {
  if (filter === undefined) return true
  if (typeof filter === 'number') return value === filter
  const f = filter as NumberFilter
  if (value == null) return false
  if (f.gt !== undefined && !(value > f.gt)) return false
  if (f.gte !== undefined && !(value >= f.gte)) return false
  if (f.lt !== undefined && !(value < f.lt)) return false
  if (f.lte !== undefined && !(value <= f.lte)) return false
  return true
}

// Every key `matchesLog` models, and how. A key outside this spec, or a value
// shape its kind does not allow, THROWS. `checkLogWhere` runs ONCE per client
// call, before the store is searched — never inside `matchesLog`, which an
// empty store never calls. See `whereKeys.ts`.
const LOG_WHERE: WhereSpec = {
  id: 'equals',
  itemId: 'equals',
  userId: 'equals',
  // A string, or `{ in: [...] }`. `inventoryLogs` reads the logs of every
  // location the caller holds a role on (households H3a, task 3.8).
  locationId: 'in',
  delta: 'number',
  quantity: 'number',
  logKey: 'nullableNot',
  OR: { or: { logKey: 'nullableNot' } },
  // `NOT: { logKey: 'x' }` only. Modelled so the mutation check "use NOT
  // instead of the OR" fails here the way it fails in SQL.
  NOT: { nested: { logKey: 'equals' } },
}

function checkLogWhere(where: Where | undefined): void {
  checkWhere('inventoryLogFake(inventoryLog)', where, LOG_WHERE)
}

function matchesLog(row: FakeInventoryLog, where: Where): boolean {
  // `undefined ||` on every key, on purpose: this is Prisma's semantics, and
  // it is what makes dropping a key from a resolver's `where` visible.
  if (where.id !== undefined && row.id !== where.id) return false
  if (where.itemId !== undefined && row.itemId !== where.itemId) return false
  if (where.userId !== undefined && row.userId !== where.userId) return false
  if (where.locationId !== undefined) {
    // A string, or `{ in: [...] }`. `checkLogWhere` refused every other shape.
    const ids =
      typeof where.locationId === 'string'
        ? [where.locationId]
        : (where.locationId as { in: string[] }).in
    if (!ids.includes(row.locationId)) return false
  }
  if (!matchesNumber(row.delta, where.delta)) return false
  if (!matchesNumber(row.quantity, where.quantity)) return false
  if (where.logKey !== undefined && !matchesLogKey(row.logKey ?? null, where.logKey)) {
    return false
  }
  if (where.OR !== undefined) {
    const branches = where.OR as Where[]
    if (!branches.some((branch) => matchesLog(row, branch))) return false
  }
  if (where.NOT !== undefined) {
    // SQL: `NOT (logKey = 'x')` is NULL, so false, when `logKey` is NULL.
    const key = row.logKey ?? null
    const not = (where.NOT as { logKey: string }).logKey
    if (key === null || key === not) return false
  }
  return true
}

// `null` = IS NULL; a string = equal; `{ not: s }` = `<> s`, which is never
// true for a NULL column (SQL three-valued logic).
function matchesLogKey(value: string | null, filter: unknown): boolean {
  if (filter === null) return value === null
  if (typeof filter === 'string') return value === filter
  const not = (filter as { not: string }).not
  return value !== null && value !== not
}

function sortRows(
  rows: FakeInventoryLog[],
  orderBy?: { occurredAt?: 'asc' | 'desc' },
): FakeInventoryLog[] {
  const dir = orderBy?.occurredAt
  if (!dir) return rows
  const time = (r: FakeInventoryLog) => (r.occurredAt ? r.occurredAt.getTime() : 0)
  return [...rows].sort((a, b) => (dir === 'asc' ? time(a) - time(b) : time(b) - time(a)))
}

export function makeInventoryLog(
  over: Partial<FakeInventoryLog> &
    Pick<FakeInventoryLog, 'id' | 'itemId' | 'userId' | 'locationId'>,
): FakeInventoryLog {
  return {
    delta: 1,
    quantity: 1,
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    note: null,
    ...over,
  }
}

// Every read and write returns a COPY of the stored row (`structuredClone`, so
// `occurredAt` and `logParams` are copied too), never the stored object.
// Prisma returns a new object for every call. Until 2026-11-15 this fake
// returned the live row, the same flaw `stockFake` had.
function copy<T>(row: T): T {
  return structuredClone(row)
}

export function createInventoryLogFake() {
  const state: { logs: FakeInventoryLog[] } = { logs: [] }
  let seq = 0

  // Hoisted out of the `client` literal so `upsert` can reuse it: a reference
  // to `client.create` from inside `client`'s own initializer makes TypeScript
  // infer `client` as `any`.
  function insert(data: Record<string, unknown>): FakeInventoryLog {
    const row: FakeInventoryLog = {
      id: (data.id as string | undefined) ?? `log-${++seq}`,
      itemId: data.itemId as string,
      userId: data.userId as string,
      locationId: data.locationId as string,
      delta: (data.delta as number | null) ?? null,
      quantity: (data.quantity as number | null) ?? null,
      occurredAt: (data.occurredAt as Date | null) ?? null,
      note: (data.note as string | null) ?? null,
      logKey: (data.logKey as string | null) ?? null,
      logParams: (data.logParams as Record<string, unknown> | null) ?? null,
    }
    state.logs.push(row)
    return row
  }

  const client = {
    findMany: async ({
      where = {},
      orderBy,
    }: { where?: Where; orderBy?: { occurredAt?: 'asc' | 'desc' } } = {}) => {
      checkLogWhere(where)
      return sortRows(
        state.logs.filter((l) => matchesLog(l, where)),
        orderBy,
      ).map(copy)
    },
    findFirst: async ({
      where = {},
      orderBy,
    }: { where?: Where; orderBy?: { occurredAt?: 'asc' | 'desc' } } = {}) => {
      checkLogWhere(where)
      const row = sortRows(
        state.logs.filter((l) => matchesLog(l, where)),
        orderBy,
      )[0]
      return row ? copy(row) : null
    },
    count: async ({ where = {} }: { where?: Where } = {}) => {
      checkLogWhere(where)
      return state.logs.filter((l) => matchesLog(l, where)).length
    },
    findUnique: async ({ where = {} }: { where?: Where } = {}) => {
      checkLogWhere(where)
      const row = state.logs.find((l) => matchesLog(l, where))
      return row ? copy(row) : null
    },
    create: async ({ data }: { data: Record<string, unknown> }) => copy(insert(data)),
    upsert: async ({
      where = {},
      create,
      update,
    }: {
      where?: Where
      create: Record<string, unknown>
      update: Record<string, unknown>
    }) => {
      checkLogWhere(where)
      const existing = state.logs.find((l) => matchesLog(l, where))
      if (!existing) return copy(insert(create))
      // Only the keys `update` actually carries are applied — Prisma's own
      // semantics, and the reason a stray `locationId` in `update` shows up
      // here as a row that changed location.
      for (const [key, value] of Object.entries(update)) {
        if (value === undefined) continue
        ;(existing as unknown as Record<string, unknown>)[key] = value
      }
      return copy(existing)
    },
    // `removeItemFromLocation` deletes one item's logs at one location
    // (itemStock.resolver.ts). Returns the count, as Prisma does.
    deleteMany: async ({ where = {} }: { where?: Where } = {}) => {
      checkLogWhere(where)
      const before = state.logs.length
      state.logs = state.logs.filter((l) => !matchesLog(l, where))
      return { count: before - state.logs.length }
    },
  }

  function reset(logs: FakeInventoryLog[] = []) {
    state.logs = logs
    seq = 0
  }

  return { state, client, reset }
}

export type InventoryLogFake = ReturnType<typeof createInventoryLogFake>
