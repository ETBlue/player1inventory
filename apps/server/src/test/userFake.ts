// A stateful Prisma double for the `User` model (households plan, task 2.2:
// docs/global/permissions/2026-10-31-households-plan.md).
//
// `ownedRowFake` does not fit `User`: it requires a `userId` column on every
// row, and `User` has none. Its id IS the Clerk user id. This file follows the
// same rules as `ownedRowFake` (root CLAUDE.md, "Write test doubles to model
// the constraint, not the happy path") and reuses its P2002 error.
//
// NOT a test file by name, but `apps/server/tsconfig.json` includes all of
// `src`, so `tsc` type-checks this file and its test alike.
//
// ── WHAT IT MODELS, AND WHY ──
//
//   - `where` is applied KEY BY KEY. A key the caller did not name, or named
//     with `undefined`, filters nothing (Prisma's rule).
//   - An unknown `where` key, or a filter shape it does not model, THROWS. If
//     it were ignored, a test would pass against code whose filter the fake
//     never applied.
//   - Modelled `where` keys: `id` (a string or `{ in: [...] }`), `lastSeenAt`
//     (`null` or `{ lt: Date }`), `householdSetupAt` (`null` only, for the
//     first sign-in claim of decision H1), and `OR` (an array of the same).
//     The keys are checked ONCE per call by `checkWhere` (`whereKeys.ts`). `{ lt }` does NOT
//     match a null column, as in SQL. That is why task 2.4's "not seen today"
//     update needs `OR: [{ lastSeenAt: null }, { lastSeenAt: { lt } }]`.
//   - `create` HONOURS `data.id` and raises P2002 on a taken id. The primary
//     key is the race guard when two first requests for one user arrive at
//     once. `create` with no id throws: `User.id` has no default.
//   - `create` with no `displayName` throws: the column is NOT NULL.
//   - `upsert` keeps `create` and `update` APART. `update` is applied with
//     `value !== undefined`, Prisma's rule: an explicit `undefined` is "not
//     mentioned", and `null` is written. Root CLAUDE.md says why
//     `'key' in data` is wrong.
//   - It never invents a timestamp except `createdAt` (`@default(now())`, on
//     create when not given) and `updatedAt` (`@updatedAt`, on every create
//     and update). `lastSeenAt`, `deletedAt` and `householdSetupAt` stay `null` until a payload
//     writes them, so a test can see a missing write.
//   - Rows are returned as COPIES. A caller that changes a returned row does
//     not change the store, the same as with a real database.
//
// ── WHAT IT DOES NOT MODEL ──
//
//   - `select` and `include`. Both throw as unknown options. `User` has no
//     relations yet; H3 adds them.
//   - `where` on `email`, `displayName`, `deletedAt`, `createdAt`,
//     `updatedAt`, and `AND` / `NOT`. All throw. Add one on purpose, with a
//     test, when a caller needs it.
//   - `$transaction`. Import `runInTransaction` from `stockFake.ts` and pass
//     this fake's `state` as a store. `state` holds plain data and `Date`s,
//     which `structuredClone` copies.
//   - Methods other than `findUnique`, `findMany`, `create`, `upsert` and
//     `updateMany`. Calling another one fails as "not a function".

import type { User } from '@prisma/client'
import { OwnedRowIdConstraintError } from './ownedRowFake.js'
import { checkWhere, UnknownWhereKeyError, type WhereSpec } from './whereKeys.js'

// The two shared `where` errors, so a test can import them from here.
export { UnknownWhereKeyError, UnsupportedWhereFilterError } from './whereKeys.js'

/** One `User` row, exactly as the generated Prisma client types it. */
export type UserRow = User

type Where = Record<string, unknown>

type Data = Record<string, unknown>

const MODEL = 'User'

/**
 * Raised for an option, or a call shape, this fake does not model. It throws
 * instead of ignoring the input, because ignoring it would let a test pass
 * against an option the fake never applied. A `where` key or filter shape it
 * does not model raises the shared `UnknownWhereKeyError` or
 * `UnsupportedWhereFilterError` from `whereKeys.ts` instead.
 */
export class UserFakeUnsupportedError extends Error {
  constructor(detail: string) {
    super(`userFake does not model ${detail}. Add it to userFake.ts on purpose, with a test.`)
  }
}

/** Raised when a write leaves out a column that is NOT NULL with no default. */
export class UserFakeMissingColumnError extends Error {
  constructor(detail: string) {
    super(`userFake: ${detail}`)
  }
}

// Every `where` key this fake models, and how. `checkWhere` runs it ONCE per
// call, before the store is searched, so an unknown key throws even on an
// empty store or when no row passes the outer keys. Until H3a task 3.4 the
// check ran inside the per-row matcher, which an empty store never calls. See
// `whereKeys.ts`.
const ROW_KEYS: WhereSpec = {
  id: 'in',
  lastSeenAt: 'nullableDateLt',
  // The first sign-in claim (decision H1) asks only "is it still unset?".
  householdSetupAt: 'null',
}
const USER_WHERE: WhereSpec = { ...ROW_KEYS, OR: { or: ROW_KEYS } }

const FAKE = 'userFake'

function checkUserWhere(where: Where | undefined): void {
  checkWhere(FAKE, where, USER_WHERE)
}

/** Match a column against a string or `{ in: [...] }`. The shape was checked already. */
function matchesId(value: string, filter: unknown): boolean {
  if (typeof filter === 'string') return value === filter
  return (filter as { in: unknown[] }).in.includes(value)
}

