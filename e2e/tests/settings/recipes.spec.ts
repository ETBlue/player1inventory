import { test, expect, type Page } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../../constants'
import { RecipeDetailPage } from '../../pages/settings/RecipeDetailPage'
import { RecipesPage } from '../../pages/settings/RecipesPage'

// Seed a recipe (and optionally items) directly into IndexedDB.
// Navigate to '/' first so Dexie initialises the DB schema.
async function seedRecipe(
  page: Page,
  recipeName: string,
  items: { name: string; defaultAmount: number }[] = [],
): Promise<{ recipeId: string; itemIds: string[] }> {
  await page.goto('/')

  const recipeId = crypto.randomUUID()
  const itemIds = items.map(() => crypto.randomUUID())
  const now = new Date().toISOString()

  await page.evaluate(
    async ({ recipeId, itemIds, recipeName, items, now }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      const put = (storeName: string, record: object) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite')
          const req = tx.objectStore(storeName).put(record)
          req.onsuccess = () => resolve()
          req.onerror = () => reject(req.error)
        })

      // Seed items first (recipe references them)
      for (let i = 0; i < items.length; i++) {
        await put('items', {
          id: itemIds[i],
          name: items[i].name,
          tagIds: [],
          vendorIds: [],
          targetUnit: 'package',
          targetQuantity: 0,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
      }

      // Seed recipe with item references
      await put('recipes', {
        id: recipeId,
        name: recipeName,
        items: items.map((item, i) => ({
          itemId: itemIds[i],
          defaultAmount: item.defaultAmount,
        })),
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
    },
    { recipeId, itemIds, recipeName, items, now },
  )

  return { recipeId, itemIds }
}

// Seed a standalone item (not linked to any recipe)
async function seedItem(page: Page, name: string): Promise<string> {
  await page.goto('/')

  const itemId = crypto.randomUUID()
  const now = new Date().toISOString()

  await page.evaluate(
    async ({ itemId, name, now }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('items', 'readwrite')
        const req = tx.objectStore('items').put({
          id: itemId,
          name,
          tagIds: [],
          vendorIds: [],
          targetUnit: 'package',
          targetQuantity: 0,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    },
    { itemId, name, now },
  )

  return itemId
}

test.beforeEach(async ({ request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
  }
})

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
  } else {
    await page.goto('/')
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases()
      await Promise.all(
        dbs.map(({ name }) => {
          return new Promise<void>((resolve, reject) => {
            if (!name) {
              resolve()
              return
            }
            const req = indexedDB.deleteDatabase(name)
            req.onsuccess = () => resolve()
            req.onerror = () => reject(req.error)
            req.onblocked = () => {
              console.warn(`[afterEach] IndexedDB delete blocked for "${name}"...`)
              resolve()
            }
          })
        }),
      )
      localStorage.clear()
      sessionStorage.clear()
    })
  }
})

test('user can create a recipe', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Local mode only — cloud has its own create test')
  const recipes = new RecipesPage(page)

  // Given: recipes list is empty
  await recipes.navigateTo()

  // When: user clicks "New Recipe", fills name, and saves
  await recipes.clickNewRecipe()
  // URL becomes /settings/recipes/new?name= (query param from validateSearch)
  await page.waitForURL((url) => url.pathname === '/settings/recipes/new')
  await recipes.fillRecipeName('Pancakes')
  await recipes.clickSave()

  // Wait for redirect to the detail page after save
  await page.waitForURL((url) => url.pathname.startsWith('/settings/recipes/') && url.pathname !== '/settings/recipes/new')

  // Then: navigate back to list to verify the recipe appears
  await recipes.navigateTo()
  await expect(recipes.getRecipeCard('Pancakes')).toBeVisible()
})

test('user can delete a recipe', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Local mode only — uses IndexedDB seeding')
  const recipes = new RecipesPage(page)

  // Given: recipe "Pancakes" exists (seeded via IndexedDB)
  await seedRecipe(page, 'Pancakes')

  // When: navigate to recipes list
  await recipes.navigateTo()
  await expect(recipes.getRecipeCard('Pancakes')).toBeVisible()

  // And: user clicks delete and confirms
  await recipes.clickDeleteRecipe('Pancakes')
  await recipes.confirmDelete()

  // Then: "Pancakes" card is gone
  await expect(recipes.getRecipeCard('Pancakes')).not.toBeVisible()
})

test('user can navigate to recipe detail after creating', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Local mode only — cloud has its own create test')
  const recipes = new RecipesPage(page)

  // Given: recipes list is empty
  await recipes.navigateTo()

  // When: user creates "Pancakes"
  await recipes.clickNewRecipe()
  await recipes.fillRecipeName('Pancakes')
  await recipes.clickSave()

  // Then: URL is /settings/recipes/<id> (detail page, not the new page)
  await expect(page).toHaveURL(/\/settings\/recipes\/[^/]+$/)
})

