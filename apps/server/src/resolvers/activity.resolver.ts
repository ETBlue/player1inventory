import { GraphQLError } from 'graphql'
import type { HouseholdActivity, HouseholdRole, Prisma } from '@prisma/client'
import { requireAuth } from '../context.js'
import { requireHousehold, requireHouseholdRole } from '../lib/authz.js'
import { type AccountName, accountNamesOf } from '../lib/household.js'
import { prisma } from '../lib/prisma.js'
import type {
  ActivityImportCounts,
  HouseholdActivityEntry,
  Resolvers,
} from '../generated/graphql.js'

// The `householdActivity` query (households H6, task J.3; decisions T53 and
// T54 of docs/global/permissions/2026-11-20-households-plan-h6.md).
//
// ── WHO MAY READ IT ──
//
// The owner and the managers of the household the caller acts in
// (`requireHousehold`). A household `member` gets FORBIDDEN, also when they
// organize a location: the log names people and locations the member may not
// see (Review Focus 6).
//
// ── THE ORDER AND THE CURSOR ──
//
// Newest first by `createdAt`, then by `id`. Rows written in ONE transaction
// can have the same `createdAt`, so `id` must break the tie, and the cursor
// must use both columns: "older than the cursor row, or the same time and a
// smaller id". A cursor on `createdAt` alone would skip the other rows of
// that time.
//
// `id` is compared as text. Postgres compares it with the column's collation,
// and the `ORDER BY` uses the same collation, so the cursor and the order
// agree. The test fake compares with JavaScript's string order, and its sort
// does too. The ids are cuids (lowercase letters and digits), so the order
// among tied rows is stable but is NOT the order they were written in.
//
// ── NAMES ──
//
// Person names are read now, from `User` (one read for the whole page, no
// e-mail). A deleted account keeps its stored name; the entry says it is
// deleted, and the web adds "(deleted account)" (owner decision O35-A). The
// location name comes from `details`, stored when the row was written,
// because the location may be renamed or deleted since.

const DEFAULT_FIRST = 50
const MAX_FIRST = 200

const HOUSEHOLD_ROLE_VALUES: readonly string[] = ['owner', 'manager', 'member']

const IMPORT_COUNT_KEYS = [
  'items',
  'tags',
  'tagTypes',
  'vendors',
  'recipes',
  'shelves',
  'locations',
  'itemStocks',
  'inventoryLogs',
  'shoppingCarts',
  'cartItems',
] as const satisfies readonly (keyof ActivityImportCounts)[]

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** A string from `details`, or null for anything else. */
function text(details: Record<string, unknown>, key: string): string | null {
  const value = details[key]
  return typeof value === 'string' ? value : null
}

function wholeCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/** The 11 import counts, or null when `details.counts` is not an object. A missing count is 0. */
function importCounts(details: Record<string, unknown>): ActivityImportCounts | null {
  const counts = details.counts
  if (!isObject(counts)) return null
  const out = {} as ActivityImportCounts
  for (const key of IMPORT_COUNT_KEYS) out[key] = wholeCount(counts[key]) ?? 0
  return out
}

/**
 * One stored row as one entry. `details` is JSON that the server wrote, but
 * it is read defensively: a value of the wrong shape gives null, not an
 * error, so one odd row cannot break the whole page.
 */
function toEntry(
  row: HouseholdActivity,
  callerId: string,
  names: Map<string, AccountName>,
): HouseholdActivityEntry {
  const details = isObject(row.details) ? row.details : {}
  const actor = names.get(row.actorId)
  const target = row.targetUserId === null ? null : names.get(row.targetUserId)
  const householdRole = text(details, 'householdRole')
  return {
    id: row.id,
    action: row.action,
    createdAt: row.createdAt.toISOString(),
    // An actor with no `User` row: only after /e2e/cleanup deleted it.
    actorName: actor?.displayName ?? '',
    actorIsMe: row.actorId === callerId,
    actorDeleted: actor?.deleted ?? true,
    targetName: row.targetUserId === null ? null : (target?.displayName ?? ''),
    targetIsMe: row.targetUserId === null ? null : row.targetUserId === callerId,
    targetDeleted: row.targetUserId === null ? null : (target?.deleted ?? true),
    locationName: text(details, 'locationName'),
    fromRole: text(details, 'from'),
    toRole: text(details, 'to'),
    householdRole:
      householdRole !== null && HOUSEHOLD_ROLE_VALUES.includes(householdRole)
        ? (householdRole as HouseholdRole)
        : null,
    count: wholeCount(details.count),
    importCounts: row.action === 'IMPORT' ? importCounts(details) : null,
  }
}

export const activityResolvers: Resolvers = {
  Query: {
    householdActivity: async (_, { before, first }, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      await requireHouseholdRole(ctx, householdId, 'manager')

      if (first !== null && first !== undefined && first < 1) {
        throw badInput('householdActivity: first must be 1 or more.')
      }
      const take = Math.min(first ?? DEFAULT_FIRST, MAX_FIRST)

      const where: Prisma.HouseholdActivityWhereInput = { householdId }
      if (before !== null && before !== undefined) {
        // The cursor row must be in THIS household. An unknown id and an id
        // of another household get the same answer.
        const cursor = await prisma.householdActivity.findFirst({
          where: { id: before, householdId },
          select: { id: true, createdAt: true },
        })
        if (!cursor) throw badInput('householdActivity: before is not an entry of this household.')
        where.OR = [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ]
      }

      const rows = await prisma.householdActivity.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      })

      const people = rows.flatMap((row) =>
        row.targetUserId === null ? [row.actorId] : [row.actorId, row.targetUserId],
      )
      const names = await accountNamesOf(people)
      return rows.map((row) => toEntry(row, userId, names))
    },
  },
}
