// A stateful Prisma double for the three household models of H3a:
// `Household`, `HouseholdMember` and `LocationMember` (households plan H3a,
// task 3.4: docs/global/permissions/2026-11-04-households-plan-h3a.md).
//
// Task 3.5's helpers (`ensureHousehold`, `requireHousehold`,
// `requireHouseholdRole`, `requireLocationRole`) are tested on top of it. If
// this fake is wrong, those tests pass against wrong code, so every rule below
// is pinned in `householdFake.test.ts`.
//
// It follows the same rules as `ownedRowFake` and `userFake` (root CLAUDE.md,
// "Write test doubles to model the constraint, not the happy path").
//
// ── WHAT IT MODELS, AND WHY ──
//
//   - `where` is checked ONCE per call by `checkWhere` (`whereKeys.ts`),
//     before the store is searched, then applied KEY BY KEY. An unknown key,
//     or a filter shape the fake does not model, THROWS. A key set to
//     `undefined` filters nothing (Prisma's rule).
//   - `role` matches a value or `{ in: [...] }`. A role value that is not in
//     the enum THROWS, in a `where` and in a write. `HouseholdRole` is
//     `owner | manager | member`; `LocationRole` is
//     `organizer | participant | viewer` (decision H14). So the old location
//     role strings `'owner'` and `'member'` fail on a `LocationMember`, which
//     is the rename task 3.5 step 5 makes.
//   - Both COMPOSITE primary keys: `(householdId, userId)` on
//     `HouseholdMember` and `(locationId, userId)` on `LocationMember`. A
//     taken key raises P2002, on create and on an update that moves a row onto
//     a taken key. The compound `where` keys `householdId_userId` and
//     `locationId_userId` work, and must name both fields.
//   - `HouseholdMember_one_owner_key`, the partial unique index of the
//     add_households migration: a second `owner` row in one household raises
//     P2002. It is checked on create AND on update, because H6's hand-over
//     changes a role by update.
//   - Foreign keys, as P2003: a `HouseholdMember` must name a `Household` in
//     this fake, and a `LocationMember` must name a location the `locations`
//     option returns. Without these, a helper that writes the member row
//     before the household would pass here and fail in Postgres.
//   - NOT NULL columns with no default: `Household.name`; `householdId`,
//     `userId` and `role` on `HouseholdMember`; `locationId`, `userId` and
//     `role` on `LocationMember`. A write without one throws.
//   - Defaults: `Household.id` (generated when not given), `ownerId` and
//     `ownerGoneAt` null, `createdAt`, `joinedAt`, and `Household.updatedAt`
//     (`@updatedAt`, also moved on every update).
//   - Rows are returned as COPIES, as with a real database.
//
// ── THE RELATION FILTERS IT SUPPORTS, AND NO OTHER ──
//
// Chosen with task 3.5's helpers in mind. Every other nested key throws.
//
//   - `household.findFirst({ where: { members: { some: { userId } } } })` —
//     "the household this person belongs to". `some` may also name `role`.
//   - `locationMember.findFirst({ where: { locationId, userId, role,
//     location: { household: { members: { some: { userId } } } } } })` —
//     "a location role that still counts" (decision H18). The `location`
//     filter is resolved through the `locations` option; `household` then
//     reads this fake's own `Household` and `HouseholdMember` stores.
//   - `location: { householdId }` on `LocationMember` — "the location rows of
//     one household".
//
// Note that Prisma's `some` matches when AT LEAST ONE related row passes. So
// `members: { some: { userId: X } }` is true for a household with X in it,
// whoever else is in it too.
//
// ── WHAT IT DOES NOT MODEL ──
//
//   - `select`. Accepted and IGNORED: whole rows come back.
//   - `include`, `orderBy`, `take`, `skip`, `distinct`. All throw as unknown
//     options, so no test can rest on something this file never applied.
//   - Nested writes, such as `household.create({ data: { members: { create }
//     } })`, and update operators such as `{ set }`. A `data` value that is a
//     plain object throws. Write each row with its own call.
//   - The foreign key from `userId` to `User`, and from `Household.ownerId` to
//     `User`. `User` lives in `userFake`.
//   - That `Household.ownerId` mirrors the owner's `HouseholdMember` row
//     (decision H15). That is the job of the code that writes both rows in one
//     transaction; a test of that code must assert both.
//   - Cascades. Deleting a household is not offered here at all (the method is
//     missing, so a call fails as "not a function").
//   - `$transaction`. Import `runInTransaction` from `stockFake.ts` and pass
//     this fake's `state` as a store. `state` holds plain data and `Date`s,
//     which `structuredClone` copies.

