import {
  type APIRequestContext,
  type Browser,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { checkA11y, injectAxe } from 'axe-playwright'
import { E2E_SECOND_USER_ID, E2E_USER_ID } from '../constants'
import { AXE_OPTIONS } from '../helpers/axe'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { addHouseholdMember } from '../helpers/cloudUsers'
import { operationResponse } from '../helpers/liveSocket'
import { newUserContext } from '../helpers/userContext'
import { LocationsPage } from '../pages/settings/LocationsPage'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE COVERS (households H7b task M.5) ──────────────────────────
//
// The personal location order and the four sorts, on real SQL:
//
// | # | Test | What must be true |
// |---|------|-------------------|
// | 1 | own order | Mia's drag changes Mia's list only. Bea, in the same household, still sees the shared order |
// | 2 | last updated | the location whose stock changed last comes first |
// | 3 | last visited | the location picked last in the switcher comes first, after a reload |
// | 4 | by name | the list and the switcher sort by name |
// | 5 | another device | a sort chosen in one browser shows in a second browser of the same person |
// | 6, 7 | axe | the page, and the open **Sort by** list, in light and dark |
//
// Local mode's **Sort by** (Name and Custom, owner decision O54-B) is tested in
// `settings/locations.spec.ts`, which runs in both projects.
//
// ── THE FIXTURE ──────────────────────────────────────────────────────────────
//
// `seedLocations` makes three locations in the household of E2E_USER_ID
// ("Mia", the owner) in the order Cellar, Attic, Dock, and deletes the
// "Home" that first sign-in made. So the three orders are all different:
//
// | Sort | Order |
// |---|---|
// | the shared order (Custom, with no personal order yet) | Cellar, Attic, Dock |
// | Name | Attic, Cellar, Dock |
//
// Each test asserts an order that differs from both rows, so a sort that
// does nothing, or falls back to the other one, fails the test.
//
// ── WHEN THE DATES SHOW ──────────────────────────────────────────────────────
//
// "Last updated" does NOT move live: the location lists refetch only on
// `LOCATION` events, and a stock change sends `STOCK`. The lists use
// `cache-and-network`, so a new page load shows the new dates. Tests 2 and 3
// change the data first, then load the page.
//
// ── CLOUD ONLY ───────────────────────────────────────────────────────────────
//
// Named in the `cloud` project's `testMatch` and the `local` project's
// `testIgnore` (e2e/playwright.config.ts): local mode has no second person,
// no `dataUpdatedAt` and no visits.

/** The member of test 1. Cleaned up in `beforeEach`. */
const BEA = `${E2E_SECOND_USER_ID}-sort-bea`

const NAMES = ['Cellar', 'Attic', 'Dock'] as const
const SHARED_ORDER = ['Cellar', 'Attic', 'Dock']
const BY_NAME = ['Attic', 'Cellar', 'Dock']

type Gql = ReturnType<typeof makeGql>

const LOCATIONS = `query { locations { id name } }`
const CREATE_LOCATION = `mutation ($name: String!) { createLocation(name: $name) { id } }`
const DELETE_LOCATION = `mutation ($id: ID!) { deleteLocation(id: $id) }`
const CREATE_ITEM = `mutation ($input: CreateItemInput!) { createItem(input: $input) { id } }`
const UPSERT_STOCK = `mutation ($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
  upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id }
}`

/**
 * Cellar, Attic and Dock in Mia's household, in that order, and no "Home".
 * Returns the ids by name.
 */
async function seedLocations(gql: Gql): Promise<Record<string, string>> {
  // The first request runs first sign-in, which makes "Home".
  const { locations } = await gql<{ locations: { id: string }[] }>(LOCATIONS)
  const home = locations[0]
  if (!home) throw new Error('no Home after first sign-in')
  const ids: Record<string, string> = {}
  for (const name of NAMES) {
    const { createLocation } = await gql<{ createLocation: { id: string } }>(
      CREATE_LOCATION,
      { name },
    )
    ids[name] = createLocation.id
  }
  await gql(DELETE_LOCATION, { id: home.id })
  return ids
}

/** The names of `locations`, as the server sends them to `gql`'s user. */
async function serverOrder(gql: Gql): Promise<string[]> {
  const { locations } = await gql<{ locations: { name: string }[] }>(LOCATIONS)
  return locations.map((location) => location.name)
}

/** The caller's saved sort, as the server answers it. */
async function mySort(gql: Gql): Promise<string> {
  const { myLocationSort } = await gql<{ myLocationSort: string }>(
    `query { myLocationSort }`,
  )
  return myLocationSort
}

async function openLocations(page: Page): Promise<LocationsPage> {
  const locationsPage = new LocationsPage(page)
  await locationsPage.navigateTo()
  return locationsPage
}

async function openAs(browser: Browser, userId: string): Promise<Page> {
  const context = await newUserContext(browser, userId)
  return context.newPage()
}

test.beforeEach(async ({ page, request }) => {
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  // The only cleanup of each test: it starts clean whatever ran before it (E2E speed plan, D7). Bea's
  // cleanup comes first: their member row is in Mia's household.
  await cleanupCloudData(request, BEA)
  await cleanupCloudData(request)
})

test('user can keep their own location order', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(60_000)
  const gql = makeGql(request)

  // Given Mia (the owner) and Bea (a member) share three locations, in the
  // shared order Cellar, Attic, Dock
  const ids = await seedLocations(gql)
  await addHouseholdMember(request, {
    ownerUserId: E2E_USER_ID,
    memberUserId: BEA,
    householdRole: 'member',
    locations: NAMES.map((name) => ({
      locationId: ids[name] as string,
      role: 'participant' as const,
    })),
  })

  // When Mia drags Dock to the top of their list
  const mia = await openLocations(page)
  await mia.expectOrder(SHARED_ORDER)
  await mia.dragAbove('Dock', 'Cellar')

  // Then Mia's list is Dock, Cellar, Attic, on screen and on the server
  await mia.expectOrder(['Dock', 'Cellar', 'Attic'])
  await expect
    .poll(() => serverOrder(gql), { timeout: 10_000 })
    .toEqual(['Dock', 'Cellar', 'Attic'])

  // And Bea, in their own browser, still sees the shared order
  const beaPage = await openAs(browser, BEA)
  try {
    const bea = await openLocations(beaPage)
    await bea.expectOrder(SHARED_ORDER)
    expect(await serverOrder(makeGql(request, BEA))).toEqual(SHARED_ORDER)
  } finally {
    await beaPage.context().close()
  }

  // And Mia keeps their own order after a reload
  await page.reload()
  await mia.expectOrder(['Dock', 'Cellar', 'Attic'])
})

