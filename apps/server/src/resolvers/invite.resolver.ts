import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
import { requireAuth } from '../context.js'
import { forbidden, requireHousehold, requireHouseholdRole } from '../lib/authz.js'
import {
  type InviteLocationRoleEntry,
  inviteExpiresAt,
  newInviteToken,
  parseLocationRoles,
} from '../lib/invite.js'
import { prisma } from '../lib/prisma.js'
import { publishHouseholdChange } from '../lib/publishChange.js'
import type { Resolvers } from '../generated/graphql.js'

// Create, list, preview and revoke household invites (households H5b, task
// G.3; plan docs/global/permissions/2026-11-18-households-plan-h5b.md,
// decisions T12, T17, T18, T19, T22, T26 and T27, owner decisions O3-A,
// O6-A, O7-A, O13-A, O14-A and O15-A). `joinHousehold` is task G.4.
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

/**
 * The display names of some people, by id. One read, names only (no e-mail).
 * `User.createdById` is a foreign key, so every creator has a row; `''` is a
 * fallback that should never show.
 */
async function displayNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map()
  const rows = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: { id: true, displayName: true },
  })
  return new Map(rows.map((row) => [row.id, row.displayName]))
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
        displayNames(rows.map((row) => row.createdById)),
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
    // `requireHousehold`: a person with no household would get NO_HOUSEHOLD,
    // and a brand-new person would get a household made for them just by
    // looking at a link. It never throws for a token, and it never returns
    // one. INVALID carries no name at all (decision T18).
    invitePreview: async (_, { token }, ctx) => {
      const userId = requireAuth(ctx)
      const row = await prisma.householdInvite.findUnique({ where: { token } })
      if (!row || !isOpen(row, new Date())) return INVALID_PREVIEW
      const [membership, household, people, names] = await Promise.all([
        prisma.householdMember.findUnique({
          where: { householdId_userId: { householdId: row.householdId, userId } },
          select: { role: true },
        }),
        prisma.household.findUnique({ where: { id: row.householdId }, select: { name: true } }),
        displayNames([row.createdById]),
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
    // decides what another write may do. The checks, in order: the role
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
      const row = await prisma.householdInvite.create({
        data: {
          householdId,
          token: newInviteToken(),
          householdRole,
          locationRoles: entries as unknown as Prisma.InputJsonValue,
          createdById: userId,
          expiresAt: inviteExpiresAt(now),
        },
      })
      const [names, people] = await Promise.all([
        locationNames(householdId),
        displayNames([userId]),
      ])
      // Household-level `LOCATION` (decision T19): every open tab of the
      // household refetches, so the Members page shows the new invite.
      await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return {
        id: row.id,
        token: row.token,
        householdRole: row.householdRole,
        locationRoles: namedRoles(row.locationRoles, names),
        createdByName: people.get(userId) ?? '',
        expiresAt: row.expiresAt.toISOString(),
      }
    },

    // Owner or manager. ONE conditional write, so a revoke and a join at the
    // same moment cannot both win: the row changes only while it is still
    // open. A manager revokes only `member` invites (O15-A). Everything that
    // is not revocable for this caller gives `false`, the same answer as an
    // unknown id, so the answer says nothing about another household's ids.
    // Expiry is not in the `where`: revoking an expired invite is harmless,
    // and it is no longer listed anyway.
    revokeInvite: async (_, { id }, ctx) => {
      const householdId = await requireHousehold(ctx)
      const callerRole = await requireHouseholdRole(ctx, householdId, 'manager')
      const { count } = await prisma.householdInvite.updateMany({
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
      await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return true
    },
  },
}
