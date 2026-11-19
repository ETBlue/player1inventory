// A stateful Prisma double for the three household models of H3a:
// `Household`, `HouseholdMember` and `LocationMember` (households plan H3a,
// task 3.4: docs/global/permissions/2026-11-04-households-plan-h3a.md), and
// `HouseholdInvite` (households H5b, task G.1:
// docs/global/permissions/2026-11-18-households-plan-h5b.md).
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
// ── HouseholdInvite (H5b) ──
//
//   - `create` honours `data.id` (else it makes one) and raises P2002 on a
//     taken id, and on a taken `token` (`HouseholdInvite_token_key`). The
//     unique token is what makes one link name one invite.
//   - `create` needs `householdId`, `token`, `householdRole`, `locationRoles`,
//     `createdById` and `expiresAt` (all NOT NULL with no default), checks
//     `householdRole` against the enum, and raises P2003 for a household this
//     fake does not hold. `usedAt`, `usedById` and `revokedAt` start null.
//   - `findUnique` must name exactly ONE unique key, `id` or `token`, as a
//     plain string.
//   - `findMany` and `updateMany` take `id`, `householdId` and
//     `householdRole` (each a value or `{ in }`; a role outside the enum
//     throws), `usedAt: null`, `revokedAt: null` and `expiresAt: { gt }`.
//     These are the keys of the invite claim (decision T17). Any other key
//     throws. `{ gt }` is strict, as in SQL: an invite that expires at exactly
//     `now` does not match. `updateMany` returns a count, so the claim can see
//     `count === 0`.
//   - `locationRoles` is stored as given and returned as a copy. It is not
//     parsed: the server's checked parser does that (decision T26).
//   - `select` on `create`, `findUnique` and `findMany` is APPLIED (since the
//     review of H5b task G.3): only the columns set to `true` come back, as in
//     Prisma. Before, it was ignored, so a test got the secret token back from
//     a read that would not return it. A key that is not a column (a relation
//     such as `household`, or a typo) throws.
//
// ── household.deleteMany AND "IS IT EMPTY" (households H5b, task G.4) ──
//
// `joinHousehold` deletes the joiner's own household only when it is empty,
// with ONE conditional `deleteMany` (decision T21, `emptyHouseholdWhere` in
// lib/invite.ts). So the household `where` also takes these keys, and no
// other shape of them:
//
//   - `members: { every: { userId } }` — every member row passes. Prisma's
//     `every` is true for an empty list.
//   - `items`, `tags`, `tagTypes`, `vendors`, `recipes`, `shelves`:
//     `{ none: {} }` — the household has no such row.
//   - `locations: { every: { itemStocks: { none: {} }, inventoryLogs:
//     { none: {} }, carts: { every: { items: { none: {} } } } } }` — every
//     location of the household has no stock row, no log, and only empty
//     carts.
//
// The rows these keys read live in other fakes. They come from the
// `contents` option (and the locations from the `locations` option). A
// `where` that names one of these keys on a fake built with no `contents`
// THROWS, so no test can pass against a check the fake never ran.
//
// `deleteMany` deletes the matching households and, as Postgres does with
// `onDelete: Cascade`, their `HouseholdMember` rows, their invites, and the
// `LocationMember` rows of their locations. It does NOT delete the location
// rows or anything in `contents`: those stores are not this fake's.
// `householdWorld.ts` does that, and the `User.activeHouseholdId` SET NULL.
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
//   - `user: { householdMemberships: { some: { householdId, role } } }` on
//     `LocationMember` — "the person on this row is in that household"
//     (households H5 task F.1, `hasOrganizer`). Read from this fake's own
//     `HouseholdMember` store.
//
// Note that Prisma's `some` matches when AT LEAST ONE related row passes. So
// `members: { some: { userId: X } }` is true for a household with X in it,
// whoever else is in it too.
//
// ── WHAT IT DOES NOT MODEL ──
//
//   - `select` on `Household`, `HouseholdMember` and `LocationMember`.
//     Accepted and IGNORED: whole rows come back. (It IS applied on
//     `HouseholdInvite`, see above.)
//   - `include`, `orderBy`, `take`, `skip`. All throw as unknown options, so
//     no test can rest on something this file never applied. `distinct`
//     throws too, except on `locationMember.findMany` (below).
//   - Nested writes, such as `household.create({ data: { members: { create }
//     } })`, and update operators such as `{ set }`. A `data` value that is a
//     plain object throws. Write each row with its own call.
//   - The foreign key from `userId` to `User`, from `Household.ownerId` to
//     `User`, and from `HouseholdInvite.createdById` and `.usedById` to
//     `User`. `User` lives in `userFake`.
//   - Cascades and SetNull for `HouseholdInvite` (a deleted household's
//     invites, a deleted user's `usedById`). Only real SQL proves those:
//     `assertHouseholdInvites` in `scripts/verify-migration.ts`.
//   - That `Household.ownerId` mirrors the owner's `HouseholdMember` row
//     (decision H15). That is the job of the code that writes both rows in one
//     transaction; a test of that code must assert both.
//   - Most cascades. `household.deleteMany` (below) is the one delete of a
//     household, and it cascades only inside this fake's own stores.
//   - `$transaction`. Import `runInTransaction` from `stockFake.ts` and pass
//     this fake's `state` as a store. `state` holds plain data and `Date`s,
//     which `structuredClone` copies.
//
// ── `distinct` ON `locationMember.findMany` (households H5c, task H.2) ──
//
// `HouseholdPerson.hasLocationRole` reads `distinct: ['userId']` (decision
// T40). It is APPLIED: the first row of each combination of the named
// columns is kept, in store order, as Prisma keeps one row per value. A
// string or an array of `LocationMember` columns; any other key throws.

