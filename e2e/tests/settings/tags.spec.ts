import { test, expect, type Page } from '@playwright/test'
import { TagsPage } from '../../pages/settings/TagsPage'
import { TagDetailPage } from '../../pages/settings/TagDetailPage'

// Seed tag types and tags directly into IndexedDB.
// Navigate to '/' first so Dexie initialises the DB schema.
async function seedTags(
  page: Page,
  tagTypes: { name: string; color?: string }[],
  tags: { name: string; typeIndex: number }[] = [],
): Promise<{ tagTypeIds: string[]; tagIds: string[] }> {
  await page.goto('/')

  const tagTypeIds = tagTypes.map(() => crypto.randomUUID())
  const tagIds = tags.map(() => crypto.randomUUID())
  const now = new Date().toISOString()

  await page.evaluate(
    async ({ tagTypeIds, tagIds, tagTypes, tags, now }) => {
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

      for (let i = 0; i < tagTypes.length; i++) {
        await put('tagTypes', {
          id: tagTypeIds[i],
          name: tagTypes[i].name,
          color: tagTypes[i].color ?? 'blue',
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
      }

      for (let i = 0; i < tags.length; i++) {
        await put('tags', {
          id: tagIds[i],
          name: tags[i].name,
          typeId: tagTypeIds[tags[i].typeIndex],
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
      }
    },
    { tagTypeIds, tagIds, tagTypes, tags, now },
  )

  return { tagTypeIds, tagIds }
}

// Seed an item directly into IndexedDB (used for Items tab test)
async function seedItem(page: Page, name: string, tagIds: string[] = []): Promise<string> {
  const itemId = crypto.randomUUID()
  const now = new Date().toISOString()

  await page.evaluate(
    async ({ itemId, name, tagIds, now }) => {
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
          tagIds,
          vendorIds: [],
          targetUnit: 'package',
          targetQuantity: 0,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 0,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    },
    { itemId, name, tagIds, now },
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
          if (!name) { resolve(); return }
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

test('user can create a tag type', async ({ page }) => {
  const tags = new TagsPage(page)

  // Given: the tags settings page is empty
  await tags.navigateTo()

  // When: user fills the name and clicks "New Tag Type"
  await tags.fillTagTypeName('Protein')
  await tags.clickNewTagType()

  // Then: a card with heading "Protein" appears
  await expect(tags.getTagTypeCard('Protein')).toBeVisible()
})
