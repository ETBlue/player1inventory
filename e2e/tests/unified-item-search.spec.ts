import { expect, test } from '@playwright/test'
import { seedRows } from '../helpers/locationSeed'
import { ShoppingPage } from '../pages/ShoppingPage'

// Unified item search, PR A — the cart page's two-section search tail.
//
// THE FIXTURE IS THE TEST. Milk is stocked ONLY at the Office. Against a
// location-blind implementation it reads as stocked here, lands in the cart's
// own list, and every assertion below stops distinguishing right from wrong.
//
// Locations are local-first (no cloud Location/ItemStock backend), so this
// flow is local-only.

const HOME = 'local' // DEFAULT_LOCATION_ID, seeded as "My Home"
const OFFICE = 'office-loc'
const COSTCO = 'vendor-costco'

// A real Date, NOT an ISO string. Playwright serializes Dates through
// `page.evaluate` intact, and `addItemToLocation` calls `.getTime()` on a
// stock row's `updatedAt` when picking a source row to copy from — a string
// there throws mid-click, which is exactly what the "Add to My Home" presses
// below exercise. Every existing seed spec passes Dates for the same reason.
const now = new Date()

test.beforeEach(async ({ page }) => {
  // Prevent the empty-data redirect to /onboarding so tests can navigate freely.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  await page.goto('/')

  await seedRows(page, 'locations', [
    { id: HOME, name: 'My Home', order: 0, createdAt: now, updatedAt: now },
    { id: OFFICE, name: 'Office', order: 1, createdAt: now, updatedAt: now },
  ])
  await seedRows(page, 'vendors', [
    { id: COSTCO, name: 'Costco', createdAt: now, updatedAt: now },
  ])
  await seedRows(page, 'items', [
    {
      id: 'item-milk',
      name: 'Milk',
      tagIds: [],
      vendorIds: [COSTCO],
      targetUnit: 'package',
      consumeAmount: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'item-bread',
      name: 'Bread',
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      consumeAmount: 1,
      createdAt: now,
      updatedAt: now,
    },
  ])
  // Milk exists only at the OFFICE; Bread only at HOME.
  await seedRows(page, 'itemStocks', [
    {
      id: 'stock-milk-office',
      itemId: 'item-milk',
      locationId: OFFICE,
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'stock-bread-home',
      itemId: 'item-bread',
      locationId: HOME,
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await seedRows(page, 'shoppingCarts', [
    {
      id: `${HOME}:${COSTCO}`,
      vendorId: COSTCO,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ])
})

test.afterEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    indexedDB.deleteDatabase('Player1Inventory')
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('user can find and stock an item that lives at another location', async ({
  page,
}) => {
  const shopping = new ShoppingPage(page)

  // Given Milk carries Costco but is stocked only at the Office
  // When the user searches for it in the Costco cart at My Home
  await shopping.searchInCart(COSTCO, 'milk')

  // Then it is offered under "not stocked here" instead of looking absent,
  // and Create is suppressed — it already exists globally (#245)
  await expect(shopping.getNotStockedHereDivider()).toBeVisible()
  await expect(shopping.getItemCard('Milk')).toBeVisible()
  await expect(shopping.getCreateItemButton()).toHaveCount(0)

  // When the user stocks it here
  await shopping.getTailActionButton('Add to My Home', 'Milk').click()

  // Then it lands in the cart's own list in one press — it already carried
  // the vendor, so there is no group step left to take
  await expect(shopping.getItemCheckbox('Milk')).toBeVisible()
  await expect(shopping.getNotStockedHereDivider()).toHaveCount(0)
})

test('user must press twice to stock an item here and add it to this cart', async ({
  page,
}) => {
  const shopping = new ShoppingPage(page)

  // Given Bread is stocked at My Home but carries no vendor
  // When the user searches for it in the Costco cart
  await shopping.searchInCart(COSTCO, 'bread')

  // Then it sits under "not in this list" with a vendor action, not in the cart
  await expect(shopping.getNotInThisListDivider()).toBeVisible()
  await expect(shopping.getItemCheckbox('Bread')).toHaveCount(0)

  // When the user applies the vendor
  await shopping.getTailActionButton('Apply Costco', 'Bread').click()

  // Then it joins the cart's pending list
  await expect(shopping.getItemCheckbox('Bread')).toBeVisible()
  await expect(shopping.getNotInThisListDivider()).toHaveCount(0)
})

test('user can create an item when nothing in the catalog matches', async ({
  page,
}) => {
  const shopping = new ShoppingPage(page)

  // Given no item is named Zucchini
  // When the user searches for it
  await shopping.searchInCart(COSTCO, 'Zucchini')

  // Then Create is offered — suppressing it here would be a dead end
  await expect(shopping.getCreateItemButton()).toBeVisible()
})

test('user stocking a vendored item from the no-vendor cart sees it filed under its vendor', async ({
  page,
}) => {
  const shopping = new ShoppingPage(page)

  // Given Milk carries Costco and is stocked only at the Office
  // When the user searches for it on the no-vendor cart
  await shopping.searchInCart('no-vendor', 'milk')

  // Then it is offered under "not stocked here"
  await expect(shopping.getNotStockedHereDivider()).toBeVisible()

  // When the user stocks it here
  await shopping.getTailActionButton('Add to My Home', 'Milk').click()

  // Then it moves into the middle section, which explains where it went
  // rather than offering an action — joining THIS group would mean stripping
  // Costco off the item
  await expect(shopping.getNotInThisListDivider()).toBeVisible()
  await expect(page.getByText('In Costco')).toBeVisible()
  await expect(shopping.getNotStockedHereDivider()).toHaveCount(0)
  // The label must be the REAL one a vendor cart would render — asserting a
  // count of 0 against a name no button ever carries proves nothing.
  await expect(
    shopping.getTailActionButton('Apply Costco', 'Milk'),
  ).toHaveCount(0)
})
