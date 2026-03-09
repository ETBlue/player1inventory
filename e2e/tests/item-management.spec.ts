import { test, expect } from '@playwright/test'
import { ItemPage } from '../pages/ItemPage'
import { PantryPage } from '../pages/PantryPage'

test('user can create an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given user is on the pantry page
  await pantry.navigateTo()

  // When user creates a new item
  await pantry.clickAddItem()
  await item.fillName('Test Milk')
  await item.save()

  // Then the item appears in the pantry list
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Test Milk')).toBeVisible()
})

test('user can edit an item name', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an existing item
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Edit Me')
  await item.save()

  // When user navigates back and reopens the item to edit it
  await pantry.navigateTo()
  await pantry.getItemCard('Edit Me').click()
  await item.fillName('Edited Name')
  await item.saveExisting()

  // Then the updated name appears in the pantry
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Edited Name')).toBeVisible()
  await expect(pantry.getItemCard('Edit Me')).not.toBeVisible()
})

test('user can assign a tag to an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an existing item
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Tagged Item')
  await item.save()

  // When user creates and assigns a tag (requires a tag type to exist first)
  await item.createAndAssignTag('Dairy', 'Category')

  // Then the tag badge appears on the item's tags tab
  await expect(page.getByText('Dairy')).toBeVisible()
})

test('user can assign a vendor to an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an existing item
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Vendor Item')
  await item.save()

  // When user creates and assigns a vendor
  await item.createAndAssignVendor('Costco')

  // Then the vendor badge is visible on the vendors tab (selected = neutral variant with X icon)
  // The badge renders with the vendor name text on the vendors tab
  await expect(page.getByRole('main').getByText('Costco')).toBeVisible()
})

test('user can delete an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  const item = new ItemPage(page)

  // Given an existing item
  await pantry.navigateTo()
  await pantry.clickAddItem()
  await item.fillName('Delete Me')
  await item.save()

  // Verify it exists in the pantry
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Delete Me')).toBeVisible()

  // When user opens the item and deletes it
  await pantry.getItemCard('Delete Me').click()
  await item.delete()

  // Then the item no longer appears in the pantry
  await pantry.navigateTo()
  await expect(pantry.getItemCard('Delete Me')).not.toBeVisible()
})
