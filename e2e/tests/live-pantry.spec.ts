import { expect, type Page, test } from '@playwright/test'
import { CLOUD_WEB_URL, E2E_SECOND_USER_ID, E2E_USER_ID } from '../constants'
import { ensureCloudHomeLocation } from '../helpers/cloudSeed'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { addHouseholdMember } from '../helpers/cloudUsers'
import {
  connects,
  HOUSEHOLD_EVENT_KEY,
  type LiveSocket,
  markDocument,
  routeLiveSocket,
  stillSameDocument,
  warmUpLiveSocket,
} from '../helpers/liveSocket'
import { PantryPage } from '../pages/PantryPage'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// Live updates of stock, the catalog, locations and checkout (households
// H3c-2, task D.5), against real Postgres and a real WebSocket. The browser
// is `E2E_USER_ID`, on the pantry. Changes come through `makeGql`, which
// sends no `x-client-id`, so the browser's tab is never their source.
//
// | Test | Change (who)                         | Kind(s)                 | What the pantry must show |
// |------|--------------------------------------|-------------------------|---------------------------|
// | 1    | `upsertItemStock` (MEMBER)           | STOCK                   | the new quantity          |
// | 2    | `updateItem` rename (MEMBER)         | CATALOG                 | the new name              |
// | 3    | `createLocation` (the browser's OWN  | LOCATION                | the new location in the   |
// |      | user, from another device)           |                         | switcher                  |
// | 4    | `checkout` (MEMBER)                  | CART, STOCK, LOG        | the bought quantity added |
// | 5    | `deleteItem` (MEMBER)                | CATALOG; STOCK, LOG,    | the item gone             |
// |      |                                      | CART at Home            |                           |
//
// | Person  | Household             | Home role   |
// |---------|-----------------------|-------------|
// | browser | owner of household A  | organizer   |
// | MEMBER  | MANAGER of household A| participant |
//
// MEMBER is a `manager`, not a `member`: renaming and deleting an item are
// catalog writes, and they need `manager` (`requireCatalogRole`).
//
// Test 3 is made by the browser's own user, not by MEMBER. The `locations`
// query lists only locations the caller holds a role on (`visibleLocations`
// in apps/server/src/resolvers/location.resolver.ts), and `createLocation`
// gives a role to its creator only. So a location MEMBER creates never shows
// in the browser's switcher, event or no event. Until H5 a new location shows
// live only on the creator's other tabs and devices, and that is what test 3
// checks.
//
// Test 5 is also the first real-SQL run of `deleteItem`'s
// `inventoryLog.findMany({ distinct: ['locationId'] })` read. It checks the
// kinds the socket received, not only the screen.
//
// ── THE WARM-UP ──────────────────────────────────────────────────────────────
//
// See e2e/helpers/liveSocket.ts. Here the warm-up writes an inventory log
// (`addInventoryLog`, kind `LOG`) as MEMBER. On the pantry a `LOG` event
// refetches no query that shows a quantity, a name or a location, so the
// warm-up's own refetch cannot show a later test step, and no test's change
// is the warm-up's change.
//
// ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
//
// - A location created by ANOTHER member reaching this tab (see above; H5).
// - The cart page's view of a checkout or a delete. live-cart.spec.ts covers
//   the cart page, for `addToCart`.
// - The production socket (Clerk token). The E2E client sends `e2eUserId`.

const MEMBER = `${E2E_SECOND_USER_ID}-live-pantry-member`

type Gql = ReturnType<typeof makeGql>
type Row = { id: string }

const CREATE_ITEM = `mutation ($input: CreateItemInput!) { createItem(input: $input) { id } }`
const UPDATE_ITEM = `mutation ($id: ID!, $input: UpdateItemInput!) {
  updateItem(id: $id, input: $input) { id }
}`
const DELETE_ITEM = `mutation ($id: ID!) { deleteItem(id: $id) }`
const UPSERT_STOCK = `mutation ($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
  upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id }
}`
const ADD_LOG = `mutation ($itemId: ID!, $locationId: ID!, $occurredAt: String!) {
  addInventoryLog(
    itemId: $itemId
    locationId: $locationId
    delta: 0
    quantity: 0
    occurredAt: $occurredAt
  ) { id }
}`
const CREATE_VENDOR = `mutation ($name: String!, $locationId: ID!) {
  createVendor(name: $name, locationId: $locationId) { id }
}`
const VENDOR_CART = `query ($vendorId: ID, $locationId: ID!) {
  vendorCart(vendorId: $vendorId, locationId: $locationId) { id }
}`
const ADD_TO_CART = `mutation ($cartId: ID!, $itemId: ID!, $quantity: Int!) {
  addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id }
}`
const CHECKOUT = `mutation ($cartId: ID!, $items: [CheckoutItemInput!]!) {
  checkout(cartId: $cartId, items: $items) { id }
}`
const CREATE_LOCATION = `mutation ($name: String!) { createLocation(name: $name) { id } }`