import type { Household, HouseholdMember, LocationMember } from '@prisma/client'
import { OwnedRowNotFoundError } from './ownedRowFake.js'
import { checkWhere, type WhereSpec } from './whereKeys.js'

export type HouseholdRow = Household
export type HouseholdMemberRow = HouseholdMember
export type LocationMemberRow = LocationMember

/** What the fake needs to know about a location: its id and its household. */
export interface LocationRef {
  id: string
  householdId?: string | null
}

type Where = Record<string, unknown>

type Data = Record<string, unknown>

export const HOUSEHOLD_ROLES = ['owner', 'manager', 'member'] as const
export const LOCATION_ROLES = ['organizer', 'participant', 'viewer'] as const

// ── Errors ──

// The two `where` errors are the shared ones, so one `instanceof` catches an
// unknown key from any fake.
export { UnknownWhereKeyError, UnsupportedWhereFilterError } from './whereKeys.js'

/**
 * P2002: a unique constraint failed. `constraint` names which one, for a
 * reader. Real Prisma puts details in `meta.target`, and this fake does not
 * model that shape, so code must branch on `code` only.
 */
export class HouseholdFakeUniqueError extends Error {
  code = 'P2002'
  constructor(
    model: string,
    readonly constraint: string,
    detail: string,
  ) {
    super(`Unique constraint failed: ${constraint} — ${model} (${detail})`)
  }
}

/** P2003: a foreign key failed. The referenced row does not exist. */
export class HouseholdFakeForeignKeyError extends Error {
  code = 'P2003'
  constructor(model: string, column: string, value: string) {
    super(`Foreign key constraint failed on the field: \`${column}\` — ${model} (${value})`)
  }
}

/** Raised for a role value that is not in the enum. */
export class InvalidRoleError extends Error {
  constructor(model: string, value: unknown, allowed: readonly string[]) {
    super(
      `householdFake(${model}): ${JSON.stringify(value)} is not a valid role. ` +
        `The enum holds only ${allowed.join(', ')}.`,
    )
  }
}

/** Raised for an option, a data shape or a call shape the fake does not model. */
export class HouseholdFakeUnsupportedError extends Error {
  constructor(model: string, detail: string) {
    super(
      `householdFake(${model}) does not model ${detail}. ` +
        'Add it to householdFake.ts on purpose, with a test.',
    )
  }
}

/** Raised when a write leaves out a NOT NULL column with no default. */
export class HouseholdFakeMissingColumnError extends Error {
  constructor(model: string, column: string) {
    super(`householdFake(${model}): a write gave no ${column}. The column is NOT NULL.`)
  }
}

// ── Where specs, checked once per call ──

const MEMBER_SOME: WhereSpec = { userId: 'in', role: 'in' }
const MEMBERS_RELATION = { nested: { some: { nested: MEMBER_SOME } } } as const

const HOUSEHOLD_WHERE: WhereSpec = {
  id: 'in',
  ownerId: 'nullableIn',
  members: MEMBERS_RELATION,
}

const HOUSEHOLD_MEMBER_WHERE: WhereSpec = {
  householdId: 'in',
  userId: 'in',
  role: 'in',
  householdId_userId: { nested: { householdId: 'equals', userId: 'equals' } },
}

const LOCATION_MEMBER_WHERE: WhereSpec = {
  locationId: 'in',
  userId: 'in',
  role: 'in',
  locationId_userId: { nested: { locationId: 'equals', userId: 'equals' } },
  location: {
    nested: {
      householdId: 'in',
      household: { nested: { members: MEMBERS_RELATION } },
    },
  },
}

// ── Small helpers ──

