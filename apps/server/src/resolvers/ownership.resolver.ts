import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import { requireAuth } from '../context.js'
import { forbidden, requireHousehold, requireHouseholdRole } from '../lib/authz.js'
import { recordActivity } from '../lib/activity.js'
import { restartHandoverIfNeeded } from '../lib/handover.js'
import { displayNamesOf, lockHouseholdOrForbid } from '../lib/household.js'
import { prisma } from '../lib/prisma.js'
import { publishHouseholdChange } from '../lib/publishChange.js'
import type { Household, OwnershipOffer, Resolvers } from '../generated/graphql.js'

// Transfer and hand-over: the ownership offers (households H6b, task K.3;
// decisions T52, T58, T59, T62 and T65 of
// docs/global/permissions/2026-11-20-households-plan-h6.md).
//
// ── THE ORDER IN EVERY WRITE (decision T52) ──
//
// One transaction:
//
//   1. The household lock FIRST (`lockHouseholdOrForbid`). A household
//      deleted since it was found gives FORBIDDEN, not Prisma's P2025.
//   2. Every role and every offer read AFTER it, through `tx`. A role read
//      before the lock can be stale: an owner who clears the household while
//      someone accepts it would otherwise still be the owner when the clear
//      runs. `clearAllData`, `renameHousehold`, `deleteAllLocations` and
//      `deleteHousehold` take the same lock and check the owner after it, so
//      a transfer and an old owner's write run one after the other.
//   3. The writes, then the activity row (`recordActivity`, decision T47).
//
// After the commit, one household-level `LOCATION` for the household, and
// only when something changed (`dismissOwnershipOffer` publishes nothing).
//
// ── WHICH HOUSEHOLD ──
//
// `offerOwnership` and `cancelOwnershipOffer` act in the household the
// caller acts in (`requireHousehold`). Accept, decline and dismiss act on the
// OFFER's household, which may be the caller's other household: accepting
// does not switch households (decision T65). So they first read the offer
// with the global client, ONLY to learn which household to lock, and read it
// again through `tx` after the lock. That second read is the one that counts.
//
// ── WHO MAY ANSWER AN OFFER ──
//
// Only the person it is for (`toUserId`). Anyone else, and an id no offer
// has, get the same FORBIDDEN, so the answer does not tell a stranger that an
// offer exists. An offer that was there before the lock and is gone after it
// (another accept won) is `OFFER_GONE` for accept, and `false` for decline
// and dismiss.

function badInput(message: string, reason?: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: reason ? { code: 'BAD_USER_INPUT', reason } : { code: 'BAD_USER_INPUT' },
  })
}

function offerGone(): GraphQLError {
  return badInput('This offer is no longer open.', 'OFFER_GONE')
}

const OFFER_SELECT = {
  id: true,
  householdId: true,
  toUserId: true,
  fromUserId: true,
  kind: true,
  createdAt: true,
  dismissedAt: true,
} satisfies Prisma.OwnershipOfferSelect

type OfferRow = Prisma.OwnershipOfferGetPayload<{ select: typeof OFFER_SELECT }>

/** Offer rows as `OwnershipOffer`, with names. Two reads for the whole list. */
async function toGraphQL(rows: OfferRow[]): Promise<OwnershipOffer[]> {
  if (rows.length === 0) return []
  const people = rows.flatMap((r) => (r.fromUserId ? [r.toUserId, r.fromUserId] : [r.toUserId]))
  const [names, households] = await Promise.all([
    displayNamesOf(people),
    prisma.household.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.householdId))] } },
      select: { id: true, name: true },
    }),
  ])
  const householdNames = new Map(households.map((h) => [h.id, h.name]))
  return rows.map((r) => ({
    id: r.id,
    householdId: r.householdId,
    householdName: householdNames.get(r.householdId) ?? '',
    kind: r.kind,
    toUserId: r.toUserId,
    toName: names.get(r.toUserId) ?? '',
    fromName: r.fromUserId ? (names.get(r.fromUserId) ?? '') : null,
    createdAt: r.createdAt.toISOString(),
    dismissedAt: r.dismissedAt ? r.dismissedAt.toISOString() : null,
  }))
}

async function oneToGraphQL(row: OfferRow): Promise<OwnershipOffer> {
  const [offer] = await toGraphQL([row])
  // Unreachable: one row in gives one row out.
  if (!offer) throw new Error('ownership: an offer row was lost')
  return offer
}

