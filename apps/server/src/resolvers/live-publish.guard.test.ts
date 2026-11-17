import { describe, expect, it } from 'vitest'
import type { ChangeEvent } from '../lib/liveEvents.js'
import { createExecutableSchema } from '../schema/executableSchema.js'

// ── THE LIVE-EVENT GUARD (households H3c-1, task C.4) ──
//
// Every field of the `Mutation` type must be in EXACTLY ONE of the two
// lists below: `publishes` or `publishesNothing`. The test fails when:
//
//   - a field is in no list (a new mutation was added and nobody decided
//     whether other tabs must hear about it);
//   - a field is in two lists;
//   - a listed field no longer exists in the schema.
//
// What this test CANNOT see: whether a resolver in `publishes` really calls
// `publishChange` or `publishHouseholdChange`. The per-mutation tests in
// `cart-live-publish.resolver.test.ts`,
// `stock-live-publish.resolver.test.ts`,
// `location-live-publish.resolver.test.ts` and
// `catalog-live-publish.resolver.test.ts` check that.
//
// Until households H3c-2 task D.4 there was a third list, `waitingForH3c2`,
// for the fields that did not publish yet. D.4 emptied it and deleted it.
//
// ── QUERIES THAT WRITE ──
//
// This test reads only `Mutation` fields. One QUERY writes too:
//
// - `vendorCart` creates the cart when it is missing, for a `participant` or
//   higher only (a `viewer` gets an unsaved empty cart since households H5
//   task F.2). It publishes nothing
//   (decision Q7 of the H3c-2 plan): the cart it creates is EMPTY (only
//   `id` and `locationId`, `cart.resolver.ts`), and the web shows an empty
//   cart the same as a missing one, so no other tab shows anything
//   different. Checked in task D.4. If it ever creates a cart WITH rows,
//   it must publish `CART`.
//
// `bootstrapCarts` (a mutation) also creates empty carts, and it does
// publish `CART` (households H3c-1). That costs other tabs one refetch and
// is harmless; the two were decided at different times.
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
const publishes: Record<string, { kinds: Kind[] }> = {
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

  // ── Locations and clear-all (H3c-2 task D.3) ──
  // All household-level (`locationId: null`, decision Q2). On the web
  // LOCATION refetches every active query (decision Q3).
  createLocation: { kinds: ['LOCATION'] },
  updateLocation: { kinds: ['LOCATION'] },
  // Not for an empty list, which writes nothing.
  reorderLocations: { kinds: ['LOCATION'] },
  // No CART, STOCK or LOG for the deleted location's rows (decision Q4):
  // nobody could pass the role check for them, and LOCATION refetches all.
  deleteLocation: { kinds: ['LOCATION'] },
  // Once per household a location was written in; nothing for skipped rows.
  bulkCreateLocations: { kinds: ['LOCATION'] },
  bulkUpsertLocations: { kinds: ['LOCATION'] },
  // Every location and the whole catalog of the household go.
  clearAllData: { kinds: ['LOCATION', 'CATALOG'] },

  // ── The catalog (H3c-2 task D.4) ──
  // `CATALOG` is household-level, for the caller's household: every catalog
  // write lands there (`requireCatalogRole`, or `requireHousehold` for the
  // imports). A write that changes nothing sends nothing.
  //
  // These three also change rows the web shows by LOCATION, and the web
  // does NOT refetch stock, logs or carts for `CATALOG` (decision Q1). So
  // each sends those kinds itself, at the locations it changed.
  // The Prisma cascade deletes its stock, logs and cart rows. Each kind only
  // at the locations where it had rows, read BEFORE the delete.
  deleteItem: { kinds: ['CATALOG', 'STOCK', 'LOG', 'CART'] },
  // It also creates the new vendor's cart at the caller's location, when the
  // caller is `participant` or higher there (not for a viewer, since H5).
  createVendor: { kinds: ['CATALOG', 'CART'] },
  // It deletes the vendor's carts at every location of the household.
  deleteVendor: { kinds: ['CATALOG', 'CART'] },
  // The household name is in every member's sidebar.
  renameHousehold: { kinds: ['CATALOG'] },
  // Households H5b, decision T19: household-level `LOCATION`, which makes
  // every open tab of the household refetch everything, the invite list too.
  // `revokeInvite` publishes only when it revoked something.
  createInvite: { kinds: ['LOCATION'] },
  revokeInvite: { kinds: ['LOCATION'] },
  // Households H5b task G.4: for the joined household only, after commit.
  joinHousehold: { kinds: ['LOCATION'] },
  // Households H5b task G.5, decision T19. `setHouseholdRole` publishes only
  // when the role changed. `removeMember` and `leaveHousehold` publish to the
  // household the person left; `createHousehold` to the new household.
  setHouseholdRole: { kinds: ['LOCATION'] },
  removeMember: { kinds: ['LOCATION'] },
  leaveHousehold: { kinds: ['LOCATION'] },
  createHousehold: { kinds: ['LOCATION'] },
  createItem: { kinds: ['CATALOG'] },
  updateItem: { kinds: ['CATALOG'] },
  createTag: { kinds: ['CATALOG'] },
  updateTag: { kinds: ['CATALOG'] },
  deleteTag: { kinds: ['CATALOG'] },
  createTagType: { kinds: ['CATALOG'] },
  updateTagType: { kinds: ['CATALOG'] },
  deleteTagType: { kinds: ['CATALOG'] },
  updateVendor: { kinds: ['CATALOG'] },
  createRecipe: { kinds: ['CATALOG'] },
  updateRecipe: { kinds: ['CATALOG'] },
  deleteRecipe: { kinds: ['CATALOG'] },
  updateRecipeLastCookedAt: { kinds: ['CATALOG'] },
  createShelf: { kinds: ['CATALOG'] },
  updateShelf: { kinds: ['CATALOG'] },
  deleteShelf: { kinds: ['CATALOG'] },
  // Not for an empty list, or ids that are not the household's.
  reorderShelves: { kinds: ['CATALOG'] },
  reorderShelfItems: { kinds: ['CATALOG'] },
  applyShelfFilterPicks: { kinds: ['CATALOG'] },
  // The imports publish once, in `finally`, when they saved at least one
  // row (`withCatalogEvent` in import.resolver.ts).
  bulkCreateItems: { kinds: ['CATALOG'] },
  bulkUpsertItems: { kinds: ['CATALOG'] },
  bulkCreateTags: { kinds: ['CATALOG'] },
  bulkUpsertTags: { kinds: ['CATALOG'] },
  bulkCreateTagTypes: { kinds: ['CATALOG'] },
  bulkUpsertTagTypes: { kinds: ['CATALOG'] },
  bulkCreateVendors: { kinds: ['CATALOG'] },
  bulkUpsertVendors: { kinds: ['CATALOG'] },
  bulkCreateRecipes: { kinds: ['CATALOG'] },
  bulkUpsertRecipes: { kinds: ['CATALOG'] },
  bulkCreateShelves: { kinds: ['CATALOG'] },
  bulkUpsertShelves: { kinds: ['CATALOG'] },
}

