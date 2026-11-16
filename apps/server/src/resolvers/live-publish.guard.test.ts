import { describe, expect, it } from 'vitest'
import type { ChangeEvent } from '../lib/liveEvents.js'
import { createExecutableSchema } from '../schema/executableSchema.js'

// ── THE LIVE-EVENT GUARD (households H3c-1, task C.4) ──
//
// Every field of the `Mutation` type must be in EXACTLY ONE of the three
// lists below. The test fails when:
//
//   - a field is in no list (a new mutation was added and nobody decided
//     whether other tabs must hear about it);
//   - a field is in two lists;
//   - a listed field no longer exists in the schema.
//
// What this test CANNOT see: whether a resolver in `publishes` really calls
// `publishChange`. The per-mutation tests in
// `cart-live-publish.resolver.test.ts` and
// `stock-live-publish.resolver.test.ts` check that.
//
// `waitingForH3c2` must be EMPTY when H3c-2 ends (design, *Publishing*).
// Each entry says what H3c-2 will make it publish.
//
// The field list is read from the BUILT schema (`createExecutableSchema`),
// the one object Apollo and the socket both use. Not with `instanceof` or
// `isObjectType`: under Vitest two copies of `graphql` can be loaded (ESM and
// CommonJS), and the checks of one copy do not know the other's classes.
// `getMutationType()?.getFields()` is a plain method call and works with both.

type Kind = ChangeEvent['kind']

/**
 * Fields that publish now, with every kind each can publish. Some send a kind
 * only when it changed rows of that kind (see the resolver).
 */
const publishes: Record<string, { kinds: Kind[]; later?: string }> = {
  addToCart: { kinds: ['CART'] },
  updateCartItem: { kinds: ['CART'] },
  removeFromCart: { kinds: ['CART'] },
  abandonCart: { kinds: ['CART'] },
  checkout: { kinds: ['CART', 'STOCK', 'LOG'] },
  bootstrapCarts: { kinds: ['CART'] },
  bulkCreateShoppingCarts: { kinds: ['CART'] },
  bulkUpsertShoppingCarts: { kinds: ['CART'] },
  bulkCreateCartItems: { kinds: ['CART'] },
  bulkUpsertCartItems: { kinds: ['CART'] },
  deleteVendor: { kinds: ['CART'], later: 'H3c-2 adds CATALOG' },

  // ── Stock and logs (H3c-2 task D.2) ──
  addInventoryLog: { kinds: ['LOG'] },
  addItemToLocation: { kinds: ['STOCK'] },
  upsertItemStock: { kinds: ['STOCK'] },
  // It deletes the item's cart rows at that location too. The web does not
  // refetch carts for STOCK or LOG, so it sends CART itself (decision Q1).
  removeItemFromLocation: { kinds: ['STOCK', 'LOG', 'CART'] },
  // No LOG: a unit switch writes no inventory log. CATALOG is
  // household-level, for the item's settings and the recipe amounts.
  applyUnitSwitch: { kinds: ['STOCK', 'CATALOG'] },
  // CATALOG is household-level, for the recipes' `lastCookedAt`.
  consumeRecipes: { kinds: ['STOCK', 'LOG', 'CATALOG'] },
  bulkCreateItemStocks: { kinds: ['STOCK'] },
  bulkUpsertItemStocks: { kinds: ['STOCK'] },
  bulkCreateInventoryLogs: { kinds: ['LOG'] },
  bulkUpsertInventoryLogs: { kinds: ['LOG'] },
}

/**
 * Fields that change nothing another tab shows. Empty on purpose: on
 * 2026-11-16 every one of the 62 fields writes data that some screen of
 * another member shows. There is no user display name or language mutation
 * yet. Add one here only with a reason another tab does not need to know.
 */
const publishesNothing: Record<string, string> = {}

