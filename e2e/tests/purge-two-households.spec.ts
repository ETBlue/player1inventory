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
  // Guards against a previous run that crashed before its teardown
  await cleanupCloudData(request, USER_A)
  await cleanupCloudData(request, USER_B)
})

test.afterEach(async ({ request }) => {
  await cleanupCloudData(request, USER_A)
  await cleanupCloudData(request, USER_B)
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
    expect(beforeB.inventoryLogs).toHaveLength(1)
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
