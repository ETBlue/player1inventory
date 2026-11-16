import { GraphQLError } from 'graphql'
import { requireAuth } from '../context.js'
import {
  householdOfLocation,
  locationIdsWithRole,
  requireCatalogIds,
  requireCatalogRole,
  requireHousehold,
  requireLocationItems,
  requireLocationRole,
} from '../lib/authz.js'
import { ensureStockAtLocation, writeStock } from '../lib/itemStockWrite.js'
import { prisma } from '../lib/prisma.js'
import { publishChange, publishHouseholdChange } from '../lib/publishChange.js'
import { buildItemUpdateData, toGraphQL as itemToGraphQL } from './item.resolver.js'
import type { Item, ItemStock, Resolvers } from '../generated/graphql.js'
import type { Prisma, ItemStock as PrismaItemStock } from '@prisma/client'
import type { ChangeKind } from '../lib/liveEvents.js'

// The five state fields, all optional on input. A key absent from `input` is
// left untouched on an existing row — this is a merge, not a replace.
type StockInput = {
  targetQuantity?: number | null
  refillThreshold?: number | null
  packedQuantity?: number | null
  unpackedQuantity?: number | null
  dueDate?: string | null
}

// Narrower than `StockWrite`: every number here is a plain number, never
// Prisma's `{ increment: n }` form. That matters because `applyUnitSwitch`
// below spreads this result into an `itemStock.create`, where a column typed
// `number` cannot take the increment object. `StockData` is still assignable
// to `StockWrite`, so `writeStock` takes it unchanged.
type StockData = {
  targetQuantity?: number
  refillThreshold?: number
  packedQuantity?: number
  unpackedQuantity?: number
  dueDate?: Date | null
}

function toData(input: StockInput): StockData {
  const data: StockData = {}
  if (input.targetQuantity != null) data.targetQuantity = input.targetQuantity
  if (input.refillThreshold != null) data.refillThreshold = input.refillThreshold
  if (input.packedQuantity != null) data.packedQuantity = input.packedQuantity
  if (input.unpackedQuantity != null) data.unpackedQuantity = input.unpackedQuantity
  if ('dueDate' in input) data.dueDate = input.dueDate ? new Date(input.dueDate) : null
  return data
}

// Map a Prisma ItemStock row to the GraphQL shape. GraphQL schema types
// createdAt/updatedAt as String! and dueDate as String — Date objects must be
// explicitly ISO-stringified here rather than left for the default String
// scalar serializer, which coerces via Date.valueOf() (epoch milliseconds)
// before it ever reaches toJSON(). Mirrors item.resolver.ts's toGraphQL.
export function toGraphQL(row: PrismaItemStock): ItemStock {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
  } as unknown as ItemStock
}

