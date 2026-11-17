import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { CLOUD_WEB_URL, E2E_SECOND_USER_ID } from '../constants'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { addHouseholdMember } from '../helpers/cloudUsers'
import {
  connects,
  markDocument,
  routeLiveSocket,
  stillSameDocument,
  warmUpLiveSocket,
} from '../helpers/liveSocket'
import { newUserContext } from '../helpers/userContext'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// Two people, in two browsers, in ONE household (households H5 task F.8). It
// is the first spec where two browser contexts are two different users. Each
// context sets `localStorage['e2e-user-id']`, which only the E2E web build
// reads (`getE2ETestUserId` in apps/web/src/lib/e2eUser.ts,
// `newUserContext` in e2e/helpers/userContext.ts).
//
// | Test | Same page, two people, two answers                                       |
// |------|---------------------------------------------------------------------------|
// | 1    | the tags page: the owner gets New Tag Type, the member a read-only note   |
// | 2    | a cart: the owner adds a row; the viewer sees it live and gets no Done    |
// | 3    | a member creates a location: the owner sees it only on the settings list, |
// |      | as No access with Delete, never in the switcher                          |
//
// | Person | Household role | Fridge    | Garage      | Home (first sign-in) | Shed (test 3) |
// |--------|----------------|-----------|-------------|----------------------|---------------|
// | OWNER  | owner          | organizer | organizer   | organizer            | none          |
// | MEMBER | member         | viewer    | participant | none                 | organizer     |
//
// Every role test needs a second person with a different role and a location
// the caller has no role on (plan H5, *Rules every task brief must pass
// down*). Home is MEMBER's no-role location, Shed is OWNER's.
//
// ── ORDER ────────────────────────────────────────────────────────────────────
//
// OWNER sends GraphQL first (that makes the household). MEMBER is added
// BEFORE MEMBER's context opens a page: the first page load is MEMBER's first
// GraphQL request, and `addHouseholdMember` answers 409 after it.
//
// ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
//
// - OWNER cannot then give themselves a role on Shed. `addHouseholdMember`
//   refuses a person who is already in a household (409). That waits for
//   H5c's `setLocationRole`.
// - The production socket and Clerk. The E2E client sends `e2eUserId`.

const OWNER = `${E2E_SECOND_USER_ID}-shared-owner`
const MEMBER = `${E2E_SECOND_USER_ID}-shared-member`

type Gql = ReturnType<typeof makeGql>
type Row = { id: string }

const LOCATIONS = `query { locations { id } }`
const CREATE_LOCATION = `mutation ($name: String!) { createLocation(name: $name) { id } }`
const CREATE_TAG_TYPE = `mutation ($name: String!, $color: String!) {
  createTagType(name: $name, color: $color) { id }
}`
const CREATE_VENDOR = `mutation ($name: String!, $locationId: ID!) {
  createVendor(name: $name, locationId: $locationId) { id }
}`
const CREATE_ITEM = `mutation ($input: CreateItemInput!) { createItem(input: $input) { id } }`
const UPSERT_STOCK = `mutation ($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
  upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id }
}`

type Seed = {
  fridge: string
  garage: string
  vendorId: string
  bread: string
}

async function stock(
  owner: Gql,
  itemId: string,
  locationId: string,
  packedQuantity: number,
) {
  await owner(UPSERT_STOCK, {
    itemId,
    locationId,
    input: { packedQuantity, targetQuantity: 2, refillThreshold: 1 },
  })
}

/**
 * OWNER's household: Home (first sign-in), Fridge, Garage, a tag type, a
 * vendor with its cart at Fridge, and two items of that vendor stocked at
 * Fridge. Then MEMBER joins, before MEMBER sends any request.
 */