import type { Household, HouseholdInvite, HouseholdMember, LocationMember } from '@prisma/client'
import { OwnedRowNotFoundError } from './ownedRowFake.js'
import { checkWhere, type WhereKeyKind, type WhereSpec } from './whereKeys.js'

export type HouseholdRow = Household
export type HouseholdMemberRow = HouseholdMember
export type LocationMemberRow = LocationMember
export type HouseholdInviteRow = HouseholdInvite

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

/** `{ none: {} }` and nothing else: "there is no such row". */
const NONE: WhereKeyKind = { nested: { none: { nested: {} } } }

const HOUSEHOLD_WHERE: WhereSpec = {
  id: 'in',
  ownerId: 'nullableIn',
  // `every` only on the household's own where (decision T21): "this person
  // is the only member".
  members: {
    nested: { some: { nested: MEMBER_SOME }, every: { nested: { userId: 'in' } } },
  },
  items: NONE,
  tags: NONE,
  tagTypes: NONE,
  vendors: NONE,
  recipes: NONE,
  shelves: NONE,
  locations: {
    nested: {
      every: {
        nested: {
          itemStocks: NONE,
          inventoryLogs: NONE,
          carts: { nested: { every: { nested: { items: NONE } } } },
        },
      },
    },
  },
}

/** The keys of HOUSEHOLD_WHERE that read the `contents` option. */
const CONTENT_KEYS = ['items', 'tags', 'tagTypes', 'vendors', 'recipes', 'shelves'] as const

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
  // "The person on this row is a member of household X" (households H5 task
  // F.1). `hasOrganizer` uses it: an organizer who left the household does
  // not count (decision H18, about the ORGANIZER, not the caller).
  user: {
    nested: {
      householdMemberships: {
        nested: { some: { nested: { householdId: 'in', role: 'in' } } },
      },
    },
  },
}

