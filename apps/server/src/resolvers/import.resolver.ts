import { GraphQLError } from 'graphql'
import {
  type LocationRole,
  locationIdsWithRole,
  type OwnedModel,
  requireCatalogRole,
  requireHousehold,
  requireHouseholdRole,
  requireLocationInHousehold,
  requireLocationRole,
  requireOwnRowOrUnclaimed,
} from '../lib/authz.js'
import { parseCartId } from '@p1i/types'
import {
  createFirstLocation,
  deleteHouseholdData,
  firstLocationName,
  lockHousehold,
} from '../lib/household.js'
import { recordActivity } from '../lib/activity.js'
import { prisma } from '../lib/prisma.js'
import { type ChangedLocation, publishChange, publishHouseholdChange } from '../lib/publishChange.js'
import { type Context, requireAuth } from '../context.js'
import { toGraphQL as locationToGraphQL } from './location.resolver.js'
import { toGraphQL as itemStockToGraphQL } from './itemStock.resolver.js'
import type { Cart, CartItem, InventoryLog, Item, ItemStock, Location, Recipe, Resolvers, Shelf, Tag, TagType, Vendor } from '../generated/graphql.js'
import type { ExpirationMode, Prisma, Location as PrismaLocation, TagColor, TargetUnit } from '@prisma/client'

// Map a Prisma item (with junction rows) to the GraphQL Item shape.
//
// Configuration only. Cloud locations PR 5 dropped the five per-location state
// fields from `type Item`, so they are neither read here nor sent — stock rows
// reach the client through `ItemStock`, each naming its location.
function itemToGraphQL(item: {
  id: string
  name: string
  // Issue #335. Declared here so the type says what the spread below carries;
  // `type Item` exposes both, so a reader can see the Info tab's two fields
  // make the round trip.
  wikidataUrl?: string | null
  note?: string | null
  targetUnit: TargetUnit
  consumeAmount: number
  packageUnit?: string | null
  measurementUnit?: string | null
  amountPerPackage?: number | null
  estimatedDueDays?: number | null
  expirationThreshold?: number | null
  expirationMode: ExpirationMode
  createdAt: Date
  updatedAt: Date
  tags: { tagId: string }[]
  vendors: { vendorId: string }[]
}): Item {
  const expirationMode =
    item.expirationMode === 'days_from_purchase'
      ? 'days from purchase'
      : (item.expirationMode as string)
  return {
    ...item,
    expirationMode,
    tagIds: item.tags.map((t) => t.tagId),
    vendorIds: item.vendors.map((v) => v.vendorId),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  } as unknown as Item
}

/**
 * Check the location of every imported inventory log, BEFORE any row is
 * written. Returns a function that gives a row's `locationId` back as a
 * plain `string`: after this check, every row names a location the log may be
 * written to.
 *
 * Every row must name a location (households H4 task E.3, decision T10). A row
 * with no `locationId` refuses the whole batch with `BAD_USER_INPUT`, reason
 * `IMPORT_NEEDS_LOCATION`. Until E.3 such a row went to the caller's first
 * location (the import fallback of decision H12, now deleted). From H4 task
 * E.4 the web always sends a location: the "Import into which location?"
 * dialog picks one for a file that has none. Until E.4 is built, a cloud
 * import of a backup made before locations existed, with logs, is refused
 * here.
 *
 * Each named location gets two checks, both in lib/authz.ts:
 *
 *  1. `requireLocationRole(…, 'participant')`: the caller may write there.
 *     `participant` is the LOWEST location role that may write (organizer and
 *     participant write, viewer reads; households design, *Location roles*).
 *  2. `requireLocationInHousehold(…, householdId)`: the location is in the
 *     TARGET household. A person in two households holds roles in both, so
 *     check 1 alone would let an import into household A write a log at a
 *     location of household B (issue #381, gap 1).
 *
 * The role check runs first, so a caller with no role learns nothing about
 * which household a location is in. Both refuse with the same `FORBIDDEN`.
 *
 * Three things about the shape are deliberate:
 *
 *  - Every row is looked at for a missing location BEFORE any read, so a
 *    batch with one such row is refused without touching the database.
 *  - Each DISTINCT id is checked ONCE, not once per row. 500 logs across 3
 *    locations cost 3 pairs of checks.
 *  - The whole check runs before the write loop. These bulk resolvers are not
 *    transactional, so throwing from inside the loop would leave the rows
 *    already written behind. Checking first means a payload naming a forbidden
 *    location writes nothing at all.
 *
 * Once the location is in the target household, the log's item is checked
 * against the same household by the mutation, so "the location's household"
 * and "the item's household" cannot differ.
 */
async function resolveLogLocations(
  ctx: Context,
  logs: readonly { locationId?: string | null }[],
  householdId: string,
): Promise<(inputLocationId: string | null | undefined) => string> {
  if (logs.some((log) => !log.locationId)) {
    throw new GraphQLError('Every imported log must name a location.', {
      extensions: { code: 'BAD_USER_INPUT', reason: 'IMPORT_NEEDS_LOCATION' },
    })
  }
  const verified = new Set<string>()
  for (const { locationId } of logs) {
    if (!locationId || verified.has(locationId)) continue
    verified.add(locationId)
    await requireLocationRole(ctx, locationId, 'participant')
    await requireLocationInHousehold(ctx, locationId, householdId)
  }
  return (inputLocationId) => {
    // Unreachable: the check above refused every row with no location, and
    // this is only called with rows from that same list. It is here to keep
    // the return type `string`, because an empty string would write a broken
    // foreign key instead of failing.
    if (!inputLocationId) throw new Error('resolveLogLocations: a row has no location')
    return inputLocationId
  }
}

/**
 * Check the location of every imported cart, BEFORE any row is written, and
 * return a function giving the location a cart is written to.
 *
 * Since PR 3b `Cart.id` is `${locationId}:${vendorId | 'no-vendor'}`, so an
 * imported cart's location rides inside its own primary key and needs no
 * input field. `parseCartId` (`@p1i/types`) splits on the FIRST colon, so a
 * vendor id that itself contains ':' survives.
 *
 * ── THE RULE (households H4 task E.3, decisions T10 and T11) ──
 *
 *  1. Every id must contain a colon. A bare id (a pre-3b backup, keyed by
 *     vendor id alone) refuses the whole batch with `BAD_USER_INPUT`. This
 *     runs before any read. The web gives a legacy file's carts a location
 *     prefix before it sends them (`upgradeLegacyPayload` in
 *     `apps/web/src/lib/importData.ts`).
 *  2. Each DISTINCT prefix gets `requireLocationRole(…, 'participant')`, then
 *     `requireLocationInHousehold(…, householdId)`. A prefix naming a location
 *     that does not exist, a location where the caller is below
 *     `participant`, or a location of another household is refused with
 *     `FORBIDDEN`, and nothing is written. That includes `":vendor"`, whose
 *     prefix is the empty string.
 *  3. The cart is written to its prefix location, always.
 *
 * Until E.3 there was a fallback. A bare id, or a prefix no `Location` row
 * held, sent the cart to the caller's first writable location
 * (the import fallback of decision H12) and KEPT the id. That made carts
 * whose id names one location while they sit at another. It also needed an
 * UNSCOPED `location.findUnique` before the role check, which told any caller
 * whether a location id exists. Both are gone: no read here runs before the
 * role check, and `requireLocationRole` refuses "missing" and "not yours"
 * with the same error. The fallback was needed for a cloud backup whose
 * source locations `clearAllData` had just deleted. Since cloud locations
 * PR 4b the web uploads the file's locations before its carts, so a prefix
 * that names nothing now means a hand-edited file.
 *
 * Step 2 is a SECOND COPY of a check. `requireOwnRowOrUnclaimed('cart')`
 * (lib/authz.ts, `cartVerdict`) runs right after and refuses the same ids:
 * it checks every prefix, a free id's too, against the writable locations
 * of the same household, before it reads the cart table. Measured in task
 * E.3: with the `requireLocationInHousehold` call below removed, every test
 * stays green. It is kept so the cart helper does what the log and stock
 * helpers do, and so a refused location is refused here, before any cart id
 * is looked at. What only this helper does is step 1, the bare-id refusal
 * before any read, and the location each cart is written to.
 */
async function resolveCartLocations(
  ctx: Context,
  carts: readonly { id: string }[],
  householdId: string,
): Promise<(cartId: string) => string> {
  if (carts.some((cart) => !cart.id.includes(':'))) {
    throw new GraphQLError('A cart id must start with its location id and a colon.', {
      extensions: { code: 'BAD_USER_INPUT' },
    })
  }
  const verified = new Set<string>()
  for (const cart of carts) {
    const { locationId } = parseCartId(cart.id)
    if (verified.has(locationId)) continue
    verified.add(locationId)
    await requireLocationRole(ctx, locationId, 'participant')
    await requireLocationInHousehold(ctx, locationId, householdId)
  }
  return (cartId) => parseCartId(cartId).locationId
}

/**
 * Authorize every location id a payload names, BEFORE any row is written.
 * Returns the ids of the locations that already exist (and on which the
 * caller holds `role` or higher, in the target household).
 *
 * `LocationInput.id` is attacker-controlled and `Location.id` is a GLOBAL
 * primary key, so an id in the payload can name a row of another household.
 *
 * Two id shapes are refused first, for the whole batch, with
 * `BAD_USER_INPUT` and before any read (households H4 task E.3, decision
 * T12):
 *
 *  - `'local'`: every local install's default location has that id. The
 *    first account to upload it would own it, and every other account's
 *    upload of its own "My Home" would then be refused. The web maps it onto
 *    a location the user picks before it sends the file.
 *  - an id with `:`: a cart id is `${locationId}:${vendorId}`, and
 *    `parseCartId` splits on the FIRST colon. A location id with a colon
 *    would make its cart ids name another location.
 *
 * Then each distinct id falls into one of three cases:
 *
 *  - it exists, the caller holds `role` or higher on it, and it is in the
 *    target household → in the returned set, so `bulkCreate` skips it and
 *    `bulkUpsert` updates it
 *  - it exists and is not that → `requireLocationRole` or
 *    `requireLocationInHousehold` throws FORBIDDEN, and nothing is written at
 *    all. The household check is new in households H4 task E.3: a person who
 *    organizes a location of household B could otherwise rename it through
 *    an import targeted at household A
 *  - it does not exist → not in the set, free to create in the target
 *    household
 *
 * "Holds a role" is decided by `requireLocationRole` (lib/authz.ts), which
 * reads the caller's `LocationMember` row through `countedLocationRole`, the
 * decision H18 filter. So a location of the caller's OWN household on which
 * the caller has no role, or a stale role row in a household the caller has
 * left, is refused here. It is never "free to create". (It has read
 * membership this way since households H3a task 3.5. Task 3.9 added the
 * `role` argument and the returned set.)
 *
 * `role` depends on what the mutation does to an existing row:
 *
 *  - `bulkCreateLocations` asks `participant`, the LOWEST location role that
 *    may write. It writes nothing to an existing row (it only skips it), so a
 *    participant of a shared location is not denied.
 *  - `bulkUpsertLocations` asks `organizer`, because it RENAMES an existing
 *    row, and `updateLocation` (location.resolver.ts) asks `organizer` for a
 *    rename. With `participant` here, a participant could rename a shared
 *    location through an import, but not on the settings page.
 *
 * Why the unscoped `findUnique` comes first. The question it asks is "is this
 * primary key taken", which is not an authorization question and has no
 * scope; only `id` is selected. The AUTHORIZATION decision is made entirely by
 * `requireLocationRole` — never by comparing a row's `userId` or
 * `householdId` to the caller's, which root CLAUDE.md forbids.
 *
 * WITHOUT this pre-check, copying the house style verbatim would have shipped
 * two cross-user holes, the same class task 4 found in the unscoped cart
 * lookups:
 *
 *  - `bulkCreate` doing `findUnique({ where: { id } })` then `continue` would
 *    SILENTLY DROP the caller's own location because a stranger holds that id,
 *    and `bulkCreateShelves`'s closing `findMany({ where: { id: { in: ids } }})`
 *    would then hand the stranger's row back to the caller
 *  - `bulkUpsert` doing `upsert({ where: { id }, update: data })` would
 *    OVERWRITE the stranger's row — and because `data` carries `userId`, it
 *    would reassign the row to the caller, taking its stock, carts and logs
 *    with it
 *
 * UPDATED 2026-10-28 (issue #327): the 18 older bulk mutations DID ship both of
 * those holes, and they no longer do. They now route every payload id through
 * `requireOwnRowIdsOrUnclaimed` below, `userId` is out of all nine `update`
 * payloads, and all 12 closing reads are scoped — including the
 * `bulkCreateShelves` `findMany` named above, which is now
 * `findMany({ where: { id: { in: ids }, householdId } })` since households
 * H3a task 3.7 (it was `userId` before). So the list above reads
 * as history: it is why this pre-check exists, not a description of the file's
 * current state.
 *
 * Three things about the shape, all for the same reasons as the log helper:
 * each DISTINCT id is checked once; the whole check runs before the write loop
 * because these bulk resolvers are not transactional; and it reads nothing it
 * does not need.
 *
 * Accepted cost: a FORBIDDEN tells the caller that an id they named exists and
 * is not theirs. Letting the write proceed would leak the same fact as an
 * unhandled P2002, after a partial write — so this is the smaller of the two.
 */
