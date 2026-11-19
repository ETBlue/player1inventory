import { GraphQLError } from 'graphql'
import { canChangeLocationRole, LOCATION_ROLE_RANK } from '@p1i/types'
import { type Context, requireAuth } from '../context.js'
import {
  forbidden,
  locationIdsWithOrganizer,
  locationIdsWithRole,
  locationRoleOf,
  locationRolesByLocation,
  requireHousehold,
  requireHouseholdRole,
  requireLocationInHousehold,
  requireLocationRole,
} from '../lib/authz.js'
import { displayNamesOf, lockHouseholdOrForbid } from '../lib/household.js'
import { recordActivity } from '../lib/activity.js'
import { prisma } from '../lib/prisma.js'
import { publishHouseholdChange } from '../lib/publishChange.js'
import type { Location, Resolvers } from '../generated/graphql.js'
import type { LocationRole, Prisma, Location as PrismaLocation } from '@prisma/client'

// Map a Prisma Location row to the GraphQL shape. GraphQL schema types
// createdAt/updatedAt as String! — Date objects must be explicitly
// ISO-stringified here rather than left for the default String scalar
// serializer, which coerces via Date.valueOf() (epoch milliseconds) before
// it ever reaches toJSON(). Mirrors item.resolver.ts's and
// itemStock.resolver.ts's toGraphQL.
// Exported because `import.resolver.ts`'s two bulk location mutations return
// `[Location!]!` and must serialize identically. Same reason
// `itemStock.resolver.ts` and `shelf.resolver.ts` import `item.resolver.ts`'s
// `toGraphQL` instead of copying it: a second copy is a second place for the
// ISO-string bug to come back.
export function toGraphQL(row: PrismaLocation): Location {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as unknown as Location
}

/**
 * The locations the caller sees, by `order`: every location of the caller's
 * household on which they hold a location role that still counts (decision
 * H18). Ties are broken by id, so the answer is the same every time.
 *
 * Only ONE household since households H4 task E.5 (decision T15). This is the
 * location switcher and the export's location list. A person in two
 * households (after H5) holds roles in both; without the household filter
 * an export of one household would carry the other's locations, and the
 * import of that file would be refused as "another household".
 *
 * An owner or manager does NOT see a location they have no role on here,
 * even though they may delete and reorder it. The settings list shows them
 * every location of the household through `householdLocations` below
 * (households H5 task F.1, decision T4).
 */
async function visibleLocations(ctx: Context): Promise<Location[]> {
  const ids = await locationIdsWithRole(ctx, 'viewer', {
    householdId: await requireHousehold(ctx),
  })
  if (ids.length === 0) return []
  const rows = await prisma.location.findMany({
    where: { id: { in: ids } },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  })
  return (rows as unknown as PrismaLocation[]).map(toGraphQL)
}

/**
 * The household of a `Location` the resolvers return. Every path that returns
 * a `Location` builds it with `toGraphQL`, which spreads the Prisma row, so
 * `householdId` is there. The GraphQL type does not declare it, so it is read
 * here with a check. If a future path returns a `Location` without it, the
 * row is read again rather than giving a wrong `myRole`. No GraphQL query
 * reaches that fallback today, so `location-roles.resolver.test.ts` calls the
 * field resolvers directly with a parent that has no `householdId`.
 */
async function householdIdOf(parent: Location): Promise<string | null> {
  const known = (parent as unknown as { householdId?: unknown }).householdId
  if (typeof known === 'string') return known
  const row = await prisma.location.findUnique({
    where: { id: parent.id },
    select: { householdId: true },
  })
  return row?.householdId ?? null
}

/**
 * OLD-BUNDLE SHIM. Remove with `Location.isDefault`, in the release after
 * households.
 *
 * The id of the first location, by `order` then `id`, among the locations of
 * `householdId` on which the caller holds a counted role. `null` when there
 * is none. Kept on `ctx.requestCache.firstLocationIds`, one entry per
 * household, so `Location.isDefault` on a list of N locations reads it once.
 * `forgetLocationRoles` (lib/authz.ts) clears it with the role caches, so a
 * create, delete or reorder in the same request is seen.
 */
