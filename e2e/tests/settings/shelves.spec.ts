import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Prevent empty-data redirect to /onboarding so tests can navigate freely.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
})

test.afterEach(async ({ page }) => {
  // Local mode: clear IndexedDB, localStorage, and sessionStorage.
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

test('user lands on /shelves after deleting a shelf from its settings page', async ({ page }) => {
  const shelfId = 'bbbbbbbb-0000-0000-0000-000000000001'
  const now = new Date().toISOString()

  // Given: a selection shelf seeded directly into IndexedDB
  await page.goto('/')
  await page.evaluate(
    async ({ shelfId, now }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('Player1Inventory')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('shelves', 'readwrite')
        const req = tx.objectStore('shelves').put({
          id: shelfId,
          name: 'My Test Shelf',
          type: 'selection',
          order: 1,
          itemIds: [],
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
      db.close()
    },
    { shelfId, now },
  )

  // When: navigate to the shelf group-by view and verify the shelf card is visible
  await page.goto('/?groupBy=shelf')
  // ShelfCard renders shelf name in a <p> with capitalize class (src/components/shelf/ShelfCard/ShelfCard.tsx:29)
  await expect(page.getByText('My Test Shelf')).toBeVisible()

  // When: navigate directly to the shelf detail view
  await page.goto(`/?groupBy=shelf&id=${shelfId}`)
  await page.waitForURL(`/?groupBy=shelf&id=${shelfId}`)

  // When: navigate directly to the shelf settings info tab
  // (avoids using the link from the detail page which triggers navigation history issues)
  // The info tab is at /settings/shelves/$shelfId/ (with trailing slash)
  await page.goto(`/settings/shelves/${shelfId}/`)
  await page.waitForURL(`/settings/shelves/${shelfId}/`)

  // When: wait for the ShelfInfoTab form to render and the form state to initialize
  // (useEffect in ShelfInfoTab sets name from shelf data; isDirty becomes false once initialized)
  // ShelfInfoTab wraps content in a <form> with a "Save" button (src/routes/settings/shelves/$shelfId/index.tsx:185)
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()

  // When: click the "Delete shelf" trigger button to open the delete dialog
  // DeleteButton trigger prop: "Delete shelf" (src/routes/settings/shelves/$shelfId/index.tsx:196)
  await page.getByRole('button', { name: 'Delete shelf' }).click()

  // When: confirm in the dialog by clicking the destructive confirm button
  // DeleteButton uses AlertDialogAction with t('common.delete') = "Delete" (src/components/shared/DeleteButton/DeleteButton.tsx:84)
  // Use Promise.all to handle navigation that occurs when deletion succeeds (unmounts the dialog)
  // Pattern from e2e/pages/ItemPage.ts:delete()
  await Promise.all([
    page.waitForURL(/\/settings\/shelves\/?$/),
    page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click(),
  ])

  // Then: URL becomes /settings/shelves (post-delete navigation — src/routes/settings/shelves/$shelfId/index.tsx)
  // (already asserted by waitForURL in Promise.all above)

  // Then: the deleted shelf name is no longer visible
  await expect(page.getByText('My Test Shelf')).not.toBeVisible()
})
