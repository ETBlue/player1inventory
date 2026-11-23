import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { checkA11y, injectAxe } from 'axe-playwright'
import { CLOUD_WEB_URL, E2E_SECOND_USER_ID, E2E_USER_ID } from '../constants'
import { AXE_OPTIONS, checkDialogA11y } from '../helpers/axe'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import {
  createCloudUser,
  createInvite,
  joinHousehold,
} from '../helpers/cloudUsers'
import {
  connects,
  HOUSEHOLD_EVENT_KEY,
  markDocument,
  routeLiveSocket,
  stillSameDocument,
  warmUpLiveSocket,
} from '../helpers/liveSocket'
import { newUserContext } from '../helpers/userContext'
import { ActivityPage } from '../pages/ActivityPage'
import { HouseholdPage } from '../pages/HouseholdPage'
import { ItemPage } from '../pages/ItemPage'
import { LocationPeoplePage } from '../pages/LocationPeoplePage'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// The Activity page and the two danger zones of households H6a (tasks J.6
// and J.7), on real SQL, with a browser per person (task J.8).
//
// | Test | What                                                              |
// |------|-------------------------------------------------------------------|
// | 1    | the owner gives BEA a role on the people page; a SECOND tab of    |
// |      | the owner shows the new log row live, with no reload              |
// | 2    | BEA, a member, has no Activity link, and the URL says no access   |
// | 3    | the owner clears the household: the confirm is off until the name |
// |      | is typed exactly; then the catalog is empty and a new Home exists |
// | 4    | BEA, a member who organizes Home, removes all items: the pantry   |
// |      | is empty, the item log tab still shows the log                    |
// | 5    | the owner deletes the household; BEA's next request shows the     |
// |      | no-household screen                                               |
// | 6, 7 | axe (WCAG AA), light and dark: the Activity page, the household   |
// |      | page, and both danger-zone confirms                               |
//
// | Person | Household role | Home (OWNER's first sign-in)         |
// |--------|----------------|--------------------------------------|
// | OWNER  | owner          | organizer                            |
// | BEA    | member         | none, unless a test gives one        |
//
// BEA joins with `createInvite(…, [])` + `joinHousehold`, before BEA sends any
// other request, so BEA has no household of their own. Activity Rice is
// stocked at Home and has one log there. It carries a tag with a tag type.
//
// ── TRAPS ────────────────────────────────────────────────────────────────────
//
// - Cleanup order: BEA first, OWNER last. OWNER's cleanup deletes the
//   household (location-people.spec.ts, the same rule).
// - A change made through `makeGql` sends no `x-client-id`, so the server
//   sends its event to EVERY open tab. Test 1's warm-up relies on that.
// - The trigger and the confirm button of a purge have the same name. The
//   page objects click the confirm inside `getByRole('alertdialog')`.
// - An absence can be satisfied by the loading state. Each "gone" check
//   below comes after a check that the same thing was there first, or polls
//   the server.
//
// ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
//
// - That BEA's open tab hears the household delete. It does not: after the
//   commit the household has no members, so no event is delivered (plan
//   J.4, *Known gaps*). Test 5 checks BEA's NEXT request only.
// - "Delete all locations" in the browser. Its server write is covered on
//   real SQL by purge-two-households.spec.ts, and its dialog is the same
//   `DeleteButton` as "Clear household".
// - The production socket and Clerk. The E2E client sends `e2eUserId`.

const OWNER = `${E2E_SECOND_USER_ID}-activity-owner`
const BEA = `${E2E_SECOND_USER_ID}-activity-bea`
const OWNER_NAME = 'Hana Owner'
const BEA_NAME = 'Bea Member'
const RICE = 'Activity Rice'

type Gql = ReturnType<typeof makeGql>
type Row = { id: string }

const LOCATIONS = `query { locations { id name } }`
const HOUSEHOLD = `query { household { id name } }`
const ITEMS = `query { items { id } }`
const CREATE_ITEM = `mutation ($input: CreateItemInput!) { createItem(input: $input) { id } }`
const CREATE_TAG_TYPE = `mutation ($name: String!, $color: String!) {
  createTagType(name: $name, color: $color) { id }
}`
const CREATE_TAG = `mutation ($name: String!, $typeId: String!) {
  createTag(name: $name, typeId: $typeId) { id }
}`
const UPSERT_STOCK = `mutation ($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
  upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id }
}`
const ADD_LOG = `mutation ($itemId: ID!, $locationId: ID!, $occurredAt: String!) {
  addInventoryLog(
    itemId: $itemId
    locationId: $locationId
    delta: 2
    quantity: 2
    occurredAt: $occurredAt
  ) { id }
}`
const ITEM_STOCKS = `query ($locationId: ID!) { itemStocks(locationId: $locationId) { itemId } }`
const SET_LOCATION_ROLE = `mutation ($locationId: ID!, $userId: ID!, $role: LocationRole!) {
  setLocationRole(locationId: $locationId, userId: $userId, role: $role) { userId role }
}`
const ACTIVITY = `query { householdActivity { action actorName locationName } }`