export const itemStockResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    itemStocks: async (_, { locationId }, ctx) => {
      await requireLocationRole(ctx, locationId, 'viewer')
      const rows = await prisma.itemStock.findMany({ where: { locationId } })
      return (rows as unknown as PrismaItemStock[]).map(toGraphQL)
    },

    // Every location the caller holds a role on, any role (households H3a,
    // task 3.8). Until then it was `location: { userId }`, "the locations I
    // made", which misses a location another member made and shares, and keeps
    // one the caller made but no longer holds a role on.
    itemStocksForItem: async (_, { itemId }, ctx) => {
      // Scoped THROUGH the location — ItemStock has no userId of its own.
      // Postgres gives no ordering guarantee for findMany without orderBy; a
      // stable order is genuinely better for the client, not just testable.
      //
      // One household: the caller's (households H5 task F.2, decision T5). A
      // person in two households holds roles in both. Only a broken row could
      // put this household's item at the other household's location, but
      // nothing in the schema stops one.
      const locationIds = await locationIdsWithRole(ctx, 'viewer', {
        householdId: await requireHousehold(ctx),
      })
      const rows = await prisma.itemStock.findMany({
        where: { itemId, locationId: { in: locationIds } },
        orderBy: { locationId: 'asc' },
      })
      return (rows as unknown as PrismaItemStock[]).map(toGraphQL)
    },

    // Every location the caller holds a role on, at once. Cloud export needs
    // all of it in one request; `itemStocks(locationId:)` would cost one
    // request per location.
    //
    // `locationIdsWithRole`, NOT `requireLocationRole`: that helper takes a
    // single `locationId` and this query names none. `locationIdsWithRole`
    // (lib/authz.ts) is the list of locations the caller may read, with the
    // decision H18 filter, so a stale role row of a person who left the
    // household does not count. ItemStock has no userId of its own, by
    // design (root CLAUDE.md, Authorization). Until households H3a task 3.8
    // the scope was `location: { userId }`.
    //
    // One household only since households H4 task E.5 (decision T15): the
    // caller's household, `requireHousehold`. A person in two households
    // holds roles in both, so without the filter an export would carry the
    // other household's stock.
    allItemStocks: async (_, __, ctx) => {
      const locationIds = await locationIdsWithRole(ctx, 'viewer', {
        householdId: await requireHousehold(ctx),
      })
      // Postgres gives no ordering guarantee for findMany without orderBy, and
      // an export that reorders its rows on every run produces a different
      // file each time. `locationId` alone is not enough here: unlike
      // `itemStocksForItem`, this query spans several items, so many rows share
      // one location. `(locationId, itemId)` IS a total order, because
      // @@unique([itemId, locationId]) (prisma/schema.prisma:282) makes the
      // pair unique — no two rows can tie.
      const rows = await prisma.itemStock.findMany({
        where: { locationId: { in: locationIds } },
        orderBy: [{ locationId: 'asc' }, { itemId: 'asc' }],
      })
      return (rows as unknown as PrismaItemStock[]).map(toGraphQL)
    },
  },

  Mutation: {
    upsertItemStock: async (_, { itemId, locationId, input }, ctx) => {
      // No `requireAuth` of its own: `requireLocationRole` runs it first, so
      // an unauthenticated caller still fails before any read.
      await requireLocationRole(ctx, locationId, 'participant')
      // The item must be an item of the location's household (households
      // H3a, task 3.8). Checked before the write, so a refusal writes nothing.
      await requireLocationItems(ctx, locationId, [itemId])
      const data = toData(input as StockInput)
      // `writeStock` (lib/itemStockWrite.ts) is the one place per-location
      // stock is written. This resolver used to hold its own
      // `findUnique`-then-`update`-or-`create` block with the same zero
      // defaults — a second copy of the same upsert, which is how the two
      // could have drifted apart on what an omitted field means.
      //
      // One write, and nothing after it. Until cloud locations PR 5 this was
      // followed by a REVERSE mirror onto `Item`'s five legacy state columns,
      // run only when the location written was the caller's default, so a
      // browser on a pre-PR-2 bundle kept seeing its quantities move. PR 5
      // drops those columns: `ItemStock` is the only place a quantity lives
      // and there is nothing to mirror it onto. That is also why this resolver
      // no longer reads `isDefault` off the authorized row.
      const saved = await writeStock(itemId, locationId, data)
      // After the write (households H3c-2 task D.2). `writeStock` always
      // writes a row, so there is always something to tell other tabs.
      await publishChange(ctx, ['STOCK'], [{ locationId }])
      return toGraphQL(saved)
    },

    // Copy-on-add, matching local `addItemToLocation` (db/operations.ts).
    //
    // The body moved to `ensureStockAtLocation` (lib/itemStockWrite.ts) on
    // 2026-10-07 so `checkout` could call the SAME copy-on-add instead of
    // opening a row at `targetQuantity: 0`. Everything the old inline version
    // did — the no-op on an already-stocked location, the source-row search,
    // inheriting targetQuantity / refillThreshold / dueDate, zeroing the
    // on-hand quantities — is documented there. Since households H3a task 3.8
    // the source search reads the locations the caller holds a role on
    // (`locationIdsWithRole`), not `location: { userId }`.
    //
    // Neither this mutation nor `removeItemFromLocation` ever mirrored onto
    // `Item`'s legacy state columns, and that was deliberate rather than an
    // oversight — see `removeItemFromLocation` below. The columns are gone
    // since cloud locations PR 5, so nothing here has to mirror anything.
    addItemToLocation: async (_, { itemId, locationId, sourceLocationId }, ctx) => {
      await requireLocationRole(ctx, locationId, 'participant')
      await requireLocationItems(ctx, locationId, [itemId])
      // The copy-on-add reads the TARGET location's household only
      // (households H5 task F.2, decision T5). Not the caller's
      // (`requireHousehold`): the item is the location's household's
      // (`requireLocationItems` above), so its settings are there.
      const row = await ensureStockAtLocation(
        itemId,
        locationId,
        await locationIdsWithRole(ctx, 'viewer', { householdId: await householdOfLocation(locationId) }),
        sourceLocationId,
      )
      // After the write (households H3c-2 task D.2). Published even when the
      // item was already stocked here and nothing was written: knowing that
      // would need a second read or a new return shape for
      // `ensureStockAtLocation`, and the web only offers "add" for an item
      // not stocked here. A spare event costs the other tabs one refetch.
      await publishChange(ctx, ['STOCK'], [{ locationId }])
      return toGraphQL(row as unknown as PrismaItemStock)
    },

    removeItemFromLocation: async (_, { itemId, locationId }, ctx) => {
      requireAuth(ctx)
      // `organizer`, not `participant` (owner decision, 2026-11-11, plan H3a
      // *Owner decisions 2026-11-11*). The removal deletes EVERY log of the
      // item at this location, including the logs other members wrote, so it
      // needs a higher role than editing stock. No `requireLocationItems`
      // here: the mutation only deletes, so it never attaches an item.
      await requireLocationRole(ctx, locationId, 'organizer')
      // Three deletes, matching local's `removeItemFromLocation`
      // (apps/web/src/db/operations.ts): the stock row, this item's inventory
      // logs at this location, and this item's entries in this location's
      // carts. The carts themselves survive — every item in the location
      // shares them.
      //
      // The global Item survives too. An item removed from its last location
      // becomes an orphan: absent from the pantry but still in the catalog, so
      // it can be re-added. PR 3a added InventoryLog.locationId and
      // Cart.locationId, but their FK cascade fires on deleting a Location,
      // not on removing one item from one — so this resolver does it.
      //
      // HISTORY, kept so the absence is not read as an oversight. Between PRs
      // 2 and 4b a dual-write bridge copied the default location's stock onto
      // `Item`'s five legacy state columns. This mutation and
      // `addItemToLocation` above were the two stock mutations that never
      // joined it, because both mutate MEMBERSHIP and `Item`'s columns could
      // not express membership at all — the pre-location schema has no
      // "stocked here" concept, so any mirror here would have had to invent a
      // value (zeroing on remove would tell a pre-PR-2 browser "you have 0 of
      // this" while the item was still stocked elsewhere). Cloud locations
      // PR 5 dropped the columns and the bridge, so the question no longer
      // arises for any mutation.

      // One transaction: three deletes that must not half-apply. A stock row
      // deleted while its logs survive leaves the location's history pointing
      // at an item that is no longer stocked there, and a cart entry that
      // outlives its stock row is bought into a location the item has left.
      const deleted = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const stock = await tx.itemStock.deleteMany({ where: { itemId, locationId } })

        // `locationId` alone, with NO `?? DEFAULT_LOCATION_ID` fallback. Local
        // needs one because Dexie logs written before the Location feature
        // carry none; cloud's `InventoryLog.locationId` is NOT NULL since PR
        // 3a, so a fallback here would tell the next reader that NULLs are
        // possible when they are not.
        const logs = await tx.inventoryLog.deleteMany({ where: { itemId, locationId } })

        // `cart: { locationId }` is a relation filter on `Cart.locationId`,
        // the real column PR 3a added. `CartItem` itself has no `locationId`,
        // so the location has to come from its cart either way; this asks the
        // database for it in one statement instead of reading every cart entry
        // for the item and re-deriving the location from the cart id string in
        // JavaScript.
        //
        // `cartItemCountByItem` (resolvers/cart.resolver.ts) filters the SAME
        // way. The Stock tab shows that count in the confirmation dialog, so
        // the two must agree on what "in this location" means — a number the
        // removal then does not match would be a lie to the user.
        //
        // No `userId`: every row of the item in this location's carts goes,
        // whoever added it (households H3b task B.4). `CartItem.userId` means
        // "added by" and is never a scope. The log delete above has none
        // either: logs are scoped by their location.
        const cartItems = await tx.cartItem.deleteMany({ where: { itemId, cart: { locationId } } })
        return { stock: stock.count, logs: logs.count, cartItems: cartItems.count }
      })

      // ── THE LIVE EVENT (households H3c-2 task D.2) ──
      //
      // After the transaction has committed. One call, with each kind whose
      // rows the transaction really deleted (decision Q1: events stay
      // honest). `CART` matters most: the web does NOT refetch the cart
      // queries for `STOCK` or `LOG`, so without it other tabs keep showing
      // the deleted cart rows.
      const kinds: ChangeKind[] = []
      if (deleted.stock > 0) kinds.push('STOCK')
      if (deleted.logs > 0) kinds.push('LOG')
      if (deleted.cartItems > 0) kinds.push('CART')
      await publishChange(ctx, kinds, [{ locationId }])
      return true
    },

    // One unit switch, all-or-nothing. The cloud counterpart of local's
    // `applyUnitSwitchBatch` (apps/web/src/db/operations.ts), which does the
    // same over `items`, `itemStocks` and `recipes` in one Dexie transaction.
    //
    // A switch touches three kinds of row: the Item's configuration, one
    // ItemStock per location holding quantities in the OLD unit, and one
    // recipe per `defaultAmount` expressed in it. Written separately, a
    // failure partway leaves the item on the NEW unit while some locations
    // and recipes still hold old-unit numbers — mixed units, silently, with
    // no error for the user to act on. So it is one `prisma.$transaction`.
    applyUnitSwitch: async (_, { input }, ctx) => {
      const { itemId, updates, stockConversions, recipeUpdates } = input

      // ── AUTHORIZATION: the catalog first ─────────────────────────────────
      //
      // A unit switch is a CATALOG edit as well as a stock write: it writes
      // the Item's configuration and recipe amounts. So it needs household
      // role `manager`, the role every catalog write needs (households H3a,
      // task 3.7), as well as location `participant` below. A household
      // `member` who is a location participant may change quantities but not
      // the item's unit.
      const householdId = await requireCatalogRole(ctx, 'manager')

      // ── AUTHORIZATION: every location, before anything is written ────────
      //
      // `stockConversions` names several locations. Decided 2026-09-20: if the
      // caller lacks `participant` on ANY of them, the whole mutation fails with
      // FORBIDDEN and nothing changes.
      //
      // Converting only the locations the caller may write would leave the
      // item in mixed units across locations — the exact corruption the
      // transaction exists to prevent, just authorized rather than accidental.
      //
      // The checks run BEFORE the transaction opens, so a refusal has written
      // nothing even if rollback were broken.
      //
      // Since households H3a task 3.5 this can fire: a household member may
      // hold `viewer` on one of the named locations.
      //
      // Each location must also be a location of the ITEM's household
      // (`requireLocationItems`, lib/authz.ts). With the catalog check below,
      // that keeps the item, its stock rows and its recipes in one household.
      //
      // The return value is dropped. Until cloud locations PR 5 this loop also
      // collected which of the named locations was the caller's DEFAULT, for a
      // mirror onto `Item`'s five legacy state columns inside the transaction
      // below. PR 5 drops those columns, so `isDefault` is nothing this
      // resolver needs to know.
      for (const conversion of stockConversions) {
        await requireLocationRole(ctx, conversion.locationId, 'participant')
        await requireLocationItems(ctx, conversion.locationId, [itemId])
      }

      // The Item, and every item a recipe update names, must be the
      // household's (issue #273). Another household's id is FORBIDDEN, an id
      // no row holds is BAD_USER_INPUT. Until task 3.8 the Item was read with
      // `where: { id, userId }` (a missing item was NOT_FOUND), and the
      // recipes' item ids were not checked at all.
      await requireCatalogIds(ctx, householdId, 'item', [
        itemId,
        ...recipeUpdates.flatMap((update) => update.items.map((i) => i.itemId)),
      ])

      // Every recipe, also before the transaction. A query SCOPE
      // (`where: { id, householdId }`), the same shape `updateRecipe` uses —
      // not a `row.householdId === …` comparison, which plan H3a rule 9
      // forbids as an authorization check.
      for (const update of recipeUpdates) {
        const recipe = await prisma.recipe.findFirst({
          where: { id: update.recipeId, householdId },
        })
        if (!recipe) {
          throw new GraphQLError('Recipe not found', { extensions: { code: 'NOT_FOUND' } })
        }
      }

      // Whether the switch changed the catalog (the item's own settings, or a
      // recipe's item list). Set inside the callback, read only after
      // `$transaction` has resolved, for the live event below.
      let catalogChanged = recipeUpdates.length > 0
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // The Item's own configuration — `targetUnit`, `amountPerPackage`,
        // `consumeAmount` and the rest — through the SAME mapping `updateItem`
        // uses.
        //
        // No per-location state can arrive this way any more. Until cloud
        // locations PR 5 task 4, `UpdateItemInput` carried the five state
        // fields and five `delete itemData.<field>` lines stood here to drop
        // them before the write. The input no longer declares them and
        // `buildItemUpdateData` cannot emit them, so the deletes were removed
        // with the fields. Per-location state is `stockConversions`' to write,
        // and only `writeStock` below writes it.
        const itemData = buildItemUpdateData(updates)
        if (Object.keys(itemData).length > 0) {
          await tx.item.update({ where: { id: itemId }, data: itemData })
          catalogChanged = true
        }

        // EVERY named location, not just the default one. The conversion
        // factor (`amountPerPackage`) is global, so every stocked location
        // converts by it.
        //
        // `tx` is passed to `writeStock` as its fourth argument, and that is
        // required, not tidiness: `writeStock` defaults to the module-level
        // `prisma`, so omitting it here would issue the write OUTSIDE this
        // transaction, where it would survive a rollback and leave `Item` on
        // the new unit with a location still holding old-unit numbers.
        //
        // This loop held its own `tx.itemStock.upsert` until cloud locations
        // PR 5 task 3 — a third copy of the same upsert, with its own
        // hand-written list of the five zero defaults — because `writeStock`
        // took no client parameter then.
        for (const conversion of stockConversions) {
          const data = toData(conversion.quantities as StockInput)
          await writeStock(itemId, conversion.locationId, data, tx)
        }

        // Replace each recipe's item list wholesale — the shape
        // `updateRecipe(items:)` already takes, and the same full replacement
        // local mode writes to `Recipe.items`.
        for (const update of recipeUpdates) {
          await tx.recipeItem.deleteMany({ where: { recipeId: update.recipeId } })
          if (update.items.length) {
            await tx.recipeItem.createMany({
              data: update.items.map((i) => ({
                recipeId: update.recipeId,
                itemId: i.itemId,
                defaultAmount: i.defaultAmount,
              })),
            })
          }
        }
      })

      // ── THE LIVE EVENTS (households H3c-2 task D.2) ──
      //
      // After the transaction has committed. `STOCK` at every location the
      // switch converted. `CATALOG` for the household when it changed the
      // item's settings or a recipe. No `LOG`: a unit switch writes no
      // inventory log (the H3c-2 plan's table said it did).
      await publishChange(
        ctx,
        ['STOCK'],
        stockConversions.map((c) => ({ locationId: c.locationId })),
      )
      if (catalogChanged) await publishHouseholdChange(ctx, ['CATALOG'], householdId)

      const full = await prisma.item.findUniqueOrThrow({
        where: { id: itemId },
        include: { tags: true, vendors: true },
      })
      return itemToGraphQL(full) as Item
    },
  },
}