/** A plain value or `{ in: [...] }`, or `null`. The shape was checked already. */
function matchesScalar(value: unknown, filter: unknown): boolean {
  if (filter === null) return value === null
  if (typeof filter === 'object') return (filter as { in: unknown[] }).in.includes(value)
  return value === filter
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function stripUndefined(data: Data): Data {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
}

function refuseUnknownOptions(model: string, method: string, args: object, allowed: string[]) {
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) {
      throw new HouseholdFakeUnsupportedError(model, `the option '${key}' on ${method}`)
    }
  }
}

/** Nested writes and update operators arrive as plain objects. Neither is modelled. */
function refuseNestedData(model: string, data: Data) {
  for (const [key, value] of Object.entries(data)) {
    if (isPlainObject(value)) {
      throw new HouseholdFakeUnsupportedError(
        model,
        `a nested write or update operator on '${key}' (${JSON.stringify(value)})`,
      )
    }
  }
}

/** A role filter must name only values the enum holds. */
function checkRoleFilter(model: string, filter: unknown, allowed: readonly string[]) {
  if (filter === undefined) return
  const values = typeof filter === 'object' ? (filter as { in: unknown[] }).in : [filter]
  for (const value of values) {
    if (!allowed.includes(value as string)) throw new InvalidRoleError(model, value, allowed)
  }
}

/** A compound key must name both of its fields, as Prisma's types require. */
function checkCompound(model: string, where: Where, key: string, fields: [string, string]) {
  const compound = where[key]
  if (compound === undefined) return
  const record = compound as Record<string, unknown>
  for (const field of fields) {
    if (typeof record[field] !== 'string') {
      throw new HouseholdFakeUnsupportedError(model, `a '${key}' with no string '${field}'`)
    }
  }
}

function copy<T>(row: T): T {
  return structuredClone(row)
}

export interface HouseholdFakeState {
  households: HouseholdRow[]
  householdMembers: HouseholdMemberRow[]
  locationMembers: LocationMemberRow[]
}

export interface HouseholdFakeOptions {
  households?: HouseholdRow[]
  householdMembers?: HouseholdMemberRow[]
  locationMembers?: LocationMemberRow[]
  /**
   * The location rows, read on every call that needs one: the foreign key of
   * a `LocationMember` write, and the `location` relation filter. Pass a
   * function so the fake sees the CURRENT rows, for example
   * `() => stockFake.state.locations`. A `LocationMember` write or a
   * `location` filter with no `locations` option throws.
   */
  locations?: () => readonly LocationRef[]
}

