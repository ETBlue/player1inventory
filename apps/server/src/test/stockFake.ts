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
//   - `location.create` enforces the partial unique index PR 1's migration
//     adds — CREATE UNIQUE INDEX ON "Location" ("userId") WHERE "isDefault".
//     A second default for the same user throws P2002, the way Postgres does.
//     `ensureDefaultLocation` (lib/defaultLocation.ts) depends on that: it
//     catches P2002 and re-reads the winner. A fake that accepted the duplicate
//     would leave that path untested, and a fake with no `create` at all would
//     make "creates the default when the user has none" impossible to write.
//   - `findFirst` / `findUnique` model Prisma's own `where` semantics
//     (`where.x === undefined || row.x === where.x`), never a hardcoded
//     ownership or default-flag match. A fake that hardcoded
//     `l.userId === where.userId` would keep a scoping test green after the
//     resolver dropped the scope.
//   - `{ increment: n }` is applied as an increment. A resolver that assigned
//     the value instead is therefore distinguishable, which is the point of
//     checkout using the atomic form.
//
// TRANSACTIONS, added in PR 3c. `$transaction` used to be absent on purpose,
// so no test here could make an atomicity claim it had not earned. PR 3c's
// `applyUnitSwitch` earns it: that resolver writes an Item, N ItemStock rows
// and M recipes, and a half-applied switch leaves the item in mixed units with
// no error anywhere. See `$transaction` below for what is and is not modelled.
//
// The dual-write itself is still NOT transactional (see lib/stockDualWrite.ts).
// Adding `$transaction` here does not change that.

