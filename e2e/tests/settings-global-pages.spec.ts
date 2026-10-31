import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'
import { seedCloudFixture } from '../helpers/cloudSeed'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import type { Fixture } from '../helpers/fixture'
import { seedLocalFixture } from '../helpers/localSeed'

// Issue #247 part 2 — the Settings assignment surfaces became GLOBAL.
//
// Two of its user-visible outcomes had unit coverage but nothing end to end:
//   * the four `…/items` assignment tabs render no active-location stock, and
//   * Settings is pinned to the bottom of the desktop sidebar, split from the
//     three location-aware destinations. Since households H1 the bottom block
//     holds 🏠 "My data" and the 👤 "Preferences" button instead of a single
//     Settings link, and test 2 checks that layout plus the household view
//     🏠 opens.
//
// TEST 1 RUNS IN BOTH PROJECTS as of issue #323 task 2. TEST 2 RUNS IN `local`
// ONLY — see its own `test.skip`.
//
// The header comment here used to say the whole file was local-only because
// "cloud has no `ItemStock` and no locations, so neither behaviour is
// meaningful there". That has been false since cloud locations PR 1: in cloud
// `useItems()` reads `itemStocks(locationId:)` through the `PantryData` query
// and joins the rows client-side. The stale comment is the likeliest reason
// nobody tried this file in cloud for seven months.
//
// WHAT THE CLOUD RUN OF TEST 1 ADDS: no new resolver. `items`,
// `itemStocks(locationId:)`, `tags`, `tagTypes`, `vendors` and `recipes` are
// all reached by other cloud specs. What is new is the PATH THE STOCK TAKES.
// In local the quantities come out of Dexie on the same row as the item; in
// cloud they arrive in a separate GraphQL field and are joined onto the item in
// the browser. `showStock={false}` has to suppress the result either way, and
// only this run proves the GraphQL half.
//
// Say so plainly: that is a narrow gain. It is one test, it costs seconds, and
// it reaches no code the server has never run.
//
// WHAT TEST 1 CANNOT CATCH: it seeds ONE location, so it says nothing about
// location scoping — with one location "stock here" and "stock anywhere" are
// the same rows.
//
// THE ASSERTION ORDER IS THE GUARD, NOT THE COUNTS. `toHaveCount(0)` is
// satisfied by a page that has not finished loading, exactly like the
// `not.toBeVisible()` that task 1 of this issue found could not fail
// (e2e/tests/settings/shelves.spec.ts). So the two suppression assertions run
// only AFTER the item's own checkbox has been asserted present and checked:
// that proves the list is rendered and that the item really is tagged.

const TAG_TYPE_ID = 'ffffffff-0000-0000-0000-0000000000a1'
const TAG_ID = 'ffffffff-0000-0000-0000-0000000000a2'
const ITEM_ID = 'ffffffff-0000-0000-0000-0000000000a3'

// One tag on one tagged item, stocked 5 of a target 10 in the default
// location. The ids are fixed strings because the spec navigates to
// `/settings/household/tags/${TAG_ID}/items` by literal id; `TagTypeInput`, `TagInput`
// and `ItemInput` all declare `id: ID!`, so cloud keeps these values.
const FIXTURE: Fixture = {
  // The default location must be listed first — `seedLocalFixture` writes
  // `order: index`, so moving it changes the local page order while cloud stays
  // silent (helpers/cloudSeed.ts skips the default entirely).
  locations: [{ key: 'HOME', name: 'My Home', isDefault: true }],
  vendors: [],
  tagTypes: [{ id: TAG_TYPE_ID, name: 'Category', color: 'blue' }],
  tags: [{ id: TAG_ID, name: 'Dairy', typeId: TAG_TYPE_ID }],
  items: [
    {
      id: ITEM_ID,
      name: 'Milk',
      tagIds: [TAG_ID],
      // Stock CONFIGURATION is global to the Item since Dexie v16.
      // `consumeAmount` is omitted on purpose, which gives the product default
      // of 1 in both modes. The hand-written seed this replaced set 0 — a value
      // no app-created item ever holds, and one `ItemForm` reports as invalid.
      targetUnit: 'package',
    },
  ],
  // Per-location STATE. 5 of 10 renders "5 / 10" plus a 10-segment bar.
  //
  // `location: 'HOME'` is why this spec can run in cloud at all. The seed it
  // replaced hardcoded `locationId: 'local'`, the LOCAL default-location
  // sentinel, which names no row in cloud — there the default location id is a
  // server-generated cuid.
  stocks: [
    {
      itemId: ITEM_ID,
      location: 'HOME',
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity: 5,
      unpackedQuantity: 0,
    },
  ],
  shelves: [],
  recipes: [],
}

