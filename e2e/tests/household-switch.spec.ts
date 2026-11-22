import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { checkA11y, injectAxe } from 'axe-playwright'
import { CLOUD_WEB_URL, E2E_SECOND_USER_ID } from '../constants'
import { AXE_OPTIONS, checkDialogA11y } from '../helpers/axe'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import {
  createCloudUser,
  createInvite,
  joinHousehold,
  readCloudUser,
} from '../helpers/cloudUsers'
import type { Fixture } from '../helpers/fixture'
import { markDocument, operationResponse } from '../helpers/liveSocket'
import { seedLocalFixture } from '../helpers/localSeed'
import { readRows } from '../helpers/locationSeed'
import { newUserContext } from '../helpers/userContext'
import { HouseholdSwitcher } from '../pages/HouseholdSwitcher'
import { SettingsPage } from '../pages/SettingsPage'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// The household switch of households H7a, on real SQL, with a browser
// (task L.6 of docs/global/permissions/2026-11-21-households-plan-h7.md).
//
// | Test | What                                                              |
// |------|-------------------------------------------------------------------|
// | 1    | PAT switches from A to B in Switch to…; the saved cache copy and  |
// |      | the stored active location of A are gone after the reload; the    |
// |      | cart page shows B's row, not A's; A's cart row is still in A       |
// | 2    | PAT, in A only, uses Create new; lands in the new household;      |
// |      | A is still there, PAT still its owner                             |
// | 3    | owner decision O21: a tab that shows A, after PAT moved to B on   |
// |      | "another device", cannot write a tag type; nothing in A or B; the |
// |      | tab reloads into B and shows the one-time message                 |
// | 4    | owner decision O22-A: PAT copies offline data into B, where PAT   |
// |      | is a manager, from a page that showed A; the items land in B only |
// | 5, 6 | axe (WCAG AA), light and dark: the open Switch to… menu and the   |
// |      | Create new dialog                                                 |
//
// | Person | Household role                 | Notes                            |
// |--------|--------------------------------|----------------------------------|
// | PAT    | owner of A, member or manager  | the browser in every test        |
// |        | of B                           |                                  |
// | QUIN   | owner of B                     | invites PAT                      |
//
// Every test that is about one household out of two has PAT in BOTH, and
// checks that the OTHER household is unchanged.
//
// ── ORDER OF THE SEED ────────────────────────────────────────────────────────
//
// PAT's first request makes A. PAT then writes a row in A, so A is not
// empty: `joinHousehold` DELETES the joiner's own household when it is empty
// (decision T21). The join makes B the household PAT acts in, so the seed
// ends with `setActiveHousehold(A)` through `makeGql`. `makeGql` sends no
// `x-household-id`, so no seed is ever refused (decision T66).
//
// ── TEST 1: THE SAVED CACHE COPY IS SEEDED BY THE TEST ───────────────────────
//
// In production `ApolloWrapper` saves the cache to `Player1InventoryCloudCache`
// every 5 s. The E2E build does not mount `ApolloWrapper`, and its client uses
// a fresh `createCache()`, not `cloudCache` (apps/web/src/main.tsx,
// apps/web/src/apollo/client.ts). So in E2E nothing ever writes that
// database, and a readback after the switch would find nothing with or
// without `clearCache()`. The plan's mutation (a) could not go red.
//
// So the test writes the saved copy itself, the state a production device is
// in: a snapshot row for PAT that holds "Old Milk", plus the
// `cloud-cache-user-id` key. With that key `restoreCache` keeps the row at
// every page load, so only `clearCache()` inside `switchToHousehold` can
// remove it. The visible check on the cart page is a NEGATIVE CONTROL: the
// page reloads, and the cart page filters by the active location, so it
// stays green without `clearCache()`.
//
// The stored active location is read by an init script at the START of each
// page load (`__bootActiveLocation`), before the app runs.
// `ActiveLocationProvider` replaces a stored id that names no location of
// the new household, so a read after the page has loaded would see the new
// id with or without the removal in `switchToHousehold`.
//
// ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
//
// - The in-memory cache. The switch reloads the page, so in-memory rows go
//   with or without `clearCache()`. In E2E `clearCache()` resets
//   `cloudCache`, which the E2E client does not use.
// - A switch on the mobile accordion (`variant="card"`). The cloud project
//   runs a desktop screen. Unit tests cover that variant.
// - The live path of a stale tab. In test 3 the other device's
//   `setActiveHousehold` publishes nothing (decision T68), and the tab learns
//   of it on its next request, the write itself.
// - Location-scoped writes from a stale tab (cart, stock, log). They do not
//   call `requireHousehold`, so they never answer `HOUSEHOLD_CHANGED` (plan,
//   *Known gaps*, review F6).
// - That a copy cannot START before the move. Test 4 copies with `skip`,
//   which stops at "Import into which location?" before it writes anything,
//   and the reload throws that away. Measured 2026-11-21: with
//   `runStoredCopy` called at the top of `copyElsewhere` (before the move),
//   test 4 stays GREEN. The unit test in `usePostLoginMigration.test.ts`
//   pins it. Only a `clear` copy into another household writes at once; no
//   test here runs one, because `clear` needs the OWNER of the target.
// - A refused Create new. `ALREADY_IN_HOUSEHOLD` is `BAD_USER_INPUT`, so the
//   dialog shows the NAME rule for it ("Enter a name of 1 to 100
//   characters."). Seen only with the server's `alsoWhenMember` broken on
//   purpose (mutation of test 2); no current server answers it here.
//
// ── TIME BUDGETS ─────────────────────────────────────────────────────────────
//
// Measured 2026-11-21, the whole file alone, load average 2.2, hooks
// included: test 1 25.2 s, 2 16.7 s, 3 21.2 s, 4 27.5 s, 5 16.3 s, 6 18.7 s.
// A second run: test 1 31.0 s, test 4 29.7 s.
// Tests 1 and 4 are close to the 30 s default, so they carry 90 s; the
// others carry 60 s, as household-ownership.spec.ts does.