async function requireOwnLocationIdsOrUnclaimed(
  ctx: Context,
  locations: readonly { id: string }[],
  role: LocationRole,
  householdId: string,
): Promise<Set<string>> {
  for (const { id } of locations) {
    if (id === 'local' || id.includes(':')) {
      throw new GraphQLError(
        "A location id cannot be 'local' and cannot contain a colon.",
        { extensions: { code: 'BAD_USER_INPUT' } },
      )
    }
  }
  const existing = new Set<string>()
  const checked = new Set<string>()
  for (const { id } of locations) {
    if (checked.has(id)) continue
    checked.add(id)
    const taken = await prisma.location.findUnique({
      where: { id },
      select: { id: true },
    })
    if (taken) {
      // The role FIRST, then the household: the household check reads any
      // location, so run first it would tell a caller with no role which
      // household a location is in. Both refuse with the same FORBIDDEN.
      await requireLocationRole(ctx, id, role)
      await requireLocationInHousehold(ctx, id, householdId)
      existing.add(id)
    }
  }
  return existing
}

/**
 * Create one imported location in `householdId`, with the caller as its
 * `organizer` (households H3a task 3.9).
 *
 * The same two writes as `createLocation` (location.resolver.ts), in ONE
 * transaction, so an imported location never exists without its organizer
 * row. Without that row nobody could see it, stock it, or write a log or a
 * cart there: `locations` and every location check read `LocationMember`
 * (lib/authz.ts). Before task 3.9 these mutations wrote no role row and no
 * `householdId`. So an imported location was missing from `locations`, the
 * switcher and a cloud export, and the item stocks imported right after it
 * were refused.
 *
 * `order` is the payload's own value. It is NOT `max + 1` within the
 * household, as `createLocation` counts it: a backup carries the user's own
 * order, and an import restores it. Two locations of one household can then
 * share an `order`. `locations` breaks that tie by id, so the list order is
 * still stable.
 *
 * The location carries `householdId` only. It has had no `userId` and no
 * `isDefault` since task 3.14 (the drop_user_scope migration); the caller's
 * `organizer` row is what ties them to it.
 */
async function createImportedLocation(
  ctx: Context,
  userId: string,
  householdId: string,
  input: { id: string; name: string; order: number; createdAt: string; updatedAt: string },
): Promise<PrismaLocation> {
  const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.location.create({
      data: {
        id: input.id,
        name: input.name,
        order: input.order,
        createdAt: new Date(input.createdAt),
        updatedAt: new Date(input.updatedAt),
        householdId,
      },
    })
    await tx.locationMember.create({
      data: { locationId: created.id, userId, role: 'organizer' },
    })
    return created
  })
  return created
}

/**
 * Authorize every row id an account-scoped payload names, BEFORE any row is
 * written. Returns the ids the caller ALREADY OWNS.
 *
 * This is the account-scoped twin of `requireOwnLocationIdsOrUnclaimed` above.
 * It serves the nine models in `OwnedModel` (lib/authz.ts): the rows an
 * import writes by the id in the file, so a check must tell a free id from a
 * taken one, which `requireLocationRole` alone cannot do. Six of them (the
 * catalog) belong to a household. `InventoryLog`, `Cart` and `CartItem` are
 * checked by their location in the target household (households H4 task
 * E.1); a cart id must also start with its location id.
 *
 * `targetHouseholdId` is the household the import writes into: the id
 * `requireCatalogRole(ctx, 'manager')` returned at the top of the mutation
 * (households H4 task E.3).
 *
 * Every `id` in an import payload is attacker-controlled, and each of these
 * primary keys is GLOBAL. So an id in the payload can name a row of another
 * household. `requireOwnRowOrUnclaimed` sorts each distinct id into one of
 * three cases:
 *
 *  - it exists and the caller may write it in the target household → in the
 *    returned set, so `bulkCreate` skips it and `bulkUpsert` replaces it
 *  - it exists and is not that → it THROWS `FORBIDDEN`, and nothing is
 *    written at all
 *  - it exists nowhere → not in the set, free to create
 *
 * The AUTHORIZATION decision lives entirely in `requireOwnRowOrUnclaimed`.
 * Nothing here compares a row's `userId` or `householdId` to the caller's,
 * which root CLAUDE.md forbids.
 *
 * Three things about the shape, for the same reasons as the location helper
 * above:
 *
 *  - Each DISTINCT id is checked once, not once per row.
 *  - The whole check runs BEFORE the write loop. None of these resolvers uses
 *    `prisma.$transaction`, so a throw from inside the loop would leave the
 *    rows written before it ON DISK. Running the check first is what makes
 *    "one forbidden row writes nothing at all" true.
 *  - It reads nothing it does not need: one query for a free id, two for a
 *    taken one.
 *
 * The returned set is also what replaces the old existence checks. After the
 * guard an id is one of exactly two things — the caller's own row, or free —
 * so a `findUnique` per row has nothing left to find out.
 *
 * See docs/features/settings/2026-10-28-design-import-ownership-guard.md.
 */
async function requireOwnRowIdsOrUnclaimed(
  ctx: Context,
  model: OwnedModel,
  rows: readonly { id: string }[],
  targetHouseholdId: string,
): Promise<Set<string>> {
  const own = new Set<string>()
  const checked = new Set<string>()
  for (const { id } of rows) {
    if (checked.has(id)) continue
    checked.add(id)
    if ((await requireOwnRowOrUnclaimed(ctx, model, id, targetHouseholdId)) === 'own') own.add(id)
  }
  return own
}

/**
 * Authorize every id an ItemStock payload names, BEFORE any row is written.
 *
 * `ItemStock` is the only model in this file with THREE attacker-controlled
 * ids per row, and it is the only one with no `userId` column of its own (root
 * CLAUDE.md, Authorization — it is scoped THROUGH its location). So all three
 * have to be resolved here:
 *
 *  - `locationId` — where the row will be WRITTEN. Must exist, the caller
 *    must hold a role on it, and it must be in the TARGET household, so
 *    `requireLocationRole` and then `requireLocationInHousehold` are called
 *    unconditionally. There is no "unclaimed id is free" case as there is for
 *    `LocationInput`: an id no `Location` row holds is a broken foreign key,
 *    not a new location.
 *  - `itemId` — the row's other parent. `Item` belongs to a household (since
 *    households H3a task 3.7), so the check is a SCOPED query
 *    (`where: { id, householdId }`) and never a comparison of a fetched row's
 *    `householdId` against the caller's, which root CLAUDE.md forbids.
 *  - `id` — the row's own primary key, GLOBAL and with no `userId` in it. If a
 *    row already holds it, that row's OWN location must be one the caller
 *    holds, in the target household. This is the check
 *    `requireOwnLocationIdsOrUnclaimed` cannot serve: there the id being
 *    checked IS a location id; here it is a stock id whose location has to be
 *    read out of the stored row first.
 *
 * `householdId` is the TARGET household (households H4 task E.3, decision
 * T13), the id `requireCatalogRole` returned. Until E.3 the item was checked
 * against `requireHousehold(ctx)` and the location only by role. So a person
 * in households A and B could import a stock row at a location of B that
 * points at an item of A (issue #381, gap 1). Now the location and the item
 * must both be in the target, so they are in the same household.
 *
 * WITHOUT the `id` check, copying the house style verbatim ships the same two
 * cross-user holes task 5 found, in the shape this model takes:
 *
 *  - `bulkCreate` doing `findUnique({ where: { id } })` then `continue` would
 *    SILENTLY DROP the caller's own stock row because a stranger's row holds
 *    that id — no error, and the item then shows as stocked nowhere.
 *  - `bulkUpsert` doing `upsert({ where: { id }, update: data })` with
 *    `itemId` and `locationId` in `data` would MOVE the stranger's row into
 *    the caller's own location and repoint it at the caller's own item. That
 *    is the row steal without a `userId` to reassign: the quantities for an
 *    item the attacker never had leave the victim's pantry and appear in the
 *    attacker's, under the victim's `createdAt`. Worse than the `Location`
 *    case in one way — the attacker needs only a stock row id, and the row
 *    carries real quantity data rather than a name.
 *
 * Three things about the shape, the same three as the helpers above: each
 * DISTINCT id of each kind is checked ONCE, not once per row; the whole check
 * runs before the write loop, because these bulk resolvers are not
 * transactional and a throw from inside leaves earlier rows on disk; and it
 * reads nothing it does not need.
 *
 * `'participant'` for the same reason as every other helper here: it is the
 * LOWEST location role that may write, so a legitimate participant of a
 * shared location is not denied. Asking for `'organizer'` would deny them.
 */
async function requireOwnItemStockRefs(
  ctx: Context,
  stocks: readonly { id: string; itemId: string; locationId: string }[],
  householdId: string,
): Promise<void> {
  // The role FIRST, then the household, as in `resolveLogLocations`.
  const checkedLocations = new Set<string>()
  async function requireWritableLocation(locationId: string) {
    if (checkedLocations.has(locationId)) return
    checkedLocations.add(locationId)
    await requireLocationRole(ctx, locationId, 'participant')
    await requireLocationInHousehold(ctx, locationId, householdId)
  }
  for (const { locationId } of stocks) await requireWritableLocation(locationId)

  const checkedItems = new Set<string>()
  for (const { itemId } of stocks) {
    if (checkedItems.has(itemId)) continue
    checkedItems.add(itemId)
    const own = await prisma.item.findFirst({
      where: { id: itemId, householdId },
      select: { id: true },
    })
    // Same wording and code as `requireLocationRole`'s refusal, and for the
    // same reason: "not yours" must be indistinguishable from "does not
    // exist", or the mutation becomes a probe for other accounts' item ids.
    if (!own) {
      throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } })
    }
  }

  const checkedIds = new Set<string>()
  for (const { id } of stocks) {
    if (checkedIds.has(id)) continue
    checkedIds.add(id)
    // UNSCOPED on purpose, and only `locationId` is selected. The question is
    // "is this primary key taken, and if so by a row in whose location" — the
    // AUTHORIZATION decision is made entirely by `requireLocationRole` and
    // `requireLocationInHousehold`, the seams this series routes location
    // checks through. The stored row's location must be in the target too:
    // `bulkUpsertItemStocks` updates a row in place and keeps its location.
    const taken = await prisma.itemStock.findUnique({
      where: { id },
      select: { locationId: true },
    })
    if (taken) await requireWritableLocation(taken.locationId)
  }
}

/**
 * Decide, BEFORE any row is written, which imported cart items may be written:
 * the cart must be at a location of the TARGET household where the caller is
 * `participant` or higher, and the item must be an item of that household.
 * Returns a function that answers that for one `(cartId, itemId)` pair.
 *
 * `householdId` is the target household, the id `requireCatalogRole`
 * returned (households H4 task E.3). The two steps:
 *
 *  1. The cart, scoped to the writable locations OF THE TARGET
 *     (`locationIdsWithRole(ctx, 'participant', { householdId })`). A cart at
 *     a location where the caller is only `viewer`, has no role, or that is in
 *     another household, or a cart that is gone, makes its rows SKIPPED. This
 *     query IS the role check, so no `requireLocationRole` follows it.
 *  2. The item, scoped by the same household, read only after step 1 passed.
 *     An item of another household, or one that is gone, makes its row
 *     SKIPPED.
 *
 * Both steps SKIP rather than refuse: a partial backup legitimately names a
 * cart or an item that is gone, and "not yours" must look the same as "not
 * there". So this does not call `requireLocationItems`, which throws.
 *
 * Why the target household in step 1. Until E.3 the writable list covered
 * EVERY household the caller is in, and the item was checked against the
 * household of the cart's location (`householdOfLocation`, households H3a
 * task 3.9). So a person in households A and B, importing into A, could still
 * add a row to a cart of B, with an item of B. The row itself was consistent,
 * but the import wrote into a household it was not aimed at. With the cart
 * limited to the target, the cart's household IS the target, so the item is
 * checked against the target directly and `householdOfLocation` is not read.
 *
 * History. Until households H3b task B.3 the cart was found by `Cart.userId`,
 * and a cart of the caller's at a location where they were only `viewer`
 * THREW FORBIDDEN for the whole batch. Task B.7 made that case skip. What
 * still REFUSES a viewer is the row's OWN id: a backup that names an existing
 * cart item at that location is refused by
 * `requireOwnRowOrUnclaimed('cartItem')` before this runs.
 *
 * Each distinct cart is read once, and the items in one query.
 *
 * Returns `usable` (may this row be written) and `locationOf` (the cart's
 * location and the household, for the live event after the write, households
 * H3c-1 task C.4). `locationOf` reads the `Cart.locationId` column, not the
 * cart id. Since E.3 the two always agree for a cart an import writes, but a
 * cart the old import fallback stored can sit at a location its id does not
 * name.
 */