function firstLocationIdOf(ctx: Context, householdId: string): Promise<string | null> {
  const cache = ctx.requestCache
  const known = cache?.firstLocationIds?.get(householdId)
  if (known) return known
  const lookup = locationRolesByLocation(ctx, householdId).then(async (roles) => {
    if (roles.size === 0) return null
    const [first] = await prisma.location.findMany({
      where: { id: { in: [...roles.keys()] } },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      select: { id: true },
      take: 1,
    })
    return first?.id ?? null
  })
  if (cache) {
    cache.firstLocationIds ??= new Map()
    cache.firstLocationIds.set(householdId, lookup)
  }
  return lookup
}

/** Plain code-point order, the same on every machine (no locale). */
function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * The people of one location (households H5c, decision T39): every role row
 * whose person is still a member of `householdId` (decision H18, the
 * `countedOrganizerIn` shape in lib/authz.ts with no role filter). Sorted by
 * role, organizer first, then by display name, then by id.
 *
 * It checks no role of the caller. `locationPeople` does that first.
 */
async function peopleOfLocation(ctx: Context, locationId: string, householdId: string) {
  const callerId = requireAuth(ctx)
  const rows = await prisma.locationMember.findMany({
    where: { locationId, user: { householdMemberships: { some: { householdId } } } },
    select: { userId: true, role: true },
  })
  const names = await displayNamesOf(rows.map((row) => row.userId))
  return rows
    .map((row) => ({
      userId: row.userId,
      // Every role row has a `User` row (a foreign key). `''` should never show.
      displayName: names.get(row.userId) ?? '',
      role: row.role,
      // Not an authorization check: it only marks the caller's own row.
      isMe: row.userId === callerId,
    }))
    .sort(
      (a, b) =>
        LOCATION_ROLE_RANK[b.role] - LOCATION_ROLE_RANK[a.role] ||
        byText(a.displayName, b.displayName) ||
        byText(a.userId, b.userId),
    )
}

/**
 * The role of `userId` on the location, read through `db`, or `null`. Only a
 * row that still counts: the person must be a member of `householdId`
 * (decision H18, the same filter as `peopleOfLocation`). Its two callers,
 * `setLocationRole` and `removeLocationRole` (through `lockAndReadRoles`),
 * check the person's membership first, so today the filter changes nothing
 * for them. It is there so every `LocationMember` read carries H18.
 */
async function roleOfPerson(
  db: Prisma.TransactionClient,
  locationId: string,
  userId: string,
  householdId: string,
): Promise<LocationRole | null> {
  const row = await db.locationMember.findFirst({
    where: { locationId, userId, user: { householdMemberships: { some: { householdId } } } },
    select: { role: true },
  })
  return row?.role ?? null
}

/**
 * The lock, then the checks, of `setLocationRole` and `removeLocationRole`,
 * inside their transaction (households H5c, decision T34). In this order:
 *
 *   1. The household lock FIRST (`lockHouseholdOrForbid`). `removeMember`
 *      and `leaveHousehold` take the same lock, so a role write and a removal
 *      of the same person run one after the other. The role write then sees
 *      in step 5 that the person is gone, and no role row is left behind
 *      (Review Focus 3 of the plan). A household deleted since
 *      `requireHousehold` found it → FORBIDDEN.
 *   2. The location, in THIS household, in SQL (decision T35). None →
 *      FORBIDDEN, the same answer for an unknown id and another household's
 *      location. It comes before any role read: a person in two households
 *      has real roles on the other household's locations.
 *   3. The caller's household role (`requireHouseholdRole`).
 *   4. The caller's counted location role, or null (`locationRoleOf`).
 *   5. The target's member row in this household. None → FORBIDDEN.
 *   6. The target's current role, or null (`roleOfPerson`).
 *
 * Every read uses `tx`, the transaction's own connection, for two reasons.
 * A read through the global client needs a second connection from the pool
 * while this one is held. And a read through `tx` is a new statement after
 * the lock, so under READ COMMITTED it sees what a write that held the lock
 * before (for example `removeMember`) committed. (A plain SELECT never waits
 * for a row lock. The reads are safe because they come AFTER the lock.)
 *
 * It checks no rule: the caller does that with `canChangeLocationRole`.
 */
