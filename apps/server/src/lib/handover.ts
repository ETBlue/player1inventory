import type { Prisma } from '@prisma/client'
import { recordActivity } from './activity.js'
import { countedOrganizerIds } from './authz.js'
import { deleteHouseholdData, lockHouseholds } from './household.js'

// Removing a person from a household, and the hand-over offers (households
// H6b, task K.3; decisions T11, T30, T60 and T62 of
// docs/global/permissions/2026-11-20-households-plan-h6.md).
//
// Why a file of its own. The plan put both functions in lib/household.ts.
// But `startHandover` reads organizers through `countedOrganizerIds`
// (lib/authz.ts, decision H18), and lib/authz.ts imports lib/household.ts.
// Importing authz back into household.ts would make an import cycle, which
// lib/household.ts already avoids on purpose (see `lockHouseholdOrForbid`).
//
// Every function here runs INSIDE the caller's transaction. All but
// `handOverDeletedAccount` run after the caller took the household lock
// (`lockHouseholdOrForbid`), take no lock themselves, and write no `User`
// row (decision T16). `handOverDeletedAccount` (task K.4) takes the household
// locks itself, AFTER its caller wrote the deleted person's `User` row.

type Tx = Prisma.TransactionClient

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
 * 3. Every ownership offer TO them in this household (households H6b task
 *    K.3). An offer to a person who is not a member could still be accepted
 *    and would make them the owner. Offers in their other households stay.
 * 4. Their member row.
 * 5. When step 3 deleted the LAST offer of a household with no owner, the
 *    remaining people get new hand-over offers (decision T62,
 *    `restartHandoverIfNeeded`). `actorId` is who made the change, for the
 *    `HANDOVER_STARTED` row.
 *
 * It never writes a `User` row (decision T16), so the person's
 * `activeHouseholdId` may still name this household. `ensureHousehold`
 * ignores an active household the person is no longer a member of.
 *
 * Nothing extra is published for the invites or offers: the caller
 * publishes a household-level `LOCATION`, and the Members page reads the
 * invite list again on `LOCATION` (`apps/web/src/apollo/liveUpdates.ts`).
 *
 * Moved here from resolvers/household.resolver.ts in task K.3, so the
 * hand-over (task K.4) can call it too.
 */