/**
 * The household an offer is in, read OUTSIDE the transaction, only to know
 * which household to lock. FORBIDDEN unless the offer is for the caller: an
 * unknown id gets the same answer.
 */
async function householdOfMyOffer(id: string, callerId: string): Promise<string> {
  const row = await prisma.ownershipOffer.findFirst({
    where: { id, toUserId: callerId },
    select: { householdId: true },
  })
  if (!row) throw forbidden()
  return row.householdId
}

/** The offer again, through `tx`, after the lock. Null when it is gone. */
async function myOfferAfterLock(
  tx: Prisma.TransactionClient,
  id: string,
  callerId: string,
): Promise<OfferRow | null> {
  return tx.ownershipOffer.findFirst({ where: { id, toUserId: callerId }, select: OFFER_SELECT })
}

/**
 * A `Household` answer. `hasOwner` and `pendingTransfer` are filled by the
 * field resolvers below, so a resolver returns only these three. The cast
 * says so: the generated type lists every field of the GraphQL type.
 */
export function householdAnswer(row: {
  id: string
  name: string
  role: Household['role']
}): Household {
  return { id: row.id, name: row.name, role: row.role } as Household
}

export const ownershipResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Household'> = {
  Query: {
    // Offers TO the caller, in every household (decision T65). Oldest first,
    // by `createdAt`, then `id`, so the order is the same on every call. An
    // offer exists only while its person is a member (a leave or removal
    // deletes it, `removeFromHousehold`), so no membership read is needed.
    myOwnershipOffers: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const rows = await prisma.ownershipOffer.findMany({
        where: { toUserId: userId },
        select: OFFER_SELECT,
      })
      rows.sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      return toGraphQL(rows)
    },
  },

  Household: {
    hasOwner: async (parent) => {
      const row = await prisma.household.findUnique({
        where: { id: parent.id },
        select: { ownerId: true },
      })
      return row?.ownerId != null
    },
    // Owner only (decision T65). The role is the one the parent resolver
    // read for this caller in this request.
    pendingTransfer: async (parent) => {
      if (parent.role !== 'owner') return null
      const row = await prisma.ownershipOffer.findFirst({
        where: { householdId: parent.id, kind: 'transfer' },
        select: OFFER_SELECT,
      })
      return row ? oneToGraphQL(row) : null
    },
  },

  Mutation: {
    // Household owner. At most one transfer offer at a time (decision T59).
    offerOwnership: async (_, { userId: target }, ctx) => {
      const callerId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      const result = await prisma.$transaction(async (tx) => {
        await lockHouseholdOrForbid(tx, householdId)
        await requireHouseholdRole(ctx, householdId, 'owner', tx)
        if (target === callerId) throw badInput('You already own this household.')
        // A member whose account is not deleted (decision T61). Anyone else
        // is FORBIDDEN, the same as a person of another household.
        const member = await tx.householdMember.findFirst({
          where: { householdId, userId: target, user: { deletedAt: null } },
          select: { userId: true },
        })
        if (!member) throw forbidden()
        const open = await tx.ownershipOffer.findFirst({
          where: { householdId, kind: 'transfer' },
          select: OFFER_SELECT,
        })
        // The same person again: nothing to do (like decision T38). No row,
        // no event, and the offer keeps its date.
        if (open && open.toUserId === target) return { row: open, changed: false }
        // Replace an offer to someone else: at most one at a time.
        await tx.ownershipOffer.deleteMany({ where: { householdId, kind: 'transfer' } })
        const row = await tx.ownershipOffer.create({
          data: { householdId, toUserId: target, fromUserId: callerId, kind: 'transfer' },
          select: OFFER_SELECT,
        })
        await recordActivity(tx, {
          householdId,
          actorId: callerId,
          action: 'OWNERSHIP_OFFERED',
          targetUserId: target,
          details: { kind: 'transfer' },
        })
        return { row, changed: true }
      })
      if (result.changed) await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return oneToGraphQL(result.row)
    },

    // Household owner. False, with no row and no event, when there is none.
    cancelOwnershipOffer: async (_, __, ctx) => {
      const callerId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      const cancelled = await prisma.$transaction(async (tx) => {
        await lockHouseholdOrForbid(tx, householdId)
        await requireHouseholdRole(ctx, householdId, 'owner', tx)
        const open = await tx.ownershipOffer.findFirst({
          where: { householdId, kind: 'transfer' },
          select: { id: true, toUserId: true },
        })
        if (!open) return false
        await tx.ownershipOffer.delete({ where: { id: open.id } })
        await recordActivity(tx, {
          householdId,
          actorId: callerId,
          action: 'OWNERSHIP_OFFER_CANCELLED',
          targetUserId: open.toUserId,
          details: { kind: 'transfer' },
        })
        return true
      })
      if (cancelled) await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return cancelled
    },

    // Only the offer's person (decision T59). The order of the role writes
    // is fixed by the partial unique index `HouseholdMember_one_owner_key`:
    // the old owner's row becomes `manager` FIRST, then the caller's row
    // becomes `owner`. The other order would have two owner rows for one
    // statement, and Postgres refuses it.
    acceptOwnershipOffer: async (_, { id }, ctx) => {
      const callerId = requireAuth(ctx)
      const householdId = await householdOfMyOffer(id, callerId)
      const household = await prisma.$transaction(async (tx) => {
        await lockHouseholdOrForbid(tx, householdId)
        // The read that counts. Another accept that held the lock first has
        // deleted every offer of the household.
        const offer = await myOfferAfterLock(tx, id, callerId)
        if (!offer) throw offerGone()
        // The caller must still be a member. A leave or a removal deletes
        // their offers (`removeFromHousehold`), so this is a second guard.
        await requireHouseholdRole(ctx, householdId, 'member', tx)
        const oldOwner = await tx.householdMember.findFirst({
          where: { householdId, role: 'owner' },
          select: { userId: true },
        })
        if (oldOwner) {
          await tx.householdMember.update({
            where: { householdId_userId: { householdId, userId: oldOwner.userId } },
            data: { role: 'manager' },
          })
        }
        await tx.householdMember.update({
          where: { householdId_userId: { householdId, userId: callerId } },
          data: { role: 'owner' },
        })
        // `ownerId` mirrors the owner row, in the same transaction (decision
        // H15). `ownerGoneAt` is cleared: the hand-over is over.
        const saved = await tx.household.update({
          where: { id: householdId },
          data: { ownerId: callerId, ownerGoneAt: null },
          select: { id: true, name: true },
        })
        // Every offer of the household goes: the first accept wins.
        await tx.ownershipOffer.deleteMany({ where: { householdId } })
        await recordActivity(tx, {
          householdId,
          actorId: callerId,
          action: 'OWNERSHIP_ACCEPTED',
          targetUserId: oldOwner?.userId ?? null,
          details: { kind: offer.kind },
        })
        return saved
      })
      await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return householdAnswer({ id: household.id, name: household.name, role: 'owner' })
    },

    // Only the offer's person. Deletes it. When it was the last hand-over
    // offer, the hand-over starts again for the others (decision T62).
    declineOwnershipOffer: async (_, { id }, ctx) => {
      const callerId = requireAuth(ctx)
      const householdId = await householdOfMyOffer(id, callerId)
      const declined = await prisma.$transaction(async (tx) => {
        await lockHouseholdOrForbid(tx, householdId)
        const offer = await myOfferAfterLock(tx, id, callerId)
        if (!offer) return false
        await tx.ownershipOffer.delete({ where: { id: offer.id } })
        await recordActivity(tx, {
          householdId,
          actorId: callerId,
          action: 'OWNERSHIP_DECLINED',
          targetUserId: offer.fromUserId,
          details: { kind: offer.kind },
        })
        if (offer.kind === 'handover') {
          await restartHandoverIfNeeded(tx, householdId, callerId, callerId)
        }
        return true
      })
      if (declined) await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return declined
    },

    // Only the offer's person. "Not now" on the banner: the offer stays.
    // Publishes nothing: only the caller's own banner changes (see the live
    // guard). A second dismiss keeps the first date.
    dismissOwnershipOffer: async (_, { id }, ctx) => {
      const callerId = requireAuth(ctx)
      const householdId = await householdOfMyOffer(id, callerId)
      return prisma.$transaction(async (tx) => {
        await lockHouseholdOrForbid(tx, householdId)
        const offer = await myOfferAfterLock(tx, id, callerId)
        if (!offer) return false
        if (offer.dismissedAt === null) {
          await tx.ownershipOffer.update({
            where: { id: offer.id },
            data: { dismissedAt: new Date() },
          })
        }
        return true
      })
    },
  },
}