async function seedHousehold(request: APIRequestContext): Promise<Seed> {
  const owner = makeGql(request, OWNER)
  // The first request: first sign-in makes OWNER's household and "Home".
  await owner<{ locations: Row[] }>(LOCATIONS)
  const fridge = (
    await owner<{ createLocation: Row }>(CREATE_LOCATION, { name: 'Fridge' })
  ).createLocation.id
  const garage = (
    await owner<{ createLocation: Row }>(CREATE_LOCATION, { name: 'Garage' })
  ).createLocation.id
  await owner(CREATE_TAG_TYPE, { name: 'Shared Category', color: 'blue' })
  // OWNER organizes Fridge, so the vendor's cart is made there.
  const vendorId = (
    await owner<{ createVendor: Row }>(CREATE_VENDOR, {
      name: 'Shared Shop',
      locationId: fridge,
    })
  ).createVendor.id
  const milk = (
    await owner<{ createItem: Row }>(CREATE_ITEM, {
      input: { name: 'Shared Milk', vendorIds: [vendorId] },
    })
  ).createItem.id
  const bread = (
    await owner<{ createItem: Row }>(CREATE_ITEM, {
      input: { name: 'Shared Bread', vendorIds: [vendorId] },
    })
  ).createItem.id
  await stock(owner, milk, fridge, 0)
  await stock(owner, bread, fridge, 1)

  await addHouseholdMember(request, {
    ownerUserId: OWNER,
    memberUserId: MEMBER,
    householdRole: 'member',
    locations: [
      { locationId: fridge, role: 'viewer' },
      { locationId: garage, role: 'participant' },
    ],
  })
  return { fridge, garage, vendorId, bread }
}

/** A context for `userId`, with `activeLocationId` as the stored active location. */
async function openAs(
  browser: Browser,
  userId: string,
  activeLocationId?: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await newUserContext(
    browser,
    userId,
    activeLocationId
      ? [{ name: 'active-location-id:cloud', value: activeLocationId }]
      : [],
  )
  return { context, page: await context.newPage() }
}

async function cleanupAll(request: APIRequestContext) {
  // MEMBER first: OWNER's cleanup deletes the household and its role rows.
  await cleanupCloudData(request, MEMBER)
  await cleanupCloudData(request, OWNER)
  // And the build-time user. No test here acts as it, but if the
  // `localStorage` override ever stops working, every context falls back to
  // `E2E_USER_ID` and writes rows as that user. Found by the mutation that
  // made `getE2ETestUserId` ignore the key.
  await cleanupCloudData(request)
}

const contexts: BrowserContext[] = []

test.beforeEach(async ({ request, baseURL }) => {
  test.skip(baseURL !== CLOUD_WEB_URL, 'cloud mode only')
  await cleanupAll(request)
})

test.afterEach(async ({ request, baseURL }) => {
  for (const context of contexts.splice(0)) await context.close()
  if (baseURL !== CLOUD_WEB_URL) return
  await cleanupAll(request)
})

