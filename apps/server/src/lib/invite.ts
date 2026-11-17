import { randomBytes } from 'crypto'
import { GraphQLError } from 'graphql'
import type { LocationRole } from '@prisma/client'

// Small helpers for household invites (households H5b, task G.3; plan
// docs/global/permissions/2026-11-18-households-plan-h5b.md).

/** How long an invite link works (owner decision O6-A). */
export const INVITE_LIFETIME_DAYS = 7

/** The time an invite made at `now` stops working. */
export function inviteExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * A new invite token: 32 random bytes as base64url, so 43 characters
 * (decision T12). It is a secret. Never log it.
 */
export function newInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

/** One location role an invite gives. */
export interface InviteLocationRoleEntry {
  locationId: string
  role: LocationRole
}

const LOCATION_ROLES: readonly string[] = ['organizer', 'participant', 'viewer']

/**
 * Read the `HouseholdInvite.locationRoles` JSON column (decision T26).
 *
 * The column is JSON, so Prisma does not check its shape. Every read goes
 * through this parser. It throws a plain `Error` that names the problem when
 * the value is not a list, an entry has no string `locationId`, a role is not
 * a location role, or one location is named twice. A plain `Error` reaches
 * the client as an internal error: a bad row is a server bug, not bad input.
 */
export function parseLocationRoles(json: unknown): InviteLocationRoleEntry[] {
  if (!Array.isArray(json)) throw new Error('locationRoles: the value is not a list')
  const seen = new Set<string>()
  return json.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`locationRoles: entry ${index} is not an object`)
    }
    const { locationId, role } = entry as Record<string, unknown>
    if (typeof locationId !== 'string' || locationId === '') {
      throw new Error(`locationRoles: entry ${index} has no locationId`)
    }
    if (typeof role !== 'string' || !LOCATION_ROLES.includes(role)) {
      throw new Error(`locationRoles: entry ${index} has an unknown role`)
    }
    if (seen.has(locationId)) {
      throw new Error(`locationRoles: entry ${index} names a location twice`)
    }
    seen.add(locationId)
    return { locationId, role: role as LocationRole }
  })
}

/**
 * The one answer for an invite that is not found, expired, used or revoked
 * (decision T18). One answer for all four, so a caller learns nothing about a
 * token.
 */
export function inviteInvalid(): GraphQLError {
  return new GraphQLError('This invite is no longer valid.', {
    extensions: { code: 'BAD_USER_INPUT', reason: 'INVITE_INVALID' },
  })
}

/** The caller is already in the invite's household (decision T18). */
export function alreadyMember(): GraphQLError {
  return new GraphQLError('You are already in this household.', {
    extensions: { code: 'BAD_USER_INPUT', reason: 'ALREADY_MEMBER' },
  })
}
