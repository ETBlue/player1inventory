import { GraphQLError } from 'graphql'
import {
  fallbackImportLocation,
  householdOfLocation,
  type LocationRole,
  type OwnedModel,
  requireHousehold,
  requireHouseholdRole,
  requireLocationRole,
  requireOwnRowOrUnclaimed,
} from '../lib/authz.js'
import { parseCartId } from '@p1i/types'
import { createFirstLocation, firstLocationName, lockHousehold } from '../lib/household.js'
import { prisma } from '../lib/prisma.js'
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
 * Decide which location each imported inventory log belongs to, BEFORE any row
 * is written.
 *
 * An input `locationId` is attacker-controlled, so every id named by the
 * payload is verified through `requireLocationRole` — the one authorization
 * seam for location-scoped data (lib/authz.ts). A row naming a location the
 * caller does not hold makes the whole mutation fail with FORBIDDEN. It must
 * NOT fall back to the fallback location: a silent fallback would write the
 * log into a location the user never asked for and report success.
 *
 * Three things about the shape are deliberate:
 *
 *  - Each DISTINCT id is checked ONCE, not once per row. 500 logs across 3
 *    locations cost 3 checks.
 *  - The whole check runs before the write loop. These bulk resolvers are not
 *    transactional, so throwing from inside the loop would leave the rows
 *    already written behind. Checking first means a payload naming a forbidden
 *    location writes nothing at all.
 *  - The fallback location (`fallbackImportLocation`, lib/authz.ts, decision
 *    H12) is resolved only when some row omits `locationId`, so an import
 *    whose every row names a location does not look for one.
 *
 * `'participant'` is the role asked for because writing a log is a write, and
 * participant is the LOWEST location role that may write (organizer and
 * participant write, viewer reads — households design, *Location roles*).
 * Asking for `'organizer'` would deny a legitimate participant of a shared
 * location.
 */
async function resolveLogLocations(
  ctx: Context,
  logs: readonly { locationId?: string | null }[],
): Promise<(inputLocationId: string | null | undefined) => string> {
  const verified = new Set<string>()
  let fallbackLocationId: string | null = null

  for (const log of logs) {
    if (log.locationId) {
      if (verified.has(log.locationId)) continue
      await requireLocationRole(ctx, log.locationId, 'participant')
      verified.add(log.locationId)
    } else if (fallbackLocationId === null) {
      fallbackLocationId = await fallbackImportLocation(ctx)
    }
  }

  return (inputLocationId) => {
    if (inputLocationId) return inputLocationId
    if (fallbackLocationId === null) {
      // Unreachable: the loop above resolved the fallback for the first row
      // that omitted a location, and this function is only called with rows
      // from that same list. It is here to keep the return type `string`
      // rather than `string | null`, because an empty-string fallback would
      // write a broken foreign key instead of failing.
      throw new Error('resolveLogLocations: no fallback location resolved')
    }
    return fallbackLocationId
  }
}

/**
 * The location a cart id names, or `null` when the id carries no prefix at all.
 *
 * Since PR 3b `Cart.id` is `${locationId}:${vendorId | 'no-vendor'}`, so an
 * imported cart's location rides inside its own primary key and needs no input
 * field. `parseCartId` (`@p1i/types`) splits on the FIRST colon, which is why
 * this reuses it rather than splitting again: a vendor id that itself contains
 * ':' then survives, and this file cannot drift from the one rule.
 *
 * A vendor id with a colon is not hypothetical. Both id generators produce
 * colon-free ids — `crypto.randomUUID()` in local mode
 * (apps/web/src/db/operations.ts) and `@default(cuid())` in cloud
 * (schema.prisma:63) — but `bulkCreateVendors` stores `VendorInput.id`
 * verbatim, so a hand-edited backup can supply anything.
 *
 * `null` means ONLY "no colon in the id" — a pre-3b backup, whose carts were
 * keyed by vendor id alone. Everything else, `":vendor-1"` included, returns
 * the prefix as given, even when that prefix is the empty string. The caller
 * then asks the database whether any `Location` row holds it; see
 * `resolveCartLocations`. Task 4 special-cased `''` here so it could be refused
 * outright, which task 8 removed — one rule ("is this id held by a location?")
 * covers both shapes, and a hand-edited backup CAN create a location whose id
 * is `''` because `LocationInput.id` is stored verbatim too.
 */
function locationIdInCartId(cartId: string): string | null {
  if (!cartId.includes(':')) return null
  return parseCartId(cartId).locationId
}