export interface FakeLocation {
  id: string
  userId: string
  isDefault: boolean
  // Only the rows the fake CREATES carry these. Fixtures may leave them out.
  name?: string
  order?: number
  // A real Prisma `Location` row always has these, and `location.resolver.ts`'s
  // `toGraphQL` calls `.toISOString()` on both. A fake row without them makes
  // the `locations` query throw `Cannot read properties of undefined`, which
  // looks like a resolver bug and is not one. Created rows carry them; fixture
  // rows may still leave them out, since no assertion reads them.
  createdAt?: Date
  updatedAt?: Date
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

// An in-memory store `$transaction` snapshots and restores. The fake's own
// `state` is always one. A test file that mocks `prisma` with MORE models than
// this fake covers (item, recipe, ...) registers its own store through
// `configureTransaction`, so one rollback covers every model the resolver
// touched rather than only the two this file owns.
//
// Every own enumerable property is deep-copied, so a store must hold plain
// data only — arrays, objects, numbers, strings, `Date`, `null`. A function or
// a class instance in a store makes `structuredClone` throw.
export type RollbackStore = Record<string, unknown>

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

// P2002 from the partial unique index on ("userId") WHERE "isDefault" — the
// error a user's SECOND default location raises.
export class DefaultLocationConstraintError extends Error {
  code = 'P2002'
  constructor(userId: string) {
    super(`Unique constraint failed on the fields: (\`userId\`) — (${userId})`)
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

/**
 * The interactive (callback) form of `prisma.$transaction`, WITH rollback.
 *
 * Runs the callback, keeps every write if it returns, and restores the state
 * each store held when the transaction opened if it throws. That is what
 * Postgres does, and — the reason this exists — it is what a resolver
 * rewritten as a sequence of plain `prisma.X` calls would NOT do. So a test
 * that writes, throws, and asserts nothing changed can only pass when the
 * resolver really opened a transaction.
 *
 * ONLY the callback form is modelled. The array form,
 * `prisma.$transaction([p1, p2])`, throws here on purpose: by the time
 * `$transaction` is called, JavaScript has already evaluated the array, so a
 * fake's writes have ALREADY landed. A snapshot taken at that moment is the
 * state AFTER those writes, and restoring it would report a rollback that
 * did not happen — worse than not modelling the form at all.
 * `purge.resolver.test.ts:131` and `import.resolver.test.ts:511` record the
 * same evaluation-order fact for their own mocks. Four resolvers use the
 * array form today (import, purge, location, index.ts) and none of them is
 * tested through this fake.
 *
 * The snapshot is a DEEP copy (`structuredClone`). A shallow copy would
 * restore each array but share the row objects inside it, so
 * `row.packedQuantity = 8` inside a failed transaction would survive the
 * rollback and the fake would report an atomicity it never had.
 *
 * After a rollback, read rows back out of the store. The restored rows are
 * fresh copies, so a row reference captured BEFORE the transaction still holds
 * the rolled-back values.
 *
 * Exported on its own so a test file with its OWN hand-written prisma mock —
 * `itemStock.resolver.test.ts` is one — gets the same rollback without a
 * second copy of it. A second copy could silently do nothing, and then every
 * atomicity test resting on it would report as covered.
 *
 * @param stores every in-memory store the callback may write into
 * @param txClient what the callback receives as `tx`
 */
export async function runInTransaction(
  stores: RollbackStore[],
  txClient: unknown,
  arg: unknown,
): Promise<unknown> {
  if (typeof arg !== 'function') {
    throw new Error(
      'stockFake models only the interactive callback form of $transaction. ' +
        'The array form cannot be rolled back here: the promises in the array ' +
        'have already run by the time $transaction is called, so a snapshot ' +
        'taken now would report a rollback that did not happen.',
    )
  }
  const before = stores.map((store) => structuredClone(store))
  try {
    return await (arg as (tx: unknown) => Promise<unknown>)(txClient)
  } catch (err) {
    stores.forEach((store, index) => {
      // Delete first, then reassign: a key ADDED during the transaction has
      // no entry in the snapshot, so a plain `Object.assign` would leave it
      // behind.
      for (const key of Object.keys(store)) delete store[key]
      Object.assign(store, before[index])
    })
    throw err
  }
}

export function createStockFake() {
  const state: StockFakeState = { locations: [], itemStocks: [] }
  let seq = 0

  // What `$transaction` hands the callback as `tx`, and which stores it rolls
  // back. Both are set by `configureTransaction`; the defaults are this fake's
  // own client and its own `state`.
  let txClient: unknown = null
  const extraStores: RollbackStore[] = []

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
    // Hoisted function declaration — defined below, next to the stores it
    // snapshots.
    $transaction,
    location: {
      findFirst: async ({ where = {} }: { where?: Where } = {}) =>
        state.locations.find((l) => matchesLocation(l, where)) ?? null,
      findMany: async ({ where = {} }: { where?: Where } = {}) =>
        state.locations.filter((l) => matchesLocation(l, where)),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const userId = data.userId as string
        const isDefault = Boolean(data.isDefault)
        if (isDefault && state.locations.some((l) => l.userId === userId && l.isDefault)) {
          throw new DefaultLocationConstraintError(userId)
        }
        const now = new Date()
        const row: FakeLocation = {
          id: `loc-${++seq}`,
          userId,
          isDefault,
          name: data.name as string,
          order: data.order as number,
          createdAt: now,
          updatedAt: now,
        }
        state.locations.push(row)
        return row
      },
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

  /**
   * Point `$transaction` at a wider mocked prisma, and at the stores that
   * client writes into.
   *
   * A test file that needs models this fake does not own (`item`, `recipe`,
   * ...) builds one merged client — `{ ...stockFake.client, item: ..., recipe:
   * ... }` — and registers it here. Without that, the callback would receive
   * only this fake's two models and every `tx.item.*` call would throw
   * `Cannot read properties of undefined`.
   *
   * `stores` are the extra in-memory stores that merged client writes into.
   * They are snapshotted and restored alongside this fake's own `state`, so
   * one rollback covers every model the resolver touched.
   *
   * Call it once, inside the same `vi.hoisted()` block that builds the merged
   * client.
   */
  function configureTransaction(options: {
    txClient?: unknown
    stores?: RollbackStore[]
  }) {
    if (options.txClient !== undefined) txClient = options.txClient
    if (options.stores) extraStores.push(...options.stores)
  }

  async function $transaction(arg: unknown): Promise<unknown> {
    return runInTransaction(
      [state as unknown as RollbackStore, ...extraStores],
      txClient ?? client,
      arg,
    )
  }

  function reset(locations: FakeLocation[] = [], itemStocks: FakeStock[] = []) {
    state.locations = locations
    state.itemStocks = itemStocks
    seq = 0
  }

  return { state, client, reset, configureTransaction }
}

export type StockFake = ReturnType<typeof createStockFake>
