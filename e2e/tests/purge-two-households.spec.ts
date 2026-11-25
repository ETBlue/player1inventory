import { expect, test } from '@playwright/test'
import { E2E_SECOND_USER_ID } from '../constants'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// That `clearAllData` (apps/server/src/resolvers/import.resolver.ts) deletes
// only the CALLER'S household, against real Postgres (households H3a, task
// 3.10, decision H10; design *Purge*, issue #320).
//
// Two users, A and B, each get their own household and one row of every
// model `clearAllData` deletes. A clears. Then:
//
// - every row of B's is still there, read back through B's own GraphQL, with
//   the same ids;
// - A is left with exactly one location, a new "Home" (decision H17), and
//   none of the rest.
//
// The unit tests (`clearAllData.resolver.test.ts`) pin each filter's exact
// TEXT against a fake. This file is what checks the filters MATCH the right
// rows in Postgres: a relation filter such as
// `{ cart: { location: { householdId } } }` can be written correctly and
// still match more than meant, and only real SQL shows that.
//
// ── THE TWO LOCATION PURGES (households H6 task J.8) ─────────────────────────
//
// Two more tests, in the second `describe`, check the purges of task J.4 the
// same way: `deleteAllLocations` and `removeAllLocationItems`
// (apps/server/src/resolvers/location.resolver.ts). Each household has
// "Home" and "Garage", each with a stock row, a cart row and a log, and a
// tag with a tag type on the one item. Garage is what lets the
// `removeAllLocationItems` test fail: with one location, "this location's
// rows" and "the household's rows" are the same rows.
//
// ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
//
// - **Nothing about a SHARED household.** Each user is alone in their own.
//   A second member's rows in the same household are deleted by design;
//   that needs `POST /e2e/household-members` (task 3.11).
// - **Nothing about the owner-only rule.** A and B are both owners. The
//   refusal of a manager or member is in the unit tests.
// - **The junction rows of B are read only through their parents**:
//   `Item.tagIds`, `Item.vendorIds` and `Recipe.items`. That is the only way
//   GraphQL exposes them.
//
// ── WHY THERE IS NO BROWSER ──────────────────────────────────────────────────
//
// The browser can only ever be `E2E_USER_ID` (one value is built into the
// web app), and this file needs two users. Everything goes through GraphQL
// with `makeGql`, like `location-scoped-writes.spec.ts`. It is in the
// `cloud` project's `testMatch` and the `local` project's `testIgnore`
// (e2e/playwright.config.ts).

// Two ids of their own, built from E2E_SECOND_USER_ID, so this file never
// shares an account with another spec.
const USER_A = `${E2E_SECOND_USER_ID}-purge-a`
const USER_B = `${E2E_SECOND_USER_ID}-purge-b`

type Row = { id: string }

const LOCATIONS = `query { locations { id name } }`
const CREATE_LOCATION = `mutation ($name: String!) { createLocation(name: $name) { id } }`
const CREATE_TAG_TYPE = `mutation ($name: String!, $color: String!) {
  createTagType(name: $name, color: $color) { id }
}`
const CREATE_TAG = `mutation ($name: String!, $typeId: String!) {
  createTag(name: $name, typeId: $typeId) { id }
}`
const CREATE_VENDOR = `mutation ($name: String!, $locationId: ID!) {
  createVendor(name: $name, locationId: $locationId) { id }
}`
const CREATE_ITEM = `mutation ($input: CreateItemInput!) {
  createItem(input: $input) { id }
}`
const CREATE_RECIPE = `mutation ($name: String!, $items: [RecipeItemInput!]) {
  createRecipe(name: $name, items: $items) { id }
}`
const CREATE_SHELF = `mutation ($name: String!, $type: String!, $itemIds: [String!]) {
  createShelf(name: $name, type: $type, itemIds: $itemIds) { id }
}`
const UPSERT_STOCK = `mutation ($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
  upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id }
}`
const VENDOR_CART = `query ($vendorId: ID, $locationId: ID!) {
  vendorCart(vendorId: $vendorId, locationId: $locationId) { id }
}`
const ADD_TO_CART = `mutation ($cartId: ID!, $itemId: ID!, $quantity: Int!) {
  addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id }
}`
const ADD_LOG = `mutation ($itemId: ID!, $delta: Float!, $quantity: Float!, $occurredAt: String!, $locationId: ID!) {
  addInventoryLog(itemId: $itemId, delta: $delta, quantity: $quantity, occurredAt: $occurredAt, locationId: $locationId) { id }
}`
const CLEAR_ALL_DATA = `mutation { clearAllData }`

