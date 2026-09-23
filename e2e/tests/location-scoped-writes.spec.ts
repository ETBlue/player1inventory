import { type APIRequestContext, expect, test } from '@playwright/test'
import { seedCloudFixture } from '../helpers/cloudSeed'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import type { Fixture } from '../helpers/fixture'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE COVERS ────────────────────────────────────────────────────
//
// The four location-scoped WRITE resolvers that cloud-locations PRs 3b and 3c
// shipped, against real Postgres:
//
//   | Resolver                 | File                                   |
//   |--------------------------|----------------------------------------|
//   | `checkout`               | apps/server/src/resolvers/cart.resolver.ts      |
//   | `consumeRecipes`         | apps/server/src/resolvers/recipe.resolver.ts    |
//   | `removeItemFromLocation` | apps/server/src/resolvers/itemStock.resolver.ts |
//   | `applyUnitSwitch`        | apps/server/src/resolvers/itemStock.resolver.ts |
//
// Each was owed a manual cloud smoke test that was never run. Every server
// UNIT test for them runs against the hand-written Prisma fake in
// `apps/server/src/test/`, so before this file none of the four had ever
// executed against SQL. `E2E_TEST_MODE=true` routes `prisma.ts` at
// `TEST_DATABASE_URL` (a dedicated Neon branch), so these tests do.
//
// ── WHY THE FIXTURE ALWAYS HAS TWO LOCATIONS ─────────────────────────────────
//
// THIS IS THE POINT OF THE FILE. With one location, "the cart's location",
// "the cook's location" and "the caller's default location" are the same
// value, so every assertion below passes against a resolver that ignores
// location completely. That exact vacuous-fixture failure has already happened
// four times in this series (root CLAUDE.md → Proving a Test Works).
//
// So every test here:
//   1. seeds a SECOND, NON-DEFAULT location ('OFFICE'),
//   2. performs the action THERE, and
//   3. asserts on BOTH locations — the action landed at OFFICE, and HOME
//      (the default) was not touched.
//
// Assertion (3) is the one that fails when location scoping is dropped.
//
// ── WHY THESE ARE GraphQL CALLS AND NOT BROWSER CLICKS ───────────────────────
//
// The behaviour under test is the SERVER's: which `locationId` a row is
// written to. A browser-driven test would prove the client sends the right
// argument, which the pantry, shopping and cooking cloud specs already cover,
// and would add UI flake on top of a server assertion. `InventoryLog` exposes
// no `locationId` field in GraphQL either, so "which location did this log
// land at" is only answerable by asking `itemLogs(itemId:, locationId:)` once
// per location — which is what these tests do.
//
// This file runs in the `cloud` project only: it is named in that project's
// `testMatch` and in the `local` project's `testIgnore`
// (e2e/playwright.config.ts), the same way `settings/import-export-cloud.spec.ts`
// is. There is no `page` fixture used anywhere below.

const MILK = 'item-milk'
const PANCAKES = 'recipe-pancakes'

// 'HOME' and 'OFFICE' are symbolic keys, never ids — a cloud location id is a
// server-generated cuid. `seedCloudFixture` returns the key → real id map.
// HOME is the default location, so every action performed at OFFICE is an
// action at a NON-default location, which is what makes the assertions bite.
const FIXTURE: Fixture = {
  locations: [
    { key: 'HOME', name: 'My Home', isDefault: true },
    { key: 'OFFICE', name: 'Office' },
  ],
  vendors: [],
  items: [{ id: MILK, name: 'Milk' }],
  // Stocked at BOTH locations with DIFFERENT numbers. Different numbers matter:
  // identical rows cannot tell "wrote the right row" from "wrote both rows".
  stocks: [
    { itemId: MILK, location: 'HOME', targetQuantity: 4, refillThreshold: 1, packedQuantity: 3, unpackedQuantity: 0 },
    { itemId: MILK, location: 'OFFICE', targetQuantity: 2, refillThreshold: 1, packedQuantity: 5, unpackedQuantity: 0 },
  ],
  shelves: [],
  recipes: [{ id: PANCAKES, name: 'Pancakes', items: [{ itemId: MILK, defaultAmount: 1 }] }],
}

type StockRow = {
  itemId: string
  locationId: string
  targetQuantity: number
  refillThreshold: number
  packedQuantity: number
  unpackedQuantity: number
}