const PAT = `${E2E_SECOND_USER_ID}-switch-pat`
const QUIN = `${E2E_SECOND_USER_ID}-switch-quin`
const PAT_NAME = 'Pat Switcher'
const QUIN_NAME = 'Quin Other'

/** Every spec user, in cleanup order. PAT first: PAT is a member of B. */
const ALL_USERS = [PAT, QUIN]

type Gql = ReturnType<typeof makeGql>
type Row = { id: string }
type Household = { id: string; name: string; role: string }
type Choice = Household & { isActive: boolean }

const LOCATIONS = `query { locations { id name } }`
const HOUSEHOLD = `query { household { id name role } }`
const MY_HOUSEHOLDS = `query { myHouseholds { id name role isActive } }`
const SET_ACTIVE = `mutation ($householdId: ID!) {
  setActiveHousehold(householdId: $householdId) { id }
}`
const ITEMS = `query { items { id name } }`
const TAG_TYPES = `query { tagTypes { id name } }`
const CREATE_TAG_TYPE = `mutation ($name: String!, $color: String!) {
  createTagType(name: $name, color: $color) { id }
}`
const CREATE_ITEM = `mutation ($input: CreateItemInput!) { createItem(input: $input) { id } }`
const UPSERT_STOCK = `mutation ($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
  upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id }
}`
const VENDOR_CART = `query ($vendorId: ID, $locationId: ID!) {
  vendorCart(vendorId: $vendorId, locationId: $locationId) { id }
}`
const ADD_TO_CART = `mutation ($cartId: ID!, $itemId: ID!, $quantity: Int!) {
  addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id }
}`
const CART_ITEMS = `query ($cartId: ID!) { cartItems(cartId: $cartId) { itemId } }`

/** The localStorage key of the cloud active location (`activeLocationStorageKey('cloud')`). */
const ACTIVE_LOCATION_KEY = 'active-location-id:cloud'

/** First sign-in: the household and its first location, "Home". */
async function firstSignIn(gql: Gql) {
  const home = (await gql<{ locations: Row[] }>(LOCATIONS)).locations[0]?.id
  if (!home) throw new Error('no Home after first sign-in')
  const { household } = await gql<{ household: Household }>(HOUSEHOLD)
  return { home, household }
}

