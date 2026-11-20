import { GraphQLError } from 'graphql'
import type { HouseholdRole, Prisma } from '@prisma/client'
import { requireAuth } from '../context.js'
import { forbidden, requireHousehold, requireHouseholdRole } from '../lib/authz.js'
import {
  alreadyInHousehold,
  createHouseholdFor,
  deleteHouseholdData,
  displayNamesOf,
  firstLocationName,
  firstSignInNames,
  HOUSEHOLD_MOVE_TIMEOUT_MS,
  HOUSEHOLD_NAME_MAX_LENGTH,
  lockHouseholdOrForbid,
  lockUser,
} from '../lib/household.js'
import { recordActivity } from '../lib/activity.js'
import { prisma } from '../lib/prisma.js'
import { publishHouseholdChange } from '../lib/publishChange.js'
import { retryOnceOnConflict } from './invite.resolver.js'
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
  withLocationRole: Set<string>,
) {
  return {
    userId: row.userId,
    // Every member has a `User` row (a foreign key). `''` should never show.
    displayName: names.get(row.userId) ?? '',
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
    // Not an authorization check: it only marks the caller's own row.
    isMe: row.userId === callerId,
    hasLocationRole: withLocationRole.has(row.userId),
  }
}

/**
 * The people, of `userIds`, who hold a role on at least one location of
 * `householdId` (households H5c, decision T40, owner decision O28-A).
 *
 * ONE read for the whole list, not one per person. The two relation filters
 * keep it to THIS household:
 *
 * - `location: { householdId }`: a role on a location of another household
 *   does not count.
 * - `user: { householdMemberships: { some: { householdId } } }`: the row's
 *   person is still a member of the household (decision H18). The ids come
 *   from this household's member list, so this only matters for a person
 *   removed between the two reads. It is kept so every `LocationMember` read
 *   carries H18.
 *
 * `db` is the client to read with, for a call inside a transaction.
 */
async function peopleWithLocationRole(
  householdId: string,
  userIds: string[],
  db: { locationMember: Prisma.TransactionClient['locationMember'] } = prisma,
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const rows = await db.locationMember.findMany({
    where: {
      userId: { in: [...new Set(userIds)] },
      location: { householdId },
      user: { householdMemberships: { some: { householdId } } },
    },
    select: { userId: true },
    distinct: ['userId'],
  })
  return new Set(rows.map((row) => row.userId))
}

/**
 * Remove one person from one household, inside the caller's transaction:
 *
 * 1. Their location roles on the household's locations (decision T11: a
 *    leftover row would come back on a re-invite, D9). The
 *    `location: { householdId }` filter keeps their roles in any OTHER
 *    household.
 * 2. Revoke every invite of THIS household they made that is not used and
 *    not revoked yet (owner decision O20). A manager can see the token of
 *    every open invite, so without this a removed manager could rejoin
 *    through an invite they made. Expired invites are revoked too: they
 *    cannot be used anyway, and the `where` stays the same as
 *    `revokeInvite`'s. An invite revoked earlier keeps its date. The
 *    household and the creator are in the `where`, so invites of their
 *    other household stay open.
 * 3. Their member row.
 *
 * It never writes a `User` row (decision T16), so the person's
 * `activeHouseholdId` may still name this household. `ensureHousehold`
 * ignores an active household the person is no longer a member of.
 *
 * Nothing extra is published for the invites: the caller publishes a
 * household-level `LOCATION`, and the Members page reads the invite list
 * again on `LOCATION` (`apps/web/src/apollo/liveUpdates.ts`).
 */