test.describe('two people in one household', () => {
  // 60 s, not 30 s: two contexts, two cleanups per hook, and a seed of
  // eleven requests, like live-cart.spec.ts.
  test.describe.configure({ timeout: 60_000 })

  test('household member sees the catalog read-only', async ({
    browser,
    request,
  }) => {
    // Given OWNER and MEMBER in one household, each in their own browser
    await seedHousehold(request)
    const owner = await openAs(browser, OWNER)
    const member = await openAs(browser, MEMBER)
    contexts.push(owner.context, member.context)

    // When both open the tags page
    await owner.page.goto('/settings/household/tags')
    await member.page.goto('/settings/household/tags')

    // Then OWNER can add a tag type
    const ownerMain = owner.page.getByRole('main')
    await expect(
      ownerMain.getByRole('heading', { name: 'Shared Category' }),
    ).toBeVisible()
    await expect(
      ownerMain.getByRole('button', { name: /new tag type/i }),
    ).toBeVisible()

    // And MEMBER sees the same tag type (present first, so the page and the
    // role have loaded), the read-only note, and no New Tag Type
    const memberMain = member.page.getByRole('main')
    await expect(
      memberMain.getByRole('heading', { name: 'Shared Category' }),
    ).toBeVisible()
    await expect(
      memberMain.getByText(
        'Only a household owner or manager can add or change these.',
      ),
    ).toBeVisible()
    await expect(
      memberMain.getByRole('button', { name: /new tag type/i }),
    ).toHaveCount(0)
  })

  test('location viewer sees the cart but cannot check out', async ({
    browser,
    request,
  }) => {
    // Given MEMBER is only a viewer of Fridge, and both people are on
    // Fridge's cart for Shared Shop
    const seed = await seedHousehold(request)
    const ownerGql = makeGql(request, OWNER)
    const owner = await openAs(browser, OWNER, seed.fridge)
    const member = await openAs(browser, MEMBER, seed.fridge)
    contexts.push(owner.context, member.context)

    const socket = await routeLiveSocket(member.page)
    await member.page.goto(`/shopping/${seed.vendorId}`)
    // Milk's checkbox. "Add Shared Milk" while it is not in the cart,
    // "Remove Shared Milk" once it is, so this finds it in both states.
    const memberMilk = member.page.getByRole('checkbox', {
      name: /^(Add|Remove) Shared Milk$/,
    })
    // Present first: the cart has loaded, and MEMBER's checkbox is disabled
    await expect(memberMilk).toBeVisible()
    await expect(memberMilk).not.toBeChecked()
    await expect(memberMilk).toBeDisabled()
    await expect(
      member.page
        .getByRole('main')
        .getByText('You can view this location, but not change it.'),
    ).toBeVisible()
    // The subscription is live: a change OWNER makes through the API reaches
    // MEMBER's socket (e2e/helpers/liveSocket.ts, *The warm-up*)
    await expect.poll(() => connects(member.page), { timeout: 15_000 }).toBe(1)
    await warmUpLiveSocket(socket, {
      key: seed.fridge,
      change: (attempt) =>
        stock(ownerGql, seed.bread, seed.fridge, attempt + 1),
    })
    await markDocument(member.page)

    // When OWNER adds Milk to the cart in OWNER's browser
    await owner.page.goto(`/shopping/${seed.vendorId}`)
    await owner.page.getByRole('checkbox', { name: 'Add Shared Milk' }).click()
    await expect(
      owner.page.getByRole('checkbox', { name: 'Remove Shared Milk' }),
    ).toBeChecked()

    // Then MEMBER sees Milk in the cart, without a reload
    await expect(memberMilk).toBeChecked({ timeout: 10_000 })
    await stillSameDocument(member.page)
    // And MEMBER still has no Done button, while OWNER has one
    await expect(
      owner.page.getByRole('main').getByRole('button', { name: 'Done' }),
    ).toBeVisible()
    await expect(
      member.page.getByRole('main').getByRole('button', { name: 'Done' }),
    ).toHaveCount(0)
  })

  test('household owner sees a location a member created as No access', async ({
    browser,
    request,
  }) => {
    // Given MEMBER, a household member, creates "Shed" in MEMBER's browser.
    // A member may create a location and becomes its only organizer (owner
    // decision O4-A).
    await seedHousehold(request)
    const member = await openAs(browser, MEMBER)
    contexts.push(member.context)
    await member.page.goto('/settings/household/locations')
    const memberMain = member.page.getByRole('main')
    await expect(memberMain.getByText('Fridge')).toBeVisible()
    await member.page.getByRole('button', { name: 'Add location' }).click()
    await member.page.getByRole('dialog').getByLabel('Name').fill('Shed')
    await member.page
      .getByRole('dialog')
      .getByRole('button', { name: /^add$/i })
      .click()
    await expect(memberMain.getByText('Shed')).toBeVisible()

    // When OWNER opens the location switcher
    const owner = await openAs(browser, OWNER)
    contexts.push(owner.context)
    await owner.page.goto('/')
    await owner.page
      .getByRole('navigation', { name: 'Sidebar navigation' })
      .getByRole('button', { name: /switch location/i })
      .click()

    // Then the switcher lists OWNER's own locations (present first) and not
    // Shed, where OWNER has no role
    await expect(
      owner.page.getByRole('menuitem', { name: 'Fridge' }),
    ).toBeVisible()
    await expect(
      owner.page.getByRole('menuitem', { name: 'Garage' }),
    ).toBeVisible()
    await expect(
      owner.page.getByRole('menuitem', { name: /Shed/ }),
    ).toHaveCount(0)
    await owner.page.keyboard.press('Escape')

    // And the settings list shows Shed as No access, with Delete
    await owner.page.goto('/settings/household/locations')
    const shedRow = owner.page
      .getByRole('main')
      .getByRole('listitem')
      .filter({ hasText: 'Shed' })
    await expect(shedRow).toBeVisible()
    await expect(shedRow).toContainText('No access')
    await expect(
      shedRow.getByRole('button', { name: 'Delete Shed' }),
    ).toBeVisible()
  })
})