/** An item stocked at `locationId`, put in that location's no-vendor cart. */
async function itemInCart(gql: Gql, locationId: string, name: string) {
  const { createItem } = await gql<{ createItem: Row }>(CREATE_ITEM, {
    input: { name },
  })
  await gql(UPSERT_STOCK, {
    itemId: createItem.id,
    locationId,
    input: { packedQuantity: 0, targetQuantity: 2, refillThreshold: 1 },
  })
  const { vendorCart } = await gql<{ vendorCart: Row }>(VENDOR_CART, {
    vendorId: null,
    locationId,
  })
  await gql(ADD_TO_CART, {
    cartId: vendorCart.id,
    itemId: createItem.id,
    quantity: 1,
  })
  return { itemId: createItem.id, cartId: vendorCart.id }
}

type Seed = {
  pat: Gql
  quin: Gql
  a: Household
  b: Household
  homeA: string
  homeB: string
}

/**
 * PAT owns A, QUIN owns B, PAT joins B with `role`, and PAT acts in A again.
 * `beforeJoin` writes PAT's row in A (see *Order of the seed*); `seedB`
 * writes QUIN's rows in B.
 */
async function seedTwoHouseholds(
  request: APIRequestContext,
  options: {
    role: 'member' | 'manager'
    beforeJoin: (pat: Gql, homeA: string) => Promise<unknown>
    seedB?: (quin: Gql, homeB: string) => Promise<unknown>
  },
): Promise<Seed> {
  await createCloudUser(request, PAT, PAT_NAME)
  await createCloudUser(request, QUIN, QUIN_NAME)
  const pat = makeGql(request, PAT)
  const quin = makeGql(request, QUIN)
  const { home: homeA, household: a } = await firstSignIn(pat)
  await options.beforeJoin(pat, homeA)
  const { home: homeB, household: b } = await firstSignIn(quin)
  await options.seedB?.(quin, homeB)
  await joinHousehold(
    request,
    PAT,
    await createInvite(request, QUIN, options.role, [
      { locationId: homeB, role: 'participant' },
    ]),
  )
  // The join made B the household PAT acts in. Move PAT back to A, as
  // "another device" would.
  await pat(SET_ACTIVE, { householdId: a.id })
  expect((await readCloudUser(request, PAT))?.activeHouseholdId).toBe(a.id)
  return { pat, quin, a, b, homeA, homeB }
}

async function myHouseholds(gql: Gql): Promise<Choice[]> {
  return (await gql<{ myHouseholds: Choice[] }>(MY_HOUSEHOLDS)).myHouseholds
}

async function names(gql: Gql, query: string, key: string): Promise<string[]> {
  const data = await gql<Record<string, { name: string }[]>>(query)
  return (data[key] ?? []).map((row) => row.name).sort()
}

async function cleanupAll(request: APIRequestContext) {
  for (const userId of ALL_USERS) await cleanupCloudData(request, userId)
  // And the build-time user: if the `e2e-user-id` override ever stops
  // working, every context writes as it (shared-household.spec.ts).
  await cleanupCloudData(request)
}

/** Every context a test opens. `afterEach` closes them all. */
const contexts: BrowserContext[] = []

async function openAs(
  browser: Browser,
  userId: string,
  extra: { name: string; value: string }[] = [],
): Promise<Page> {
  const context = await newUserContext(browser, userId, extra)
  contexts.push(context)
  const page = await context.newPage()
  // See *Test 1* at the top: the stored active location as each page load
  // starts, before the app can change it.
  await page.addInitScript((key) => {
    ;(window as { __bootActiveLocation?: string | null }).__bootActiveLocation =
      localStorage.getItem(key)
  }, ACTIVE_LOCATION_KEY)
  return page
}

/** The marker `markDocument` set is gone: the page loaded again. */
async function documentWasReplaced(page: Page) {
  await expect
    .poll(() =>
      page
        .evaluate(() => (window as { __liveMarker?: number }).__liveMarker)
        .catch(() => 1),
    )
    .toBeUndefined()
}

/**
 * Write the saved cache copy a production device has (see *Test 1* at the
 * top): one snapshot row in `Player1InventoryCloudCache` for `userId`, and
 * `cloud-cache-user-id`. The database must exist: `restoreCache` opens it at
 * every cloud page load, so call this after a page has loaded. Resolves on
 * `tx.oncomplete`, not on the request's success (root `CLAUDE.md`).
 */
