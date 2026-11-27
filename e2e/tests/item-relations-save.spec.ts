import {
  type APIRequestContext,
  type Browser,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { checkA11y, injectAxe } from 'axe-playwright'
import { CLOUD_WEB_URL, E2E_SECOND_USER_ID, E2E_USER_ID } from '../constants'
import {
  AXE_OPTIONS,
  checkA11yAllowingKnownTagBadgeDefects,
} from '../helpers/axe'
import { seedCloudFixture } from '../helpers/cloudSeed'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { addHouseholdMember } from '../helpers/cloudUsers'
import type { Fixture } from '../helpers/fixture'
import { seedLocalFixture } from '../helpers/localSeed'
import { newUserContext } from '../helpers/userContext'
import { ItemPage } from '../pages/ItemPage'
import { makeGql } from '../utils/cloud'

// Save item tags, vendors and recipes with one Save (design
// docs/features/items/2026-11-27-item-relations-save-design.md, PR B task B.8).
//
// On the item page, a press on a Tags, Vendors or Recipes badge changes only
// the screen. The top bar Save sends the whole list of the tab in one write.
// A new tag, vendor or recipe made from the tab is created at once, but only
// Save gives it to the item.
//
// | Test | What it proves                                                        |
// |------|-----------------------------------------------------------------------|
// | 1    | two presses and one Save: the backend has the shown list, not the old |
// | 2    | leaving Tags with a press opens the dialog; its Save writes the press |
// | 3    | Discard after New Tag: the tag exists, the item does not have it      |
// | 4    | one Recipes Save adds the item to one recipe and takes it out of      |
// |      | another; the new link gets `consumeAmount`, the old one keeps its     |
// |      | amount (in cloud: the first real-SQL run of `setItemRecipes`)         |
// | 5    | cloud only: a household `member` sees no Save, and a press does       |
// |      | nothing                                                               |
// | 6, 7 | axe scans of the three tabs with a pressed badge and Save on, light   |
// |      | and dark (`a11y.spec.ts` does not run in `cloud`)                     |
//
// Every check of a write reads the BACKEND (IndexedDB in local, GraphQL in
// cloud) with `expect.poll`, because a click resolves before the write lands.
// A pressed badge on screen proves nothing: a press shows as pressed before
// Save too.
//
// The Tags tab scans allow one known tag badge defect (light-mode contrast,
// waiting for an owner decision), from that axe rule only: see
// `KNOWN_TAG_BADGE_DEFECTS` in e2e/helpers/axe.ts.
//
// Runs in `local` and `cloud` (`CLOUD_SPECS` in e2e/playwright.config.ts).

const HOME = 'HOME'
const ITEM = 'item-milk'
const TAG_TYPE = 'tagtype-category'
const TAG_DAIRY = 'tag-dairy'
const TAG_FRESH = 'tag-fresh'
const TAG_FROZEN = 'tag-frozen'
const VENDOR_COSTCO = 'vendor-costco'
const RECIPE_SOUP = 'recipe-soup'
const RECIPE_PASTA = 'recipe-pasta'
const RECIPE_SALAD = 'recipe-salad'

// A household member for test 5. The project's own page is E2E_USER_ID, the
// owner of the household `seedCloudFixture` writes into.
const MEMBER = `${E2E_SECOND_USER_ID}-relations-member`

const FIXTURE: Fixture = {
  locations: [{ key: HOME, name: 'My Home', isDefault: true }],
  vendors: [{ id: VENDOR_COSTCO, name: 'Costco' }],
  tagTypes: [{ id: TAG_TYPE, name: 'Category', color: 'blue' }],
  tags: [
    { id: TAG_DAIRY, name: 'Dairy', typeId: TAG_TYPE },
    { id: TAG_FRESH, name: 'Fresh', typeId: TAG_TYPE },
    { id: TAG_FROZEN, name: 'Frozen', typeId: TAG_TYPE },
  ],
  // Milk starts with ONE tag, so "Save sends the saved list" and "Save sends
  // the shown list" give different answers. `consumeAmount: 2` is not the
  // fallback 1 and not 0, so a new recipe link with a wrong amount shows.
  items: [{ id: ITEM, name: 'Milk', tagIds: [TAG_FROZEN], consumeAmount: 2 }],
  stocks: [{ itemId: ITEM, location: HOME }],
  shelves: [],
  // Soup and Salad hold Milk with amounts that are neither 2 nor 1, so a
  // Save that rewrote an existing link's amount would show.
  recipes: [
    {
      id: RECIPE_SOUP,
      name: 'Soup',
      items: [{ itemId: ITEM, defaultAmount: 3 }],
    },
    { id: RECIPE_PASTA, name: 'Pasta', items: [] },
    {
      id: RECIPE_SALAD,
      name: 'Salad',
      items: [{ itemId: ITEM, defaultAmount: 5 }],
    },
  ],
}

type RecipeRow = {
  id: string
  name: string
  items: { itemId: string; defaultAmount: number }[]
}

type Relations = {
  tagIds: string[]
  vendorIds: string[]
  tagNames: string[]
  recipes: RecipeRow[]
}

const READ_RELATIONS = `query ($id: ID!) {
  item(id: $id) { tagIds vendorIds }
  tags { name }
  recipes { id name items { itemId defaultAmount } }
}`

async function seed(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<Record<string, string>> {
  if (baseURL === CLOUD_WEB_URL) return seedCloudFixture(request, FIXTURE)
  return seedLocalFixture(page, FIXTURE)
}

/**
 * What the backend holds now: IndexedDB in local mode, GraphQL in cloud.
 * Never the screen.
 */
async function readRelations(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<Relations> {
  if (baseURL === CLOUD_WEB_URL) {
    const data = await makeGql(request)<{
      item: { tagIds: string[]; vendorIds: string[] | null } | null
      tags: { name: string }[]
      recipes: RecipeRow[]
    }>(READ_RELATIONS, { id: ITEM })
    return {
      tagIds: [...(data.item?.tagIds ?? [])].sort(),
      vendorIds: [...(data.item?.vendorIds ?? [])].sort(),
      tagNames: data.tags.map((tag) => tag.name).sort(),
      recipes: data.recipes,
    }
  }
  return page.evaluate(async (itemId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('Player1Inventory')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const read = <T>(store: string, key?: string) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const req =
          key === undefined
            ? tx.objectStore(store).getAll()
            : tx.objectStore(store).get(key)
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error)
      })
    const item = await read<
      { tagIds?: string[]; vendorIds?: string[] } | undefined
    >('items', itemId)
    const tags = await read<{ name: string }[]>('tags')
    const recipes = await read<RecipeRow[]>('recipes')
    db.close()
    return {
      tagIds: [...(item?.tagIds ?? [])].sort(),
      vendorIds: [...(item?.vendorIds ?? [])].sort(),
      tagNames: tags.map((tag) => tag.name).sort(),
      recipes: recipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        items: recipe.items,
      })),
    }
  }, ITEM)
}