async function resolveCartItemParents(
  ctx: Context,
  cartItems: readonly { cartId: string; itemId: string }[],
  householdId: string,
): Promise<{
  usable: (cartId: string, itemId: string) => boolean
  locationOf: (cartId: string) => ChangedLocation
}> {
  requireAuth(ctx)
  const writable = await locationIdsWithRole(ctx, 'participant', { householdId })

  // cart id → its location, or null when the cart is at no writable location
  // of the target household.
  const cartLocation = new Map<string, string | null>()
  for (const { cartId } of cartItems) {
    if (cartLocation.has(cartId)) continue
    const cart = await prisma.cart.findFirst({
      where: { id: cartId, locationId: { in: writable } },
      select: { id: true, locationId: true },
    })
    cartLocation.set(cartId, cart?.locationId ?? null)
  }

  const itemIds = [
    ...new Set(cartItems.filter(({ cartId }) => cartLocation.get(cartId)).map(({ itemId }) => itemId)),
  ]
  // SCOPED in SQL; no fetched row's `householdId` is compared here.
  const own =
    itemIds.length === 0
      ? []
      : await prisma.item.findMany({
          where: { id: { in: itemIds }, householdId },
          select: { id: true },
        })
  const ownItems = new Set(own.map(({ id }) => id))

  return {
    usable: (cartId, itemId) => !!cartLocation.get(cartId) && ownItems.has(itemId),
    // Called only for a cart `usable` let through, so the map holds it.
    locationOf: (cartId) => ({
      locationId: cartLocation.get(cartId) ?? '',
      householdId,
    }),
  }
}

/** One imported cart item, as both cart item import mutations receive it. */
type CartItemPayloadRow = { id: string; cartId: string; itemId: string; quantity: number }

/** The payload rows of one `(cartId, itemId)` pair, merged. */
interface MergedCartItem {
  cartId: string
  itemId: string
  /** The sum of the rows' amounts. */
  quantity: number
  /** Every payload id of the pair, lowest first, without repeats. */
  ids: string[]
}

/**
 * Merge the payload rows that name the same `(cartId, itemId)` pair, by
 * summing their amounts (households H3b decision P3). A cart holds ONE row
 * per item since task B.3 (`@@unique([cartId, itemId])`), and an old backup
 * may still carry two rows for one item: one made before the migration
 * merged them, or one from local mode before task B.8.
 *
 * Groups keep the order in which their pair first appears, so the rows the
 * mutation returns follow the payload.
 */
function mergeCartItemRows(rows: readonly CartItemPayloadRow[]): MergedCartItem[] {
  const groups = new Map<string, MergedCartItem>()
  for (const { id, cartId, itemId, quantity } of rows) {
    // NUL as the separator, for the reason `bulkCreateItemStocks` gives.
    const key = `${cartId}\u0000${itemId}`
    const group = groups.get(key)
    if (group) {
      group.quantity += quantity
      if (!group.ids.includes(id)) group.ids.push(id)
    } else {
      groups.set(key, { cartId, itemId, quantity, ids: [id] })
    }
  }
  for (const group of groups.values()) group.ids.sort()
  return [...groups.values()]
}

/**
 * The id a merged group's NEW row is created under: the lowest of its
 * payload ids that no row holds and no earlier group has taken. `undefined`
 * when there is none, and then Postgres makes one (`@default(cuid())`).
 *
 * Why the lowest id. The migration of task B.3 kept the lowest id of each
 * duplicate pair, and local mode's version 19 (task B.8) does the same. So a
 * backup made BEFORE the merge, imported AFTER it, finds its kept row under
 * the same id, and `bulkCreateCartItems` skips it as already imported.
 *
 * Why never an id a row already holds, or one an earlier group took: the
 * `create` half of the upsert would then raise P2002 on the primary key. The
 * `upsert`'s conflict target is the pair, not `id`. A payload can repeat an
 * id under two pairs only when it was edited by hand, but that must not fail
 * the import.
 *
 * `taken` is changed: the id returned is added to it.
 */
function takeNewCartItemId(group: MergedCartItem, taken: Set<string>): string | undefined {
  const id = group.ids.find((candidate) => !taken.has(candidate))
  if (id !== undefined) taken.add(id)
  return id
}

type ImportedFilterConfig = {
  tagIds?: string[] | null
  vendorIds?: string[] | null
  recipeIds?: string[] | null
}

/**
 * The ids a shelf ATTACHES — its `itemIds` and the tag, vendor and recipe ids
 * in its `filterConfig` — with every id of ANOTHER household's row removed
 * (households H3a task 3.9). Returns a function that gives each shelf its
 * cut-down arrays.
 *
 * Before task 3.9, both import mutations wrote the arrays as given, so a
 * shelf of the caller's could name another household's items, tags, vendors
 * and recipes. `createShelf` / `updateShelf` refuse such a shelf with
 * FORBIDDEN (`requireCatalogIds`, task 3.7). Import does NOT refuse it. It
 * DROPS each such id, and the shelf still lands, for the reason every other
 * reference in this file is skipped: one bad id in a backup must not stop the
 * whole import.
 *
 * | An id is | Result |
 * |---|---|
 * | a row of `householdId` | kept |
 * | a row of another household | dropped |
 * | held by no row | KEPT — the same rule as `createShelf`'s `missing: 'allow'` |
 *
 * Why an id no row holds is kept. On the `replace` strategy the web client
 * runs TWO passes (`importData.ts`, the replace flow): first `bulkCreate*`
 * for the rows with no conflict, over every entity with shelves last, and
 * THEN `bulkUpsert*` for the conflicting rows. An item, tag, vendor or recipe
 * that conflicts with a cloud row by NAME only keeps its payload id and is
 * written in the SECOND pass. A new shelf naming it is written in the FIRST
 * pass, before that row exists. So "shelves are imported last" is true only
 * inside one pass, and dropping a missing id here would lose the user's own
 * shelf contents. The first version of this helper (task 3.9) did drop it.
 * Before task 3.9 the id was kept, so that was a regression, found in the
 * task 3.9 review and fixed.
 *
 * Keeping a missing id is also safe: the shelf arrays are plain arrays, not
 * foreign keys, and nothing removes an id from them when its row is deleted,
 * so a shelf may already name a deleted row (see `requireCatalogIds`).
 *
 * Accepted cost: the caller can tell a stranger's id (dropped) from a free
 * one (kept) by reading the shelf back. That is the same answer
 * `requireOwnRowOrUnclaimed` gives on purpose ('unclaimed' vs FORBIDDEN), and
 * the same protection holds: ids are `cuid()` and cannot be guessed.
 *
 * Queries: per model, one SCOPED read for the household's ids, and one
 * UNSCOPED existence read for the rest only when some id is not the
 * household's — the shape of `requireCatalogIds`. A model no shelf names
 * costs none. No fetched row's `householdId` is compared.
 */
async function householdShelfRefs(
  householdId: string,
  shelves: readonly { itemIds?: readonly string[] | null; filterConfig?: ImportedFilterConfig | null }[],
): Promise<
  (shelf: { itemIds?: readonly string[] | null; filterConfig?: ImportedFilterConfig | null }) => {
    itemIds: string[]
    filterConfig: ImportedFilterConfig | undefined
  }
> {
  // Every id the batch names for one model, each once.
  const named = (pick: (s: (typeof shelves)[number]) => readonly string[] | null | undefined) => [
    ...new Set(shelves.flatMap((s) => pick(s) ?? [])),
  ]
  type ShelfRefModel = 'item' | 'tag' | 'vendor' | 'recipe'
  const findIds = async (
    model: ShelfRefModel,
    where: { id: { in: string[] }; householdId?: string },
  ): Promise<Set<string>> => {
    const select = { id: true } as const
    const rows =
      model === 'item'
        ? await prisma.item.findMany({ where, select })
        : model === 'tag'
          ? await prisma.tag.findMany({ where, select })
          : model === 'vendor'
            ? await prisma.vendor.findMany({ where, select })
            : await prisma.recipe.findMany({ where, select })
    return new Set(rows.map((r) => r.id))
  }
  // The subset of `ids` that are rows of ANOTHER household: the ids to drop.
  const strangersOf = async (model: ShelfRefModel, ids: string[]): Promise<Set<string>> => {
    if (ids.length === 0) return new Set()
    // SCOPED in SQL: the household's own ids.
    const own = await findIds(model, { id: { in: ids }, householdId })
    const rest = ids.filter((id) => !own.has(id))
    if (rest.length === 0) return new Set()
    // UNSCOPED on purpose: "is this id held by any row" tells a stranger's id
    // from one no row holds yet. Only `id` is selected.
    return findIds(model, { id: { in: rest } })
  }

  const items = await strangersOf('item', named((s) => s.itemIds))
  const tags = await strangersOf('tag', named((s) => s.filterConfig?.tagIds))
  const vendors = await strangersOf('vendor', named((s) => s.filterConfig?.vendorIds))
  const recipes = await strangersOf('recipe', named((s) => s.filterConfig?.recipeIds))

  const keep = (ids: readonly string[] | null | undefined, drop: Set<string>) =>
    ids == null ? ids : ids.filter((id) => !drop.has(id))

  return (shelf) => {
    const fc = shelf.filterConfig
    return {
      itemIds: keep(shelf.itemIds, items) ?? [],
      // A key the payload left out stays out, and `null` stays `null`, so
      // the stored JSON has the shape the client sent.
      filterConfig: fc
        ? {
            ...fc,
            ...(fc.tagIds !== undefined ? { tagIds: keep(fc.tagIds, tags) } : {}),
            ...(fc.vendorIds !== undefined ? { vendorIds: keep(fc.vendorIds, vendors) } : {}),
            ...(fc.recipeIds !== undefined ? { recipeIds: keep(fc.recipeIds, recipes) } : {}),
          }
        : undefined,
    }
  }
}

/**
 * Runs the writes of one catalog import, then sends one household-level
 * `CATALOG` event (households H3c-2 task D.4) when `write` said it changed
 * something, by calling `changed()`.
 *
 * Published in `finally`, the same way as the cart, stock and log imports:
 * the rows are saved one by one or in parallel, not in one transaction, so a
 * batch that throws part-way has already saved some rows, and other tabs
 * must hear about them. A batch that wrote nothing (every row skipped) sends
 * nothing.
 *
 * `householdId` is the target household (`requireCatalogRole`). Every catalog
 * import writes only there: each `create` and `createMany` sets it, and an
 * `upsert` reaches an existing row only after `requireOwnRowIdsOrUnclaimed`
 * found it in that household.
 */
async function withCatalogEvent<T>(
  ctx: Context,
  householdId: string,
  write: (changed: () => void) => Promise<T>,
): Promise<T> {
  let didChange = false
  try {
    return await write(() => {
      didChange = true
    })
  } finally {
    if (didChange) await publishHouseholdChange(ctx, ['CATALOG'], householdId)
  }
}