async function seedSavedCacheCopy(page: Page, userId: string, text: string) {
  await page.evaluate(
    async ({ userId, text }) => {
      localStorage.setItem('cloud-cache-user-id', userId)
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('Player1InventoryCloudCache')
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => reject(open.error)
      })
      const data = JSON.stringify({
        'Item:saved-copy': {
          __typename: 'Item',
          id: 'saved-copy',
          name: text,
        },
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readwrite')
        tx.objectStore('snapshots').put({
          id: 'apollo-cache',
          userId,
          data,
          savedAt: Date.now(),
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
      db.close()
    },
    { userId, text },
  )
}

/** Every saved snapshot's `data`, joined. `''` when there is none. */
async function readSavedCacheCopy(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('Player1InventoryCloudCache')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    try {
      if (!db.objectStoreNames.contains('snapshots')) return ''
      const rows = await new Promise<{ data: string }[]>((resolve, reject) => {
        const request = db
          .transaction('snapshots', 'readonly')
          .objectStore('snapshots')
          .getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      return rows.map((row) => row.data).join('\n')
    } finally {
      db.close()
    }
  })
}

/** The page shows dark mode, or light mode. */
async function expectTheme(page: Page, dark: boolean) {
  const html = page.locator('html')
  if (dark) await expect(html).toHaveClass(/(^|\s)dark(\s|$)/)
  else await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/)
}

/** The household heading of `/settings/household` (`HouseholdLabel`). */
function householdHeading(page: Page, name: string) {
  return page.getByRole('main').getByRole('heading', { name, exact: true })
}

test.beforeEach(async ({ request, baseURL }) => {
  test.skip(baseURL !== CLOUD_WEB_URL, 'cloud mode only')
  await cleanupAll(request)
})

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close()
})

