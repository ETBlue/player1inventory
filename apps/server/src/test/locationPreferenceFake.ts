// A stateful Prisma double for `LocationPreference` (households H7b, task
// M.1, decision T75 of docs/global/permissions/2026-11-21-households-plan-h7.md):
// one person's own order and last visit for one location.
//
// It follows the same rules as `householdFake` and `ownedRowFake` (root
// CLAUDE.md, "Write test doubles to model the constraint, not the happy
// path"). Every rule below is pinned in `locationPreferenceFake.test.ts`.
//
// ── WHAT IT MODELS, AND WHY ──
//
//   - The COMPOSITE primary key `(userId, locationId)`. A second row with the
//     same pair raises P2002 (`LocationPreference_pkey`). `findUnique` and
//     `upsert` find a row by the compound key `userId_locationId` only, and it
//     must name both fields as plain strings.
//   - `upsert` keeps `create` and `update` apart. `update` is applied key by
//     key, and a value of `undefined` leaves the column alone (Prisma's rule).
//     So a resolver that sends `customOrder` in the wrong branch is seen.
//   - `where` is checked ONCE per call by `checkWhere` (`whereKeys.ts`),
//     before the store is searched. It takes `userId` and `locationId`, each a
//     value or `{ in: [...] }`. ANY other key throws, also on an empty store.
//     M.2 and M.3 add a key on purpose, with a test, when a resolver needs it.
//   - The foreign key from `locationId` to `Location`, as P2003, when the
//     `locations` option is given. The world passes the CURRENT location rows.
//   - NOT NULL columns with no default: `userId` and `locationId`. A create
//     without one throws. `customOrder` and `lastVisitedAt` start null.
//   - `updatedAt` (`@updatedAt`): set on create and on every update, from the
//     `now` option (default: the system clock, so a test's fake timers apply).
//   - A write that names a column the table does not have throws, as Prisma
//     refuses an unknown argument. So does an update operator such as
//     `{ increment }`, and an update that changes `userId` or `locationId`.
//   - `select` is APPLIED on the columns. A key that is not a column (a
//     relation such as `location`, or a typo) throws.
//   - Rows are returned as COPIES, as with a real database.
//   - `forgetLocations(ids)` deletes the rows of those locations. It is the
//     ON DELETE CASCADE from `Location`, which `householdWorld.ts` calls where
//     the location and household deletes are modelled.
//
// ── WHAT IT DOES NOT MODEL ──
//
//   - The foreign key from `userId` to `User`, and its ON DELETE CASCADE.
//     `User` lives in `userFake`, and nothing in the server deletes a `User`
//     row except `/e2e/cleanup`, which deletes the preference rows first
//     (`lib/e2eCleanup.ts`). Real SQL proves the cascade:
//     `assertLocationPreferences` in `scripts/verify-migration.ts`.
//   - `findFirst`, `create`, `createMany`, `update`, `updateMany`, `count`,
//     `orderBy`, `take`, `include`, and nested writes. The methods are not
//     on the client, and the options throw. Add one on purpose, with a test.
//   - `$transaction`. Pass `state` to `runInTransaction` from `stockFake.ts`.
//     The world does that. `state` holds plain data and `Date`s only.

import { checkWhere, type WhereSpec } from './whereKeys.js'

export interface LocationPreferenceRow {
  userId: string
  locationId: string
  customOrder: number | null
  lastVisitedAt: Date | null
  updatedAt: Date
}

type Where = Record<string, unknown>
type Data = Record<string, unknown>

const COLUMNS = ['userId', 'locationId', 'customOrder', 'lastVisitedAt', 'updatedAt'] as const
const KEY_COLUMNS = ['userId', 'locationId'] as const

const WHERE_SPEC: WhereSpec = { userId: 'in', locationId: 'in' }
const COMPOUND_SPEC: WhereSpec = {
  userId_locationId: { nested: { userId: 'equals', locationId: 'equals' } },
}