export async function removeFromHousehold(
  tx: Tx,
  householdId: string,
  userId: string,
  actorId: string,
): Promise<void> {
  await tx.locationMember.deleteMany({ where: { userId, location: { householdId } } })
  await tx.householdInvite.updateMany({
    where: { householdId, createdById: userId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  const offers = await tx.ownershipOffer.deleteMany({ where: { householdId, toUserId: userId } })
  await tx.householdMember.delete({
    where: { householdId_userId: { householdId, userId } },
  })
  if (offers.count > 0) await restartHandoverIfNeeded(tx, householdId, actorId)
}

/**
 * Decision T62: when the household has NO owner and no offer is left, start
 * the hand-over again for the people who remain. Call it after a write that
 * deleted an offer (a decline, a leave, a removal). Does nothing when the
 * household has an owner, or still has an offer.
 *
 * `skip` is a person who just DECLINED: see `startHandover`.
 */
export async function restartHandoverIfNeeded(
  tx: Tx,
  householdId: string,
  actorId: string,
  skip?: string,
): Promise<string[]> {
  const household = await tx.household.findUnique({
    where: { id: householdId },
    select: { ownerId: true },
  })
  if (!household || household.ownerId !== null) return []
  const left = await tx.ownershipOffer.findFirst({
    where: { householdId },
    select: { id: true },
  })
  if (left) return []
  return startHandover(tx, householdId, actorId, skip)
}

/**
 * Offer a household with no owner to the people the design's table names
 * (design, *Owner's account is deleted*; decisions T60 and T62). Run it
 * inside the caller's transaction, after the household lock.
 *
 * Only members whose account is not deleted count (decision T61, Y12):
 *
 * | Who is left                                  | Who gets an offer          |
 * |----------------------------------------------|----------------------------|
 * | at least one manager                         | every manager              |
 * | no manager, some members organize a location | those members              |
 * | no manager, nobody organizes                 | every member               |
 *
 * "Organize" means a counted organizer of a location of THIS household
 * (`countedOrganizerIds`: decision H18 and T61).
 *
 * It deletes every offer of the household first, so a transfer offer left
 * from before is dropped (decision T63) and no offer pair is taken twice.
 *
 * `skip`: a person who just declined (households H6b task K.3, not in the
 * plan). The table is applied to everyone ELSE, so a decline moves the offer
 * on, for example from the only manager to the members. Without it the
 * person would get the same offer back at once. When nobody else is left,
 * they DO get it back, but already dismissed (`dismissedAt` set): the banner
 * stays hidden, and the Members page still lets them become the owner. A
 * household with people in it and no way to get an owner would have nobody
 * who can ever change that.
 *
 * Writes one `HANDOVER_STARTED` row with `{ offeredTo: [userId] }` when it
 * made at least one offer. `actorId` is who caused it: the deleted owner for
 * task K.4 (decision T50), the person who declined, left or removed someone
 * for decision T62.
 *
 * Returns the ids of the people who got an offer.
 */
export async function startHandover(
  tx: Tx,
  householdId: string,
  actorId: string,
  skip?: string,
): Promise<string[]> {
  await tx.ownershipOffer.deleteMany({ where: { householdId } })
  const people = await tx.householdMember.findMany({
    where: { householdId, user: { deletedAt: null } },
    select: { userId: true, role: true },
  })
  const others = people.filter((p) => p.userId !== skip)
  let chosen = await byTable(tx, householdId, others)
  let dismissedAt: Date | null = null
  if (chosen.length === 0 && skip !== undefined && people.some((p) => p.userId === skip)) {
    chosen = [skip]
    dismissedAt = new Date()
  }
  chosen.sort()
  for (const toUserId of chosen) {
    await tx.ownershipOffer.create({
      data: { householdId, toUserId, kind: 'handover', dismissedAt },
    })
  }
  if (chosen.length > 0) {
    await recordActivity(tx, {
      householdId,
      actorId,
      action: 'HANDOVER_STARTED',
      details: { offeredTo: chosen },
    })
  }
  return chosen
}

/** The design's table, on the given people. See `startHandover`. */
async function byTable(
  tx: Tx,
  householdId: string,
  people: { userId: string; role: string }[],
): Promise<string[]> {
  // An owner row in a household with no owner is not expected. If one is
  // there, it is not offered the household it already owns.
  const candidates = people.filter((p) => p.role !== 'owner')
  const managers = candidates.filter((p) => p.role === 'manager')
  if (managers.length > 0) return managers.map((p) => p.userId)
  if (candidates.length === 0) return []
  const organizers = await countedOrganizerIds(householdId, tx)
  const organizing = candidates.filter((p) => organizers.has(p.userId))
  if (organizing.length > 0) return organizing.map((p) => p.userId)
  return candidates.map((p) => p.userId)
}

/**
 * The hand-over when a Clerk account is deleted (households H6b task K.4,
 * decisions T60, T61 and T63). `handleClerkEvent` calls it inside ONE
 * transaction, AFTER it wrote the person's `User` row (that write is the
 * `lockUser` of decision T16), so the lock order is: the `User` row, then the
 * households, sorted by id.
 *
 * 1. Read the person's memberships, and lock all those households, sorted
 *    (`lockHouseholds`).
 * 2. Per household, in sorted order, read the person's role again through
 *    `tx` (after the lock, so a role changed meanwhile is seen):
 *
 * | Their role | What happens |
 * |---|---|
 * | any role, and no OTHER member whose account is live | `deleteHouseholdData`, then the household row (its members, invites, offers and log go by cascade). Owner decision O37-A, the same rule as `leaveHousehold`. For a manager or member this happens only when the household has no live owner |
 * | `manager` or `member` | `removeFromHousehold` (location roles, the open invites they made, the offers TO them, the member row; T62 when it deleted the last offer) and one `ACCOUNT_DELETED` row |
 * | `owner`, other live members | their location roles go; the open invites they made in this household are revoked (owner decision O43, the same write as `removeFromHousehold`); their member row goes; `ownerId: null`, `ownerGoneAt: now`; every offer of the household goes (a pending transfer too, T63); `startHandover` makes the `handover` offers by the design's table and writes `HANDOVER_STARTED` |
 *
 * "Live" means `User.deletedAt` is null (decision T61, Y12): a member whose
 * own account is already deleted is not a person who can take the household.
 *
 * Every row written has the deleted person as its actor (decision T50).
 *
 * Returns the ids of the households that still exist and changed, sorted.
 * The caller publishes one household-level `LOCATION` for each, AFTER the
 * commit. A deleted household gets no event: it has no members left to hear
 * it (the same as `deleteHousehold`).
 *
 * SAFE TO REPEAT. Svix may deliver the same event again. By then the person
 * has no membership, so step 1 finds nothing and nothing is written.
 *
 * Invites: every role's open invites in a household that stays are revoked
 * (O20 and O43). A deleted household's invites go with it (`onDelete:
 * Cascade` on `HouseholdInvite.household`), so that row needs no extra write.
 *
 * NOT DONE HERE (not decided in the plan, see the K.4 notes in the plan):
 *
 * - Rows of accounts deleted BEFORE this code ran. No event comes for them
 *   again. That is the O36 step.
 *
 * The household delete also writes OTHER people's `User` rows
 * (`activeHouseholdId` is `onDelete: SetNull`) while this transaction holds
 * household locks. That breaks the one lock order in the same way
 * `joinHousehold` and `deleteHousehold` do, so the caller retries once on
 * P2034 (`retryOnceOnConflict`).
 */
export async function handOverDeletedAccount(
  tx: Tx,
  userId: string,
  now: Date,
): Promise<string[]> {
  const memberships = await tx.householdMember.findMany({
    where: { userId },
    select: { householdId: true },
  })
  if (memberships.length === 0) return []
  const locked = await lockHouseholds(
    tx,
    memberships.map((m) => m.householdId),
  )
  const changed: string[] = []
  for (const householdId of [...locked].sort()) {
    const row = await tx.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId } },
      select: { role: true },
    })
    // Left or was removed between the first read and the lock.
    if (!row) continue

    // The same rule for every role (owner decision O37-A, as in
    // `leaveHousehold`): when no OTHER member with a live account is left,
    // the household goes with all its data. For an owner that is the design's
    // "only person" row. For a manager or member it happens only when the
    // household has no live owner: a hand-over nobody accepted, or an owner
    // whose account was deleted before H6.
    const live = await tx.householdMember.findMany({
      where: { householdId, user: { deletedAt: null } },
      select: { userId: true },
    })
    if (!live.some((m) => m.userId !== userId)) {
      await deleteHouseholdData(tx, householdId)
      await tx.household.deleteMany({ where: { id: householdId } })
      continue
    }

    if (row.role !== 'owner') {
      await removeFromHousehold(tx, householdId, userId, userId)
      await recordActivity(tx, { householdId, actorId: userId, action: 'ACCOUNT_DELETED' })
      changed.push(householdId)
      continue
    }

    await tx.locationMember.deleteMany({ where: { userId, location: { householdId } } })
    // Owner decision O43: the open invites the owner made in THIS household
    // are revoked, the same write as `removeFromHousehold` (O20). Without it
    // people could still join through them, and `invitePreview` would name a
    // deleted account as the inviter. Revoked, not deleted: the invite list
    // keeps its history. An invite revoked earlier keeps its date, and a
    // used one is not touched.
    await tx.householdInvite.updateMany({
      where: { householdId, createdById: userId, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    })
    await tx.householdMember.delete({
      where: { householdId_userId: { householdId, userId } },
    })
    await tx.household.update({
      where: { id: householdId },
      data: { ownerId: null, ownerGoneAt: now },
    })
    // `startHandover` deletes every offer of the household too. Done here
    // as well, so this step does not depend on that detail of it (T63).
    await tx.ownershipOffer.deleteMany({ where: { householdId } })
    await startHandover(tx, householdId, userId)
    changed.push(householdId)
  }
  return changed
}