test.describe('household switch', () => {
  test('user can switch household and sees no cart row of the old one', async ({
    browser,
    request,
  }) => {
    test.setTimeout(90_000)
    // Given PAT owns A, with "Old Milk" in Home's cart, and is a member of B
    // (a participant on B's Home), where "New Bread" is in the cart
    let oldMilk = { itemId: '', cartId: '' }
    const seed = await seedTwoHouseholds(request, {
      role: 'member',
      beforeJoin: async (pat, homeA) => {
        oldMilk = await itemInCart(pat, homeA, 'Old Milk')
      },
      seedB: (quin, homeB) => itemInCart(quin, homeB, 'New Bread'),
    })

    // And PAT's cart page shows A's row
    const page = await openAs(browser, PAT)
    await page.goto('/shopping/no-vendor')
    await expect(page.getByLabel('Remove Old Milk')).toBeVisible()
    // And the device holds A's active location and a saved cache copy that
    // names A's row
    await expect
      .poll(() =>
        page.evaluate((key) => localStorage.getItem(key), ACTIVE_LOCATION_KEY),
      )
      .toBe(seed.homeA)
    await seedSavedCacheCopy(page, PAT, 'Old Milk')

    // When PAT chooses B in Switch to…
    const switcher = new HouseholdSwitcher(page)
    await switcher.navigateTo()
    await expect(householdHeading(page, seed.a.name)).toBeVisible()
    // The copy survived that page load (`restoreCache` keeps it for PAT)
    expect(await readSavedCacheCopy(page)).toContain('Old Milk')
    await switcher.open()
    await expect(switcher.row(seed.a.name)).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(switcher.row(seed.b.name)).toHaveAttribute(
      'aria-checked',
      'false',
    )
    await markDocument(page)
    await switcher.row(seed.b.name).click()

    // Then the page loads `/` again, in B
    await page.waitForURL((url) => url.pathname === '/')
    await documentWasReplaced(page)
    await expect
      .poll(async () => (await myHouseholds(seed.pat)).find((h) => h.isActive))
      .toMatchObject({ id: seed.b.id, role: 'member' })
    expect((await readCloudUser(request, PAT))?.activeHouseholdId).toBe(
      seed.b.id,
    )
    // And the new page started with no stored active location: A's Home is
    // not carried into B (mutation b)
    expect(
      await page.evaluate(
        () =>
          (window as { __bootActiveLocation?: string | null })
            .__bootActiveLocation,
      ),
    ).toBeNull()
    // And the saved copy of A's cache is gone (mutation a)
    expect(await readSavedCacheCopy(page)).not.toContain('Old Milk')

    // And the cart page shows B's row and not A's (a NEGATIVE CONTROL: the
    // page reloaded, and the cart page filters by the active location)
    await page.goto('/shopping/no-vendor')
    await expect(page.getByLabel('Remove New Bread')).toBeVisible()
    await expect(page.getByLabel('Remove Old Milk')).toHaveCount(0)
    await expect
      .poll(() =>
        page.evaluate((key) => localStorage.getItem(key), ACTIVE_LOCATION_KEY),
      )
      .toBe(seed.homeB)

    // And A is unchanged: its cart row is still there, and PAT still owns A
    const { cartItems } = await seed.pat<{ cartItems: { itemId: string }[] }>(
      CART_ITEMS,
      { cartId: oldMilk.cartId },
    )
    expect(cartItems).toEqual([{ itemId: oldMilk.itemId }])
    expect(
      (await myHouseholds(seed.pat)).find((h) => h.id === seed.a.id),
    ).toMatchObject({ role: 'owner', isActive: false })
  })

  test('user can create a new household from Switch to and lands in it', async ({
    browser,
    request,
  }) => {
    test.setTimeout(60_000)
    // Given PAT owns A, which holds one item, and is in no other household
    await createCloudUser(request, PAT, PAT_NAME)
    const pat = makeGql(request, PAT)
    const { household: a } = await firstSignIn(pat)
    await pat(CREATE_ITEM, { input: { name: 'A Rice' } })
    expect(await myHouseholds(pat)).toEqual([
      { id: a.id, name: a.name, role: 'owner', isActive: true },
    ])

    // When PAT uses Switch to… › Create new
    const page = await openAs(browser, PAT)
    const switcher = new HouseholdSwitcher(page)
    await switcher.navigateTo()
    await expect(householdHeading(page, a.name)).toBeVisible()
    await switcher.open()
    // One household is still a list: A, then Create new
    await expect(switcher.row(a.name)).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
    await markDocument(page)
    await switcher.createNew('Pat Second Home')

    // Then the server made the household, and PAT acts in it. Read first,
    // before the URL: a refused create leaves the dialog open, and this
    // check then fails on the value, not on a navigation timeout
    let created: Choice | undefined
    await expect
      .poll(
        async () => {
          created = (await myHouseholds(pat)).find((h) => h.isActive)
          return created
        },
        { timeout: 15_000 },
      )
      .toMatchObject({ name: 'Pat Second Home', role: 'owner' })
    // And the page loads `/` again, in the new household
    await page.waitForURL((url) => url.pathname === '/')
    await documentWasReplaced(page)
    if (!created) throw new Error('no active household')
    expect(created.id).not.toBe(a.id)
    // And the new household has its first location, "Home", and no items
    expect(await names(pat, LOCATIONS, 'locations')).toEqual(['Home'])
    expect(await names(pat, ITEMS, 'items')).toEqual([])
    // And the page shows it
    await switcher.navigateTo()
    await expect(householdHeading(page, 'Pat Second Home')).toBeVisible()

    // And A is unchanged: PAT still owns it, and its item is still there
    expect(await myHouseholds(pat)).toEqual([
      { id: a.id, name: a.name, role: 'owner', isActive: false },
      { ...created, isActive: true },
    ])
    await pat(SET_ACTIVE, { householdId: a.id })
    expect(await names(pat, ITEMS, 'items')).toEqual(['A Rice'])
  })

  test('a stale tab cannot write into the other household', async ({
    browser,
    request,
  }) => {
    test.setTimeout(60_000)
    // Given PAT owns A and is a manager of B; each has one tag type
    const seed = await seedTwoHouseholds(request, {
      role: 'manager',
      beforeJoin: (pat) =>
        pat(CREATE_TAG_TYPE, { name: 'A Kind', color: 'blue' }),
      seedB: (quin) =>
        quin(CREATE_TAG_TYPE, { name: 'B Kind', color: 'green' }),
    })
    // And PAT's tab shows A's tags page
    const page = await openAs(browser, PAT)
    await page.goto('/settings/household/tags')
    await expect(
      page.getByRole('heading', { name: 'A Kind', level: 2 }),
    ).toBeVisible()
    await markDocument(page)

    // When PAT moves to B on another device. It publishes nothing (T68), so
    // this tab does not hear of it
    await seed.pat(SET_ACTIVE, { householdId: seed.b.id })

    // And this tab, still showing A, creates a tag type
    await page.getByRole('button', { name: /new tag type/i }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('Stale Kind')
    const answer = operationResponse(page, 'CreateTagType', 15_000)
    await dialog.getByRole('button', { name: /save/i }).click()

    // Then the server refused the write. Read back once it has answered:
    // a read before the answer would find no tag type with or without the
    // refusal. B first: PAT acts in B, and B is where it would land
    const body = JSON.stringify(await (await answer).json())
    expect(await names(seed.pat, TAG_TYPES, 'tagTypes')).toEqual(['B Kind'])
    expect(await names(seed.quin, TAG_TYPES, 'tagTypes')).toEqual(['B Kind'])
    expect(body).toContain('"code":"HOUSEHOLD_CHANGED"')

    // And the tab reloads into B and says why, once
    const switcher = new HouseholdSwitcher(page)
    await expect(switcher.changedNotice(seed.b.name, seed.a.name)).toBeVisible({
      timeout: 20_000,
    })
    await documentWasReplaced(page)
    await expect(
      page.getByRole('heading', { name: 'B Kind', level: 2 }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'A Kind', level: 2 }),
    ).toHaveCount(0)

    // And still in neither household after the reload: the refused write
    // was not sent again (decision T72). Then A, the other household
    expect(await names(seed.quin, TAG_TYPES, 'tagTypes')).toEqual(['B Kind'])
    await seed.pat(SET_ACTIVE, { householdId: seed.a.id })
    expect(await names(seed.pat, TAG_TYPES, 'tagTypes')).toEqual(['A Kind'])
  })

  test('user can copy offline data into another household they manage', async ({
    browser,
    request,
  }) => {
    test.setTimeout(90_000)
    // Given PAT owns A (where PAT acts) with one item, and manages B
    const seed = await seedTwoHouseholds(request, {
      role: 'manager',
      beforeJoin: (pat) => pat(CREATE_ITEM, { input: { name: 'A Rice' } }),
    })
    expect(await names(seed.quin, ITEMS, 'items')).toEqual([])

    // And offline data on this device (see e2e/CLAUDE.md, *Driving a local
    // → cloud migration*: seed only after a local-mode boot)
    const page = await openAs(browser, PAT)
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('data-mode', 'local'))
    await page.reload()
    await page.waitForLoadState('load')
    await seedLocalFixture(page, LOCAL_PANTRY)
    expect(
      ((await readRows(page, 'items')) as unknown as { name: string }[]).map(
        (row) => row.name,
      ),
    ).toEqual([LOCAL_ITEM_NAME])

    // When PAT switches to cloud and asks for a copy that skips conflicts
    await new SettingsPage(page).openUserSidebar()
    const alert = page.getByRole('alertdialog')
    await page.getByRole('button', { name: 'Switch...' }).click()
    await alert.getByRole('button', { name: /switch to cloud/i }).click()
    await alert.getByRole('button', { name: 'Yes, copy data' }).click()
    await alert.getByRole('button', { name: 'Skip conflicts' }).click()

    // Then the copy asks first, naming A, the household the page shows
    await expect(
      page.getByRole('heading', {
        name: `Copy your offline data into ${seed.a.name}?`,
      }),
    ).toBeVisible({ timeout: 20_000 })
    const choice = page.getByRole('radiogroup', { name: 'Copy into' })
    await expect(
      choice.getByRole('radio', { name: `${seed.a.name} (Owner)` }),
    ).toBeChecked()

    // When PAT picks B and moves there
    await choice
      .getByRole('radio', { name: `${seed.b.name} (Manager)` })
      .click()
    await expect(
      page.getByRole('heading', {
        name: `Copy your offline data into ${seed.b.name}?`,
      }),
    ).toBeVisible()
    // Nothing is copied before the move
    expect(await names(seed.quin, ITEMS, 'items')).toEqual([])
    await markDocument(page)
    await alert.getByRole('button', { name: 'Move there and copy' }).click()

    // Then the copy asks only where it goes (a `skip` copy, decision O3).
    // Both households call their first location "Home"
    const settings = new SettingsPage(page)
    await expect(settings.getImportLocationDialog()).toBeVisible({
      timeout: 20_000,
    })
    await settings.chooseImportLocation('Home')

    // And the copy runs to its end
    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            strategy: localStorage.getItem('migration-strategy'),
            prompted: localStorage.getItem('migration-prompted'),
            copyInto: sessionStorage.getItem('copy-into-household'),
          })),
        { timeout: 60_000, intervals: [500] },
      )
      .toEqual({ strategy: null, prompted: '1', copyInto: null })
    await expect(page.getByText('Copy failed')).toHaveCount(0)

    // And the item is in B. Read first, so a copy into the wrong household
    // fails here on the value
    await expect
      .poll(() => names(seed.quin, ITEMS, 'items'), { timeout: 15_000 })
      .toEqual([LOCAL_ITEM_NAME])
    // And it got there the way the design says: the page moved to B first
    // (a new document, PAT active in B), then copied
    await documentWasReplaced(page)
    expect((await readCloudUser(request, PAT))?.activeHouseholdId).toBe(
      seed.b.id,
    )
    // And A is unchanged: only its own item
    await seed.pat(SET_ACTIVE, { householdId: seed.a.id })
    expect(await names(seed.pat, ITEMS, 'items')).toEqual(['A Rice'])
  })

  /**
   * The open Switch to… menu and the Create new dialog, scanned with the
   * rules of `a11y.spec.ts` (`e2e/helpers/axe.ts`). That file runs in
   * `local` and `pwa` only, where the switcher renders nothing, so the scans
   * live here. PAT is in two households, so the menu lists two rows.
   */
  async function scanSwitcher(
    browser: Browser,
    request: APIRequestContext,
    dark: boolean,
  ) {
    const seed = await seedTwoHouseholds(request, {
      role: 'member',
      beforeJoin: (pat) => pat(CREATE_ITEM, { input: { name: 'A Rice' } }),
    })
    const theme = dark ? [{ name: 'theme-preference', value: 'dark' }] : []
    const page = await openAs(browser, PAT, theme)
    const switcher = new HouseholdSwitcher(page)
    await switcher.navigateTo()
    await expect(householdHeading(page, seed.a.name)).toBeVisible()
    await expectTheme(page, dark)

    // The page with the menu closed (the trigger), then the open menu ALONE,
    // with both households. The whole page is not scanned with the menu
    // open: Radix's modal portal marks the rest of the app `aria-hidden`,
    // which trips `aria-hidden-focus` on the app root `.h-dvh` for every
    // dropdown in the app (location-switcher.spec.ts; measured here too on
    // 2026-11-21, 1 node, in light and dark).
    await injectAxe(page)
    await checkA11y(page, undefined, {
      ...AXE_OPTIONS,
      detailedReport: true,
      detailedReportOptions: { html: true },
    })
    await switcher.open()
    await expect(switcher.row(seed.b.name)).toBeVisible()
    await checkA11y(page, '[role="menu"]', AXE_OPTIONS)
    await page.keyboard.press('Escape')
    await expect(switcher.menu()).toHaveCount(0)

    // The Create new dialog. Cancel, so nothing is created
    await switcher.openCreateDialog()
    await checkDialogA11y(page, '[role="dialog"]')
    await switcher
      .createDialog()
      .getByRole('button', { name: 'Cancel', exact: true })
      .click()
    await expect(switcher.createDialog()).toHaveCount(0)
    expect(await myHouseholds(seed.pat)).toHaveLength(2)
  }

  test('user can use Switch to and Create new without accessibility violations', async ({
    browser,
    request,
  }) => {
    test.setTimeout(60_000)
    await scanSwitcher(browser, request, false)
  })

  test('user can use Switch to and Create new without accessibility violations in dark mode', async ({
    browser,
    request,
  }) => {
    test.setTimeout(60_000)
    await scanSwitcher(browser, request, true)
  })
})

/** The one offline item of test 4. */
const LOCAL_ITEM_ID = 'aaaaaaaa-0000-0000-0000-000000000701'
const LOCAL_ITEM_NAME = 'Offline Beans'

/** Test 4's offline pantry: one location, one item stocked there. */
const LOCAL_PANTRY: Fixture = {
  locations: [{ key: 'home', name: 'My Home', isDefault: true }],
  vendors: [],
  items: [{ id: LOCAL_ITEM_ID, name: LOCAL_ITEM_NAME }],
  stocks: [
    {
      itemId: LOCAL_ITEM_ID,
      location: 'home',
      packedQuantity: 3,
      targetQuantity: 4,
      refillThreshold: 1,
    },
  ],
  shelves: [],
  recipes: [],
}