// One read of everything a user can see. `itemStocksForItem` needs the
// item's id, which the seed returns.
const SNAPSHOT = `query ($itemId: ID!) {
  locations { id name }
  items { id tagIds vendorIds }
  tags { id }
  tagTypes { id }
  vendors { id }
  recipes { id items { itemId } }
  shelves { id }
  inventoryLogs { id }
  allCarts { id }
  allCartItems { id }
  itemStocksForItem(itemId: $itemId) { id }
}`

type Snapshot = {
  locations: { id: string; name: string }[]
  items: { id: string; tagIds: string[]; vendorIds: string[] }[]
  tags: Row[]
  tagTypes: Row[]
  vendors: Row[]
  recipes: { id: string; items: { itemId: string }[] }[]
  shelves: Row[]
  inventoryLogs: Row[]
  allCarts: Row[]
  allCartItems: Row[]
  itemStocksForItem: Row[]
}

type Gql = ReturnType<typeof makeGql>

/**
 * One row of every model `clearAllData` deletes, for one user, in their own
 * household. The same seed as `cleanup-endpoint.spec.ts`. Returns the item id
 * (for the snapshot) and the two location ids.
 */
async function seedEverything(
  gql: Gql,
  label: string,
): Promise<{ itemId: string; locationIds: string[] }> {
  // Location: the first request makes the household and "Home" (first
  // sign-in), and a second location is created outright
  const { locations } = await gql<{
    locations: { id: string }[]
  }>(LOCATIONS)
  const home = locations[0]
  if (!home) throw new Error(`${label}: no location after first sign-in`)
  const { createLocation } = await gql<{ createLocation: Row }>(
    CREATE_LOCATION,
    { name: `${label} Office` },
  )

  const { createTagType } = await gql<{ createTagType: Row }>(CREATE_TAG_TYPE, {
    name: `${label} Category`,
    color: 'orange',
  })
  const { createTag } = await gql<{ createTag: Row }>(CREATE_TAG, {
    name: `${label} Dairy`,
    typeId: createTagType.id,
  })
  // Also makes this vendor's cart at Home
  const { createVendor } = await gql<{ createVendor: Row }>(CREATE_VENDOR, {
    name: `${label} Shop`,
    locationId: home.id,
  })
  // Also makes one ItemTag and one ItemVendor
  const { createItem } = await gql<{ createItem: Row }>(CREATE_ITEM, {
    input: {
      name: `${label} Milk`,
      tagIds: [createTag.id],
      vendorIds: [createVendor.id],
    },
  })
  const itemId = createItem.id
  await gql(UPSERT_STOCK, {
    itemId,
    locationId: home.id,
    input: {
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 0,
    },
  })
  // Also makes one RecipeItem
  await gql(CREATE_RECIPE, {
    name: `${label} Pancakes`,
    items: [{ itemId, defaultAmount: 1 }],
  })
  await gql(CREATE_SHELF, {
    name: `${label} Fridge`,
    type: 'selection',
    itemIds: [itemId],
  })
  const { vendorCart } = await gql<{ vendorCart: Row }>(VENDOR_CART, {
    vendorId: null,
    locationId: home.id,
  })
  await gql(ADD_TO_CART, { cartId: vendorCart.id, itemId, quantity: 2 })
  await gql(ADD_LOG, {
    itemId,
    delta: 2,
    quantity: 5,
    occurredAt: new Date().toISOString(),
    locationId: home.id,
  })
  return { itemId, locationIds: [home.id, createLocation.id] }
}

/** The snapshot with every list sorted by id, so two reads compare equal. */
async function snapshot(gql: Gql, itemId: string): Promise<Snapshot> {
  const data = await gql<Snapshot>(SNAPSHOT, { itemId })
  const byId = <T extends { id: string }>(rows: T[]) =>
    [...rows].sort((a, b) => a.id.localeCompare(b.id))
  return {
    locations: byId(data.locations),
    items: byId(data.items),
    tags: byId(data.tags),
    tagTypes: byId(data.tagTypes),
    vendors: byId(data.vendors),
    recipes: byId(data.recipes),
    shelves: byId(data.shelves),
    inventoryLogs: byId(data.inventoryLogs),
    allCarts: byId(data.allCarts),
    allCartItems: byId(data.allCartItems),
    itemStocksForItem: byId(data.itemStocksForItem),
  }
}

