import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import { requireAuth } from '../context.js'
import { forbidden, requireHousehold, requireHouseholdRole } from '../lib/authz.js'
import {
  displayNamesOf,
  HOUSEHOLD_MOVE_TIMEOUT_MS,
  lockHouseholds,
  lockUser,
} from '../lib/household.js'
import {
  alreadyMember,
  emptyHouseholdWhere,
  hasInviteTokenLength,
  type InviteLocationRoleEntry,
  inviteExpiresAt,
  inviteInvalid,
  newInviteToken,
  parseLocationRoles,
} from '../lib/invite.js'
import { recordActivity } from '../lib/activity.js'
import { prisma } from '../lib/prisma.js'
import { publishHouseholdChange } from '../lib/publishChange.js'
import { householdAnswer } from './ownership.resolver.js'
import type { Resolvers } from '../generated/graphql.js'

// Create, list, preview and revoke household invites (households H5b, task
// G.3; plan docs/global/permissions/2026-11-18-households-plan-h5b.md,
// decisions T12, T17, T18, T19, T22, T26 and T27, owner decisions O3-A,
// O6-A, O7-A, O13-A, O14-A and O15-A), and join with one (`joinHousehold`,
// task G.4, decisions T16, T17, T20 and T21, owner decision O2-A).
//
// No role is checked by comparing ids in code. The household comes from
// `requireHousehold`, the role from `requireHouseholdRole`, and every read
// and write of an invite carries `householdId` in its `where`.

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } })
}

/** One location role as the API shows it: with the location's name. */
interface NamedLocationRole {
  locationId: string
  locationName: string
  role: InviteLocationRoleEntry['role']
}

/**
 * The names of every location of one household, by id. One read. A location
 * deleted since an invite was made is not in it, so it drops out of the
 * invite's list (the "Only locations that still exist" rule of the schema).
 */
async function locationNames(householdId: string): Promise<Map<string, string>> {
  const rows = await prisma.location.findMany({
    where: { householdId },
    select: { id: true, name: true },
  })
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** The invite's location roles, keeping only locations that still exist. */
function namedRoles(json: unknown, names: Map<string, string>): NamedLocationRole[] {
  const out: NamedLocationRole[] = []
  for (const entry of parseLocationRoles(json)) {
    const locationName = names.get(entry.locationId)
    if (locationName !== undefined) out.push({ ...entry, locationName })
  }
  return out
}

/** An invite row is open while it is not used, not revoked and not expired. */
function isOpen(
  row: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): boolean {
  // Strict, as the list's `expiresAt: { gt: now }` and G.4's claim: an
  // invite that expires at exactly `now` is no longer open.
  return row.usedAt === null && row.revokedAt === null && row.expiresAt.getTime() > now.getTime()
}

/** True for Prisma's "write conflict or deadlock" (P2034). */
function isWriteConflict(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2034'
  )
}

/**
 * Run `work` (a whole transaction), and run it ONCE more when it fails with
 * P2034, the error Prisma gives for a Postgres deadlock (`40P01`) or a write
 * conflict. A second failure is thrown as it is. Postgres has rolled the
 * first attempt back, so the second starts from a clean state.
 *
 * Why `joinHousehold` needs it: deleting an empty own household also sets
 * `User.activeHouseholdId` to null on every `User` row that still names it
 * (`onDelete: SetNull`), so a join can write another person's `User` row
 * while it holds household locks. Two joins at once can then wait on each
 * other. Also two people who join each other's household at the same moment.
 * Postgres breaks the wait by failing one of them; one retry turns that into
 * a normal join (or a normal refusal, when the invite is gone by then).
 */
export async function retryOnceOnConflict<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (!isWriteConflict(err)) throw err
    return work()
  }
}

const INVALID_PREVIEW = {
  status: 'INVALID' as const,
  householdName: null,
  invitedByName: null,
  householdRole: null,
  locationRoles: null,
}