type Seed = {
  owner: Gql
  home: string
  rice: string
  householdName: string
}

/**
 * The household of the table at the top. Both people are named BEFORE their
 * first request, so the pages show real names.
 */
async function seedHousehold(request: APIRequestContext): Promise<Seed> {
  await createCloudUser(request, OWNER, OWNER_NAME)
  await createCloudUser(request, BEA, BEA_NAME)
  const owner = makeGql(request, OWNER)
  // OWNER's first request: first sign-in makes the household and "Home".
  const { locations } = await owner<{ locations: Row[] }>(LOCATIONS)
  const home = locations[0]?.id
  if (!home) throw new Error('no Home after first sign-in')
  const { household } = await owner<{ household: { name: string } }>(HOUSEHOLD)

  // BEA joins as a member with no location role.
  await joinHousehold(
    request,
    BEA,
    await createInvite(request, OWNER, 'member', []),
  )

  // A tag WITH a tag type on the item. `Tag.type` is NoAction, so the purges
  // must delete tags before tag types (`deleteHouseholdData` in
  // apps/server/src/lib/household.ts). Tests 3 and 5 run that on real SQL.
  const typeId = (
    await owner<{ createTagType: Row }>(CREATE_TAG_TYPE, {
      name: 'Activity Category',
      color: 'orange',
    })
  ).createTagType.id
  const tagId = (
    await owner<{ createTag: Row }>(CREATE_TAG, {
      name: 'Activity Grain',
      typeId,
    })
  ).createTag.id
  const rice = (
    await owner<{ createItem: Row }>(CREATE_ITEM, {
      input: { name: RICE, tagIds: [tagId] },
    })
  ).createItem.id
  await owner(UPSERT_STOCK, {
    itemId: rice,
    locationId: home,
    input: { packedQuantity: 2, targetQuantity: 5, refillThreshold: 1 },
  })
  await owner(ADD_LOG, {
    itemId: rice,
    locationId: home,
    occurredAt: new Date().toISOString(),
  })
  return { owner, home, rice, householdName: household.name }
}

/** Every context a test opens. `afterEach` closes them all. */
const contexts: BrowserContext[] = []

async function openContext(
  browser: Browser,
  userId: string,
  extra: { name: string; value: string }[] = [],
): Promise<BrowserContext> {
  const context = await newUserContext(browser, userId, extra)
  contexts.push(context)
  return context
}

async function openAs(
  browser: Browser,
  userId: string,
  extra: { name: string; value: string }[] = [],
): Promise<Page> {
  return (await openContext(browser, userId, extra)).newPage()
}

/** "You are not in any household." (`noHousehold.title`, NoHouseholdScreen). */
function noHousehold(page: Page) {
  return page.getByText('You are not in any household.', { exact: true })
}

/** "Your pantry is empty" (`pantry.empty.title`). */
function emptyPantry(page: Page) {
  return page.getByText('Your pantry is empty', { exact: true })
}

/**
 * A pantry card. The link holds the name and the quantity. Found by the
 * name's heading, so it resolves in every state (live-pantry.spec.ts).
 */
function cardOf(page: Page, name: string) {
  return page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) })
}

async function cleanupAll(request: APIRequestContext) {
  // One call for every user (E2E speed plan, task S.4). A household whose
  // members are all listed is deleted too (decision D6), so the order of
  // the users no longer matters.
  // The build-time user is in the list too: if the `e2e-user-id` override
  // ever stops working, every context writes as it (shared-household.spec.ts).
  await cleanupCloudData(request, [BEA, OWNER, E2E_USER_ID])
}

test.beforeEach(async ({ request, baseURL }) => {
  test.skip(baseURL !== CLOUD_WEB_URL, 'cloud mode only')
  await cleanupAll(request)
})

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close()
})

