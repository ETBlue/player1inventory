import { GraphQLError } from 'graphql'
import type { HouseholdRole, LocationRole } from '@prisma/client'
import { type Context, requireAuth } from '../context.js'
import { ensureHousehold } from './household.js'
import { prisma } from './prisma.js'

// The two role ladders (decision H14, design *Household roles* and *Location
// roles*). Both are Prisma enums, so a typo at a call site fails `tsc`.
export type { HouseholdRole, LocationRole } from '@prisma/client'

/** Higher is stronger. `owner` passes every household check. */
const HOUSEHOLD_RANK: Record<HouseholdRole, number> = { member: 1, manager: 2, owner: 3 }

/** Higher is stronger. `organizer` passes every location check. */
const LOCATION_RANK: Record<LocationRole, number> = { viewer: 1, participant: 2, organizer: 3 }

/**
 * The location roles that may write: `participant` and up. Written out, not
 * worked out from `LOCATION_RANK`, so a reader can see the list.
 */
const WRITE_LOCATION_ROLES: LocationRole[] = ['organizer', 'participant']

/**
 * The one refusal every role check uses. "Not a member", "role too low", "no
 * such row" and "another household's row" all give this same error, so a
 * caller cannot use it to find out which ids exist.
 */
export function forbidden(): GraphQLError {
  return new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } })
}

/**
 * The caller's household id. A new person gets their household, and their
 * first location, here (`ensureHousehold`, lib/household.ts).
 *
 * Worked out once per request: the context function in `index.ts` gives every
 * request its own `requestCache`, and the answer is kept there. A context
 * without one (most tests) works it out on every call. The PROMISE is kept,
 * not the id, so resolvers that run in parallel in one request share one
 * lookup.
 */
export function requireHousehold(ctx: Context): Promise<string> {
  const userId = requireAuth(ctx)
  const cache = ctx.requestCache
  const known = cache?.householdId
  if (known) return known
  const lookup = ensureHousehold(userId, ctx.language ?? 'en')
  if (cache) cache.householdId = lookup
  return lookup
}

/**
 * Refuse unless the caller holds `role` or higher in `householdId`.
 * `owner` > `manager` > `member`. Returns the role the caller holds.
 */
export async function requireHouseholdRole(
  ctx: Context,
  householdId: string,
  role: HouseholdRole,
): Promise<HouseholdRole> {
  const userId = requireAuth(ctx)
  const membership = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
    select: { role: true },
  })
  if (!membership || HOUSEHOLD_RANK[membership.role] < HOUSEHOLD_RANK[role]) {
    throw forbidden()
  }
  return membership.role
}

/**
 * The `where` for "a location role of `userId` that still counts".
 *
 * A `LocationMember` row counts only while the same person is also a
 * `HouseholdMember` of the location's household (decision H18). So a person
 * removed from a household (H5) loses their location rights at once, even if
 * a `LocationMember` row is left behind. Postgres cannot check this with a
 * simple constraint, so every read of a location role must carry it. Use this
 * one builder, so no read can forget it.
 *
 * `some` matches when AT LEAST ONE member row passes, so the `userId` inside
 * it is what makes it about this person. Without it, any household with any
 * member would pass.
 */
function countedLocationRole(userId: string) {
  return {
    userId,
    location: { household: { members: { some: { userId } } } },
  }
}

/**
 * The single authorization seam for location-scoped data.
 *
 * Call sites ask "does the caller hold this role, or a higher one, on this
 * location?" and never compare a `userId` themselves (root CLAUDE.md,
 * Authorization). `organizer` > `participant` > `viewer`.
 *
 * The household role does NOT count here. A household `owner` with no
 * `LocationMember` row on a location is refused (design, *Rules that cross
 * the two levels*). Until H5 that cannot happen: everyone organizes the
 * locations they made.
 *
 * Returns the location id and the role the caller holds.
 */
