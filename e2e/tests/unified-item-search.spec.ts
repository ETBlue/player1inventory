import { expect, type Page, test } from '@playwright/test'
import { seedRows } from '../helpers/locationSeed'
import { PantryPage } from '../pages/PantryPage'
import { ShoppingPage } from '../pages/ShoppingPage'

// Unified item search — PR A: the cart page's two-section search tail. PR B
// (this file's pantry/shelf-detail blocks below): the same tail wired onto
// the flat pantry (bucket 3 only) and shelf detail (selection + filter
// shelves), via the shared `useItemSearchTailWiring` hook.
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

// Unified item search, PR B — the same tail wired onto the flat pantry
// (bucket 3 only) and shelf detail (selection + filter shelves).

test('user can find and stock an item that lives at another location from the flat pantry', async ({
  page,
}) => {
  const pantry = new PantryPage(page)

  // Given Milk is stocked only at the Office (top fixture)
  // When the user searches for it on the flat pantry
  await pantry.gotoWithSearch({ q: 'milk' })

  // Then it is offered under "not stocked here" — the flat pantry has no
  // bucket 2 (inGroupIds is every stocked-here item), so this is the only
  // tail section it ever shows
  await expect(pantry.getNotStockedHereDivider()).toBeVisible()
  await expect(pantry.getItemCard('Milk')).toBeVisible()

  // When the user stocks it here
  await pantry.getTailActionButton('Add to My Home', 'Milk').click()

  // Then it lands directly in the main list — bucket 1 IS bucket 2 on the
  // flat pantry, so there is no separate "not in this list" step
  await expect(pantry.getNotStockedHereDivider()).toHaveCount(0)
  await expect(pantry.getItemCard('Milk')).toBeVisible()
})

test('user must press twice to stock an item at a location and add it to a selection shelf', async ({
  page,
}) => {
  const pantry = new PantryPage(page)
  const fridgeShelfId = 'shelf-fridge'

  // Given a selection shelf with no members yet
  await seedRows(page, 'shelves', [
    {
      id: fridgeShelfId,
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [],
      createdAt: now,
      updatedAt: now,
    },
  ])

  // When the user searches for Milk (stocked only at the Office) inside the
  // Fridge shelf
  await pantry.gotoWithSearch({
    groupBy: 'shelf',
    id: fridgeShelfId,
    q: 'milk',
  })

  // Then it sits under "not stocked here", not the shelf's own list
  await expect(pantry.getNotStockedHereDivider()).toBeVisible()

  // When the user stocks it at My Home
  await pantry.getTailActionButton('Add to My Home', 'Milk').click()

  // Then it moves to "not in this list" — a single press did NOT also join
  // the shelf
  await expect(pantry.getNotInThisListDivider()).toBeVisible()
  await expect(pantry.getNotStockedHereDivider()).toHaveCount(0)

  // When the user presses "Add to shelf" — the second, separate press
  await pantry.getTailActionButton('Add to shelf', 'Milk').click()

  // Then it joins the shelf's own list and the tail clears entirely
  await expect(pantry.getNotInThisListDivider()).toHaveCount(0)
  await expect(pantry.getItemCard('Milk')).toBeVisible()
})