export function createHouseholdFake(options: HouseholdFakeOptions = {}) {
  // One plain object of plain data, so `runInTransaction` (stockFake.ts) can
  // register it as a rollback store.
  const state: HouseholdFakeState = {
    households: (options.households ?? []).map(copy),
    householdMembers: (options.householdMembers ?? []).map(copy),
    locationMembers: (options.locationMembers ?? []).map(copy),
  }
  let seq = 0

  function locations(model: string): readonly LocationRef[] {
    if (!options.locations) {
      throw new HouseholdFakeUnsupportedError(
        model,
        'a location lookup, because it was built with no `locations` option',
      )
    }
    return options.locations()
  }

  // ── Matchers. Each trusts that `checkWhere` already ran on the whole where. ──

  function memberMatches(row: HouseholdMemberRow, where: Where): boolean {
    for (const [key, filter] of Object.entries(where)) {
      if (filter === undefined) continue
      if (key === 'householdId_userId') {
        const k = filter as { householdId: string; userId: string }
        if (row.householdId !== k.householdId || row.userId !== k.userId) return false
        continue
      }
      if (!matchesScalar((row as unknown as Where)[key], filter)) return false
    }
    return true
  }

  /** `members: { some: {...} }`: at least one member row of `householdId` passes. */
  function someMember(householdId: string, members: Where): boolean {
    const some = members.some as Where | undefined
    if (some === undefined) return true
    return state.householdMembers.some(
      (m) => m.householdId === householdId && memberMatches(m, some),
    )
  }

  function householdMatches(row: HouseholdRow, where: Where): boolean {
    for (const [key, filter] of Object.entries(where)) {
      if (filter === undefined) continue
      if (key === 'members') {
        if (!someMember(row.id, filter as Where)) return false
        continue
      }
      if (!matchesScalar((row as unknown as Where)[key], filter)) return false
    }
    return true
  }

  /** The `location` relation filter on a `LocationMember`. */
  function locationMatches(locationId: string, where: Where): boolean {
    const location = locations('LocationMember').find((l) => l.id === locationId)
    if (!location) return false
    const householdId = location.householdId ?? null
    for (const [key, filter] of Object.entries(where)) {
      if (filter === undefined) continue
      if (key === 'householdId') {
        if (!matchesScalar(householdId, filter)) return false
        continue
      }
      // key === 'household': a relation to a row that must exist.
      if (householdId === null) return false
      const household = state.households.find((h) => h.id === householdId)
      if (!household || !householdMatches(household, filter as Where)) return false
    }
    return true
  }

  function locationMemberMatches(row: LocationMemberRow, where: Where): boolean {
    for (const [key, filter] of Object.entries(where)) {
      if (filter === undefined) continue
      if (key === 'locationId_userId') {
        const k = filter as { locationId: string; userId: string }
        if (row.locationId !== k.locationId || row.userId !== k.userId) return false
        continue
      }
      if (key === 'location') {
        if (!locationMatches(row.locationId, filter as Where)) return false
        continue
      }
      if (!matchesScalar((row as unknown as Where)[key], filter)) return false
    }
    return true
  }

  // ── Once-per-call checks ──

  function checkHouseholdWhere(where: Where | undefined) {
    checkWhere('householdFake(Household)', where, HOUSEHOLD_WHERE)
    const some = (where?.members as Where | undefined)?.some as Where | undefined
    checkRoleFilter('Household', some?.role, HOUSEHOLD_ROLES)
  }

  function checkMemberWhere(where: Where | undefined) {
    checkWhere('householdFake(HouseholdMember)', where, HOUSEHOLD_MEMBER_WHERE)
    if (!where) return
    checkRoleFilter('HouseholdMember', where.role, HOUSEHOLD_ROLES)
    checkCompound('HouseholdMember', where, 'householdId_userId', ['householdId', 'userId'])
  }

  function checkLocationMemberWhere(where: Where | undefined) {
    checkWhere('householdFake(LocationMember)', where, LOCATION_MEMBER_WHERE)
    if (!where) return
    checkRoleFilter('LocationMember', where.role, LOCATION_ROLES)
    checkCompound('LocationMember', where, 'locationId_userId', ['locationId', 'userId'])
    const location = where.location as Where | undefined
    const household = location?.household as Where | undefined
    const some = (household?.members as Where | undefined)?.some as Where | undefined
    // The members of a household carry HOUSEHOLD roles, not location roles.
    checkRoleFilter('LocationMember', some?.role, HOUSEHOLD_ROLES)
    // Fail now, not only when a row reaches the matcher.
    if (location !== undefined) locations('LocationMember')
  }

  /** `findUnique` and the single-row writes must name the unique key. */
  function requireUnique(model: string, method: string, where: Where, key: string) {
    if (where[key] === undefined) {
      throw new HouseholdFakeUnsupportedError(model, `a ${method} whose where has no '${key}'`)
    }
  }

  // ── Constraint checks, shared by create and update ──

  function checkMemberRow(row: HouseholdMemberRow, others: HouseholdMemberRow[]) {
    const model = 'HouseholdMember'
    for (const column of ['householdId', 'userId', 'role'] as const) {
      if (typeof row[column] !== 'string') throw new HouseholdFakeMissingColumnError(model, column)
    }
    if (!HOUSEHOLD_ROLES.includes(row.role)) {
      throw new InvalidRoleError(model, row.role, HOUSEHOLD_ROLES)
    }
    if (!state.households.some((h) => h.id === row.householdId)) {
      throw new HouseholdFakeForeignKeyError(model, 'householdId', row.householdId)
    }
    if (others.some((m) => m.householdId === row.householdId && m.userId === row.userId)) {
      throw new HouseholdFakeUniqueError(
        model,
        'HouseholdMember_pkey',
        `${row.householdId}, ${row.userId}`,
      )
    }
    if (
      row.role === 'owner' &&
      others.some((m) => m.householdId === row.householdId && m.role === 'owner')
    ) {
      throw new HouseholdFakeUniqueError(model, 'HouseholdMember_one_owner_key', row.householdId)
    }
  }

  function checkLocationMemberRow(row: LocationMemberRow, others: LocationMemberRow[]) {
    const model = 'LocationMember'
    for (const column of ['locationId', 'userId', 'role'] as const) {
      if (typeof row[column] !== 'string') throw new HouseholdFakeMissingColumnError(model, column)
    }
    if (!LOCATION_ROLES.includes(row.role)) {
      throw new InvalidRoleError(model, row.role, LOCATION_ROLES)
    }
    if (!locations(model).some((l) => l.id === row.locationId)) {
      throw new HouseholdFakeForeignKeyError(model, 'locationId', row.locationId)
    }
    if (others.some((m) => m.locationId === row.locationId && m.userId === row.userId)) {
      throw new HouseholdFakeUniqueError(
        model,
        'LocationMember_pkey',
        `${row.locationId}, ${row.userId}`,
      )
    }
  }

  // ── Inserts ──

  function insertHousehold(data: Data): HouseholdRow {
    const model = 'Household'
    refuseNestedData(model, data)
    const id = (data.id as string | undefined) ?? `household-${++seq}`
    if (state.households.some((h) => h.id === id)) {
      throw new HouseholdFakeUniqueError(model, 'Household_pkey', id)
    }
    if (typeof data.name !== 'string') throw new HouseholdFakeMissingColumnError(model, 'name')
    const now = new Date()
    const row = {
      ownerId: null,
      ownerGoneAt: null,
      createdAt: now,
      ...stripUndefined(data),
      id,
      // @updatedAt: Prisma sets it on create too.
      updatedAt: now,
    } as HouseholdRow
    state.households.push(row)
    return row
  }

  function insertMember(data: Data): HouseholdMemberRow {
    refuseNestedData('HouseholdMember', data)
    const row = { joinedAt: new Date(), ...stripUndefined(data) } as HouseholdMemberRow
    checkMemberRow(row, state.householdMembers)
    state.householdMembers.push(row)
    return row
  }

  function insertLocationMember(data: Data): LocationMemberRow {
    refuseNestedData('LocationMember', data)
    const row = { createdAt: new Date(), ...stripUndefined(data) } as LocationMemberRow
    checkLocationMemberRow(row, state.locationMembers)
    state.locationMembers.push(row)
    return row
  }

  // ── Updates. Each builds the new row, checks it, then writes it. ──

  function updateHouseholdRow(row: HouseholdRow, data: Data): HouseholdRow {
    refuseNestedData('Household', data)
    if (data.id !== undefined && data.id !== row.id) {
      throw new HouseholdFakeUnsupportedError('Household', 'an update that changes the id')
    }
    Object.assign(row, stripUndefined(data))
    row.updatedAt = new Date()
    return row
  }

  function updateMemberRow(row: HouseholdMemberRow, data: Data): HouseholdMemberRow {
    refuseNestedData('HouseholdMember', data)
    const next = { ...row, ...stripUndefined(data) } as HouseholdMemberRow
    checkMemberRow(
      next,
      state.householdMembers.filter((m) => m !== row),
    )
    Object.assign(row, next)
    return row
  }

  function updateLocationMemberRow(row: LocationMemberRow, data: Data): LocationMemberRow {
    refuseNestedData('LocationMember', data)
    const next = { ...row, ...stripUndefined(data) } as LocationMemberRow
    checkLocationMemberRow(
      next,
      state.locationMembers.filter((m) => m !== row),
    )
    Object.assign(row, next)
    return row
  }

  // ── The client ──

  const READ = ['where', 'select']

  const household = {
    findUnique: async (args: { where: Where; select?: Where }) => {
      refuseUnknownOptions('Household', 'findUnique', args, READ)
      checkHouseholdWhere(args.where)
      requireUnique('Household', 'findUnique', args.where, 'id')
      const row = state.households.find((h) => householdMatches(h, args.where))
      return row ? copy(row) : null
    },
    findFirst: async (args: { where?: Where; select?: Where } = {}) => {
      refuseUnknownOptions('Household', 'findFirst', args, READ)
      checkHouseholdWhere(args.where)
      const row = state.households.find((h) => householdMatches(h, args.where ?? {}))
      return row ? copy(row) : null
    },
    findMany: async (args: { where?: Where; select?: Where } = {}) => {
      refuseUnknownOptions('Household', 'findMany', args, READ)
      checkHouseholdWhere(args.where)
      return state.households.filter((h) => householdMatches(h, args.where ?? {})).map(copy)
    },
    create: async (args: { data: Data; select?: Where }) => {
      refuseUnknownOptions('Household', 'create', args, ['data', 'select'])
      return copy(insertHousehold(args.data))
    },
    update: async (args: { where: Where; data: Data; select?: Where }) => {
      refuseUnknownOptions('Household', 'update', args, ['where', 'data', 'select'])
      checkHouseholdWhere(args.where)
      requireUnique('Household', 'update', args.where, 'id')
      const row = state.households.find((h) => householdMatches(h, args.where))
      if (!row) throw new OwnedRowNotFoundError('Household', args.where)
      return copy(updateHouseholdRow(row, args.data))
    },
  }

  const householdMember = {
    findUnique: async (args: { where: Where; select?: Where }) => {
      refuseUnknownOptions('HouseholdMember', 'findUnique', args, READ)
      checkMemberWhere(args.where)
      requireUnique('HouseholdMember', 'findUnique', args.where, 'householdId_userId')
      const row = state.householdMembers.find((m) => memberMatches(m, args.where))
      return row ? copy(row) : null
    },
    findFirst: async (args: { where?: Where; select?: Where } = {}) => {
      refuseUnknownOptions('HouseholdMember', 'findFirst', args, READ)
      checkMemberWhere(args.where)
      const row = state.householdMembers.find((m) => memberMatches(m, args.where ?? {}))
      return row ? copy(row) : null
    },
    findMany: async (args: { where?: Where; select?: Where } = {}) => {
      refuseUnknownOptions('HouseholdMember', 'findMany', args, READ)
      checkMemberWhere(args.where)
      return state.householdMembers.filter((m) => memberMatches(m, args.where ?? {})).map(copy)
    },
    count: async (args: { where?: Where } = {}) => {
      refuseUnknownOptions('HouseholdMember', 'count', args, ['where'])
      checkMemberWhere(args.where)
      return state.householdMembers.filter((m) => memberMatches(m, args.where ?? {})).length
    },
    create: async (args: { data: Data; select?: Where }) => {
      refuseUnknownOptions('HouseholdMember', 'create', args, ['data', 'select'])
      return copy(insertMember(args.data))
    },
    update: async (args: { where: Where; data: Data; select?: Where }) => {
      refuseUnknownOptions('HouseholdMember', 'update', args, ['where', 'data', 'select'])
      checkMemberWhere(args.where)
      requireUnique('HouseholdMember', 'update', args.where, 'householdId_userId')
      const row = state.householdMembers.find((m) => memberMatches(m, args.where))
      if (!row) throw new OwnedRowNotFoundError('HouseholdMember', args.where)
      return copy(updateMemberRow(row, args.data))
    },
    upsert: async (args: { where: Where; create: Data; update: Data; select?: Where }) => {
      refuseUnknownOptions('HouseholdMember', 'upsert', args, [
        'where',
        'create',
        'update',
        'select',
      ])
      checkMemberWhere(args.where)
      requireUnique('HouseholdMember', 'upsert', args.where, 'householdId_userId')
      const row = state.householdMembers.find((m) => memberMatches(m, args.where))
      return copy(row ? updateMemberRow(row, args.update) : insertMember(args.create))
    },
    delete: async (args: { where: Where; select?: Where }) => {
      refuseUnknownOptions('HouseholdMember', 'delete', args, ['where', 'select'])
      checkMemberWhere(args.where)
      requireUnique('HouseholdMember', 'delete', args.where, 'householdId_userId')
      const row = state.householdMembers.find((m) => memberMatches(m, args.where))
      if (!row) throw new OwnedRowNotFoundError('HouseholdMember', args.where)
      state.householdMembers = state.householdMembers.filter((m) => m !== row)
      return copy(row)
    },
    deleteMany: async (args: { where?: Where } = {}) => {
      refuseUnknownOptions('HouseholdMember', 'deleteMany', args, ['where'])
      checkMemberWhere(args.where)
      const before = state.householdMembers.length
      state.householdMembers = state.householdMembers.filter(
        (m) => !memberMatches(m, args.where ?? {}),
      )
      return { count: before - state.householdMembers.length }
    },
  }

  const locationMember = {
    findUnique: async (args: { where: Where; select?: Where }) => {
      refuseUnknownOptions('LocationMember', 'findUnique', args, READ)
      checkLocationMemberWhere(args.where)
      requireUnique('LocationMember', 'findUnique', args.where, 'locationId_userId')
      const row = state.locationMembers.find((m) => locationMemberMatches(m, args.where))
      return row ? copy(row) : null
    },
    findFirst: async (args: { where?: Where; select?: Where } = {}) => {
      refuseUnknownOptions('LocationMember', 'findFirst', args, READ)
      checkLocationMemberWhere(args.where)
      const row = state.locationMembers.find((m) => locationMemberMatches(m, args.where ?? {}))
      return row ? copy(row) : null
    },
    findMany: async (args: { where?: Where; select?: Where } = {}) => {
      refuseUnknownOptions('LocationMember', 'findMany', args, READ)
      checkLocationMemberWhere(args.where)
      return state.locationMembers
        .filter((m) => locationMemberMatches(m, args.where ?? {}))
        .map(copy)
    },
    count: async (args: { where?: Where } = {}) => {
      refuseUnknownOptions('LocationMember', 'count', args, ['where'])
      checkLocationMemberWhere(args.where)
      return state.locationMembers.filter((m) => locationMemberMatches(m, args.where ?? {}))
        .length
    },
    create: async (args: { data: Data; select?: Where }) => {
      refuseUnknownOptions('LocationMember', 'create', args, ['data', 'select'])
      return copy(insertLocationMember(args.data))
    },
    update: async (args: { where: Where; data: Data; select?: Where }) => {
      refuseUnknownOptions('LocationMember', 'update', args, ['where', 'data', 'select'])
      checkLocationMemberWhere(args.where)
      requireUnique('LocationMember', 'update', args.where, 'locationId_userId')
      const row = state.locationMembers.find((m) => locationMemberMatches(m, args.where))
      if (!row) throw new OwnedRowNotFoundError('LocationMember', args.where)
      return copy(updateLocationMemberRow(row, args.data))
    },
    upsert: async (args: { where: Where; create: Data; update: Data; select?: Where }) => {
      refuseUnknownOptions('LocationMember', 'upsert', args, [
        'where',
        'create',
        'update',
        'select',
      ])
      checkLocationMemberWhere(args.where)
      requireUnique('LocationMember', 'upsert', args.where, 'locationId_userId')
      const row = state.locationMembers.find((m) => locationMemberMatches(m, args.where))
      return copy(
        row ? updateLocationMemberRow(row, args.update) : insertLocationMember(args.create),
      )
    },
    delete: async (args: { where: Where; select?: Where }) => {
      refuseUnknownOptions('LocationMember', 'delete', args, ['where', 'select'])
      checkLocationMemberWhere(args.where)
      requireUnique('LocationMember', 'delete', args.where, 'locationId_userId')
      const row = state.locationMembers.find((m) => locationMemberMatches(m, args.where))
      if (!row) throw new OwnedRowNotFoundError('LocationMember', args.where)
      state.locationMembers = state.locationMembers.filter((m) => m !== row)
      return copy(row)
    },
    deleteMany: async (args: { where?: Where } = {}) => {
      refuseUnknownOptions('LocationMember', 'deleteMany', args, ['where'])
      checkLocationMemberWhere(args.where)
      const before = state.locationMembers.length
      state.locationMembers = state.locationMembers.filter(
        (m) => !locationMemberMatches(m, args.where ?? {}),
      )
      return { count: before - state.locationMembers.length }
    },
  }

  const client = { household, householdMember, locationMember }

  /** Replace the store's contents. The rows are copied. */
  function reset(next: Omit<HouseholdFakeOptions, 'locations'> = {}) {
    state.households = (next.households ?? []).map(copy)
    state.householdMembers = (next.householdMembers ?? []).map(copy)
    state.locationMembers = (next.locationMembers ?? []).map(copy)
    seq = 0
  }

  return { state, client, reset }
}

export type HouseholdFake = ReturnType<typeof createHouseholdFake>
