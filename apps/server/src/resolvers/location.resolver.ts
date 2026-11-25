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
  roleAtLeast,
} from '../lib/authz.js'
import { displayNamesOf, lockHouseholdOrForbid } from '../lib/household.js'
import { recordActivity } from '../lib/activity.js'
import { prisma } from '../lib/prisma.js'
import { publishChange, publishHouseholdChange } from '../lib/publishChange.js'
import {
  DEFAULT_LOCATION_SORT,
  locationPreferencesOf,
  VISIT_INTERVAL_MS,
} from '../lib/locationPreferences.js'
import type { Location, Resolvers } from '../generated/graphql.js'
import type { HouseholdRole, LocationRole, Prisma, Location as PrismaLocation } from '@prisma/client'

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
//
// `dataUpdatedAt` is nullable (households H7b, decision T82). `?? null` also
// covers a test fake's fixture row that leaves the column out.
export function toGraphQL(row: PrismaLocation): Location {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    dataUpdatedAt: row.dataUpdatedAt?.toISOString() ?? null,
  } as unknown as Location
}

/**
 * The rows in the CALLER's own order, with `order` set to the position in
 * this list, 0 to n-1 (households H7b, decisions T76 and T77). In this order:
 *
 *   1. The locations the caller placed (`LocationPreference.customOrder` is
 *      set), by that number.
 *   2. Every other location, AFTER those, by the shared `Location.order`.
 *   3. Ties by id, so the answer is the same every time.
 *
 * So a person who never reordered sees the shared order, and a location made
 * after their last reorder comes last. There is no copy of the shared order
 * into each person's rows (decision T76).
 *
 * The preferences come from `locationPreferencesOf`: ONE read of the
 * caller's own rows per request, cached on `ctx.requestCache`. That map holds
 * the caller's rows of every household; only the ids of `rows` are looked up.
 */
async function inPersonalOrder(ctx: Context, rows: PrismaLocation[]): Promise<Location[]> {
  const preferences = await locationPreferencesOf(ctx)
  const placed = (id: string) => preferences.get(id)?.customOrder ?? null
  return [...rows]
    .sort((a, b) => {
      const pa = placed(a.id)
      const pb = placed(b.id)
      if (pa !== null && pb !== null && pa !== pb) return pa - pb
      if (pa !== null && pb === null) return -1
      if (pa === null && pb !== null) return 1
      if (pa === null && a.order !== b.order) return a.order - b.order
      return byText(a.id, b.id)
    })
    .map((row, index) => toGraphQL({ ...row, order: index }))
}

/**
 * The locations the caller sees, in the caller's own order (`inPersonalOrder`):
 * every location of the caller's household on which they hold a location
 * role that still counts (decision H18).
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
  const rows = await prisma.location.findMany({ where: { id: { in: ids } } })
  return inPersonalOrder(ctx, rows as unknown as PrismaLocation[])
}

/**
 * The ids of the caller's settings list (households H7b, decision T78): for a
 * household owner or manager every location of the household, for a
 * `member` the locations they hold a counted role on. The same set
 * `householdLocations` returns. `reorderLocations` checks its list against it.
 */
