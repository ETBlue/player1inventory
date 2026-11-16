import { GraphQLError } from 'graphql'
import { parseCartId } from '@p1i/types'
import type { Context } from '../context.js'
import type { ImportCheck, ImportCheckInput, Resolvers } from '../generated/graphql.js'
import { locationIdsWithRole, requireCatalogRole } from '../lib/authz.js'
import { prisma } from '../lib/prisma.js'

/**
 * The most ids one `importCheck` call takes, all lists together (households
 * H4 decision T3). The server's JSON body limit is 1 MB (`index.ts`), and
 * 1000 ids of about 40 characters stay far below it. The web sends a bigger
 * file in several calls and joins the answers (`checkImportIds`,
 * apps/web/src/lib/importData.ts).
 */
export const IMPORT_CHECK_MAX_IDS = 1000

type CatalogKey = 'items' | 'tags' | 'tagTypes' | 'vendors' | 'recipes' | 'shelves'

/** The two reads `importCheck` makes on a catalog model. */
interface CatalogReads {
  findMany(args: {
    where: { id: { in: string[] }; householdId?: string }
    select: { id: true }
  }): Promise<{ id: string }[]>
}

// Built per call, not at module load, so a test that swaps a method on the
// mocked `prisma` still sees its swap (the same reason as `catalogDelegate`
// in lib/authz.ts).
function catalogReads(key: CatalogKey): CatalogReads {
  const delegates = {
    items: prisma.item,
    tags: prisma.tag,
    tagTypes: prisma.tagType,
    vendors: prisma.vendor,
    recipes: prisma.recipe,
    shelves: prisma.shelf,
  } satisfies Record<CatalogKey, CatalogReads>
  return delegates[key]
}

const CATALOG_KEYS: CatalogKey[] = ['items', 'tags', 'tagTypes', 'vendors', 'recipes', 'shelves']

const ID_KEYS = [
  ...CATALOG_KEYS,
  'locations',
  'locationRefs',
  'itemRefs',
  'inventoryLogs',
  'carts',
  'cartItems',
  'itemStocks',
] as const satisfies readonly (keyof ImportCheckInput)[]

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } })
}

/** The ids of one list, without repeats. */
function listOf(ids: ImportCheckInput, key: (typeof ID_KEYS)[number]): string[] {
  return [...new Set(ids[key] ?? [])]
}

/** Which ids are taken by any row, and which of those are in the target. */
interface Split {
  taken: Set<string>
  own: Set<string>
}

/**
 * Two reads, as in `requireOwnRowOrUnclaimed`: the UNSCOPED one says which
 * ids are taken, the SCOPED one says which of them are in the target
 * household. A taken id that is not in the target is another household's. The
 * comparison is in SQL (the `householdId` filter), never `row.householdId ===`
 * here (root CLAUDE.md, *Authorization*). Works for the six catalog models
 * and for `Location`.
 */
async function splitByHousehold(
  reads: CatalogReads,
  ids: string[],
  target: string,
): Promise<Split> {
  if (ids.length === 0) return { taken: new Set(), own: new Set() }
  const taken = await reads.findMany({ where: { id: { in: ids } }, select: { id: true } })
  if (taken.length === 0) return { taken: new Set(), own: new Set() }
  const own = await reads.findMany({
    where: { id: { in: ids }, householdId: target },
    select: { id: true },
  })
  return { taken: new Set(taken.map((r) => r.id)), own: new Set(own.map((r) => r.id)) }
}

function hasOutside(split: Split): boolean {
  return split.taken.size > split.own.size
}

/** A row the file holds that already exists, and where it is stored. */
interface StoredRow {
  id: string
  locationId: string
}