const ITEM_LOGS = `query ($itemId: ID!, $locationId: ID!) {
  itemLogs(itemId: $itemId, locationId: $locationId) { id delta quantity note }
}`
const STOCKS_FOR_ITEM = `query ($itemId: ID!) {
  itemStocksForItem(itemId: $itemId) {
    itemId locationId targetQuantity refillThreshold packedQuantity unpackedQuantity
  }
}`
const CART_ITEM_COUNT = `query ($itemId: ID!, $locationId: ID) {
  cartItemCountByItem(itemId: $itemId, locationId: $locationId)
}`
const VENDOR_CART = `query ($locationId: ID!) {
  vendorCart(vendorId: null, locationId: $locationId) { id }
}`
const RECIPES = `query { recipes { id name items { itemId defaultAmount } } }`
const ITEM = `query ($id: ID!) { item(id: $id) { id targetUnit amountPerPackage } }`

const ADD_TO_CART = `mutation ($cartId: ID!, $itemId: ID!, $quantity: Int!) {
  addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id quantity }
}`
const CHECKOUT = `mutation ($cartId: ID!, $note: String) {
  checkout(cartId: $cartId, note: $note) { id lastPurchasedAt }
}`
const CONSUME_RECIPES = `mutation ($input: ConsumeRecipesInput!) {
  consumeRecipes(input: $input) { allSucceeded itemResults { itemId success error } }
}`
const ADD_LOG = `mutation ($itemId: ID!, $delta: Float!, $quantity: Float!, $occurredAt: String!, $locationId: ID!, $note: String) {
  addInventoryLog(itemId: $itemId, delta: $delta, quantity: $quantity, occurredAt: $occurredAt, locationId: $locationId, note: $note) { id }
}`
const REMOVE_FROM_LOCATION = `mutation ($itemId: ID!, $locationId: ID!) {
  removeItemFromLocation(itemId: $itemId, locationId: $locationId)
}`
const APPLY_UNIT_SWITCH = `mutation ($input: ApplyUnitSwitchInput!) {
  applyUnitSwitch(input: $input) { id targetUnit amountPerPackage }
}`

/** The stock row for one location, or `undefined` when the item is not stocked there. */
function stockAt(rows: StockRow[], locationId: string): StockRow | undefined {
  return rows.find((row) => row.locationId === locationId)
}

test.beforeEach(async ({ request }) => {
  // Guards against a previous run that crashed before its teardown.
  await cleanupCloudData(request)
})

test.afterEach(async ({ request }) => {
  await cleanupCloudData(request)
})

/** Seed FIXTURE and return the two real location ids. */
async function seed(
  request: APIRequestContext,
): Promise<{ home: string; office: string }> {
  const locationIds = await seedCloudFixture(request, FIXTURE)
  return { home: locationIds.HOME, office: locationIds.OFFICE }
}