// ── Households H3a, task 3.7: the catalog part only ──
//
// The six catalog models (`Item`, `Tag`, `TagType`, `Vendor`, `Recipe`,
// `Shelf`) belong to a household. So every catalog row these mutations
// create carries `householdId` (and, since task 3.14, no `userId`), and
// every catalog read below is filtered by `householdId`. That had to happen
// in the same step as `requireOwnRowOrUnclaimed`'s body moving to the
// household, or an imported row would be refused as "somebody else's" by the
// very next import.
//
// Task 3.9 did the rest of the import part:
//
// - Locations: a created location carries `householdId` and gets an
//   `organizer` row for the caller, in one transaction
//   (`createImportedLocation`). An existing location is never given a role
//   row by an import.
// - The ids a row ATTACHES are checked against the household: a tag's
//   `typeId` and `parentId` in `bulkUpsertTags`, a shelf's `itemIds` and
//   `filterConfig` ids, and a cart item's `itemId` against the household of
//   the CART's location. Each unusable id is SKIPPED (the row or the edge),
//   the same as every other reference in this file. See each mutation.
//   One difference for shelves: only another household's id is dropped. An
//   id no row holds is KEPT, because on `replace` the row it names may be
//   written later in the same import. See `householdShelfRefs`.
//
// - `clearAllData` clears the caller's household, owner only, and makes
//   "Home" again (task 3.10, decision H17). See its own comment.
//
// ── IMPORT ROLE GATE (households H4 task E.3, decision T8) ──
//
// Every one of the 22 bulk mutations below starts with
// `requireCatalogRole(ctx, 'manager')`, right after `requireAuth`: only a
// household owner or manager may import (design, *Import: owner and manager
// only*). A household `member` is refused with FORBIDDEN, even a member who
// organizes a location (decision O7), and even for an empty batch, before
// any other read. `clearAllData`, which the `clear` strategy calls first,
// asks `owner`.
//
// The id `requireCatalogRole` returns is the TARGET household: the one the
// import writes into. Every check below gets it: the row-id guard
// (`requireOwnRowIdsOrUnclaimed`), the location checks (`resolveLogLocations`,
// `resolveCartLocations`, `requireOwnLocationIdsOrUnclaimed`,
// `requireOwnItemStockRefs`) and the cart item parents. So a location, a
// stored row and an item must all be in that one household. Until H7's
// household switch it is the caller's household (`requireHousehold`).
//
// No row goes to a fallback location any more (decisions T10 and T11): a
// log with no location and a cart id with no location prefix are refused
// with BAD_USER_INPUT.
export const importResolvers: Pick<Resolvers, 'Mutation'> = {
  Mutation: {
    // -------------------------------------------------------------------------
    // Bulk create — inserts records with original IDs, skips existing ones.
    // -------------------------------------------------------------------------
    bulkCreateItems: async (_, { items }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (items.length === 0) return []
      // Authorizes every id the payload names BEFORE the first write, and
      // returns the ids the caller ALREADY OWNS. A payload naming another
      // account's item id fails the whole mutation with nothing written.
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'item', items, householdId)
      return withCatalogEvent(ctx, householdId, async (changed) => {
        const results: Item[] = []
        for (const item of items) {
          const { id, tagIds, vendorIds, createdAt, updatedAt, targetUnit, expirationThreshold, ...rest } = item
          // Skip the caller's OWN existing row. The per-row
          // `findUnique({ where: { id } })` this replaces was UNSCOPED, so a
          // stranger's row read as "already exists" and the caller's own item
          // was dropped with no error and no count. After the guard above an id
          // is one of exactly two things: the caller's own row (here) or free.
          if (ownIds.has(id)) continue
          const expirationMode = (rest as { expirationMode?: string }).expirationMode
          // `...rest` is CONFIGURATION only — cloud locations PR 5 dropped the
          // five per-location state fields from `ItemInput`, so no spread can
          // reach a stock column from here.
          //
          // `wikidataUrl` and `note` (issue #335) travel inside this spread —
          // they are not destructured above, so they need no line of their own.
          // `import.resolver.test.ts` asserts they land, so a future destructure
          // that forgets to put them back fails.
          const created = await prisma.item.create({
            data: {
              id,
              ...rest,
              targetUnit: targetUnit as TargetUnit,
              expirationThreshold: expirationThreshold ?? undefined,
              expirationMode: expirationMode
                ? (expirationMode === 'days from purchase' ? 'days_from_purchase' : expirationMode as ExpirationMode)
                : 'disabled',
              createdAt: new Date(createdAt),
              updatedAt: new Date(updatedAt),
              householdId,
            },
          })
          changed()
          // NO STOCK IS WRITTEN HERE, AND THAT IS THE POINT (cloud locations
          // PR 4b). Until 4b this resolver mirrored the payload's inline stock
          // into an `ItemStock` in the CALLER'S DEFAULT location, because the
          // import surface was flat and the cloud pantry reads `ItemStock`. The
          // client now uploads real `ItemStock` rows through
          // `bulkCreateItemStocks` / `bulkUpsertItemStocks` (PR 4a), each row
          // naming its own location, so mirroring here would collapse a
          // multi-location pantry onto one location and fight the real rows.
          //
          // `ItemInput` still carries the five stock columns and they are still
          // written to `Item` above, for a browser on a stale bundle that reads
          // them. PR 5 drops those columns.
          //
          // DO NOT PUT A MIRROR BACK. If an imported item is invisible in the
          // cloud pantry, the break is in the client's `itemStocks` upload
          // (`apps/web/src/lib/importData.ts`, `ENTITY_SPECS`) or in
          // `bulkCreateItemStocks` — not here.
          // SCOPED, and a tag the caller does not own is SKIPPED — not refused.
          // Plan task 8. ("Own" means "in the caller's household" since
          // households H3a task 3.7: the filter is `householdId`, not `userId`.)
          //
          // Why skip rather than throw FORBIDDEN. A reference that does not
          // resolve is a normal thing in a partial backup: a user exports, then
          // deletes the tag, then re-imports. This filter already dropped an
          // unknown `tagId` silently, and a tag the caller may not use has to be
          // treated the same way — "you may not use this id" and "no row holds
          // this id" must be indistinguishable, or the mutation becomes a probe
          // for another account's tag ids. `requireOwnItemStockRefs` throws for
          // its `itemId` only because `ItemStock` has no other scope to fall
          // back on; here the row itself is already guarded, so only the EDGE is
          // dropped and the item still lands.
          //
          // Before the `userId`, this read was UNSCOPED, so the caller's own
          // item could be linked to a STRANGER's tag — a cross-account
          // `ItemTag` row.
          if (tagIds?.length) {
            const existingTags = await prisma.tag.findMany({
              where: { id: { in: tagIds }, householdId },
              select: { id: true },
            })
            const validTagIds = existingTags.map((t) => t.id)
            if (validTagIds.length > 0) {
              await prisma.itemTag.createMany({
                data: validTagIds.map((tagId) => ({ itemId: id, tagId })),
                skipDuplicates: true,
              })
            }
          }
          // The same filter for vendors, where there was NO check at all before
          // plan task 8 — any `vendorId` the payload named was written straight
          // into `ItemVendor`, a stranger's included. Skip, not refuse, for the
          // reason spelled out above the tag filter.
          if (vendorIds?.length) {
            const existingVendors = await prisma.vendor.findMany({
              where: { id: { in: vendorIds }, householdId },
              select: { id: true },
            })
            const validVendorIds = existingVendors.map((v) => v.id)
            if (validVendorIds.length > 0) {
              await prisma.itemVendor.createMany({
                data: validVendorIds.map((vendorId) => ({ itemId: id, vendorId })),
                skipDuplicates: true,
              })
            }
          }
          // SCOPED. Defence in depth, not the guard — after the pre-pass no
          // stranger's row can be in range. It is added for the reason
          // `bulkCreateLocations` records: an unscoped read makes a miss mean
          // two different things, and a future edit that drops the guard then
          // has nothing catching it. `findUniqueOrThrow` takes the same
          // `WhereUniqueInput` as `findUnique`, which since Prisma 5 may carry
          // extra non-unique filters, so the `householdId` here is type-legal.
          const full = await prisma.item.findUniqueOrThrow({
            where: { id: created.id, householdId },
            include: { tags: true, vendors: true },
          })
          results.push(itemToGraphQL(full))
        }
        return results
      })
    },

    bulkCreateTags: async (_, { tags }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (tags.length === 0) return []
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'tag', tags, householdId)
      const ids = tags.map((t) => t.id)
      const docs = tags.map((tag): Record<string, unknown> & { id: string } => {
        const { id, userId: _u, familyId: _f, ...rest } = tag as unknown as Record<string, unknown>
        return { id: id as string, ...rest, householdId }
      })
      // Filter out tags whose typeId references a TagType that doesn't exist
      // (orphaned tags from deleted TagTypes in the source data).
      //
      // SCOPED since plan task 8 (by `householdId` since households H3a task 3.7). `Tag.typeId` is a foreign key to
      // `TagType`, and this read was UNSCOPED, so the caller's own tag could
      // point at a STRANGER's tag type. Skip, not refuse: a tag whose type the
      // caller may not use is dropped exactly like a tag whose type no longer
      // exists, which is the behaviour this filter already had. See the long
      // comment above `bulkCreateItems`' tag filter for why skip is right here
      // and a throw is right in `requireOwnItemStockRefs`.
      const typeIds = [...new Set(docs.map((d) => d.typeId as string))]
      const existingTypeIds = await prisma.tagType.findMany({
        where: { id: { in: typeIds }, householdId },
        select: { id: true },
      })
      const validTypeIdSet = new Set(existingTypeIds.map((t) => t.id))
      let remaining = docs.filter((d) => validTypeIdSet.has(d.typeId as string))
      // Insert in topological order: parents before children. Each pass inserts
      // tags whose parentId is either null or already present in the DB.
      // Seeded from the guard's result, not from a fresh read. After
      // `requireOwnRowIdsOrUnclaimed` an id in this payload is either the
      // caller's own row (here, so a child naming it as a parent can go in
      // this pass) or free. The read this replaces was UNSCOPED, so a
      // stranger's row counted as "already inserted" — which both dropped the
      // caller's own tag and let a child hang off a parent the caller cannot
      // see.
      return withCatalogEvent(ctx, householdId, async (changed) => {
        const insertedIds = new Set(ownIds)
        while (remaining.length > 0) {
          const batch = remaining.filter(
            (d) => !d.parentId || insertedIds.has(d.parentId as string),
          )
          if (batch.length === 0) break // cycle or unresolvable parentIds — stop to avoid infinite loop
          // `skipDuplicates` stays. After the guard it can only skip the
          // caller's OWN rows, which is this strategy's correct "skip
          // conflicts" behaviour.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count } = await prisma.tag.createMany({ data: batch as any, skipDuplicates: true })
          if (count > 0) changed()
          const batchIds = new Set(batch.map((d) => d.id))
          batchIds.forEach((id) => insertedIds.add(id))
          remaining = remaining.filter((d) => !batchIds.has(d.id))
        }
        // SCOPED, like `bulkCreateLocations`'s closing read. Defence in depth
        // rather than the guard itself: after the pre-pass no stranger's row can
        // be in range. It is scoped anyway because an unscoped read makes a skip
        // mean two different things, so a future edit that dropped the guard
        // would have nothing catching it.
        const inserted = await prisma.tag.findMany({ where: { id: { in: ids }, householdId } })
        return inserted as unknown as Tag[]
      })
    },

    bulkCreateTagTypes: async (_, { tagTypes }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (tagTypes.length === 0) return []
      // The guard is the only change here. There is no existence check to
      // replace: this mutation never had one, and `skipDuplicates` below did
      // the skipping. After the guard `skipDuplicates` can only skip the
      // caller's OWN rows — before it, a stranger's id was skipped too, which
      // silently dropped the caller's row.
      await requireOwnRowIdsOrUnclaimed(ctx, 'tagType', tagTypes, householdId)
      const ids = tagTypes.map((t) => t.id)
      const docs = tagTypes.map((tt) => {
        const { id, userId: _u, familyId: _f, ...rest } = tt as unknown as Record<string, unknown>
        return { id: id as string, ...rest, color: (rest as { color: string }).color as TagColor, householdId }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return withCatalogEvent(ctx, householdId, async (changed) => {
        const { count } = await prisma.tagType.createMany({ data: docs as any, skipDuplicates: true })
        if (count > 0) changed()
        // SCOPED — same reason as `bulkCreateTags`' closing read above.
        const inserted = await prisma.tagType.findMany({ where: { id: { in: ids }, householdId } })
        return inserted as unknown as TagType[]
      })
    },

    bulkCreateVendors: async (_, { vendors }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (vendors.length === 0) return []
      // The guard is the only change, for the same reason as
      // `bulkCreateTagTypes` above: `skipDuplicates` can now only skip the
      // caller's OWN rows.
      await requireOwnRowIdsOrUnclaimed(ctx, 'vendor', vendors, householdId)
      const ids = vendors.map((v) => v.id)
      const docs = vendors.map((v) => {
        const { id, userId: _u, familyId: _f, ...rest } = v as unknown as Record<string, unknown>
        return { id: id as string, ...rest, householdId }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return withCatalogEvent(ctx, householdId, async (changed) => {
        const { count } = await prisma.vendor.createMany({ data: docs as any, skipDuplicates: true })
        if (count > 0) changed()
        // SCOPED — same reason as `bulkCreateTags`' closing read above.
        const inserted = await prisma.vendor.findMany({ where: { id: { in: ids }, householdId } })
        return inserted as unknown as Vendor[]
      })
    },

    bulkCreateRecipes: async (_, { recipes }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (recipes.length === 0) return []
      // Same guard, same position and same reason as `bulkCreateItems` above.
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'recipe', recipes, householdId)
      return withCatalogEvent(ctx, householdId, async (changed) => {
        const results: Recipe[] = []
        for (const recipe of recipes) {
          const { id, items, lastCookedAt } = recipe
          // Skip the caller's OWN existing row — same replacement and same
          // reason as `bulkCreateItems` above.
          if (ownIds.has(id)) continue
          await prisma.recipe.create({
            data: {
              id,
              name: recipe.name,
              householdId,
              lastCookedAt: lastCookedAt ? new Date(lastCookedAt) : undefined,
            },
          })
          changed()
          // SCOPED since plan task 8 (by `householdId` since households H3a task 3.7), where there was NO check at
          // all before: any `itemId` the payload named went straight into
          // `RecipeItem`, a stranger's included. An ingredient the caller does
          // not own is SKIPPED and the recipe still lands — skip, not refuse,
          // for the reason spelled out above `bulkCreateItems`' tag filter.
          if (items?.length) {
            const ownItems = await prisma.item.findMany({
              where: { id: { in: items.map((i) => i.itemId) }, householdId },
              select: { id: true },
            })
            const ownItemIds = new Set(ownItems.map((i) => i.id))
            const validItems = items.filter((i) => ownItemIds.has(i.itemId))
            if (validItems.length > 0) {
              await prisma.recipeItem.createMany({
                data: validItems.map((i) => ({ recipeId: id, itemId: i.itemId, defaultAmount: i.defaultAmount })),
                skipDuplicates: true,
              })
            }
          }
          // SCOPED — same reason as `bulkCreateItems`' closing read above.
          const full = await prisma.recipe.findUniqueOrThrow({ where: { id, householdId }, include: { items: true } })
          results.push(full as unknown as Recipe)
        }
        return results
      })
    },

    bulkCreateInventoryLogs: async (_, { logs }, ctx) => {
      const userId = requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (logs.length === 0) return []
      // Verifies every location the payload names before the first write, so a
      // missing or forbidden location fails the whole mutation with nothing
      // written.
      const locationIdFor = await resolveLogLocations(ctx, logs, householdId)
      // Authorizes every LOG id the payload names. It runs AFTER
      // `resolveLogLocations` on purpose, so a forbidden location is still
      // refused first and the existing location tests keep their error.
      //
      // The two checks guard different columns. `resolveLogLocations` guards
      // the location a log is written TO, which arrives in its own input field.
      // This guards the log's OWN primary key, which is global and carries no
      // location at all. Without it the UNSCOPED `findUnique` this replaces
      // read a stranger's log as "already exists" and SILENTLY DROPPED the
      // caller's own log — no error, no count.
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'inventoryLog', logs, householdId)
      const results: InventoryLog[] = []
      // ── THE LIVE EVENT (households H3c-2 task D.2) ──
      //
      // `LOG` for the location of every row written, published in `finally`,
      // the same way as the cart imports above: the rows are saved one by
      // one, not in one transaction, so a batch that throws part-way has
      // already saved some rows and other tabs must hear about them.
      const touched: ChangedLocation[] = []
      try {
        for (const log of logs) {
          // `locationId` is pulled OUT of `rest`: it is set explicitly below
          // from the verified value, never passed straight through.
          const { id, occurredAt, note, logParams, locationId, ...rest } = log
          // After the guard an id is one of exactly two things: a log the caller
          // already owns (skip it) or an id no row holds (free to write). The
          // per-row read this replaces was unscoped, so it could not tell those
          // two apart.
          if (ownIds.has(id)) continue
          // SCOPED since plan task 8 — a `findFirst`, because
          // `{ id, householdId }` is not a unique key (by `householdId` since
          // households H3a task 3.7; `userId` before). The read this replaces was a
          // plain `findUnique({ where: { id } })`, so a log of the caller's
          // could be attached to a STRANGER's item.
          //
          // The existing `continue` STAYS. A log whose item the caller may not
          // use is skipped exactly like a log whose item no longer exists, which
          // is what this check already did. Refusing instead would both break a
          // partial backup and turn the mutation into a probe for another
          // account's item ids. Same pattern as `requireOwnItemStockRefs:450`,
          // which throws only because `ItemStock` has no other scope.
          const itemExists = await prisma.item.findFirst({ where: { id: (rest as { itemId: string }).itemId, householdId }, select: { id: true } })
          if (!itemExists) continue
          const created = await prisma.inventoryLog.create({
            data: {
              id,
              ...rest,
              occurredAt: new Date(occurredAt),
              note: note ?? undefined,
              userId,
              // The payload's own location, verified above. Every row names
              // one since households H4 task E.3.
              locationId: locationIdFor(locationId),
              ...(logParams ? { logParams: logParams as Prisma.InputJsonValue } : {}),
            },
          })
          results.push(created as unknown as InventoryLog)
          touched.push({ locationId: created.locationId })
        }
      } finally {
        await publishChange(ctx, ['LOG'], touched)
      }
      // NO CLOSING READ, on purpose. Each row returned is the row
      // `inventoryLog.create` itself wrote, and the guard above is what makes
      // that row the caller's own, so there is nothing here to scope by
      // `userId`. The eight mutations that DO close with a read scope it; this
      // one has no read. Design decision 5.
      return results
    },

    bulkCreateShoppingCarts: async (_, { carts }, ctx) => {
      const userId = requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (carts.length === 0) return []
      // Checks every location the payload's cart ids name before the first
      // write. A bare id (no location prefix) is BAD_USER_INPUT. A prefix that
      // is not a writable location of the target household, including one no
      // location holds, is FORBIDDEN. Either way nothing is written. No cart
      // goes to a fallback location (households H4 task E.3).
      const locationIdFor = await resolveCartLocations(ctx, carts, householdId)
      // Authorizes every CART id the payload names. It runs AFTER
      // `resolveCartLocations` on purpose, so a forbidden location is refused
      // first and the existing location tests keep their error.
      //
      // The two checks guard different things. `resolveCartLocations` guards
      // the location a cart is written TO; this guards the cart's OWN primary
      // key, which is global. Without it the UNSCOPED `findUnique` this
      // replaces read a stranger's cart as "already exists" and SILENTLY
      // DROPPED the caller's own cart — no error, no count.
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'cart', carts, householdId)
      const results: Cart[] = []
      // ── THE LIVE EVENT (households H3c-1, task C.4) ──
      //
      // The locations of the rows written so far, published in `finally`.
      // These four cart imports are NOT one transaction: each row commits on
      // its own. So when row 5 of 10 throws, rows 1 to 4 are saved, and the
      // other tabs must hear about their locations. `finally` publishes
      // exactly the rows that were written, and the error still reaches the
      // caller. A batch refused by a check before the loop has written
      // nothing, so `touched` is empty and nothing is published.
      // `publishChange` sends one event per distinct location and never
      // throws, so it cannot hide the loop's error.
      const touched: ChangedLocation[] = []
      try {
        for (const cart of carts) {
          const { id, lastPurchasedAt } = cart
          // After the guard an id is one of exactly two things: a cart the
          // caller already owns (skip it) or an id no row holds (free to
          // write). The per-row read this replaces was unscoped, so it could
          // not tell those two apart.
          if (ownIds.has(id)) continue
          const created = await prisma.cart.create({
            data: {
              id,
              lastPurchasedAt: lastPurchasedAt ? new Date(lastPurchasedAt as string) : undefined,
              // The location named by the cart's OWN id since PR 3b
              // (`${locationId}:${vendorId}`), verified above.
              locationId: locationIdFor(id),
            },
          })
          results.push(created as unknown as Cart)
          touched.push({ locationId: created.locationId })
        }
      } finally {
        await publishChange(ctx, ['CART'], touched)
      }
      // NO CLOSING READ, on purpose. Each row returned is the row
      // `cart.create` itself wrote, and the guard above is what makes that row
      // the caller's own, so there is nothing here to scope by `userId`. The
      // eight mutations that DO close with a read scope it; this one has no
      // read. Design decision 5.
      return results
    },

    bulkCreateCartItems: async (_, { cartItems }, ctx) => {
      const userId = requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (cartItems.length === 0) return []
      // Authorizes every cart-item id the payload names BEFORE the first
      // write, and returns the ids the caller already "owns": rows whose cart
      // is at a location where the caller is `participant` or higher
      // (households H3b task B.7). A row at any other location, a viewer's
      // included, fails the whole mutation with nothing written. Without the
      // guard the UNSCOPED `findUnique` this replaces read a stranger's row as
      // "already exists" and silently dropped the caller's own cart item.
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'cartItem', cartItems, householdId)
      // The cart and the item of every row, resolved before the first write.
      //
      // BOTH references are SCOPED to the target household: the cart by its
      // locations where the caller is `participant` or higher, the item by
      // the household. See `resolveCartItemParents`. Before plan task 8 both
      // reads were plain `findUnique({ where: { id } })`, and the `cartId` one
      // is the exact hole `e2e/tests/cart-id-cross-user-leak.spec.ts`
      // demonstrates against real Postgres.
      //
      // A cart or item the caller may not use is SKIPPED, exactly like one
      // that does not exist. A partial backup legitimately names a parent
      // that is gone, and making "not yours" distinguishable from "not there"
      // would turn the mutation into a probe for another household's ids.
      const parents = await resolveCartItemParents(ctx, cartItems, householdId)
      const usable = cartItems.filter((ci) => parents.usable(ci.cartId, ci.itemId))

      // ── The `skip` and `clear` strategies (households H3b decision P3) ──
      //
      // 1. Rows of one `(cartId, itemId)` pair are summed first.
      // 2. A group with an id the caller already owns is SKIPPED: that row was
      //    imported before, and "skip conflicts" means skip. The whole group,
      //    not just that row: a backup made before the merge of task B.3 holds
      //    a pair's rows under several ids, the merge kept the lowest, and the
      //    others then look new. Skipping only the known id would add the
      //    other rows' amounts a second time on every re-import.
      // 3. Otherwise the amount is ADDED to the cloud row of that pair, or a
      //    new row is made under the group's lowest id.
      //
      // One `upsert` on the pair with `increment`, not a read then a write:
      // Postgres runs it as one `INSERT ... ON CONFLICT ("cartId", "itemId")
      // DO UPDATE`, so a concurrent `addToCart` of the same item cannot make
      // it raise P2002 or lose either amount. The `create` half's `id` is an
      // id no row held when the guard ran (see `takeNewCartItemId`).
      //
      // `userId` ("added by") is in `create` only, as in `addToCart`. An
      // import that adds to another member's row does not take it over.
      const taken = new Set(ownIds)
      const results: CartItem[] = []
      const touched: ChangedLocation[] = []
      try {
        for (const group of mergeCartItemRows(usable)) {
          if (group.ids.some((id) => ownIds.has(id))) continue
          const { cartId, itemId, quantity } = group
          const id = takeNewCartItemId(group, taken)
          const written = await prisma.cartItem.upsert({
            where: { cartId_itemId: { cartId, itemId } },
            create: { ...(id === undefined ? {} : { id }), cartId, itemId, quantity, userId },
            update: { quantity: { increment: quantity } },
          })
          results.push(written as unknown as CartItem)
          touched.push(parents.locationOf(cartId))
        }
      } finally {
        // Why `finally`: see THE LIVE EVENT in `bulkCreateShoppingCarts`.
        await publishChange(ctx, ['CART'], touched)
      }
      // NO CLOSING READ — same reason as `bulkCreateShoppingCarts` above. The
      // returned row is the one the upsert wrote, at a cart the guard and
      // `resolveCartItemParents` let through. Design decision 5.
      return results
    },

    // -------------------------------------------------------------------------
    // Bulk upsert — inserts or replaces records by their original ID
    // -------------------------------------------------------------------------
    bulkUpsertItems: async (_, { items }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (items.length === 0) return []
      // Authorizes every id the payload names BEFORE the first write. Without
      // it an `upsert` on a bare `{ id }` with `userId` inside `update`
      // overwrote another account's item AND took ownership of it.
      await requireOwnRowIdsOrUnclaimed(ctx, 'item', items, householdId)
      return withCatalogEvent(ctx, householdId, async (changed) => {
        const results: Item[] = []
        for (const item of items) {
          const { id, tagIds, vendorIds, createdAt, updatedAt, targetUnit, expirationThreshold, ...rest } = item
          const expirationMode = (rest as { expirationMode?: string }).expirationMode
          // CONFIGURATION only — same reason as `bulkCreateItems` above.
          // `wikidataUrl` and `note` (issue #335) ride in `...rest` here too.
          const data = {
            ...rest,
            targetUnit: targetUnit as TargetUnit,
            expirationThreshold: expirationThreshold ?? undefined,
            expirationMode: expirationMode
              ? (expirationMode === 'days from purchase' ? 'days_from_purchase' : expirationMode as ExpirationMode)
              : 'disabled',
            createdAt: new Date(createdAt),
            updatedAt: new Date(updatedAt),
          }
          await prisma.item.upsert({
            where: { id },
            create: { id, ...data, householdId },
            // `householdId` is in `create` and NOT in `update` — the shape
            // `bulkUpsertLocations` uses. A row's owner is not something an
            // import may rewrite, and leaving the column out of `update` means a
            // future edit that drops the guard above cannot reassign a row by
            // accident.
            update: data,
          })
          changed()
          // NO STOCK IS WRITTEN HERE either — same reason as `bulkCreateItems`
          // above (cloud locations PR 4b). The client sends this payload's stock
          // through `bulkUpsertItemStocks` on the second pass, after this one.
          // Replace junction rows
          await prisma.itemTag.deleteMany({ where: { itemId: id } })
          await prisma.itemVendor.deleteMany({ where: { itemId: id } })
          // BOTH filters are SCOPED since plan task 8 (by `householdId` since households H3a task 3.7), where this
          // mutation had NO check on either reference — every `tagId` and
          // `vendorId` the payload named went straight into `ItemTag` /
          // `ItemVendor`, a stranger's included. A reference the caller does not
          // own is SKIPPED and the item still lands; see the long comment above
          // `bulkCreateItems`' tag filter for why skip and not FORBIDDEN.
          //
          // SIDE EFFECT ON THE `P2003` THE DESIGN DOC RECORDS. `itemVendor.createMany`
          // below still carries no `skipDuplicates`, which is unchanged. But the
          // design noted that an unknown `vendorId` reached Postgres and raised
          // an UNHANDLED foreign-key `P2003`; after this filter no unknown or
          // stranger-owned id can reach it, because every surviving id came back
          // from a `Vendor` row of the caller's. The same was true of `tagId`.
          // So that `P2003` is no longer reachable through either reference.
          // Not asserted here: the server suite runs against a fake with no
          // foreign keys, so only a real-Postgres test could prove it.
          if (tagIds?.length) {
            const existingTags = await prisma.tag.findMany({
              where: { id: { in: tagIds }, householdId },
              select: { id: true },
            })
            const validTagIds = existingTags.map((t) => t.id)
            if (validTagIds.length > 0) {
              await prisma.itemTag.createMany({
                data: validTagIds.map((tagId) => ({ itemId: id, tagId })),
              })
            }
          }
          if (vendorIds?.length) {
            const existingVendors = await prisma.vendor.findMany({
              where: { id: { in: vendorIds }, householdId },
              select: { id: true },
            })
            const validVendorIds = existingVendors.map((v) => v.id)
            if (validVendorIds.length > 0) {
              await prisma.itemVendor.createMany({
                data: validVendorIds.map((vendorId) => ({ itemId: id, vendorId })),
              })
            }
          }
          // SCOPED — same reason as `bulkCreateItems`' closing read above.
          const full = await prisma.item.findUniqueOrThrow({
            where: { id, householdId },
            include: { tags: true, vendors: true },
          })
          results.push(itemToGraphQL(full))
        }
        return results
      })
    },

    bulkUpsertTags: async (_, { tags }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (tags.length === 0) return []
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'tag', tags, householdId)
      // The two ids a tag ATTACHES, checked against the household (households
      // H3a task 3.9). Before this, both went into the row as given, so a
      // tag of the caller's could point at another household's tag type, or
      // hang under another household's tag.
      //
      // A tag whose `typeId` or `parentId` is not usable is SKIPPED, not
      // refused, exactly as `bulkCreateTags` skips it. A partial backup can
      // name a type or a parent that is gone, and "not yours" must look the
      // same as "not there", or the mutation becomes a probe for another
      // household's ids.
      //
      // `typeId`: a tag type of the caller's household.
      const typeIds = [...new Set(tags.map((t) => t.typeId))]
      const ownTypes = await prisma.tagType.findMany({
        where: { id: { in: typeIds }, householdId },
        select: { id: true },
      })
      const ownTypeIds = new Set(ownTypes.map((t) => t.id))
      // `parentId`: a tag of the caller's household, or a tag of this payload
      // that is written before it. So the tags are written in passes, parents
      // first, as in `bulkCreateTags`. That also gives Postgres the parent row
      // before the child's foreign key needs it, which the old single
      // `Promise.all` did not.
      const parentIds = [...new Set(tags.flatMap((t) => (t.parentId ? [t.parentId] : [])))]
      const ownParents =
        parentIds.length === 0
          ? []
          : await prisma.tag.findMany({
              where: { id: { in: parentIds }, householdId },
              select: { id: true },
            })
      const written = new Set<string>([...ownIds, ...ownParents.map((t) => t.id)])
      let remaining = tags.filter((t) => ownTypeIds.has(t.typeId))
      return withCatalogEvent(ctx, householdId, async (changed) => {
        while (remaining.length > 0) {
          const batch = remaining.filter((t) => !t.parentId || written.has(t.parentId))
          if (batch.length === 0) break // a cycle or a parent nobody can use: skip the rest
          // Before the writes: they run in parallel, so when one fails others
          // may already be saved.
          changed()
          await Promise.all(
            batch.map((tag) => {
              const { id, userId: _u, familyId: _f, ...rest } = tag as unknown as Record<string, unknown>
              const data = { ...rest }
              // `householdId` is in `create` and NOT in `update` — the shape
              // `bulkUpsertLocations` uses. A row's owner is not something an
              // import may rewrite, and leaving the column out of `update` means a
              // future edit that drops the guard above cannot reassign a row by
              // accident.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return prisma.tag.upsert({ where: { id: id as string }, create: { id: id as string, ...data, householdId } as any, update: data as any })
            }),
          )
          for (const t of batch) written.add(t.id)
          const batchIds = new Set(batch.map((t) => t.id))
          remaining = remaining.filter((t) => !batchIds.has(t.id))
        }
        // SCOPED — same reason as `bulkCreateTags`' closing read.
        const inserted = await prisma.tag.findMany({ where: { id: { in: tags.map((t) => t.id) }, householdId } })
        return inserted as unknown as Tag[]
      })
    },

    bulkUpsertTagTypes: async (_, { tagTypes }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (tagTypes.length === 0) return []
      await requireOwnRowIdsOrUnclaimed(ctx, 'tagType', tagTypes, householdId)
      return withCatalogEvent(ctx, householdId, async (changed) => {
        // Before the writes: they run in parallel, so when one fails others
        // may already be saved. The list is not empty (see the top).
        changed()
        await Promise.all(
          tagTypes.map((tt) => {
            const { id, userId: _u, familyId: _f, ...rest } = tt as unknown as Record<string, unknown>
            const data = { ...rest, color: (rest as { color: string }).color as TagColor }
            // `householdId` is in `create` and NOT in `update` — the shape
            // `bulkUpsertLocations` uses. A row's owner is not something an
            // import may rewrite, and leaving the column out of `update` means a
            // future edit that drops the guard above cannot reassign a row by
            // accident.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return prisma.tagType.upsert({ where: { id: id as string }, create: { id: id as string, ...data, householdId } as any, update: data as any })
          }),
        )
        // SCOPED — same reason as `bulkCreateTags`' closing read.
        const inserted = await prisma.tagType.findMany({ where: { id: { in: tagTypes.map((t) => t.id) }, householdId } })
        return inserted as unknown as TagType[]
      })
    },

    bulkUpsertVendors: async (_, { vendors }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (vendors.length === 0) return []
      await requireOwnRowIdsOrUnclaimed(ctx, 'vendor', vendors, householdId)
      return withCatalogEvent(ctx, householdId, async (changed) => {
        // Before the writes, for the same reason as `bulkUpsertTagTypes`.
        changed()
        await Promise.all(
          vendors.map((v) => {
            const { id, userId: _u, familyId: _f, ...rest } = v as unknown as Record<string, unknown>
            const data = { ...rest }
            // `householdId` is in `create` and NOT in `update` — the shape
            // `bulkUpsertLocations` uses. A row's owner is not something an
            // import may rewrite, and leaving the column out of `update` means a
            // future edit that drops the guard above cannot reassign a row by
            // accident.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return prisma.vendor.upsert({ where: { id: id as string }, create: { id: id as string, ...data, householdId } as any, update: data as any })
          }),
        )
        // SCOPED — same reason as `bulkCreateTags`' closing read.
        const inserted = await prisma.vendor.findMany({ where: { id: { in: vendors.map((v) => v.id) }, householdId } })
        return inserted as unknown as Vendor[]
      })
    },

    bulkUpsertRecipes: async (_, { recipes }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (recipes.length === 0) return []
      // Same guard, same position and same reason as `bulkUpsertItems` above.
      await requireOwnRowIdsOrUnclaimed(ctx, 'recipe', recipes, householdId)
      return withCatalogEvent(ctx, householdId, async (changed) => {
        const results: Recipe[] = []
        for (const recipe of recipes) {
          const { id, items, lastCookedAt } = recipe
          const data = {
            name: recipe.name,
            lastCookedAt: lastCookedAt ? new Date(lastCookedAt) : undefined,
          }
          await prisma.recipe.upsert({
            where: { id },
            create: { id, ...data, householdId },
            // `householdId` is in `create` and NOT in `update` — same shape and same
            // reason as `bulkUpsertItems` above.
            update: data,
          })
          changed()
          // SCOPED since plan task 8 (by `householdId` since households H3a task 3.7), where there was NO check at
          // all. An ingredient the caller does not own is SKIPPED and the recipe
          // still lands — skip, not refuse, for the reason spelled out above
          // `bulkCreateItems`' tag filter.
          //
          // `recipeItem.deleteMany` above is keyed on `recipeId`, which the
          // row-id guard has already proved is the caller's own recipe, so this
          // filter is not what protects a stranger's `RecipeItem` rows.
          if (items != null) {
            await prisma.recipeItem.deleteMany({ where: { recipeId: id } })
            if (items.length) {
              const ownItems = await prisma.item.findMany({
                where: { id: { in: items.map((i) => i.itemId) }, householdId },
                select: { id: true },
              })
              const ownItemIds = new Set(ownItems.map((i) => i.id))
              const validItems = items.filter((i) => ownItemIds.has(i.itemId))
              if (validItems.length > 0) {
                await prisma.recipeItem.createMany({
                  data: validItems.map((i) => ({ recipeId: id, itemId: i.itemId, defaultAmount: i.defaultAmount })),
                })
              }
            }
          }
          // SCOPED — same reason as `bulkCreateItems`' closing read above.
          const full = await prisma.recipe.findUniqueOrThrow({ where: { id, householdId }, include: { items: true } })
          results.push(full as unknown as Recipe)
        }
        return results
      })
    },

    bulkUpsertInventoryLogs: async (_, { logs }, ctx) => {
      const userId = requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (logs.length === 0) return []
      // Same pre-check as bulkCreateInventoryLogs: every location the payload
      // names is verified before the first write.
      const locationIdFor = await resolveLogLocations(ctx, logs, householdId)
      // The same log-id guard as `bulkCreateInventoryLogs`, in the same place:
      // after the location check, so a forbidden location is still refused
      // first. Without it an `upsert` on a bare `{ id }` with `userId` inside
      // `update` OVERWROTE another account's log and took ownership of it.
      await requireOwnRowIdsOrUnclaimed(ctx, 'inventoryLog', logs, householdId)
      const results: InventoryLog[] = []
      // ── THE LIVE EVENT (households H3c-2 task D.2) ──
      //
      // `LOG` for the location of every row written, published in `finally`,
      // the same way as the cart imports above: the rows are saved one by
      // one, not in one transaction, so a batch that throws part-way has
      // already saved some rows and other tabs must hear about them.
      // The location is the SAVED row's: an update keeps the stored log's
      // location (see `update` below), which can differ from the payload's.
      const touched: ChangedLocation[] = []
      try {
        for (const log of logs) {
          // `locationId` MUST come out of `rest` here. `data` below is the
          // `update` payload, and a `locationId` left in `rest` would move an
          // existing log to the payload's location on every re-import.
          const { id, occurredAt, note, logParams, locationId, ...rest } = log
          const data = {
            ...rest,
            occurredAt: new Date(occurredAt),
            note: note ?? undefined,
            ...(logParams ? { logParams: logParams as Prisma.InputJsonValue } : {}),
          }
          // SCOPED (by `householdId` since households H3a task 3.7), and SKIPPED
          // when it does not resolve. New in plan task 8: this mutation had NO item check at all, so a log of the
          // caller's could be attached to a STRANGER's item, and an `itemId` no
          // row held reached Postgres as an unhandled foreign-key `P2003`.
          //
          // The `continue` matches `bulkCreateInventoryLogs` above exactly, so
          // the two siblings now agree on what an unusable `itemId` means: the
          // log is dropped, not refused, and the rest of the batch still lands.
          const itemExists = await prisma.item.findFirst({ where: { id: (rest as { itemId: string }).itemId, householdId }, select: { id: true } })
          if (!itemExists) continue
          const upserted = await prisma.inventoryLog.upsert({
            where: { id },
            // `userId` and `locationId` live in `create` only, each for its own
            // reason.
            //
            // `userId`: a row's owner is not something an import may rewrite.
            // Leaving it out means a future edit that drops the guard above
            // still cannot hand another account's log to the importer. Same
            // shape as `bulkUpsertLocations`.
            //
            // `locationId`: an upsert that carried it into `update` would MOVE an
            // existing log on every re-import. The value is the payload's own,
            // verified above.
            create: { id, ...data, userId, locationId: locationIdFor(locationId) },
            update: data,
          })
          results.push(upserted as unknown as InventoryLog)
          touched.push({ locationId: upserted.locationId })
        }
      } finally {
        await publishChange(ctx, ['LOG'], touched)
      }
      // NO CLOSING READ — same reason as `bulkCreateInventoryLogs` above. The
      // returned row is the one `inventoryLog.upsert` wrote, and the guard is
      // what makes it the caller's own. Design decision 5.
      return results
    },

    bulkUpsertShoppingCarts: async (_, { carts }, ctx) => {
      const userId = requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (carts.length === 0) return []
      // Same pre-check as bulkCreateShoppingCarts: every location the payload's
      // cart ids name is verified before the first write.
      const locationIdFor = await resolveCartLocations(ctx, carts, householdId)
      // The same cart-id guard as `bulkCreateShoppingCarts`, in the same
      // place: after the location check, so a stranger's live location is
      // still refused first. Without it an `upsert` on a bare `{ id }` with
      // `userId` inside `update` OVERWROTE another account's cart and took
      // ownership of it.
      await requireOwnRowIdsOrUnclaimed(ctx, 'cart', carts, householdId)
      const results: Cart[] = []
      const touched: ChangedLocation[] = []
      try {
        for (const cart of carts) {
          const { id, lastPurchasedAt } = cart
          // `data` is built field by field, never spread from the input, so
          // neither `userId` nor `locationId` can reach the `update` payload by
          // accident. Keep it that way: see the comment on `create` below.
          const data = {
            lastPurchasedAt: lastPurchasedAt ? new Date(lastPurchasedAt as string) : undefined,
          }
          const upserted = await prisma.cart.upsert({
            where: { id },
            // `locationId` lives in `create` only. (`Cart.userId` lived there
            // too until households H3b task B.3 dropped the column.)
            //
            // `locationId`: the same reason as the log upsert above — a
            // re-import must not MOVE an existing cart. The value comes from
            // the cart's own id, verified above.
            create: { id, ...data, locationId: locationIdFor(id) },
            update: data,
          })
          results.push(upserted as unknown as Cart)
          // The row's own column: an existing cart keeps its location.
          touched.push({ locationId: upserted.locationId })
        }
      } finally {
        await publishChange(ctx, ['CART'], touched)
      }
      // NO CLOSING READ — same reason as the two creates above. The returned
      // row is the one `cart.upsert` wrote, and the guard is what makes it the
      // caller's own. Design decision 5.
      return results
    },

    bulkUpsertCartItems: async (_, { cartItems }, ctx) => {
      const userId = requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (cartItems.length === 0) return []
      // Authorizes every cart-item id the payload names BEFORE the first
      // write — the same guard as `bulkCreateCartItems`. Without it an
      // `upsert` on a bare `{ id }` overwrote another account's cart item.
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'cartItem', cartItems, householdId)
      // The cart and the item of every row, resolved before the first write,
      // and SKIPPED when they do not resolve — as in `bulkCreateCartItems`,
      // so `replace` and `skip` give the same answer for a partial backup
      // whose cart or item is gone. New in plan task 8: this mutation had NO
      // check on either one, so `replace` could write into a STRANGER's cart.
      const parents = await resolveCartItemParents(ctx, cartItems, householdId)
      const usable = cartItems.filter((ci) => parents.usable(ci.cartId, ci.itemId))

      // ── The `replace` strategy (households H3b decision P3, design D5) ──
      //
      // 1. Rows of one `(cartId, itemId)` pair are summed first.
      // 2. The amount REPLACES the cloud row of that pair, or a new row is
      //    made. The write is found by the PAIR, never by the payload's id.
      //
      // What that gives for an id the caller already owns:
      //
      // | The stored row of that id is at | Result |
      // |---|---|
      // | the pair the payload names | its `quantity` is replaced. Nothing else changes |
      // | another pair | that row is left alone; the payload's pair gets the amount |
      //
      // The second row is the "move" case. An update never moves a row to
      // another `cartId` or `itemId` (design D5): with one row per pair, a
      // move could land on a pair that already has a row, which is a P2002,
      // and a move between carts is not something a backup can ask for. So
      // the payload is taken for what it says, "this cart holds this much of
      // this item", and written to that pair. Until task B.7 this mutation
      // moved the row, to match local mode's Dexie `bulkPut` (design decision
      // 3 of the import ownership guard). Skipping the row instead was
      // rejected: it would drop the amount the backup holds for that pair.
      //
      // `update` writes ONLY `quantity`. Not `cartId` or `itemId` (no move),
      // and not `userId`: "added by" is not something an import may rewrite,
      // and a future edit that drops the guard must still not be able to
      // reassign a row.
      //
      // One `upsert` on the pair, for the same reason as in
      // `bulkCreateCartItems`: no P2002 from a concurrent add, no lost write.
      const taken = new Set(ownIds)
      const results: CartItem[] = []
      const touched: ChangedLocation[] = []
      try {
        for (const group of mergeCartItemRows(usable)) {
          const { cartId, itemId, quantity } = group
          // Never an id a row holds: in the move case that row is elsewhere,
          // and creating under its id would raise P2002.
          const id = takeNewCartItemId(group, taken)
          const written = await prisma.cartItem.upsert({
            where: { cartId_itemId: { cartId, itemId } },
            create: { ...(id === undefined ? {} : { id }), cartId, itemId, quantity, userId },
            update: { quantity },
          })
          results.push(written as unknown as CartItem)
          touched.push(parents.locationOf(cartId))
        }
      } finally {
        await publishChange(ctx, ['CART'], touched)
      }
      // NO CLOSING READ — same reason as the three above. Design decision 5.
      return results
    },

    bulkCreateShelves: async (_, { shelves }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (shelves.length === 0) return []
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'shelf', shelves, householdId)
      const ids = shelves.map((s) => s.id)
      // Rebuilt from the guard's result, not from a fresh read. The read this
      // replaces was UNSCOPED, so a stranger's row counted as "already
      // exists" and the caller's own shelf was silently dropped.
      const existingIds = ownIds
      const toCreate = shelves.filter((s) => !existingIds.has(s.id))
      return withCatalogEvent(ctx, householdId, async (changed) => {
        if (toCreate.length > 0) {
          // Only the household's ids reach the row. See `householdShelfRefs`.
          const refsOf = await householdShelfRefs(householdId, toCreate)
          const { count } = await prisma.shelf.createMany({
            data: toCreate.map((shelf) => {
              const { id, createdAt, updatedAt, filterConfig: _f, itemIds: _i, ...rest } = shelf
              const { itemIds, filterConfig } = refsOf(shelf)
              return {
                id,
                ...rest,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                filterConfig: filterConfig ? (filterConfig as any) : undefined,
                itemIds,
                createdAt: new Date(createdAt),
                updatedAt: new Date(updatedAt),
                householdId,
              }
            }),
            // `skipDuplicates` stays. After the guard it can only skip the
            // caller's own rows.
            skipDuplicates: true,
          })
          if (count > 0) changed()
        }
        // SCOPED — same reason as `bulkCreateTags`' closing read.
        const inserted = await prisma.shelf.findMany({ where: { id: { in: ids }, householdId } })
        return inserted as unknown as Shelf[]
      })
    },

    // Locations are imported by their own ids so that every OTHER imported row
    // — `ItemStock`, `Cart`, `InventoryLog` — can point at them by the id the
    // payload already uses. See `LocationInput` in schema/import.graphql for
    // why there is no `isDefault` field to honour.
    //
    // `updatedAt` is passed through, but whether the DATABASE keeps it is not
    // proven here. `Location.updatedAt` is `@updatedAt` (schema.prisma:251),
    // so the Prisma query engine may overwrite it with `now()`. What IS
    // checked: the JS client never inspects the field's `isUpdatedAt`
    // descriptor (`grep isUpdatedAt` over `runtime/library.js`, `client.js`
    // and `index.js` all return 0), so the value reaches the engine as given
    // and the engine decides. No unit test can settle it — every server test
    // runs against a hand-written fake, and no cloud E2E spec asserts a
    // preserved timestamp. The same open question applies to all 18 existing
    // bulk mutations: `Item`, `Shelf` and `ItemStock` are `@updatedAt` too and
    // their resolvers already pass explicit values. Worth knowing, not worth
    // blocking on: the cost either way is one timestamp, not a wrong row.
    bulkCreateLocations: async (_, { locations }, ctx) => {
      const userId = requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (locations.length === 0) return []
      // Refuses every id held by a location the caller has no role on, or by
      // a location of another household (households H4 task E.3), and
      // returns the ids that already exist. After it an id is one of two
      // things: a location of the target household the caller holds a role
      // on, or free.
      const existing = await requireOwnLocationIdsOrUnclaimed(ctx, locations, 'participant', householdId)
      const results: Location[] = []
      // ── THE LIVE EVENT (households H3c-2 task D.3) ──
      //
      // One household-level `LOCATION` event per household a location was
      // CREATED in, published in `finally`: the rows are saved one by one,
      // not in one transaction, so a batch that throws part-way has already
      // saved some. A skipped row writes nothing and adds no household.
      const changed = new Set<string>()
      try {
        for (const location of locations) {
          if (existing.has(location.id)) {
            // "Skip conflicts": the stored row is returned unchanged, and no
            // role row is added. UNSCOPED read: the pre-check above already
            // proved the caller holds a role on this id AND that it is in the
            // target household, so a `householdId` filter here would change
            // nothing. (Until households H4 task E.3 the pre-check did not
            // check the household, and such a filter would have missed a
            // location of another household the caller shares.)
            const row = await prisma.location.findUnique({ where: { id: location.id } })
            if (row) results.push(locationToGraphQL(row as unknown as PrismaLocation))
            continue
          }
          const row = await createImportedLocation(ctx, userId, householdId, location)
          changed.add(row.householdId)
          // A second payload row with the same id is now a skip, not a P2002.
          existing.add(location.id)
          results.push(locationToGraphQL(row as unknown as PrismaLocation))
        }
      } finally {
        for (const changedHousehold of changed) {
          await publishHouseholdChange(ctx, ['LOCATION'], changedHousehold)
        }
      }
      return results
    },

    // `updatedAt` is passed through from the payload, and whether it SURVIVES
    // is unresolved. `ItemStock.updatedAt` is `@updatedAt` in Prisma
    // (schema.prisma:277), and `grep isUpdatedAt` over the Prisma client
    // runtime returns 0 — so the JS client never inspects the descriptor and
    // the Rust engine decides. No test here can settle it: every server test
    // runs against a hand-written fake, and no cloud E2E spec asserts a
    // preserved timestamp. Task 5 recorded the same open question for
    // `bulkUpsertLocations`, and it already applies to the 18 older bulk
    // mutations — `Item`, `Shelf` and `ItemStock` are all `@updatedAt` and
    // their resolvers already pass explicit values. Recorded, not claimed. The
    // cost either way is one timestamp, not a wrong row.
    /**
     * "Skip conflicts" import of per-location stock.
     *
     * Two kinds of conflict, not one. The house style only knows the first:
     *
     *  - the payload's `id` is already taken → skip, keep the stored row
     *  - the payload's `(itemId, locationId)` PAIR is already taken, by a row
     *    with a DIFFERENT id → also skip. `@@unique([itemId, locationId])`
     *    (schema.prisma:282) means the insert would raise P2002 otherwise, and
     *    an unhandled P2002 under the "clear & import" strategy arrives AFTER
     *    `clearAllData` has run, leaving the account empty and the import dead.
     *
     * Skipping is the right answer for BOTH under this strategy, and it
     * matches local: `importItemStocks`
     * (apps/web/src/lib/importData.ts:1127-1148) only ever imports stock whose
     * ITEM was actually written, so "a skipped conflicting item keeps the
     * stock it already has" is already the local rule.
     *
     * `seen` catches the same pair appearing TWICE in one payload, which the
     * database lookup above cannot: neither row is stored yet when the first
     * is examined. First row wins, consistent with skip-conflicts.
     */
    bulkCreateItemStocks: async (_, { itemStocks }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (itemStocks.length === 0) return []
      await requireOwnItemStockRefs(ctx, itemStocks, householdId)
      const results: ItemStock[] = []
      const seen = new Set<string>()
      // ── THE LIVE EVENT (households H3c-2 task D.2) ──
      //
      // `STOCK` for the location of every row written, published in
      // `finally`, the same way as the cart imports: the rows are saved one by
      // one, not in one transaction, so a batch that throws part-way has
      // already saved some rows and other tabs must hear about them.
      // A row skipped as already there is not written, so it adds no location.
      const touched: ChangedLocation[] = []
      try {
        for (const stock of itemStocks) {
          const { id, itemId, locationId, createdAt, updatedAt, dueDate, ...quantities } = stock
          // NUL as the separator, not ':'. Neither id generator makes one
          // (`crypto.randomUUID()` locally, `@default(cuid())` in cloud) but
          // `ItemInput.id` is stored verbatim, so a hand-edited backup can
          // supply any text — and a ':' separator would make ("a:b", "c") and
          // ("a", "b:c") the same key. Task 4 hit the same hazard in cart ids.
          const pair = `${itemId}\u0000${locationId}`
          if (seen.has(pair)) continue
          seen.add(pair)
          const existingById = await prisma.itemStock.findUnique({ where: { id } })
          if (existingById) {
            results.push(itemStockToGraphQL(existingById))
            continue
          }
          const existingByPair = await prisma.itemStock.findFirst({
            where: { itemId, locationId },
          })
          if (existingByPair) {
            results.push(itemStockToGraphQL(existingByPair))
            continue
          }
          const row = await prisma.itemStock.create({
            data: {
              id,
              itemId,
              locationId,
              ...quantities,
              dueDate: dueDate ? new Date(dueDate) : null,
              createdAt: new Date(createdAt),
              updatedAt: new Date(updatedAt),
            },
          })
          results.push(itemStockToGraphQL(row))
          touched.push({ locationId: row.locationId })
        }
      } finally {
        await publishChange(ctx, ['STOCK'], touched)
      }
      return results
    },

    bulkUpsertShelves: async (_, { shelves }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (shelves.length === 0) return []
      await requireOwnRowIdsOrUnclaimed(ctx, 'shelf', shelves, householdId)
      // Only the household's ids reach the row. See `householdShelfRefs`.
      const refsOf = await householdShelfRefs(householdId, shelves)
      return withCatalogEvent(ctx, householdId, async (changed) => {
        // Before the writes, for the same reason as `bulkUpsertTagTypes`.
        changed()
        await Promise.all(
          shelves.map((shelf) => {
            const { id, createdAt, updatedAt, filterConfig: _f, itemIds: _i, ...rest } = shelf
            const { itemIds, filterConfig } = refsOf(shelf)
            const data = {
              ...rest,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              filterConfig: filterConfig ? (filterConfig as any) : undefined,
              itemIds,
              createdAt: new Date(createdAt),
              updatedAt: new Date(updatedAt),
            }
            // `householdId` is in `create` and NOT in `update` — the shape
            // `bulkUpsertLocations` uses. A row's owner is not something an
            // import may rewrite, and leaving the column out of `update` means a
            // future edit that drops the guard above cannot reassign a row by
            // accident.
            return prisma.shelf.upsert({ where: { id }, create: { id, ...data, householdId }, update: data })
          }),
        )
        // SCOPED — same reason as `bulkCreateTags`' closing read.
        const inserted = await prisma.shelf.findMany({ where: { id: { in: shelves.map((s) => s.id) }, householdId } })
        return inserted as unknown as Shelf[]
      })
    },

    bulkUpsertLocations: async (_, { locations }, ctx) => {
      const userId = requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (locations.length === 0) return []
      // `organizer` on an existing id, because the update below renames it.
      // See `requireOwnLocationIdsOrUnclaimed`.
      //
      // NOT ATOMIC PER ROW since task 3.9. The old single `upsert` per row is
      // now a pre-check, then a `create` or an `update`. Two known races:
      //
      //  - two imports of the same NEW id at the same time: both see the id
      //    as free, and the second `create` fails with `P2002`
      //  - a row deleted between the pre-check and its `update`: the update
      //    fails with `P2025`
      //
      // Accepted for now: the web app never sends this mutation.
      // `partitionPayload` (apps/web/src/lib/importData.ts) puts every
      // location on the CREATE pass and leaves `toUpsert.locations` empty,
      // and `importData.test.ts` (about line 2416) asserts
      // `BulkUpsertLocations` is not called on `replace`.
      //
      // Keep `householdId` OUT of the `update` below, for defence in depth:
      // a location's household is not something an import may move. Since
      // households H4 task E.3 the pre-check refuses an existing location of
      // another household (tested in `import-role-gate.resolver.test.ts` and
      // `location-live-publish.resolver.test.ts`), so every row updated here
      // is already in the target and a `householdId` in `update` would
      // write the same value again. If the pre-check is ever weakened, the
      // missing column is what stops an import from moving a location.
      const existing = await requireOwnLocationIdsOrUnclaimed(ctx, locations, 'organizer', householdId)
      const results: Location[] = []
      // ── THE LIVE EVENT (households H3c-2 task D.3) ──
      //
      // One household-level `LOCATION` event per household of a location
      // written, in `finally`, as in `bulkCreateLocations`. The household is
      // read from the SAVED row. Since households H4 task E.3 every row
      // written is in the target household (the pre-check refuses any
      // other), so this is one event for that household.
      const changed = new Set<string>()
      try {
        for (const location of locations) {
          const { id, name, order, createdAt, updatedAt } = location
          if (!existing.has(id)) {
            // A new id: the location, its `householdId` and the caller's
            // `organizer` row, in one transaction. Not an `upsert`: an upsert
            // cannot write the role row for its create branch only.
            const row = await createImportedLocation(ctx, userId, householdId, location)
            changed.add(row.householdId)
            // A second payload row with the same id is now an update.
            existing.add(id)
            results.push(locationToGraphQL(row as unknown as PrismaLocation))
            continue
          }
          // An existing location the caller organizes. Only its own columns
          // change, and NO role row is written or changed: the caller already
          // holds `organizer` here, and an import must not grant or change
          // anybody's role.
          //
          // `data` is NARROWER than the create, on purpose:
          //
          //  - no `householdId`: a location's household is not
          //    something an import may move. Leaving them out means a future
          //    edit that drops the pre-check cannot move a row by accident.
          const row = await prisma.location.update({
            where: { id },
            data: {
              name,
              order,
              createdAt: new Date(createdAt),
              updatedAt: new Date(updatedAt),
            },
          })
          changed.add(row.householdId)
          results.push(locationToGraphQL(row as unknown as PrismaLocation))
        }
      } finally {
        for (const changedHousehold of changed) {
          await publishHouseholdChange(ctx, ['LOCATION'], changedHousehold)
        }
      }
      return results
    },

    /**
     * "Replace conflicts" import of per-location stock.
     *
     * The pair conflict is resolved the way LOCAL resolves it, which is the
     * only way a backup can round-trip unchanged. `importItemStocks`
     * (apps/web/src/lib/importData.ts:1127-1148) deletes every stored row
     * holding an incoming row's `(itemId, locationId)` pair under a DIFFERENT
     * id, then `bulkPut`s the payload. So the payload's row wins and the stale
     * one is dropped. Doing it the other way round here — keeping the stored
     * row — would silently discard the quantities in the file the user chose
     * to restore.
     *
     * The stale row is always the caller's own: `requireOwnItemStockRefs` has
     * already proved the pair's location is one the caller holds, and nothing
     * else can hold that pair.
     *
     * `seen` makes the LAST of two payload rows on one pair win, which is what
     * `bulkPut` does for two rows with one id. Local keeps BOTH when the ids
     * differ, because the Dexie index `[itemId+locationId]`
     * (apps/web/src/db/index.ts:612) is NOT declared unique — only Postgres
     * enforces the pair. That asymmetry predates this mutation and cannot be
     * fixed here; a cloud row simply cannot exist twice on one pair.
     *
     * `update` is NARROWER than `create`, like `bulkUpsertLocations` and for a
     * closely related reason: `itemId` and `locationId` in `update` would MOVE
     * an existing row to another item or another location. The pre-check means
     * the row is the caller's own either way, so this is defence in depth
     * rather than the guard itself — but it is the shape the next reader should
     * copy, not the shared-`data` shape the other nine upserts use.
     */
    bulkUpsertItemStocks: async (_, { itemStocks }, ctx) => {
      requireAuth(ctx)
      // The role gate and the target household. See IMPORT ROLE GATE above.
      const householdId = await requireCatalogRole(ctx, 'manager')
      if (itemStocks.length === 0) return []
      await requireOwnItemStockRefs(ctx, itemStocks, householdId)
      const results: ItemStock[] = []
      // ── THE LIVE EVENT (households H3c-2 task D.2) ──
      //
      // `STOCK` for the location of every row written, published in
      // `finally`, the same way as the cart imports: the rows are saved one by
      // one, not in one transaction, so a batch that throws part-way has
      // already saved some rows and other tabs must hear about them.
      // Two locations can change for one row: the stale row deleted at the
      // payload's pair, and the saved row, which keeps its stored location
      // when the id already existed (`update` carries no `locationId`).
      const touched: ChangedLocation[] = []
      try {
        for (const stock of itemStocks) {
          const { id, itemId, locationId, createdAt, updatedAt, dueDate, ...quantities } = stock
          const state = {
            ...quantities,
            dueDate: dueDate ? new Date(dueDate) : null,
            createdAt: new Date(createdAt),
            updatedAt: new Date(updatedAt),
          }
          const stale = await prisma.itemStock.findFirst({ where: { itemId, locationId } })
          if (stale && stale.id !== id) {
            await prisma.itemStock.delete({ where: { id: stale.id } })
            touched.push({ locationId: stale.locationId })
          }
          const row = await prisma.itemStock.upsert({
            where: { id },
            create: { id, itemId, locationId, ...state },
            update: state,
          })
          results.push(itemStockToGraphQL(row))
          touched.push({ locationId: row.locationId })
        }
      } finally {
        await publishChange(ctx, ['STOCK'], touched)
      }
      return results
    },

    // -------------------------------------------------------------------------
    // Clear the household (households H3a, task 3.10; design *Purge*)
    // -------------------------------------------------------------------------
    //
    // Deletes the caller's household's catalog and every location of it, with
    // everything in them. Keeps the household, its members and their
    // household roles. Then makes "Home" again (decision H17).
    //
    // - Household role `owner` only: *Clear household* is owner only, and so
    //   is the `clear` import strategy that calls this (decision H17).
    // - Every filter is the household, or goes through the location, the
    //   item, the recipe or the cart. NONE goes by `userId`: "no path deletes
    //   rows because of who created them" (issue #320). So a log or a cart a
    //   co-member wrote in this household goes too.
    // - The household lock comes FIRST, before any delete. `deleteLocation`
    //   also takes it first. If this took it later, after the location delete
    //   had locked location rows, the two could wait on each other.
    // - "Home" is made in the SAME transaction, so a cleared household starts
    //   with one location (decision H13). Since H5 task F.7 a household MAY
    //   have no location (the last one can be deleted, and the web shows an
    //   empty screen), but *Clear household* still makes "Home", so the
    //   person can start again at once. If making it fails, every delete is
    //   rolled back.
    //
    // The deletes themselves are `deleteHouseholdData` in lib/household.ts
    // (households H6 task J.4, decision T64), shared with `deleteHousehold`.
    // Its comment says why the order is children before parents.
    // `purge-coverage.test.ts` reads that function's body.
    clearAllData: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireHousehold(ctx)
      // Prisma reads `{ householdId: undefined }` as NO filter, so every
      // delete below would empty its table for EVERY household. No text check
      // can see an `undefined` value, so refuse it here, before the role
      // check and before the transaction.
      if (!householdId) throw new Error('clearAllData: no household id')
      await requireHouseholdRole(ctx, householdId, 'owner')

      await prisma.$transaction(async (tx) => {
        await lockHousehold(tx, householdId)
        // The ordered delete of every data row of the household (decision
        // T64 of the H6 plan). Shared with `deleteHousehold`.
        await deleteHouseholdData(tx, householdId)
        await createFirstLocation(tx, {
          householdId,
          userId,
          name: firstLocationName(ctx.language ?? 'en'),
        })
        // The activity row (households H6 task J.2, decision T51), LAST, in
        // this transaction. The log is not in the delete list above, so the
        // clear keeps older rows. The organizer row on the new "Home" is part
        // of this one row and gets none of its own.
        await recordActivity(tx, { householdId, actorId: userId, action: 'HOUSEHOLD_CLEARED' })
      })
      // ── THE LIVE EVENT (households H3c-2 task D.3) ──
      //
      // After the commit. Both kinds are household-level (decision Q2):
      // `LOCATION` because every location went and "Home" came back, and
      // `CATALOG` because the catalog is empty now. `LOCATION` already makes
      // the web refetch every query (decision Q3), but the event says what
      // changed (decision Q1). No `CART`, `STOCK` or `LOG`: their locations
      // are gone (decision Q4).
      await publishHouseholdChange(ctx, ['LOCATION', 'CATALOG'], householdId)
      return true
    },

    // -------------------------------------------------------------------------
    // Log a finished import (households H6 task J.2, owner decision O33-A)
    // -------------------------------------------------------------------------
    //
    // One `IMPORT` activity row with the counts the web sends. The same role
    // as the 22 import mutations (`manager` or higher, decision O7), checked
    // first. The counts are only shown in the log: every imported row was
    // already checked by the mutation that wrote it. It publishes nothing, so
    // it is in `publishesNothing` in `live-publish.guard.test.ts`.
    recordImport: async (_, { counts }, ctx) => {
      const userId = requireAuth(ctx)
      const householdId = await requireCatalogRole(ctx, 'manager')
      for (const [key, value] of Object.entries(counts)) {
        if (!Number.isInteger(value) || value < 0) {
          throw new GraphQLError(`recordImport: the count "${key}" must be 0 or more.`, {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }
      }
      await prisma.$transaction(async (tx) => {
        await recordActivity(tx, {
          householdId,
          actorId: userId,
          action: 'IMPORT',
          details: { counts: { ...counts } },
        })
      })
      return true
    },
  },
}
