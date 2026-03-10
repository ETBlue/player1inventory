import { test, expect, type Page } from '@playwright/test'
import { RecipesPage } from '../../pages/settings/RecipesPage'
import { RecipeDetailPage } from '../../pages/settings/RecipeDetailPage'

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

test.afterEach(async ({ page }) => {
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
})

test('user can create a recipe', async ({ page }) => {
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

test('user can delete a recipe', async ({ page }) => {
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

test('user can navigate to recipe detail after creating', async ({ page }) => {
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