test.describe('the activity log and the danger zones', () => {
  test('household owner sees role changes in the activity log', async ({
    browser,
    request,
  }) => {
    test.setTimeout(90_000)
    // Given the owner has the Activity page open in a second tab, and that
    // tab's live socket works
    const seed = await seedHousehold(request)
    const context = await openContext(browser, OWNER)
    const activityTab = await context.newPage()
    const socket = await routeLiveSocket(activityTab)
    const activity = new ActivityPage(activityTab)
    await activity.navigateTo()
    // BEA's join is already in the log, so the list is rendered
    await expect(
      activity.entry(`${BEA_NAME} joined the household`),
    ).toBeVisible()
    await expect.poll(() => connects(activityTab), { timeout: 15_000 }).toBe(1)
    await warmUpLiveSocket(socket, {
      key: HOUSEHOLD_EVENT_KEY,
      change: (attempt) =>
        seed.owner(CREATE_TAG_TYPE, {
          name: `Activity Warm-up ${attempt}`,
          color: 'blue',
        }),
    })
    await markDocument(activityTab)
    const roleSentence = `You gave ${BEA_NAME} the Participant role on Home`
    await expect(activity.entry(roleSentence)).toHaveCount(0)

    // When the owner gives BEA the Participant role on Home, in the first tab
    const peopleTab = await context.newPage()
    const people = new LocationPeoplePage(peopleTab)
    await people.navigateTo(seed.home)
    await people.addPerson(BEA_NAME, 'Participant')
    await expect(people.rolePicker(BEA_NAME)).toHaveText('Participant')

    // Then the second tab shows the new row, without a reload
    await expect(activity.entry(roleSentence)).toBeVisible({ timeout: 15_000 })
    await stillSameDocument(activityTab)
  })

  test('household member cannot open the activity page', async ({
    browser,
    request,
  }) => {
    // Given BEA is a household member
    await seedHousehold(request)
    const page = await openAs(browser, BEA)
    const activity = new ActivityPage(page)

    // When BEA opens the household settings
    await page.goto('/settings/household')

    // Then the sidebar lists the household pages, but not Activity
    const sidebar = page.getByRole('navigation', { name: 'Sidebar navigation' })
    await expect(
      sidebar.getByRole('link', { name: 'Tags', exact: true }),
    ).toBeVisible()
    // The Activity link is also hidden while the household role LOADS
    // (`canReadActivity` is false then), so its absence proves nothing until
    // the role is known. The import card's member line ("Only the owner or a
    // manager can import data.", `settings.import.memberNotice`,
    // ImportCard.tsx:430-435) shows only once `GetHousehold` has answered
    // `member`. Without this wait the check below passed with
    // `canReadActivity` given to every known role (J.8 review).
    await expect(
      page.getByText('Only the owner or a manager can import data.', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(activity.sidebarLink()).toHaveCount(0)

    // And the Activity URL shows the no-access text and no row
    await activity.navigateTo()
    await expect(activity.heading()).toBeVisible()
    await expect(activity.noAccess()).toBeVisible()
    await expect(activity.entries()).toHaveCount(0)
  })

  test('household owner can clear the household after typing its name', async ({
    browser,
    request,
  }) => {
    test.setTimeout(60_000)
    // Given the owner's household has a stocked item at Home
    const seed = await seedHousehold(request)
    const page = await openAs(browser, OWNER)
    await page.goto('/')
    await expect(cardOf(page, RICE)).toBeVisible()

    // When the owner opens Clear household
    const household = new HouseholdPage(page)
    await household.navigateTo()
    await household.openPurge('Clear household')

    // Then the confirm is off until the name is typed exactly
    const confirm = household.confirmButton('Clear household')
    await expect(confirm).toBeDisabled()
    await household.typeName(seed.householdName.toLowerCase())
    await expect(confirm).toBeDisabled()
    await household.typeName(`${seed.householdName} `)
    await expect(confirm).toBeDisabled()
    await household.typeName(seed.householdName)
    await expect(confirm).toBeEnabled()

    // When the owner confirms
    await household.confirmPurge('Clear household')

    // Then the catalog is empty, and one new "Home" exists
    await expect
      .poll(async () => (await seed.owner<{ items: Row[] }>(ITEMS)).items)
      .toEqual([])
    const { locations } = await seed.owner<{
      locations: { id: string; name: string }[]
    }>(LOCATIONS)
    expect(locations.map((l) => l.name)).toEqual(['Home'])
    expect(locations[0]?.id).not.toBe(seed.home)

    // And the pantry is empty
    await page.goto('/')
    await expect(emptyPantry(page)).toBeVisible()
    await expect(cardOf(page, RICE)).toHaveCount(0)
  })

  test('location organizer can remove all items from a location', async ({
    browser,
    request,
  }) => {
    test.setTimeout(60_000)
    // Given BEA, a household member, organizes Home, where Activity Rice is
    // stocked and has a log
    const seed = await seedHousehold(request)
    await seed.owner(SET_LOCATION_ROLE, {
      locationId: seed.home,
      userId: BEA,
      role: 'organizer',
    })
    const page = await openAs(browser, BEA)
    await page.goto('/')
    await expect(cardOf(page, RICE)).toBeVisible()

    // When BEA removes all items from Home, typing its name
    const people = new LocationPeoplePage(page)
    await people.navigateTo(seed.home)
    await people.openRemoveAll()
    await expect(people.removeAllConfirmButton()).toBeDisabled()
    await people.removeAllItems('Home')

    // Then Home has no stock row on the server
    await expect
      .poll(
        async () =>
          (
            await seed.owner<{ itemStocks: { itemId: string }[] }>(
              ITEM_STOCKS,
              { locationId: seed.home },
            )
          ).itemStocks,
      )
      .toEqual([])

    // And the pantry is empty
    await page.goto('/')
    await expect(emptyPantry(page)).toBeVisible()

    // But the item's log is still on its log tab
    const item = new ItemPage(page)
    await page.goto(`/items/${seed.rice}/log`)
    await expect(item.getLogEntries().first()).toBeVisible()
    await expect(item.getEmptyLogMessage()).toHaveCount(0)

    // And the activity log has the row, with the location's name
    const { householdActivity } = await seed.owner<{
      householdActivity: {
        action: string
        actorName: string
        locationName: string | null
      }[]
    }>(ACTIVITY)
    expect(householdActivity).toContainEqual({
      action: 'LOCATION_ITEMS_REMOVED',
      actorName: BEA_NAME,
      locationName: 'Home',
    })
  })

  test('household owner can delete the household', async ({
    browser,
    request,
  }) => {
    test.setTimeout(90_000)
    // Given BEA has the app open in the owner's household
    const seed = await seedHousehold(request)
    const beaPage = await openAs(browser, BEA)
    await beaPage.goto('/settings/household')
    // The household sidebar heading is the household name (`HouseholdLabel`;
    // the page's own <h1> says "General")
    await expect(
      beaPage
        .getByRole('navigation', { name: 'Sidebar navigation' })
        .getByRole('heading', {
          level: 2,
          name: seed.householdName,
          exact: true,
        }),
    ).toBeVisible()

    // When the owner deletes the household, typing its name
    const ownerPage = await openAs(browser, OWNER)
    const household = new HouseholdPage(ownerPage)
    await household.navigateTo()
    await household.openPurge('Delete household')
    await expect(household.confirmButton('Delete household')).toBeDisabled()
    await household.typeName(seed.householdName)
    await household.confirmPurge('Delete household')

    // Then the owner, who has no other household, sees the no-household
    // screen
    await expect(noHousehold(ownerPage)).toBeVisible({ timeout: 15_000 })

    // And BEA sees it on BEA's next request. BEA's open tab gets no live
    // event: after the commit the household has no members (plan J.4).
    await beaPage.reload()
    await expect(noHousehold(beaPage)).toBeVisible({ timeout: 15_000 })
  })

  /**
   * The Activity page, the household page and both danger-zone confirms,
   * scanned with the rules of `a11y.spec.ts` (`e2e/helpers/axe.ts`). That
   * file runs in `local` and `pwa` only, where these cloud pages redirect,
   * so the scans live here. An open dialog is scanned alone, with the known
   * filled-button contrast defect allowed (`checkDialogA11y`).
   */
  async function scanEverything(
    browser: Browser,
    request: APIRequestContext,
    dark: boolean,
  ) {
    const seed = await seedHousehold(request)
    // One more kind of row on the Activity page
    await seed.owner(SET_LOCATION_ROLE, {
      locationId: seed.home,
      userId: BEA,
      role: 'viewer',
    })
    const theme = dark ? [{ name: 'theme-preference', value: 'dark' }] : []
    const page = await openAs(browser, OWNER, theme)
    async function scan(selector?: string) {
      await injectAxe(page)
      if (selector) {
        await checkDialogA11y(page, selector)
        return
      }
      await checkA11y(page, undefined, {
        ...AXE_OPTIONS,
        detailedReport: true,
        detailedReportOptions: { html: true },
      })
    }

    // The Activity page, with rows
    const activity = new ActivityPage(page)
    await activity.navigateTo()
    await expect(
      activity.entry(`You gave ${BEA_NAME} the Viewer role on Home`),
    ).toBeVisible()
    await scan()

    // The household page with its danger zone, and the Clear household
    // confirm with a name typed in
    const household = new HouseholdPage(page)
    await household.navigateTo()
    await expect(household.purgeButton('Delete household')).toBeVisible()
    await scan()
    await household.openPurge('Clear household')
    await household.typeName(seed.householdName)
    await scan('[role="alertdialog"]')
    await household.cancelConfirm()

    // The Remove all items confirm of Home
    const people = new LocationPeoplePage(page)
    await people.navigateTo(seed.home)
    await expect(people.removeAllButton()).toBeVisible()
    await people.openRemoveAll()
    await scan('[role="alertdialog"]')
    await people.cancelConfirm()
  }

  test('user can use the activity page and the danger zones without accessibility violations', async ({
    browser,
    request,
  }) => {
    test.setTimeout(60_000)
    await scanEverything(browser, request, false)
  })

  test('user can use the activity page and the danger zones without accessibility violations in dark mode', async ({
    browser,
    request,
  }) => {
    test.setTimeout(60_000)
    await scanEverything(browser, request, true)
  })
})