/**
 * Decide which location each imported cart belongs to, BEFORE any row is
 * written. The cart twin of `resolveLogLocations` above, and the same three
 * shape decisions apply for the same reasons: each DISTINCT location checked
 * once, every check before the write loop (these resolvers are not
 * transactional), and the caller's fallback location resolved only if some
 * id needs it.
 *
 * ── THE RULE (task 8) ──
 *
 * Three cases per distinct id named by a cart id:
 *
 *  - no `Location` row holds it → write the cart to the caller's fallback
 *    location (`fallbackImportLocation`, decision H12)
 *  - a row holds it and the caller holds a role on it → write the cart there
 *  - a row holds it and the caller does NOT → `requireLocationRole` throws
 *    FORBIDDEN, and nothing is written at all
 *
 * Task 4 shipped only the last two: an id no row held was sent straight to
 * `requireLocationRole`, which refused it. That **broke cloud → cloud restore**
 * and the E2E gate caught it. A cloud export carries no `itemStocks`, so
 * `flattenPayloadForCloud` returns early (apps/web/src/lib/importData.ts:365)
 * and the cart ids keep their composite form naming the SOURCE account's
 * locations. The import calls `clearAllData` first, which deletes those very
 * `Location` rows, and nothing re-creates them — `bulkCreateLocations` exists
 * but no client calls it until PR 4b. So every cart id named a location that no
 * longer existed, the mutation threw, and the restore died with
 * "Import failed during Forbidden."
 * (`e2e/tests/settings/import-export-cloud.spec.ts:133`; the measurement is in
 * docs/features/locations/2026-10-02-cloud-locations-pr4-design.md under
 * *4a is NOT behaviour-neutral*.)
 *
 * The unclaimed branch is therefore reachable from three real payloads: a
 * pre-3b bare id, a cloud backup whose source locations were just deleted, and
 * a hand-edited id naming nothing. PR 4b uploads the payload's locations before
 * its carts, after which the second of those stops happening — but the first
 * and third remain, so the branch does not become dead code.
 *
 * ── THE ACCEPTED COST ──
 *
 * The unscoped `findUnique` tells the caller whether a location id exists at
 * all, which is an oracle `requireLocationRole` was written to deny: it reports
 * "not yours" and "does not exist" with the same error on purpose, so the
 * mutation cannot be used to probe another account's ids. Here the two answers
 * become distinguishable — an unclaimed id succeeds, a stranger's id is
 * refused.
 *
 * Accepted for the same reason task 5 accepted it in
 * `requireOwnLocationIdsOrUnclaimed`: the alternative is worse. Letting the
 * write proceed leaks the same fact through an unhandled foreign-key error
 * AFTER a partial write, and these resolvers are not transactional, so that
 * partial write stays on disk. The query reads one column, `id`, and makes no
 * authorization decision; the decision is still entirely
 * `requireLocationRole`'s (lib/authz.ts), never an inline comparison of
 * a row's scope column against the caller (root CLAUDE.md, Authorization).
 *
 * Why this is not `requireOwnLocationIdsOrUnclaimed` itself: for
 * `LocationInput` an unclaimed id simply means "free to create". Here the
 * resolver must send the carts of an unclaimed id to the fallback location,
 * and map each cart id to the location it is written to. Same two-step
 * pattern — unscoped existence check, then `requireLocationRole` — with a
 * different result.
 *
 * `'participant'` for the same reason as every other helper here: it is the
 * LOWEST location role that may write, so a legitimate participant of a
 * shared location is not denied.
 */
async function resolveCartLocations(
  ctx: Context,
  carts: readonly { id: string }[],
): Promise<(cartId: string) => string> {
  // Named location id → the location the cart is actually written to. Either
  // the named id itself (it exists and the caller holds a role on it) or the
  // caller's fallback location (no row holds it). One entry per DISTINCT named id, so 500 carts
  // across 3 locations cost 3 existence checks, not 500.
  const resolved = new Map<string, string>()
  let fallbackLocationId: string | null = null

  // Resolved at most once per mutation, and only when some id needs it, so an
  // import whose every cart names a live location of the caller's never looks
  // for a fallback.
  async function ensureFallback(): Promise<string> {
    if (fallbackLocationId === null) {
      fallbackLocationId = await fallbackImportLocation(ctx)
    }
    return fallbackLocationId
  }

  for (const cart of carts) {
    const named = locationIdInCartId(cart.id)
    if (named === null) {
      await ensureFallback()
      continue
    }
    if (resolved.has(named)) continue
    // UNSCOPED on purpose, and only `id` is selected. The question is "is this
    // primary key taken", which is not an authorization question and has no
    // user to scope by. See the block comment above for the cost.
    const taken = await prisma.location.findUnique({
      where: { id: named },
      select: { id: true },
    })
    if (taken) {
      await requireLocationRole(ctx, named, 'participant')
      resolved.set(named, named)
    } else {
      resolved.set(named, await ensureFallback())
    }
  }

  return (cartId) => {
    const named = locationIdInCartId(cartId)
    const target = named === null ? fallbackLocationId : resolved.get(named)
    if (target == null) {
      // Unreachable: the loop above resolved every id in this list, and this
      // function is only called with ids from that same list. It is here to
      // keep the return type `string` rather than `string | undefined`,
      // because an empty-string fallback would write a broken foreign key
      // instead of failing.
      throw new Error('resolveCartLocations: no location resolved for this cart')
    }
    return target
  }
}