async function lockAndReadRoles(
  ctx: Context,
  tx: Prisma.TransactionClient,
  householdId: string,
  locationId: string,
  target: string,
) {
  await lockHouseholdOrForbid(tx, householdId)
  const location = await tx.location.findFirst({
    where: { id: locationId, householdId },
    select: { id: true, name: true },
  })
  if (!location) throw forbidden()
  const householdRole = await requireHouseholdRole(ctx, householdId, 'member', tx)
  const callerRole = await locationRoleOf(ctx, locationId, tx)
  const membership = await tx.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: target } },
    select: { role: true },
  })
  if (!membership) throw forbidden()
  const from = await roleOfPerson(tx, locationId, target, householdId)
  // The name goes into the activity row (households H6 task J.2): the
  // location may be deleted later, and the log must still name it.
  return { householdRole, callerRole, from, locationName: location.name }
}

// ── LIVE EVENTS (households H3c-2 task D.3) ──
//
// Every mutation here publishes one household-level `LOCATION` event
// (`publishHouseholdChange`, `locationId: null`), AFTER its write has
// committed. Household-level, not per location (decision Q2 of the H3c-2
// plan): a deleted location can pass no `requireLocationRole` check, so an
// event that named it would reach nobody. On the web `LOCATION` refetches
// every active query (decision Q3). So `deleteLocation` sends no `CART`,
// `STOCK` or `LOG` for the rows its cascade removed (decision Q4).
//
// The household in the event is the household of the location WRITTEN, read
// from the saved row. For `createLocation`, `deleteLocation` and
// `reorderLocations` that is always the caller's household. `updateLocation`
// checks a location role only, so it can rename a location of a second
// household the caller belongs to.

