import { randomBytes } from 'crypto'
import { GraphQLError } from 'graphql'
import type { LocationRole, Prisma } from '@prisma/client'

// Small helpers for household invites (households H5b, task G.3; plan
// docs/global/permissions/2026-11-18-households-plan-h5b.md).

/** How long an invite link works (owner decision O6-A). */
export const INVITE_LIFETIME_DAYS = 7

/** The time an invite made at `now` stops working. */
export function inviteExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000)
}

/** How many random bytes make one invite token (decision T12). */
const INVITE_TOKEN_BYTES = 32

/**
 * The length of every token `newInviteToken` makes. base64url writes 4
 * characters for every 3 bytes and adds no padding, so 32 bytes give 43.
 */
export const INVITE_TOKEN_LENGTH = Math.ceil((INVITE_TOKEN_BYTES * 4) / 3)

/**
 * A new invite token: 32 random bytes as base64url, so 43 characters
 * (decision T12). It is a secret. Never log it.
 */
export function newInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString('base64url')
}

/**
 * True when `token` has the length every stored token has. A token of any
 * other length cannot name an invite, so `invitePreview` answers INVALID
 * without a database read (and G.4's join should do the same). It is a cheap
 * filter only: a token of the right length still needs the read.
 */
export function hasInviteTokenLength(token: string): boolean {
  return token.length === INVITE_TOKEN_LENGTH
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

/**
 * The `where` that matches the households in `householdIds` that are EMPTY
 * for `userId` (households H5b, decision T21, owner decision O2-A). When a
 * person joins a household through an invite, `joinHousehold` deletes their
 * other households with ONE `household.deleteMany` on this `where`, inside
 * the join transaction. One statement decides "is it empty" and deletes, so
 * our own code leaves no gap between the two.
 *
 * "Empty" means all of these. Each key is here because the row it checks is
 * data a person would lose:
 *
 * - `members: { every: { userId } }` — nobody else is in it. A household
 *   someone else shares is never deleted.
 * - `items`, `tags`, `tagTypes`, `vendors`, `recipes`, `shelves`: `none` —
 *   no catalog row of any kind.
 * - `locations: { every: ... }` — every location has no stock row
 *   (`itemStocks`), no log (`inventoryLogs`), and only carts with no row
 *   (`carts: { every: { items: { none } } }`).
 *
 * NOT checked, on purpose, so they do not keep a household: the locations
 * themselves (first sign-in makes "Home"), the person's own location roles,
 * empty carts (`vendorCart` makes one just by opening a cart page), and open
 * invites. All of them go with the household, by `onDelete: Cascade`.
 *
 * The relation names are those of `prisma/schema.prisma`: `Household.members`,
 * `.items`, `.tags`, `.tagTypes`, `.vendors`, `.recipes`, `.shelves`,
 * `.locations`; `Location.itemStocks`, `.inventoryLogs`, `.carts`;
 * `Cart.items`. Prisma's types refuse a wrong name, so `tsc` checks them.
 *
 * A NEW model that belongs to a household or a location must be added here,
 * or a household holding only that data is deleted at the next join.
 *
 * Except the activity log, on purpose (households H6, decision T49).
 * `HouseholdActivity` rows are NOT checked here: a log is not data a person
 * would lose, so a household that holds only log rows is still "empty", and
 * its rows go with it (ON DELETE CASCADE). If this `where` asked
 * `activities: { none: {} }`, a person who once cleared their own empty
 * household (which writes a log row) could never have it removed at a join.
 * `invite-join.resolver.test.ts` pins it ("activity log rows do not keep
 * it").
 *
 * The ownership offers are left out too, for the same decision T49
 * (`OwnershipOffer`, households H6b task K.1). An offer is made TO another
 * member, so an offer in a one-person household cannot exist: it would need
 * someone else in it. If one were ever left behind, it would go with the
 * household (ON DELETE CASCADE). `invite-join.resolver.test.ts` pins it
 * ("an ownership offer does not keep it"). The household fake also has no
 * `ownershipOffers` key, so a join that asked it would throw in every join
 * test.
 *
 * The location preferences are left out too (`LocationPreference`,
 * households H7b task M.1, decision T75). A person's own order and last visit
 * are not data they would lose, so a household that holds only preference
 * rows is still "empty", and the rows go with its locations (ON DELETE
 * CASCADE). If the `locations: { every }` filter asked
 * `preferences: { none: {} }`, a person who once opened their own empty
 * household (which writes a last visit, decision T80) could never have it
 * removed at a join. `invite-join.resolver.test.ts` pins it ("location
 * preference rows do not keep it"). The household fake has no `preferences`
 * key in that filter, so a join that asked it would throw in every join test.
 */
export function emptyHouseholdWhere(
  userId: string,
  householdIds: string[],
): Prisma.HouseholdWhereInput {
  return {
    id: { in: householdIds },
    members: { every: { userId } },
    items: { none: {} },
    tags: { none: {} },
    tagTypes: { none: {} },
    vendors: { none: {} },
    recipes: { none: {} },
    shelves: { none: {} },
    locations: {
      every: {
        itemStocks: { none: {} },
        inventoryLogs: { none: {} },
        carts: { every: { items: { none: {} } } },
      },
    },
  }
}