/**
 * Authorize every location id a payload names, BEFORE any row is written.
 * Returns the ids of the locations that already exist (and on which the
 * caller holds `role` or higher).
 *
 * `LocationInput.id` is attacker-controlled and `Location.id` is a GLOBAL
 * primary key, so an id in the payload can name a row of another household.
 * Each distinct id falls into one of three cases:
 *
 *  - it exists and the caller holds `role` or higher on it → in the returned
 *    set, so `bulkCreate` skips it and `bulkUpsert` updates it
 *  - it exists and the caller does NOT → `requireLocationRole` throws
 *    FORBIDDEN, and nothing is written at all
 *  - it does not exist → not in the set, free to create
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
): Promise<Set<string>> {
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
      await requireLocationRole(ctx, id, role)
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
  userId: string,
  householdId: string,
  input: { id: string; name: string; order: number; createdAt: string; updatedAt: string },
): Promise<PrismaLocation> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
}

/**
 * Authorize every row id an account-scoped payload names, BEFORE any row is
 * written. Returns the ids the caller ALREADY OWNS.
 *
 * This is the account-scoped twin of `requireOwnLocationIdsOrUnclaimed` above.
 * It serves the nine models in `OwnedModel` (lib/authz.ts) — the models that
 * belong to no location, so `requireLocationRole` cannot reach them. Six of
 * them (the catalog) belong to a household; `InventoryLog`, `Cart` and
 * `CartItem` still carry a `userId`.
 *
 * Every `id` in an import payload is attacker-controlled, and each of these
 * primary keys is GLOBAL with no `userId` in it. So an id in the payload can
 * name a row belonging to somebody else. `requireOwnRowOrUnclaimed` sorts each
 * distinct id into one of three cases:
 *
 *  - it exists and is the caller's → in the returned set, so `bulkCreate` skips
 *    it and `bulkUpsert` replaces it
 *  - it exists and is somebody else's → it THROWS `FORBIDDEN`, and nothing is
 *    written at all
 *  - it exists nowhere → not in the set, free to create
 *
 * The AUTHORIZATION decision lives entirely in `requireOwnRowOrUnclaimed`.
 * Nothing here compares a row's `userId` to the caller's, which root CLAUDE.md
 * forbids.
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
): Promise<Set<string>> {
  const own = new Set<string>()
  const checked = new Set<string>()
  for (const { id } of rows) {
    if (checked.has(id)) continue
    checked.add(id)
    if ((await requireOwnRowOrUnclaimed(ctx, model, id)) === 'own') own.add(id)
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
 *  - `locationId` — where the row will be WRITTEN. Must exist and the caller
 *    must hold a role on it, so `requireLocationRole` is called
 *    unconditionally. There is no "unclaimed id is free" case as there is for
 *    `LocationInput`: an id no `Location` row holds is a broken foreign key,
 *    not a new location.
 *  - `itemId` — the row's other parent. `Item` belongs to a household (since
 *    households H3a task 3.7), so the check is a SCOPED query
 *    (`where: { id, householdId }`) and never a comparison of a fetched row's
 *    `householdId` against the caller's, which root CLAUDE.md forbids.
 *  - `id` — the row's own primary key, GLOBAL and with no `userId` in it. If a
 *    row already holds it, that row's OWN location must be one the caller
 *    holds. This is the check `requireOwnLocationIdsOrUnclaimed` cannot serve:
 *    there the id being checked IS a location id; here it is a stock id whose
 *    location has to be read out of the stored row first.
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
): Promise<void> {
  const householdId = await requireHousehold(ctx)
  const checkedLocations = new Set<string>()
  for (const { locationId } of stocks) {
    if (checkedLocations.has(locationId)) continue
    checkedLocations.add(locationId)
    await requireLocationRole(ctx, locationId, 'participant')
  }

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
    // AUTHORIZATION decision is made entirely by `requireLocationRole` below,
    // the one seam this series routes location checks through.
    const taken = await prisma.itemStock.findUnique({
      where: { id },
      select: { locationId: true },
    })
    if (taken) await requireLocationRole(ctx, taken.locationId, 'participant')
  }
}

/**
 * Decide, BEFORE any row is written, which imported cart items may be written:
 * the cart must be the caller's, and the item must be an item of the
 * household of the CART's location (households H3a task 3.9). Returns a
 * function that answers that for one `(cartId, itemId)` pair.
 *
 * Why the cart's location, not the caller's household. Until task 3.9 the
 * item was checked against `requireHousehold(ctx)`, the caller's household.
 * Today that is the same household, because a person is in one household and
 * a cart is the caller's own. Once a person can be in two households (H5), it
 * is not: a cart row could then put household A's item into a cart at
 * household B's location, and `checkout` buys it into B's stock, because
 * `checkout` trusts the item ids in cart rows. `addToCart` checks the item
 * against the cart's location since task 3.8; this is the import twin.
 *
 * The order of the checks is rule 12 of the H3a plan:
 *
 *  1. The cart, scoped by `userId` (until H3b). A cart that is not the
 *     caller's, or is gone, makes its rows SKIPPED.
 *  2. The location role on the cart's location, `participant`, through
 *     `requireLocationRole`. A cart of the caller's at a location they hold
 *     no role on any more THROWS FORBIDDEN for the whole batch, the same
 *     refusal `resolveCartLocations` gives a stranger's location. Nobody can
 *     reach this before H5.
 *  3. The item, scoped by the household of the cart's location
 *     (`householdOfLocation`). An item of another household, or one that is
 *     gone, makes its row SKIPPED.
 *
 * Steps 1 and 3 SKIP rather than refuse, as they did before: a partial backup
 * legitimately names a cart or an item that is gone, and "not yours" must
 * look the same as "not there". So this does not call `requireLocationItems`,
 * which throws; it reads the same household with `householdOfLocation` and
 * filters.
 *
 * Each distinct cart, location and (household, item) pair is read once.
 */