test.beforeEach(async ({ request }) => {
  // The only cleanup of each test: it starts clean whatever ran before it (E2E speed plan, D7).
  // One call for both users (task S.4).
  await cleanupCloudData(request, [USER_A, USER_B])
})

test.describe('clearAllData clears one household only', () => {
  test("user can clear their household, and another household's data all survives", async ({
    request,
  }) => {
    const gqlA = makeGql(request, USER_A)
    const gqlB = makeGql(request, USER_B)

    // Given A and B each have one row of every model, in their own household
    const seedA = await seedEverything(gqlA, 'A')
    const seedB = await seedEverything(gqlB, 'B')

    // And B's data is really there. Without this, an empty B would make the
    // "B's rows survive" check below pass for any `clearAllData`.
    const beforeB = await snapshot(gqlB, seedB.itemId)
    expect(beforeB.locations).toHaveLength(2)
    expect(beforeB.items).toHaveLength(1)
    expect(beforeB.items[0]?.tagIds).toHaveLength(1)
    expect(beforeB.items[0]?.vendorIds).toHaveLength(1)
    expect(beforeB.tags).toHaveLength(1)
    expect(beforeB.tagTypes).toHaveLength(1)
    expect(beforeB.vendors).toHaveLength(1)
    expect(beforeB.recipes).toHaveLength(1)
    expect(beforeB.recipes[0]?.items).toHaveLength(1)
    expect(beforeB.shelves).toHaveLength(1)
    // Two: the seeded log, and the `stockCount` row the stock seed's
    // `upsertItemStock` wrote (inventory log layout, 2026-11-25)
    expect(beforeB.inventoryLogs).toHaveLength(2)
    expect(beforeB.allCartItems).toHaveLength(1)
    expect(beforeB.itemStocksForItem).toHaveLength(1)
    // Two carts: the vendor's, made by `createVendor`, and the no-vendor cart
    expect(beforeB.allCarts).toHaveLength(2)

    // And A's data is really there too, so "A's rows are gone" below means
    // something
    const beforeA = await snapshot(gqlA, seedA.itemId)
    expect(beforeA.items).toHaveLength(1)
    expect(beforeA.locations).toHaveLength(2)

    // When A clears their household
    const cleared = await gqlA<{ clearAllData: boolean }>(CLEAR_ALL_DATA)
    expect(cleared.clearAllData).toBe(true)

    // Then every one of B's rows survives, with the same ids and links
    const afterB = await snapshot(gqlB, seedB.itemId)
    expect(afterB).toEqual(beforeB)

    // And A is left with one new "Home", and nothing else (decision H17)
    const afterA = await snapshot(gqlA, seedA.itemId)
    expect(afterA.locations).toHaveLength(1)
    expect(afterA.locations[0]?.name).toBe('Home')
    expect(seedA.locationIds).not.toContain(afterA.locations[0]?.id)
    expect(afterA.items).toEqual([])
    expect(afterA.tags).toEqual([])
    expect(afterA.tagTypes).toEqual([])
    expect(afterA.vendors).toEqual([])
    expect(afterA.recipes).toEqual([])
    expect(afterA.shelves).toEqual([])
    expect(afterA.inventoryLogs).toEqual([])
    expect(afterA.allCarts).toEqual([])
    expect(afterA.allCartItems).toEqual([])
    expect(afterA.itemStocksForItem).toEqual([])
  })
})

// ── The two location purges (households H6 task J.8) ────────────────────────

const DELETE_ALL_LOCATIONS = `mutation { deleteAllLocations }`
const REMOVE_ALL_LOCATION_ITEMS = `mutation ($locationId: ID!) {
  removeAllLocationItems(locationId: $locationId)
}`

/** Everything at the two locations, and the catalog, read in one request. */
const LOCATION_SNAPSHOT = `query {
  locations { id name }
  items { id tagIds }
  tags { id }
  tagTypes { id }
  allItemStocks { id locationId }
  allCarts { id }
  allCartItems { id cartId }
  inventoryLogs { id locationId }
}`