export const inviteResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    // Owner and manager (owner decision O13-A: a member sees no invites). A
    // manager sees only `member` invites (O15-A, decision T27). Oldest first;
    // the order is made here, from `createdAt` and then `id`, so it is the
    // same on every call.
    householdInvites: async (_, __, ctx) => {
      const householdId = await requireHousehold(ctx)
      const role = await requireHouseholdRole(ctx, householdId, 'manager')
      const now = new Date()
      const rows = await prisma.householdInvite.findMany({
        where: {
          householdId,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
          householdRole: role === 'manager' ? 'member' : undefined,
        },
      })
      rows.sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      const [names, people] = await Promise.all([
        locationNames(householdId),
        displayNamesOf(rows.map((row) => row.createdById)),
      ])
      return rows.map((row) => ({
        id: row.id,
        token: row.token,
        householdRole: row.householdRole,
        locationRoles: namedRoles(row.locationRoles, names),
        createdByName: people.get(row.createdById) ?? '',
        expiresAt: row.expiresAt.toISOString(),
      }))
    },

    // Any signed-in person (decision T22). It must NOT call
    // `requireHousehold`: a person with no household would get NO_HOUSEHOLD.
    // (It does NOT keep a brand-new person from getting a household. On the
    // real `/join/…` page other root queries, from `HouseholdChangeGuard`,
    // `ActiveLocationProvider` and `PostLoginMigrationDialog`, already call
    // `requireHousehold`, so first sign-in makes one. The join then deletes
    // it as empty, decision T21.) It never throws for a token, and it never
    // returns one. INVALID carries no name at all (decision T18). A token of the wrong
    // length cannot name an invite, so it is INVALID with no read at all. The
    // read selects every column but the token.
    invitePreview: async (_, { token }, ctx) => {
      const userId = requireAuth(ctx)
      if (!hasInviteTokenLength(token)) return INVALID_PREVIEW
      const row = await prisma.householdInvite.findUnique({
        where: { token },
        select: {
          householdId: true,
          householdRole: true,
          locationRoles: true,
          createdById: true,
          expiresAt: true,
          usedAt: true,
          revokedAt: true,
        },
      })
      if (!row || !isOpen(row, new Date())) return INVALID_PREVIEW
      const [membership, household, people, names] = await Promise.all([
        prisma.householdMember.findUnique({
          where: { householdId_userId: { householdId: row.householdId, userId } },
          select: { role: true },
        }),
        prisma.household.findUnique({ where: { id: row.householdId }, select: { name: true } }),
        displayNamesOf([row.createdById]),
        locationNames(row.householdId),
      ])
      return {
        // "Already in this household: the link is not used up" (design,
        // *Invite and join*). The page says it before the person presses Join.
        status: membership ? ('ALREADY_MEMBER' as const) : ('VALID' as const),
        householdName: household?.name ?? '',
        invitedByName: people.get(row.createdById) ?? '',
        householdRole: row.householdRole,
        locationRoles: namedRoles(row.locationRoles, names),
      }
    },
  },

  Mutation: {
    // Owner or manager. One INSERT, so no `lockHousehold`: nothing it reads
    // decides what another write may do. The INSERT and its activity row run
    // in one interactive transaction (households H6 task J.2, decision T47),
    // so both are written or neither is. That transaction takes no lock, so
    // it adds nothing to the lock order (decision T16). The checks, in order: the role
    // (FORBIDDEN), no `owner` invite (BAD_USER_INPUT), only the owner invites
    // a `manager` (O3-A, FORBIDDEN), no location twice (BAD_USER_INPUT),
    // every location in this household (FORBIDDEN, the same answer for an
    // unknown id and another household's).
    createInvite: async (_, { householdRole, locationRoles }, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      const callerRole = await requireHouseholdRole(ctx, householdId, 'manager')
      if (householdRole === 'owner') {
        throw badInput('An invite cannot make a person the owner.')
      }
      if (householdRole === 'manager' && callerRole !== 'owner') throw forbidden()

      const ids = locationRoles.map((entry) => entry.locationId)
      if (new Set(ids).size !== ids.length) {
        throw badInput('An invite names a location twice.')
      }
      if (ids.length > 0) {
        const found = await prisma.location.findMany({
          where: { id: { in: ids }, householdId },
          select: { id: true },
        })
        if (found.length !== ids.length) throw forbidden()
      }

      const entries: InviteLocationRoleEntry[] = locationRoles.map((entry) => ({
        locationId: entry.locationId,
        role: entry.role,
      }))
      const now = new Date()
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.householdInvite.create({
          data: {
            householdId,
            token: newInviteToken(),
            householdRole,
            locationRoles: entries as unknown as Prisma.InputJsonValue,
            createdById: userId,
            expiresAt: inviteExpiresAt(now),
          },
        })
        await recordActivity(tx, {
          householdId,
          actorId: userId,
          action: 'INVITE_CREATED',
          details: { householdRole },
        })
        return created
      })
      // Household-level `LOCATION` (decision T19): every open tab of the
      // household refetches, so the Members page shows the new invite. Sent
      // right after the commit, BEFORE the two reads below: if one of them
      // throws, the row is still written and the other tabs must still hear
      // of it.
      await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      const [names, people] = await Promise.all([
        locationNames(householdId),
        displayNamesOf([userId]),
      ])
      return {
        id: row.id,
        token: row.token,
        householdRole: row.householdRole,
        locationRoles: namedRoles(row.locationRoles, names),
        createdByName: people.get(userId) ?? '',
        expiresAt: row.expiresAt.toISOString(),
      }
    },

    // Any signed-in person, also one in no household: it must NOT call
    // `requireHousehold` (decision T22), which throws NO_HOUSEHOLD for a
    // person who left or was removed. A brand-new person usually HAS a
    // household by now: other root queries on the `/join/…` page called
    // `requireHousehold` first, and step 9 deletes that household as empty.
    // ONE transaction, in this order:
    //
    //   1. `lockUser` — the caller's `User` row lock, FIRST (decision T16).
    //      Two joins by one person run one after the other. Then the first
    //      sign-in claim (`householdSetupAt`), when it is still null: a
    //      person can join before any request made them a household. Without
    //      it, after a later leave or removal `ensureHousehold` would make a
    //      new household instead of answering NO_HOUSEHOLD, and a first
    //      request racing this join could make a stray empty household.
    //      Other transactions take household locks and write no User row,
    //      with one exception: a household delete sets
    //      `User.activeHouseholdId` to null on every row that names it (see
    //      `lockUser`). That is why the whole join is retried once on P2034.
    //   2. Read the invite by token. Not found, or not open → INVITE_INVALID.
    //      The same answer as `invitePreview` gives, before any other check.
    //   3. Read the caller's other memberships, and lock the invite's
    //      household AND those households together, sorted by id
    //      (`lockHouseholds`). Sorted, so two joins never take them in
    //      opposite orders. The other households are locked because step 9
    //      may delete them: without the lock, a person joining one of them at
    //      the same moment could commit between the "is it empty" check and
    //      the delete, and lose their new membership with it. The invite's
    //      household not found → INVITE_INVALID (it was deleted, with its
    //      invites). An own household not found is skipped.
    //   4. ALREADY_MEMBER, BEFORE the claim (decision T17), with the same
    //      check as `invitePreview`: the caller's member row in the INVITE's
    //      household. The link stays unused, and a member gets an answer
    //      about themselves even if the link was used in the meantime.
    //   5. The claim: ONE conditional `updateMany` that matches only while
    //      the invite is unused, not revoked and not expired (decision T17).
    //      Under READ COMMITTED the second of two joins re-checks the `where`
    //      after the first commits and matches 0 rows → INVITE_INVALID.
    //      `revokeInvite` writes with `usedAt: null, revokedAt: null` in its
    //      `where`, so a join and a revoke at the same moment cannot both win.
    //      Do not drop any key of this `where`.
    //   6. The member row, with the invite's household role.
    //   7. Delete the caller's location role rows in this household (decision
    //      T20: a leftover row must not come back), then write the invite's
    //      roles on the locations that still exist in it. A location deleted
    //      since is skipped, with no error.
    //   8. `activeHouseholdId` → this household. The User lock is already
    //      held, so this write breaks no lock order.
    //   9. Delete the caller's OTHER households that are empty, with one
    //      conditional statement (decision T21, `emptyHouseholdWhere`). Only
    //      the ones locked in step 3.
    //  10. The `MEMBER_JOINED` activity row (households H6 task J.2).
    //
    // A wrong-length token is refused before the transaction, with no read
    // and no lock: no stored token has another length. A bad `locationRoles`
    // row makes `parseLocationRoles` throw a plain Error. It is NOT caught:
    // the transaction rolls back and the error reaches the logs.
    //
    // After the commit, one household-level `LOCATION` event for the joined
    // household (decision T19). The caller is a member there now, so their
    // other tabs get it too, and refetch everything. Nothing is sent to the
    // household that was deleted (nobody is left in it to hear it) or to a
    // household that was kept (nothing in it changed).
    joinHousehold: async (_, { token }, ctx) => {
      const userId = requireAuth(ctx)
      if (!hasInviteTokenLength(token)) throw inviteInvalid()

      const joined = await retryOnceOnConflict(() => prisma.$transaction(async (tx) => {
        await lockUser(tx, userId)

        const now = new Date()
        await tx.user.updateMany({
          where: { id: userId, householdSetupAt: null },
          data: { householdSetupAt: now },
        })

        const row = await tx.householdInvite.findUnique({
          where: { token },
          select: {
            id: true,
            householdId: true,
            householdRole: true,
            locationRoles: true,
            expiresAt: true,
            usedAt: true,
            revokedAt: true,
          },
        })
        if (!row || !isOpen(row, now)) throw inviteInvalid()
        const householdId = row.householdId

        const others = await tx.householdMember.findMany({
          where: { userId },
          select: { householdId: true },
        })
        const otherIds = others.map((m) => m.householdId).filter((id) => id !== householdId)
        const locked = await lockHouseholds(tx, [householdId, ...otherIds])
        // The household was deleted after the invite was read. Its invites
        // went with it (onDelete: Cascade).
        if (!locked.has(householdId)) throw inviteInvalid()

        const membership = await tx.householdMember.findUnique({
          where: { householdId_userId: { householdId, userId } },
          select: { role: true },
        })
        if (membership) throw alreadyMember()

        const { count } = await tx.householdInvite.updateMany({
          where: {
            id: row.id,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { usedAt: now, usedById: userId },
        })
        if (count === 0) throw inviteInvalid()

        await tx.householdMember.create({
          data: { householdId, userId, role: row.householdRole },
        })

        await tx.locationMember.deleteMany({
          where: { userId, location: { householdId } },
        })
        const wanted = parseLocationRoles(row.locationRoles)
        // The roles really given, with each location's name, for the
        // activity row below.
        const given: NamedLocationRole[] = []
        if (wanted.length > 0) {
          const existing = await tx.location.findMany({
            where: { id: { in: wanted.map((entry) => entry.locationId) }, householdId },
            select: { id: true, name: true },
          })
          const names = new Map(existing.map((location) => [location.id, location.name]))
          for (const entry of wanted) {
            const locationName = names.get(entry.locationId)
            if (locationName === undefined) continue
            await tx.locationMember.create({
              data: { locationId: entry.locationId, userId, role: entry.role },
            })
            given.push({ locationId: entry.locationId, locationName, role: entry.role })
          }
        }

        await tx.user.update({
          where: { id: userId },
          data: { activeHouseholdId: householdId },
        })

        const deletable = otherIds.filter((id) => locked.has(id))
        if (deletable.length > 0) {
          await tx.household.deleteMany({ where: emptyHouseholdWhere(userId, deletable) })
        }

        // 10. The activity row (households H6 task J.2), in the joined
        //     household, inside this callback. So a first attempt that fails
        //     with P2034 rolls its row back with everything else, and the
        //     retry writes ONE row. A location deleted since the invite was
        //     made is not in it, the same as its role.
        await recordActivity(tx, {
          householdId,
          actorId: userId,
          action: 'MEMBER_JOINED',
          details: {
            householdRole: row.householdRole,
            locationRoles: given.map((entry) => ({ ...entry })),
          },
        })

        const household = await tx.household.findUnique({
          where: { id: householdId },
          select: { id: true, name: true },
        })
        // Unreachable: the household lock above found this row, and the
        // `deleteMany` cannot match it (it is not in `otherIds`).
        if (!household) throw new Error('joinHousehold: the joined household is gone')
        return { id: household.id, name: household.name, role: row.householdRole }
        // See `HOUSEHOLD_MOVE_TIMEOUT_MS`: an E2E join once took 5064 ms
        // against the 5 s default.
      }, { timeout: HOUSEHOLD_MOVE_TIMEOUT_MS }))

      await publishHouseholdChange(ctx, ['LOCATION'], joined.id)
      return householdAnswer(joined)
    },

    // Owner or manager. ONE conditional write, so a revoke and a join at the
    // same moment cannot both win: the row changes only while it is still
    // open. A manager revokes only `member` invites (O15-A). Everything that
    // is not revocable for this caller gives `false`, the same answer as an
    // unknown id, so the answer says nothing about another household's ids.
    // Expiry is not in the `where`, on purpose: revoking an expired, unused
    // invite answers `true` and publishes. That is harmless: the invite could
    // not be used anyway (G.4's claim also needs `expiresAt > now`), the list
    // leaves it out either way, and one extra refetch costs little. Keeping
    // the `where` short keeps it the same as the claim's other half.
    //
    // The write and its activity row run in one interactive transaction
    // (households H6 task J.2, decision T47). The row is written only when
    // the invite was revoked: a `false` answer logs nothing. The transaction
    // takes no lock, so it adds nothing to the lock order (decision T16).
    revokeInvite: async (_, { id }, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      const callerRole = await requireHouseholdRole(ctx, householdId, 'manager')
      const revoked = await prisma.$transaction(async (tx) => {
        const { count } = await tx.householdInvite.updateMany({
          where: {
            id,
            householdId,
            usedAt: null,
            revokedAt: null,
            householdRole: callerRole === 'manager' ? 'member' : undefined,
          },
          data: { revokedAt: new Date() },
        })
        if (count !== 1) return false
        await recordActivity(tx, { householdId, actorId: userId, action: 'INVITE_REVOKED' })
        return true
      })
      if (!revoked) return false
      await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return true
    },
  },
}