/** Milk's amount in one recipe, or `null` when the recipe does not hold Milk. */
function milkAmountIn(relations: Relations, recipeId: string): number | null {
  const recipe = relations.recipes.find((row) => row.id === recipeId)
  if (!recipe) throw new Error(`recipe ${recipeId} is missing`)
  const link = recipe.items.find((row) => row.itemId === ITEM)
  return link ? link.defaultAmount : null
}

function badge(page: Page, name: string, pressed: boolean) {
  // Badges on the three tabs: role="button" aria-pressed
  // (src/routes/items/$id/tags.tsx:91, vendors.tsx:131, recipes.tsx:151)
  return page.getByRole('button', { name, exact: true, pressed })
}

function saveButton(page: Page) {
  // The top bar Save (`TopBarSaveButton`, label `common.save`)
  return page.getByRole('button', { name: 'Save', exact: true })
}

function unsavedDialog(page: Page) {
  return page.getByRole('alertdialog', { name: 'Unsaved changes' })
}

test.beforeEach(async ({ page, request, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  // The only cloud cleanup of each test (E2E speed plan, decision D7). The
  // member is in the list, so test 5's member row goes too.
  if (baseURL === CLOUD_WEB_URL) {
    await cleanupCloudData(request, [E2E_USER_ID, MEMBER])
  }
})

test.afterEach(async ({ page, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) return
  // Local mode: clear IndexedDB, localStorage and sessionStorage
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
          req.onblocked = () => resolve()
        })
      }),
    )
    localStorage.clear()
    sessionStorage.clear()
  })
})