// The keys of the invite claim (decision T17) and of the invite lists.
const INVITE_WHERE: WhereSpec = {
  id: 'in',
  token: 'in',
  householdId: 'in',
  // A manager lists and revokes only `member` invites (owner decision O15).
  householdRole: 'in',
  // A removed or leaving person's open invites are revoked (owner decision O20).
  createdById: 'in',
  usedAt: 'null',
  revokedAt: 'null',
  expiresAt: 'dateGt',
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

/** The columns of `LocationMember` that `distinct` may name. */
const LOCATION_MEMBER_COLUMNS = ['locationId', 'userId', 'role', 'createdAt']

/**
 * The columns a `distinct` names, checked. `undefined` names none. A key that
 * is not a `LocationMember` column throws, as Prisma refuses it.
 */
function distinctColumns(distinct: string | string[] | undefined): string[] {
  if (distinct === undefined) return []
  const columns = Array.isArray(distinct) ? distinct : [distinct]
  for (const column of columns) {
    if (!LOCATION_MEMBER_COLUMNS.includes(column)) {
      throw new HouseholdFakeUnsupportedError('LocationMember', `the distinct key '${column}'`)
    }
  }
  return columns
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

const INVITE_COLUMNS = [
  'id',
  'householdId',
  'token',
  'householdRole',
  'locationRoles',
  'createdById',
  'createdAt',
  'expiresAt',
  'usedAt',
  'usedById',
  'revokedAt',
] as const

/**
 * An invite row as Prisma returns it for `select`: only the columns set to
 * `true`, each copied. With no `select`, a copy of the whole row. A key that
 * is not a column throws.
 */
function selectInvite(row: HouseholdInviteRow, select: Where | undefined): Record<string, unknown> {
  if (select === undefined) return copy(row) as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(select)) {
    if (!(INVITE_COLUMNS as readonly string[]).includes(key)) {
      throw new HouseholdFakeUnsupportedError(
        'HouseholdInvite',
        `the select key '${key}' (only the columns are modelled, no relation)`,
      )
    }
    if (value === true) out[key] = copy((row as unknown as Record<string, unknown>)[key])
    else if (value !== false && value !== undefined) {
      throw new HouseholdFakeUnsupportedError('HouseholdInvite', `the select value of '${key}'`)
    }
  }
  return out
}

export interface HouseholdFakeState {
  households: HouseholdRow[]
  householdMembers: HouseholdMemberRow[]
  locationMembers: LocationMemberRow[]
  householdInvites: HouseholdInviteRow[]
}

/**
 * The rows of other fakes that decide whether a household is empty
 * (decision T21). Only the columns the check reads. Pass a function, so the
 * fake sees the CURRENT rows.
 */
export interface HouseholdContents {
  items: readonly { householdId: string }[]
  tags: readonly { householdId: string }[]
  tagTypes: readonly { householdId: string }[]
  vendors: readonly { householdId: string }[]
  recipes: readonly { householdId: string }[]
  shelves: readonly { householdId: string }[]
  itemStocks: readonly { locationId: string }[]
  inventoryLogs: readonly { locationId: string }[]
  carts: readonly { id: string; locationId: string }[]
  cartItems: readonly { cartId: string }[]
}

export interface HouseholdFakeOptions {
  households?: HouseholdRow[]
  householdMembers?: HouseholdMemberRow[]
  locationMembers?: LocationMemberRow[]
  householdInvites?: HouseholdInviteRow[]
  /**
   * The location rows, read on every call that needs one: the foreign key of
   * a `LocationMember` write, and the `location` relation filter. Pass a
   * function so the fake sees the CURRENT rows, for example
   * `() => stockFake.state.locations`. A `LocationMember` write or a
   * `location` filter with no `locations` option throws.
   */
  locations?: () => readonly LocationRef[]
  /**
   * The rows behind the "is it empty" keys of the household `where`
   * (decision T21). A `where` naming one of those keys on a fake built
   * without it throws.
   */
  contents?: () => HouseholdContents
}

export function createHouseholdFake(options: HouseholdFakeOptions = {}) {
  // One plain object of plain data, so `runInTransaction` (stockFake.ts) can
  // register it as a rollback store.
  const state: HouseholdFakeState = {
    households: (options.households ?? []).map(copy),
    householdMembers: (options.householdMembers ?? []).map(copy),
    locationMembers: (options.locationMembers ?? []).map(copy),
    householdInvites: (options.householdInvites ?? []).map(copy),
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

  function contents(): HouseholdContents {
    if (!options.contents) {
      throw new HouseholdFakeUnsupportedError(
        'Household',
        'an "is it empty" filter, because it was built with no `contents` option',
      )
    }
    return options.contents()
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

  /** `members: { every: {...} }`: every member row of `householdId` passes. */
  function everyMember(householdId: string, members: Where): boolean {
    const every = members.every as Where | undefined
    if (every === undefined) return true
    return state.householdMembers
      .filter((m) => m.householdId === householdId)
      .every((m) => memberMatches(m, every))
  }

  /** `{ none: {} }` over `rows`: true when no row belongs to `owner`. */
  function noneOf<R>(filter: Where, rows: readonly R[], belongs: (row: R) => boolean): boolean {
    if (filter.none === undefined) return true
    return !rows.some(belongs)
  }

  /**
   * `locations: { every: {...} }`: every location of the household has no
   * stock row and no log, and every one of its carts has no row (decision
   * T21). A key left out checks nothing.
   */
  function everyLocation(householdId: string, filter: Where): boolean {
    const every = filter.every as Where | undefined
    if (every === undefined) return true
    const c = contents()
    const own = locations('Household').filter((l) => (l.householdId ?? null) === householdId)
    return own.every((location) => {
      const stocks = every.itemStocks as Where | undefined
      if (stocks && !noneOf(stocks, c.itemStocks, (s) => s.locationId === location.id)) {
        return false
      }
      const logs = every.inventoryLogs as Where | undefined
      if (logs && !noneOf(logs, c.inventoryLogs, (l) => l.locationId === location.id)) {
        return false
      }
      const carts = every.carts as Where | undefined
      const cartEvery = carts?.every as Where | undefined
      if (cartEvery !== undefined) {
        const rows = cartEvery.items as Where | undefined
        const ownCarts = c.carts.filter((cart) => cart.locationId === location.id)
        const allEmpty = ownCarts.every(
          (cart) => !rows || noneOf(rows, c.cartItems, (item) => item.cartId === cart.id),
        )
        if (!allEmpty) return false
      }
      return true
    })
  }

  function householdMatches(row: HouseholdRow, where: Where): boolean {
    for (const [key, filter] of Object.entries(where)) {
      if (filter === undefined) continue
      if (key === 'members') {
        if (!someMember(row.id, filter as Where)) return false
        if (!everyMember(row.id, filter as Where)) return false
        continue
      }
      if ((CONTENT_KEYS as readonly string[]).includes(key)) {
        const rows = contents()[key as (typeof CONTENT_KEYS)[number]]
        if (!noneOf(filter as Where, rows, (r) => r.householdId === row.id)) return false
        continue
      }
      if (key === 'locations') {
        if (!everyLocation(row.id, filter as Where)) return false
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

  /**
   * The `user` relation filter on a `LocationMember`:
   * `user: { householdMemberships: { some: {...} } }`. True when at least one
   * `HouseholdMember` row of THIS row's person passes `some`. The `User` row
   * itself is not read: it lives in `userFake`, and the foreign key means it
   * exists.
   */
  function userMatches(userId: string, where: Where): boolean {
    const memberships = where.householdMemberships as Where | undefined
    const some = memberships?.some as Where | undefined
    if (some === undefined) return true
    return state.householdMembers.some((m) => m.userId === userId && memberMatches(m, some))
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
      if (key === 'user') {
        if (!userMatches(row.userId, filter as Where)) return false
        continue
      }
      if (!matchesScalar((row as unknown as Where)[key], filter)) return false
    }
    return true
  }

  /** `HouseholdInvite`: plain keys, plus `expiresAt: { gt }`. The shape was checked already. */
  function inviteMatches(row: HouseholdInviteRow, where: Where): boolean {
    for (const [key, filter] of Object.entries(where)) {
      if (filter === undefined) continue
      if (key === 'expiresAt') {
        // Strict, as in SQL: `expiresAt > now`.
        if (row.expiresAt.getTime() <= (filter as { gt: Date }).gt.getTime()) return false
        continue
      }
      if (!matchesScalar((row as unknown as Where)[key], filter)) return false
    }
    return true
  }

  // ── Once-per-call checks ──

  function checkInviteWhere(where: Where | undefined) {
    checkWhere('householdFake(HouseholdInvite)', where, INVITE_WHERE)
    checkRoleFilter('HouseholdInvite', where?.householdRole, HOUSEHOLD_ROLES)
  }

  function checkHouseholdWhere(where: Where | undefined) {
    checkWhere('householdFake(Household)', where, HOUSEHOLD_WHERE)
    const some = (where?.members as Where | undefined)?.some as Where | undefined
    checkRoleFilter('Household', some?.role, HOUSEHOLD_ROLES)
    // Fail now, not only when a row reaches the matcher: an empty store never
    // calls it.
    if (!where) return
    const usesContents =
      CONTENT_KEYS.some((key) => where[key] !== undefined) || where.locations !== undefined
    if (usesContents) contents()
    if (where.locations !== undefined) locations('Household')
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
    const user = where.user as Where | undefined
    const userSome = (user?.householdMemberships as Where | undefined)?.some as Where | undefined
    checkRoleFilter('LocationMember', userSome?.role, HOUSEHOLD_ROLES)
    // Fail now, not only when a row reaches the matcher.
    if (location !== undefined) locations('LocationMember')
  }

  /**
   * `findUnique` and the single-row writes must name the unique key, with a
   * PLAIN value. Prisma refuses a filter such as `{ id: { in: [...] } }` in a
   * unique where, because it could match more than one row.
   *
   * A compound key (`householdId_userId`, `locationId_userId`) is an object.
   * Its fields are checked elsewhere: the `'equals'` kind in `checkWhere`
   * refuses an operator object, and `checkCompound` requires a string.
   */
  function requireUnique(model: string, method: string, where: Where, key: string) {
    const value = where[key]
    if (value === undefined) {
      throw new HouseholdFakeUnsupportedError(model, `a ${method} whose where has no '${key}'`)
    }
    if (key === 'id' && typeof value !== 'string') {
      throw new HouseholdFakeUnsupportedError(
        model,
        `a ${method} whose 'id' is not a plain string (${JSON.stringify(value)}). ` +
          'Prisma allows no filter on the unique key here',
      )
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

  function checkInviteRow(row: HouseholdInviteRow, others: HouseholdInviteRow[]) {
    const model = 'HouseholdInvite'
    for (const column of ['householdId', 'token', 'householdRole', 'createdById'] as const) {
      if (typeof row[column] !== 'string') throw new HouseholdFakeMissingColumnError(model, column)
    }
    if (row.locationRoles === undefined || row.locationRoles === null) {
      throw new HouseholdFakeMissingColumnError(model, 'locationRoles')
    }
    if (!(row.expiresAt instanceof Date)) {
      throw new HouseholdFakeMissingColumnError(model, 'expiresAt')
    }
    if (!HOUSEHOLD_ROLES.includes(row.householdRole)) {
      throw new InvalidRoleError(model, row.householdRole, HOUSEHOLD_ROLES)
    }
    if (!state.households.some((h) => h.id === row.householdId)) {
      throw new HouseholdFakeForeignKeyError(model, 'householdId', row.householdId)
    }
    if (others.some((i) => i.id === row.id)) {
      throw new HouseholdFakeUniqueError(model, 'HouseholdInvite_pkey', row.id)
    }
    if (others.some((i) => i.token === row.token)) {
      // The token is secret, so the error does not print it.
      throw new HouseholdFakeUniqueError(model, 'HouseholdInvite_token_key', 'token')
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

  function insertInvite(data: Data): HouseholdInviteRow {
    // `locationRoles` is a JSON list, so it is not refused as a nested write.
    const { locationRoles, ...rest } = data
    refuseNestedData('HouseholdInvite', rest)
    const row = {
      usedAt: null,
      usedById: null,
      revokedAt: null,
      createdAt: new Date(),
      ...stripUndefined(rest),
      id: (data.id as string | undefined) ?? `invite-${++seq}`,
      locationRoles: copy(locationRoles),
    } as HouseholdInviteRow
    checkInviteRow(row, state.householdInvites)
    state.householdInvites.push(row)
    return row
  }

  // ── Updates. Each builds the new row, checks it, then writes it. ──

  function updateHouseholdRow(row: HouseholdRow, data: Data): HouseholdRow {
    refuseNestedData('Household', data)
    if (data.id !== undefined && data.id !== row.id) {
      throw new HouseholdFakeUnsupportedError('Household', 'an update that changes the id')
    }
    // Build the new row and check it BEFORE writing, as the member updates do,
    // so a refused update leaves the row as it was.
    const next = { ...row, ...stripUndefined(data) } as HouseholdRow
    if (typeof next.name !== 'string') {
      throw new HouseholdFakeMissingColumnError('Household', 'name')
    }
    Object.assign(row, next)
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

  function updateInviteRow(row: HouseholdInviteRow, data: Data): HouseholdInviteRow {
    const { locationRoles, ...rest } = data
    refuseNestedData('HouseholdInvite', rest)
    if (rest.id !== undefined && rest.id !== row.id) {
      throw new HouseholdFakeUnsupportedError('HouseholdInvite', 'an update that changes the id')
    }
    const next = { ...row, ...stripUndefined(rest) } as HouseholdInviteRow
    if (locationRoles !== undefined) next.locationRoles = copy(locationRoles) as typeof next.locationRoles
    checkInviteRow(
      next,
      state.householdInvites.filter((i) => i !== row),
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
    // Households H5b, task G.4 (`lockHouseholds` in lib/household.ts): one
    // `UPDATE` per household, and a count instead of P2025 when no row
    // matches.
    updateMany: async (args: { where?: Where; data: Data }) => {
      refuseUnknownOptions('Household', 'updateMany', args, ['where', 'data'])
      checkHouseholdWhere(args.where)
      let count = 0
      for (const row of state.households) {
        if (!householdMatches(row, args.where ?? {})) continue
        updateHouseholdRow(row, args.data)
        count++
      }
      return { count }
    },
    // Households H5b, task G.4 (decision T21). Cascades only inside this
    // fake: member rows, invites, and the location role rows of the
    // household's locations. See the file head.
    deleteMany: async (args: { where?: Where } = {}) => {
      refuseUnknownOptions('Household', 'deleteMany', args, ['where'])
      checkHouseholdWhere(args.where)
      const ids = new Set(
        state.households.filter((h) => householdMatches(h, args.where ?? {})).map((h) => h.id),
      )
      if (ids.size === 0) return { count: 0 }
      const locationIds = new Set(
        (options.locations?.() ?? [])
          .filter((l) => l.householdId != null && ids.has(l.householdId))
          .map((l) => l.id),
      )
      state.households = state.households.filter((h) => !ids.has(h.id))
      state.householdMembers = state.householdMembers.filter((m) => !ids.has(m.householdId))
      state.householdInvites = state.householdInvites.filter((i) => !ids.has(i.householdId))
      state.locationMembers = state.locationMembers.filter((m) => !locationIds.has(m.locationId))
      return { count: ids.size }
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
    findMany: async (
      args: { where?: Where; select?: Where; distinct?: string | string[] } = {},
    ) => {
      refuseUnknownOptions('LocationMember', 'findMany', args, [...READ, 'distinct'])
      checkLocationMemberWhere(args.where)
      const columns = distinctColumns(args.distinct)
      const rows = state.locationMembers.filter((m) => locationMemberMatches(m, args.where ?? {}))
      if (columns.length === 0) return rows.map(copy)
      const seen = new Set<string>()
      return rows
        .filter((m) => {
          const key = JSON.stringify(columns.map((c) => (m as unknown as Where)[c]))
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
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

  // A row used only to check a `create`'s select before the insert.
  const placeholderInvite = Object.fromEntries(
    INVITE_COLUMNS.map((c) => [c, null]),
  ) as unknown as HouseholdInviteRow

  const householdInvite = {
    findUnique: async (args: { where: Where; select?: Where }) => {
      refuseUnknownOptions('HouseholdInvite', 'findUnique', args, READ)
      checkInviteWhere(args.where)
      // Prisma: a unique where names exactly one unique key, as a plain value.
      const keys = (['id', 'token'] as const).filter((k) => args.where[k] !== undefined)
      if (keys.length !== 1 || typeof args.where[keys[0] as string] !== 'string') {
        throw new HouseholdFakeUnsupportedError(
          'HouseholdInvite',
          "a findUnique that does not name exactly one of 'id' or 'token' as a plain string",
        )
      }
      const row = state.householdInvites.find((i) => inviteMatches(i, args.where))
      // biome-ignore lint/suspicious/noExplicitAny: the shape depends on `select`, as in Prisma
      return (row ? selectInvite(row, args.select) : null) as any
    },
    findMany: async (args: { where?: Where; select?: Where } = {}) => {
      refuseUnknownOptions('HouseholdInvite', 'findMany', args, READ)
      checkInviteWhere(args.where)
      return state.householdInvites
        .filter((i) => inviteMatches(i, args.where ?? {}))
        // biome-ignore lint/suspicious/noExplicitAny: the shape depends on `select`, as in Prisma
        .map((i) => selectInvite(i, args.select)) as any[]
    },
    create: async (args: { data: Data; select?: Where }) => {
      refuseUnknownOptions('HouseholdInvite', 'create', args, ['data', 'select'])
      // The select is checked BEFORE the insert, so a bad one writes nothing.
      if (args.select !== undefined) selectInvite(placeholderInvite, args.select)
      // biome-ignore lint/suspicious/noExplicitAny: the shape depends on `select`, as in Prisma
      return selectInvite(insertInvite(args.data), args.select) as any
    },
    updateMany: async (args: { where?: Where; data: Data }) => {
      refuseUnknownOptions('HouseholdInvite', 'updateMany', args, ['where', 'data'])
      checkInviteWhere(args.where)
      let count = 0
      for (const row of state.householdInvites) {
        if (!inviteMatches(row, args.where ?? {})) continue
        updateInviteRow(row, args.data)
        count++
      }
      return { count }
    },
  }

  const client = { household, householdMember, locationMember, householdInvite }

  /** Replace the store's contents. The rows are copied. */
  function reset(next: Omit<HouseholdFakeOptions, 'locations'> = {}) {
    state.households = (next.households ?? []).map(copy)
    state.householdMembers = (next.householdMembers ?? []).map(copy)
    state.locationMembers = (next.locationMembers ?? []).map(copy)
    state.householdInvites = (next.householdInvites ?? []).map(copy)
    seq = 0
  }

  return { state, client, reset }
}

export type HouseholdFake = ReturnType<typeof createHouseholdFake>
