// A stateful Prisma double for `location` + `itemStock`, shared by the resolver
// specs that exercise PR 2's dual-write (cart, recipe, item).
//
// NOT a test file, so `tsc` type-checks it — the same reasoning
// `apps/web/src/test/cloudFixtures.ts` records for the web fixtures.
//
// It exists to model CONSTRAINTS, not the happy path (root CLAUDE.md → "Write
// test doubles to model the constraint, not the happy path"):
//
//   - `@@unique([itemId, locationId])` is enforced. A duplicate `create` throws
//     the way real Postgres raises P2002. NOTE, because it would be easy to
//     over-claim: no resolver reaches this today — `mirrorStock` upserts and
//     `upsertItemStock` checks `findUnique` first — so making this dedupe
//     instead of throw leaves every resolver spec green (verified 2026-08-31).
//     It guards a FUTURE writer that creates unconditionally, and because an
//     unreachable guard invites deletion as dead code it is pinned directly by
//     `stockFake.test.ts` rather than left resting on a claim.
//   - `findFirst` / `findUnique` model Prisma's own `where` semantics
//     (`where.x === undefined || row.x === where.x`), never a hardcoded
//     ownership or default-flag match. A fake that hardcoded
//     `l.userId === where.userId` would keep a scoping test green after the
//     resolver dropped the scope.
//   - `{ increment: n }` is applied as an increment. A resolver that assigned
//     the value instead is therefore distinguishable, which is the point of
//     checkout using the atomic form.
//
// What it deliberately does NOT model: transactions. `$transaction` is absent
// rather than faked as a pass-through, so no test here can make an atomicity
// claim it has not earned — and the dual-write is not transactional anyway
// (see lib/stockDualWrite.ts).

export interface FakeLocation {
  id: string
  userId: string
  isDefault: boolean
}

export interface FakeStock {
  id: string
  itemId: string
  locationId: string
  targetQuantity: number
  refillThreshold: number
  packedQuantity: number
  unpackedQuantity: number
  dueDate: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface StockFakeState {
  locations: FakeLocation[]
  itemStocks: FakeStock[]
}

type Where = Record<string, unknown>

// Prisma's P2002. The message shape matters only so a surprised reader can see
// what blew up; tests match on the `code`.
export class UniqueConstraintError extends Error {
  code = 'P2002'
  constructor(itemId: string, locationId: string) {
    super(
      `Unique constraint failed on the fields: (\`itemId\`,\`locationId\`) — (${itemId}, ${locationId})`,
    )
  }
}

function matchesLocation(row: FakeLocation, where: Where): boolean {
  // `undefined ||` on every key, deliberately: this is Prisma's semantics, and
  // it is what makes dropping a key from a resolver's where clause visible.
  if (where.id !== undefined && row.id !== where.id) return false
  if (where.userId !== undefined && row.userId !== where.userId) return false
  if (where.isDefault !== undefined && row.isDefault !== where.isDefault) return false
  return true
}

function matchesStock(row: FakeStock, where: Where): boolean {
  if (where.id !== undefined && row.id !== where.id) return false
  if (where.itemId !== undefined && row.itemId !== where.itemId) return false
  if (where.locationId !== undefined && row.locationId !== where.locationId) return false
  const compound = where.itemId_locationId as
    | { itemId: string; locationId: string }
    | undefined
  if (
    compound &&
    (row.itemId !== compound.itemId || row.locationId !== compound.locationId)
  ) {
    return false
  }
  return true
}

type NumberWrite = number | { increment: number }

function applyNumber(current: number, next: NumberWrite | undefined): number {
  if (next === undefined) return current
  return typeof next === 'number' ? next : current + next.increment
}

export function makeStock(
  over: Partial<FakeStock> & Pick<FakeStock, 'id' | 'itemId' | 'locationId'>,
): FakeStock {
  return {
    targetQuantity: 0,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    dueDate: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  }
}

export function createStockFake() {
  const state: StockFakeState = { locations: [], itemStocks: [] }
  let seq = 0

  function applyUpdate(row: FakeStock, data: Record<string, unknown>): FakeStock {
    row.packedQuantity = applyNumber(row.packedQuantity, data.packedQuantity as NumberWrite)
    row.unpackedQuantity = applyNumber(
      row.unpackedQuantity,
      data.unpackedQuantity as NumberWrite,
    )
    row.targetQuantity = applyNumber(row.targetQuantity, data.targetQuantity as NumberWrite)
    row.refillThreshold = applyNumber(
      row.refillThreshold,
      data.refillThreshold as NumberWrite,
    )
    if ('dueDate' in data) row.dueDate = (data.dueDate as Date | null) ?? null
    row.updatedAt = new Date()
    return row
  }

  function insert(data: Record<string, unknown>): FakeStock {
    const itemId = data.itemId as string
    const locationId = data.locationId as string
    if (state.itemStocks.some((s) => s.itemId === itemId && s.locationId === locationId)) {
      throw new UniqueConstraintError(itemId, locationId)
    }
    const row = makeStock({
      id: `stock-${++seq}`,
      itemId,
      locationId,
      targetQuantity: (data.targetQuantity as number) ?? 0,
      refillThreshold: (data.refillThreshold as number) ?? 0,
      packedQuantity: (data.packedQuantity as number) ?? 0,
      unpackedQuantity: (data.unpackedQuantity as number) ?? 0,
      dueDate: (data.dueDate as Date | null) ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    state.itemStocks.push(row)
    return row
  }

  const client = {
    location: {
      findFirst: async ({ where = {} }: { where?: Where } = {}) =>
        state.locations.find((l) => matchesLocation(l, where)) ?? null,
      findMany: async ({ where = {} }: { where?: Where } = {}) =>
        state.locations.filter((l) => matchesLocation(l, where)),
    },
    itemStock: {
      findUnique: async ({ where }: { where: Where }) =>
        state.itemStocks.find((s) => matchesStock(s, where)) ?? null,
      findFirst: async ({ where = {} }: { where?: Where } = {}) =>
        state.itemStocks.find((s) => matchesStock(s, where)) ?? null,
      findMany: async ({ where = {} }: { where?: Where } = {}) =>
        state.itemStocks.filter((s) => matchesStock(s, where)),
      create: async ({ data }: { data: Record<string, unknown> }) => insert(data),
      update: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        const row = state.itemStocks.find((s) => matchesStock(s, where))
        if (!row) throw new Error('ItemStock not found')
        return applyUpdate(row, data)
      },
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: Where
        update: Record<string, unknown>
        create: Record<string, unknown>
      }) => {
        const row = state.itemStocks.find((s) => matchesStock(s, where))
        return row ? applyUpdate(row, update) : insert(create)
      },
      deleteMany: async ({ where = {} }: { where?: Where } = {}) => {
        const before = state.itemStocks.length
        state.itemStocks = state.itemStocks.filter((s) => !matchesStock(s, where))
        return { count: before - state.itemStocks.length }
      },
    },
  }

  function reset(locations: FakeLocation[] = [], itemStocks: FakeStock[] = []) {
    state.locations = locations
    state.itemStocks = itemStocks
    seq = 0
  }

  return { state, client, reset }
}

export type StockFake = ReturnType<typeof createStockFake>
