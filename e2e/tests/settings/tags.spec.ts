import { test, expect, type Page } from '@playwright/test'
import { CLOUD_SERVER_URL, CLOUD_WEB_URL, E2E_USER_ID } from '../../constants'
import { ItemPage } from '../../pages/ItemPage'
import { PantryPage } from '../../pages/PantryPage'
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

// Seed an item directly into IndexedDB (used for Items tab test in local mode)
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

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    // Cloud mode: delete all test data from MongoDB via the E2E cleanup endpoint.
    await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
      headers: { 'x-e2e-user-id': E2E_USER_ID },
    })
  } else {
    // Local mode: clear IndexedDB, localStorage, and sessionStorage.
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
  }
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

test('user can edit tag name and type on Info tab', async ({ page, baseURL }) => {
  const detail = new TagDetailPage(page)
  const tagsPage = new TagsPage(page)

  let tagId: string

  if (baseURL === CLOUD_WEB_URL) {
    // Cloud: UI-driven setup — create two tag types and a tag
    await tagsPage.navigateTo()
    await tagsPage.fillTagTypeName('Protein')
    await tagsPage.clickNewTagType()
    await expect(tagsPage.getTagTypeCard('Protein')).toBeVisible()
    await tagsPage.fillTagTypeName('Dairy')
    await tagsPage.clickNewTagType()
    await expect(tagsPage.getTagTypeCard('Dairy')).toBeVisible()
    await tagsPage.clickNewTag('Protein')
    await tagsPage.fillTagName('Chicken')
    await tagsPage.submitTagDialog()
    await expect(tagsPage.getTagBadge('Chicken')).toBeVisible()

    // Navigate to tag detail via badge click; extract ID from URL.
    // TanStack Router's index child renders at /settings/tags/{id}/ (trailing slash),
    // so use a path-contains check and strip the trailing slash when extracting the ID.
    await tagsPage.clickTagBadgeToNavigate('Chicken')
    await page.waitForURL(/\/settings\/tags\/[^/]/)
    tagId = new URL(page.url()).pathname.split('/').filter(Boolean).pop()!
  } else {
    // Local: seed directly into IndexedDB and navigate by ID
    const { tagIds } = await seedTags(
      page,
      [{ name: 'Protein', color: 'green' }, { name: 'Dairy', color: 'blue' }],
      [{ name: 'Chicken', typeIndex: 0 }],
    )
    tagId = tagIds[0]
    await detail.navigateTo(tagId)
  }

  // When: change the name to "Turkey"
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

test('user can assign and unassign an item on Items tab', async ({ page, baseURL }) => {
  const detail = new TagDetailPage(page)

  let tagId: string

  if (baseURL === CLOUD_WEB_URL) {
    // Cloud: UI-driven setup — create tag type, tag, and item
    const tagsPage = new TagsPage(page)
    const pantry = new PantryPage(page)
    const item = new ItemPage(page)

    await tagsPage.navigateTo()
    await tagsPage.fillTagTypeName('Protein')
    await tagsPage.clickNewTagType()
    await tagsPage.clickNewTag('Protein')
    await tagsPage.fillTagName('Chicken')
    await tagsPage.submitTagDialog()
    await expect(tagsPage.getTagBadge('Chicken')).toBeVisible()

    // Get tag ID from URL before navigating away to create item.
    // TanStack Router renders the index child at /settings/tags/{id}/ (trailing slash).
    await tagsPage.clickTagBadgeToNavigate('Chicken')
    await page.waitForURL(/\/settings\/tags\/[^/]/)
    tagId = new URL(page.url()).pathname.split('/').filter(Boolean).pop()!

    // Create item via pantry UI
    await pantry.navigateTo()
    await pantry.clickAddItem()
    await item.fillName('Eggs')
    await item.save()

    // Navigate to tag detail Items tab
    await detail.navigateToItems(tagId)
  } else {
    // Local: seed tag and item directly into IndexedDB
    const { tagIds } = await seedTags(
      page,
      [{ name: 'Protein', color: 'green' }],
      [{ name: 'Chicken', typeIndex: 0 }],
    )
    tagId = tagIds[0]
    await seedItem(page, 'Eggs')
    await detail.navigateToItems(tagId)
  }

  // Then: "Eggs" shows as unassigned (Add checkbox visible)
  await expect(detail.getItemCheckbox('Eggs')).toBeVisible()

  // When: user checks the "Eggs" checkbox (assigns it)
  await detail.toggleItem('Eggs')

  // Then: "Eggs" shows as assigned (Remove checkbox visible)
  await expect(detail.getAssignedItemCheckbox('Eggs')).toBeVisible()

  // When: user unchecks the "Eggs" checkbox (unassigns it)
  await detail.toggleItem('Eggs')

  // Then: "Eggs" shows as unassigned again
  await expect(detail.getItemCheckbox('Eggs')).toBeVisible()
})

test('user can delete a tag type', async ({ page, baseURL }) => {
  const tagsPage = new TagsPage(page)

  if (baseURL === CLOUD_WEB_URL) {
    // Cloud: create via UI
    await tagsPage.navigateTo()
    await tagsPage.fillTagTypeName('Protein')
    await tagsPage.clickNewTagType()
  } else {
    // Local: seed via IndexedDB and navigate
    await seedTags(page, [{ name: 'Protein', color: 'green' }])
    await tagsPage.navigateTo()
  }

  await expect(tagsPage.getTagTypeCard('Protein')).toBeVisible()

  // When: user clicks the delete (trash) button on the tag type card
  await tagsPage.clickDeleteTagType('Protein')

  // And: confirms deletion
  await tagsPage.confirmDelete()

  // Then: the "Protein" card is gone
  await expect(tagsPage.getTagTypeCard('Protein')).not.toBeVisible()
})

test('user can delete a tag', async ({ page, baseURL }) => {
  const tagsPage = new TagsPage(page)

  if (baseURL === CLOUD_WEB_URL) {
    // Cloud: create via UI
    await tagsPage.navigateTo()
    await tagsPage.fillTagTypeName('Protein')
    await tagsPage.clickNewTagType()
    await tagsPage.clickNewTag('Protein')
    await tagsPage.fillTagName('Chicken')
    await tagsPage.submitTagDialog()
  } else {
    // Local: seed via IndexedDB and navigate
    await seedTags(
      page,
      [{ name: 'Protein', color: 'green' }],
      [{ name: 'Chicken', typeIndex: 0 }],
    )
    await tagsPage.navigateTo()
  }

  await expect(tagsPage.getTagBadge('Chicken')).toBeVisible()

  // When: user clicks the X button on the "Chicken" badge
  await tagsPage.clickDeleteTag('Chicken')

  // And: confirms deletion
  await tagsPage.confirmDelete()

  // Then: "Chicken" badge is gone
  await expect(tagsPage.getTagBadge('Chicken')).not.toBeVisible()
})

test('user can add a tag to a tag type', async ({ page }) => {
  const tagsPage = new TagsPage(page)

  // Given: tag type "Protein" exists (created via UI — works in both local and cloud mode)
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

test.describe('tag type creation via Enter key', () => {
  test('tag type input clears after submitting by pressing Enter', async ({ page }) => {
    const tags = new TagsPage(page)

    // Given: the tags settings page is open
    await tags.navigateTo()

    // When: user fills in "Produce" in the name input and presses Enter (not the button)
    await tags.fillTagTypeName('Produce')
    // Press Enter to submit the form — tests that the form's onSubmit handler fires
    // and does NOT cause a page reload (a reload would navigate away from the SPA)
    // (src/routes/settings/tags/index.tsx:450-456 — <form onSubmit={...}>)
    await page.getByLabel('Name').press('Enter')

    // Then: the "Produce" heading appears — proving mutation completed and page did NOT reload
    await expect(tags.getTagTypeCard('Produce')).toBeVisible()

    // And: the input is cleared (form reset after success)
    // (src/routes/settings/tags/index.tsx:317-319 — setNewTagTypeName('') in onSuccess)
    await expect(page.getByLabel('Name')).toHaveValue('')
  })
})

test.describe('tag type input clears after button submit', () => {
  test('tag type input clears after successful creation via button click', async ({ page }) => {
    const tags = new TagsPage(page)

    // Given: the tags settings page is open
    await tags.navigateTo()

    // When: user fills "Category" in the input and clicks the submit button
    await tags.fillTagTypeName('Category')
    await tags.clickNewTagType()

    // Then: "Category" heading appears
    await expect(tags.getTagTypeCard('Category')).toBeVisible()

    // And: the input field is now empty (not still showing "Category")
    // Regression guard: if the form state is not reset on success, the input retains
    // the old value. (src/routes/settings/tags/index.tsx:317-319 — setNewTagTypeName(''))
    await expect(page.getByLabel('Name')).toHaveValue('')
  })
})

test.describe('new tag from item tags tab', () => {
  test('user can create a new tag from item tags tab and it is automatically assigned to the item', async ({ page, baseURL }) => {
    const pantry = new PantryPage(page)
    const item = new ItemPage(page)
    const tagsPage = new TagsPage(page)

    // Given: an item "Test Apple" exists and a tag type "Fruit" with tag "Organic" exists
    if (baseURL === CLOUD_WEB_URL) {
      // Cloud: UI-driven setup
      await tagsPage.navigateTo()
      await tagsPage.fillTagTypeName('Fruit')
      await tagsPage.clickNewTagType()
      await expect(tagsPage.getTagTypeCard('Fruit')).toBeVisible()
      await tagsPage.clickNewTag('Fruit')
      await tagsPage.fillTagName('Organic')
      await tagsPage.submitTagDialog()
      await expect(tagsPage.getTagBadge('Organic')).toBeVisible()

      await pantry.navigateTo()
      await pantry.clickAddItem()
      await item.fillName('Test Apple')
      await item.save()
    } else {
      // Local: seed tags directly, create item via UI
      await seedTags(
        page,
        [{ name: 'Fruit', color: 'green' }],
        [{ name: 'Organic', typeIndex: 0 }],
      )
      await pantry.navigateTo()
      await pantry.clickAddItem()
      await item.fillName('Test Apple')
      await item.save()
    }

    // Capture the item ID now (while on the item page) before navigating away
    const itemId = item.getCurrentItemId()

    // When: navigate to the item's tags tab
    await page.goto(`/items/${itemId}/tags`)

    // And: click "New Tag" under the "Fruit" section, type "Fresh", submit
    await page.getByRole('button', { name: /new tag/i }).first().click()
    // AddNameDialog input: label "Name" (src/components/AddNameDialog/index.tsx:41)
    await page.getByRole('dialog').getByLabel('Name').fill('Fresh')
    await page.getByRole('dialog').getByRole('button', { name: /add tag/i }).click()

    // Then: the "Fresh" badge is visible and in a selected/pressed state (aria-pressed=true)
    // Tag badges on item tags tab: role="button" aria-pressed={isSelected}
    // (src/routes/items/$id/tags.tsx:96-97)
    await expect(
      page.getByRole('button', { name: /fresh/i, pressed: true })
    ).toBeVisible()

    // And: persists after navigating away and back to the tags tab
    await pantry.navigateTo()
    await page.goto(`/items/${itemId}/tags`)

    // The "Fresh" badge should still be selected (assigned to the item)
    await expect(
      page.getByRole('button', { name: /fresh/i, pressed: true })
    ).toBeVisible()
  })
})

test.describe('tag item count after tag assignment', () => {
  test('tag item count updates after tag is assigned to an item', async ({ page, baseURL }) => {
    const tagsPage = new TagsPage(page)
    const detail = new TagDetailPage(page)
    const pantry = new PantryPage(page)
    const item = new ItemPage(page)

    let tagId: string

    // Given: a tag type "Category" and tag "Fresh" exist; an item "Test Apple" exists WITHOUT the tag
    if (baseURL === CLOUD_WEB_URL) {
      // Cloud: UI-driven setup
      await tagsPage.navigateTo()
      await tagsPage.fillTagTypeName('Category')
      await tagsPage.clickNewTagType()
      await expect(tagsPage.getTagTypeCard('Category')).toBeVisible()
      await tagsPage.clickNewTag('Category')
      await tagsPage.fillTagName('Fresh')
      await tagsPage.submitTagDialog()
      await expect(tagsPage.getTagBadge('Fresh')).toBeVisible()

      // Get tag ID from URL
      await tagsPage.clickTagBadgeToNavigate('Fresh')
      await page.waitForURL(/\/settings\/tags\/[^/]/)
      tagId = new URL(page.url()).pathname.split('/').filter(Boolean).pop()!

      // Create item (untagged)
      await pantry.navigateTo()
      await pantry.clickAddItem()
      await item.fillName('Test Apple')
      await item.save()
    } else {
      // Local: seed tag and item directly into IndexedDB — item has NO tags
      const { tagIds } = await seedTags(
        page,
        [{ name: 'Category', color: 'blue' }],
        [{ name: 'Fresh', typeIndex: 0 }],
      )
      tagId = tagIds[0]
      await seedItem(page, 'Test Apple') // no tagIds = untagged
    }

    // First: load the tags list page to prime the TanStack Query cache with count=0
    await tagsPage.navigateTo()
    // Confirm count is 0 — delete dialog says "no item is using it"
    await tagsPage.clickDeleteTag('Fresh')
    await expect(tagsPage.getDeleteDialog()).toContainText('no item is using it')
    await tagsPage.cancelDeleteDialog()

    // When: SPA-navigate to tag detail page (keeps TanStack Query cache alive)
    // Click the "Fresh" badge to navigate to the tag detail page
    await tagsPage.clickTagBadgeToNavigate('Fresh')
    await page.waitForURL(/\/settings\/tags\/[^/]/)

    // SPA-navigate to Items tab by clicking the tab link
    // Tab link: to="/settings/tags/$id/items" (src/routes/settings/tags/$id.tsx:122-130)
    await page.locator(`a[href$="/settings/tags/${tagId}/items"]`).click()
    await page.waitForURL(`**/settings/tags/${tagId}/items`)
    await expect(detail.getItemCheckbox('Test Apple')).toBeVisible()

    // Assign the item
    await detail.toggleItem('Test Apple')
    await expect(detail.getAssignedItemCheckbox('Test Apple')).toBeVisible()

    // Navigate back via the "Go back" button (SPA navigation — preserves TanStack Query cache)
    // "Go back" from items tab: isSamePage()/navigation history logic means it skips the
    // tag detail info page (same tag ID) and goes directly to the tags list.
    // (src/hooks/useAppNavigation.ts — isSamePage filters /settings/tags/:id/* as same page)
    // aria-label="Go back" (src/routes/settings/tags/$id.tsx:101, common.goBack = "Go back")
    await page.getByRole('button', { name: 'Go back' }).click()
    await page.waitForURL(/\/settings\/tags$/)

    // Then: the tags list page must show the updated count for "Fresh"
    // The cached count query must have been invalidated by useUpdateItem's onSuccess
    // (without the fix, count stays at 0 because queryClient.invalidateQueries is missing)
    // Click delete to read the count from the dialog description
    await tagsPage.clickDeleteTag('Fresh')
    // Dialog description: "We are about to delete "Fresh", removing it from 1 item."
    // (src/i18n/locales/en.json: settings.tags.tag.deleteWithItems_one)
    await expect(tagsPage.getDeleteDialog()).toContainText('removing it from 1 item')

    // Cancel — do not delete
    await tagsPage.cancelDeleteDialog()
  })
})

test.describe('tag item count after item deletion', () => {
  test('tag item count updates after item is deleted', async ({ page, baseURL }) => {
    const tagsPage = new TagsPage(page)
    const pantry = new PantryPage(page)
    const item = new ItemPage(page)

    // Given: a tag type "Category" and tag "Perishable" exist; an item "Test Banana" is tagged with "Perishable"
    if (baseURL === CLOUD_WEB_URL) {
      // Cloud: UI-driven setup
      await tagsPage.navigateTo()
      await tagsPage.fillTagTypeName('Category')
      await tagsPage.clickNewTagType()
      await expect(tagsPage.getTagTypeCard('Category')).toBeVisible()
      await tagsPage.clickNewTag('Category')
      await tagsPage.fillTagName('Perishable')
      await tagsPage.submitTagDialog()
      await expect(tagsPage.getTagBadge('Perishable')).toBeVisible()

      // Create item and assign the tag via item tags tab
      await pantry.navigateTo()
      await pantry.clickAddItem()
      await item.fillName('Test Banana')
      await item.save()
      await item.navigateToTab('tags')
      // Toggle the "Perishable" badge to assign it (initially unselected)
      await page.getByRole('button', { name: /perishable/i, pressed: false }).click()
      await expect(
        page.getByRole('button', { name: /perishable/i, pressed: true })
      ).toBeVisible()
    } else {
      // Local: seed tag type + tag, then seed item with the tag already assigned
      const { tagIds } = await seedTags(
        page,
        [{ name: 'Category', color: 'blue' }],
        [{ name: 'Perishable', typeIndex: 0 }],
      )
      const perishableId = tagIds[0]
      await seedItem(page, 'Test Banana', [perishableId])

      // Navigate to pantry so TanStack Query cache is populated
      await pantry.navigateTo()
    }

    // When: navigate to settings tags page and check the item count for "Perishable"
    await tagsPage.navigateTo()

    // The badge text includes the count: "Perishable (1)" (src/routes/settings/tags/index.tsx:123)
    // Click the delete button to open the dialog and read the count from the description
    await tagsPage.clickDeleteTag('Perishable')
    // Dialog description says: "We are about to delete "Perishable", removing it from 1 item."
    // (src/i18n/locales/en.json: settings.tags.tag.deleteWithItems_one)
    await expect(tagsPage.getDeleteDialog()).toContainText('removing it from 1 item')

    // Cancel so we don't delete the tag
    await tagsPage.cancelDeleteDialog()

    // Then: navigate to the item and delete it
    await pantry.navigateTo()
    await pantry.getItemCard('Test Banana').click()
    await item.delete()

    // And: navigate back to settings tags page and verify the count is now 0
    await tagsPage.navigateTo()

    // Click delete again to check the updated count in the dialog
    await tagsPage.clickDeleteTag('Perishable')
    // Dialog now says: "It's safe to delete "Perishable" since no item is using it."
    // (src/i18n/locales/en.json: settings.tags.tag.deleteNoItems)
    await expect(tagsPage.getDeleteDialog()).toContainText("no item is using it")

    // Cancel — do not actually delete
    await tagsPage.cancelDeleteDialog()
  })
})

// Seed tag types and tags (with optional parentId) directly into IndexedDB.
// Extends the existing seedTags helper to support the nested tag hierarchy.
async function seedTagsWithParents(
  page: Page,
  tagTypes: { name: string; color?: string }[],
  tags: { name: string; typeIndex: number; parentIndex?: number }[] = [],
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
        const record: Record<string, unknown> = {
          id: tagIds[i],
          name: tags[i].name,
          typeId: tagTypeIds[tags[i].typeIndex],
          createdAt: new Date(now),
          updatedAt: new Date(now),
        }
        // Only set parentId when a parentIndex is provided
        if (tags[i].parentIndex !== undefined) {
          record.parentId = tagIds[tags[i].parentIndex as number]
        }
        await put('tags', record)
      }
    },
    { tagTypeIds, tagIds, tagTypes, tags, now },
  )

  return { tagTypeIds, tagIds }
}

test('user can create a tag with a parent tag', async ({ page, baseURL }) => {
  const tagsPage = new TagsPage(page)

  if (baseURL === CLOUD_WEB_URL) {
    // Cloud: UI-driven setup — create tag type and parent tag via UI.
    // New UI: "New Tag Type" button opens a dialog; fill Name + click Save inside dialog.
    // (src/routes/settings/tags/index.tsx — Dialog with TagTypeInfoForm)
    await tagsPage.navigateTo()
    await tagsPage.clickNewTagType()
    await page.getByRole('dialog').getByLabel('Name').fill('Protein')
    await page.getByRole('dialog').getByRole('button', { name: /save/i }).click()
    await expect(tagsPage.getTagTypeCard('Protein')).toBeVisible()

    await tagsPage.clickNewTag('Protein')
    await tagsPage.fillTagName('Chicken')
    await tagsPage.submitTagDialog()
    await expect(tagsPage.getTagBadge('Chicken')).toBeVisible()
  } else {
    // Local: seed tag type and parent tag directly into IndexedDB
    await seedTagsWithParents(
      page,
      [{ name: 'Protein', color: 'green' }],
      [{ name: 'Chicken', typeIndex: 0 }],
    )
    await tagsPage.navigateTo()
    await expect(tagsPage.getTagBadge('Chicken')).toBeVisible()
  }

  // When: user clicks "New Tag" inside the Protein card
  await tagsPage.clickNewTag('Protein')

  // And: fills the child tag name "Grilled Chicken"
  await tagsPage.fillTagName('Grilled Chicken')

  // And: selects "Chicken" as the parent
  await tagsPage.selectTagParent('Chicken')

  // And: submits the dialog
  await tagsPage.submitTagDialog()

  // Then: "Grilled Chicken" badge appears in the tags list
  // Child tags (depth >= 1) are drag-disabled, so no role="button" from dnd-kit.
  // Match by text content rendered inside the Badge div: "{name} (0)"
  // (src/routes/settings/tags/index.tsx — DraggableTagBadge renders TagBadge inside a div)
  await expect(
    page.getByText(/^Grilled Chicken \(\d+\)$/)
  ).toBeVisible()
})

test('user can delete a parent tag with cascade (deletes child tags too)', async ({ page, baseURL }) => {
  const tagsPage = new TagsPage(page)

  let parentTagId: string

  if (baseURL === CLOUD_WEB_URL) {
    // Cloud: UI-driven setup — create tag type, parent tag "Chicken", child tag "Grilled Chicken"
    await tagsPage.navigateTo()
    await tagsPage.clickNewTagType()
    await page.getByRole('dialog').getByLabel('Name').fill('Protein')
    await page.getByRole('dialog').getByRole('button', { name: /save/i }).click()
    await expect(tagsPage.getTagTypeCard('Protein')).toBeVisible()

    // Create parent tag "Chicken"
    await tagsPage.clickNewTag('Protein')
    await tagsPage.fillTagName('Chicken')
    await tagsPage.submitTagDialog()
    await expect(tagsPage.getTagBadge('Chicken')).toBeVisible()

    // Navigate to Chicken detail to get its ID from the URL
    await tagsPage.clickTagBadgeToNavigate('Chicken')
    await page.waitForURL(/\/settings\/tags\/[^/]/)
    parentTagId = new URL(page.url()).pathname.split('/').filter(Boolean).pop()!
    await page.goBack()

    // Create child tag "Grilled Chicken" with parent "Chicken"
    await tagsPage.clickNewTag('Protein')
    await tagsPage.fillTagName('Grilled Chicken')
    await tagsPage.selectTagParent('Chicken')
    await tagsPage.submitTagDialog()
    await expect(page.getByText(/^Grilled Chicken \(\d+\)$/)).toBeVisible()
  } else {
    // Local: seed tag type, parent tag "Chicken" (index 0), child tag "Grilled Chicken" (index 1)
    const { tagIds } = await seedTagsWithParents(
      page,
      [{ name: 'Protein', color: 'green' }],
      [
        { name: 'Chicken', typeIndex: 0 },
        { name: 'Grilled Chicken', typeIndex: 0, parentIndex: 0 },
      ],
    )
    parentTagId = tagIds[0]
  }

  // Verify both tags appear on the tags list page
  await tagsPage.navigateTo()
  await expect(tagsPage.getTagBadge('Chicken')).toBeVisible()
  await expect(page.getByText(/^Grilled Chicken \(\d+\)$/)).toBeVisible()

  // When: user navigates to the "Chicken" tag detail page
  // The cascade/orphan dialog appears on the tag detail page (not the list page)
  // because the list page DeleteButton only supports no-children tags.
  // (src/routes/settings/tags/$id/index.tsx:63-68)
  await page.goto(`/settings/tags/${parentTagId}`)
  // Wait for the tag detail layout to render — the tag name appears in the header h1
  // (src/routes/settings/tags/$id.tsx:106)
  await page.waitForSelector('h1')
  await expect(page.locator('h1')).toContainText('Chicken', { ignoreCase: true })

  // And: clicks the "Delete" button — which opens the cascade/orphan dialog
  // (only visible when the tag has children; rendered as Button variant="destructive-ghost")
  // (src/routes/settings/tags/$id/index.tsx:118-127)
  await page.getByRole('button', { name: /^delete$/i }).click()

  // Then: the "This tag has child tags" dialog appears
  // (src/i18n/locales/en.json: settings.tags.tag.deleteParentTitle)
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await expect(page.getByRole('alertdialog')).toContainText('This tag has child tags')

  // When: user clicks "Delete all child tags" (cascade option)
  // (src/i18n/locales/en.json: settings.tags.tag.deleteParentCascade = "Delete all child tags")
  // (src/routes/settings/tags/$id/index.tsx:154-160 — AlertDialogAction variant="destructive")
  await page.getByRole('button', { name: 'Delete all child tags' }).click()

  // Then: navigates back to tags list (goBack() is called after cascade delete)
  await page.waitForURL(/\/settings\/tags$/)

  // And: both "Chicken" and "Grilled Chicken" are gone
  await expect(tagsPage.getTagBadge('Chicken')).not.toBeVisible()
  await expect(page.getByText(/^Grilled Chicken \(\d+\)$/)).not.toBeVisible()
})
