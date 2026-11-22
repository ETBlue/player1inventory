import { expect, type Page, test } from '@playwright/test'
import { CLOUD_WEB_URL, E2E_SECOND_USER_ID, E2E_USER_ID } from '../constants'
import { ensureCloudHomeLocation } from '../helpers/cloudSeed'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { addHouseholdMember } from '../helpers/cloudUsers'
import {
  connects,
  eventsAt,
  type LiveSocket,
  type LiveWindow,
  markDocument,
  operationResponse,
  routeLiveSocket,
  stillSameDocument,
  warmUpLiveSocket,
} from '../helpers/liveSocket'
import { ShoppingPage } from '../pages/ShoppingPage'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// Live cart updates (households H3c-1, task C.6), against real Postgres and a
// real WebSocket. The browser is `E2E_USER_ID`, on a vendor's cart page. Other
// people change carts through `makeGql`, which sends no `x-client-id`, so the
// browser's tab is never the source of their changes.
//
// | Test | What it shows                                                     | Code it reaches |
// |------|-------------------------------------------------------------------|-----------------|
// | 1    | a member's add shows up without a reload                          | `addToCart` → `publishChange` → `householdChanged` → `liveUpdates.ts` refetch |
// | 2    | a change in ANOTHER household never reaches this tab              | `shouldDeliver` in apps/server/src/resolvers/live.resolver.ts |
// | 3    | a change made while the socket is closed shows up after reconnect | the reconnect refetch in apps/web/src/apollo/liveUpdates.ts |
//
// | Person   | Household              | Home role   |
// |----------|------------------------|-------------|
// | browser  | owner of household A   | organizer   |
// | MEMBER   | member of household A  | participant |
// | STRANGER | owner of household B   | (B's own)   |
//
// ── THE SOCKET AND THE WARM-UP ───────────────────────────────────────────────
//
// `routeLiveSocket` and `warmUpLiveSocket` are in e2e/helpers/liveSocket.ts,
// with their reasons. Test 2 needs the socket's message count: an event that
// reaches the wrong household only makes the tab refetch its OWN cart, so the
// screen would not change at all. Test 3 needs `blocked`: the change is made
// while the page has no socket, for sure, and not while graphql-ws happens to
// be waiting before its retry. The warm-up here uses `updateCartItem`, not
// `addToCart`, so a test about `addToCart` cannot pass or fail because of the
// warm-up. It waits for its own `CartItems` refetch.
//
// ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
//
// - The production socket (Clerk token in `connectionParams`). The E2E client
//   sends `e2eUserId` instead.
// - The 60-minute age close (code 1001). Only the unit tests in
//   apps/server/src/lib/wsServer.test.ts reach it.
// - Kinds other than `CART`. live-pantry.spec.ts covers `STOCK`, `CATALOG`,
//   `LOCATION` and the checkout's `STOCK`.

const MEMBER = `${E2E_SECOND_USER_ID}-live-member`
const STRANGER = `${E2E_SECOND_USER_ID}-live-stranger`

type Gql = ReturnType<typeof makeGql>
type Row = { id: string }

