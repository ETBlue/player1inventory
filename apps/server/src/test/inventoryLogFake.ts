// A stateful Prisma double for `inventoryLog`.
//
// NOT a test file, so `tsc` type-checks it — the same reasoning stockFake.ts
// records.
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
//   - `orderBy: { occurredAt: 'asc' | 'desc' }`, so "most recent" is a real
//     sort rather than the order the fixture happened to be seeded in.
//   - `create` assigns an id and stores the row, so a write can be read back
//     through the same `where` the read path uses. That is what makes
//     "addInventoryLog wrote it at the location I named" testable.
//
// ── WHAT IT DOES NOT MODEL ──
//
// Transactions, cascades, and `logParams` JSON coercion. Also NULL ordering:
// Postgres puts NULLs last under ASC, while this fake sorts a null
// `occurredAt` as epoch 0, which is first. No test here seeds more than one
// row with a null `occurredAt`, so no assertion depends on the difference —
// but a future test that does must not trust this fake for ordering.

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

function matchesLog(row: FakeInventoryLog, where: Where): boolean {
  // `undefined ||` on every key, on purpose: this is Prisma's semantics, and
  // it is what makes dropping a key from a resolver's `where` visible.
  if (where.id !== undefined && row.id !== where.id) return false
  if (where.itemId !== undefined && row.itemId !== where.itemId) return false
  if (where.userId !== undefined && row.userId !== where.userId) return false
  if (where.locationId !== undefined && row.locationId !== where.locationId) return false
  if (!matchesNumber(row.delta, where.delta)) return false
  if (!matchesNumber(row.quantity, where.quantity)) return false
  return true
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

export function createInventoryLogFake() {
  const state: { logs: FakeInventoryLog[] } = { logs: [] }
  let seq = 0

  const client = {
    findMany: async ({
      where = {},
      orderBy,
    }: { where?: Where; orderBy?: { occurredAt?: 'asc' | 'desc' } } = {}) =>
      sortRows(
        state.logs.filter((l) => matchesLog(l, where)),
        orderBy,
      ),
    findFirst: async ({
      where = {},
      orderBy,
    }: { where?: Where; orderBy?: { occurredAt?: 'asc' | 'desc' } } = {}) =>
      sortRows(
        state.logs.filter((l) => matchesLog(l, where)),
        orderBy,
      )[0] ?? null,
    count: async ({ where = {} }: { where?: Where } = {}) =>
      state.logs.filter((l) => matchesLog(l, where)).length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row: FakeInventoryLog = {
        id: `log-${++seq}`,
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
    },
  }

  function reset(logs: FakeInventoryLog[] = []) {
    state.logs = logs
    seq = 0
  }

  return { state, client, reset }
}

export type InventoryLogFake = ReturnType<typeof createInventoryLogFake>
