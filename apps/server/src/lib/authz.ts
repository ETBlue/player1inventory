import { GraphQLError } from 'graphql'
import type { HouseholdRole, LocationRole } from '@prisma/client'
import { parseCartId } from '@p1i/types'
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
 * still counts (decision H18). With no `role`, any role counts: this is the
 * list a person sees, and the `locations` query reads it (task 3.6). With a
 * `role`, only that role or a stronger one counts. Imports ask for
 * `participant`, the lowest role that may write (H3b task B.7).
 *
 * The household role does NOT add locations here. An owner or manager sees a
 * location only through a `LocationMember` row, until H5.
 *
 * With `options.householdId`, only the locations of that household count
 * (households H4 task E.1, decision T7). A person can be a member of two
 * households, so "every location I have a role on" can hold another
 * household's locations. An import into one household asks for that
 * household only.
 */
export async function locationIdsWithRole(
  ctx: Context,
  role: LocationRole = 'viewer',
  options: { householdId?: string } = {},
): Promise<string[]> {
  const userId = requireAuth(ctx)
  const roles = (Object.keys(LOCATION_RANK) as LocationRole[]).filter(
    (r) => LOCATION_RANK[r] >= LOCATION_RANK[role],
  )
  const counted = countedLocationRole(userId)
  const memberships = await prisma.locationMember.findMany({
    where: {
      ...counted,
      // The household filter goes INSIDE the same `location` object as the
      // decision H18 filter. A second `location` key would replace the first
      // one and drop H18.
      ...(options.householdId === undefined
        ? {}
        : { location: { ...counted.location, householdId: options.householdId } }),
      // Left out for `viewer`, so the read every page makes is unchanged.
      ...(role === 'viewer' ? {} : { role: { in: roles } }),
    },
    select: { locationId: true },
  })
  return memberships.map((m) => m.locationId)
}

/**
 * Refuse unless `locationId` is a location of `householdId` (households H4
 * task E.1, decision T7).
 *
 * One SCOPED read: `location.findFirst({ where: { id, householdId } })`. The
 * comparison happens in SQL, here, so no call site writes
 * `row.householdId === …` (root CLAUDE.md, *Authorization*).
 *
 * It checks no role. Call it next to `requireLocationRole`, which is the role
 * check. A person in two households holds roles in both, so
 * `requireLocationRole` alone cannot say WHICH household a location is in.
 * A missing location gets the same `FORBIDDEN` as another household's.
 */