/** Seed `fixture` into whichever backend this project runs against. */
async function seedFixture(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  fixture: Fixture,
): Promise<void> {
  if (baseURL === CLOUD_WEB_URL) {
    await seedCloudFixture(request, fixture)
    return
  }
  await seedLocalFixture(page, fixture)
}

test.beforeEach(async ({ page, request, baseURL }) => {
  // Prevent empty-data redirect to /onboarding so tests can navigate freely.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  if (baseURL === CLOUD_WEB_URL) {
    // Guards against a previous run that crashed before its teardown.
    await cleanupCloudData(request)
  }
})

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    // Cloud mode: delete this user's rows through the E2E cleanup endpoint.
    await cleanupCloudData(request)
    return
  }
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
            console.warn(
              `[afterEach] IndexedDB delete blocked for "${name}"...`,
            )
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
  request,
  baseURL,
}) => {
  // Given a tag and an item stocked 5 of a target 10 in the active location.
  // The pantry half of this test is the control: it proves the fixture really
  // does carry stock, so the settings half is asserting suppression rather
  // than an item that simply has nothing to show.
  await seedFixture(page, request, baseURL, FIXTURE)

  // When the item is viewed in the pantry (control)
  await page.goto('/')
  const pantryCard = page.getByText('Milk').first()
  await expect(pantryCard).toBeVisible()

  // Then the pantry does show this location's stock: the quantity text and the
  // segmented progress bar (ItemProgressBar renders one element per segment,
  // each carrying data-segment). Those two are the pair that matters — the unit
  // badge and the severity tint are covered by ItemCard.test.tsx, where they
  // can be asserted without guessing at rendered class names.
  await expect(page.getByText('5 / 10')).toBeVisible()
  await expect(page.locator('[data-segment]').first()).toBeVisible()

  // When the same item is viewed on the tag's Items tab — a GLOBAL item↔tag
  // assignment surface, which passes showStock={false}
  await page.goto(`/settings/household/tags/${TAG_ID}/items`)
  await expect(page.getByText('Milk').first()).toBeVisible()

  // Then the row is there AND the item is assigned to this tag. Both halves
  // are needed before the two counts below mean anything:
  //   * present — a count of 0 on a page still loading proves nothing;
  //   * checked — an item whose `tagIds` were dropped by the seed still shows
  //     on this page, in the unassigned group, so "Milk is visible" does not
  //     prove the tag link survived into the backend.
  // The locator matches EITHER label on purpose, so the failure is a value
  // difference ("Expected: checked / Received: unchecked") rather than a
  // locator timeout. Matching only 'Remove Milk' would make a dropped tag link
  // look like a missing element, which is the weaker signal of the two.
  // Checkbox: aria-label={isChecked ? `Remove ${name}` : `Add ${name}`}
  // (src/components/item/ItemCard/ItemCard.tsx:172)
  const milkCheckbox = page.getByRole('checkbox', {
    name: /^(Add|Remove) Milk$/,
  })
  await expect(milkCheckbox).toBeVisible()
  await expect(milkCheckbox).toBeChecked()

  // Then no active-location stock is rendered at all
  await expect(page.getByText('5 / 10')).toHaveCount(0)
  await expect(page.locator('[data-segment]')).toHaveCount(0)
})