/** Match a nullable date column against `null` or `{ lt: Date }`. The shape was checked already. */
function matchesNullableDate(value: Date | null, filter: unknown): boolean {
  if (filter === null) return value === null
  const lt = (filter as { lt: Date }).lt
  // SQL: NULL < x is not true, so a null column never matches `lt`.
  return value !== null && value.getTime() < lt.getTime()
}

/**
 * Apply Prisma's `where` semantics to one row, key by key. It does NOT check
 * the keys: every client method calls `checkUserWhere` first, once.
 */
export function userMatches(row: UserRow, where: Where): boolean {
  for (const [key, filter] of Object.entries(where)) {
    if (filter === undefined) continue
    switch (key) {
      case 'id':
        if (!matchesId(row.id, filter)) return false
        break
      case 'lastSeenAt':
        if (!matchesNullableDate(row.lastSeenAt, filter)) return false
        break
      case 'householdSetupAt':
        if (!matchesNullableDate(row.householdSetupAt, filter)) return false
        break
      case 'OR':
        // Prisma: an empty OR matches nothing.
        if (!(filter as Where[]).some((branch) => userMatches(row, branch))) return false
        break
      default:
        // Unreachable after `checkUserWhere`. Kept so a key added to the spec
        // but not to this switch fails loudly instead of matching every row.
        throw new UnknownWhereKeyError(FAKE, key)
    }
  }
  return true
}

function refuseUnknownOptions(method: string, args: object, allowed: string[]) {
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) {
      throw new UserFakeUnsupportedError(`the option '${key}' on ${method}`)
    }
  }
}

function copy(row: UserRow): UserRow {
  return structuredClone(row)
}

export function createUserFake(rows: UserRow[] = []) {
  // One plain object of plain data, so `runInTransaction` (stockFake.ts) can
  // register it as a rollback store.
  const state: { rows: UserRow[] } = { rows: rows.map(copy) }

  function insert(data: Data): UserRow {
    const id = data.id
    if (typeof id !== 'string') {
      throw new UserFakeMissingColumnError('create was given no id. User.id has no default.')
    }
    if (state.rows.some((r) => r.id === id)) {
      throw new OwnedRowIdConstraintError(MODEL, id)
    }
    if (typeof data.displayName !== 'string') {
      throw new UserFakeMissingColumnError(
        `create for '${id}' was given no displayName. The column is NOT NULL.`,
      )
    }
    const now = new Date()
    const row = {
      email: null,
      lastSeenAt: null,
      deletedAt: null,
      // Added by add_households (H3a). Nullable with no default, so a new
      // row starts null. `updateMany` with `householdSetupAt: null` in the
      // where is the first sign-in claim (decision H1).
      householdSetupAt: null,
      createdAt: now,
      ...stripUndefined(data),
      // @updatedAt: Prisma sets it on create too.
      updatedAt: now,
    } as UserRow
    state.rows.push(row)
    return row
  }

  /**
   * Apply an `update` payload. `undefined` means "not mentioned" (Prisma's
   * rule); `null` is written. `updatedAt` moves, as `@updatedAt` does.
   */
  function applyUpdate(row: UserRow, data: Data): UserRow {
    if (data.id !== undefined && data.id !== row.id) {
      throw new UserFakeUnsupportedError('an update that changes the id')
    }
    Object.assign(row, stripUndefined(data))
    row.updatedAt = new Date()
    return row
  }

  const client = {
    // Prisma's WhereUniqueInput must name the unique key. Extra filters beside
    // it are allowed (Prisma 5+) and are applied.
    findUnique: async (args: { where: Where }) => {
      refuseUnknownOptions('findUnique', args, ['where'])
      checkUserWhere(args.where)
      if (typeof args.where.id !== 'string') {
        throw new UserFakeUnsupportedError('a findUnique whose where has no string id')
      }
      const row = state.rows.find((r) => userMatches(r, args.where))
      return row ? copy(row) : null
    },
    findMany: async (args: { where?: Where } = {}) => {
      refuseUnknownOptions('findMany', args, ['where'])
      checkUserWhere(args.where)
      return state.rows.filter((r) => userMatches(r, args.where ?? {})).map(copy)
    },
    create: async (args: { data: Data }) => {
      refuseUnknownOptions('create', args, ['data'])
      return copy(insert(args.data))
    },
    upsert: async (args: { where: Where; create: Data; update: Data }) => {
      refuseUnknownOptions('upsert', args, ['where', 'create', 'update'])
      checkUserWhere(args.where)
      if (typeof args.where.id !== 'string') {
        throw new UserFakeUnsupportedError('an upsert whose where has no string id')
      }
      const row = state.rows.find((r) => userMatches(r, args.where))
      return copy(row ? applyUpdate(row, args.update) : insert(args.create))
    },
    updateMany: async (args: { where?: Where; data: Data }) => {
      refuseUnknownOptions('updateMany', args, ['where', 'data'])
      checkUserWhere(args.where)
      let count = 0
      for (const row of state.rows) {
        if (!userMatches(row, args.where ?? {})) continue
        applyUpdate(row, args.data)
        count++
      }
      return { count }
    },
  }

  /** Replace the store's contents. The rows are copied. */
  function reset(next: UserRow[] = []) {
    state.rows = next.map(copy)
  }

  return { state, client, reset }
}

function stripUndefined(data: Data): Data {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
}

export type UserFake = ReturnType<typeof createUserFake>