export const locationResolvers: Pick<Resolvers, 'Query' | 'Mutation' | 'Location'> = {
  Query: {
    locations: async (_, __, ctx) => {
      // First sign-in happens here for most people: a new person gets their
      // household, its first location "Home", and an `organizer` row on it
      // (lib/household.ts). So it must run before the role rows are read.
      await requireHousehold(ctx)
      return visibleLocations(ctx)
    },

    // The settings list (households H5 task F.1, decision T4). An owner or
    // manager gets every location of the household, including the ones they
    // have no role on: they may reorder and delete every
    // location, so they must see each one. They get its NAME only. Its stock,
    // carts and logs still need a location role (design, *Rules that cross
    // the two levels*). A `member` gets the switcher's list.
    householdLocations: async (_, __, ctx) => {
      const householdId = await requireHousehold(ctx)
      const role = await requireHouseholdRole(ctx, householdId, 'member')
      if (role === 'member') return visibleLocations(ctx)
      // The household is compared in SQL, here. No call site compares a
      // `householdId`.
      const rows = await prisma.location.findMany({
        where: { householdId },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      })
      return (rows as unknown as PrismaLocation[]).map(toGraphQL)
    },

    // The people page of one location (households H5c, decision T39, owner
    // decision O24-A). The checks, in this order:
    //
    //   1. The caller's household (`requireHousehold`). Only a location of
    //      THAT household (decision T35). It is checked in SQL by
    //      `requireLocationInHousehold`, BEFORE any role is read: a person in
    //      two households has real roles on the other household's locations,
    //      and `locationRoleOf` would return them.
    //   2. The caller's household role. An owner or manager may read the
    //      people of every location of the household, also one where they
    //      have no role (No access). They get names and roles only, never the
    //      location's stock, carts or logs.
    //   3. Anyone else needs a counted role on the location (`locationRoleOf`,
    //      decision H18). Any role is enough: a viewer may read it.
    //
    // Every refusal is the same FORBIDDEN: an unknown id, another
    // household's location, and a member with no role there.
    //
    // No lock: it is a read.
    locationPeople: async (_, { locationId }, ctx) => {
      const householdId = await requireHousehold(ctx)
      await requireLocationInHousehold(ctx, locationId, householdId)
      const householdRole = await requireHouseholdRole(ctx, householdId, 'member')
      if (householdRole === 'member' && (await locationRoleOf(ctx, locationId)) === null) {
        throw forbidden()
      }
      return peopleOfLocation(ctx, locationId, householdId)
    },
  },

  // Two field resolvers (households H5 task F.1, decision T3). Each reads a
  // map built ONCE per household per request (lib/authz.ts), so a list of N
  // locations costs two reads in all, not 2N. The household is the
  // LOCATION's own, not the caller's: `updateLocation` can return a location
  // of a second household the caller belongs to.
  Location: {
    myRole: async (parent, _, ctx) => {
      const householdId = await householdIdOf(parent)
      if (!householdId) return null
      const roles = await locationRolesByLocation(ctx, householdId)
      return roles.get(parent.id) ?? null
    },
    hasOrganizer: async (parent, _, ctx) => {
      const householdId = await householdIdOf(parent)
      if (!householdId) return false
      const organized = await locationIdsWithOrganizer(ctx, householdId)
      return organized.has(parent.id)
    },
    // OLD-BUNDLE SHIM. Remove in the release after households, with the
    // field in `location.graphql` (see the comment there for why it exists).
    //
    // True only for the first location the caller can see in this location's
    // household, by `order` and then `id`: the first row of `locations`. The
    // old bundle reads it in three places:
    //
    // | Old bundle code                              | Uses `isDefault` to          |
    // |----------------------------------------------|------------------------------|
    // | `useActiveLocation`, `useCloudLocationId`    | pick the active location     |
    // | `fetchCloudDefaultLocationId` (importData)   | map a backup's default onto  |
    // | `LocationList`                               | hide Delete, lock the drag   |
    //
    // This keeps each of the three working: exactly one location of the
    // caller's list is the default. It is not always the SAME location that
    // `main` marked. On `main` the default was a stored flag, not the first
    // by `order`, so a row could sit above it. Then the old bundle locks a
    // different row, shows Delete on its old default, and picks a different
    // import target and active location. No data is lost. See runbook 8.3.
    //
    // `false` for every location would leave the import with no target, and
    // would let the old bundle delete the household's last location, which
    // it cannot show an empty screen for.
    //
    // The first id is read ONCE per household per request
    // (`firstLocationIdOf`), so a list of N locations costs one read, not N.
    isDefault: async (parent, _, ctx) => {
      const householdId = await householdIdOf(parent)
      if (!householdId) return false
      return (await firstLocationIdOf(ctx, householdId)) === parent.id
    },
  },

  Mutation: {
    // Household role `member`, the lowest: anyone in the household may add a
    // location. The creator organizes it.
    createLocation: async (_, { name }, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      await requireHouseholdRole(ctx, householdId, 'member')

      // ONE transaction, so a location never exists without its organizer
      // row. Without that row nobody could rename it, stock it or see it:
      // every location check reads `LocationMember` (lib/authz.ts).
      const row = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // max + 1 within the HOUSEHOLD, including locations the caller has no
        // role on, so a new location never shares an order with one that
        // another member sees.
        const siblings = await tx.location.findMany({
          where: { householdId },
          select: { order: true },
        })
        const maxOrder = siblings.reduce((max, l) => Math.max(max, l.order), -1)
        const created = await tx.location.create({
          data: { name: name.trim(), order: maxOrder + 1, householdId },
        })
        await tx.locationMember.create({
          data: { locationId: created.id, userId, role: 'organizer' },
        })
        return created
      })
      await publishHouseholdChange(ctx, ['LOCATION'], row.householdId)
      return toGraphQL(row as unknown as PrismaLocation)
    },

    // Location role `organizer`: renaming changes the location for everyone
    // who shares it.
    updateLocation: async (_, { id, input }, ctx) => {
      await requireLocationRole(ctx, id, 'organizer')
      const data: { name?: string } = {}
      if (typeof input.name === 'string') data.name = input.name.trim()
      const row = await prisma.location.update({ where: { id }, data })
      await publishHouseholdChange(ctx, ['LOCATION'], row.householdId)
      return toGraphQL(row as unknown as PrismaLocation)
    },

    // Household role `manager`. The LOCATION role does not count here, either
    // way: a manager with no role on a location may delete it, and a
    // household `member` who organizes one may not.
    deleteLocation: async (_, { id }, ctx) => {
      const householdId = await requireHousehold(ctx)

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // FIRST, before the reads below. Until H5 task F.7 this stopped two
        // deletes at once from both counting 2 and leaving no location. That
        // count is gone (the last location may go now), but the lock stays:
        // `deleteLocation`, `clearAllData` and the H6 purges take it in the
        // same order (decision T8 of the H5 plan). A second delete in the
        // same household waits here for the first to commit.
        //
        // Since households H6 task J.4 (decision T52) it is
        // `lockHouseholdOrForbid`, so a household deleted since
        // `requireHousehold` found it gives FORBIDDEN, not Prisma's P2025.
        // And the `manager` role is read AFTER it, through `tx`, so a
        // manager demoted at the same moment is refused.
        await lockHouseholdOrForbid(tx, householdId)
        await requireHouseholdRole(ctx, householdId, 'manager', tx)

        // The location must be in the caller's household. A `where` filter,
        // and the same `Forbidden` for "another household's" and "no such
        // id", so a caller cannot probe for ids.
        const location = await tx.location.findFirst({
          where: { id, householdId },
          select: { id: true },
        })
        if (!location) throw forbidden()

        // Any location may go, the last one too. Decision H13 refused the
        // last location (error code LAST_LOCATION) while there was no screen
        // for a household with none. H5 task F.7 lifted it (owner answer O8):
        // Pantry, Shopping and Cooking now show "You have no locations in
        // this household yet." with Create a location.

        // ItemStock, Cart, InventoryLog and LocationMember all cascade via
        // their foreign keys, so this one delete removes the location's stock
        // rows, its carts (and through Cart, its cart items), its inventory
        // logs and its role rows. Matches local mode's deleteLocation
        // (apps/web/src/db/operations.ts).
        await tx.location.delete({ where: { id } })
      })
      // The location was found with `householdId` in its filter, so its
      // household is the caller's. Nothing moves to another location: the
      // rows of the deleted location are deleted, not reassigned.
      await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return true
    },

    // Household role `manager`. Order is one list for the whole household
    // until H7 brings each person their own (decision H5). The list must hold
    // every location of the household (decision T6 of the H5 plan).
    reorderLocations: async (_, { orderedIds }, ctx) => {
      const householdId = await requireHousehold(ctx)
      await requireHouseholdRole(ctx, householdId, 'manager')

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // A repeated id is refused. With ['A', 'A', 'B'], A would get order 0
        // and then 1, and B 2: no order 0 left, and the list the caller sent
        // is not an order of the locations. The web app never sends one:
        // `LocationList` sends `arrayMove(locations, …).map((l) => l.id)`, a
        // new order of the list it shows, and `useReorderLocations` passes it
        // on unchanged. So a repeated id is a malformed request.
        if (new Set(orderedIds).size !== orderedIds.length) {
          throw new GraphQLError('Each location may appear only once.', {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }

        // Every id must be a location of the caller's household. Checked
        // before ANY write, so a batch with one foreign or unknown id changes
        // nothing at all.
        const found = await tx.location.findMany({
          where: { id: { in: orderedIds }, householdId },
          select: { id: true },
        })
        if (found.length !== orderedIds.length) throw forbidden()

        // Every location of the household, not a subset (households H5 task
        // F.2, decision T6). The ids are distinct and all in the household
        // (checked above), so the counts are equal only for the full set. A
        // subset would write orders 0..n-1 and leave a location that was
        // left out sharing one of them (the H3a duplicate-order gap). An
        // owner or manager may hold no role on some locations, so the web's
        // settings list must send `householdLocations`, not `locations`
        // (task F.3).
        const total = await tx.location.count({ where: { householdId } })
        if (total !== orderedIds.length) {
          throw new GraphQLError('Send every location of the household, in the new order.', {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }

        for (const [index, id] of orderedIds.entries()) {
          await tx.location.update({ where: { id }, data: { order: index } })
        }
      })
      // An empty list writes nothing, so it tells nobody. It passes the check
      // above only for a household with no location (after task F.7).
      if (orderedIds.length > 0) {
        await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      }
      return visibleLocations(ctx)
    },

    // ── setLocationRole, removeLocationRole, leaveLocation (households H5c,
    // task H.3) ──
    //
    // One transaction each, in the order of `lockAndReadRoles` (decision
    // T34). Who may do what is ONE rule, `canChangeLocationRole` in
    // `@p1i/types`, which the web uses too (decision T33). After the commit,
    // ONE household-level `LOCATION` event, and only when a row changed
    // (decision T36). The person who lost a role is still a household member,
    // so their tabs hear it.
    //
    // Each write that changed a row also writes ONE activity row through
    // `tx`, in the same transaction (households H6 task J.2, decisions T47
    // and T51, owner decision O29-A). Nothing changed, or refused: no row.

    // Adds a role or changes it. The same role again writes nothing, sends
    // nothing, and returns the row (decision T38).
    setLocationRole: async (_, { locationId, userId: target, role }, ctx) => {
      const callerId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const { householdRole, callerRole, from, locationName } = await lockAndReadRoles(
          ctx,
          tx,
          householdId,
          locationId,
          target,
        )
        if (!canChangeLocationRole({ householdRole, callerRole, from, to: role })) {
          throw forbidden()
        }
        if (from === role) return { role, changed: false }
        // `upsert` on the one row a person has per location: a change of role
        // updates it, a new role creates it.
        const saved = await tx.locationMember.upsert({
          where: { locationId_userId: { locationId, userId: target } },
          create: { locationId, userId: target, role },
          update: { role },
          select: { role: true },
        })
        await recordActivity(tx, {
          householdId,
          actorId: callerId,
          action: 'LOCATION_ROLE_SET',
          targetUserId: target,
          locationId,
          details: { locationName, from, to: saved.role },
        })
        return { role: saved.role, changed: true }
      })
      if (result.changed) await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      // Read after the commit: the name is not part of the check.
      const names = await displayNamesOf([target])
      return {
        userId: target,
        // Every member has a `User` row (a foreign key). `''` should never show.
        displayName: names.get(target) ?? '',
        role: result.role,
        // Not an authorization check: it only marks the caller's own row.
        isMe: target === callerId,
      }
    },

    // Deletes ONE role row and nothing else (decision T42). The location's
    // carts, cart rows (their `userId` means only "added by"), stock and logs
    // stay.
    removeLocationRole: async (_, { locationId, userId: target }, ctx) => {
      const callerId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      const changed = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const { householdRole, callerRole, from, locationName } = await lockAndReadRoles(
          ctx,
          tx,
          householdId,
          locationId,
          target,
        )
        if (from === null) {
          // Nothing to remove: `false`, not an error, so a second press of
          // Remove shows no error (decision T38). But only to a caller who
          // may read the people of the location (owner decision O24-A).
          // Anyone else gets FORBIDDEN, so `false` cannot tell them who has
          // no role there.
          if (householdRole === 'member' && callerRole === null) throw forbidden()
          return false
        }
        if (!canChangeLocationRole({ householdRole, callerRole, from, to: null })) {
          throw forbidden()
        }
        const { count } = await tx.locationMember.deleteMany({
          where: { locationId, userId: target },
        })
        if (count === 0) return false
        await recordActivity(tx, {
          householdId,
          actorId: callerId,
          action: 'LOCATION_ROLE_REMOVED',
          targetUserId: target,
          locationId,
          details: { locationName, from },
        })
        return true
      })
      if (changed) await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return changed
    },

    // The caller leaves the location. It never refuses for a role reason:
    // any role may leave, the only organizer too (owner decision O25-A). The
    // location then shows "No organizer". The same lock and the same first
    // checks as the two writes above.
    leaveLocation: async (_, { locationId }, ctx) => {
      const callerId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      const changed = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await lockHouseholdOrForbid(tx, householdId)
        const location = await tx.location.findFirst({
          where: { id: locationId, householdId },
          select: { id: true, name: true },
        })
        if (!location) throw forbidden()
        await requireHouseholdRole(ctx, householdId, 'member', tx)
        // No role: `false`, not an error (a second press, decision T38).
        const from = await locationRoleOf(ctx, locationId, tx)
        if (from === null) return false
        const { count } = await tx.locationMember.deleteMany({
          where: { locationId, userId: callerId },
        })
        if (count === 0) return false
        await recordActivity(tx, {
          householdId,
          actorId: callerId,
          action: 'LOCATION_LEFT',
          locationId,
          details: { locationName: location.name, from },
        })
        return true
      })
      if (changed) await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return changed
    },
  },
}