/** Create an item and stock it at `locationId` with `packed` of 5. */
async function createStockedItem(
  gql: Gql,
  locationId: string,
  name: string,
  packed: number,
): Promise<string> {
  const { createItem } = await gql<{ createItem: Row }>(CREATE_ITEM, {
    input: { name },
  })
  await gql(UPSERT_STOCK, {
    itemId: createItem.id,
    locationId,
    input: { packedQuantity: packed, targetQuantity: 5, refillThreshold: 1 },
  })
  return createItem.id
}

type Seed = {
  owner: Gql
  member: Gql
  home: string
  /** The warm-up writes logs for this item. */
  salt: string
}

/**
 * Home and Salt (for the warm-up), plus `extra` items in Home. Then MEMBER
 * joins as a manager and a Home participant, BEFORE MEMBER sends any request
 * (`addHouseholdMember` answers 409 otherwise).
 */
async function seedHousehold(
  request: Parameters<typeof makeGql>[0],
  extra: { name: string; packed: number }[],
): Promise<Seed & { ids: Record<string, string> }> {
  const owner = makeGql(request)
  const home = (await ensureCloudHomeLocation(request)).id
  const salt = await createStockedItem(owner, home, 'Live Salt', 1)
  const ids: Record<string, string> = {}
  for (const item of extra) {
    ids[item.name] = await createStockedItem(
      owner,
      home,
      item.name,
      item.packed,
    )
  }
  await addHouseholdMember(request, {
    ownerUserId: E2E_USER_ID,
    memberUserId: MEMBER,
    householdRole: 'manager',
    locations: [{ locationId: home, role: 'participant' }],
  })
  return { owner, member: makeGql(request, MEMBER), home, salt, ids }
}

/**
 * The card's link holds the name and the quantity ("2 / 5 …",
 * src/components/item/ItemCard/ItemCard.tsx). Found by the name, so it
 * resolves in both states and a check on it fails on the VALUE.
 */
function cardOf(page: Page, name: string) {
  return page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) })
}

/**
 * Open the pantry with the socket routed, wait until `present` shows (the
 * page has loaded its rows), the socket is acknowledged and the subscription
 * is live.
 */
async function openPantry(
  page: Page,
  seed: Seed,
  present: string,
): Promise<LiveSocket> {
  const socket = await routeLiveSocket(page)
  await new PantryPage(page).navigateTo()
  await expect(cardOf(page, present)).toBeVisible()
  await expect.poll(() => connects(page), { timeout: 15_000 }).toBe(1)
  await warmUpLiveSocket(socket, {
    key: seed.home,
    change: () =>
      seed.member(ADD_LOG, {
        itemId: seed.salt,
        locationId: seed.home,
        occurredAt: new Date().toISOString(),
      }),
  })
  await markDocument(page)
  return socket
}

async function cleanupAll(request: Parameters<typeof makeGql>[0]) {
  // MEMBER first: the owner's cleanup deletes household A and its role rows.
  await cleanupCloudData(request, MEMBER)
  await cleanupCloudData(request)
}

test.beforeEach(async ({ page, request, baseURL }) => {
  test.skip(baseURL !== CLOUD_WEB_URL, 'cloud mode only')
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  await cleanupAll(request)
})

test.afterEach(async ({ request, baseURL }) => {
  if (baseURL !== CLOUD_WEB_URL) return
  await cleanupAll(request)
})