test.describe('cloud location-scoped writes — checkout and cooking', () => {
  test('user can check out at a non-default location and the log lands there, not at the default', async ({
    request,
  }) => {
    // Given Milk stocked at both My Home (default, 3 packed) and Office (5 packed)
    const gql = makeGql(request)
    const { home, office } = await seed(request)

    // When the user buys 2 Milk from the OFFICE cart
    const { vendorCart } = await gql<{ vendorCart: { id: string } }>(VENDOR_CART, {
      locationId: office,
    })
    // The cart id is `${locationId}:no-vendor` (apps/server/src/lib/cartId.ts).
    // Asserting it here pins the one value `checkout` reads its location from —
    // an id that lost its location prefix would make every assertion below
    // vacuous rather than failing.
    expect(vendorCart.id).toBe(`${office}:no-vendor`)
    await gql(ADD_TO_CART, { cartId: vendorCart.id, itemId: MILK, quantity: 2 })
    await gql(CHECKOUT, { cartId: vendorCart.id, note: 'bought at the office' })

    // Then the inventory log is at the OFFICE
    const officeLogs = await gql<{ itemLogs: { delta: number; quantity: number; note: string | null }[] }>(
      ITEM_LOGS,
      { itemId: MILK, locationId: office },
    )
    expect(officeLogs.itemLogs).toHaveLength(1)
    expect(officeLogs.itemLogs[0].delta).toBe(2)
    expect(officeLogs.itemLogs[0].note).toBe('bought at the office')

    // And the DEFAULT location has no log at all. This is the assertion that
    // fails when `checkout` writes the caller's default location instead of
    // the cart's.
    const homeLogs = await gql<{ itemLogs: unknown[] }>(ITEM_LOGS, {
      itemId: MILK,
      locationId: home,
    })
    expect(homeLogs.itemLogs).toHaveLength(0)

    // And only the OFFICE stock row moved: 5 + 2 = 7 packed, My Home still 3
    const { itemStocksForItem } = await gql<{ itemStocksForItem: StockRow[] }>(
      STOCKS_FOR_ITEM,
      { itemId: MILK },
    )
    expect(stockAt(itemStocksForItem, office)?.packedQuantity).toBe(7)
    expect(stockAt(itemStocksForItem, home)?.packedQuantity).toBe(3)
  })

  test('user can cook at a non-default location and the log lands there, not at the default', async ({
    request,
  }) => {
    // Given Milk stocked at both My Home (default, 3 packed) and Office (5 packed)
    const gql = makeGql(request)
    const { home, office } = await seed(request)

    // When the user cooks Pancakes at the OFFICE, consuming 1 Milk (5 → 4)
    const { consumeRecipes } = await gql<{
      consumeRecipes: { allSucceeded: boolean; itemResults: { error: string | null }[] }
    }>(CONSUME_RECIPES, {
      input: {
        occurredAt: new Date().toISOString(),
        recipeIds: [PANCAKES],
        locationId: office,
        items: [
          {
            itemId: MILK,
            packedQuantity: 4,
            unpackedQuantity: 0,
            delta: -1,
            quantity: 4,
            note: 'cooked at the office',
          },
        ],
      },
    })
    // `consumeRecipes` swallows a per-item failure into `itemResults` instead
    // of throwing, so a broken write would otherwise look like a clean run
    // with missing rows.
    expect(consumeRecipes.allSucceeded).toBe(true)

    // Then the inventory log is at the OFFICE
    const officeLogs = await gql<{ itemLogs: { delta: number; note: string | null }[] }>(
      ITEM_LOGS,
      { itemId: MILK, locationId: office },
    )
    expect(officeLogs.itemLogs).toHaveLength(1)
    expect(officeLogs.itemLogs[0].delta).toBe(-1)
    expect(officeLogs.itemLogs[0].note).toBe('cooked at the office')

    // And the DEFAULT location has no log at all — the assertion that fails
    // when `consumeRecipes` falls back to the caller's default location.
    const homeLogs = await gql<{ itemLogs: unknown[] }>(ITEM_LOGS, {
      itemId: MILK,
      locationId: home,
    })
    expect(homeLogs.itemLogs).toHaveLength(0)

    // And only the OFFICE stock row moved: 5 → 4 packed, My Home still 3
    const { itemStocksForItem } = await gql<{ itemStocksForItem: StockRow[] }>(
      STOCKS_FOR_ITEM,
      { itemId: MILK },
    )
    expect(stockAt(itemStocksForItem, office)?.packedQuantity).toBe(4)
    expect(stockAt(itemStocksForItem, home)?.packedQuantity).toBe(3)
  })
})

test.describe('cloud location-scoped writes — removing an item from one location', () => {
  test('user can remove an item from one location and the other location keeps its stock, logs and cart entries', async ({
    request,
  }) => {
    // Given Milk stocked at both locations, with one inventory log and one
    // cart entry at EACH. All three delete statements in
    // `removeItemFromLocation` are therefore given a row at the other location
    // that they must NOT delete.
    const gql = makeGql(request)
    const { home, office } = await seed(request)
    const occurredAt = new Date().toISOString()

    for (const [locationId, note] of [
      [home, 'home log'],
      [office, 'office log'],
    ] as const) {
      await gql(ADD_LOG, {
        itemId: MILK,
        delta: 1,
        quantity: 3,
        occurredAt,
        locationId,
        note,
      })
      const { vendorCart } = await gql<{ vendorCart: { id: string } }>(VENDOR_CART, {
        locationId,
      })
      await gql(ADD_TO_CART, { cartId: vendorCart.id, itemId: MILK, quantity: 1 })
    }

    // Both locations really are set up — asserted before the removal, so a
    // seed that quietly wrote nothing cannot masquerade as a clean delete.
    const before = await gql<{ itemStocksForItem: StockRow[] }>(STOCKS_FOR_ITEM, { itemId: MILK })
    expect(before.itemStocksForItem).toHaveLength(2)
    const beforeHomeCart = await gql<{ cartItemCountByItem: number }>(CART_ITEM_COUNT, {
      itemId: MILK,
      locationId: home,
    })
    expect(beforeHomeCart.cartItemCountByItem).toBe(1)

    // When the user removes Milk from the OFFICE
    const { removeItemFromLocation } = await gql<{ removeItemFromLocation: boolean }>(
      REMOVE_FROM_LOCATION,
      { itemId: MILK, locationId: office },
    )
    expect(removeItemFromLocation).toBe(true)

    // Then the OFFICE stock row is gone and MY HOME's survives
    const after = await gql<{ itemStocksForItem: StockRow[] }>(STOCKS_FOR_ITEM, { itemId: MILK })
    expect(after.itemStocksForItem).toHaveLength(1)
    expect(stockAt(after.itemStocksForItem, office)).toBeUndefined()
    expect(stockAt(after.itemStocksForItem, home)?.packedQuantity).toBe(3)

    // And the OFFICE logs are gone while MY HOME's survive
    const officeLogs = await gql<{ itemLogs: unknown[] }>(ITEM_LOGS, {
      itemId: MILK,
      locationId: office,
    })
    expect(officeLogs.itemLogs).toHaveLength(0)
    const homeLogs = await gql<{ itemLogs: { note: string | null }[] }>(ITEM_LOGS, {
      itemId: MILK,
      locationId: home,
    })
    expect(homeLogs.itemLogs).toHaveLength(1)
    expect(homeLogs.itemLogs[0].note).toBe('home log')

    // And the OFFICE cart entry is gone while MY HOME's survives. This is the
    // assertion that fails when the `cart: { locationId }` relation filter is
    // dropped from the `cartItem.deleteMany` call — without it the delete
    // spans every location's carts.
    const officeCart = await gql<{ cartItemCountByItem: number }>(CART_ITEM_COUNT, {
      itemId: MILK,
      locationId: office,
    })
    expect(officeCart.cartItemCountByItem).toBe(0)
    const homeCart = await gql<{ cartItemCountByItem: number }>(CART_ITEM_COUNT, {
      itemId: MILK,
      locationId: home,
    })
    expect(homeCart.cartItemCountByItem).toBe(1)

    // And the global Item survives — removal is a membership change, not a
    // delete (resolvers/itemStock.resolver.ts).
    const { item } = await gql<{ item: { id: string } | null }>(ITEM, { id: MILK })
    expect(item?.id).toBe(MILK)
  })
})

