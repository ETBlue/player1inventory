import { test, expect } from '@playwright/test'
import { PantryPage } from '../pages/PantryPage'

test('user can create an item', async ({ page }) => {
  const pantry = new PantryPage(page)
  await pantry.navigateTo()
  await pantry.clickAddItem()
  // ItemPage interaction added in next task
})