/**
 * The answer of `importCheck` for one call, after the role check and the size
 * check (households H4 task E.2, and the review fixes recorded in the plan).
 *
 * The locations it looks at:
 *
 * - NAMED by the file: its location rows (`locations`), the locations its
 *   rows point at (`locationRefs`, sent by the web), and the location each
 *   cart id names (its prefix).
 * - STORED: where a log, stock row, cart item or cart the file holds already
 *   is in the cloud. The import would write over that row, and its mutation
 *   checks the stored location.
 *
 * The answers:
 *
 * - `anotherHousehold`: a catalog id or an `itemRefs` id is a row of another
 *   household, or a named or stored location exists and is not in the target.
 * - `blockedLocationIds`: NAMED locations of the target where the caller is
 *   below `participant`. The web drops the rows the file puts there.
 * - `renameBlockedLocationIds`: location ROWS of the file that exist in the
 *   target where the caller is `participant` but not `organizer`.
 *   `bulkUpsertLocations` (the `replace` strategy) asks `organizer`.
 * - `blockedRows`: rows the file holds that are STORED at a blocked location.
 *   For a cart: stored anywhere but at the location its id names
 *   (`cartVerdict` in lib/authz.ts). The web drops exactly these rows. A
 *   stored location is NOT added to `blockedLocationIds`: the file does not
 *   name it, and the caller may have no role there, so the web has no name to
 *   show.
 * - `missingLocationIds` / `missingItemIds`: `locationRefs` / `itemRefs` that
 *   no row will hold when the import writes. The bulk stock, log and cart
 *   mutations refuse such a reference (`requireLocationRole`, `cartVerdict`,
 *   `requireOwnItemStockRefs`). A location ROW of the file is never missing:
 *   the import creates it.
 *
 * With `forClear`, `clearAllData` deletes every row and location of the
 * target before the first write, and the file then creates its locations
 * again with the caller as organizer. So nothing is blocked, nothing needs
 * `organizer`, a stored row of the target is no conflict, and a reference to
 * a row of the target is missing unless the file holds that row too.
 *
 * **Which cart ids are read (decision T6).** `cartVerdict` reads the cart
 * table when the cart is WRITTEN: after the file's locations exist, and with
 * `forClear` after the clear. So a cart id is read here when its prefix will
 * be writable then, as far as the server can tell from this call:
 *
 * | Prefix | Without `forClear` | With `forClear` |
 * |---|---|---|
 * | a writable location of the target | read | read |
 * | another location of the target (viewer, no role) | not read | read |
 * | no location has that id | read | read |
 * | a location of another household | not read | not read |
 *
 * "No location has that id" is a database fact, so it does not depend on
 * which call holds the file's location row. With `forClear`, a stored cart at
 * a location of the target is deleted by the clear and ignored, so reading a
 * prefix the caller cannot write today tells them nothing about that
 * location's carts. Only a cart stored OUTSIDE the target changes the answer
 * (`anotherHousehold`), and that is another household's row the file names
 * by its id, like any catalog id.
 *
 * The carts of the file's existing CART ITEMS are read too, by the cart id
 * stored on the cart item, whatever their location, to find where each cart
 * item is. That read is not about an id the file chose.
 */
