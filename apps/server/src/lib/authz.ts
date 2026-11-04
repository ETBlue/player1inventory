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
 * The caller's household id, after checking the caller holds `role` or higher
 * in it. This is the one entry point of every catalog resolver (households
 * H3a, task 3.7): reads ask for `member`, writes ask for `manager` (design,
 * *Household roles*: members read the catalog, managers write it).
 *
 * `member` is the lowest household role, so asking for it refuses only a
 * person in no household at all. Nobody can be in that state before H5, so a
 * `member` check cannot be told apart from no check in a test today.
 */
export async function requireCatalogRole(ctx: Context, role: HouseholdRole): Promise<string> {
  const householdId = await requireHousehold(ctx)
  await requireHouseholdRole(ctx, householdId, role)
  return householdId
}

/**
 * The six catalog models. Their rows belong to a household (H3a, task 3.7),
 * not to an account and not to a location.
 */
export type CatalogModel = 'item' | 'tag' | 'tagType' | 'vendor' | 'recipe' | 'shelf'

/**
 * The nine models that have `id` as their only unique key and belong to no
 * location. `ItemStock` is NOT here on purpose: it carries no `userId` at all
 * and is scoped through its location by `requireLocationRole`. `Location` is
 * not here either, for the same reason — it IS the location.
 *
 * Six of them are catalog models, scoped by household since H3a task 3.7.
 * `InventoryLog`, `Cart` and `CartItem` are still scoped by `userId`, until
 * H3b and H4.
 *
 * This is a hand-maintained list, and a wrong literal at a call site compiles.
 * Every call site therefore needs its own test, and deleting a guard must turn
 * a named test red.
 */
export type OwnedModel = CatalogModel | 'inventoryLog' | 'cart' | 'cartItem'

/** The reads the guards need on a catalog model: by id, by id and household. */
interface CatalogDelegate {
  findUnique(args: {
    where: { id: string }
    select: { id: true }
  }): Promise<{ id: string } | null>
  findFirst(args: {
    where: { id: string; householdId: string }
    select: { id: true }
  }): Promise<{ id: string } | null>
  findMany(args: {
    where: { id: { in: string[] }; householdId?: string }
    select: { id: true }
  }): Promise<{ id: string }[]>
}

/** The two reads the guard needs on a model still scoped by `userId`. */
interface UserScopedDelegate {
  findUnique(args: {
    where: { id: string }
    select: { id: true }
  }): Promise<{ id: string } | null>
  findFirst(args: {
    where: { id: string; userId: string }
    select: { id: true }
  }): Promise<{ id: string } | null>
}

type UserScopedModel = Exclude<OwnedModel, CatalogModel>

function isCatalogModel(model: OwnedModel): model is CatalogModel {
  return model !== 'inventoryLog' && model !== 'cart' && model !== 'cartItem'
}

// Both tables are built PER CALL, not captured at module load, so a test that
// swaps a method on the mocked `prisma` after import still sees its own swap.
//
// `satisfies` type-checks each entry, so no `as unknown as Record<…>` cast is
// needed. Prisma's `findUnique` is generic, and assignability to this
// non-generic target instantiates its type parameter from the target.
//
// What `satisfies` catches here, measured on Prisma 6.19.3 on 2026-10-28:
// `prisma.itemTag` (a composite-key model with no `id`) fails TS2322, and so
// does any value that is not a delegate at all. What it does NOT catch: a
// model with an `id` but without the scope column, such as
// `prisma.itemStock`, is accepted — a `where` with an extra key is assignable
// to its `WhereInput` because excess-property checking does not apply to a
// type-level assignability check. Nor can it catch a swap between two models
// in the same table. So a wrong model literal at a call site still compiles,
// and per-call-site tests are what catch it.
function catalogDelegate(model: CatalogModel): CatalogDelegate {
  const delegates = {
    item: prisma.item,
    tag: prisma.tag,
    tagType: prisma.tagType,
    vendor: prisma.vendor,
    recipe: prisma.recipe,
    shelf: prisma.shelf,
  } satisfies Record<CatalogModel, CatalogDelegate>
  return delegates[model]
}

function userScopedDelegate(model: UserScopedModel): UserScopedDelegate {
  const delegates = {
    inventoryLog: prisma.inventoryLog,
    cart: prisma.cart,
    cartItem: prisma.cartItem,
  } satisfies Record<UserScopedModel, UserScopedDelegate>
  return delegates[model]
}

