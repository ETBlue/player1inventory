import * as path from 'node:path'
import { test, expect } from '@playwright/test'
import { CLOUD_SERVER_URL, E2E_USER_ID } from '../../constants'
import { makeGql } from '../../utils/cloud'
import { ItemPage } from '../../pages/ItemPage'
import { PantryPage } from '../../pages/PantryPage'
import { SettingsPage } from '../../pages/SettingsPage'
import { ShoppingPage } from '../../pages/ShoppingPage'
import { RecipesPage } from '../../pages/settings/RecipesPage'
import { RecipeDetailPage } from '../../pages/settings/RecipeDetailPage'
import cloudFixture from '../../fixtures/cloud-backup.json'

const LOCAL_FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/local-backup.json')

test.beforeEach(async ({ request }) => {
  await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
    headers: { 'x-e2e-user-id': E2E_USER_ID },
  })
})

test.afterEach(async ({ request }) => {
  await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
    headers: { 'x-e2e-user-id': E2E_USER_ID },
  })
})

// Helper: seed all fixture entities via GraphQL bulk create mutations
async function seedCloudFixture(request: import('@playwright/test').APIRequestContext) {
  const gql = makeGql(request)

  // Insert in dependency order: tagTypes → tags → vendors → items → recipes → logs → carts → cartItems
  await gql(
    `mutation BulkCreateTagTypes($tagTypes: [TagTypeInput!]!) { bulkCreateTagTypes(tagTypes: $tagTypes) { id } }`,
    { tagTypes: cloudFixture.tagTypes },
  )
  await gql(
    `mutation BulkCreateTags($tags: [TagInput!]!) { bulkCreateTags(tags: $tags) { id } }`,
    { tags: cloudFixture.tags },
  )
  await gql(
    `mutation BulkCreateVendors($vendors: [VendorInput!]!) { bulkCreateVendors(vendors: $vendors) { id } }`,
    { vendors: cloudFixture.vendors },
  )
  await gql(
    `mutation BulkCreateItems($items: [ItemInput!]!) { bulkCreateItems(items: $items) { id } }`,
    { items: cloudFixture.items },
  )
  await gql(
    `mutation BulkCreateRecipes($recipes: [RecipeInput!]!) { bulkCreateRecipes(recipes: $recipes) { id } }`,
    { recipes: cloudFixture.recipes },
  )
  await gql(
    `mutation BulkCreateInventoryLogs($logs: [InventoryLogInput!]!) { bulkCreateInventoryLogs(logs: $logs) { id } }`,
    { logs: cloudFixture.inventoryLogs },
  )
  await gql(
    `mutation BulkCreateShoppingCarts($carts: [ShoppingCartInput!]!) { bulkCreateShoppingCarts(carts: $carts) { id } }`,
    { carts: cloudFixture.shoppingCarts },
  )
  await gql(
    `mutation BulkCreateCartItems($cartItems: [CartItemInput!]!) { bulkCreateCartItems(cartItems: $cartItems) { id } }`,
    { cartItems: cloudFixture.cartItems },
  )
}

// Helper: run all 6 relation verifications after any import
async function verifyRelations(page: import('@playwright/test').Page) {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)
  const shopping = new ShoppingPage(page)
  const recipes = new RecipesPage(page)
  const recipeDetail = new RecipeDetailPage(page)

  // 1. Item in pantry
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Fixture Item')).toBeVisible()

  // 2. Tag assigned to item
  await pantry.getItemCard('Fixture Item').click()
  await page.waitForURL(/\/items\//)
  await item.navigateToTab('tags')
  await expect(item.getTagBadge('Fixture Tag')).toBeVisible()

  // 3. Vendor assigned to item
  await item.navigateToTab('vendors')
  await expect(item.getAssignedVendorBadge('Fixture Vendor')).toBeVisible()

  // 4. Inventory log entry
  await item.navigateToLogTab()
  await expect(item.getLogEntries()).toHaveCount(1)

  // 5. Recipe has item as ingredient
  await recipes.navigateTo()
  await recipes.getRecipeCard('Fixture Recipe').click()
  await page.waitForURL(/\/settings\/recipes\//)
  const recipeId = page.url().match(/\/settings\/recipes\/([^/]+)/)?.[1]
  if (!recipeId) throw new Error('Could not extract recipe ID from URL')
  await recipeDetail.navigateToItems(recipeId)
  await expect(recipeDetail.getAssignedItemCheckbox('Fixture Item')).toBeVisible()

  // 6. Cart item in shopping page
  await shopping.navigateTo()
  await expect(shopping.getItemCard('Fixture Item')).toBeVisible()
}

test('user can export and re-import cloud data (cloud → cloud)', async ({ page, request }) => {
  const settings = new SettingsPage(page)

  // Given: all fixture entities seeded via GraphQL
  await seedCloudFixture(request)

  // When: export via UI
  await settings.navigateTo()
  const download = await settings.triggerExport()
  const downloadPath = await download.path()
  if (!downloadPath) throw new Error('Download path is null')

  // Then: clear all cloud data
  await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
    headers: { 'x-e2e-user-id': E2E_USER_ID },
  })

  // When: import the downloaded file
  await settings.navigateTo()
  await settings.triggerImport(downloadPath)
  await settings.waitForImportDone('cloud')

  // Then: verify all relations
  await verifyRelations(page)
})

test('user can import a local backup into cloud mode (local → cloud)', async ({ page }) => {
  const settings = new SettingsPage(page)

  // Given: no existing cloud data (beforeEach cleanup ran)
  // When: import local fixture (UUID IDs — regression test for the UUID→ObjectId bug)
  await settings.navigateTo()
  await settings.triggerImport(LOCAL_FIXTURE_PATH)
  await settings.waitForImportDone('cloud')

  // Then: verify all relations
  await verifyRelations(page)
})
