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

test.skip('user can move a tag to a different type via drag-and-drop', async ({ page }) => {
  // SKIPPED: dnd-kit uses a PointerSensor that doesn't activate reliably via
  // Playwright's synthetic mouse events in headless Chromium. The drag wrapper
  // has role="button" (from dnd-kit) but the 8px activation threshold is not
  // consistently triggered, so the undo toast never appears after two attempts.
  const tagsPage = new TagsPage(page)

  // Given: two tag types "Protein" and "Grain", with tag "Rice" under "Grain"
  await seedTags(
    page,
    [{ name: 'Grain', color: 'amber' }, { name: 'Protein', color: 'green' }],
    [{ name: 'Rice', typeIndex: 0 }],
  )

  // When: navigate to tags page
  await tagsPage.navigateTo()
  await expect(tagsPage.getTagBadge('Rice')).toBeVisible()

  // And: drag "Rice" from "Grain" card to "Protein" card
  await tagsPage.dragTagToType('Rice', 'Protein')

  // Then: a toast appears confirming the move
  await expect(tagsPage.getUndoToast()).toBeVisible()

  // And: "Rice" badge is visible (it's now under Protein)
  await expect(tagsPage.getTagBadge('Rice')).toBeVisible()

  // When: user clicks Undo
  await tagsPage.clickUndo()

  // Then: the toast is gone and Rice is still visible (moved back to Grain)
  await expect(tagsPage.getUndoToast()).not.toBeVisible()
  await expect(tagsPage.getTagBadge('Rice')).toBeVisible()
})

test('user can edit tag name and type on Info tab', async ({ page }) => {
  const detail = new TagDetailPage(page)

  // Given: two tag types "Protein" and "Dairy", with tag "Chicken" under "Protein"
  const { tagIds } = await seedTags(
    page,
    [{ name: 'Protein', color: 'green' }, { name: 'Dairy', color: 'blue' }],
    [{ name: 'Chicken', typeIndex: 0 }],
  )
  const tagId = tagIds[0]

  // When: navigate to tag detail page (Info tab is default)
  await detail.navigateTo(tagId)

  // And: change the name to "Turkey"
  await detail.fillName('Turkey')

  // And: change the type to "Dairy"
  await detail.selectType('Dairy')

  // And: save
  await detail.clickSave()

  // Then: the page navigates away after save (goBack navigates to previous page or home)
  // Wait for navigation to complete, then navigate directly back to verify saved data
  await page.waitForURL((url) => !url.pathname.includes(tagId))
  await detail.navigateTo(tagId)

  // The Name field shows "Turkey"
  await expect(page.getByLabel('Name')).toHaveValue('Turkey')
})

test('user can delete a tag type', async ({ page }) => {
  const tagsPage = new TagsPage(page)

  // Given: tag type "Protein" with no tags seeded via IndexedDB
  await seedTags(page, [{ name: 'Protein', color: 'green' }])

  // When: navigate to tags page
  await tagsPage.navigateTo()
  await expect(tagsPage.getTagTypeCard('Protein')).toBeVisible()

  // And: user clicks the delete (trash) button on the tag type card
  await tagsPage.clickDeleteTagType('Protein')

  // And: confirms deletion
  await tagsPage.confirmDelete()

  // Then: the "Protein" card is gone
  await expect(tagsPage.getTagTypeCard('Protein')).not.toBeVisible()
})

test('user can delete a tag', async ({ page }) => {
  const tagsPage = new TagsPage(page)

  // Given: tag type "Protein" with tag "Chicken" seeded via IndexedDB
  await seedTags(
    page,
    [{ name: 'Protein', color: 'green' }],
    [{ name: 'Chicken', typeIndex: 0 }],
  )

  // When: navigate to tags page
  await tagsPage.navigateTo()
  await expect(tagsPage.getTagBadge('Chicken')).toBeVisible()

  // And: user clicks the X button on the "Chicken" badge
  await tagsPage.clickDeleteTag('Chicken')

  // And: confirms deletion
  await tagsPage.confirmDelete()

  // Then: "Chicken" badge is gone
  await expect(tagsPage.getTagBadge('Chicken')).not.toBeVisible()
})

test('user can add a tag to a tag type', async ({ page }) => {
  const tagsPage = new TagsPage(page)

  // Given: tag type "Protein" exists (created via UI)
  await tagsPage.navigateTo()
  await tagsPage.fillTagTypeName('Protein')
  await tagsPage.clickNewTagType()
  await expect(tagsPage.getTagTypeCard('Protein')).toBeVisible()

  // When: user clicks "New Tag" inside the Protein card
  await tagsPage.clickNewTag('Protein')

  // And: fills the tag name and submits
  await tagsPage.fillTagName('Chicken')
  await tagsPage.submitTagDialog()

  // Then: "Chicken" badge appears
  await expect(tagsPage.getTagBadge('Chicken')).toBeVisible()
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