test.describe('live pantry updates', () => {
  // 60 s, as in live-cart.spec.ts: the cleanups and the seed take most of
  // the time, not the live update.
  test.describe.configure({ timeout: 60_000 })

  test('user sees a quantity another household member changes without reloading', async ({
    page,
    request,
  }) => {
    // Given the pantry shows Rice at 2 of 5
    const seed = await seedHousehold(request, [
      { name: 'Live Rice', packed: 2 },
    ])
    await openPantry(page, seed, 'Live Rice')
    await expect(cardOf(page, 'Live Rice')).toContainText('2 / 5')

    // When the member sets Rice to 4, from another device
    await seed.member(UPSERT_STOCK, {
      itemId: seed.ids['Live Rice'],
      locationId: seed.home,
      input: { packedQuantity: 4, targetQuantity: 5, refillThreshold: 1 },
    })

    // Then the pantry shows 4 of 5, in the same document
    await expect(cardOf(page, 'Live Rice')).toContainText('4 / 5', {
      timeout: 10_000,
    })
    await stillSameDocument(page)
  })

  test('user sees an item another household member renames without reloading', async ({
    page,
    request,
  }) => {
    // Given the pantry shows Pasta
    const seed = await seedHousehold(request, [
      { name: 'Live Pasta', packed: 1 },
    ])
    await openPantry(page, seed, 'Live Pasta')
    // Matches the card under either name, so a failure is a wrong name and
    // not a missing element
    const heading = page.getByRole('heading', {
      level: 3,
      name: /^Live (Pasta|Penne)$/,
    })
    await expect(heading).toHaveText('Live Pasta')

    // When the member renames it to Penne
    await seed.member(UPDATE_ITEM, {
      id: seed.ids['Live Pasta'],
      input: { name: 'Live Penne' },
    })

    // Then the pantry shows the new name, in the same document
    await expect(heading).toHaveText('Live Penne', { timeout: 10_000 })
    await stillSameDocument(page)
  })

  test('user sees a location they create on another device in the location switcher', async ({
    page,
    request,
  }) => {
    // Given the pantry is open, with the switcher's menu showing Home only
    const seed = await seedHousehold(request, [])
    await openPantry(page, seed, 'Live Salt')
    await page
      .getByRole('navigation', { name: 'Sidebar navigation' })
      .getByRole('button', { name: /switch location/i })
      .click()
    // Both names, so the count is the value that changes
    const entries = page.getByRole('menuitem', {
      name: /^(Home|Live Cellar)$/,
    })
    await expect(entries).toHaveCount(1)

    // When the same user creates "Live Cellar" from another device. Not
    // MEMBER: see the top of this file.
    await seed.owner(CREATE_LOCATION, { name: 'Live Cellar' })

    // Then the open menu lists it, in the same document
    await expect(entries).toHaveCount(2, { timeout: 10_000 })
    await expect(
      page.getByRole('menuitem', { name: 'Live Cellar' }),
    ).toBeVisible()
    await stillSameDocument(page)
  })

  test('user sees the pantry quantity change when another household member checks out a cart', async ({
    page,
    request,
  }) => {
    // Given Oats at 1 of 5, and 2 Oats in a vendor's cart at Home
    const seed = await seedHousehold(request, [
      { name: 'Live Oats', packed: 1 },
    ])
    const vendorId = (
      await seed.owner<{ createVendor: Row }>(CREATE_VENDOR, {
        name: 'Live Pantry Vendor',
        locationId: seed.home,
      })
    ).createVendor.id
    const cartId = (
      await seed.owner<{ vendorCart: Row }>(VENDOR_CART, {
        vendorId,
        locationId: seed.home,
      })
    ).vendorCart.id
    const rowId = (
      await seed.owner<{ addToCart: Row }>(ADD_TO_CART, {
        cartId,
        itemId: seed.ids['Live Oats'],
        quantity: 2,
      })
    ).addToCart.id
    await openPantry(page, seed, 'Live Oats')
    await expect(cardOf(page, 'Live Oats')).toContainText('1 / 5')

    // When the member checks the cart out
    await seed.member(CHECKOUT, {
      cartId,
      items: [{ cartItemId: rowId, quantity: 2 }],
    })

    // Then the pantry shows 3 of 5, in the same document
    await expect(cardOf(page, 'Live Oats')).toContainText('3 / 5', {
      timeout: 10_000,
    })
    await stillSameDocument(page)
  })

  test('user sees an item another household member deletes leave the pantry without reloading', async ({
    page,
    request,
  }) => {
    // Given Beans is in the pantry, with a log and a cart row at Home
    const seed = await seedHousehold(request, [
      { name: 'Live Beans', packed: 3 },
    ])
    const beans = seed.ids['Live Beans'] as string
    await seed.owner(ADD_LOG, {
      itemId: beans,
      locationId: seed.home,
      occurredAt: new Date().toISOString(),
    })
    const cartId = (
      await seed.owner<{ vendorCart: Row }>(VENDOR_CART, {
        vendorId: null,
        locationId: seed.home,
      })
    ).vendorCart.id
    await seed.owner(ADD_TO_CART, { cartId, itemId: beans, quantity: 1 })
    const socket = await openPantry(page, seed, 'Live Beans')
    const eventsBefore = socket.events.length

    // When the member deletes Beans
    const { deleteItem } = await seed.member<{ deleteItem: boolean }>(
      DELETE_ITEM,
      { id: beans },
    )
    expect(deleteItem).toBe(true)

    // Then the socket gets CATALOG for the household and STOCK, LOG and
    // CART at Home: the item had a row of each kind there. This checks
    // deleteItem's three reads of the rows' locations, on real SQL.
    // `arrayContaining`, not an exact list: a late warm-up `LOG` event may
    // still arrive in this window.
    const kindsAt = () =>
      socket.events
        .slice(eventsBefore)
        .map((e) => `${e.kind}@${e.locationId ?? HOUSEHOLD_EVENT_KEY}`)
        .sort()
    await expect
      .poll(kindsAt, { timeout: 10_000 })
      .toEqual(
        expect.arrayContaining([
          `CART@${seed.home}`,
          `CATALOG@${HOUSEHOLD_EVENT_KEY}`,
          `LOG@${seed.home}`,
          `STOCK@${seed.home}`,
        ]),
      )

    // And Beans leaves the pantry. Salt is still there, so the list is
    // rendered and the absence is not an empty loading state.
    await expect(cardOf(page, 'Live Beans')).toHaveCount(0, {
      timeout: 10_000,
    })
    await expect(cardOf(page, 'Live Salt')).toBeVisible()
    await stillSameDocument(page)
  })
})