/**
 * The single authorization seam for the nine models in `OwnedModel`, which
 * belong to no location and so are outside `requireLocationRole`'s reach.
 *
 * Three cases for one row id:
 *
 * | The id is | Result |
 * |---|---|
 * | held by a row the caller may write | returns `'own'` |
 * | held by somebody else's row | **throws** `FORBIDDEN` |
 * | held by no row | returns `'unclaimed'` |
 *
 * "A row the caller may write" means, since H3a task 3.7:
 *
 * | Model | The row is "own" when |
 * |---|---|
 * | the six catalog models | it is in the caller's household (`requireHousehold`) |
 * | `InventoryLog`, `Cart`, `CartItem` | its `userId` is the caller's (until H3b and H4) |
 *
 * So a tag another member of the caller's household made is `'own'` here, and
 * a tag of another household throws.
 *
 * It does NOT check the caller's household ROLE. The catalog resolvers check
 * `manager` first, with `requireCatalogRole`. The import mutations do not
 * check a role yet: import role gating is H4.
 *
 * The "somebody else's" case throws rather than returning, so a call site
 * cannot ignore it.
 *
 * Call sites never inspect `userId` or `householdId` themselves — root
 * CLAUDE.md forbids `row.userId === ctx.userId` as an authorization check.
 * They say "this id must be one I may write", and this body is what decides.
 * When the scope changes again (H4 moves it to the import's TARGET
 * household), the `where` below changes and no call site moves. That is the
 * same contract `requireLocationRole` above already carries.
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
  // taken" is not an authorization question and has no scope.
  const delegate = isCatalogModel(model) ? catalogDelegate(model) : userScopedDelegate(model)
  const taken = await delegate.findUnique({ where: { id }, select: { id: true } })
  if (!taken) return 'unclaimed'

  // The AUTHORIZATION decision, SCOPED IN SQL. Never a comparison of a fetched
  // row's `userId` or `householdId` against the caller's.
  const own = isCatalogModel(model)
    ? await catalogDelegate(model).findFirst({
        where: { id, householdId: await requireHousehold(ctx) },
        select: { id: true },
      })
    : await userScopedDelegate(model).findFirst({
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
  if (!own) throw forbidden()

  return 'own'
}

const CATALOG_LABEL: Record<CatalogModel, string> = {
  item: 'item',
  tag: 'tag',
  tagType: 'tag type',
  vendor: 'vendor',
  recipe: 'recipe',
  shelf: 'shelf',
}

/**
 * Refuse unless every id in `ids` names a `model` row of `householdId`.
 *
 * For the ids a write ATTACHES to a row of the caller's household: an item's
 * tags and vendors, a recipe's items, a shelf's items and filter ids, a tag's
 * type and parent (households H3a task 3.7, issue #273). Before this, those
 * ids were taken on trust, so a client could attach another household's tag
 * to its own item and raise that household's `itemCountByTag`.
 *
 * | An id is | Result |
 * |---|---|
 * | a row of `householdId` | passes |
 * | a row of another household | throws `FORBIDDEN`, the same refusal as every role check |
 * | held by no row | throws `BAD_USER_INPUT`, unless `missing: 'allow'` |
 *
 * A stranger's id is checked first, so a list with both kinds gets
 * `FORBIDDEN`.
 *
 * `BAD_USER_INPUT` for a missing id keeps what `createTag` / `updateTag`
 * have done since `fix/catalog-write-scope` (2026-11-04). For the other
 * sites it replaces a foreign-key error from Postgres, which reached the
 * client as `INTERNAL_SERVER_ERROR`.
 *
 * `missing: 'allow'` is for the shelf arrays (`itemIds`, `filterConfig`).
 * They are plain arrays, not foreign keys, and nothing removes an id from
 * them when its row is deleted. So a shelf the client saves may still name
 * a deleted item, and refusing that would refuse the user's own edit.
 *
 * A repeated id is not refused here: what a repeat does to the write is the
 * write's business (for `ItemTag` it is a `P2002`, as before). The ids are
 * not de-duplicated first. `id IN (...)` matches each row once however often
 * its id is listed, and the check below compares id SETS, not counts, so a
 * repeat changes neither query's answer. (Task 3.7 had a `new Set(ids)` here
 * and a test that "proved" it; the test passed without it, so both went.)
 *
 * Costs one query when every id is the household's, and two otherwise. No
 * call site compares a `householdId`.
 */
export async function requireCatalogIds(
  ctx: Context,
  householdId: string,
  model: CatalogModel,
  ids: readonly string[],
  options: { missing?: 'refuse' | 'allow' } = {},
): Promise<void> {
  requireAuth(ctx)
  if (ids.length === 0) return

  const delegate = catalogDelegate(model)
  const own = await delegate.findMany({
    where: { id: { in: [...ids] }, householdId },
    select: { id: true },
  })
  const ownIds = new Set(own.map((row) => row.id))
  const rest = ids.filter((id) => !ownIds.has(id))
  if (rest.length === 0) return

  // UNSCOPED on purpose: "is this id held by any row" tells a stranger's id
  // from one no row holds. Only `id` is selected.
  const taken = await delegate.findMany({ where: { id: { in: rest } }, select: { id: true } })
  if (taken.length > 0) throw forbidden()
  if (options.missing === 'allow') return
  throw new GraphQLError(`No ${CATALOG_LABEL[model]} matches one of the ids given`, {
    extensions: { code: 'BAD_USER_INPUT' },
  })
}