/** P2002: a second row with the same `(userId, locationId)`. */
export class LocationPreferenceUniqueError extends Error {
  code = 'P2002'
  constructor(userId: string, locationId: string) {
    super(
      `Unique constraint failed: LocationPreference_pkey — LocationPreference (${userId}, ${locationId})`,
    )
  }
}

/** P2003: the location the row names does not exist. */
export class LocationPreferenceForeignKeyError extends Error {
  code = 'P2003'
  constructor(locationId: string) {
    super(
      `Foreign key constraint failed on the field: \`locationId\` — LocationPreference (${locationId})`,
    )
  }
}

/** Raised for an option, a data shape or a call shape the fake does not model. */
export class LocationPreferenceUnsupportedError extends Error {
  constructor(detail: string) {
    super(
      `locationPreferenceFake does not model ${detail}. ` +
        'Add it to locationPreferenceFake.ts on purpose, with a test.',
    )
  }
}

export interface LocationPreferenceFakeOptions {
  /**
   * The location rows, read on every write: the foreign key of `locationId`.
   * Pass a function so the fake sees the CURRENT rows. Without it, the
   * foreign key is not checked.
   */
  locations?: () => readonly { id: string }[]
  /** The time `updatedAt` gets. Default: `new Date()`. */
  now?: () => Date
}

function copy<T>(row: T): T {
  return structuredClone(row)
}

function refuseUnknownOptions(method: string, args: object, allowed: readonly string[]) {
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) {
      throw new LocationPreferenceUnsupportedError(`the option '${key}' on ${method}`)
    }
  }
}

/** Every key must be a column, and every value a plain value or a `Date`. */
function checkData(method: string, data: Data) {
  for (const [key, value] of Object.entries(data)) {
    if (!(COLUMNS as readonly string[]).includes(key)) {
      throw new LocationPreferenceUnsupportedError(`the column '${key}' in ${method} (it is not a column)`)
    }
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      throw new LocationPreferenceUnsupportedError(
        `the update operator ${JSON.stringify(value)} on '${key}' in ${method}`,
      )
    }
  }
}

function matchesScalar(value: unknown, filter: unknown): boolean {
  if (typeof filter === 'object' && filter !== null) {
    return (filter as { in: unknown[] }).in.includes(value)
  }
  return value === filter
}

function matches(row: LocationPreferenceRow, where: Where | undefined): boolean {
  if (where === undefined) return true
  for (const [key, filter] of Object.entries(where)) {
    if (filter === undefined) continue
    if (!matchesScalar((row as unknown as Where)[key], filter)) return false
  }
  return true
}

function applySelect(
  row: LocationPreferenceRow,
  select: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (select === undefined) return copy(row) as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(select)) {
    if (!(COLUMNS as readonly string[]).includes(key)) {
      throw new LocationPreferenceUnsupportedError(`select.${key} (it is not a column)`)
    }
    if (value === true) out[key] = copy((row as unknown as Record<string, unknown>)[key])
  }
  return out
}

/** The pair a `userId_locationId` where names. The shape is checked first. */
function compoundKey(method: string, where: Where | undefined): { userId: string; locationId: string } {
  const keys = where ? Object.keys(where).filter((k) => where[k] !== undefined) : []
  if (keys.length !== 1 || keys[0] !== 'userId_locationId') {
    throw new LocationPreferenceUnsupportedError(
      `${method} without exactly the compound key userId_locationId (got: ${keys.join(', ') || 'none'})`,
    )
  }
  checkWhere('locationPreferenceFake', where, COMPOUND_SPEC)
  const pair = (where as { userId_locationId: { userId?: unknown; locationId?: unknown } })
    .userId_locationId
  if (typeof pair.userId !== 'string' || typeof pair.locationId !== 'string') {
    throw new LocationPreferenceUnsupportedError(`${method} with a compound key that does not name both fields`)
  }
  return { userId: pair.userId, locationId: pair.locationId }
}

