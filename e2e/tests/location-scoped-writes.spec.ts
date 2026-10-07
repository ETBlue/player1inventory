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
// Since issue #336 it also covers ONE non-location behaviour of `checkout`:
// the on-hand total the purchase log records. That number now arrives from the
// client in the required `items` argument, and this file is the only place the
// whole path runs against real SQL, so the assertion belongs here even though
// it is not about location. It has its own fixture, `PACKED_FIXTURE`.
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

// A SECOND fixture, used by exactly one test: the one that proves the purchase
// log records the CONVERTED on-hand total (issue #336).
//
// FIXTURE above cannot prove it, and that is why this one exists rather than
// FIXTURE being edited. `getPackedTotal`
// (apps/web/src/lib/quantityUtils.ts) returns the plain sum
// `packedQuantity + unpackedQuantity` whenever `amountPerPackage` is unset or
// `unpackedQuantity` is 0 — and FIXTURE has no `amountPerPackage` and
// `unpackedQuantity: 0` at both locations. So against FIXTURE the correct code
// and the old buggy code give the SAME number, and a quantity assertion there
// would pass either way. Editing FIXTURE instead would also have changed the
// numbers the other three tests in this file assert on.
//
// ── WHY THESE EXACT NUMBERS ──
//
// `amountPerPackage` 6, 2 packed and 3 unpacked at OFFICE, buying 1. Three
// different implementations give three DIFFERENT answers, so the test can tell
// the right one from both wrong ones:
//
//   | What the code does                        | Logged quantity     |
//   |-------------------------------------------|---------------------|
//   | correct: getPackedTotal(pre) + delta      | 2 + 3/6 + 1 = 3.5   |
//   | the old bug: packed + unpacked, raw, post | 3 + 3 = 6           |
//   | delta folded into unpacked, then convert  | 2 + (3+1)/6 = 2.667 |
//
// The second row is MEASURED, not predicted: putting that line back in
// `cart.resolver.ts` on 2026-10-08 failed this test with
// `Expected: 3.5 / Received: 6`.
//
// HOME holds 9 packed and 1 unpacked, different from OFFICE's 2 and 3 on
// purpose. Identical rows cannot tell "read the cart's location" from "read the
// default location", the rule the whole file follows.
const PACKED_FIXTURE: Fixture = {
  locations: [
    { key: 'HOME', name: 'My Home', isDefault: true },
    { key: 'OFFICE', name: 'Office' },
  ],
  vendors: [],
  items: [{ id: MILK, name: 'Milk', amountPerPackage: 6 }],
  stocks: [
    { itemId: MILK, location: 'HOME', targetQuantity: 10, refillThreshold: 1, packedQuantity: 9, unpackedQuantity: 1 },
    { itemId: MILK, location: 'OFFICE', targetQuantity: 4, refillThreshold: 1, packedQuantity: 2, unpackedQuantity: 3 },
  ],
  shelves: [],
  recipes: [],
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
// `items` is REQUIRED (issue #336). It carries, per bought item, the on-hand
// total in PACKAGE units that the CLIENT computed — see `CheckoutItemInput` in
// apps/server/src/schema/cart.graphql for why the server cannot compute it.
// Omitting it fails GraphQL validation with
// `argument "items" of type "[CheckoutItemInput!]!" is required`, so every
// caller below has to supply the number the web client would have sent.
const CHECKOUT = `mutation ($cartId: ID!, $items: [CheckoutItemInput!]!, $note: String) {
  checkout(cartId: $cartId, items: $items, note: $note) { id lastPurchasedAt }
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

/** Seed `fixture` and return the two real location ids it names. */
async function seedFixture(
  request: APIRequestContext,
  fixture: Fixture,
): Promise<{ home: string; office: string }> {
  const locationIds = await seedCloudFixture(request, fixture)
  return { home: locationIds.HOME, office: locationIds.OFFICE }
}

/** Seed FIXTURE and return the two real location ids. */
async function seed(
  request: APIRequestContext,
): Promise<{ home: string; office: string }> {
  return seedFixture(request, FIXTURE)
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
    // The total the web client would send: Milk has no `amountPerPackage` here,
    // so `getPackedTotal({ packed: 5, unpacked: 0 })` is 5, plus the 2 bought.
    // This fixture CANNOT prove the pack conversion — without an
    // `amountPerPackage` the conversion and the plain sum give the same 7. The
    // test that proves it is `user sees the converted on-hand total …` below,
    // which seeds `PACKED_FIXTURE`.
    await gql(CHECKOUT, {
      cartId: vendorCart.id,
      items: [{ itemId: MILK, quantity: 7 }],
      note: 'bought at the office',
    })

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

  test('user sees the converted on-hand total in the purchase log for an item sold in packs', async ({
    request,
  }) => {
    // Given Milk sold in packs of 6, holding 2 packed and 3 unpacked at the
    // Office (and a different 9 packed / 1 unpacked at My Home, the default)
    const gql = makeGql(request)
    const { home, office } = await seedFixture(request, PACKED_FIXTURE)
    const { item } = await gql<{ item: { amountPerPackage: number | null } }>(ITEM, {
      id: MILK,
    })
    // The fixture really did write the pack size. Without it this whole test is
    // vacuous — `getPackedTotal` falls back to the plain sum, so the correct
    // code and the old buggy code would both log 6 and the assertion below
    // could not fail. A seed that silently dropped the field must not pass as
    // coverage.
    expect(item.amountPerPackage).toBe(6)

    // When the user buys 1 Milk from the OFFICE cart, sending the total the web
    // client computes: `getPackedTotal({ packed: 2, unpacked: 3,
    // amountPerPackage: 6 }) + 1` = 2.5 + 1 = 3.5
    // (apps/web/src/lib/checkoutQuantities.ts). The cart quantity is added
    // AFTER the conversion, because it is already counted in packs.
    const { vendorCart } = await gql<{ vendorCart: { id: string } }>(VENDOR_CART, {
      locationId: office,
    })
    await gql(ADD_TO_CART, { cartId: vendorCart.id, itemId: MILK, quantity: 1 })
    await gql(CHECKOUT, {
      cartId: vendorCart.id,
      items: [{ itemId: MILK, quantity: 3.5 }],
      note: 'bought a pack at the office',
    })

    // Then the log records 3.5, the converted total — not 6, which is what the
    // resolver wrote before issue #336 by adding the two stock columns raw
    // (3 packed + 3 unpacked after the purchase). THIS IS THE ASSERTION THE FIX
    // EXISTS FOR, and the only one in the repo that runs the whole path against
    // real Postgres: every server unit test for `checkout` uses the
    // hand-written Prisma fake in apps/server/src/test/.
    const officeLogs = await gql<{
      itemLogs: { delta: number; quantity: number; note: string | null }[]
    }>(ITEM_LOGS, { itemId: MILK, locationId: office })
    expect(officeLogs.itemLogs).toHaveLength(1)
    expect(officeLogs.itemLogs[0].quantity).toBe(3.5)
    // `delta` is still the server's own `ci.quantity` — only the converted
    // total moved to the client, so a swap of the two fields fails here.
    expect(officeLogs.itemLogs[0].delta).toBe(1)
    expect(officeLogs.itemLogs[0].note).toBe('bought a pack at the office')

    // And the DEFAULT location still has no log — the location assertion this
    // file exists for, kept on the new test too.
    const homeLogs = await gql<{ itemLogs: unknown[] }>(ITEM_LOGS, {
      itemId: MILK,
      locationId: home,
    })
    expect(homeLogs.itemLogs).toHaveLength(0)

    // And the OFFICE stock row gained a whole pack while its unpacked
    // remainder was left alone: 2 → 3 packed, 3 unpacked. `checkout` writes
    // `packedQuantity: { increment: ci.quantity }` and touches nothing else, so
    // a resolver that folded the purchase into `unpackedQuantity` fails here.
    const { itemStocksForItem } = await gql<{ itemStocksForItem: StockRow[] }>(
      STOCKS_FOR_ITEM,
      { itemId: MILK },
    )
    expect(stockAt(itemStocksForItem, office)).toMatchObject({
      packedQuantity: 3,
      unpackedQuantity: 3,
    })
    // And My Home's row is untouched, at its own different numbers.
    expect(stockAt(itemStocksForItem, home)).toMatchObject({
      packedQuantity: 9,
      unpackedQuantity: 1,
    })
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