async function settingsListIds(
  ctx: Context,
  householdId: string,
  householdRole: HouseholdRole,
): Promise<string[]> {
  if (householdRole === 'member') return locationIdsWithRole(ctx, 'viewer', { householdId })
  // The household is compared in SQL, here.
  const rows = await prisma.location.findMany({ where: { householdId }, select: { id: true } })
  return rows.map((row) => row.id)
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

/** Plain code-point order, the same on every machine (no locale). */
function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * The people of one location (households H5c, decision T39): every role row
 * whose person is still a member of `householdId` (decision H18, the
 * `countedOrganizerIn` shape in lib/authz.ts with no role filter), and whose
 * account is not deleted (households H6 task K.2, decision T61). Sorted by
 * role, organizer first, then by display name, then by id.
 *
 * It checks no role of the caller. `locationPeople` does that first.
 */
async function peopleOfLocation(ctx: Context, locationId: string, householdId: string) {
  const callerId = requireAuth(ctx)
  const rows = await prisma.locationMember.findMany({
    // `deletedAt: null`: a deleted account is not listed (households H6 task
    // K.2, decision T61), even while its role row is still there.
    where: {
      locationId,
      user: { deletedAt: null, householdMemberships: { some: { householdId } } },
    },
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
 * (decision H18, the same membership filter as `peopleOfLocation`). It does
 * NOT leave out a deleted account the way `peopleOfLocation` does (households
 * H6 task K.2): a role write must see the role row that is really there, so
 * a deleted person's leftover role can still be removed. Its two callers,
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
// Most mutations here publish one household-level `LOCATION` event
// (`publishHouseholdChange`, `locationId: null`), AFTER their write has
// committed. Three publish nothing, because only the caller sees what they
// write (households H7b): `reorderLocations`, `setLocationSort` and
// `markLocationVisited`. `removeAllLocationItems` sends location-level
// `STOCK` and `CART` instead. Household-level, not per location (decision Q2 of the H3c-2
// plan): a deleted location can pass no `requireLocationRole` check, so an
// event that named it would reach nobody. On the web `LOCATION` refetches
// every active query (decision Q3). So `deleteLocation` sends no `CART`,
// `STOCK` or `LOG` for the rows its cascade removed (decision Q4).
//
// The household in the event is the household of the location WRITTEN, read
// from the saved row. For `createLocation` and `deleteLocation` that is
// always the caller's household. `updateLocation` checks a location role only, so it can rename a location of a second
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
      // `householdId`. The order is the caller's own (decision T77), the same
      // as `locations`, with the No access rows in their place.
      const rows = await prisma.location.findMany({ where: { householdId } })
      return inPersonalOrder(ctx, rows as unknown as PrismaLocation[])
    },

    // The caller's own sort choice (households H7b, decision T74). Null in
    // the database means "never chose": the default of owner decision O52-A.
    // No household is needed: the choice belongs to the person.
    myLocationSort: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { locationSort: true },
      })
      return row?.locationSort ?? DEFAULT_LOCATION_SORT
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
    // The CALLER's own last visit (households H7b, decision T80). Read from
    // the caller's preference rows, once per request.
    lastVisitedAt: async (parent, _, ctx) => {
      const preferences = await locationPreferencesOf(ctx)
      return preferences.get(parent.id)?.lastVisitedAt?.toISOString() ?? null
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

    // ── The two location purges (households H6 task J.4, decision T55) ──
    //
    // Both take the household lock FIRST and read every role through `tx`
    // after it (decision T52), like the H5c role writes. Each writes its
    // activity row in the same transaction (decision T47), and only when it
    // deleted something. `false`, with no row and no event, when there was
    // nothing to delete.

    // Household role `owner`. Every location of the caller's household goes.
    // ItemStock, Cart (and through it CartItem), InventoryLog and
    // LocationMember all go with their location by ON DELETE CASCADE, the
    // same as `deleteLocation`. The catalog, the household and its people
    // stay. No new "Home" is made (owner decision O34-A): Pantry, Shopping and
    // Cooking then show "You have no locations in this household yet".
    deleteAllLocations: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      // Prisma reads `{ householdId: undefined }` as NO filter: the delete
      // below would take every household's locations.
      if (!householdId) throw new Error('deleteAllLocations: no household id')

      const count = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await lockHouseholdOrForbid(tx, householdId)
        await requireHouseholdRole(ctx, householdId, 'owner', tx)
        const { count } = await tx.location.deleteMany({ where: { householdId } })
        if (count === 0) return 0
        await recordActivity(tx, {
          householdId,
          actorId: userId,
          action: 'LOCATIONS_DELETED',
          details: { count },
        })
        return count
      })
      if (count === 0) return false
      // Household-level, like `deleteLocation`: a deleted location cannot
      // pass `requireLocationRole`, so a location-level event would reach
      // nobody. `LOCATION` refetches every query, so no `CART`, `STOCK` or
      // `LOG` is sent for the deleted rows (decision Q4).
      await publishHouseholdChange(ctx, ['LOCATION'], householdId)
      return true
    },

    // Location role `organizer` on the location, which must be in the
    // household the caller acts in. Deletes the location's `ItemStock` rows
    // and the `CartItem` rows of its carts. KEEPS the `Cart` rows, so the
    // shopping page still shows when each was last bought; an empty cart is
    // what `vendorCart` would make again anyway. Keeps the logs, the role
    // rows and the catalog.
    //
    // The household role does not count: a household owner with no role on
    // the location is refused (the design gives this to the organizer).
    removeAllLocationItems: async (_, { locationId }, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)

      const removed = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await lockHouseholdOrForbid(tx, householdId)
        // The location must be in the household the caller acts in. The same
        // FORBIDDEN for "another household's" and "no such id".
        const location = await tx.location.findFirst({
          where: { id: locationId, householdId },
          select: { id: true, name: true },
        })
        if (!location) throw forbidden()
        const role = await locationRoleOf(ctx, locationId, tx)
        if (!role || !roleAtLeast(role, 'organizer')) throw forbidden()

        // Both filters name THIS location, never the household: a second
        // location of the same household keeps its rows.
        const stock = await tx.itemStock.deleteMany({ where: { locationId } })
        const cartRows = await tx.cartItem.deleteMany({ where: { cart: { locationId } } })
        if (stock.count === 0 && cartRows.count === 0) return null
        // `locationName` is stored because the Activity page shows it
        // ("removed all items from {{location}}"), and the location may be
        // renamed or deleted later (decision T53).
        await recordActivity(tx, {
          householdId,
          actorId: userId,
          action: 'LOCATION_ITEMS_REMOVED',
          locationId,
          details: { locationName: location.name, stockRows: stock.count, cartRows: cartRows.count },
        })
        return { stock: stock.count, cartRows: cartRows.count }
      })
      if (!removed) return false
      // Location-level: the location still exists, so its viewers get these.
      // Only the kinds that changed rows.
      const kinds: ('STOCK' | 'CART')[] = []
      if (removed.stock > 0) kinds.push('STOCK')
      if (removed.cartRows > 0) kinds.push('CART')
      await publishChange(ctx, kinds, [{ locationId, householdId }])
      return true
    },

    // Any household role (households H7b, decision T78). Writes the CALLER's
    // own order: one `LocationPreference` row per location, with
    // `customOrder` = its index. The shared `Location.order` is not written,
    // so nobody else's list moves. (Until H7 this asked `manager` and wrote
    // the shared order for the whole household, decisions H5 and T6.)
    //
    // Checked in this order, all before any write:
    //
    //   1. A repeated id: BAD_USER_INPUT. With ['A', 'A', 'B'] the indexes
    //      would not be an order of the list.
    //   2. Every id must be in the caller's settings list (`settingsListIds`):
    //      FORBIDDEN otherwise. One answer for another household's location,
    //      an unknown id, and a location of this household that a member has
    //      no role on, so the request cannot probe which ids exist.
    //   3. Every location of that list, not a subset: BAD_USER_INPUT. A
    //      subset would give two locations the same position, the one left
    //      out keeping an old `customOrder`.
    //
    // No lock: the rows belong to the caller alone. The upserts are one
    // transaction, so a list is never half written.
    //
    // Publishes nothing (`publishesNothing` in live-publish.guard.test.ts):
    // only the caller sees their order. Their other tabs show it on their
    // next read of the list.
    reorderLocations: async (_, { orderedIds }, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      const role = await requireHouseholdRole(ctx, householdId, 'member')

      if (new Set(orderedIds).size !== orderedIds.length) {
        throw new GraphQLError('Each location may appear only once.', {
          extensions: { code: 'BAD_USER_INPUT' },
        })
      }
      const allowed = new Set(await settingsListIds(ctx, householdId, role))
      if (orderedIds.some((id) => !allowed.has(id))) throw forbidden()
      // The ids are distinct and all in the list, so the sizes are equal
      // only for the full list.
      if (allowed.size !== orderedIds.length) {
        throw new GraphQLError('Send every location of your list, in the new order.', {
          extensions: { code: 'BAD_USER_INPUT' },
        })
      }

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        for (const [index, locationId] of orderedIds.entries()) {
          await tx.locationPreference.upsert({
            where: { userId_locationId: { userId, locationId } },
            create: { userId, locationId, customOrder: index },
            update: { customOrder: index },
          })
        }
      })
      // Read after the write. The request's preference cache was cleared
      // before this field ran (`forgetRolesAroundEach`), and nothing in this
      // field read it before the write, so this read is fresh.
      return visibleLocations(ctx)
    },

    // The caller's own sort choice (households H7b, decision T74). Writes
    // only the caller's `User.locationSort`. Takes no household lock: a
    // `User` row write after a household lock would break the lock order
    // (H5b decision T16), and none is needed. Publishes nothing.
    setLocationSort: async (_, { sort }, ctx) => {
      const userId = requireAuth(ctx)
      const row = await prisma.user.update({
        where: { id: userId },
        data: { locationSort: sort },
        select: { locationSort: true },
      })
      return row.locationSort ?? sort
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

    // Location role `viewer`, on a location of the household the caller acts
    // in (households H7b, decision T80). Writes only the caller's own row.
    // No transaction and no lock: the row belongs to one person, and two
    // visits at the same moment write the same kind of value. Publishes
    // nothing (`publishesNothing` in live-publish.guard.test.ts).
    markLocationVisited: async (_, { locationId }, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      // In the household the caller acts in, then a counted role there. Both
      // refuse with the same FORBIDDEN, so an id cannot be probed.
      await requireLocationInHousehold(ctx, locationId, householdId)
      await requireLocationRole(ctx, locationId, 'viewer')

      const now = new Date()
      const key = { userId_locationId: { userId, locationId } }
      const saved = await prisma.locationPreference.findUnique({
        where: key,
        select: { lastVisitedAt: true },
      })
      if (saved?.lastVisitedAt && now.getTime() - saved.lastVisitedAt.getTime() < VISIT_INTERVAL_MS) {
        return false
      }
      await prisma.locationPreference.upsert({
        where: key,
        create: { userId, locationId, lastVisitedAt: now },
        update: { lastVisitedAt: now },
      })
      return true
    },

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