async function answerImportCheck(
  ctx: Context,
  ids: ImportCheckInput,
  target: string,
  forClear: boolean,
): Promise<ImportCheck> {
  let anotherHousehold = false
  for (const key of CATALOG_KEYS) {
    if (hasOutside(await splitByHousehold(catalogReads(key), listOf(ids, key), target))) {
      anotherHousehold = true
      break
    }
  }

  const itemRefs = listOf(ids, 'itemRefs')
  const referencedItems = await splitByHousehold(catalogReads('items'), itemRefs, target)
  if (hasOutside(referencedItems)) anotherHousehold = true
  const missingItemIds = itemRefs
    .filter((id) => !referencedItems.taken.has(id) || (forClear && referencedItems.own.has(id)))
    .sort()

  // Task E.3, decision T12: both location imports refuse these ids for the
  // whole batch, before any read.
  const locationRows = listOf(ids, 'locations')
  for (const id of locationRows) {
    if (id === 'local' || id.includes(':')) {
      throw badInput("A location id cannot be 'local' and cannot contain a colon.")
    }
  }

  const carts = listOf(ids, 'carts')
  const prefixOf = new Map<string, string>()
  for (const id of carts) {
    if (!id.includes(':')) {
      throw badInput('A cart id must start with its location id and a colon.')
    }
    prefixOf.set(id, parseCartId(id).locationId)
  }

  const locationRefs = listOf(ids, 'locationRefs')
  const named = new Set([...locationRows, ...locationRefs, ...prefixOf.values()])
  const namedSplit = await splitByHousehold(prisma.location, [...named], target)

  // Both empty with `forClear`: after the clear the file creates its
  // locations again, with the caller as organizer.
  const writable = forClear
    ? new Set<string>()
    : new Set(await locationIdsWithRole(ctx, 'participant', { householdId: target }))
  const organizes = forClear
    ? new Set<string>()
    : new Set(await locationIdsWithRole(ctx, 'organizer', { householdId: target }))

  const logIds = listOf(ids, 'inventoryLogs')
  const storedLogs: StoredRow[] =
    logIds.length === 0
      ? []
      : await prisma.inventoryLog.findMany({
          where: { id: { in: logIds } },
          select: { id: true, locationId: true },
        })

  const stockIds = listOf(ids, 'itemStocks')
  const storedStocks: StoredRow[] =
    stockIds.length === 0
      ? []
      : await prisma.itemStock.findMany({
          where: { id: { in: stockIds } },
          select: { id: true, locationId: true },
        })

  const cartItemIds = listOf(ids, 'cartItems')
  const cartItemRows =
    cartItemIds.length === 0
      ? []
      : await prisma.cartItem.findMany({
          where: { id: { in: cartItemIds } },
          select: { id: true, cartId: true },
        })
  const cartsOfItems = [...new Set(cartItemRows.map((row) => row.cartId))]
  const cartLocation = new Map(
    (cartsOfItems.length === 0
      ? []
      : await prisma.cart.findMany({
          where: { id: { in: cartsOfItems } },
          select: { id: true, locationId: true },
        })
    ).map((cart) => [cart.id, cart.locationId]),
  )
  const storedCartItems: StoredRow[] = cartItemRows.flatMap((row) => {
    const locationId = cartLocation.get(row.cartId)
    return locationId === undefined ? [] : [{ id: row.id, locationId }]
  })

  // Decision T6: see the table above.
  const willBeWritable = (prefix: string) =>
    !namedSplit.taken.has(prefix) || (forClear ? namedSplit.own.has(prefix) : writable.has(prefix))
  const readableCarts = carts.filter((id) => willBeWritable(prefixOf.get(id) ?? ''))
  const storedCarts: StoredRow[] =
    readableCarts.length === 0
      ? []
      : await prisma.cart.findMany({
          where: { id: { in: readableCarts } },
          select: { id: true, locationId: true },
        })

  const storedOnly = [
    ...new Set(
      [...storedLogs, ...storedStocks, ...storedCartItems, ...storedCarts]
        .map((row) => row.locationId)
        .filter((id) => !named.has(id)),
    ),
  ]
  const storedSplit = await splitByHousehold(prisma.location, storedOnly, target)
  if (hasOutside(namedSplit) || hasOutside(storedSplit)) anotherHousehold = true

  const inTarget = (locationId: string) =>
    namedSplit.own.has(locationId) || storedSplit.own.has(locationId)
  const blocked = (locationId: string) =>
    !forClear && inTarget(locationId) && !writable.has(locationId)
  const idsAt = (rows: StoredRow[]) =>
    rows
      .filter((row) => blocked(row.locationId))
      .map((row) => row.id)
      .sort()

  return {
    anotherHousehold,
    blockedLocationIds: [...named].filter(blocked).sort(),
    // Empty with `forClear`: both role sets are empty then.
    renameBlockedLocationIds: locationRows
      .filter((id) => namedSplit.own.has(id) && writable.has(id) && !organizes.has(id))
      .sort(),
    missingLocationIds: locationRefs
      .filter((id) => !namedSplit.taken.has(id) || (forClear && namedSplit.own.has(id)))
      .sort(),
    missingItemIds,
    blockedRows: {
      inventoryLogs: idsAt(storedLogs),
      itemStocks: idsAt(storedStocks),
      cartItems: idsAt(storedCartItems),
      // `cartVerdict` refuses a stored cart that is not at the location its
      // id names. One stored outside the target already made
      // `anotherHousehold` true above. With `forClear` one stored in the
      // target is deleted by the clear.
      carts: forClear
        ? []
        : storedCarts
            .filter((cart) => cart.locationId !== prefixOf.get(cart.id) && inTarget(cart.locationId))
            .map((cart) => cart.id)
            .sort(),
    },
  }
}

export const importCheckResolvers: Pick<Resolvers, 'Query'> = {
  Query: {
    /**
     * Before the first write of an import, say whether the file holds rows of
     * another household, and which of its locations the caller cannot write
     * (households H4 task E.2, decision T1). Read-only, so it publishes no
     * live event.
     *
     * The role check comes first and gives the TARGET household (decision
     * T8): `manager`, or `owner` for `forClear`, the role `clearAllData`
     * asks. So a household member gets `FORBIDDEN` even for an empty file,
     * and the web can tell a role refusal from an id refusal (T17).
     *
     * It is a help for the web, not a check the server trusts (decision T2).
     * Every bulk mutation keeps its own guards: a client can skip this call,
     * and two imports can run at the same time.
     *
     * It does tell a manager whether an id belongs to another household. The
     * `FORBIDDEN` / `'unclaimed'` answers of the bulk mutations already tell
     * that, one id at a time (plan H4, *Known gaps*).
     */
    importCheck: async (_, { ids, forClear }, ctx) => {
      const clear = forClear === true
      const target = await requireCatalogRole(ctx, clear ? 'owner' : 'manager')
      const count = ID_KEYS.reduce((sum, key) => sum + (ids[key]?.length ?? 0), 0)
      if (count > IMPORT_CHECK_MAX_IDS) {
        throw badInput(`At most ${IMPORT_CHECK_MAX_IDS} ids in one importCheck call.`)
      }
      return answerImportCheck(ctx, ids, target, clear)
    },
  },
}