test.describe('cloud location-scoped writes — unit switch', () => {
  test('user can switch an item unit and every location converts, along with the recipe amount', async ({
    request,
  }) => {
    // Given Milk in packages at BOTH locations with DIFFERENT quantities —
    // My Home 4/1/3/0 and Office 2/1/5/0 — and a recipe asking for 1 package.
    // The two rows differ so a resolver that converts one row and copies it to
    // the other cannot pass.
    const gql = makeGql(request)
    const { home, office } = await seed(request)

    // When the user switches Milk from packages to measurement units, at 100
    // per package. Both locations' numbers are sent, and the recipe's
    // `defaultAmount` is rewritten from 1 package to 100 units.
    await gql(APPLY_UNIT_SWITCH, {
      input: {
        itemId: MILK,
        updates: { targetUnit: 'measurement', amountPerPackage: 100 },
        stockConversions: [
          {
            locationId: home,
            quantities: {
              targetQuantity: 400,
              refillThreshold: 100,
              packedQuantity: 0,
              unpackedQuantity: 300,
            },
          },
          {
            locationId: office,
            quantities: {
              targetQuantity: 200,
              refillThreshold: 100,
              packedQuantity: 0,
              unpackedQuantity: 500,
            },
          },
        ],
        recipeUpdates: [
          { recipeId: PANCAKES, items: [{ itemId: MILK, defaultAmount: 100 }] },
        ],
      },
    })

    // Then the Item carries the new unit configuration
    const { item } = await gql<{ item: { targetUnit: string; amountPerPackage: number } }>(
      ITEM,
      { id: MILK },
    )
    expect(item.targetUnit).toBe('measurement')
    expect(item.amountPerPackage).toBe(100)

    // And BOTH stock rows converted, each to its own numbers. The OFFICE
    // assertion is the one that fails when `applyUnitSwitch` converts only the
    // first (or only the default) location.
    const { itemStocksForItem } = await gql<{ itemStocksForItem: StockRow[] }>(
      STOCKS_FOR_ITEM,
      { itemId: MILK },
    )
    expect(stockAt(itemStocksForItem, home)).toMatchObject({
      targetQuantity: 400,
      refillThreshold: 100,
      packedQuantity: 0,
      unpackedQuantity: 300,
    })
    expect(stockAt(itemStocksForItem, office)).toMatchObject({
      targetQuantity: 200,
      refillThreshold: 100,
      packedQuantity: 0,
      unpackedQuantity: 500,
    })

    // And the recipe amount moved with them — the assertion that fails when
    // the `recipeUpdates` loop is skipped.
    const { recipes } = await gql<{
      recipes: { id: string; items: { itemId: string; defaultAmount: number }[] }[]
    }>(RECIPES)
    const pancakes = recipes.find((r) => r.id === PANCAKES)
    expect(pancakes?.items).toEqual([{ itemId: MILK, defaultAmount: 100 }])
  })
})