test.describe('item tags, vendors and recipes — one Save per tab', () => {
  test('user can press two tags and save both changes with one Save', async ({
    page,
    request,
    baseURL,
  }) => {
    // Given Milk has the tag Frozen
    await seed(page, request, baseURL)
    const item = new ItemPage(page)
    await page.goto(`/items/${ITEM}/tags`)
    await expect(badge(page, 'Frozen', true)).toBeVisible()
    await expect(saveButton(page)).toBeDisabled()

    // When the user presses Dairy on and Frozen off
    await badge(page, 'Dairy', false).click()
    await badge(page, 'Frozen', true).click()

    // Then the screen shows the change and Save turns on
    await expect(badge(page, 'Dairy', true)).toBeVisible()
    await expect(badge(page, 'Frozen', false)).toBeVisible()
    await expect(saveButton(page)).toBeEnabled()

    // And nothing is written yet (a negative control: the seed already holds
    // this state, so a plain read is enough)
    expect((await readRelations(page, request, baseURL)).tagIds).toEqual([
      TAG_FROZEN,
    ])

    // When the user presses Save
    await item.saveRelations()

    // Then the backend holds the list on screen
    await expect
      .poll(async () => (await readRelations(page, request, baseURL)).tagIds)
      .toEqual([TAG_DAIRY])

    // And a reload shows it
    await page.reload()
    await expect(badge(page, 'Dairy', true)).toBeVisible()
    await expect(badge(page, 'Frozen', false)).toBeVisible()
    await expect(saveButton(page)).toBeDisabled()
  })

  test('user can save a tag press from the unsaved-changes dialog when leaving the Tags tab', async ({
    page,
    request,
    baseURL,
  }) => {
    // Given Milk has the tag Frozen, and the user pressed Fresh on
    await seed(page, request, baseURL)
    await page.goto(`/items/${ITEM}/tags`)
    await badge(page, 'Fresh', false).click()
    await expect(badge(page, 'Fresh', true)).toBeVisible()

    // When the user opens the Vendors tab
    await page.getByRole('link', { name: /^vendors$/i }).click()

    // Then the unsaved-changes dialog asks first
    await expect(unsavedDialog(page)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/items/${ITEM}/tags$`))

    // When the user presses Save in the dialog
    await unsavedDialog(page).getByRole('button', { name: 'Save' }).click()

    // Then the page goes to the Vendors tab
    await expect(page).toHaveURL(new RegExp(`/items/${ITEM}/vendors$`))
    await expect(unsavedDialog(page)).toHaveCount(0)

    // And the backend holds both tags
    await expect
      .poll(async () => (await readRelations(page, request, baseURL)).tagIds)
      .toEqual([TAG_FRESH, TAG_FROZEN])
  })

  test('user can discard a new tag: the tag stays, but the item does not get it', async ({
    page,
    request,
    baseURL,
  }) => {
    // Given Milk has the tag Frozen
    await seed(page, request, baseURL)
    await page.goto(`/items/${ITEM}/tags`)
    await expect(badge(page, 'Frozen', true)).toBeVisible()

    // When the user creates the tag "Organic" from the tab
    await page
      .getByRole('button', { name: 'New Tag', exact: true })
      .first()
      .click()
    await page.getByRole('dialog').getByLabel('Name').fill('Organic')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /add tag/i })
      .click()

    // Then the new tag shows as pressed and Save is on
    await expect(badge(page, 'Organic', true)).toBeVisible()
    await expect(saveButton(page)).toBeEnabled()

    // And the tag exists, but the item does not have it yet
    await expect
      .poll(async () => (await readRelations(page, request, baseURL)).tagNames)
      .toContain('Organic')
    expect((await readRelations(page, request, baseURL)).tagIds).toEqual([
      TAG_FROZEN,
    ])

    // When the user opens the Vendors tab and presses Discard
    await page.getByRole('link', { name: /^vendors$/i }).click()
    await unsavedDialog(page).getByRole('button', { name: 'Discard' }).click()
    await expect(page).toHaveURL(new RegExp(`/items/${ITEM}/vendors$`))

    // Then the item still has only Frozen, and the tag Organic still exists
    const after = await readRelations(page, request, baseURL)
    expect(after.tagIds).toEqual([TAG_FROZEN])
    expect(after.tagNames).toContain('Organic')

    // And back on the Tags tab, Organic shows as not selected
    await page.getByRole('link', { name: /^tags$/i }).click()
    await expect(badge(page, 'Organic', false)).toBeVisible()
    await expect(badge(page, 'Frozen', true)).toBeVisible()
  })

  test('user can add an item to one recipe and take it out of another with one Save', async ({
    page,
    request,
    baseURL,
  }) => {
    // Given Milk is in Soup (amount 3) and Salad (amount 5), not in Pasta
    await seed(page, request, baseURL)
    const item = new ItemPage(page)
    await page.goto(`/items/${ITEM}/recipes`)
    await expect(badge(page, 'Soup', true)).toBeVisible()
    await expect(badge(page, 'Salad', true)).toBeVisible()

    // When the user presses Pasta on and Salad off, then Save
    await badge(page, 'Pasta', false).click()
    await badge(page, 'Salad', true).click()
    await expect(badge(page, 'Pasta', true)).toBeVisible()
    await expect(badge(page, 'Salad', false)).toBeVisible()
    await item.saveRelations()

    // Then Pasta holds Milk with Milk's consumeAmount (2), Salad no longer
    // holds it, and Soup keeps its own amount (3)
    await expect
      .poll(async () => {
        const relations = await readRelations(page, request, baseURL)
        return {
          soup: milkAmountIn(relations, RECIPE_SOUP),
          pasta: milkAmountIn(relations, RECIPE_PASTA),
          salad: milkAmountIn(relations, RECIPE_SALAD),
        }
      })
      .toEqual({ soup: 3, pasta: 2, salad: null })

    // And a reload shows it
    await page.reload()
    await expect(badge(page, 'Soup', true)).toBeVisible()
    await expect(badge(page, 'Pasta', true)).toBeVisible()
    await expect(badge(page, 'Salad', false)).toBeVisible()
  })

  test('household member sees the item tags read only, with no Save', async ({
    page,
    browser,
    request,
    baseURL,
  }) => {
    test.skip(
      baseURL !== CLOUD_WEB_URL,
      'household roles exist in cloud only; local mode has one person',
    )
    // Given the owner's household with Milk (tag Frozen), and MEMBER added as
    // a household `member` BEFORE MEMBER opens a page (the route answers 409
    // after MEMBER's first request)
    const locationIds = await seed(page, request, baseURL)
    const homeId = locationIds[HOME]
    if (!homeId) throw new Error('the fixture has no HOME location')
    await addHouseholdMember(request, {
      ownerUserId: E2E_USER_ID,
      memberUserId: MEMBER,
      householdRole: 'member',
      locations: [{ locationId: homeId, role: 'viewer' }],
    })

    // A control: the owner's page has the Save (off until a press). It
    // proves the Save locator finds the button when it is there.
    await page.goto(`/items/${ITEM}/tags`)
    await expect(badge(page, 'Frozen', true)).toBeVisible()
    await expect(saveButton(page)).toBeDisabled()

    const memberPage = await openAsMember(browser)
    try {
      // When MEMBER opens Milk's Tags tab
      await memberPage.goto(`/items/${ITEM}/tags`)

      // Then the badges show (something present first, so the absence below
      // is not the loading state) and are read only
      const frozen = badge(memberPage, 'Frozen', true)
      await expect(frozen).toBeVisible()
      await expect(frozen).toHaveAttribute('aria-disabled', 'true')
      await expect(saveButton(memberPage)).toHaveCount(0)

      // When MEMBER presses Dairy. `force`: Playwright waits for an
      // `aria-disabled` element to be enabled, so a plain click would time
      // out. A person can still click it.
      await badge(memberPage, 'Dairy', false).click({ force: true })

      // Then nothing changes: Dairy is not pressed and no Save appears
      await expect(badge(memberPage, 'Dairy', false)).toBeVisible()
      await expect(saveButton(memberPage)).toHaveCount(0)
      expect((await readRelations(page, request, baseURL)).tagIds).toEqual([
        TAG_FROZEN,
      ])
    } finally {
      await memberPage.context().close()
    }
  })
})

async function openAsMember(browser: Browser): Promise<Page> {
  const context = await newUserContext(browser, MEMBER)
  return context.newPage()
}

/** Open each relation tab, press one badge, and scan with Save on. */
async function scanRelationTabs(page: Page): Promise<void> {
  const presses = [
    { tab: 'tags', name: 'Dairy' },
    { tab: 'vendors', name: 'Costco' },
    { tab: 'recipes', name: 'Pasta' },
  ] as const
  for (const { tab, name } of presses) {
    // Each tab is opened by URL, so the press of the tab before is dropped
    // with no dialog (a direct page load bypasses the guard)
    await page.goto(`/items/${ITEM}/${tab}`)
    await badge(page, name, false).click()
    await expect(badge(page, name, true)).toBeVisible()
    await expect(saveButton(page)).toBeEnabled()
    await page.waitForLoadState('networkidle')
    await injectAxe(page)
    if (tab === 'tags') {
      // Tag badges fail color-contrast in light mode today (a known defect);
      // see KNOWN_TAG_BADGE_DEFECTS in e2e/helpers/axe.ts
      await checkA11yAllowingKnownTagBadgeDefects(page)
    } else {
      await checkA11y(page, undefined, AXE_OPTIONS)
    }
  }
}

test('user can use the Tags, Vendors and Recipes tabs with a press not saved yet without accessibility violations', async ({
  page,
  request,
  baseURL,
}) => {
  // Given Milk with tags, a vendor and recipes to press
  await seed(page, request, baseURL)

  // Then each tab, with a pressed badge and Save on, has no violations
  await scanRelationTabs(page)
})

test.describe('dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('theme-preference', 'dark')
    })
  })

  test('user can use the Tags, Vendors and Recipes tabs with a press not saved yet in dark mode without accessibility violations', async ({
    page,
    request,
    baseURL,
  }) => {
    // Given Milk with tags, a vendor and recipes to press
    await seed(page, request, baseURL)

    // Then each tab, with a pressed badge and Save on, has no violations
    await scanRelationTabs(page)
  })
})
