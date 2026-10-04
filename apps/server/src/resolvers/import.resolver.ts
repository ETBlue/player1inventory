import { GraphQLError } from 'graphql'
import { requireLocationRole } from '../lib/authz.js'
import { parseCartId } from '../lib/cartId.js'
import { ensureDefaultLocation } from '../lib/defaultLocation.js'
import { prisma } from '../lib/prisma.js'
import { type Context, requireAuth } from '../context.js'
import { toGraphQL as locationToGraphQL } from './location.resolver.js'
import { toGraphQL as itemStockToGraphQL } from './itemStock.resolver.js'
import type { Cart, CartItem, InventoryLog, Item, ItemStock, Location, Recipe, Resolvers, Shelf, Tag, TagType, Vendor } from '../generated/graphql.js'
import type { ExpirationMode, Prisma, Location as PrismaLocation, TagColor, TargetUnit } from '@prisma/client'

// Map a Prisma item (with junction rows) to the GraphQL Item shape
function itemToGraphQL(item: {
  id: string
  name: string
  targetUnit: TargetUnit
  targetQuantity: number
  refillThreshold: number
  packedQuantity: number
  unpackedQuantity: number
  consumeAmount: number
  packageUnit?: string | null
  measurementUnit?: string | null
  amountPerPackage?: number | null
  dueDate?: Date | null
  estimatedDueDays?: number | null
  expirationThreshold?: number | null
  expirationMode: ExpirationMode
  userId: string
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
    dueDate: item.dueDate ? item.dueDate.toISOString() : null,
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
 * NOT fall back to the default: a silent fallback would write the log into a
 * location the user never asked for and report success.
 *
 * Three things about the shape are deliberate:
 *
 *  - Each DISTINCT id is checked ONCE, not once per row. 500 logs across 3
 *    locations cost 3 checks.
 *  - The whole check runs before the write loop. These bulk resolvers are not
 *    transactional, so throwing from inside the loop would leave the rows
 *    already written behind. Checking first means a payload naming a forbidden
 *    location writes nothing at all.
 *  - The caller's default is resolved only when some row omits `locationId`,
 *    so an import whose every row names a location does not create one.
 *
 * `'member'` is the role asked for because writing a log is a write, and
 * member is the LOWEST role that may write under location RBAC (owner/member
 * edit, viewer reads — docs/global/permissions/2026-08-29-design-location-rbac.md).
 * Asking for `'owner'` would deny a legitimate member of a shared location
 * once RBAC lands.
 */
async function resolveLogLocations(
  ctx: Context,
  userId: string,
  logs: readonly { locationId?: string | null }[],
): Promise<(inputLocationId: string | null | undefined) => string> {
  const verified = new Set<string>()
  let defaultLocationId: string | null = null

  for (const log of logs) {
    if (log.locationId) {
      if (verified.has(log.locationId)) continue
      await requireLocationRole(ctx, log.locationId, 'member')
      verified.add(log.locationId)
    } else if (defaultLocationId === null) {
      defaultLocationId = await ensureDefaultLocation(userId)
    }
  }

  return (inputLocationId) => {
    if (inputLocationId) return inputLocationId
    if (defaultLocationId === null) {
      // Unreachable: the loop above resolved the default for the first row
      // that omitted a location, and this function is only called with rows
      // from that same list. It is here to keep the return type `string`
      // rather than `string | null`, because an empty-string fallback would
      // write a broken foreign key instead of failing.
      throw new Error('resolveLogLocations: no default location resolved')
    }
    return defaultLocationId
  }
}

/**
 * The location a cart id names, or `null` when the id carries no prefix at all.
 *
 * Since PR 3b `Cart.id` is `${locationId}:${vendorId | 'no-vendor'}`, so an
 * imported cart's location rides inside its own primary key and needs no input
 * field. `parseCartId` (lib/cartId.ts) splits on the FIRST colon, which is why
 * this reuses it rather than splitting again: a vendor id that itself contains
 * ':' then survives, and the two copies of the rule cannot drift.
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
 * transactional), and the caller's default resolved only if some id needs it.
 *
 * ── THE RULE (task 8) ──
 *
 * Three cases per distinct id named by a cart id:
 *
 *  - no `Location` row holds it → write the cart to the caller's DEFAULT
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
 * `location.userId` against the caller (root CLAUDE.md, Authorization).
 *
 * Why this is not `requireOwnLocationIdsOrUnclaimed` itself: that helper
 * returns `void`, because for `LocationInput` an unclaimed id simply means
 * "free to create" and the caller needs no further answer. Here the resolver
 * must KNOW which ids came back unclaimed, so it can send those carts to the
 * default instead. Same two-step pattern — unscoped existence check, then
 * `requireLocationRole` — with a result rather than a bare assertion.
 *
 * `'member'` for the same reason as every other helper here: it is the LOWEST
 * role that may write under location RBAC, so a legitimate member of a shared
 * location is not denied the day RBAC lands.
 */
async function resolveCartLocations(
  ctx: Context,
  userId: string,
  carts: readonly { id: string }[],
): Promise<(cartId: string) => string> {
  // Named location id → the location the cart is actually written to. Either
  // the named id itself (it exists and is the caller's) or the caller's
  // default (no row holds it). One entry per DISTINCT named id, so 500 carts
  // across 3 locations cost 3 existence checks, not 500.
  const resolved = new Map<string, string>()
  let defaultLocationId: string | null = null

  // Resolved at most once per mutation, and only when some id needs it, so an
  // import whose every cart names a live location of the caller's never creates
  // a default.
  async function ensureDefault(): Promise<string> {
    if (defaultLocationId === null) {
      defaultLocationId = await ensureDefaultLocation(userId)
    }
    return defaultLocationId
  }

  for (const cart of carts) {
    const named = locationIdInCartId(cart.id)
    if (named === null) {
      await ensureDefault()
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
      await requireLocationRole(ctx, named, 'member')
      resolved.set(named, named)
    } else {
      resolved.set(named, await ensureDefault())
    }
  }

  return (cartId) => {
    const named = locationIdInCartId(cartId)
    const target = named === null ? defaultLocationId : resolved.get(named)
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
 *
 * `LocationInput.id` is attacker-controlled and `Location.id` is a GLOBAL
 * primary key with no `userId` in it, so an id in the payload can name a row
 * belonging to somebody else. Each distinct id falls into one of three cases:
 *
 *  - it exists and the caller holds a role on it → the caller's own row, so
 *    `bulkCreate` skips it and `bulkUpsert` replaces it
 *  - it exists and the caller does NOT → `requireLocationRole` throws
 *    FORBIDDEN, and nothing is written at all
 *  - it does not exist → free to create
 *
 * Why the unscoped `findUnique` comes first. The question it asks is "is this
 * primary key taken", which is not an authorization question and has no user
 * to scope by; only `id` is selected. The AUTHORIZATION decision is made
 * entirely by `requireLocationRole` (lib/authz.ts), the one seam the whole
 * series routes location checks through — never by comparing a row's `userId`
 * to the caller's, which root CLAUDE.md forbids.
 *
 * `'member'` for the same reason as the log and cart helpers above: it is the
 * LOWEST role that may write under location RBAC, so a legitimate member of a
 * shared location is not denied the day RBAC lands.
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
): Promise<void> {
  const checked = new Set<string>()
  for (const { id } of locations) {
    if (checked.has(id)) continue
    checked.add(id)
    const taken = await prisma.location.findUnique({
      where: { id },
      select: { id: true },
    })
    if (taken) await requireLocationRole(ctx, id, 'member')
  }
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
 *  - `itemId` — the row's other parent. `Item` DOES have a `userId` column, so
 *    the check is a SCOPED query (`where: { id, userId }`) and never a
 *    comparison of a fetched row's `userId` against the caller's, which root
 *    CLAUDE.md forbids.
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
 * `'member'` for the same reason as every other helper here: it is the LOWEST
 * role that may write under location RBAC, so a legitimate member of a shared
 * location is not denied the day RBAC lands. Asking for `'owner'` would pass
 * today, because `requireLocationRole` ignores `role` pre-RBAC, and deny them
 * silently later.
 */
async function requireOwnItemStockRefs(
  ctx: Context,
  userId: string,
  stocks: readonly { id: string; itemId: string; locationId: string }[],
): Promise<void> {
  const checkedLocations = new Set<string>()
  for (const { locationId } of stocks) {
    if (checkedLocations.has(locationId)) continue
    checkedLocations.add(locationId)
    await requireLocationRole(ctx, locationId, 'member')
  }

  const checkedItems = new Set<string>()
  for (const { itemId } of stocks) {
    if (checkedItems.has(itemId)) continue
    checkedItems.add(itemId)
    const own = await prisma.item.findFirst({
      where: { id: itemId, userId },
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
    if (taken) await requireLocationRole(ctx, taken.locationId, 'member')
  }
}

export const importResolvers: Pick<Resolvers, 'Mutation'> = {
  Mutation: {
    // -------------------------------------------------------------------------
    // Bulk create — inserts records with original IDs, skips existing ones.
    // -------------------------------------------------------------------------
    bulkCreateItems: async (_, { items }, ctx) => {
      const userId = requireAuth(ctx)
      if (items.length === 0) return []
      const results: Item[] = []
      for (const item of items) {
        const { id, tagIds, vendorIds, createdAt, updatedAt, dueDate, targetUnit, expirationThreshold, ...rest } = item
        // Skip if already exists
        const existing = await prisma.item.findUnique({ where: { id } })
        if (existing) continue
        const expirationMode = (rest as { expirationMode?: string }).expirationMode
        const created = await prisma.item.create({
          data: {
            id,
            ...rest,
            targetUnit: targetUnit as TargetUnit,
            expirationThreshold: expirationThreshold ?? undefined,
            expirationMode: expirationMode
              ? (expirationMode === 'days from purchase' ? 'days_from_purchase' : expirationMode as ExpirationMode)
              : 'disabled',
            dueDate: dueDate ? new Date(dueDate) : undefined,
            createdAt: new Date(createdAt),
            updatedAt: new Date(updatedAt),
            userId,
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
        if (tagIds?.length) {
          const existingTags = await prisma.tag.findMany({
            where: { id: { in: tagIds } },
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
        if (vendorIds?.length) {
          await prisma.itemVendor.createMany({
            data: vendorIds.map((vendorId) => ({ itemId: id, vendorId })),
            skipDuplicates: true,
          })
        }
        const full = await prisma.item.findUniqueOrThrow({
          where: { id: created.id },
          include: { tags: true, vendors: true },
        })
        results.push(itemToGraphQL(full))
      }
      return results
    },

    bulkCreateTags: async (_, { tags }, ctx) => {
      const userId = requireAuth(ctx)
      if (tags.length === 0) return []
      const ids = tags.map((t) => t.id)
      const docs = tags.map((tag): Record<string, unknown> & { id: string; userId: string } => {
        const { id, userId: _u, familyId: _f, ...rest } = tag as unknown as Record<string, unknown>
        return { id: id as string, ...rest, userId }
      })
      // Filter out tags whose typeId references a TagType that doesn't exist
      // (orphaned tags from deleted TagTypes in the source data).
      const typeIds = [...new Set(docs.map((d) => d.typeId as string))]
      const existingTypeIds = await prisma.tagType.findMany({
        where: { id: { in: typeIds } },
        select: { id: true },
      })
      const validTypeIdSet = new Set(existingTypeIds.map((t) => t.id))
      let remaining = docs.filter((d) => validTypeIdSet.has(d.typeId as string))
      // Insert in topological order: parents before children. Each pass inserts
      // tags whose parentId is either null or already present in the DB.
      const insertedIds = new Set(
        (await prisma.tag.findMany({ where: { id: { in: remaining.map((d) => d.id) } }, select: { id: true } }))
          .map((t) => t.id),
      )
      while (remaining.length > 0) {
        const batch = remaining.filter(
          (d) => !d.parentId || insertedIds.has(d.parentId as string),
        )
        if (batch.length === 0) break // cycle or unresolvable parentIds — stop to avoid infinite loop
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await prisma.tag.createMany({ data: batch as any, skipDuplicates: true })
        const batchIds = new Set(batch.map((d) => d.id))
        batchIds.forEach((id) => insertedIds.add(id))
        remaining = remaining.filter((d) => !batchIds.has(d.id))
      }
      const inserted = await prisma.tag.findMany({ where: { id: { in: ids } } })
      return inserted as unknown as Tag[]
    },

    bulkCreateTagTypes: async (_, { tagTypes }, ctx) => {
      const userId = requireAuth(ctx)
      if (tagTypes.length === 0) return []
      const ids = tagTypes.map((t) => t.id)
      const docs = tagTypes.map((tt) => {
        const { id, userId: _u, familyId: _f, ...rest } = tt as unknown as Record<string, unknown>
        return { id: id as string, ...rest, color: (rest as { color: string }).color as TagColor, userId }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.tagType.createMany({ data: docs as any, skipDuplicates: true })
      const inserted = await prisma.tagType.findMany({ where: { id: { in: ids } } })
      return inserted as unknown as TagType[]
    },

    bulkCreateVendors: async (_, { vendors }, ctx) => {
      const userId = requireAuth(ctx)
      if (vendors.length === 0) return []
      const ids = vendors.map((v) => v.id)
      const docs = vendors.map((v) => {
        const { id, userId: _u, familyId: _f, ...rest } = v as unknown as Record<string, unknown>
        return { id: id as string, ...rest, userId }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.vendor.createMany({ data: docs as any, skipDuplicates: true })
      const inserted = await prisma.vendor.findMany({ where: { id: { in: ids } } })
      return inserted as unknown as Vendor[]
    },

    bulkCreateRecipes: async (_, { recipes }, ctx) => {
      const userId = requireAuth(ctx)
      if (recipes.length === 0) return []
      const results: Recipe[] = []
      for (const recipe of recipes) {
        const { id, items, lastCookedAt } = recipe
        const existing = await prisma.recipe.findUnique({ where: { id } })
        if (existing) continue
        await prisma.recipe.create({
          data: {
            id,
            name: recipe.name,
            userId,
            lastCookedAt: lastCookedAt ? new Date(lastCookedAt) : undefined,
          },
        })
        if (items?.length) {
          await prisma.recipeItem.createMany({
            data: items.map((i) => ({ recipeId: id, itemId: i.itemId, defaultAmount: i.defaultAmount })),
            skipDuplicates: true,
          })
        }
        const full = await prisma.recipe.findUniqueOrThrow({ where: { id }, include: { items: true } })
        results.push(full as unknown as Recipe)
      }
      return results
    },

    bulkCreateInventoryLogs: async (_, { logs }, ctx) => {
      const userId = requireAuth(ctx)
      if (logs.length === 0) return []
      // Verifies every location the payload names before the first write, so a
      // forbidden location fails the whole mutation with nothing written.
      const locationIdFor = await resolveLogLocations(ctx, userId, logs)
      const results: InventoryLog[] = []
      for (const log of logs) {
        // `locationId` is pulled OUT of `rest`: it is set explicitly below
        // from the verified value, never passed straight through.
        const { id, occurredAt, note, logParams, locationId, ...rest } = log
        const existing = await prisma.inventoryLog.findUnique({ where: { id } })
        if (existing) continue
        const itemExists = await prisma.item.findUnique({ where: { id: (rest as { itemId: string }).itemId }, select: { id: true } })
        if (!itemExists) continue
        const created = await prisma.inventoryLog.create({
          data: {
            id,
            ...rest,
            occurredAt: new Date(occurredAt),
            note: note ?? undefined,
            userId,
            // The payload's own location when it names one, the caller's
            // default when it does not. Both already verified.
            locationId: locationIdFor(locationId),
            ...(logParams ? { logParams: logParams as Prisma.InputJsonValue } : {}),
          },
        })
        results.push(created as unknown as InventoryLog)
      }
      return results
    },

    bulkCreateShoppingCarts: async (_, { carts }, ctx) => {
      const userId = requireAuth(ctx)
      if (carts.length === 0) return []
      // Resolves every location the payload's cart ids name before the first
      // write: a live location of the caller's is used, an unclaimed id falls
      // back to the caller's default, and a stranger's live location fails the
      // whole mutation with nothing written.
      const locationIdFor = await resolveCartLocations(ctx, userId, carts)
      const results: Cart[] = []
      for (const cart of carts) {
        const { id, lastPurchasedAt } = cart
        const existing = await prisma.cart.findUnique({ where: { id } })
        if (existing) continue
        const created = await prisma.cart.create({
          data: {
            id,
            lastPurchasedAt: lastPurchasedAt ? new Date(lastPurchasedAt as string) : undefined,
            userId,
            // The location named by the cart's OWN id since PR 3b
            // (`${locationId}:${vendorId}`), and the caller's default when no
            // `Location` row holds that id — a pre-3b bare id, or a cloud
            // backup whose source locations `clearAllData` just deleted. All
            // resolved and verified above.
            locationId: locationIdFor(id),
          },
        })
        results.push(created as unknown as Cart)
      }
      return results
    },

    bulkCreateCartItems: async (_, { cartItems }, ctx) => {
      const userId = requireAuth(ctx)
      if (cartItems.length === 0) return []
      const results: CartItem[] = []
      for (const ci of cartItems) {
        const { id, cartId, itemId, quantity } = ci
        const existing = await prisma.cartItem.findUnique({ where: { id } })
        if (existing) continue
        const cartExists = await prisma.cart.findUnique({ where: { id: cartId }, select: { id: true } })
        if (!cartExists) continue
        const itemExists = await prisma.item.findUnique({ where: { id: itemId }, select: { id: true } })
        if (!itemExists) continue
        const created = await prisma.cartItem.create({
          data: { id, cartId, itemId, quantity, userId },
        })
        results.push(created as unknown as CartItem)
      }
      return results
    },

    // -------------------------------------------------------------------------
    // Bulk upsert — inserts or replaces records by their original ID
    // -------------------------------------------------------------------------
    bulkUpsertItems: async (_, { items }, ctx) => {
      const userId = requireAuth(ctx)
      if (items.length === 0) return []
      const results: Item[] = []
      for (const item of items) {
        const { id, tagIds, vendorIds, createdAt, updatedAt, dueDate, targetUnit, expirationThreshold, ...rest } = item
        const expirationMode = (rest as { expirationMode?: string }).expirationMode
        const data = {
          ...rest,
          targetUnit: targetUnit as TargetUnit,
          expirationThreshold: expirationThreshold ?? undefined,
          expirationMode: expirationMode
            ? (expirationMode === 'days from purchase' ? 'days_from_purchase' : expirationMode as ExpirationMode)
            : 'disabled',
          dueDate: dueDate ? new Date(dueDate) : undefined,
          createdAt: new Date(createdAt),
          updatedAt: new Date(updatedAt),
          userId,
        }
        await prisma.item.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        })
        // NO STOCK IS WRITTEN HERE either — same reason as `bulkCreateItems`
        // above (cloud locations PR 4b). The client sends this payload's stock
        // through `bulkUpsertItemStocks` on the second pass, after this one.
        // Replace junction rows
        await prisma.itemTag.deleteMany({ where: { itemId: id } })
        await prisma.itemVendor.deleteMany({ where: { itemId: id } })
        if (tagIds?.length) {
          await prisma.itemTag.createMany({
            data: tagIds.map((tagId) => ({ itemId: id, tagId })),
          })
        }
        if (vendorIds?.length) {
          await prisma.itemVendor.createMany({
            data: vendorIds.map((vendorId) => ({ itemId: id, vendorId })),
          })
        }
        const full = await prisma.item.findUniqueOrThrow({
          where: { id },
          include: { tags: true, vendors: true },
        })
        results.push(itemToGraphQL(full))
      }
      return results
    },

    bulkUpsertTags: async (_, { tags }, ctx) => {
      const userId = requireAuth(ctx)
      if (tags.length === 0) return []
      await Promise.all(
        tags.map((tag) => {
          const { id, userId: _u, familyId: _f, ...rest } = tag as unknown as Record<string, unknown>
          const data = { ...rest, userId }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return prisma.tag.upsert({ where: { id: id as string }, create: { id: id as string, ...data } as any, update: data as any })
        }),
      )
      const inserted = await prisma.tag.findMany({ where: { id: { in: tags.map((t) => t.id) } } })
      return inserted as unknown as Tag[]
    },

    bulkUpsertTagTypes: async (_, { tagTypes }, ctx) => {
      const userId = requireAuth(ctx)
      if (tagTypes.length === 0) return []
      await Promise.all(
        tagTypes.map((tt) => {
          const { id, userId: _u, familyId: _f, ...rest } = tt as unknown as Record<string, unknown>
          const data = { ...rest, color: (rest as { color: string }).color as TagColor, userId }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return prisma.tagType.upsert({ where: { id: id as string }, create: { id: id as string, ...data } as any, update: data as any })
        }),
      )
      const inserted = await prisma.tagType.findMany({ where: { id: { in: tagTypes.map((t) => t.id) } } })
      return inserted as unknown as TagType[]
    },

    bulkUpsertVendors: async (_, { vendors }, ctx) => {
      const userId = requireAuth(ctx)
      if (vendors.length === 0) return []
      await Promise.all(
        vendors.map((v) => {
          const { id, userId: _u, familyId: _f, ...rest } = v as unknown as Record<string, unknown>
          const data = { ...rest, userId }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return prisma.vendor.upsert({ where: { id: id as string }, create: { id: id as string, ...data } as any, update: data as any })
        }),
      )
      const inserted = await prisma.vendor.findMany({ where: { id: { in: vendors.map((v) => v.id) } } })
      return inserted as unknown as Vendor[]
    },

    bulkUpsertRecipes: async (_, { recipes }, ctx) => {
      const userId = requireAuth(ctx)
      if (recipes.length === 0) return []
      const results: Recipe[] = []
      for (const recipe of recipes) {
        const { id, items, lastCookedAt } = recipe
        const data = {
          name: recipe.name,
          userId,
          lastCookedAt: lastCookedAt ? new Date(lastCookedAt) : undefined,
        }
        await prisma.recipe.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        })
        if (items != null) {
          await prisma.recipeItem.deleteMany({ where: { recipeId: id } })
          if (items.length) {
            await prisma.recipeItem.createMany({
              data: items.map((i) => ({ recipeId: id, itemId: i.itemId, defaultAmount: i.defaultAmount })),
            })
          }
        }
        const full = await prisma.recipe.findUniqueOrThrow({ where: { id }, include: { items: true } })
        results.push(full as unknown as Recipe)
      }
      return results
    },

    bulkUpsertInventoryLogs: async (_, { logs }, ctx) => {
      const userId = requireAuth(ctx)
      if (logs.length === 0) return []
      // Same pre-check as bulkCreateInventoryLogs: every location the payload
      // names is verified before the first write.
      const locationIdFor = await resolveLogLocations(ctx, userId, logs)
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
          userId,
          ...(logParams ? { logParams: logParams as Prisma.InputJsonValue } : {}),
        }
        const upserted = await prisma.inventoryLog.upsert({
          where: { id },
          // locationId sits in `create` only, never in `update`. An upsert that
          // carried it into `update` would move an existing log on every
          // re-import. The value is the payload's own when it names one, the
          // caller's default when it does not — both verified above.
          create: { id, ...data, locationId: locationIdFor(locationId) },
          update: data,
        })
        results.push(upserted as unknown as InventoryLog)
      }
      return results
    },

    bulkUpsertShoppingCarts: async (_, { carts }, ctx) => {
      const userId = requireAuth(ctx)
      if (carts.length === 0) return []
      // Same pre-check as bulkCreateShoppingCarts: every location the payload's
      // cart ids name is resolved and verified before the first write.
      const locationIdFor = await resolveCartLocations(ctx, userId, carts)
      const results: Cart[] = []
      for (const cart of carts) {
        const { id, lastPurchasedAt } = cart
        // `data` is built field by field, never spread from the input, so
        // `locationId` cannot reach the `update` payload by accident. Keep it
        // that way: see the comment on `create` below.
        const data = {
          lastPurchasedAt: lastPurchasedAt ? new Date(lastPurchasedAt as string) : undefined,
          userId,
        }
        const upserted = await prisma.cart.upsert({
          where: { id },
          // locationId in `create` only, for the same reason as the log upsert
          // above: a re-import must not move an existing cart. The value comes
          // from the cart's own id when a `Location` row holds that id, and the
          // caller's default when none does. Both resolved above.
          create: { id, ...data, locationId: locationIdFor(id) },
          update: data,
        })
        results.push(upserted as unknown as Cart)
      }
      return results
    },

    bulkUpsertCartItems: async (_, { cartItems }, ctx) => {
      const userId = requireAuth(ctx)
      if (cartItems.length === 0) return []
      const results: CartItem[] = []
      for (const ci of cartItems) {
        const { id, cartId, itemId, quantity } = ci
        const data = { cartId, itemId, quantity, userId }
        const upserted = await prisma.cartItem.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        })
        results.push(upserted as unknown as CartItem)
      }
      return results
    },

    bulkCreateShelves: async (_, { shelves }, ctx) => {
      const userId = requireAuth(ctx)
      if (shelves.length === 0) return []
      const ids = shelves.map((s) => s.id)
      const existingIds = new Set(
        (await prisma.shelf.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((s) => s.id),
      )
      const toCreate = shelves.filter((s) => !existingIds.has(s.id))
      if (toCreate.length > 0) {
        await prisma.shelf.createMany({
          data: toCreate.map(({ id, createdAt, updatedAt, filterConfig, itemIds, ...rest }) => ({
            id,
            ...rest,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filterConfig: filterConfig ? (filterConfig as any) : undefined,
            itemIds: itemIds ?? [],
            createdAt: new Date(createdAt),
            updatedAt: new Date(updatedAt),
            userId,
          })),
          skipDuplicates: true,
        })
      }
      const inserted = await prisma.shelf.findMany({ where: { id: { in: ids } } })
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
      await requireOwnLocationIdsOrUnclaimed(ctx, locations)
      const results: Location[] = []
      for (const { id, name, order, createdAt, updatedAt } of locations) {
        // SCOPED to the caller, unlike the other 18 bulk creates. The
        // pre-check has already refused every id held by somebody else, so
        // anything this finds is the caller's own row — and anything it does
        // not find is an id no row holds. An unscoped `findUnique` here would
        // make `continue` mean two different things.
        const existing = await prisma.location.findUnique({ where: { id, userId } })
        if (existing) {
          results.push(locationToGraphQL(existing as unknown as PrismaLocation))
          continue
        }
        const row = await prisma.location.create({
          data: {
            id,
            name,
            order,
            // Always false, never from the payload. See `LocationInput`.
            isDefault: false,
            createdAt: new Date(createdAt),
            updatedAt: new Date(updatedAt),
            userId,
          },
        })
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
      const userId = requireAuth(ctx)
      if (itemStocks.length === 0) return []
      await requireOwnItemStockRefs(ctx, userId, itemStocks)
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
      const userId = requireAuth(ctx)
      if (shelves.length === 0) return []
      await Promise.all(
        shelves.map(({ id, createdAt, updatedAt, filterConfig, itemIds, ...rest }) => {
          const data = {
            ...rest,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filterConfig: filterConfig ? (filterConfig as any) : undefined,
            itemIds: itemIds ?? [],
            createdAt: new Date(createdAt),
            updatedAt: new Date(updatedAt),
            userId,
          }
          return prisma.shelf.upsert({ where: { id }, create: { id, ...data }, update: data })
        }),
      )
      const inserted = await prisma.shelf.findMany({ where: { id: { in: shelves.map((s) => s.id) } } })
      return inserted as unknown as Shelf[]
    },

    bulkUpsertLocations: async (_, { locations }, ctx) => {
      const userId = requireAuth(ctx)
      if (locations.length === 0) return []
      await requireOwnLocationIdsOrUnclaimed(ctx, locations)
      const results: Location[] = []
      for (const { id, name, order, createdAt, updatedAt } of locations) {
        // `update` is NARROWER than `create`, on purpose — the other bulk
        // upserts pass one `data` object to both, and here that would be two
        // bugs:
        //
        //  - `isDefault: false` in `update` would DEMOTE the caller's own
        //    default if the payload ever named its id, leaving the account with
        //    no default at all; `ensureDefaultLocation` would then build a
        //    spare "My Home" beside the real one. Omitting the column leaves
        //    whatever flag the row already has.
        //  - `userId` in `update` is the row-steal half of the hole the
        //    pre-check closes. Leaving it out means a future edit that drops
        //    the pre-check cannot reassign a row by accident.
        //
        // Same trap as task 3's `...rest` in `bulkUpsertInventoryLogs`, in a
        // different shape: there the input field leaked INTO `update`, here a
        // hardcoded column would have.
        const row = await prisma.location.upsert({
          where: { id },
          create: {
            id,
            name,
            order,
            isDefault: false,
            createdAt: new Date(createdAt),
            updatedAt: new Date(updatedAt),
            userId,
          },
          update: {
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
      const userId = requireAuth(ctx)
      if (itemStocks.length === 0) return []
      await requireOwnItemStockRefs(ctx, userId, itemStocks)
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
    // Clear all data — deletes all entities for the authenticated user
    // in dependency order to avoid orphan references
    // -------------------------------------------------------------------------
    clearAllData: async (_, __, ctx) => {
      const userId = requireAuth(ctx)
      await prisma.$transaction([
        prisma.inventoryLog.deleteMany({ where: { userId } }),
        prisma.cartItem.deleteMany({ where: { userId } }),
        prisma.cart.deleteMany({ where: { userId } }),
        prisma.recipeItem.deleteMany({ where: { recipe: { userId } } }),
        prisma.recipe.deleteMany({ where: { userId } }),
        prisma.itemTag.deleteMany({ where: { item: { userId } } }),
        prisma.itemVendor.deleteMany({ where: { item: { userId } } }),
        // ItemStock has no userId of its own — scoped through its location,
        // matching how recipeItem/itemTag/itemVendor are scoped through their
        // parent above. Must run before BOTH item.deleteMany and
        // location.deleteMany: ItemStock FKs to both, and ItemStock_itemId_fkey
        // is ON DELETE CASCADE — deleting items first would cascade-delete these
        // rows before this deleteMany runs. clearAllData doesn't return counts so
        // that alone wouldn't be observable here, but the ordering is kept
        // consistent with purgeUserData rather than relying on that difference.
        prisma.itemStock.deleteMany({ where: { location: { userId } } }),
        prisma.item.deleteMany({ where: { userId } }),
        prisma.tag.deleteMany({ where: { userId } }),
        prisma.tagType.deleteMany({ where: { userId } }),
        prisma.vendor.deleteMany({ where: { userId } }),
        prisma.shelf.deleteMany({ where: { userId } }),
        prisma.location.deleteMany({ where: { userId } }),
      ])
      return true
    },
  },
}
