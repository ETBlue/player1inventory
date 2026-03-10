# Settings Tags E2E Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full e2e test coverage for tag management — tags list page and tag detail page (Info + Items tabs).

**Architecture:** Hierarchical structure: `e2e/pages/settings/TagsPage.ts` + `TagDetailPage.ts` for page objects, `e2e/tests/settings/tags.spec.ts` for tests. Simple tests use UI-driven setup; complex multi-entity tests seed IndexedDB via `page.evaluate()`.

**Tech Stack:** Playwright, `@playwright/test`, Dexie/IndexedDB (for seeding), `@dnd-kit` drag-and-drop (tested via Playwright's `dragTo()`)

---

### Key Selectors Reference

- **Tags list — Name input:** `getByLabel('Name')` (label `htmlFor="newTagTypeName"`, `src/routes/settings/tags/index.tsx:421`)
- **Tags list — "New Tag Type" button:** `getByRole('button', { name: /new tag type/i })` (`src/routes/settings/tags/index.tsx:435`)
- **Tags list — tag type card heading:** `getByRole('heading', { name, level: 3 })` (inside DroppableTagTypeCard, `src/routes/settings/tags/index.tsx:194`)
- **Tags list — "New Tag" button inside a card:** `getByRole('heading', { name: typeName, level: 3 }).locator('../..').getByRole('button', { name: /new tag/i })`
- **Tags list — Delete tag type button:** `getByRole('button', { name: \`Delete ${tagTypeName}\` })` (aria-label on DeleteButton, `src/routes/settings/tags/index.tsx:204`)
- **Tags list — tag badge:** `getByRole('button', { name: tagName })` (TagBadge onClick, `src/routes/settings/tags/index.tsx:126-135`)
- **Tags list — X button on badge:** `getByRole('button', { name: tagName }).locator('..')` then sibling — or use `page.getByRole('button', { name: /^X$/ })` near the badge. In practice: locate the badge container and find the X button within it.
- **Delete confirm button:** `getByRole('button', { name: 'Confirm' })` (DeleteButton uses AlertDialog with Confirm)
- **Tag detail — Name input:** `getByLabel('Name')` (label `htmlFor="tag-name"`, `src/routes/settings/tags/$id/index.tsx:119`)
- **Tag detail — Tag Type select:** `getByLabel('Tag Type')` (label `htmlFor="tag-type"`, `src/routes/settings/tags/$id/index.tsx:93`)
- **Tag detail — Save button:** `getByRole('button', { name: 'Save' })`
- **Tag detail — Items tab checkbox (unchecked):** `getByLabel(\`Add ${itemName}\`)` (`src/components/item/ItemCard/index.tsx:143`)
- **Tag detail — Items tab checkbox (checked):** `getByLabel(\`Remove ${itemName}\`)`

---

### Task 1: Create directory structure

**Files:**
- Create: `e2e/pages/settings/TagsPage.ts`
- Create: `e2e/pages/settings/TagDetailPage.ts`
- Create: `e2e/tests/settings/tags.spec.ts`

**Step 1: Create the directories and stub files**

```bash
mkdir -p e2e/pages/settings
mkdir -p e2e/tests/settings
```

Create `e2e/pages/settings/TagsPage.ts`:

```ts
import type { Page, Locator } from '@playwright/test'

export class TagsPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    await this.page.goto('/settings/tags')
  }

  async fillTagTypeName(name: string) {
    // Name input: label htmlFor="newTagTypeName" (src/routes/settings/tags/index.tsx:421)
    await this.page.getByLabel('Name').fill(name)
  }

  async clickNewTagType() {
    // Button label "New Tag Type" (src/routes/settings/tags/index.tsx:435)
    await this.page.getByRole('button', { name: /new tag type/i }).click()
  }

  getTagTypeCard(name: string): Locator {
    // Card heading h3 inside DroppableTagTypeCard (src/routes/settings/tags/index.tsx:194)
    return this.page.getByRole('heading', { name, level: 3 })
  }

  async clickNewTag(tagTypeName: string) {
    // "New Tag" button inside a specific tag type card
    // Find the card by its heading, then find the "New Tag" button within that card
    const card = this.page.getByRole('heading', { name: tagTypeName, level: 3 }).locator('xpath=ancestor::div[contains(@class,"space-y-px") or contains(@class,"relative")]').first()
    await card.getByRole('button', { name: /new tag/i }).click()
  }

  async fillTagName(name: string) {
    // AddNameDialog input — focus is auto on the dialog input
    // The dialog input has placeholder "e.g., Dairy, Frozen" (src/routes/settings/tags/index.tsx:476)
    await this.page.getByPlaceholder(/dairy/i).fill(name)
  }

  async submitTagDialog() {
    // "Add Tag" submit button in AddNameDialog (src/routes/settings/tags/index.tsx:472)
    await this.page.getByRole('button', { name: 'Add Tag' }).click()
  }

  getTagBadge(name: string): Locator {
    // TagBadge renders as a button (onClick navigates to detail) (src/routes/settings/tags/index.tsx:126)
    return this.page.getByRole('button', { name })
  }

  async clickDeleteTag(name: string) {
    // X button is a sibling of the TagBadge inside the same inline-flex div
    // Find badge button, navigate to parent div, find the X button within it
    const badgeContainer = this.page.getByRole('button', { name }).locator('..')
    await badgeContainer.getByRole('button').last().click()
  }

  async clickDeleteTagType(name: string) {
    // aria-label="Delete {tagType.name}" on the trash DeleteButton (src/routes/settings/tags/index.tsx:204)
    await this.page.getByRole('button', { name: `Delete ${name}` }).click()
  }

  async confirmDelete() {
    // AlertDialog confirm button (DeleteButton uses AlertDialogAction with label "Confirm")
    await this.page.getByRole('button', { name: 'Confirm' }).click()
  }

  async dragTagToType(tagName: string, targetTypeName: string) {
    // Drag the tag badge to the target type card content area
    // Source: the DraggableTagBadge div wrapping the badge
    const source = this.page.getByRole('button', { name: tagName })
    // Target: the card content of the target type card
    const target = this.page.getByRole('heading', { name: targetTypeName, level: 3 })
    await source.dragTo(target)
  }

  getUndoToast(): Locator {
    // Sonner toast with "Undo" action button (src/routes/settings/tags/index.tsx:371)
    return this.page.getByRole('button', { name: 'Undo' })
  }

  async clickUndo() {
    await this.getUndoToast().click()
  }
}
```

Create `e2e/pages/settings/TagDetailPage.ts`:

```ts
import type { Page, Locator } from '@playwright/test'

export class TagDetailPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo(id: string) {
    await this.page.goto(`/settings/tags/${id}`)
  }

  async navigateToItems(id: string) {
    await this.page.goto(`/settings/tags/${id}/items`)
  }

  async fillName(name: string) {
    // Label htmlFor="tag-name" (src/routes/settings/tags/$id/index.tsx:119)
    await this.page.getByLabel('Name').fill(name)
  }

  async selectType(typeName: string) {
    // Label htmlFor="tag-type" (src/routes/settings/tags/$id/index.tsx:93)
    await this.page.getByLabel('Tag Type').click()
    await this.page.getByRole('option', { name: typeName }).click()
  }

  async clickSave() {
    await this.page.getByRole('button', { name: 'Save' }).click()
  }

  getItemCheckbox(name: string): Locator {
    // Unchecked: aria-label="Add {name}", checked: aria-label="Remove {name}"
    // (src/components/item/ItemCard/index.tsx:143)
    return this.page.getByLabel(`Add ${name}`)
  }

  getAssignedItemCheckbox(name: string): Locator {
    return this.page.getByLabel(`Remove ${name}`)
  }

  async toggleItem(name: string) {
    // Click whichever checkbox state is currently showing
    const addCheckbox = this.page.getByLabel(`Add ${name}`)
    const removeCheckbox = this.page.getByLabel(`Remove ${name}`)
    const isAdd = await addCheckbox.isVisible()
    if (isAdd) {
      await addCheckbox.click()
    } else {
      await removeCheckbox.click()
    }
  }
}
```

Create `e2e/tests/settings/tags.spec.ts` as a stub:

```ts
import { test } from '@playwright/test'

// Tests will be added in Tasks 2-8
```

**Step 2: Verify the files exist**

```bash
ls e2e/pages/settings/
ls e2e/tests/settings/
```

Expected: both directories exist with their files.

**Step 3: Commit**

```bash
git add e2e/pages/settings/ e2e/tests/settings/
git commit -m "feat(e2e): add settings tags page objects and test stub"
```

---

### Task 2: Add shared teardown and seed helper

**Files:**
- Modify: `e2e/tests/settings/tags.spec.ts`

**Step 1: Replace the stub with teardown + seed helper**

```ts
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

// Tests will be added in Tasks 3-8
```

**Step 2: Run the test file to verify it parses without error**

```bash
pnpm test:e2e e2e/tests/settings/tags.spec.ts
```

Expected: 0 tests run, no parse errors.

**Step 3: Commit**

```bash
git add e2e/tests/settings/tags.spec.ts
git commit -m "feat(e2e): add seed helpers and teardown for tags e2e"
```

---

### Task 3: Test — user can create a tag type

**Files:**
- Modify: `e2e/tests/settings/tags.spec.ts`

**Step 1: Add the test**

Add after the teardown block:

```ts
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
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/settings/tags.spec.ts --grep "user can create a tag type"
```

Expected: PASS.

**Step 3: Commit**

```bash
git add e2e/tests/settings/tags.spec.ts
git commit -m "feat(e2e): test user can create a tag type"
```

---

### Task 4: Test — user can add a tag to a tag type

**Files:**
- Modify: `e2e/tests/settings/tags.spec.ts`

**Step 1: Add the test**

```ts
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
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/settings/tags.spec.ts --grep "user can add a tag to a tag type"
```

Expected: PASS.

If `clickNewTag` fails due to the XPath locator, adjust the implementation in `TagsPage.ts`. A more reliable alternative for finding "New Tag" within a card:

```ts
// In TagsPage.ts — alternative clickNewTag implementation
async clickNewTag(tagTypeName: string) {
  // The type card contains an h3 heading and a "New Tag" button in the same CardContent
  // Use getByRole('region') or simply locate by the button text near the heading
  const heading = this.page.getByRole('heading', { name: tagTypeName, level: 3 })
  // Traverse up to the Card element, then find the New Tag button within it
  await heading.locator('xpath=ancestor::*[contains(@class,"relative")][1]')
    .getByRole('button', { name: /new tag/i })
    .click()
}
```

**Step 3: Commit**

```bash
git add e2e/tests/settings/tags.spec.ts e2e/pages/settings/TagsPage.ts
git commit -m "feat(e2e): test user can add a tag to a tag type"
```

---

### Task 5: Test — user can delete a tag

**Files:**
- Modify: `e2e/tests/settings/tags.spec.ts`

**Step 1: Add the test**

```ts
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
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/settings/tags.spec.ts --grep "user can delete a tag"
```

Expected: PASS.

If `clickDeleteTag` locator is unreliable, use a named aria approach. Check in the browser what the X button's accessible name is (it may be "X" or have no label). If needed, update `clickDeleteTag` in `TagsPage.ts`:

```ts
async clickDeleteTag(name: string) {
  // The X button is inside the same inline-flex div as the badge button.
  // Use locator chaining: find the wrapping div that contains both.
  const wrapper = this.page.locator('div.inline-flex').filter({
    has: this.page.getByRole('button', { name })
  })
  // Click the last button in the wrapper (the X)
  await wrapper.getByRole('button').last().click()
}
```

**Step 3: Commit**

```bash
git add e2e/tests/settings/tags.spec.ts e2e/pages/settings/TagsPage.ts
git commit -m "feat(e2e): test user can delete a tag"
```

---

### Task 6: Test — user can delete a tag type

**Files:**
- Modify: `e2e/tests/settings/tags.spec.ts`

**Step 1: Add the test**

```ts
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
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/settings/tags.spec.ts --grep "user can delete a tag type"
```

Expected: PASS.

**Step 3: Commit**

```bash
git add e2e/tests/settings/tags.spec.ts
git commit -m "feat(e2e): test user can delete a tag type"
```

---

### Task 7: Test — user can move a tag via drag-and-drop (with undo)

**Files:**
- Modify: `e2e/tests/settings/tags.spec.ts`

**Step 1: Add the test**

```ts
test('user can move a tag to a different type via drag-and-drop', async ({ page }) => {
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
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/settings/tags.spec.ts --grep "drag-and-drop"
```

Expected: PASS.

**Drag-and-drop troubleshooting:** The `@dnd-kit` PointerSensor requires 8px activation distance. If `dragTo()` doesn't trigger the drag, use a slower manual drag:

```ts
// Alternative dragTagToType in TagsPage.ts
async dragTagToType(tagName: string, targetTypeName: string) {
  const source = this.page.getByRole('button', { name: tagName })
  const target = this.page.getByRole('heading', { name: targetTypeName, level: 3 })

  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) throw new Error('Could not get bounding boxes')

  // Move mouse to source center
  await this.page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  )
  await this.page.mouse.down()
  // Move past the 8px activation threshold first
  await this.page.mouse.move(
    sourceBox.x + sourceBox.width / 2 + 10,
    sourceBox.y + sourceBox.height / 2,
    { steps: 5 },
  )
  // Move to target
  await this.page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 10 },
  )
  await this.page.mouse.up()
}
```

**Step 3: Commit**

```bash
git add e2e/tests/settings/tags.spec.ts e2e/pages/settings/TagsPage.ts
git commit -m "feat(e2e): test user can move tag via drag-and-drop with undo"
```

---

### Task 8: Test — user can edit tag name and type on Info tab

**Files:**
- Modify: `e2e/tests/settings/tags.spec.ts`

**Step 1: Add the test**

```ts
test('user can edit tag name and type on Info tab', async ({ page }) => {
  const detail = new TagDetailPage(page)

  // Given: two tag types "Protein" and "Dairy", with tag "Chicken" under "Protein"
  const { tagTypeIds, tagIds } = await seedTags(
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

  // Then: the page navigates away (back to tags list) after save
  // Navigate back to verify the change persisted
  await detail.navigateTo(tagId)

  // The Name field shows "Turkey"
  await expect(page.getByLabel('Name')).toHaveValue('Turkey')
})
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/settings/tags.spec.ts --grep "edit tag name and type"
```

Expected: PASS.

**Note:** After save, `goBack()` navigates to the tags list. The test re-navigates to the detail page to verify persistence. If the page clears the Name input before the check, wait for it: `await page.waitForURL(/\/settings\/tags\/${tagId}/)`.

**Step 3: Commit**

```bash
git add e2e/tests/settings/tags.spec.ts e2e/pages/settings/TagDetailPage.ts
git commit -m "feat(e2e): test user can edit tag name and type on Info tab"
```

---

### Task 9: Test — user can assign and unassign an item on Items tab

**Files:**
- Modify: `e2e/tests/settings/tags.spec.ts`

**Step 1: Add the test**

```ts
test('user can assign and unassign an item on Items tab', async ({ page }) => {
  const detail = new TagDetailPage(page)

  // Given: tag type "Protein" + tag "Chicken" + item "Eggs" (unassigned)
  const { tagIds } = await seedTags(
    page,
    [{ name: 'Protein', color: 'green' }],
    [{ name: 'Chicken', typeIndex: 0 }],
  )
  const tagId = tagIds[0]
  await seedItem(page, 'Eggs')

  // When: navigate to tag detail Items tab
  await detail.navigateToItems(tagId)

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
```

**Step 2: Run the test**

```bash
pnpm test:e2e e2e/tests/settings/tags.spec.ts --grep "assign and unassign"
```

Expected: PASS.

**Note:** `seedItem` is called after `seedTags` without going back to `/` — since we're already on `/` from `seedTags`, this works. But `seedItem` calls `page.goto('/')` at its start which is fine (idempotent).

**Step 3: Run all tags tests together**

```bash
pnpm test:e2e e2e/tests/settings/tags.spec.ts
```

Expected: 7 tests, all PASS.

**Step 4: Commit**

```bash
git add e2e/tests/settings/tags.spec.ts e2e/pages/settings/TagDetailPage.ts
git commit -m "feat(e2e): test user can assign and unassign item on Items tab"
```

---

### Task 10: Run full e2e suite and verify no regressions

**Step 1: Run all e2e tests**

```bash
pnpm test:e2e
```

Expected: All tests pass (including existing shopping + cooking + item-management tests).

**Step 2: If any test fails, investigate**

Common causes:
- New `settings/` subdirectory changes Playwright's test discovery — check `playwright.config.ts` `testDir` setting
- Drag-and-drop test is flaky — switch to manual mouse API (see Task 7 troubleshooting)
- `seedItem` calls `page.goto('/')` which may interfere if called mid-test — ensure DB is open before putting

**Step 3: Commit any fixes, then confirm clean run**

```bash
pnpm test:e2e
```

Expected: All pass. Done.