/**
 * Fields that change nothing another tab shows. Empty on purpose: on
 * 2026-11-16 every one of the 62 fields writes data that some screen of
 * another member shows. There is no user display name or language mutation
 * yet. Add one here only with a reason another tab does not need to know.
 */
const publishesNothing: Record<string, string> = {}

type Lists = {
  publishes: Record<string, unknown>
  publishesNothing: Record<string, unknown>
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

const lists = { publishes, publishesNothing }

describe('every Mutation field has a live-event decision', () => {
  it('every field is in exactly one list, and every listed name is a field', () => {
    expect(guardProblems(mutationFields(), lists)).toEqual([])
  })

  it('every entry says what it publishes, or why not', () => {
    for (const [name, { kinds }] of Object.entries(publishes)) {
      expect(kinds.length, name).toBeGreaterThan(0)
    }
    for (const [name, reason] of Object.entries(publishesNothing)) {
      expect(reason.trim().length, name).toBeGreaterThan(0)
    }
  })

  it('the schema has as many fields as the two lists hold', () => {
    // A second, plainer check of the same rule. If this fails and the first
    // passes, `guardProblems` itself is wrong.
    const listed = Object.keys(publishes).length + Object.keys(publishesNothing).length
    expect(listed).toBe(mutationFields().length)
  })
})

describe('guardProblems', () => {
  const empty = { publishes: {}, publishesNothing: {} }

  it('names a field that is in no list', () => {
    expect(guardProblems(['a', 'b'], { ...empty, publishes: { a: 1 } })).toEqual([
      'b: in no list. Decide whether it publishes, and add it',
    ])
  })

  it('names a field that is in two lists', () => {
    expect(
      guardProblems(['a'], { ...empty, publishes: { a: 1 }, publishesNothing: { a: 'x' } }),
    ).toEqual(['a: in 2 lists (publishes, publishesNothing)'])
  })

  it('names a listed field the schema no longer has', () => {
    expect(guardProblems([], { ...empty, publishesNothing: { gone: 'x' } })).toEqual([
      'gone: listed in publishesNothing, but it is not a Mutation field',
    ])
  })
})