export async function requireLocationRole(
  ctx: Context,
  locationId: string,
  role: LocationRole,
): Promise<{ id: string; role: LocationRole }> {
  const userId = requireAuth(ctx)

  const membership = await prisma.locationMember.findFirst({
    where: { locationId, ...countedLocationRole(userId) },
    select: { role: true },
  })

  // The same refusal for "no such location", "another household's location",
  // "no role" and "role too low", so a caller cannot probe for ids.
  if (!membership || LOCATION_RANK[membership.role] < LOCATION_RANK[role]) {
    throw forbidden()
  }

  return { id: locationId, role: membership.role }
}

/**
 * The ids of every location on which the caller holds a location role that
 * still counts (decision H18), whatever the role. This is the list a person
 * sees: the `locations` query reads it (task 3.6).
 *
 * The household role does NOT add locations here. An owner or manager sees a
 * location only through a `LocationMember` row, until H5.
 */
export async function locationIdsWithRole(ctx: Context): Promise<string[]> {
  const userId = requireAuth(ctx)
  const memberships = await prisma.locationMember.findMany({
    where: countedLocationRole(userId),
    select: { locationId: true },
  })
  return memberships.map((m) => m.locationId)
}

/**
 * Where an import puts a log or a cart that names no location it can use
 * (decision H12): the caller's first location by `order`, in the caller's
 * household, on which the caller is `participant` or higher.
 *
 * A stopgap until H4, whose "Import into which location?" dialog replaces it.
 * It replaces `ensureDefaultLocation`, which went with `isDefault`.
 *
 * `requireHousehold` runs first, so a new person gets "Home" here exactly as
 * they did from `ensureDefaultLocation` before. If the caller still has no
 * location they may write to, the import is refused with `NO_LOCATION`.
 *
 * That CAN happen today, in two ways, until later tasks of H3a close them:
 *
 * - `clearAllData` deletes every location, and nothing makes a new one. The
 *   household still exists, so `requireHousehold` returns at once and does
 *   not run first sign-in again. So a "clear" import followed by a log or
 *   cart that names no location gets `NO_LOCATION`. Task 3.10 fixes this
 *   (decision H17).
 * - `bulkCreateLocations` / `bulkUpsertLocations` do not yet write an
 *   `organizer` row, so a location made by them does not count here. Task
 *   3.9 fixes this. (`createLocation` writes one since task 3.6.)
 *
 * Once both are fixed, it cannot happen before H5: deleting the last
 * location is refused (decision H13), and the creator of a location
 * organizes it.
 */
export async function fallbackImportLocation(ctx: Context): Promise<string> {
  const userId = requireAuth(ctx)
  const householdId = await requireHousehold(ctx)

  const counted = countedLocationRole(userId)
  const memberships = await prisma.locationMember.findMany({
    where: {
      ...counted,
      role: { in: WRITE_LOCATION_ROLES },
      location: { ...counted.location, householdId },
    },
    select: { locationId: true },
  })

  const locations =
    memberships.length === 0
      ? []
      : await prisma.location.findMany({
          where: { id: { in: memberships.map((m) => m.locationId) } },
          select: { id: true, order: true },
        })
  // Sorted here, not with `orderBy`, so ties are broken the same way every
  // time: by id.
  const first = [...locations].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))[0]
  if (!first) {
    throw new GraphQLError('You have no location to import into.', {
      extensions: { code: 'NO_LOCATION' },
    })
  }
  return first.id
}

/**
 * The nine models that carry a `userId` column and have `id` as their only
 * unique key. `ItemStock` is NOT here on purpose: it carries no `userId` at
 * all and is scoped through its location by `requireLocationRole`. `Location`
 * is not here either, for the same reason — it IS the location.
 *
 * This is a hand-maintained list, and a wrong literal at a call site compiles.
 * Every call site therefore needs its own test, and deleting a guard must turn
 * a named test red.
 */
export type OwnedModel =
  | 'item'
  | 'tag'
  | 'tagType'
  | 'vendor'
  | 'recipe'
  | 'inventoryLog'
  | 'cart'
  | 'cartItem'
  | 'shelf'

