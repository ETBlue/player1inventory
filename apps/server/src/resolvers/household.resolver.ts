import { GraphQLError } from 'graphql'
import type { HouseholdRole } from '@prisma/client'
import { requireAuth } from '../context.js'
import { forbidden, requireHousehold, requireHouseholdRole } from '../lib/authz.js'
import {
  alreadyInHousehold,
  createHouseholdFor,
  firstLocationName,
  firstSignInNames,
  HOUSEHOLD_NAME_MAX_LENGTH,
  lockHousehold,
  lockUser,
} from '../lib/household.js'
import { prisma } from '../lib/prisma.js'
import { publishHouseholdChange } from '../lib/publishChange.js'
import type { Resolvers } from '../generated/graphql.js'

// The caller's household: its name, and the caller's role in it (households
// H3a, task 3.13, decision H4).

function badName(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } })
}

/**
 * The name `renameHousehold` writes: trimmed, not empty, and at most
 * `HOUSEHOLD_NAME_MAX_LENGTH` characters. Throws `BAD_USER_INPUT` otherwise.
 *
 * The length is counted in UTF-16 code units (`String.length`), the same
 * unit the web form's `maxLength` counts in, so the two agree.
 */
export function cleanHouseholdName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') throw badName('The household name cannot be empty.')
  if (trimmed.length > HOUSEHOLD_NAME_MAX_LENGTH) {
    throw badName(`The household name can have at most ${HOUSEHOLD_NAME_MAX_LENGTH} characters.`)
  }
  return trimmed
}

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } })
}

/** The owner first, then managers and members by when they joined. */
const OWNER_FIRST: Record<HouseholdRole, number> = { owner: 0, manager: 1, member: 1 }

/** One member row as `HouseholdPerson`, with the person's display name. */
function person(
  row: { userId: string; role: HouseholdRole; joinedAt: Date },
  names: Map<string, string>,
  callerId: string,
) {
  return {
    userId: row.userId,
    // Every member has a `User` row (a foreign key). `''` should never show.
    displayName: names.get(row.userId) ?? '',
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
    // Not an authorization check: it only marks the caller's own row.
    isMe: row.userId === callerId,
  }
}

/**
 * The display names of some people, by id. Names ONLY: the select never
 * names `email`, so no role can read an address through this list (owner
 * decision O13-A).
 */
async function displayNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map()
  const rows = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: { id: true, displayName: true },
  })
  return new Map(rows.map((row) => [row.id, row.displayName]))
}

/**
 * Remove one person from one household, inside the caller's transaction:
 * their location roles on the household's locations first (decision T11:
 * a leftover row would come back on a re-invite, D9), then their member row.
 * The `location: { householdId }` filter keeps their roles in any OTHER
 * household. It never writes a `User` row (decision T16), so the person's
 * `activeHouseholdId` may still name this household. `ensureHousehold`
 * ignores an active household the person is no longer a member of.
 */
async function removeFromHousehold(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  householdId: string,
  userId: string,
): Promise<void> {
  await tx.locationMember.deleteMany({ where: { userId, location: { householdId } } })
  await tx.householdMember.delete({
    where: { householdId_userId: { householdId, userId } },
  })
}