test('user can join a filter shelf in one press when its only unmet axis has a single option', async ({
  page,
}) => {
  const pantry = new PantryPage(page)
  const snackTagTypeId = 'tagtype-category'
  const snackTagId = 'tag-snacks'
  const snackShelfId = 'shelf-snacks'

  // Given a filter shelf that only matches a Snacks tag, and Bread (stocked
  // at My Home, per the top fixture, but carrying no tags) does not match it
  // yet — the tag axis offers exactly one option, so `defaultPicksFor` covers
  // the whole set and the press applies directly, no dialog
  await seedRows(page, 'tagTypes', [
    { id: snackTagTypeId, name: 'Category', color: 'blue' },
  ])
  await seedRows(page, 'tags', [
    { id: snackTagId, name: 'Snacks', typeId: snackTagTypeId },
  ])
  await seedRows(page, 'shelves', [
    {
      id: snackShelfId,
      name: 'Snack Shelf',
      type: 'filter',
      order: 0,
      filterConfig: { tagIds: [snackTagId] },
      createdAt: now,
      updatedAt: now,
    },
  ])

  // When the user searches for Bread inside the Snack Shelf
  await pantry.gotoWithSearch({
    groupBy: 'shelf',
    id: snackShelfId,
    q: 'bread',
  })

  // Then Bread is offered under "not in this list" with a real action button
  await expect(pantry.getNotInThisListDivider()).toBeVisible()

  // When the user presses it
  await pantry.getTailActionButton('Add to shelf', 'Bread').click()

  // Then Bread joins the shelf's own list with no dialog ever appearing —
  // the single-option axis needed no user choice
  await expect(pantry.getNotInThisListDivider()).toHaveCount(0)
  await expect(pantry.getItemCard('Bread')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('user picks per axis in the dialog when a filter shelf spans two tag types', async ({
  page,
}) => {
  const pantry = new PantryPage(page)
  const categoryTagTypeId = 'tagtype-category'
  const storageTagTypeId = 'tagtype-storage'
  const snackTagId = 'tag-snacks'
  const drinksTagId = 'tag-drinks'
  const fridgeTagId = 'tag-fridge'
  const freezerTagId = 'tag-freezer'
  const treatsShelfId = 'shelf-treats'

  // Given a filter shelf spanning TWO tag types, each offering two options,
  // and Bread (stocked at My Home, carrying no tags) matches neither axis —
  // both axes are unmet, so a press must satisfy BOTH (AND-joined) and the
  // dialog must open for the user to choose each rather than applying
  // anything automatically
  await seedRows(page, 'tagTypes', [
    { id: categoryTagTypeId, name: 'Category', color: 'blue' },
    { id: storageTagTypeId, name: 'Storage', color: 'green' },
  ])
  await seedRows(page, 'tags', [
    { id: snackTagId, name: 'Snacks', typeId: categoryTagTypeId },
    { id: drinksTagId, name: 'Drinks', typeId: categoryTagTypeId },
    { id: fridgeTagId, name: 'Fridge', typeId: storageTagTypeId },
    { id: freezerTagId, name: 'Freezer', typeId: storageTagTypeId },
  ])
  await seedRows(page, 'shelves', [
    {
      id: treatsShelfId,
      name: 'Treats Shelf',
      type: 'filter',
      order: 0,
      filterConfig: {
        tagIds: [snackTagId, drinksTagId, fridgeTagId, freezerTagId],
      },
      createdAt: now,
      updatedAt: now,
    },
  ])

  // When the user searches for Bread inside the Treats Shelf
  await pantry.gotoWithSearch({
    groupBy: 'shelf',
    id: treatsShelfId,
    q: 'bread',
  })

  // Then Bread is offered under "not in this list" with a real action button
  await expect(pantry.getNotInThisListDivider()).toBeVisible()

  // When the user presses it
  await pantry.getTailActionButton('Add to shelf', 'Bread').click()

  // Then the picker dialog opens, titled for this item and shelf, with
  // neither axis pre-selected — a 2-option axis gets no default
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('heading', { name: 'Add Bread to Treats Shelf' }),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Add' })).toBeDisabled()

  // When the user picks only the Category axis's option
  await dialog.getByRole('radio', { name: 'Snacks' }).click()

  // Then Confirm stays disabled — the Storage axis is still AND-joined and
  // unmet, so one axis being satisfied is not enough
  await expect(dialog.getByRole('button', { name: 'Add' })).toBeDisabled()

  // When the user also picks the Storage axis's option and confirms
  await dialog.getByRole('radio', { name: 'Fridge' }).click()
  await dialog.getByRole('button', { name: 'Add' }).click()

  // Then the dialog closes and Bread joins the shelf's own list
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(pantry.getNotInThisListDivider()).toHaveCount(0)
  await expect(pantry.getItemCard('Bread')).toBeVisible()
})

// Unified item search, PR C — the same tail wired onto vendor detail and
// recipe detail, the last two of the five surfaces.
//
// Both specs probe with MILK POWDER rather than the fixture's Milk, and that
// is deliberate: Milk already carries Costco, so stocking it here would drop
// it straight into the Costco page's own list in ONE press — the correct
// behaviour (there is no membership left to grant), but the wrong fixture for
// a two-step gate. A probe must be BOTH not-stocked-here AND outside the
// group for the second press to exist at all.
//
// `q: 'milk powder'` also isolates the probe from the fixture's Milk: the
// tail matches on `name.includes(query)`, and "milk" does not include
// "milk powder".

const MILK_POWDER = 'item-milk-powder'

// Seeds the probe: exists globally, stocked ONLY at the Office, carrying no
// vendor and belonging to no recipe.
async function seedMilkPowder(page: Page) {
  await seedRows(page, 'items', [
    {
      id: MILK_POWDER,
      name: 'Milk Powder',
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      consumeAmount: 1,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await seedRows(page, 'itemStocks', [
    {
      id: 'stock-milk-powder-office',
      itemId: MILK_POWDER,
      locationId: OFFICE,
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      createdAt: now,
      updatedAt: now,
    },
  ])
}

test('user must press twice to stock an item at a location and apply this vendor', async ({
  page,
}) => {
  const pantry = new PantryPage(page)

  // Given Milk Powder exists globally, stocked only at the Office, carrying
  // no vendor
  await seedMilkPowder(page)

  // When the user searches for it on the Costco vendor page
  await pantry.gotoWithSearch({
    groupBy: 'vendor',
    id: COSTCO,
    q: 'milk powder',
  })

  // Then the page really is Costco's — a wrong id would resolve no vendor and
  // silently suppress the group action below
  await expect(pantry.getDetailHeading('Costco')).toBeVisible()

  // And the item sits under "not stocked here", with no vendor action yet
  await expect(pantry.getNotStockedHereDivider()).toBeVisible()
  await expect(
    pantry.getTailActionButton('Apply Costco', 'Milk Powder'),
  ).toHaveCount(0)

  // When the user stocks it at My Home
  await pantry.getTailActionButton('Add to My Home', 'Milk Powder').click()

  // Then it moves to "not in this list" — a single press did NOT also apply
  // the vendor, or it would have landed in Costco's own list
  await expect(pantry.getNotInThisListDivider()).toBeVisible()
  await expect(pantry.getNotStockedHereDivider()).toHaveCount(0)

  // When the user applies the vendor — the second, separate press
  await pantry.getTailActionButton('Apply Costco', 'Milk Powder').click()

  // Then it joins Costco's own list and the tail clears entirely
  await expect(pantry.getNotInThisListDivider()).toHaveCount(0)
  await expect(pantry.getItemCard('Milk Powder')).toBeVisible()
})

test('user must press twice to stock an item at a location and add it to a recipe', async ({
  page,
}) => {
  const pantry = new PantryPage(page)
  const milkshakeId = 'recipe-milkshake'

  // Given Milk Powder exists globally, stocked only at the Office, and an
  // empty recipe
  await seedMilkPowder(page)
  await seedRows(page, 'recipes', [
    {
      id: milkshakeId,
      name: 'Milkshake',
      items: [],
      createdAt: now,
      updatedAt: now,
    },
  ])

  // When the user searches for it inside the Milkshake recipe
  await pantry.gotoWithSearch({
    groupBy: 'recipe',
    id: milkshakeId,
    q: 'milk powder',
  })

  // Then the page really is Milkshake's — a wrong id would resolve no recipe
  // and silently suppress the group action below
  await expect(pantry.getDetailHeading('Milkshake')).toBeVisible()

  // And the item sits under "not stocked here", with no recipe action yet
  await expect(pantry.getNotStockedHereDivider()).toBeVisible()
  await expect(
    pantry.getTailActionButton('Add to recipe', 'Milk Powder'),
  ).toHaveCount(0)

  // When the user stocks it at My Home
  await pantry.getTailActionButton('Add to My Home', 'Milk Powder').click()

  // Then it moves to "not in this list" — a single press did NOT also make it
  // an ingredient
  await expect(pantry.getNotInThisListDivider()).toBeVisible()
  await expect(pantry.getNotStockedHereDivider()).toHaveCount(0)

  // When the user adds it to the recipe — the second, separate press
  await pantry.getTailActionButton('Add to recipe', 'Milk Powder').click()

  // Then it joins the recipe's own list and the tail clears entirely
  await expect(pantry.getNotInThisListDivider()).toHaveCount(0)
  await expect(pantry.getItemCard('Milk Powder')).toBeVisible()
})