const LOCATIONS = `query { locations { id } }`
const CREATE_VENDOR = `mutation ($name: String!, $locationId: ID!) {
  createVendor(name: $name, locationId: $locationId) { id }
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
const UPDATE_CART_ITEM = `mutation ($id: ID!, $quantity: Int!) {
  updateCartItem(id: $id, quantity: $quantity) { id }
}`

type Seed = {
  home: string
  vendorId: string
  cartId: string
  milk: string
  breadRowId: string
}

/** Create an item and stock it at `locationId`, as the pantry's Add does. */
async function createStockedItem(
  gql: Gql,
  locationId: string,
  input: { name: string; vendorIds?: string[] },
): Promise<string> {
  const { createItem } = await gql<{ createItem: Row }>(CREATE_ITEM, { input })
  await gql(UPSERT_STOCK, {
    itemId: createItem.id,
    locationId,
    input: { packedQuantity: 0, targetQuantity: 1, refillThreshold: 1 },
  })
  return createItem.id
}

/**
 * The browser's household: Home, one vendor with its cart, Bread already in
 * that cart (the warm-up changes it), Milk not in it. Then MEMBER joins as a
 * Home participant, BEFORE MEMBER sends any request (`addHouseholdMember`
 * answers 409 otherwise).
 */
async function seedHousehold(
  request: Parameters<typeof makeGql>[0],
): Promise<Seed> {
  const owner = makeGql(request)
  const home = (await ensureCloudHomeLocation(request)).id
  const vendorId = (
    await owner<{ createVendor: Row }>(CREATE_VENDOR, {
      name: 'Live Vendor',
      locationId: home,
    })
  ).createVendor.id
  const cartId = (
    await owner<{ vendorCart: Row }>(VENDOR_CART, {
      vendorId,
      locationId: home,
    })
  ).vendorCart.id
  const bread = await createStockedItem(owner, home, {
    name: 'Live Bread',
    vendorIds: [vendorId],
  })
  const milk = await createStockedItem(owner, home, {
    name: 'Live Milk',
    vendorIds: [vendorId],
  })
  const breadRowId = (
    await owner<{ addToCart: Row }>(ADD_TO_CART, {
      cartId,
      itemId: bread,
      quantity: 1,
    })
  ).addToCart.id

  await addHouseholdMember(request, {
    ownerUserId: E2E_USER_ID,
    memberUserId: MEMBER,
    householdRole: 'member',
    locations: [{ locationId: home, role: 'participant' }],
  })
  return { home, vendorId, cartId, milk, breadRowId }
}

/** See *The socket and the warm-up* at the top. */
async function warmUp(page: Page, member: Gql, seed: Seed, socket: LiveSocket) {
  await warmUpLiveSocket(socket, {
    key: seed.home,
    change: (attempt) =>
      member(UPDATE_CART_ITEM, { id: seed.breadRowId, quantity: attempt + 1 }),
    refetch: () => operationResponse(page, 'CartItems', 10_000),
  })
}

/**
 * Open the cart page with the socket routed, and wait until the socket is
 * acknowledged and the subscription is live.
 */
async function openCart(page: Page, seed: Seed, member: Gql) {
  const socket = await routeLiveSocket(page)
  await new ShoppingPage(page).navigateToVendorCart(seed.vendorId)
  // Something PRESENT first: Bread is in the cart, so the page has loaded
  // the cart's rows.
  await expect(page.getByLabel('Remove Live Bread')).toBeVisible()
  await expect.poll(() => connects(page), { timeout: 15_000 }).toBe(1)
  await warmUp(page, member, seed, socket)
  // A value only this document has. A reload or a navigation would lose it.
  await markDocument(page)
  return socket
}

/**
 * Milk's checkbox. It is "Add Live Milk" while Milk is not in the cart and
 * "Remove Live Milk" once it is (`ItemCard`), so this locator finds it in
 * both states and the check fails on the VALUE, not on a missing element.
 */
function milkCheckbox(page: Page) {
  return page.getByRole('checkbox', { name: /^(Add|Remove) Live Milk$/ })
}

async function cleanupAll(request: Parameters<typeof makeGql>[0]) {
  // One call for every user (E2E speed plan, task S.4). A household whose
  // members are all listed is deleted too (decision D6), so the order of
  // the users no longer matters.
  await cleanupCloudData(request, [MEMBER, STRANGER, E2E_USER_ID])
}

test.beforeEach(async ({ page, request, baseURL }) => {
  test.skip(baseURL !== CLOUD_WEB_URL, 'cloud mode only')
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  await cleanupAll(request)
})

test.describe('live cart updates', () => {
  // 60 s, not the default 30 s. The hooks share the test's time budget, and
  // most of it goes to the database, not to live updates. Measured
  // 2026-11-16 at load average about 2.3, one test: the three cleanups take
  // 3.4 to 5.9 s per hook (twice per test until E2E speed plan task S.3; once since), the seed 7.0 s, opening the page
  // 1.8 to 2.3 s, the warm-up 1.0 to 1.2 s. Each test took 19.6 to 23.4 s in
  // all, too close to 30 s for a busy machine.
  test.describe.configure({ timeout: 60_000 })

  test('user sees an item another household member adds to the cart without reloading', async ({
    page,
    request,
  }) => {
    // Given the cart page is open, with Milk not in the cart
    const seed = await seedHousehold(request)
    const member = makeGql(request, MEMBER)
    await openCart(page, seed, member)
    await expect(milkCheckbox(page)).not.toBeChecked()

    // When the member adds Milk to the same cart, from another device
    await member(ADD_TO_CART, {
      cartId: seed.cartId,
      itemId: seed.milk,
      quantity: 1,
    })

    // Then Milk shows as in the cart, in the same document: no reload, no
    // navigation
    await expect(milkCheckbox(page)).toBeChecked({ timeout: 10_000 })
    await stillSameDocument(page)
  })

  test('user does not get live updates from another household', async ({
    page,
    request,
  }) => {
    // Given the cart page is open and its subscription is live
    const seed = await seedHousehold(request)
    const member = makeGql(request, MEMBER)
    const socket = await openCart(page, seed, member)
    await expect(milkCheckbox(page)).not.toBeChecked()

    // And a stranger in another household with a cart of their own
    const stranger = makeGql(request, STRANGER)
    const strangerHome = (await stranger<{ locations: Row[] }>(LOCATIONS))
      .locations[0]?.id
    if (!strangerHome) throw new Error('stranger: no location after sign-in')
    const strangerCart = (
      await stranger<{ vendorCart: Row }>(VENDOR_CART, {
        vendorId: null,
        locationId: strangerHome,
      })
    ).vendorCart.id
    const strangerItem = (
      await stranger<{ createItem: Row }>(CREATE_ITEM, {
        input: { name: 'Stranger Tea' },
      })
    ).createItem.id
    const homeEventsBefore = eventsAt(socket, seed.home)

    // When the stranger changes their own cart
    await stranger(ADD_TO_CART, {
      cartId: strangerCart,
      itemId: strangerItem,
      quantity: 1,
    })

    // And then the member changes Home's cart
    await member(UPDATE_CART_ITEM, { id: seed.breadRowId, quantity: 50 })

    // Then the member's event arrives. This is the barrier that replaces a
    // fixed wait. The server puts events in one queue per subscriber, in the
    // order they were published, and checks them one at a time
    // (`householdChangedIterator`). The stranger's event was published
    // before the stranger's request returned, so before the member's. When
    // the member's event has arrived, the stranger's event has already been
    // checked: if it had been sent, it would have arrived first.
    await expect
      .poll(() => eventsAt(socket, seed.home), { timeout: 10_000 })
      .toBeGreaterThan(homeEventsBefore)

    // And no event for the stranger's location ever reached this tab
    expect(eventsAt(socket, strangerHome)).toBe(0)
    expect([...socket.eventsAt.keys()]).toEqual([seed.home])
    // And the page is unchanged: Milk is still not in the cart
    await expect(milkCheckbox(page)).not.toBeChecked()
    await stillSameDocument(page)
  })

  test('user sees a cart change made while the connection was down, once it comes back', async ({
    page,
    request,
  }) => {
    // Given the cart page is open, with Milk not in the cart
    const seed = await seedHousehold(request)
    const member = makeGql(request, MEMBER)
    const socket = await openCart(page, seed, member)
    await expect(milkCheckbox(page)).not.toBeChecked()
    const connectsBefore = await connects(page)

    // When the connection breaks, and every new one is refused for now.
    // `terminate()` closes the socket at a known moment (graphql-ws, close
    // 4499), the way a dropped network does, and graphql-ws retries it.
    // `page.context().setOffline(true)` was not used: when the browser closes
    // an open socket after that is up to the browser, and the app's own
    // offline handling (`isOffline`, the offline banner) would run as well.
    socket.blocked = true
    await page.evaluate(() =>
      (window as LiveWindow).__p1iLiveUpdates?.terminate(),
    )

    // And the member adds Milk while the page has no socket
    await member(ADD_TO_CART, {
      cartId: seed.cartId,
      itemId: seed.milk,
      quantity: 1,
    })

    // Then the page has NOT reconnected yet: the event for that add was
    // published while the page had no open socket, and the screen has not
    // changed. Only the refetch on reconnect can show Milk now.
    expect(await connects(page)).toBe(connectsBefore)
    await expect(milkCheckbox(page)).not.toBeChecked()

    // When new sockets are allowed again
    socket.blocked = false

    // Then graphql-ws reconnects by itself (it waits 1.3 to 4 s per try,
    // longer after a refused try)
    await expect
      .poll(() => connects(page), { timeout: 30_000 })
      .toBe(connectsBefore + 1)

    // And the refetch on reconnect shows Milk, in the same document
    await expect(milkCheckbox(page)).toBeChecked({ timeout: 10_000 })
    await stillSameDocument(page)
  })
})