export const householdResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    // Any household role may read the name: `member` is the lowest. First
    // sign-in happens in `requireHousehold` for a new person.
    household: async (_, __, ctx) => {
      const householdId = await requireHousehold(ctx)
      const role = await requireHouseholdRole(ctx, householdId, 'member')
      const row = await prisma.household.findUnique({
        where: { id: householdId },
        select: { id: true, name: true },
      })
      // Unreachable while the caller holds a role in it: `HouseholdMember`
      // has a foreign key to the household.
      if (!row) throw new Error('household: the household row of the caller is gone')
      return { id: row.id, name: row.name, role }
    },

    // Any household role (owner decision O13-A): a member sees every person's
    // name and household role. No e-mail, no invites.
    householdMembers: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      await requireHouseholdRole(ctx, householdId, 'member')
      const rows = await prisma.householdMember.findMany({
        where: { householdId },
        select: { userId: true, role: true, joinedAt: true },
      })
      rows.sort(
        (a, b) =>
          OWNER_FIRST[a.role] - OWNER_FIRST[b.role] ||
          a.joinedAt.getTime() - b.joinedAt.getTime() ||
          (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
      )
      const names = await displayNames(rows.map((row) => row.userId))
      return rows.map((row) => person(row, names, userId))
    },
  },

  Mutation: {
    // Household role `owner` (decision H4). The role check runs BEFORE the
    // name is checked, so a manager or member gets FORBIDDEN whatever name
    // they send.
    //
    // No `lockHousehold` here, on purpose. The rename is one `UPDATE` of one
    // row, and Postgres runs a single statement atomically, so two renames at
    // once end with one of the two names, never a mix. `lockHousehold` exists
    // for a read-then-write that must not interleave (`deleteLocation` counts
    // and then deletes). This mutation reads nothing that the write depends
    // on. The one gap: the role is read before the `UPDATE`, so an owner who
    // hands the household over (H6) at the same moment could still rename it
    // once. H6 decides whether that matters.
    renameHousehold: async (_, { name }, ctx) => {
      const householdId = await requireHousehold(ctx)
      const role = await requireHouseholdRole(ctx, householdId, 'owner')
      const clean = cleanHouseholdName(name)
      const row = await prisma.household.update({
        where: { id: householdId },
        data: { name: clean },
        select: { id: true, name: true },
      })
      // `CATALOG` (households H3c-2 task D.4): the name is in every member's
      // sidebar, and on the web `GetHousehold` is refetched for `CATALOG`.
      // For the SAVED row's household.
      await publishHouseholdChange(ctx, ['CATALOG'], row.id)
      return { id: row.id, name: row.name, role }
    },

    // ── setHouseholdRole, removeMember, leaveHousehold (task G.5) ──
    //
    // The same shape for all three. One transaction:
    //
    //   1. `lockHousehold` FIRST. Two of these writes on one household run
    //      one after the other, so a check never reads a role that another
    //      write is changing at the same moment (for example a manager who
    //      removes a member while the owner demotes that manager).
    //   2. The caller's role, with `requireHouseholdRole`, read through `tx`
    //      (the transaction's own connection, not a second one from the
    //      pool). It is a new statement after the lock, so under READ
    //      COMMITTED it sees what an earlier write committed.
    //   3. The target's member row in THIS household. None → FORBIDDEN, the
    //      same answer as a person the caller may not touch.
    //   4. The writes.
    //
    // None of them takes `lockUser` or writes a `User` row (decision T16):
    // that keeps the one lock order (`User`, then `Household`). So a removed
    // or leaving person's `activeHouseholdId` stays as it was, on purpose.
    //
    // After the commit, household-level `LOCATION` for this household
    // (decision T19). The removed or leaving person no longer passes
    // `shouldDeliver`'s membership check, so their open tabs do not hear it
    // (a known gap since H5a). Their NEXT request shows the right screen.

    // Household role `owner`. Only between `member` and `manager`.
    setHouseholdRole: async (_, { userId: target, role }, ctx) => {
      const callerId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      const result = await prisma.$transaction(async (tx) => {
        await lockHousehold(tx, householdId)
        await requireHouseholdRole(ctx, householdId, 'owner', tx)
        if (role === 'owner') {
          throw badInput('Handing over the household is not possible yet.')
        }
        if (target === callerId) throw badInput('The owner’s own role cannot be changed.')
        const row = await tx.householdMember.findUnique({
          where: { householdId_userId: { householdId, userId: target } },
          select: { userId: true, role: true, joinedAt: true },
        })
        if (!row) throw forbidden()
        // A write that changes nothing sends nothing (the live-update rule).
        if (row.role === role) return { row, changed: false }
        const saved = await tx.householdMember.update({
          where: { householdId_userId: { householdId, userId: target } },
          data: { role },
          select: { userId: true, role: true, joinedAt: true },
        })
        return { row: saved, changed: true }
      })
      if (result.changed) await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      const names = await displayNames([target])
      return person(result.row, names, callerId)
    },

    // The owner removes anyone but themself. A manager removes only a
    // `member` (design, *Household roles, removal and leaving*). A member
    // removes nobody. Open invites the removed person made stay open (owner
    // decision O18-A): the invite belongs to the household.
    removeMember: async (_, { userId: target }, ctx) => {
      const callerId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      await prisma.$transaction(async (tx) => {
        await lockHousehold(tx, householdId)
        const callerRole = await requireHouseholdRole(ctx, householdId, 'manager', tx)
        if (target === callerId) {
          throw badInput('You cannot remove yourself. A manager or member can leave instead.')
        }
        const row = await tx.householdMember.findUnique({
          where: { householdId_userId: { householdId, userId: target } },
          select: { role: true },
        })
        if (!row) throw forbidden()
        if (callerRole === 'manager' && row.role !== 'member') throw forbidden()
        await removeFromHousehold(tx, householdId, target)
      })
      await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return true
    },

    // A manager or member leaves the household they act in. The owner
    // cannot: handing the household over comes in H6.
    leaveHousehold: async (_, __, ctx) => {
      const callerId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      await prisma.$transaction(async (tx) => {
        await lockHousehold(tx, householdId)
        const role = await requireHouseholdRole(ctx, householdId, 'member', tx)
        if (role === 'owner') {
          throw badInput('The owner cannot leave. Handing over the household comes later.')
        }
        await removeFromHousehold(tx, householdId, callerId)
      })
      // To the household LEFT: its other members' tabs refetch the list.
      await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return true
    },

    // Only for a person in NO household (owner decision O16-A). It must NOT
    // call `requireHousehold` (decision T22): that throws NO_HOUSEHOLD for
    // exactly this person. ONE transaction:
    //
    //   1. `lockUser` FIRST (decision T16). Two creates by one person (two
    //      tabs) run one after the other, so the second sees the first one's
    //      membership in step 3 and is refused.
    //   2. The first sign-in claim (`householdSetupAt`), when it is still
    //      null, as `joinHousehold` does. Then a first request racing this
    //      create cannot make a second household, and a later leave gives
    //      NO_HOUSEHOLD instead of a new household.
    //   3. Any membership at all → ALREADY_IN_HOUSEHOLD.
    //   4. The same writes as first sign-in (`createHouseholdFor`).
    //   5. `activeHouseholdId` → the new household. The User lock is held.
    //
    // It takes no household lock: it waits for no existing household, so it
    // cannot be part of a deadlock with a join, and needs no retry.
    //
    // After the commit, household-level `LOCATION` for the new household
    // (decision T19). The caller is its member, so their other tabs hear it.
    createHousehold: async (_, { name }, ctx) => {
      const userId = requireAuth(ctx)
      const language = ctx.language ?? 'en'
      // Checked before any read or write: a blank name writes nothing.
      const cleanName = name == null ? null : cleanHouseholdName(name)
      const created = await prisma.$transaction(async (tx) => {
        await lockUser(tx, userId)
        await tx.user.updateMany({
          where: { id: userId, householdSetupAt: null },
          data: { householdSetupAt: new Date() },
        })
        const memberships = await tx.householdMember.count({ where: { userId } })
        if (memberships > 0) throw alreadyInHousehold()

        let householdName = cleanName
        if (householdName === null) {
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { displayName: true },
          })
          // Unreachable: `lockUser` above updated this row.
          if (!user) throw new Error('createHousehold: the User row is gone')
          householdName = firstSignInNames(language, user.displayName).household
        }
        const household = await createHouseholdFor(tx, {
          userId,
          name: householdName,
          locationName: firstLocationName(language),
        })
        await tx.user.update({
          where: { id: userId },
          data: { activeHouseholdId: household.id },
        })
        return household
      })
      await publishHouseholdChange(ctx, ['LOCATION'], created.id)
      return { id: created.id, name: created.name, role: 'owner' as const }
    },
  },
}