export function createLocationPreferenceFake(options: LocationPreferenceFakeOptions = {}) {
  const state: { rows: LocationPreferenceRow[] } = { rows: [] }
  const now = options.now ?? (() => new Date())

  function find(key: { userId: string; locationId: string }): LocationPreferenceRow | undefined {
    return state.rows.find((r) => r.userId === key.userId && r.locationId === key.locationId)
  }

  function insert(data: Data): LocationPreferenceRow {
    checkData('upsert.create', data)
    for (const column of KEY_COLUMNS) {
      if (typeof data[column] !== 'string') {
        throw new Error(`locationPreferenceFake: a create gave no ${column}. The column is NOT NULL.`)
      }
    }
    const userId = data.userId as string
    const locationId = data.locationId as string
    if (options.locations && !options.locations().some((l) => l.id === locationId)) {
      throw new LocationPreferenceForeignKeyError(locationId)
    }
    if (find({ userId, locationId })) throw new LocationPreferenceUniqueError(userId, locationId)
    const row: LocationPreferenceRow = {
      userId,
      locationId,
      customOrder: (data.customOrder as number | null | undefined) ?? null,
      lastVisitedAt: (data.lastVisitedAt as Date | null | undefined) ?? null,
      updatedAt: now(),
    }
    state.rows.push(row)
    return row
  }

  function applyUpdate(row: LocationPreferenceRow, data: Data): LocationPreferenceRow {
    checkData('upsert.update', data)
    for (const column of KEY_COLUMNS) {
      if (data[column] !== undefined && data[column] !== row[column]) {
        throw new LocationPreferenceUnsupportedError(`an update that changes ${column} (the primary key)`)
      }
    }
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue
      ;(row as unknown as Record<string, unknown>)[key] = value
    }
    row.updatedAt = now()
    return row
  }

  const client = {
    findUnique: async (args: { where: Where; select?: Record<string, unknown> }) => {
      refuseUnknownOptions('findUnique', args, ['where', 'select'])
      const row = find(compoundKey('findUnique', args.where))
      return row ? (applySelect(row, args.select) as unknown as LocationPreferenceRow) : null
    },

    findMany: async (args: { where?: Where; select?: Record<string, unknown> } = {}) => {
      refuseUnknownOptions('findMany', args, ['where', 'select'])
      checkWhere('locationPreferenceFake', args.where, WHERE_SPEC)
      return state.rows
        .filter((row) => matches(row, args.where))
        .map((row) => applySelect(row, args.select) as unknown as LocationPreferenceRow)
    },

    upsert: async (args: {
      where: Where
      create: Data
      update: Data
      select?: Record<string, unknown>
    }) => {
      refuseUnknownOptions('upsert', args, ['where', 'create', 'update', 'select'])
      const key = compoundKey('upsert', args.where)
      const existing = find(key)
      const row = existing ? applyUpdate(existing, args.update) : insert(args.create)
      return applySelect(row, args.select) as unknown as LocationPreferenceRow
    },

    deleteMany: async (args: { where?: Where } = {}) => {
      refuseUnknownOptions('deleteMany', args, ['where'])
      checkWhere('locationPreferenceFake', args.where, WHERE_SPEC)
      const before = state.rows.length
      state.rows = state.rows.filter((row) => !matches(row, args.where))
      return { count: before - state.rows.length }
    },
  }

  /** The ON DELETE CASCADE from `Location`: drop the rows of these locations. */
  function forgetLocations(ids: Iterable<string>) {
    const gone = new Set(ids)
    state.rows = state.rows.filter((row) => !gone.has(row.locationId))
  }

  /** Replace the rows with copies. */
  function reset(rows: LocationPreferenceRow[] = []) {
    state.rows = rows.map(copy)
  }

  return { state, client, forgetLocations, reset }
}

export type LocationPreferenceFake = ReturnType<typeof createLocationPreferenceFake>