type LocationSnapshot = {
  locations: { id: string; name: string }[]
  items: { id: string; tagIds: string[] }[]
  tags: Row[]
  tagTypes: Row[]
  allItemStocks: { id: string; locationId: string }[]
  allCarts: Row[]
  allCartItems: { id: string; cartId: string }[]
  inventoryLogs: { id: string; locationId: string }[]
}

type TwoLocations = { home: string; garage: string; itemId: string }

/**
 * One household with "Home" (first sign-in) and "Garage". The one item,
 * tagged with a tag that has a tag type, is stocked at both, has a cart row
 * at both and a log at both.
 */
async function seedTwoLocations(
  gql: Gql,
  label: string,
): Promise<TwoLocations> {
  const { locations } = await gql<{ locations: { id: string }[] }>(LOCATIONS)
  const home = locations[0]?.id
  if (!home) throw new Error(`${label}: no location after first sign-in`)
  const garage = (
    await gql<{ createLocation: Row }>(CREATE_LOCATION, { name: 'Garage' })
  ).createLocation.id

  const { createTagType } = await gql<{ createTagType: Row }>(CREATE_TAG_TYPE, {
    name: `${label} Category`,
    color: 'orange',
  })
  const { createTag } = await gql<{ createTag: Row }>(CREATE_TAG, {
    name: `${label} Dairy`,
    typeId: createTagType.id,
  })
  const { createItem } = await gql<{ createItem: Row }>(CREATE_ITEM, {
    input: { name: `${label} Milk`, tagIds: [createTag.id] },
  })
  const itemId = createItem.id

  for (const locationId of [home, garage]) {
    await gql(UPSERT_STOCK, {
      itemId,
      locationId,
      input: {
        targetQuantity: 4,
        refillThreshold: 1,
        packedQuantity: 3,
        unpackedQuantity: 0,
      },
    })
    const { vendorCart } = await gql<{ vendorCart: Row }>(VENDOR_CART, {
      vendorId: null,
      locationId,
    })
    await gql(ADD_TO_CART, { cartId: vendorCart.id, itemId, quantity: 2 })
    await gql(ADD_LOG, {
      itemId,
      delta: 2,
      quantity: 5,
      occurredAt: new Date().toISOString(),
      locationId,
    })
  }
  return { home, garage, itemId }
}

/** The snapshot with every list sorted by id, so two reads compare equal. */
async function locationSnapshot(gql: Gql): Promise<LocationSnapshot> {
  const data = await gql<LocationSnapshot>(LOCATION_SNAPSHOT)
  const byId = <T extends { id: string }>(rows: T[]) =>
    [...rows].sort((a, b) => a.id.localeCompare(b.id))
  return {
    locations: byId(data.locations),
    items: byId(data.items),
    tags: byId(data.tags),
    tagTypes: byId(data.tagTypes),
    allItemStocks: byId(data.allItemStocks),
    allCarts: byId(data.allCarts),
    allCartItems: byId(data.allCartItems),
    inventoryLogs: byId(data.inventoryLogs),
  }
}

/** The rows of one location: its stock, its cart rows and its logs. */
function rowsAt(snap: LocationSnapshot, locationId: string) {
  return {
    stock: snap.allItemStocks.filter((row) => row.locationId === locationId),
    // A cart id starts with its location id (`cartIdFor` in @p1i/types)
    cartItems: snap.allCartItems.filter((row) =>
      row.cartId.startsWith(`${locationId}:`),
    ),
    carts: snap.allCarts.filter((row) => row.id.startsWith(`${locationId}:`)),
    logs: snap.inventoryLogs.filter((row) => row.locationId === locationId),
  }
}

/**
 * Each location of a fresh seed has exactly one row of each kind, and two log
 * rows: the seeded log, and the `stockCount` row the stock seed's
 * `upsertItemStock` wrote (inventory log layout, 2026-11-25).
 */
function expectFullLocation(snap: LocationSnapshot, locationId: string) {
  const rows = rowsAt(snap, locationId)
  expect(rows.stock).toHaveLength(1)
  expect(rows.cartItems).toHaveLength(1)
  expect(rows.carts).toHaveLength(1)
  expect(rows.logs).toHaveLength(2)
}