/** The two reads the guard needs on a model with an `id` and a `userId`. */
interface OwnedRowDelegate {
  findUnique(args: {
    where: { id: string }
    select: { id: true }
  }): Promise<{ id: string } | null>
  findFirst(args: {
    where: { id: string; userId: string }
    select: { id: true }
  }): Promise<{ id: string } | null>
}

function delegateFor(model: OwnedModel): OwnedRowDelegate {
  // Built PER CALL, not captured at module load, so a test that swaps a method
  // on the mocked `prisma` after import still sees its own swap.
  //
  // `satisfies` type-checks the nine entries, so the `as unknown as
  // Record<OwnedModel, OwnedRowDelegate>` cast the design doc allowed as a
  // fallback is not needed. Prisma's `findUnique` is generic, and assignability
  // to this non-generic target instantiates its type parameter from the target.
  //
  // What `satisfies` catches here, measured on Prisma 6.19.3 on 2026-10-28:
  // `prisma.itemTag` (a composite-key model with no `id`) fails TS2322, and so
  // does any value that is not a delegate at all. What it does NOT catch:
  // `prisma.itemStock`, whose model has an `id` but no `userId` column, is
  // accepted — a `where` with an extra key is assignable to
  // `ItemStockWhereInput` because excess-property checking does not apply to a
  // type-level assignability check. Nor can it catch a swap between two models
  // that are both in this table. So a wrong model literal at a call site still
  // compiles, and per-call-site tests are what catch it.
  const delegates = {
    item: prisma.item,
    tag: prisma.tag,
    tagType: prisma.tagType,
    vendor: prisma.vendor,
    recipe: prisma.recipe,
    inventoryLog: prisma.inventoryLog,
    cart: prisma.cart,
    cartItem: prisma.cartItem,
    shelf: prisma.shelf,
  } satisfies Record<OwnedModel, OwnedRowDelegate>
  return delegates[model]
}

/**
 * The single authorization seam for account-scoped data — the nine models in
 * `OwnedModel`, which belong to no location and so are outside
 * `requireLocationRole`'s reach.
 *
 * Three cases for one row id:
 *
 * | The id is | Result |
 * |---|---|
 * | held by a row the caller may write | returns `'own'` |
 * | held by somebody else's row | **throws** `FORBIDDEN` |
 * | held by no row | returns `'unclaimed'` |
 *
 * The "somebody else's" case throws rather than returning, so a call site
 * cannot ignore it.
 *
 * Call sites never inspect `userId` themselves — root CLAUDE.md forbids
 * `row.userId === ctx.userId` as an authorization check. They say "this id
 * must be one I may write", and this body is what decides. When account scope
 * changes — a household scope is the likely answer and is being explored on
 * another branch — the `where` below changes and no call site moves. That is
 * the same contract `requireLocationRole` above already carries.
 *
 * See docs/features/settings/2026-10-28-design-import-ownership-guard.md.
 */
export async function requireOwnRowOrUnclaimed(
  ctx: Context,
  model: OwnedModel,
  id: string,
): Promise<'own' | 'unclaimed'> {
  const userId = requireAuth(ctx)

  // UNSCOPED on purpose, and only `id` is selected. "Is this primary key
  // taken" is not an authorization question and has no user to scope by.
  const taken = await delegateFor(model).findUnique({
    where: { id },
    select: { id: true },
  })
  if (!taken) return 'unclaimed'

  // The AUTHORIZATION decision, SCOPED IN SQL. Never a comparison of a fetched
  // row's `userId` against the caller's.
  const own = await delegateFor(model).findFirst({
    where: { id, userId },
    select: { id: true },
  })

  // Same wording and code as `requireLocationRole`'s refusal above, so a
  // refusal reveals neither which model nor who owns the row.
  //
  // Note what this does NOT hide, because it cannot: a free id returns
  // `'unclaimed'` and a stranger's id throws, so the caller can tell those two
  // apart. An import has to be able to create new rows, so that difference is
  // unavoidable. What protects the ids is that they are `cuid()` and cannot be
  // guessed. `requireLocationRole` above is stricter — it refuses a missing id
  // too — and the reason stated there does not carry over here unchanged.
  if (!own) {
    throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } })
  }

  return 'own'
}
