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
