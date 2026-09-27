import { expect, test } from '@playwright/test'
import {
  CLEANUP_MODEL_KEYS,
  cleanupCloudData,
} from '../helpers/cloudTeardown'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE COVERS ────────────────────────────────────────────────────
//
// `DELETE /e2e/cleanup` (apps/server/src/index.ts) — that it really deletes the
// test user's rows, against real Postgres.
//
// ── WHY IT EXISTS (issue #319) ───────────────────────────────────────────────
//
// `apps/server/src/resolvers/purge-coverage.test.ts` guards the route's delete
// list, but it is a SOURCE-TEXT check. It asserts the string
// `prisma.location.deleteMany(` appears in `index.ts`. It never starts the
// server, never calls the route, and never reads the `where` clause. So this
// passes that guard, answers 200, and deletes nothing:
//
//   prisma.location.deleteMany({ where: { userId: someWrongValue } })
//
// `cleanupCloudData` could not see it either — until this issue it checked only
// the HTTP status.
//
// This spec closes that gap behaviourally: it seeds one row of EVERY model the
// route deletes, calls the route, and asserts every returned count is at least
// 1. A wrong `where` clause reports 0 for that model and the test fails.
//
// ── WHAT IT STILL DOES NOT COVER ─────────────────────────────────────────────
//
// `prisma.itemStock.deleteMany` remains covered by no test that can fail.
// `ItemStock` has no `userId`, so the source guard skips it, and both of its
// foreign keys are ON DELETE CASCADE (prisma/schema.prisma) — deleting the item
// or the location takes the stock rows with it. Delete that line and the rows
// still go; only the reported `itemStocks` count changes, and this spec's
// "at least 1" assertion is what notices. So the LINE is covered here, but the
// DATA it protects is not at risk either way.
//
// ── WHY THERE IS NO BROWSER ──────────────────────────────────────────────────
//
// The subject is a server route, not a screen. Everything below goes through
// GraphQL with `makeGql`, the same way `location-scoped-writes.spec.ts` does.
// This file runs in the `cloud` project only: it is named in that project's
// `testMatch` and in the `local` project's `testIgnore`
// (e2e/playwright.config.ts).
//
// ── CLEANING UP AFTER ITSELF ─────────────────────────────────────────────────
//
// This spec calls the cleanup endpoint as its SUBJECT, which is unusual. It
// still runs `cleanupCloudData` in `beforeEach` and `afterEach` like every
// other cloud spec, so a failure part-way through — before the subject call, or
// after the readbacks have created a fresh default location — still leaves the
// database empty for the next spec.

type Row = { id: string }

