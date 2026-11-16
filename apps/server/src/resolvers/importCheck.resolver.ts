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

/**
 * True when some id in `ids` is a row of a household other than `target`.
 *
 * Two reads, as in `requireOwnRowOrUnclaimed`: the UNSCOPED one says which
 * ids are taken, the SCOPED one says which of them are in the target
 * household. A taken id that is not in the target is another household's. The
 * comparison is in SQL (the `householdId` filter), never `row.householdId ===`
 * here (root CLAUDE.md, *Authorization*).
 */
async function catalogOutsideTarget(
  key: CatalogKey,
  ids: string[],
  target: string,
): Promise<boolean> {
  if (ids.length === 0) return false
  const reads = catalogReads(key)
  const taken = await reads.findMany({ where: { id: { in: ids } }, select: { id: true } })
  if (taken.length === 0) return false
  const own = await reads.findMany({
    where: { id: { in: ids }, householdId: target },
    select: { id: true },
  })
  return own.length < taken.length
}

/**
 * Every location the file's location-scoped rows touch:
 *
 * - the `locations` list itself (the web puts in the file's location rows and
 *   the `locationId` of its stock rows and logs);
 * - the location each cart id names (its prefix, issue #361), even when no
 *   cart row holds that id yet;
 * - the location where a TAKEN log, stock row, cart or cart item is stored.
 *   The import would write over that row, so its location counts too.
 *
 * A cart id with no colon is refused with `BAD_USER_INPUT`, as the bulk cart
 * mutations refuse it (`requireOwnRowOrUnclaimed`, `cartVerdict`).
 */
async function touchedLocations(ids: ImportCheckInput): Promise<string[]> {
  const touched = new Set(listOf(ids, 'locations'))

  const carts = listOf(ids, 'carts')
  for (const id of carts) {
    if (!id.includes(':')) {
      throw badInput('A cart id must start with its location id and a colon.')
    }
    touched.add(parseCartId(id).locationId)
  }

  const add = (rows: { locationId: string }[]) => {
    for (const row of rows) touched.add(row.locationId)
  }

  const logs = listOf(ids, 'inventoryLogs')
  if (logs.length > 0) {
    add(
      await prisma.inventoryLog.findMany({
        where: { id: { in: logs } },
        select: { locationId: true },
      }),
    )
  }

  const stocks = listOf(ids, 'itemStocks')
  if (stocks.length > 0) {
    add(
      await prisma.itemStock.findMany({
        where: { id: { in: stocks } },
        select: { locationId: true },
      }),
    )
  }

  const cartItems = listOf(ids, 'cartItems')
  const cartIdsOfItems =
    cartItems.length === 0
      ? []
      : (
          await prisma.cartItem.findMany({
            where: { id: { in: cartItems } },
            select: { cartId: true },
          })
        ).map((row) => row.cartId)

  // The carts of the file and the carts its cart items sit in, in one read.
  const storedCarts = [...new Set([...carts, ...cartIdsOfItems])]
  if (storedCarts.length > 0) {
    add(
      await prisma.cart.findMany({
        where: { id: { in: storedCarts } },
        select: { locationId: true },
      }),
    )
  }

  return [...touched]
}

/**
 * The answer of `importCheck` for one call, after the role check and the size
 * check.
 *
 * - `anotherHousehold`: a catalog id is a row of another household, or a
 *   touched location (see `touchedLocations`) exists and is not in the
 *   target household.
 * - `blockedLocationIds`: the touched locations of the target household where
 *   the caller is below `participant` (`locationIdsWithRole` with the target
 *   household). Empty for `forClear`: `clearAllData` deletes every location
 *   of the household first, and the import then makes them again with the
 *   caller as organizer.
 *
 * A location id no row holds is neither: the import will create it.
 */
async function answerImportCheck(
  ctx: Context,
  ids: ImportCheckInput,
  target: string,
  forClear: boolean,
): Promise<ImportCheck> {
  let anotherHousehold = false
  for (const key of CATALOG_KEYS) {
    if (await catalogOutsideTarget(key, listOf(ids, key), target)) {
      anotherHousehold = true
      break
    }
  }

  const touched = await touchedLocations(ids)
  if (touched.length === 0) return { anotherHousehold, blockedLocationIds: [] }

  const existing = await prisma.location.findMany({
    where: { id: { in: touched } },
    select: { id: true },
  })
  const inTarget = (
    await prisma.location.findMany({
      where: { id: { in: touched }, householdId: target },
      select: { id: true },
    })
  ).map((row) => row.id)
  if (existing.length > inTarget.length) anotherHousehold = true

  if (forClear) return { anotherHousehold, blockedLocationIds: [] }

  const writable = new Set(
    await locationIdsWithRole(ctx, 'participant', { householdId: target }),
  )
  const blockedLocationIds = inTarget.filter((id) => !writable.has(id)).sort()
  return { anotherHousehold, blockedLocationIds }
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
