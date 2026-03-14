// Cloud-mode E2E tests for items CRUD.
//
// These tests reproduce bugs found in cloud mode:
//   Bug 1 — app stays on /items/new after create (onSuccess callback silently ignored)
//   Bug 2 — pantry list is stale after create (no refetchQueries on createItem mutation)
//   Bug 3 — "Item not found" on item detail page after navigating from pantry
//
// Run with: pnpm test:e2e:cloud
// Requires E2E_TEST_MODE=true on the server and VITE_E2E_TEST_USER_ID=e2e-test-user
// on the web app — both are wired up by playwright.cloud.config.ts.
import { test, expect, request } from '@playwright/test'
import { ItemPage } from '../pages/ItemPage'
import { PantryPage } from '../pages/PantryPage'

const E2E_SERVER_URL = 'http://localhost:4001'
const E2E_USER_ID = 'e2e-test-user'

// Clean up all test data from MongoDB after each test.
test.afterEach(async () => {
  const ctx = await request.newContext()
  await ctx.delete(`${E2E_SERVER_URL}/e2e/cleanup`, {
    headers: { 'x-e2e-user-id': E2E_USER_ID },
  })
  await ctx.dispose()
})

test('user can create an item and is navigated to item detail page in cloud mode', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given user is on the pantry page in cloud mode
  await pantry.navigateTo()

  // When user creates a new item
  await pantry.clickAddItem()
  await item.fillName('Cloud Milk')

  // Then saving navigates to the item detail page (not staying on /items/new)
  // BUG 1: this times out because onSuccess is silently ignored in cloud mode
  await item.save()

  // Verify the URL is the item detail page, not /items/new
  expect(page.url()).toMatch(/\/items\/(?!new)[^/]+$/)
})

test('new item appears in pantry list immediately after creation without page refresh in cloud mode', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given user creates an item in cloud mode
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Cloud Cheese')
  await item.save()

  // When user navigates to pantry WITHOUT refreshing
  // BUG 2: item not visible because GetItems cache was never invalidated after create
  await pantry.navigateTo()

  // Then the new item is immediately visible (no page reload needed)
  await expect(pantry.getItemCard('Cloud Cheese')).toBeVisible()
})

test('user can view item details after navigating from pantry in cloud mode', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an item exists in cloud mode
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Cloud Butter')
  await item.save()

  // When user navigates to pantry and clicks the item card
  await pantry.navigateTo()
  await pantry.getItemCard('Cloud Butter').click()

  // Then the item detail page loads correctly (no "Item not found")
  // BUG 3: shows "Item not found" instead of the item detail form
  await expect(page.getByText('Item not found')).not.toBeVisible()
  await expect(page.getByLabel('Name')).toBeVisible()
})

test('user can edit an item name in cloud mode', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an item exists
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Cloud Edit Me')
  await item.save()

  // When user opens the item and edits it
  await pantry.navigateTo()
  await pantry.getItemCard('Cloud Edit Me').click()
  await item.fillName('Cloud Edited')
  await item.saveExisting()

  // Then the updated name appears in the pantry
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Cloud Edited')).toBeVisible()
  await expect(pantry.getItemCard('Cloud Edit Me')).not.toBeVisible()
})

test('user can delete an item in cloud mode', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an item exists
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Cloud Delete Me')
  await item.save()

  // When user opens the item and deletes it
  await pantry.navigateTo()
  await pantry.getItemCard('Cloud Delete Me').click()
  await item.delete()

  // Then the item no longer appears in the pantry
  await expect(pantry.getItemCard('Cloud Delete Me')).not.toBeVisible()
})