async function removeFromHousehold(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  householdId: string,
  userId: string,
): Promise<void> {
  await tx.locationMember.deleteMany({ where: { userId, location: { householdId } } })
  await tx.householdInvite.updateMany({
    where: { householdId, createdById: userId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  })
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
      // `deletedAt: null`: a deleted account is not listed (households H6
      // task K.2, decision T61). Its member row may still be there: the
      // hand-over removes it from H6 on, but not for an account deleted
      // before H6 deploys. The Add person list on the location page is built
      // from this list, so a deleted account is not offered there either.
      const rows = await prisma.householdMember.findMany({
        where: { householdId, user: { deletedAt: null } },
        select: { userId: true, role: true, joinedAt: true },
      })
      rows.sort(
        (a, b) =>
          OWNER_FIRST[a.role] - OWNER_FIRST[b.role] ||
          a.joinedAt.getTime() - b.joinedAt.getTime() ||
          (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
      )
      const ids = rows.map((row) => row.userId)
      const [names, withLocationRole] = await Promise.all([
        displayNamesOf(ids),
        peopleWithLocationRole(householdId, ids),
      ])
      return rows.map((row) => person(row, names, userId, withLocationRole))
    },
  },

  Mutation: {
    // Household role `owner` (decision H4). The role check runs BEFORE the
    // name is checked, so a manager or member gets FORBIDDEN whatever name
    // they send.
    //
    // The household lock FIRST, then the owner check through `tx`, then the
    // write (households H6 task J.4, decision T52). Until J.4 this read the
    // role and then wrote with no lock. A rename is one `UPDATE`, so two
    // renames never mix. The gap was the role: it was read before the write,
    // so an owner who hands the household over (H6b) at the same moment
    // could still rename it once. The transfer takes the same lock, so now
    // the two run one after the other, and the rename reads the role the
    // transfer left. A household deleted since `requireHousehold` found it
    // gives FORBIDDEN.
    renameHousehold: async (_, { name }, ctx) => {
      const householdId = await requireHousehold(ctx)
      const { row, role } = await prisma.$transaction(async (tx) => {
        await lockHouseholdOrForbid(tx, householdId)
        const role = await requireHouseholdRole(ctx, householdId, 'owner', tx)
        const clean = cleanHouseholdName(name)
        const row = await tx.household.update({
          where: { id: householdId },
          data: { name: clean },
          select: { id: true, name: true },
        })
        return { row, role }
      })
      // `CATALOG` (households H3c-2 task D.4): the name is in every member's
      // sidebar, and on the web `GetHousehold` is refetched for `CATALOG`.
      // For the SAVED row's household. After the commit.
      await publishHouseholdChange(ctx, ['CATALOG'], row.id)
      return { id: row.id, name: row.name, role }
    },

    // Household role `owner` (households H6 task J.4, owner decision O38-A).
    // Deletes the household the caller acts in, with everything in it.
    // Everyone loses access. Each person's next request acts in their other
    // household (`ensureHousehold` picks their oldest membership), or gets
    // NO_HOUSEHOLD. The web asks the owner to type the household name first;
    // the server checks only the role (decision T56).
    //
    // ONE transaction, run ONCE more on P2034 (`retryOnceOnConflict`):
    //
    //   1. The `User` rows whose `activeHouseholdId` names this household are
    //      set to null FIRST. The household delete would do this anyway
    //      (`onDelete: SetNull`), but then it would write `User` rows while
    //      holding the household lock, the opposite of the one lock order
    //      (`User` rows, then households; decision T16 of the H5b plan).
    //      Doing it first takes those row locks in the right order. Two
    //      writes can still meet in the other order (for example a join
    //      that deletes an empty household), so the retry stays.
    //   2. The household lock (`lockHouseholdOrForbid`), then the owner
    //      check through `tx` (decision T52). A refusal rolls step 1 back.
    //      Before the transaction there is also an early owner check (see
    //      below), so a manager or member never reaches step 1.
    //   3. `deleteHouseholdData`, the same ordered delete as `clearAllData`
    //      (decision T64). `Tag.type` is NoAction, so the catalog is not left
    //      to the cascade.
    //   4. The household row. Its members, invites and activity log go with
    //      it by ON DELETE CASCADE.
    //
    // No activity row: the log is deleted with the household, so a row about
    // the delete would be deleted at once.
    //
    // No live event, on purpose. `shouldDeliver` sends a household-level
    // event only to MEMBERS of the household, and after the commit it has
    // none. So an event would reach nobody, and it is listed in
    // `publishesNothing` in live-publish.guard.test.ts. The owner's own tab
    // gets `true` and must leave the household on its own (the web, task
    // J.7). Every other member's open tab finds out on its next request: the
    // household guard sees another household id, or the no-household screen
    // shows.
    deleteHousehold: async (_, __, ctx) => {
      const householdId = await requireHousehold(ctx)
      // Prisma reads `undefined` as NO filter in the deletes below.
      if (!householdId) throw new Error('deleteHousehold: no household id')

      // An EARLY refusal, outside the transaction. It is not the check that
      // counts: that one is step 2, after the lock, through `tx`. It is here
      // because step 1 writes OTHER people's `User` rows. Without it, a
      // manager or member would take those row locks before being refused,
      // and could push another person's join (which holds its own `User`
      // row and then wants this household's lock) into P2034. A role read
      // here can be stale only in the safe direction: an owner demoted
      // after this read is still refused in step 2.
      await requireHouseholdRole(ctx, householdId, 'owner')

      await retryOnceOnConflict(() =>
        prisma.$transaction(
          async (tx) => {
            await tx.user.updateMany({
              where: { activeHouseholdId: householdId },
              data: { activeHouseholdId: null },
            })
            await lockHouseholdOrForbid(tx, householdId)
            await requireHouseholdRole(ctx, householdId, 'owner', tx)
            await deleteHouseholdData(tx, householdId)
            await tx.household.deleteMany({ where: { id: householdId } })
          },
          { timeout: HOUSEHOLD_MOVE_TIMEOUT_MS },
        ),
      )
      return true
    },

    // ── setHouseholdRole, removeMember, leaveHousehold (task G.5) ──
    //
    // The same shape for all three. One transaction:
    //
    //   1. The household lock FIRST (`lockHouseholdOrForbid` in
    //      lib/household.ts, the same `UPDATE` as `lockHousehold`). Two of
    //      these writes on one household run one after the other, so a check
    //      never reads a role that another write is changing at the same
    //      moment (for example a manager who removes a member while the
    //      owner demotes that manager). A household
    //      deleted since `requireHousehold` found it → FORBIDDEN.
    //   2. The caller's role, with `requireHouseholdRole`, read through `tx`
    //      (the transaction's own connection, not a second one from the
    //      pool). It is a new statement after the lock, so under READ
    //      COMMITTED it sees what an earlier write committed.
    //   3. The target's member row in THIS household. None → FORBIDDEN, the
    //      same answer as a person the caller may not touch.
    //   4. The writes.
    //
    //   5. The activity row (households H6 task J.2), through `tx`, after
    //      the writes. Only when something changed.
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
        await lockHouseholdOrForbid(tx, householdId)
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
        // The same role again: no member row changes and nothing is sent (the
        // live-update rule). The lock's `UPDATE` above has still run, so
        // `Household.updatedAt` moves. Skipping the lock here would mean
        // reading the role before the lock, which the order above forbids.
        if (row.role === role) return { row, changed: false }
        const saved = await tx.householdMember.update({
          where: { householdId_userId: { householdId, userId: target } },
          data: { role },
          select: { userId: true, role: true, joinedAt: true },
        })
        // Logged only when the role changed (households H6 task J.2).
        await recordActivity(tx, {
          householdId,
          actorId: callerId,
          action: 'HOUSEHOLD_ROLE_CHANGED',
          targetUserId: target,
          details: { from: row.role, to: saved.role },
        })
        return { row: saved, changed: true }
      })
      if (result.changed) await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      // Read after the commit. A household role change does not touch
      // location roles (design, *Rules that cross the two levels*), so this
      // is the same answer the list gives.
      const [names, withLocationRole] = await Promise.all([
        displayNamesOf([target]),
        peopleWithLocationRole(householdId, [target]),
      ])
      return person(result.row, names, callerId, withLocationRole)
    },

    // The owner removes anyone but themself. A manager removes only a
    // `member` (design, *Household roles, removal and leaving*). A member
    // removes nobody. The open invites the removed person made in this
    // household are revoked in the same transaction (owner decision O20,
    // which replaced O18-A; see `removeFromHousehold`).
    removeMember: async (_, { userId: target }, ctx) => {
      const callerId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      await prisma.$transaction(async (tx) => {
        await lockHouseholdOrForbid(tx, householdId)
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
        await recordActivity(tx, {
          householdId,
          actorId: callerId,
          action: 'MEMBER_REMOVED',
          targetUserId: target,
        })
      })
      await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return true
    },

    // A manager or member leaves the household they act in. The owner
    // cannot: handing the household over comes in H6. Their open invites in
    // this household are revoked (owner decision O20, `removeFromHousehold`).
    leaveHousehold: async (_, __, ctx) => {
      const callerId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      await prisma.$transaction(async (tx) => {
        await lockHouseholdOrForbid(tx, householdId)
        const role = await requireHouseholdRole(ctx, householdId, 'member', tx)
        if (role === 'owner') {
          throw badInput('The owner cannot leave. Handing over the household comes later.')
        }
        await removeFromHousehold(tx, householdId, callerId)
        await recordActivity(tx, { householdId, actorId: callerId, action: 'MEMBER_LEFT' })
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
        // See `HOUSEHOLD_MOVE_TIMEOUT_MS`: the 5 s default was too short
        // against a remote database.
      }, { timeout: HOUSEHOLD_MOVE_TIMEOUT_MS })
      await publishHouseholdChange(ctx, ['LOCATION'], created.id)
      return { id: created.id, name: created.name, role: 'owner' as const }
    },
  },
}