test('user can assign and unassign an item on Items tab', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Local mode only — uses IndexedDB seeding')
  const detail = new RecipeDetailPage(page)

  // Given: recipe "Pancakes" (no items) and unassigned item "Eggs"
  const { recipeId } = await seedRecipe(page, 'Pancakes')
  await seedItem(page, 'Eggs')

  // When: navigate to Items tab
  await detail.navigateToItems(recipeId)

  // Then: "Eggs" shows as unassigned (Add checkbox visible)
  await expect(detail.getItemCheckbox('Eggs')).toBeVisible()

  // When: check (assign)
  await detail.toggleItem('Eggs')

  // Then: "Eggs" shows as assigned (Remove checkbox visible)
  await expect(detail.getAssignedItemCheckbox('Eggs')).toBeVisible()

  // When: uncheck (unassign)
  await detail.toggleItem('Eggs')

  // Then: back to unassigned
  await expect(detail.getItemCheckbox('Eggs')).toBeVisible()
})

test('user can adjust default amount for an assigned item', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Local mode only — uses IndexedDB seeding')
  const detail = new RecipeDetailPage(page)

  // Given: recipe "Pancakes" with "Flour" assigned at defaultAmount=2
  const { recipeId } = await seedRecipe(page, 'Pancakes', [
    { name: 'Flour', defaultAmount: 2 },
  ])

  // When: navigate to Items tab
  await detail.navigateToItems(recipeId)

  // Then: Flour is assigned (Remove checkbox visible) and amount display shows 2
  await expect(detail.getAssignedItemCheckbox('Flour')).toBeVisible()
  await expect(detail.getAmountDisplay('Flour')).toHaveText('2')

  // When: click + (increase)
  await detail.clickIncreaseAmount('Flour')

  // Then: amount is 3 (step = consumeAmount = 1)
  await expect(detail.getAmountDisplay('Flour')).toHaveText('3')

  // When: click − twice
  await detail.clickDecreaseAmount('Flour')
  await detail.clickDecreaseAmount('Flour')

  // Then: amount is 1
  await expect(detail.getAmountDisplay('Flour')).toHaveText('1')
})

test('user can edit recipe name on Info tab', async ({ page, baseURL }) => {
  test.skip(baseURL === CLOUD_WEB_URL, 'Local mode only — uses IndexedDB seeding')
  const detail = new RecipeDetailPage(page)

  // Given: recipe "Pancakes" exists
  const { recipeId } = await seedRecipe(page, 'Pancakes')

  // When: navigate to detail page (Info tab is default)
  await detail.navigateTo(recipeId)

  // And: change name to "Waffles" and save
  await detail.fillName('Waffles')
  await detail.clickSave()

  // Wait for goBack() navigation to complete (save triggers goBack which leaves the detail page)
  await page.waitForURL((url) => !url.pathname.endsWith(`/${recipeId}`))

  // Then: re-navigate to detail to verify persistence
  await detail.navigateTo(recipeId)
  await page.waitForURL((url) => url.pathname.includes(recipeId))
  await expect(page.getByLabel('Name')).toHaveValue('Waffles')
})

// ─── Cloud mode tests ────────────────────────────────────────────────────────

test('user can create a recipe in cloud mode', async ({ page, baseURL }) => {
  test.skip(baseURL !== CLOUD_WEB_URL, 'Cloud mode only')
  const recipes = new RecipesPage(page)

  // Given: recipes list is empty (cleared in beforeEach)
  await recipes.navigateTo()

  // When: user creates a recipe
  await recipes.clickNewRecipe()
  await page.waitForURL((url) => url.pathname === '/settings/recipes/new')
  await recipes.fillRecipeName('Cloud Pancakes')
  await recipes.clickSave()

  // Then: recipe appears in list
  await page.waitForURL((url) => url.pathname.startsWith('/settings/recipes/') && url.pathname !== '/settings/recipes/new')
  await recipes.navigateTo()
  await expect(recipes.getRecipeCard('Cloud Pancakes')).toBeVisible()
})

test('user can delete a recipe in cloud mode', async ({ page, baseURL }) => {
  test.skip(baseURL !== CLOUD_WEB_URL, 'Cloud mode only')
  const recipes = new RecipesPage(page)

  // Given: a recipe exists (created via UI)
  await recipes.navigateTo()
  await recipes.clickNewRecipe()
  await recipes.fillRecipeName('Cloud Waffles')
  await recipes.clickSave()
  await page.waitForURL((url) => url.pathname.startsWith('/settings/recipes/') && url.pathname !== '/settings/recipes/new')
  await recipes.navigateTo()
  await expect(recipes.getRecipeCard('Cloud Waffles')).toBeVisible()

  // When: user deletes the recipe
  await recipes.clickDeleteRecipe('Cloud Waffles')
  await recipes.confirmDelete()

  // Then: recipe is gone
  await expect(recipes.getRecipeCard('Cloud Waffles')).not.toBeVisible()
})