test('user sees My data and Preferences pinned to the bottom of the sidebar, and My data opens the household sidebar', async ({
  page,
  baseURL,
}) => {
  // LOCAL ONLY, on purpose. The only mode-aware part of the main sidebar is
  // the 👤 label (`UserLabel` in
  // src/components/settings/UserSettingsPanel/UserSettingsPanel.tsx). It says
  // "Preferences" in local mode AND in E2E cloud mode, because E2E cloud has
  // no Clerk user name. So a cloud run would measure the same links, the same
  // button and the same bounding boxes a second time.
  test.skip(
    baseURL === CLOUD_WEB_URL,
    'the sidebar renders the same markup in local and E2E cloud mode (the 👤 label is "Preferences" in both), so a cloud run measures identical bounding boxes',
  )

  // Given the pantry at a desktop viewport, where the sidebar is rendered
  // (it is `hidden lg:flex`, so a narrower viewport has no sidebar at all)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')

  // When the sidebar's links are read
  // (<nav aria-label="Sidebar navigation"> — src/components/global/Sidebar/Sidebar.tsx)
  const sidebar = page.getByRole('navigation', { name: 'Sidebar navigation' })
  await expect(sidebar).toBeVisible()
  const labels = await sidebar.getByRole('link').allInnerTexts()

  // Then 🏠 "My data" comes after the three location-aware destinations, and
  // there is no "Settings" link any more
  expect(labels.map((label) => label.trim())).toEqual([
    'Pantry',
    'Shopping',
    'Cooking',
    'My data',
  ])

  // And 🏠 "My data" and the 👤 "Preferences" button are PINNED TO THE BOTTOM,
  // not merely listed last. Order alone cannot tell the two layouts apart.
  // Real layout can, and jsdom cannot give it to the unit test: measure the
  // gap the `mt-auto` block opens up.
  const nav = await sidebar.boundingBox()
  const cooking = await sidebar
    .getByRole('link', { name: 'Cooking' })
    .boundingBox()
  const myData = await sidebar
    .getByRole('link', { name: 'My data' })
    .boundingBox()
  const preferences = await sidebar
    .getByRole('button', { name: 'Preferences' })
    .boundingBox()
  if (!nav || !cooking || !myData || !preferences) {
    throw new Error(
      'sidebar, Cooking, My data or Preferences has no layout box',
    )
  }

  // A large vertical gap separates the bottom block from the three links
  // above it. In a flat list the links are a 4px `gap-1` apart.
  expect(myData.y - (cooking.y + cooking.height)).toBeGreaterThan(200)
  // 👤 sits directly below 🏠, in the same block…
  expect(preferences.y).toBeGreaterThan(myData.y)
  expect(preferences.y - (myData.y + myData.height)).toBeLessThan(20)
  // …and the block sits at the foot of the sidebar, not mid-column.
  expect(
    nav.y + nav.height - (preferences.y + preferences.height),
  ).toBeLessThan(60)

  // When the user goes to Cooking, then presses 🏠 "My data"
  await sidebar.getByRole('link', { name: 'Cooking' }).click()
  // The cooking page writes its default search string into the URL
  // (`?sort=recent&dir=asc&q=&expanded=`), so wait for it before reading it
  await expect(page).toHaveURL(/\/cooking\?/)
  const cookingUrl = page.url()
  await sidebar.getByRole('link', { name: 'My data' }).click()

  // Then the household config page opens, and the sidebar shows the
  // household view: Back, the heading, and six links
  // (src/components/global/Sidebar/HouseholdSidebar.tsx)
  await expect(page).toHaveURL(/\/settings\/household$/)
  await expect(sidebar.getByRole('button', { name: 'Back' })).toBeVisible()
  await expect(
    sidebar.getByRole('heading', { name: 'My data', level: 2 }),
  ).toBeVisible()
  await expect(sidebar.getByRole('link')).toHaveText([
    'General',
    'Locations',
    'Shelves',
    'Vendors',
    'Recipes',
    'Tags',
  ])
  // General is the active item on `/settings/household` itself
  await expect(sidebar.getByRole('link', { name: 'General' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  // The main view is gone. Asserted after the six links are present, so a
  // sidebar that has not rendered yet cannot satisfy it.
  await expect(sidebar.getByRole('link', { name: 'Pantry' })).toHaveCount(0)
  await expect(
    sidebar.getByRole('button', { name: 'Preferences' }),
  ).toHaveCount(0)

  // When the user presses Back
  await sidebar.getByRole('button', { name: 'Back' }).click()

  // Then they return to the last app page they saw, Cooking. Not the `/`
  // fallback: that is why the test visits Cooking first.
  await expect(page).toHaveURL(cookingUrl)
  await expect(sidebar.getByRole('link', { name: 'My data' })).toBeVisible()
})