export async function requireLocationInHousehold(
  ctx: Context,
  locationId: string,
  householdId: string,
): Promise<void> {
  requireAuth(ctx)
  const location = await prisma.location.findFirst({
    where: { id: locationId, householdId },
    select: { id: true },
  })
  if (!location) throw forbidden()
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
 * The nine models an import writes by the id in the file. `requireLocationRole`
 * alone cannot decide these, because an import must tell a free id from a
 * taken one, and `requireLocationRole` refuses both the same way. (Until H4
 * this said "the
 * nine models that belong to no location". That was wrong: `Cart`,
 * `CartItem`, through its cart, and `InventoryLog` all have a location.)
 *
 * `ItemStock` is NOT here: an import checks it by its location and item
 * (`requireOwnItemStockRefs`). `Location` is not here either: it IS the
 * location (`requireOwnLocationIdsOrUnclaimed`).
 *
 * Six of them are catalog models, scoped by household since H3a task 3.7.
 * `Cart`, `CartItem` and `InventoryLog` are scoped by location: the caller
 * must be `participant` or higher at a location of the target household
 * (H3b task B.7 for carts; H4 task E.1 for logs and for the household).
 * `CartItem.userId` and `InventoryLog.userId` mean "added by" and "written
 * by". They are never a scope.
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

/**
 * The single authorization seam for the nine models in `OwnedModel`: the rows
 * an import writes by the id in the file. `requireLocationRole` alone cannot
 * decide these, because an import must tell a free id from a taken one.
 *
 * Three cases for one row id:
 *
 * | The id is | Result |
 * |---|---|
 * | held by a row the caller may write in the target household | returns `'own'` |
 * | held by any other row | **throws** `FORBIDDEN` |
 * | held by no row | returns `'unclaimed'` |
 *
 * `targetHouseholdId` is the household the import writes INTO (households H4
 * task E.1, decision T4). It is an explicit argument, not
 * `requireHousehold(ctx)`, because a person can be a member of two
 * households, and then "the caller's household" has no fixed answer. Every
 * call site passes the id `requireCatalogRole` (or, for the import helpers
 * until H4 task E.3, `requireHousehold`) returned. H7's household switch will
 * fill it in.
 *
 * "A row the caller may write" means, since H4 task E.1 (decision T5), with
 * `writable` = the locations of the target household where the caller is
 * `participant` or higher:
 *
 * | Model | The row is "own" when |
 * |---|---|
 * | the six catalog models | it is in the target household |
 * | `InventoryLog` | its location is in `writable` |
 * | `CartItem` | its cart's location is in `writable` |
 * | `Cart` | see below |
 *
 * `InventoryLog.userId` and `CartItem.userId` mean "written by" and "added
 * by". They are never a scope, so a row another member wrote is `'own'`.
 *
 * **`Cart` is checked in a fixed order (decision T6, issue #361).** A cart id
 * is `${locationId}:${vendor}` (`cartIdFor`, `@p1i/types`):
 *
 * 1. An id with no colon is refused with `BAD_USER_INPUT`.
 * 2. The prefix must be in `writable`, else `FORBIDDEN`. This runs BEFORE the
 *    cart table is read at all. So a caller with no write role on that
 *    location never learns whether a cart id there is free or taken.
 * 3. Only then the unscoped "is this id taken" read.
 * 4. "Own" means the stored cart is AT the location its id names
 *    (`{ id, locationId: prefix }`). A stored cart whose `locationId` is not
 *    its prefix is refused. The old import fallback could make such a row.
 *
 * A viewer may read a cart or a log, but an import WRITES the row it names,
 * so it needs the write role.
 *
 * It does NOT check the caller's household ROLE. The catalog resolvers check
 * `manager` first, with `requireCatalogRole`. Import role gating is H4 task
 * E.3.
 *
 * The "any other row" case throws rather than returning, so a call site
 * cannot ignore it.
 *
 * Call sites never inspect `userId`, `householdId` or `locationId`
 * themselves (root CLAUDE.md forbids `row.userId === ctx.userId` as an
 * authorization check). They say "this id must be one I may write", and this
 * body is what decides. When the scope changes again, the `where` below
 * changes and no call site moves.
 *
 * See docs/features/settings/2026-10-28-design-import-ownership-guard.md and
 * docs/global/permissions/2026-11-16-households-plan-h4.md.
 */
export async function requireOwnRowOrUnclaimed(
  ctx: Context,
  model: OwnedModel,
  id: string,
  targetHouseholdId: string,
): Promise<'own' | 'unclaimed'> {
  requireAuth(ctx)

  if (model === 'cart') return cartVerdict(ctx, id, targetHouseholdId)

  // UNSCOPED on purpose, and only `id` is selected. "Is this primary key
  // taken" is not an authorization question and has no scope.
  const delegate: Pick<CatalogDelegate, 'findUnique'> =
    model === 'cartItem'
      ? prisma.cartItem
      : model === 'inventoryLog'
        ? prisma.inventoryLog
        : catalogDelegate(model)
  const taken = await delegate.findUnique({ where: { id }, select: { id: true } })
  if (!taken) return 'unclaimed'

  // The AUTHORIZATION decision, SCOPED IN SQL. Never a comparison of a fetched
  // row's `householdId` or `locationId` against the caller's.
  let own: { id: string } | null
  if (isCatalogModel(model)) {
    own = await catalogDelegate(model).findFirst({
      where: { id, householdId: targetHouseholdId },
      select: { id: true },
    })
  } else {
    const writable = await writableLocationIds(ctx, targetHouseholdId)
    own =
      model === 'inventoryLog'
        ? await prisma.inventoryLog.findFirst({
            where: { id, locationId: { in: writable } },
            select: { id: true },
          })
        : await prisma.cartItem.findFirst({
            where: { id, cart: { locationId: { in: writable } } },
            select: { id: true },
          })
  }

  // Same wording and code as `requireLocationRole`'s refusal above, so a
  // refusal reveals neither which model nor who owns the row.
  //
  // Note what this does NOT hide, because it cannot: a free id returns
  // `'unclaimed'` and another household's id throws, so the caller can tell
  // those two apart. An import has to be able to create new rows, so that
  // difference cannot be avoided.
  //
  // What protects the ids: a row id made by the server (`cuid()`) or by local
  // mode (`crypto.randomUUID()`) cannot be guessed. That is NOT true for two
  // kinds of id. `Cart.id` is derived from a location id and a vendor id, so
  // it can be worked out. And an id a hand-edited file chooses can be
  // anything. For carts the protection is the location check that runs
  // BEFORE the cart table is read (`cartVerdict` below). `requireLocationRole`
  // above is stricter (it refuses a missing id too), and its stated reason
  // does not carry over here unchanged.
  if (!own) throw forbidden()

  return 'own'
}

/**
 * The locations of `householdId` where the caller is `participant` or
 * higher: the lowest role that may write.
 */
function writableLocationIds(ctx: Context, householdId: string): Promise<string[]> {
  return locationIdsWithRole(ctx, 'participant', { householdId })
}

/**
 * The `Cart` branch of `requireOwnRowOrUnclaimed`, in the order of decision
 * T6: id shape, then the location check, and only then the cart table.
 * Moving the `findUnique` above the location check would let a caller with
 * no role find out which cart ids are taken at another location.
 */
async function cartVerdict(
  ctx: Context,
  id: string,
  targetHouseholdId: string,
): Promise<'own' | 'unclaimed'> {
  if (!id.includes(':')) {
    throw new GraphQLError('A cart id must start with its location id and a colon.', {
      extensions: { code: 'BAD_USER_INPUT' },
    })
  }
  const { locationId: prefix } = parseCartId(id)

  const writable = await writableLocationIds(ctx, targetHouseholdId)
  if (!writable.includes(prefix)) throw forbidden()

  // UNSCOPED on purpose, as above. It runs only for a location the caller
  // may write to.
  const taken = await prisma.cart.findUnique({ where: { id }, select: { id: true } })
  if (!taken) return 'unclaimed'

  const own = await prisma.cart.findFirst({
    where: { id, locationId: prefix },
    select: { id: true },
  })
  if (!own) throw forbidden()
  return 'own'
}

/**
 * The household a location belongs to. Refuses with the usual `FORBIDDEN`
 * when no location has that id.
 *
 * It does NOT check a role. Call it AFTER `requireLocationRole`, which is the
 * check. A location that passed `requireLocationRole` always has a household:
 * a role counts only through `location.household.members` (decision H18).
 *
 * Read from the LOCATION row on purpose, not from `requireHousehold(ctx)`.
 * `requireHousehold` answers "the caller's household", and nothing in the
 * schema stops a person being a member of two (H5 makes that real). The
 * location's own household is the one its stock, carts and vendors belong
 * to.
 */
export async function householdOfLocation(locationId: string): Promise<string> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { householdId: true },
  })
  if (!location) throw forbidden()
  return location.householdId
}