test.describe('the location purges touch one household only', () => {
  test("household owner can delete all locations, and the catalog and another household's data stay", async ({
    request,
  }) => {
    const gqlA = makeGql(request, USER_A)
    const gqlB = makeGql(request, USER_B)

    // Given A and B each have Home and Garage with stock, a cart row and a
    // log at each, and a tagged item
    const seedA = await seedTwoLocations(gqlA, 'A')
    const seedB = await seedTwoLocations(gqlB, 'B')

    // And both households really hold those rows. Without this, an empty B
    // would make "B's rows survive" pass for any `deleteAllLocations`.
    const beforeA = await locationSnapshot(gqlA)
    const beforeB = await locationSnapshot(gqlB)
    for (const [snap, seed] of [
      [beforeA, seedA],
      [beforeB, seedB],
    ] as const) {
      expect(snap.locations).toHaveLength(2)
      expectFullLocation(snap, seed.home)
      expectFullLocation(snap, seed.garage)
      expect(snap.items).toHaveLength(1)
      expect(snap.tags).toHaveLength(1)
      expect(snap.tagTypes).toHaveLength(1)
    }

    // When A, the owner, deletes all locations
    const result = await gqlA<{ deleteAllLocations: boolean }>(
      DELETE_ALL_LOCATIONS,
    )
    expect(result.deleteAllLocations).toBe(true)

    // Then every one of B's rows is still there, with the same ids
    expect(await locationSnapshot(gqlB)).toEqual(beforeB)

    // And A has no location, and so no stock, cart, cart row or log. No new
    // "Home" is made (owner decision O34-A).
    const afterA = await locationSnapshot(gqlA)
    expect(afterA.locations).toEqual([])
    expect(afterA.allItemStocks).toEqual([])
    expect(afterA.allCarts).toEqual([])
    expect(afterA.allCartItems).toEqual([])
    expect(afterA.inventoryLogs).toEqual([])

    // And A's catalog stays: the item, its tag and the tag's type
    expect(afterA.items).toEqual(beforeA.items)
    expect(afterA.tags).toEqual(beforeA.tags)
    expect(afterA.tagTypes).toEqual(beforeA.tagTypes)
  })

  test("location organizer can remove all items from one location, and the other location and another household's data stay", async ({
    request,
  }) => {
    const gqlA = makeGql(request, USER_A)
    const gqlB = makeGql(request, USER_B)

    // Given A and B each have Home and Garage with stock, a cart row and a
    // log at each. A organizes both of A's locations (A made them).
    const seedA = await seedTwoLocations(gqlA, 'A')
    const seedB = await seedTwoLocations(gqlB, 'B')
    const beforeA = await locationSnapshot(gqlA)
    const beforeB = await locationSnapshot(gqlB)
    expectFullLocation(beforeA, seedA.home)
    expectFullLocation(beforeA, seedA.garage)
    expectFullLocation(beforeB, seedB.home)
    expectFullLocation(beforeB, seedB.garage)

    // When A removes all items from A's Home
    const result = await gqlA<{ removeAllLocationItems: boolean }>(
      REMOVE_ALL_LOCATION_ITEMS,
      { locationId: seedA.home },
    )
    expect(result.removeAllLocationItems).toBe(true)

    // Then Home has no stock and no cart rows
    const afterA = await locationSnapshot(gqlA)
    const home = rowsAt(afterA, seedA.home)
    expect(home.stock).toEqual([])
    expect(home.cartItems).toEqual([])

    // But Home's cart and its log are still there, with the same ids
    const homeBefore = rowsAt(beforeA, seedA.home)
    expect(home.carts).toEqual(homeBefore.carts)
    expect(home.logs).toEqual(homeBefore.logs)

    // And Garage is untouched
    expect(rowsAt(afterA, seedA.garage)).toEqual(rowsAt(beforeA, seedA.garage))

    // And the location and the catalog stay
    expect(afterA.locations).toEqual(beforeA.locations)
    expect(afterA.items).toEqual(beforeA.items)
    expect(afterA.tags).toEqual(beforeA.tags)
    expect(afterA.tagTypes).toEqual(beforeA.tagTypes)

    // And every one of B's rows is still there
    expect(await locationSnapshot(gqlB)).toEqual(beforeB)
  })
})