/** Fields that will publish in H3c-2, and what. */
const waitingForH3c2: Record<string, string> = {
  // ── They also delete or create cart rows ──
  // The web does NOT refetch the cart queries for CATALOG, STOCK or LOG
  // (decision Q1 of the H3c-2 plan). So each of these must publish CART
  // itself, at each location where it changed cart rows, or other tabs keep
  // showing cart rows that are gone. `deleteLocation` is the exception
  // (decision Q4): its LOCATION event refetches every query.
  deleteItem: 'CATALOG; and CART, STOCK and LOG at each location where it deleted rows (Prisma cascade)',
  deleteLocation: 'LOCATION (household-level, refetches every query, so no CART for the deleted location)',
  clearAllData: 'LOCATION and CATALOG (household-level; LOCATION refetches every query)',
  // It also CREATES one cart (the new vendor's, at the caller's location).
  createVendor: 'CATALOG; and CART at the location of the cart it made',

  // ── Locations ──
  createLocation: 'LOCATION',
  updateLocation: 'LOCATION',
  reorderLocations: 'LOCATION',
  bulkCreateLocations: 'LOCATION',
  bulkUpsertLocations: 'LOCATION',

  // ── The household ──
  // The household name is shown in every member's sidebar.
  renameHousehold: 'CATALOG (the household name; no location)',

  // ── The catalog: items, tags, vendors, recipes, shelves ──
  createItem: 'CATALOG',
  updateItem: 'CATALOG',
  createTag: 'CATALOG',
  updateTag: 'CATALOG',
  deleteTag: 'CATALOG',
  createTagType: 'CATALOG',
  updateTagType: 'CATALOG',
  deleteTagType: 'CATALOG',
  updateVendor: 'CATALOG',
  createRecipe: 'CATALOG',
  updateRecipe: 'CATALOG',
  deleteRecipe: 'CATALOG',
  updateRecipeLastCookedAt: 'CATALOG',
  createShelf: 'CATALOG',
  updateShelf: 'CATALOG',
  deleteShelf: 'CATALOG',
  reorderShelves: 'CATALOG',
  reorderShelfItems: 'CATALOG',
  applyShelfFilterPicks: 'CATALOG',
  bulkCreateItems: 'CATALOG',
  bulkUpsertItems: 'CATALOG',
  bulkCreateTags: 'CATALOG',
  bulkUpsertTags: 'CATALOG',
  bulkCreateTagTypes: 'CATALOG',
  bulkUpsertTagTypes: 'CATALOG',
  bulkCreateVendors: 'CATALOG',
  bulkUpsertVendors: 'CATALOG',
  bulkCreateRecipes: 'CATALOG',
  bulkUpsertRecipes: 'CATALOG',
  bulkCreateShelves: 'CATALOG',
  bulkUpsertShelves: 'CATALOG',
}

type Lists = {
  publishes: Record<string, unknown>
  publishesNothing: Record<string, unknown>
  waitingForH3c2: Record<string, unknown>
}

/**
 * Everything wrong with `lists` for these schema fields, as readable lines.
 * Empty means every field is in exactly one list and every listed name is a
 * field. A pure function, so the test below can also prove it on a made-up
 * schema.
 */
function guardProblems(fields: readonly string[], lists: Lists): string[] {
  const problems: string[] = []
  const known = new Set(fields)
  const where = new Map<string, string[]>()
  for (const [listName, list] of Object.entries(lists)) {
    for (const name of Object.keys(list)) {
      where.set(name, [...(where.get(name) ?? []), listName])
      if (!known.has(name)) problems.push(`${name}: listed in ${listName}, but it is not a Mutation field`)
    }
  }
  for (const field of fields) {
    const found = where.get(field) ?? []
    if (found.length === 0) problems.push(`${field}: in no list. Decide whether it publishes, and add it`)
    if (found.length > 1) problems.push(`${field}: in ${found.length} lists (${found.join(', ')})`)
  }
  return problems
}

function mutationFields(): string[] {
  const type = createExecutableSchema().getMutationType()
  if (!type) throw new Error('the built schema has no Mutation type')
  return Object.keys(type.getFields()).sort()
}

const lists = { publishes, publishesNothing, waitingForH3c2 }

describe('every Mutation field has a live-event decision', () => {
  it('every field is in exactly one list, and every listed name is a field', () => {
    expect(guardProblems(mutationFields(), lists)).toEqual([])
  })

  it('every entry says what it publishes, or why not', () => {
    for (const [name, { kinds }] of Object.entries(publishes)) {
      expect(kinds.length, name).toBeGreaterThan(0)
    }
    for (const [name, reason] of Object.entries({ ...publishesNothing, ...waitingForH3c2 })) {
      expect(reason.trim().length, name).toBeGreaterThan(0)
    }
  })

  it('the schema has as many fields as the three lists hold', () => {
    // A second, plainer check of the same rule. If this fails and the first
    // passes, `guardProblems` itself is wrong.
    const listed =
      Object.keys(publishes).length +
      Object.keys(publishesNothing).length +
      Object.keys(waitingForH3c2).length
    expect(listed).toBe(mutationFields().length)
  })
})

describe('guardProblems', () => {
  const empty = { publishes: {}, publishesNothing: {}, waitingForH3c2: {} }

  it('names a field that is in no list', () => {
    expect(guardProblems(['a', 'b'], { ...empty, publishes: { a: 1 } })).toEqual([
      'b: in no list. Decide whether it publishes, and add it',
    ])
  })

  it('names a field that is in two lists', () => {
    expect(
      guardProblems(['a'], { ...empty, publishes: { a: 1 }, waitingForH3c2: { a: 1 } }),
    ).toEqual(['a: in 2 lists (publishes, waitingForH3c2)'])
  })

  it('names a listed field the schema no longer has', () => {
    expect(guardProblems([], { ...empty, publishesNothing: { gone: 'x' } })).toEqual([
      'gone: listed in publishesNothing, but it is not a Mutation field',
    ])
  })
})