const LOCATIONS = `query { locations { id name isDefault } }`
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
  createItem(input: $input) { id tagIds vendorIds }
}`
const CREATE_RECIPE = `mutation ($name: String!, $items: [RecipeItemInput!]) {
  createRecipe(name: $name, items: $items) { id items { itemId defaultAmount } }
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

// Read-back queries. Every one is whole-account, so none of them needs an id
// that the cleanup has just destroyed.
const READ_BACK = `query ($itemId: ID!) {
  items { id }
  tags { id }
  tagTypes { id }
  vendors { id }
  recipes { id }
  shelves { id }
  inventoryLogs { id }
  allCarts { id }
  allCartItems { id }
  itemStocksForItem(itemId: $itemId) { id }
}`

type ReadBack = {
  items: Row[]
  tags: Row[]
  tagTypes: Row[]
  vendors: Row[]
  recipes: Row[]
  shelves: Row[]
  inventoryLogs: Row[]
  allCarts: Row[]
  allCartItems: Row[]
  itemStocksForItem: Row[]
}

test.beforeEach(async ({ request }) => {
  // Guards against a previous run that crashed before its teardown.
  await cleanupCloudData(request)
})

test.afterEach(async ({ request }) => {
  await cleanupCloudData(request)
})

test.describe('the /e2e/cleanup endpoint really deletes', () => {
  test('user data seeded across every model is gone after a cleanup, and every model reports what it deleted', async ({
    request,
  }) => {
    const gql = makeGql(request)

    // ── Given one row of every model the route deletes ───────────────────────

    // Location — the `locations` query creates the caller's default
    // (`ensureDefaultLocation`, apps/server/src/lib/defaultLocation.ts), and a
    // second is created outright. Two, so the readback can tell "the seeded
    // locations are gone" from "there happens to be one location".
    const { locations } = await gql<{
      locations: { id: string; isDefault: boolean }[]
    }>(LOCATIONS)
    const home = locations.find((loc) => loc.isDefault)
    if (!home) throw new Error(`no default location after the locations query — got ${JSON.stringify(locations)}`)
    const { createLocation } = await gql<{ createLocation: Row }>(CREATE_LOCATION, {
      name: 'Office',
    })
    const seededLocationIds = [home.id, createLocation.id]

    // TagType and Tag
    const { createTagType } = await gql<{ createTagType: Row }>(CREATE_TAG_TYPE, {
      name: 'Category',
      color: 'orange',
    })
    const { createTag } = await gql<{ createTag: Row }>(CREATE_TAG, {
      name: 'Dairy',
      typeId: createTagType.id,
    })

    // Vendor — and, as a side effect, this vendor's Cart at My Home
    // (`createVendor`, apps/server/src/resolvers/vendor.resolver.ts).
    const { createVendor } = await gql<{ createVendor: Row }>(CREATE_VENDOR, {
      name: 'Corner Shop',
      locationId: home.id,
    })

    // Item — and, through its `tagIds` / `vendorIds`, one ItemTag and one
    // ItemVendor. Those two junction models have no mutation of their own.
    const { createItem } = await gql<{
      createItem: { id: string; tagIds: string[]; vendorIds: string[] }
    }>(CREATE_ITEM, {
      input: {
        name: 'Milk',
        tagIds: [createTag.id],
        vendorIds: [createVendor.id],
      },
    })
    // `createItem` takes no id, so the server's cuid is what every later call
    // and the readback use.
    const itemId = createItem.id

    // ItemStock — `createItem` writes none (only `updateItem` mirrors stock to
    // the default location), so it is written here on purpose.
    await gql(UPSERT_STOCK, {
      itemId,
      locationId: home.id,
      input: { targetQuantity: 4, refillThreshold: 1, packedQuantity: 3, unpackedQuantity: 0 },
    })

    // Recipe — and, through its `items`, one RecipeItem.
    const { createRecipe } = await gql<{
      createRecipe: { id: string; items: { itemId: string }[] }
    }>(CREATE_RECIPE, {
      name: 'Pancakes',
      items: [{ itemId, defaultAmount: 1 }],
    })

    // Shelf
    await gql(CREATE_SHELF, {
      name: 'Fridge',
      type: 'selection',
      itemIds: [itemId],
    })

    // Cart and CartItem — the no-vendor cart at My Home, with one entry.
    const { vendorCart } = await gql<{ vendorCart: Row }>(VENDOR_CART, {
      vendorId: null,
      locationId: home.id,
    })
    await gql(ADD_TO_CART, { cartId: vendorCart.id, itemId, quantity: 2 })

    // InventoryLog
    await gql(ADD_LOG, {
      itemId,
      delta: 2,
      quantity: 5,
      occurredAt: new Date().toISOString(),
      locationId: home.id,
    })

    // ── The seed really wrote rows ───────────────────────────────────────────
    //
    // A seed that quietly wrote nothing would leave every readback empty, so the
    // "nothing is left" half at the bottom would pass while proving nothing. This
    // block is what stops that.
    //
    // It is not the ONLY guard: a fully dead seed also makes every deleted count
    // 0, which the count assertion below catches. What this block adds is WHERE
    // the failure lands. It fails before the route is even called, naming the
    // model whose seed is broken, instead of reporting "the route deleted
    // nothing" and sending the reader to `index.ts`. Measured 2026-09-25 with
    // `createShelf` removed: the run failed at `expect(before.shelves)`, not at
    // the count assertion.
    const before = await gql<ReadBack>(READ_BACK, { itemId })
    expect(before.items).toHaveLength(1)
    expect(before.tags).toHaveLength(1)
    expect(before.tagTypes).toHaveLength(1)
    expect(before.vendors).toHaveLength(1)
    expect(before.recipes).toHaveLength(1)
    expect(before.shelves).toHaveLength(1)
    expect(before.inventoryLogs).toHaveLength(1)
    expect(before.allCartItems).toHaveLength(1)
    expect(before.itemStocksForItem).toHaveLength(1)
    // Two carts: the one `createVendor` pre-created, and the no-vendor cart.
    expect(before.allCarts).toHaveLength(2)
    // The three junction models are read through their parents, which is the
    // only way GraphQL exposes them.
    expect(createItem.tagIds).toEqual([createTag.id])
    expect(createItem.vendorIds).toEqual([createVendor.id])
    expect(createRecipe.items.map((row) => row.itemId)).toEqual([itemId])

    // ── When the cleanup endpoint runs ───────────────────────────────────────
    const { deleted } = await cleanupCloudData(request)

    // ── Then every model reports at least one deleted row ────────────────────
    //
    // THIS IS THE ASSERTION THAT CATCHES A WRONG `where` CLAUSE. A filter that
    // matches nothing still answers 200 and still satisfies the source-text
    // guard in `purge-coverage.test.ts`; it reports 0 here.
    const zero = CLEANUP_MODEL_KEYS.filter((key) => deleted[key] < 1)
    expect(zero, `models that deleted nothing: ${JSON.stringify(deleted)}`).toEqual([])

    // ── And nothing of the user's is left ────────────────────────────────────
    const after = await gql<ReadBack>(READ_BACK, { itemId })
    expect(after.items).toEqual([])
    expect(after.tags).toEqual([])
    expect(after.tagTypes).toEqual([])
    expect(after.vendors).toEqual([])
    expect(after.recipes).toEqual([])
    expect(after.shelves).toEqual([])
    expect(after.inventoryLogs).toEqual([])
    expect(after.allCarts).toEqual([])
    expect(after.allCartItems).toEqual([])
    // Weak on its own: `ItemStock` cascades from both `Item` and `Location`, so
    // this is empty even if `itemStock.deleteMany` were removed. The `deleted`
    // count above is the assertion that speaks for that line.
    expect(after.itemStocksForItem).toEqual([])
    // NOT READ BACK: ItemTag, ItemVendor and RecipeItem. GraphQL exposes them
    // only through `Item.tagIds` / `Item.vendorIds` / `Recipe.items`, and all
    // three parents are gone by now. Their `deleted` counts above are the only
    // check on them.

    // Location is read back LAST, because reading it recreates one. The
    // `locations` query runs `ensureDefaultLocation`, so it answers with a
    // brand-new default — exactly one row, and not one of the seeded ids.
    // `afterEach` deletes it.
    const { locations: afterLocations } = await gql<{
      locations: { id: string }[]
    }>(LOCATIONS)
    expect(afterLocations).toHaveLength(1)
    expect(seededLocationIds).not.toContain(afterLocations[0].id)
  })
})