test('user sees the location they just stocked first under last updated', async ({
  page,
  request,
}) => {
  const gql = makeGql(request)

  // Given three locations, and a stock change at Cellar, then one at Dock.
  // Dock is last by name and last in the shared order, so only its new
  // date can bring it to the top.
  const ids = await seedLocations(gql)
  const { createItem } = await gql<{ createItem: { id: string } }>(
    CREATE_ITEM,
    { input: { name: 'Milk' } },
  )
  for (const name of ['Cellar', 'Dock']) {
    await gql(UPSERT_STOCK, {
      itemId: createItem.id,
      locationId: ids[name],
      input: {
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
      },
    })
  }

  // When Mia opens the locations page and sorts by Last updated
  const mia = await openLocations(page)
  await mia.expectOrder(SHARED_ORDER)
  await mia.chooseSort('Last updated')

  // Then the newest change comes first, and Attic, never changed, comes last
  await mia.expectOrder(['Dock', 'Cellar', 'Attic'])
})

test('user sees the location they visited last first under last visited', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)
  // Given three locations. The first page load makes Cellar, the first in
  // the list, the active location, and that counts as a visit (owner
  // decision O55-A).
  await seedLocations(makeGql(request))
  const firstVisit = operationResponse(page, 'MarkLocationVisited', 15_000)
  const mia = new LocationsPage(page)
  await mia.openPantry()
  await firstVisit

  // When Mia picks Attic, then Dock, in the switcher. Each pick waits for
  // its visit to reach the server.
  for (const name of ['Attic', 'Dock']) {
    const visit = operationResponse(page, 'MarkLocationVisited', 15_000)
    await mia.pickInSwitcher(name)
    await visit
  }

  // And opens the locations page. It is a new page load, so the dates come
  // from the server and not from the cache that the visit answers wrote
  await mia.navigateTo()
  await mia.expectOrder(SHARED_ORDER)
  await mia.chooseSort('Last visited')

  // Then the last visit comes first
  await mia.expectOrder(['Dock', 'Attic', 'Cellar'])
})

test('user sees locations by name', async ({ page, request }) => {
  // Given three locations whose shared order is not by name
  await seedLocations(makeGql(request))
  const mia = await openLocations(page)
  await mia.expectOrder(SHARED_ORDER)

  // When Mia sorts by Name
  const saved = operationResponse(page, 'SetLocationSort', 15_000)
  await mia.chooseSort('Name')
  await saved

  // Then the list is by name, and so is the switcher on the pantry (owner
  // decision O53-A)
  await mia.expectOrder(BY_NAME)
  await mia.openPantry()
  expect(await mia.switcherNames(NAMES)).toEqual(BY_NAME)
})

test('user sees the same sort on another device', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(60_000)
  // Given three locations, and Mia sorts them by Name in one browser
  await seedLocations(makeGql(request))
  const first = await openLocations(page)
  await first.expectOrder(SHARED_ORDER)
  await first.chooseSort('Name')
  // The choice is saved on the server, not only in this browser. Read back
  // with `expect.poll`: the click returns before the write lands.
  await expect
    .poll(() => mySort(makeGql(request)), { timeout: 10_000 })
    .toBe('name')

  // When Mia opens the locations page in a second browser
  const otherPage = await openAs(browser, E2E_USER_ID)
  try {
    const second = await openLocations(otherPage)

    // Then it shows Name there too, and the list by name
    await expect(second.sortSelect()).toHaveText('Name')
    await second.expectOrder(BY_NAME)
  } finally {
    await otherPage.context().close()
  }
})

/**
 * The page with **Sort by** closed, then the open list of choices ALONE. The
 * whole page is not scanned with the list open: Radix's modal portal marks
 * the rest of the app `aria-hidden`, which trips `aria-hidden-focus` on the
 * app root (the same reason as the menu scans in `household-switch.spec.ts`).
 * `a11y.spec.ts` does not run in the `cloud` project, which is the only one
 * with four choices, so the scans live here.
 */
async function scanSortBy(page: Page, request: APIRequestContext) {
  await seedLocations(makeGql(request))
  const mia = await openLocations(page)
  await mia.expectOrder(SHARED_ORDER)
  await page.waitForLoadState('networkidle')
  await injectAxe(page)
  await checkA11y(page, undefined, AXE_OPTIONS)
  await mia.openSortSelect()
  await expect(mia.sortOptions().getByRole('option')).toHaveCount(4)
  await checkA11y(page, '[role="listbox"]', AXE_OPTIONS)
}

test('user can view the Sort by choices without accessibility violations', async ({
  page,
  request,
}) => {
  await scanSortBy(page, request)
})

test('user can view the Sort by choices without accessibility violations in dark mode', async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('theme-preference', 'dark')
  })
  await scanSortBy(page, request)
})
