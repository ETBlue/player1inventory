import { expect, test } from '@playwright/test'
import { seedRows } from '../helpers/locationSeed'

// Issue #247 part 2 — the Settings assignment surfaces became GLOBAL.
//
// Two of its user-visible outcomes had unit coverage but nothing end to end:
//   * the four `…/items` assignment tabs render no active-location stock, and
//   * Settings is pinned to the bottom of the desktop sidebar, split from the
//     three location-aware destinations.
//
// Local project only — the cloud project's `testMatch` in playwright.config.ts
// lists its specs explicitly and does not include this file. That is correct:
// cloud has no `ItemStock` and no locations, so neither behaviour is meaningful
// there.

const TAG_TYPE_ID = 'ffffffff-0000-0000-0000-0000000000a1'
const TAG_ID = 'ffffffff-0000-0000-0000-0000000000a2'
const ITEM_ID = 'ffffffff-0000-0000-0000-0000000000a3'

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

test('user sees no location stock on a settings items tab, while the pantry shows it', async ({
  page,
}) => {
  // Given a tag and an item stocked 5 of a target 10 in the active location.
  // The pantry half of this test is the control: it proves the fixture really
  // does carry stock, so the settings half is asserting suppression rather
  // than an item that simply has nothing to show.
  const now = new Date()
  await page.goto('/')
  await seedRows(page, 'tagTypes', [
    {
      id: TAG_TYPE_ID,
      name: 'Category',
      color: 'blue',
      createdAt: now,
      updatedAt: now,
    },
  ])
  await seedRows(page, 'tags', [
    {
      id: TAG_ID,
      name: 'Dairy',
      typeId: TAG_TYPE_ID,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await seedRows(page, 'items', [
    {
      id: ITEM_ID,
      name: 'Milk',
      tagIds: [TAG_ID],
      vendorIds: [],
      // Stock CONFIGURATION is global to the Item since v16.
      targetUnit: 'package',
      consumeAmount: 0,
      packageUnit: 'carton',
      createdAt: now,
      updatedAt: now,
    },
  ])
  await seedRows(page, 'itemStocks', [
    {
      id: `stock-${ITEM_ID}`,
      itemId: ITEM_ID,
      locationId: 'local',
      // Per-location STATE. 5 of 10 renders "5/10" plus a 10-segment bar.
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity: 5,
      unpackedQuantity: 0,
      createdAt: now,
      updatedAt: now,
    },
  ])

  // When the item is viewed in the pantry (control)
  await page.goto('/')
  const pantryCard = page.getByText('Milk').first()
  await expect(pantryCard).toBeVisible()

  // Then the pantry does show this location's stock: the quantity text and the
  // segmented progress bar (ItemProgressBar renders one element per segment,
  // each carrying data-segment). Those two are the load-bearing pair — the unit
  // badge and the severity tint are covered by ItemCard.test.tsx, where they
  // can be asserted without guessing at rendered class names.
  await expect(page.getByText('5/10')).toBeVisible()
  await expect(page.locator('[data-segment]').first()).toBeVisible()

  // When the same item is viewed on the tag's Items tab — a GLOBAL item↔tag
  // assignment surface, which passes showStock={false}
  await page.goto(`/settings/tags/${TAG_ID}/items`)
  await expect(page.getByText('Milk').first()).toBeVisible()

  // Then no active-location stock is rendered at all
  await expect(page.getByText('5/10')).toHaveCount(0)
  await expect(page.locator('[data-segment]')).toHaveCount(0)
})

test('user sees Settings pinned below the location-aware links in the sidebar', async ({
  page,
}) => {
  // Given the pantry at a desktop viewport, where the sidebar is rendered
  // (it is `hidden lg:flex`, so a narrower viewport has no sidebar at all)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')

  // When the sidebar's nav links are read
  // (<nav aria-label="Sidebar navigation"> — src/components/global/Sidebar/Sidebar.tsx)
  const sidebar = page.getByRole('navigation', { name: 'Sidebar navigation' })
  await expect(sidebar).toBeVisible()
  const labels = await sidebar.getByRole('link').allInnerTexts()

  // Then Settings comes last, after the three location-aware destinations
  expect(labels.map((label) => label.trim())).toEqual([
    'Pantry',
    'Shopping',
    'Cooking',
    'Settings',
  ])

  // And it is genuinely PINNED TO THE BOTTOM, not merely listed fourth.
  // Order alone cannot tell the two apart — Settings was already last in the
  // flat four-entry array this replaced, so an order-only assertion stays green
  // against the old code. Real layout is the only thing that distinguishes
  // them, and it is exactly what jsdom cannot give the unit test: measure the
  // gap the `mt-auto` block opens up.
  const nav = await sidebar.boundingBox()
  const cooking = await sidebar.getByRole('link', { name: 'Cooking' }).boundingBox()
  const settings = await sidebar.getByRole('link', { name: 'Settings' }).boundingBox()
  if (!nav || !cooking || !settings) {
    throw new Error('sidebar, Cooking link or Settings link has no layout box')
  }

  // A large vertical gap separates Settings from the three above it — in the
  // flat-list layout the links are a 4px `gap-1` apart.
  expect(settings.y - (cooking.y + cooking.height)).toBeGreaterThan(200)
  // …and Settings sits at the foot of the sidebar, not floating mid-column.
  expect(nav.y + nav.height - (settings.y + settings.height)).toBeLessThan(60)
})