async function resolveCartItemParents(
  ctx: Context,
  cartItems: readonly { cartId: string; itemId: string }[],
): Promise<(cartId: string, itemId: string) => boolean> {
  const userId = requireAuth(ctx)

  // cart id → the household of its location, or null when the cart is not
  // the caller's.
  const cartHousehold = new Map<string, string | null>()
  const locationHousehold = new Map<string, string>()
  for (const { cartId } of cartItems) {
    if (cartHousehold.has(cartId)) continue
    const cart = await prisma.cart.findFirst({
      where: { id: cartId, userId },
      select: { id: true, locationId: true },
    })
    if (!cart) {
      cartHousehold.set(cartId, null)
      continue
    }
    let householdId = locationHousehold.get(cart.locationId)
    if (householdId === undefined) {
      // The role FIRST, then the household (rule 12): `householdOfLocation`
      // reads any location, so run first it would tell a stranger which
      // location ids exist.
      await requireLocationRole(ctx, cart.locationId, 'participant')
      householdId = await householdOfLocation(cart.locationId)
      locationHousehold.set(cart.locationId, householdId)
    }
    cartHousehold.set(cartId, householdId)
  }

  // `${householdId}\u0000${itemId}` of every item that is a row of that
  // household. NUL as the separator, for the reason `bulkCreateItemStocks`
  // gives.
  const usable = new Set<string>()
  const byHousehold = new Map<string, Set<string>>()
  for (const { cartId, itemId } of cartItems) {
    const householdId = cartHousehold.get(cartId)
    if (!householdId) continue
    const ids = byHousehold.get(householdId) ?? new Set<string>()
    ids.add(itemId)
    byHousehold.set(householdId, ids)
  }
  for (const [householdId, ids] of byHousehold) {
    // SCOPED in SQL; no fetched row's `householdId` is compared here.
    const own = await prisma.item.findMany({
      where: { id: { in: [...ids] }, householdId },
      select: { id: true },
    })
    for (const { id } of own) usable.add(`${householdId}\u0000${id}`)
  }

  return (cartId, itemId) => {
    const householdId = cartHousehold.get(cartId)
    return !!householdId && usable.has(`${householdId}\u0000${itemId}`)
  }
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
// - The log and cart location fallbacks use `fallbackImportLocation`
//   (decision H12), since task 3.5.
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
// Still owed: logs and carts keep their `userId` scope until H3b and H4. No
// import role check is added: that is H4. (`clearAllData`'s owner check
// already makes the `clear` strategy owner only.)
export const importResolvers: Pick<Resolvers, 'Mutation'> = {
  Mutation: {
    // -------------------------------------------------------------------------
    // Bulk create — inserts records with original IDs, skips existing ones.
    // -------------------------------------------------------------------------
    bulkCreateItems: async (_, { items }, ctx) => {
      requireAuth(ctx)
      if (items.length === 0) return []
      const householdId = await requireHousehold(ctx)
      // Authorizes every id the payload names BEFORE the first write, and
      // returns the ids the caller ALREADY OWNS. A payload naming another
      // account's item id fails the whole mutation with nothing written.
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'item', items)
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
    },

    bulkCreateTags: async (_, { tags }, ctx) => {
      requireAuth(ctx)
      if (tags.length === 0) return []
      const householdId = await requireHousehold(ctx)
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'tag', tags)
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
        await prisma.tag.createMany({ data: batch as any, skipDuplicates: true })
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
    },

    bulkCreateTagTypes: async (_, { tagTypes }, ctx) => {
      requireAuth(ctx)
      if (tagTypes.length === 0) return []
      const householdId = await requireHousehold(ctx)
      // The guard is the only change here. There is no existence check to
      // replace: this mutation never had one, and `skipDuplicates` below did
      // the skipping. After the guard `skipDuplicates` can only skip the
      // caller's OWN rows — before it, a stranger's id was skipped too, which
      // silently dropped the caller's row.
      await requireOwnRowIdsOrUnclaimed(ctx, 'tagType', tagTypes)
      const ids = tagTypes.map((t) => t.id)
      const docs = tagTypes.map((tt) => {
        const { id, userId: _u, familyId: _f, ...rest } = tt as unknown as Record<string, unknown>
        return { id: id as string, ...rest, color: (rest as { color: string }).color as TagColor, householdId }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.tagType.createMany({ data: docs as any, skipDuplicates: true })
      // SCOPED — same reason as `bulkCreateTags`' closing read above.
      const inserted = await prisma.tagType.findMany({ where: { id: { in: ids }, householdId } })
      return inserted as unknown as TagType[]
    },

    bulkCreateVendors: async (_, { vendors }, ctx) => {
      requireAuth(ctx)
      if (vendors.length === 0) return []
      const householdId = await requireHousehold(ctx)
      // The guard is the only change, for the same reason as
      // `bulkCreateTagTypes` above: `skipDuplicates` can now only skip the
      // caller's OWN rows.
      await requireOwnRowIdsOrUnclaimed(ctx, 'vendor', vendors)
      const ids = vendors.map((v) => v.id)
      const docs = vendors.map((v) => {
        const { id, userId: _u, familyId: _f, ...rest } = v as unknown as Record<string, unknown>
        return { id: id as string, ...rest, householdId }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.vendor.createMany({ data: docs as any, skipDuplicates: true })
      // SCOPED — same reason as `bulkCreateTags`' closing read above.
      const inserted = await prisma.vendor.findMany({ where: { id: { in: ids }, householdId } })
      return inserted as unknown as Vendor[]
    },

    bulkCreateRecipes: async (_, { recipes }, ctx) => {
      requireAuth(ctx)
      if (recipes.length === 0) return []
      const householdId = await requireHousehold(ctx)
      // Same guard, same position and same reason as `bulkCreateItems` above.
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'recipe', recipes)
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
    },

    bulkCreateInventoryLogs: async (_, { logs }, ctx) => {
      const userId = requireAuth(ctx)
      if (logs.length === 0) return []
      const householdId = await requireHousehold(ctx)
      // Verifies every location the payload names before the first write, so a
      // forbidden location fails the whole mutation with nothing written.
      const locationIdFor = await resolveLogLocations(ctx, logs)
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
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'inventoryLog', logs)
      const results: InventoryLog[] = []
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
            // The payload's own location when it names one, the caller's
            // fallback location when it does not. Both already verified.
            locationId: locationIdFor(locationId),
            ...(logParams ? { logParams: logParams as Prisma.InputJsonValue } : {}),
          },
        })
        results.push(created as unknown as InventoryLog)
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
      if (carts.length === 0) return []
      // Resolves every location the payload's cart ids name before the first
      // write: a live location of the caller's is used, an unclaimed id falls
      // back to the caller's fallback location, and a stranger's live location fails the
      // whole mutation with nothing written.
      const locationIdFor = await resolveCartLocations(ctx, carts)
      // Authorizes every CART id the payload names. It runs AFTER
      // `resolveCartLocations` on purpose, so a stranger's live location is
      // still refused first and the existing location tests keep their error.
      //
      // The two checks guard different columns. `resolveCartLocations` guards
      // the location a cart is written TO; this guards the cart's OWN primary
      // key, which is global and carries no `userId`. Without it the UNSCOPED
      // `findUnique` this replaces read a stranger's cart as "already exists"
      // and SILENTLY DROPPED the caller's own cart — no error, no count.
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'cart', carts)
      const results: Cart[] = []
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
            userId,
            // The location named by the cart's OWN id since PR 3b
            // (`${locationId}:${vendorId}`), and the caller's fallback location when no
            // `Location` row holds that id — a pre-3b bare id, or a cloud
            // backup whose source locations `clearAllData` just deleted. All
            // resolved and verified above.
            locationId: locationIdFor(id),
          },
        })
        results.push(created as unknown as Cart)
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
      if (cartItems.length === 0) return []
      // Authorizes every cart-item id the payload names BEFORE the first
      // write. `CartItem.id` is a global primary key with no `userId` in it,
      // so an id in the payload can name a stranger's row. Without the guard
      // the UNSCOPED `findUnique` this replaces read that row as "already
      // exists" and silently dropped the caller's own cart item.
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'cartItem', cartItems)
      // The cart and the item of every row, resolved before the first write.
      const parentsUsable = await resolveCartItemParents(ctx, cartItems)
      const results: CartItem[] = []
      for (const ci of cartItems) {
        const { id, cartId, itemId, quantity } = ci
        // Own row → skip. Unclaimed → write. After the guard nothing else can
        // reach here, so the per-row read this replaces has nothing left to
        // find out.
        if (ownIds.has(id)) continue
        // BOTH references are SCOPED since plan task 8: the cart by `userId`
        // (until H3b), the item by the household of the CART's location
        // (since households H3a task 3.9; the caller's household before). See
        // `resolveCartItemParents`. Before plan task 8 both reads were plain
        // `findUnique({ where: { id } })`, and the `cartId` one is the exact
        // hole `e2e/tests/cart-id-cross-user-leak.spec.ts` demonstrates
        // against real Postgres: account B's `CartItem` rows landing inside
        // account A's `Cart`.
        //
        // The `continue` STAYS. A cart or item the caller may not use is
        // skipped exactly like one that does not exist. A partial backup
        // legitimately names a parent that is gone, and making "not yours"
        // distinguishable from "not there" would turn the mutation into a
        // probe for another account's ids.
        if (!parentsUsable(cartId, itemId)) continue
        const created = await prisma.cartItem.create({
          data: { id, cartId, itemId, quantity, userId },
        })
        results.push(created as unknown as CartItem)
      }
      // NO CLOSING READ — same reason as `bulkCreateShoppingCarts` above. The
      // returned row is the one `cartItem.create` wrote, and the guard is what
      // makes it the caller's own. Design decision 5.
      return results
    },

    // -------------------------------------------------------------------------
    // Bulk upsert — inserts or replaces records by their original ID
    // -------------------------------------------------------------------------
    bulkUpsertItems: async (_, { items }, ctx) => {
      requireAuth(ctx)
      if (items.length === 0) return []
      const householdId = await requireHousehold(ctx)
      // Authorizes every id the payload names BEFORE the first write. Without
      // it an `upsert` on a bare `{ id }` with `userId` inside `update`
      // overwrote another account's item AND took ownership of it.
      await requireOwnRowIdsOrUnclaimed(ctx, 'item', items)
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
    },

    bulkUpsertTags: async (_, { tags }, ctx) => {
      requireAuth(ctx)
      if (tags.length === 0) return []
      const householdId = await requireHousehold(ctx)
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'tag', tags)
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
      while (remaining.length > 0) {
        const batch = remaining.filter((t) => !t.parentId || written.has(t.parentId))
        if (batch.length === 0) break // a cycle or a parent nobody can use: skip the rest
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
    },

    bulkUpsertTagTypes: async (_, { tagTypes }, ctx) => {
      requireAuth(ctx)
      if (tagTypes.length === 0) return []
      const householdId = await requireHousehold(ctx)
      await requireOwnRowIdsOrUnclaimed(ctx, 'tagType', tagTypes)
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
    },

    bulkUpsertVendors: async (_, { vendors }, ctx) => {
      requireAuth(ctx)
      if (vendors.length === 0) return []
      const householdId = await requireHousehold(ctx)
      await requireOwnRowIdsOrUnclaimed(ctx, 'vendor', vendors)
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
    },

    bulkUpsertRecipes: async (_, { recipes }, ctx) => {
      requireAuth(ctx)
      if (recipes.length === 0) return []
      const householdId = await requireHousehold(ctx)
      // Same guard, same position and same reason as `bulkUpsertItems` above.
      await requireOwnRowIdsOrUnclaimed(ctx, 'recipe', recipes)
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
    },

    bulkUpsertInventoryLogs: async (_, { logs }, ctx) => {
      const userId = requireAuth(ctx)
      if (logs.length === 0) return []
      const householdId = await requireHousehold(ctx)
      // Same pre-check as bulkCreateInventoryLogs: every location the payload
      // names is verified before the first write.
      const locationIdFor = await resolveLogLocations(ctx, logs)
      // The same log-id guard as `bulkCreateInventoryLogs`, in the same place:
      // after the location check, so a forbidden location is still refused
      // first. Without it an `upsert` on a bare `{ id }` with `userId` inside
      // `update` OVERWROTE another account's log and took ownership of it.
      await requireOwnRowIdsOrUnclaimed(ctx, 'inventoryLog', logs)
      const results: InventoryLog[] = []
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
          // existing log on every re-import. The value is the payload's own
          // when it names one, the caller's fallback location when it does not — both
          // verified above.
          create: { id, ...data, userId, locationId: locationIdFor(locationId) },
          update: data,
        })
        results.push(upserted as unknown as InventoryLog)
      }
      // NO CLOSING READ — same reason as `bulkCreateInventoryLogs` above. The
      // returned row is the one `inventoryLog.upsert` wrote, and the guard is
      // what makes it the caller's own. Design decision 5.
      return results
    },

    bulkUpsertShoppingCarts: async (_, { carts }, ctx) => {
      const userId = requireAuth(ctx)
      if (carts.length === 0) return []
      // Same pre-check as bulkCreateShoppingCarts: every location the payload's
      // cart ids name is resolved and verified before the first write.
      const locationIdFor = await resolveCartLocations(ctx, carts)
      // The same cart-id guard as `bulkCreateShoppingCarts`, in the same
      // place: after the location check, so a stranger's live location is
      // still refused first. Without it an `upsert` on a bare `{ id }` with
      // `userId` inside `update` OVERWROTE another account's cart and took
      // ownership of it.
      await requireOwnRowIdsOrUnclaimed(ctx, 'cart', carts)
      const results: Cart[] = []
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
          // `userId` and `locationId` live in `create` only, each for its own
          // reason.
          //
          // `userId`: a row's owner is not something an import may rewrite.
          // Leaving it out means a future edit that drops the guard above
          // still cannot hand another account's cart to the importer. Same
          // shape as `bulkUpsertLocations`.
          //
          // `locationId`: the same reason as the log upsert above — a
          // re-import must not MOVE an existing cart. The value comes from the
          // cart's own id when a `Location` row holds that id, and the
          // caller's fallback location when none does. Both resolved above.
          create: { id, ...data, userId, locationId: locationIdFor(id) },
          update: data,
        })
        results.push(upserted as unknown as Cart)
      }
      // NO CLOSING READ — same reason as the two creates above. The returned
      // row is the one `cart.upsert` wrote, and the guard is what makes it the
      // caller's own. Design decision 5.
      return results
    },

    bulkUpsertCartItems: async (_, { cartItems }, ctx) => {
      const userId = requireAuth(ctx)
      if (cartItems.length === 0) return []
      // Authorizes every cart-item id the payload names BEFORE the first
      // write. Without it an `upsert` on a bare `{ id }` with `userId` inside
      // `update` overwrote another account's cart item and took ownership of
      // it.
      await requireOwnRowIdsOrUnclaimed(ctx, 'cartItem', cartItems)
      // The cart and the item of every row, resolved before the first write,
      // as in `bulkCreateCartItems`.
      const parentsUsable = await resolveCartItemParents(ctx, cartItems)
      const results: CartItem[] = []
      for (const ci of cartItems) {
        const { id, cartId, itemId, quantity } = ci
        // `cartId` and `itemId` STAY in `update`. Only `userId` comes out.
        //
        // This differs on purpose from `bulkUpsertItemStocks`, which drops
        // BOTH of its parents: there the pair IS the row's identity and a
        // backup may not move it. Here local `importCartItems` does a Dexie
        // `bulkPut`, which replaces the whole row including both columns, so
        // dropping them would make the cloud `replace` strategy disagree with
        // the local one. Design decision 3.
        //
        // `userId` comes out because a row's owner is not something an import
        // may rewrite, and because a future edit that drops the guard above
        // must still not be able to reassign a cart item.
        const data = { cartId, itemId, quantity }
        // BOTH references are SCOPED — the cart by `userId` (until H3b), the
        // item by the household of the cart's location (since households H3a
        // task 3.9, `resolveCartItemParents`) — and SKIPPED when they do not
        // resolve. New in plan task 8: this mutation had NO check on either
        // one, so the `replace` import strategy could write the caller's cart
        // item into a STRANGER's cart — the same leak
        // `e2e/tests/cart-id-cross-user-leak.spec.ts` demonstrates on the
        // create path — and an id no row held reached Postgres as an unhandled
        // foreign-key `P2003`.
        //
        // The `continue` matches `bulkCreateCartItems` above exactly, so the
        // two siblings now agree on what an unusable parent means: the cart
        // item is dropped, not refused, and the rest of the batch still lands.
        // That also keeps `replace` and `skip` giving the same answer for a
        // partial backup whose cart or item is gone.
        if (!parentsUsable(cartId, itemId)) continue
        const upserted = await prisma.cartItem.upsert({
          where: { id },
          create: { id, ...data, userId },
          update: data,
        })
        results.push(upserted as unknown as CartItem)
      }
      // NO CLOSING READ — same reason as the three above. The returned row is
      // the one `cartItem.upsert` wrote, and the guard is what makes it the
      // caller's own. Design decision 5.
      return results
    },

    bulkCreateShelves: async (_, { shelves }, ctx) => {
      requireAuth(ctx)
      if (shelves.length === 0) return []
      const householdId = await requireHousehold(ctx)
      const ownIds = await requireOwnRowIdsOrUnclaimed(ctx, 'shelf', shelves)
      const ids = shelves.map((s) => s.id)
      // Rebuilt from the guard's result, not from a fresh read. The read this
      // replaces was UNSCOPED, so a stranger's row counted as "already
      // exists" and the caller's own shelf was silently dropped.
      const existingIds = ownIds
      const toCreate = shelves.filter((s) => !existingIds.has(s.id))
      if (toCreate.length > 0) {
        // Only the household's ids reach the row. See `householdShelfRefs`.
        const refsOf = await householdShelfRefs(householdId, toCreate)
        await prisma.shelf.createMany({
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
      }
      // SCOPED — same reason as `bulkCreateTags`' closing read.
      const inserted = await prisma.shelf.findMany({ where: { id: { in: ids }, householdId } })
      return inserted as unknown as Shelf[]
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
      if (locations.length === 0) return []
      // The caller's household. H4 changes this to the import's TARGET
      // household ("Import into which household?").
      const householdId = await requireHousehold(ctx)
      // Refuses every id held by a location the caller has no role on, and
      // returns the ids that already exist. After it an id is one of two
      // things: a location the caller holds a role on, or free.
      const existing = await requireOwnLocationIdsOrUnclaimed(ctx, locations, 'participant')
      const results: Location[] = []
      for (const location of locations) {
        if (existing.has(location.id)) {
          // "Skip conflicts": the stored row is returned unchanged, and no
          // role row is added. UNSCOPED read: the pre-check above already
          // proved the caller holds a role on this id. A `householdId` filter
          // here would wrongly miss a location of another household the
          // caller shares (H5).
          const row = await prisma.location.findUnique({ where: { id: location.id } })
          if (row) results.push(locationToGraphQL(row as unknown as PrismaLocation))
          continue
        }
        const row = await createImportedLocation(userId, householdId, location)
        // A second payload row with the same id is now a skip, not a P2002.
        existing.add(location.id)
        results.push(locationToGraphQL(row as unknown as PrismaLocation))
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
      if (itemStocks.length === 0) return []
      await requireOwnItemStockRefs(ctx, itemStocks)
      const results: ItemStock[] = []
      const seen = new Set<string>()
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
      }
      return results
    },

    bulkUpsertShelves: async (_, { shelves }, ctx) => {
      requireAuth(ctx)
      if (shelves.length === 0) return []
      const householdId = await requireHousehold(ctx)
      await requireOwnRowIdsOrUnclaimed(ctx, 'shelf', shelves)
      // Only the household's ids reach the row. See `householdShelfRefs`.
      const refsOf = await householdShelfRefs(householdId, shelves)
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
    },

    bulkUpsertLocations: async (_, { locations }, ctx) => {
      const userId = requireAuth(ctx)
      if (locations.length === 0) return []
      // The caller's household, as in `bulkCreateLocations`. H4 changes it
      // to the import's TARGET household.
      const householdId = await requireHousehold(ctx)
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
      // Keep `householdId` OUT of the `update` below. H5 owes a
      // two-household test for that: a caller who organizes a location of
      // household B while importing into household A. When the location is
      // in the caller's own household, a `householdId` in `update` writes the
      // same value again, so a test of that case passes either way.
      const existing = await requireOwnLocationIdsOrUnclaimed(ctx, locations, 'organizer')
      const results: Location[] = []
      for (const location of locations) {
        const { id, name, order, createdAt, updatedAt } = location
        if (!existing.has(id)) {
          // A new id: the location, its `householdId` and the caller's
          // `organizer` row, in one transaction. Not an `upsert`: an upsert
          // cannot write the role row for its create branch only.
          const row = await createImportedLocation(userId, householdId, location)
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
        results.push(locationToGraphQL(row as unknown as PrismaLocation))
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
      if (itemStocks.length === 0) return []
      await requireOwnItemStockRefs(ctx, itemStocks)
      const results: ItemStock[] = []
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
        }
        const row = await prisma.itemStock.upsert({
          where: { id },
          create: { id, itemId, locationId, ...state },
          update: state,
        })
        results.push(itemStockToGraphQL(row))
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
    // - "Home" is made in the SAME transaction, so the household is never
    //   left with no location: there is no screen for that before H5
    //   (decision H13). If making it fails, every delete is rolled back.
    //
    // The order of the deletes is children before parents, as before.
    // `ItemStock`, `Cart`, `InventoryLog` and `LocationMember` would also go
    // by ON DELETE CASCADE with their location, and the junction rows with
    // their item; the explicit deletes keep the list complete for
    // `purge-coverage.test.ts`, and nothing here depends on the cascades.
    // `LocationMember` has no explicit delete: it goes with its location.
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
        await tx.inventoryLog.deleteMany({ where: { location: { householdId } } })
        await tx.cartItem.deleteMany({ where: { cart: { location: { householdId } } } })
        await tx.cart.deleteMany({ where: { location: { householdId } } })
        await tx.recipeItem.deleteMany({ where: { recipe: { householdId } } })
        await tx.recipe.deleteMany({ where: { householdId } })
        await tx.itemTag.deleteMany({ where: { item: { householdId } } })
        await tx.itemVendor.deleteMany({ where: { item: { householdId } } })
        // Before both `item` and `location`: ItemStock has a foreign key to
        // each, both ON DELETE CASCADE.
        await tx.itemStock.deleteMany({ where: { location: { householdId } } })
        await tx.item.deleteMany({ where: { householdId } })
        await tx.tag.deleteMany({ where: { householdId } })
        await tx.tagType.deleteMany({ where: { householdId } })
        await tx.vendor.deleteMany({ where: { householdId } })
        await tx.shelf.deleteMany({ where: { householdId } })
        // Its `LocationMember` rows go by ON DELETE CASCADE.
        await tx.location.deleteMany({ where: { householdId } })
        await createFirstLocation(tx, {
          householdId,
          userId,
          name: firstLocationName(ctx.language ?? 'en'),
        })
      })
      return true
    },
  },
}