/**
 * Refuse unless every id in `itemIds` is an item of the household that
 * `locationId` belongs to (households H3a, task 3.8).
 *
 * For the writes that take an item id together with a location id:
 * `upsertItemStock`, `addItemToLocation`, `applyUnitSwitch`,
 * `addInventoryLog`, `addToCart` and `consumeRecipes`. Before task 3.8 none of
 * them checked the item, so a client could write a stock row, a log or a cart
 * entry for another household's item into its own location.
 *
 * The answers are `requireCatalogIds`': another household's item is
 * `FORBIDDEN`, an id no row holds is `BAD_USER_INPUT`.
 *
 * Call it AFTER `requireLocationRole(ctx, locationId, …)`. It checks no role.
 *
 * Why a location of another household cannot be used to slip an item in:
 *
 * 1. `requireLocationRole` refuses a location of a household the caller is
 *    not a member of. A location role counts only while the caller is also a
 *    `HouseholdMember` of that location's household (decision H18).
 * 2. The household checked here is the LOCATION's (`householdOfLocation`),
 *    not the caller's. So even a caller in two households cannot put one
 *    household's item into the other household's location: the item and the
 *    location must be in the same household.
 *
 * Costs one location read plus `requireCatalogIds`' one query (two when an id
 * is refused). No call site compares a `householdId`.
 */
export async function requireLocationItems(
  ctx: Context,
  locationId: string,
  itemIds: readonly string[],
): Promise<void> {
  requireAuth(ctx)
  if (itemIds.length === 0) return
  const householdId = await householdOfLocation(locationId)
  await requireCatalogIds(ctx, householdId, 'item', itemIds)
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
