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
import {
  connects,
  markDocument,
  routeLiveSocket,
  stillSameDocument,
  warmUpLiveSocket,
} from '../helpers/liveSocket'
import { newUserContext, type UserContextOptions } from '../helpers/userContext'
import { JoinPage } from '../pages/JoinPage'
import { MembersPage } from '../pages/MembersPage'
import { PantryPage } from '../pages/PantryPage'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// Invites, joins and the Members page, on real SQL, with a browser per person
// (households H5b task G.10). These are the first real-SQL runs of
// `createInvite`, `revokeInvite`, `invitePreview`, `joinHousehold` (its
// locks, the claim of the invite, and the delete of an empty household),
// `setHouseholdRole`, `removeMember`, `leaveHousehold` and `createHousehold`.
//
// | Test | What                                                                   |
// |------|------------------------------------------------------------------------|
// | 1    | a brand-new person (local mode, no onboarding skip) opens a link made  |
// |      | in the owner's browser, joins, and sees the shared pantry live. Their  |
// |      | own empty household is deleted (Review Focus 1, decision T21)          |
// | 2    | a used, a revoked, an unknown and a too-short link all say "no longer  |
// |      | valid", and name no household (decision T18)                           |
// | 3    | a removed person invited again as viewer is ONLY a viewer (Review      |
// |      | Focus 3, decisions T11 and T20, H5 D9)                                 |
// | 4    | a person in two households acts in the one joined last, and an import  |
// |      | cannot reach the other one (Review Focus 4, issue #381). No browser    |
// | 5    | a member leaves, sees the no-household screen, creates a household     |
// | 6    | the owner makes a member a manager; a manager's limits on the page and |
// |      | on the server                                                          |
// | 7, 8 | axe scans (WCAG AA), light and dark: the join page, the Members page,  |
// |      | the invite dialog (form and link), the Remove and Leave confirms, the  |
// |      | no-household screen and its Create dialog. `a11y.spec.ts` does not run |
// |      | in the `cloud` project, so they live here, with the same rules         |
// |      | (`e2e/helpers/axe.ts`)                                                 |
//
// Every person is `${E2E_SECOND_USER_ID}-invite-…` and gets a name with
// `createCloudUser` BEFORE their first request, so the owner's household is
// "Olivia Owner's Household" (`firstSignInNames` in
// apps/server/src/lib/household.ts) and the Members page shows real names.
//
// ── TRAPS ────────────────────────────────────────────────────────────────────
//
// - A removed or leaving person's open tabs get NO live event (they are no
//   longer members, so `shouldDeliver` drops it). Open or reload their page
//   AFTER the change.
// - `HouseholdChangeGuard` reloads a page when the server answers a new
//   household. So no test changes a person's household through the API while
//   that person's page is open.
// - Cleanup order: everyone else first, the OWNER last. The owner's cleanup
//   deletes the household; done first, it would leave the others in
//   NO_HOUSEHOLD for the rest of the hook.
// - Leave and Join end in a full page load of `/`. Locators are made again
//   after it.
//
// ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
//
// - The sign-in return path (decision T24). The E2E build has no Clerk and
//   does not mount `CloudAuthGuard`, so "Sign in to join" lands straight on
//   the join page in cloud mode. Unit tests cover it
//   (`routes/sign-in.test.tsx`, `routes/__root.offline.test.tsx`).
// - An EXPIRED link. No E2E route moves time (decision T28); the unit tests of
//   `invitePreview` and `joinHousehold` use a clock.
// - Two joins on one link at the same moment (Review Focus 2). Covered by
//   the unit tests of G.4 only; E2E runs one worker, so two requests sent
//   together may or may not overlap in Postgres.
// - The production socket and Clerk. The E2E client sends `e2eUserId`.

const OWNER = `${E2E_SECOND_USER_ID}-invite-owner`
const NEWCOMER = `${E2E_SECOND_USER_ID}-invite-newcomer`
const REPEAT = `${E2E_SECOND_USER_ID}-invite-repeat`
const TWO_HOMES = `${E2E_SECOND_USER_ID}-invite-two`
const USED_BY = `${E2E_SECOND_USER_ID}-invite-used`
const MANAGER = `${E2E_SECOND_USER_ID}-invite-manager`
const MEMBER = `${E2E_SECOND_USER_ID}-invite-member`

const NAMES: Record<string, string> = {
  [OWNER]: 'Olivia Owner',
  [NEWCOMER]: 'Nico Newcomer',
  [REPEAT]: 'Rae Repeat',
  [TWO_HOMES]: 'Tam Two',
  [USED_BY]: 'Uma Used',
  [MANAGER]: 'Max Manager',
  [MEMBER]: 'Mia Member',
}
const HOUSEHOLD = "Olivia Owner's Household"
const ITEM = 'Invite Rice'

type Gql = ReturnType<typeof makeGql>
type Row = { id: string }

const HOUSEHOLD_QUERY = `query { household { id name role } }`
const LOCATIONS = `query { locations { id name myRole } }`
const CREATE_ITEM = `mutation ($input: CreateItemInput!) { createItem(input: $input) { id } }`
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
const MEMBERS = `query { householdMembers { userId role } }`
const INVITES = `query { householdInvites { id token } }`
const INVITE_PREVIEW = `query ($token: String!) {
  invitePreview(token: $token) { status householdName invitedByName householdRole locationRoles { locationId } }
}`
const CREATE_INVITE_RAW = `mutation ($householdRole: HouseholdRole!, $locationRoles: [InviteLocationRoleInput!]!) {
  createInvite(householdRole: $householdRole, locationRoles: $locationRoles) { id }
}`
const SET_ROLE = `mutation ($userId: ID!, $role: HouseholdRole!) {
  setHouseholdRole(userId: $userId, role: $role) { userId }
}`
const REMOVE_MEMBER = `mutation ($userId: ID!) { removeMember(userId: $userId) }`
const VENDOR_CART = `query ($locationId: ID!) { vendorCart(vendorId: null, locationId: $locationId) { id } }`
const CART_ITEMS = `query ($cartId: ID!) { cartItems(cartId: $cartId) { itemId } }`
const ITEM_STOCKS = `query ($locationId: ID!) { itemStocks(locationId: $locationId) { itemId } }`
const BULK_ITEM_STOCKS = `mutation ($itemStocks: [ItemStockImportInput!]!) {
  bulkCreateItemStocks(itemStocks: $itemStocks) { id }
}`
const BULK_CART_ITEMS = `mutation ($cartItems: [CartItemInput!]!) {
  bulkCreateCartItems(cartItems: $cartItems) { itemId }
}`

type Seed = {
  owner: Gql
  householdId: string
  home: string
  rice: string
}

/**
 * Name every person, then make OWNER's household: OWNER's first request
 * runs first sign-in, which makes the household and "Home". One item, Invite
 * Rice, stocked at Home at 2 of 5.
 */
async function seedOwner(request: APIRequestContext): Promise<Seed> {
  for (const [id, name] of Object.entries(NAMES))
    await createCloudUser(request, id, name)
  const owner = makeGql(request, OWNER)
  const { household } = await owner<{
    household: { id: string; name: string }
  }>(HOUSEHOLD_QUERY)
  expect(household.name).toBe(HOUSEHOLD)
  const { locations } = await owner<{ locations: Row[] }>(LOCATIONS)
  const home = locations[0]?.id
  if (!home) throw new Error('no Home after first sign-in')
  const rice = (
    await owner<{ createItem: Row }>(CREATE_ITEM, { input: { name: ITEM } })
  ).createItem.id
  await owner(UPSERT_STOCK, {
    itemId: rice,
    locationId: home,
    input: { packedQuantity: 2, targetQuantity: 5, refillThreshold: 1 },
  })
  return { owner, householdId: household.id, home, rice }
}

/** A change at Home that publishes a live event and changes no quantity. */
function logAtHome(seed: Seed) {
  return () =>
    seed.owner(ADD_LOG, {
      itemId: seed.rice,
      locationId: seed.home,
      occurredAt: new Date().toISOString(),
    })
}

/** Every context a test opens. `afterEach` closes them all. */
const contexts: BrowserContext[] = []

async function openAs(
  browser: Browser,
  userId: string,
  options: UserContextOptions = {},
): Promise<Page> {
  const context = await newUserContext(browser, userId, [], options)
  contexts.push(context)
  return context.newPage()
}

/** The sidebar of the pantry and settings pages. */
function sidebar(page: Page) {
  return page.getByRole('navigation', { name: 'Sidebar navigation' })
}

/**
 * The card's link holds the name and the quantity ("2 / 5 …"). Found by the
 * name, so it resolves in both states (live-pantry.spec.ts).
 */
function cardOf(page: Page, name: string) {
  return page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) })
}

/** "You are not in any household." (`noHousehold.title`). */
function noHouseholdTitle(page: Page) {
  return page.getByText('You are not in any household.')
}

async function memberIds(seed: Seed): Promise<string[]> {
  const { householdMembers } = await seed.owner<{
    householdMembers: { userId: string }[]
  }>(MEMBERS)
  return householdMembers.map((person) => person.userId)
}

async function cleanupAll(request: APIRequestContext) {
  // Everyone else first, OWNER last: OWNER's cleanup deletes the household
  // and every member row in it (e2e/CLAUDE.md, *Use addHouseholdMember in
  // this order*).
  for (const id of [NEWCOMER, REPEAT, TWO_HOMES, USED_BY, MANAGER, MEMBER])
    await cleanupCloudData(request, id)
  await cleanupCloudData(request, OWNER)
  // And the build-time user: if the `e2e-user-id` override ever stops
  // working, every context writes as it (shared-household.spec.ts).
  await cleanupCloudData(request)
}

test.beforeEach(async ({ request, baseURL }) => {
  test.skip(baseURL !== CLOUD_WEB_URL, 'cloud mode only')
  await cleanupAll(request)
})

test.afterEach(async ({ request, baseURL }) => {
  for (const context of contexts.splice(0)) await context.close()
  if (baseURL !== CLOUD_WEB_URL) return
  await cleanupAll(request)
})

test.describe('invite, join and members', () => {
  // 90 s: up to three browsers, seven cleanups per hook, and live updates.
  test.describe.configure({ timeout: 90_000 })

  test('user can invite a person who joins in another browser', async ({
    browser,
    request,
  }) => {
    // Given OWNER on the Members page, with the live socket working
    const seed = await seedOwner(request)
    const ownerPage = await openAs(browser, OWNER)
    const ownerSocket = await routeLiveSocket(ownerPage)
    const members = new MembersPage(ownerPage)
    await members.navigateTo()
    await expect(members.memberRow(NAMES[OWNER] ?? '')).toBeVisible()

    // When OWNER invites someone as a member and a participant of Home, and
    // reads the link from the dialog (not the clipboard)
    await members.openInvite()
    await members.chooseLocationRole('Home', 'Participant')
    const token = await members.createLink()
    await members.closeInvite()
    await expect(
      members
        .main()
        .getByRole('listitem')
        .filter({ hasText: 'Home: Participant' }),
    ).toBeVisible()
    await expect.poll(() => connects(ownerPage), { timeout: 15_000 }).toBe(1)
    await warmUpLiveSocket(ownerSocket, {
      key: seed.home,
      change: logAtHome(seed),
    })
    await markDocument(ownerPage)

    // And NEWCOMER, a brand-new visitor (local mode, no onboarding skip),
    // opens the link in another browser
    const newcomerPage = await openAs(browser, NEWCOMER, {
      skipOnboarding: false,
      cloudMode: false,
    })
    const newcomerSocket = await routeLiveSocket(newcomerPage)
    const join = new JoinPage(newcomerPage)
    await join.navigateTo(token)

    // Then local mode explains cloud sync and offers "Sign in to join"
    await expect(
      newcomerPage.getByText(
        'Joining a household uses cloud sync. Your data on this device stays here and is not copied.',
      ),
    ).toBeVisible()
    await join.signInToJoin()

    // And in cloud mode the same page shows the household, the inviter and
    // the roles. It was NOT sent to /onboarding, although NEWCOMER's catalog
    // is empty (decision T25)
    await expect(join.heading()).toHaveText(`Join ${HOUSEHOLD}`)
    expect(new URL(newcomerPage.url()).pathname).toBe(`/join/${token}`)
    await expect(
      newcomerPage.getByText('Olivia Owner invited you.'),
    ).toBeVisible()
    const roles = newcomerPage.getByRole('listitem')
    await expect(roles.filter({ hasText: HOUSEHOLD })).toContainText('Member')
    await expect(roles.filter({ hasText: 'Home' })).toContainText('Participant')
    // NEWCOMER's first cloud request made them a household of their own, so
    // the join below has one to delete
    await expect
      .poll(
        async () => (await readCloudUser(request, NEWCOMER))?.householdSetupAt,
      )
      .not.toBeNull()

    // When NEWCOMER presses Join
    await join.join()

    // Then NEWCOMER is on the pantry of OWNER's household, with its item
    await expect(sidebar(newcomerPage)).toContainText(HOUSEHOLD)
    await expect(cardOf(newcomerPage, ITEM)).toContainText('2 / 5')
    expect(new URL(newcomerPage.url()).pathname).toBe('/')
    await expect
      .poll(
        async () => (await readCloudUser(request, NEWCOMER))?.activeHouseholdId,
      )
      .toBe(seed.householdId)

    // And OWNER's Members page shows NEWCOMER without a reload (LOCATION)
    await expect(members.memberRow(NAMES[NEWCOMER] ?? '')).toContainText(
      'Member',
      { timeout: 10_000 },
    )
    await stillSameDocument(ownerPage)

    // When OWNER fills Invite Rice to full in OWNER's pantry
    await expect.poll(() => connects(newcomerPage), { timeout: 15_000 }).toBe(1)
    await warmUpLiveSocket(newcomerSocket, {
      key: seed.home,
      change: logAtHome(seed),
    })
    await markDocument(newcomerPage)
    const ownerPantry = new PantryPage(ownerPage)
    await ownerPantry.navigateTo()
    await ownerPantry.clickQuickUpdate(ITEM)
    await ownerPage.getByRole('button', { name: 'Fill to Full' }).click()
    await ownerPage.getByRole('button', { name: 'Update' }).click()
    await expect(cardOf(ownerPage, ITEM)).toContainText('5 / 5')

    // Then NEWCOMER sees 5 of 5 without a reload (STOCK)
    await expect(cardOf(newcomerPage, ITEM)).toContainText('5 / 5', {
      timeout: 10_000,
    })
    await stillSameDocument(newcomerPage)

    // And NEWCOMER's own empty household was deleted at the join (decision
    // T21): NEWCOMER's cleanup finds no household they own, only their
    // member row in OWNER's household. The page is closed first, so it
    // sends no request that would make the person again.
    for (const context of contexts.splice(0)) await context.close()
    const left = await cleanupCloudData(request, NEWCOMER)
    expect(left.deleted.householdMembers).toBe(1)
    expect(left.deleted.households).toBe(0)
  })

  test('user sees that a used, revoked or unknown invite is no longer valid', async ({
    browser,
    request,
  }) => {
    // Given two invites: one used by USED_BY, one revoked by OWNER in
    // OWNER's browser
    const seed = await seedOwner(request)
    const used = await createInvite(request, OWNER, 'member', [])
    const revoked = await createInvite(request, OWNER, 'member', [
      { locationId: seed.home, role: 'viewer' },
    ])
    await joinHousehold(request, USED_BY, used)

    const ownerPage = await openAs(browser, OWNER)
    const members = new MembersPage(ownerPage)
    await members.navigateTo()
    const revokedRow = members
      .main()
      .getByRole('listitem')
      .filter({ hasText: 'Home: Viewer' })
    await revokedRow.getByRole('button', { name: 'Revoke' }).click()
    await members
      .confirmDialog()
      .getByRole('button', { name: 'Revoke', exact: true })
      .click()
    await expect(members.main().getByText('No open invites.')).toBeVisible()
    await expect
      .poll(
        async () =>
          (await seed.owner<{ householdInvites: Row[] }>(INVITES))
            .householdInvites,
      )
      .toEqual([])

    // When NEWCOMER opens each link: used, revoked, a made-up token of the
    // right length, and one of the wrong length
    const tokens = [used, revoked, 'x'.repeat(43), 'too-short']
    const newcomerPage = await openAs(browser, NEWCOMER)
    const join = new JoinPage(newcomerPage)
    const newcomer = makeGql(request, NEWCOMER)
    for (const token of tokens) {
      await join.navigateTo(token)

      // Then the page says the link is no longer valid, and names no
      // household and no inviter
      await join.expectInvalid()
      await expect(newcomerPage.getByText(/Olivia Owner/)).toHaveCount(0)
      await expect(
        newcomerPage.getByRole('button', { name: 'Join', exact: true }),
      ).toHaveCount(0)

      // And the server sends nothing about the household either
      const { invitePreview } = await newcomer<{
        invitePreview: Record<string, unknown>
      }>(INVITE_PREVIEW, { token })
      expect(invitePreview).toEqual({
        status: 'INVALID',
        householdName: null,
        invitedByName: null,
        householdRole: null,
        locationRoles: null,
      })
    }
    // And a join with the revoked link is refused (INVITE_INVALID)
    await expect(joinHousehold(request, NEWCOMER, revoked)).rejects.toThrow(
      /INVITE_INVALID/,
    )
  })

  test('user who was removed and invited again gets only the new roles', async ({
    browser,
    request,
  }) => {
    // Given REPEAT joined OWNER's household as a participant of Home
    const seed = await seedOwner(request)
    await joinHousehold(
      request,
      REPEAT,
      await createInvite(request, OWNER, 'member', [
        { locationId: seed.home, role: 'participant' },
      ]),
    )

    // When OWNER removes REPEAT in OWNER's browser
    const ownerPage = await openAs(browser, OWNER)
    const members = new MembersPage(ownerPage)
    await members.navigateTo()
    await members.removeMember(NAMES[REPEAT] ?? '')
    await expect.poll(() => memberIds(seed)).not.toContain(REPEAT)
    // Present first: OWNER's own row, then no REPEAT row
    await expect(members.memberRow(NAMES[OWNER] ?? '')).toBeVisible()
    await expect(members.memberRow(NAMES[REPEAT] ?? '')).toHaveCount(0)

    // Then REPEAT's next page load shows the no-household screen. REPEAT's
    // first request was the join, so REPEAT never had a household of their
    // own (the join set the first sign-in claim)
    const repeatPage = await openAs(browser, REPEAT)
    await repeatPage.goto('/')
    await expect(noHouseholdTitle(repeatPage)).toBeVisible()

    // When OWNER invites REPEAT again, as a VIEWER of Home, and REPEAT joins
    // in REPEAT's browser
    const token = await createInvite(request, OWNER, 'member', [
      { locationId: seed.home, role: 'viewer' },
    ])
    const join = new JoinPage(repeatPage)
    await join.navigateTo(token)
    await expect(join.heading()).toHaveText(`Join ${HOUSEHOLD}`)
    await join.join()

    // Then REPEAT's switcher shows Home as View only, and the pantry card
    // has no quick-update button (present first: the card). The switcher is
    // found by the start of its name, so it is found with any role and the
    // check fails on the badge, not on a missing element.
    const switcher = sidebar(repeatPage).getByRole('button', {
      name: /^Switch location \(current: Home/,
    })
    await expect(switcher).toContainText('Home')
    await expect(switcher).toContainText('View only')
    await expect(cardOf(repeatPage, ITEM)).toContainText('2 / 5')
    await expect(
      repeatPage.getByRole('button', { name: `Update quantity of ${ITEM}` }),
    ).toHaveCount(0)

    // And the server agrees: REPEAT's only role on Home is viewer. The old
    // participant row did not come back (decisions T11 and T20)
    const { locations } = await makeGql(
      request,
      REPEAT,
    )<{
      locations: { id: string; myRole: string | null }[]
    }>(LOCATIONS)
    expect(locations.map((l) => [l.id, l.myRole])).toEqual([
      [seed.home, 'viewer'],
    ])
  })

  test('user in two households acts in the household they joined last', async ({
    request,
  }) => {
    // Given TWO_HOMES has a household of their own with an item in it (so the
    // join keeps it), and then joins OWNER's household as a manager and a
    // participant of Home
    const seed = await seedOwner(request)
    const two = makeGql(request, TWO_HOMES)
    const own = (await two<{ household: Row }>(HOUSEHOLD_QUERY)).household.id
    const ownHome = (await two<{ locations: Row[] }>(LOCATIONS)).locations[0]
      ?.id
    if (!ownHome) throw new Error('no Home in the own household')
    const tea = (
      await two<{ createItem: Row }>(CREATE_ITEM, {
        input: { name: 'Own Tea' },
      })
    ).createItem.id
    await two(UPSERT_STOCK, {
      itemId: tea,
      locationId: ownHome,
      input: { packedQuantity: 1, targetQuantity: 2, refillThreshold: 1 },
    })
    const joined = await joinHousehold(
      request,
      TWO_HOMES,
      await createInvite(request, OWNER, 'manager', [
        { locationId: seed.home, role: 'participant' },
      ]),
    )
    expect(joined.id).toBe(seed.householdId)

    // Then every request uses OWNER's household, the one joined last
    for (let i = 0; i < 3; i++) {
      const { household } = await two<{ household: Row }>(HOUSEHOLD_QUERY)
      expect(household.id).toBe(seed.householdId)
    }
    expect(seed.householdId).not.toBe(own)
    // And the locations are OWNER's household's only
    const { locations } = await two<{ locations: Row[] }>(LOCATIONS)
    expect(locations.map((l) => l.id)).toEqual([seed.home])

    // When TWO_HOMES imports a stock row for an item of the household they
    // act in (Invite Rice) at the location of their OWN household. The item
    // is allowed and TWO_HOMES organizes that location, so only the check
    // "the location is in the target household" (`requireLocationInHousehold`
    // in `requireOwnItemStockRefs`, issue #381 gap 1) can refuse it
    const stamp = new Date().toISOString()
    await expect(
      two(BULK_ITEM_STOCKS, {
        itemStocks: [
          {
            id: `g10-stock-${Date.now()}`,
            itemId: seed.rice,
            locationId: ownHome,
            targetQuantity: 9,
            refillThreshold: 1,
            packedQuantity: 9,
            unpackedQuantity: 0,
            createdAt: stamp,
            updatedAt: stamp,
          },
        ],
      }),
    ).rejects.toThrow(/FORBIDDEN/)

    // And imports two cart rows into Home's cart: one names the own
    // household's item, one OWNER's household's item (the control)
    const cartId = (
      await two<{ vendorCart: Row }>(VENDOR_CART, { locationId: seed.home })
    ).vendorCart.id
    const { bulkCreateCartItems } = await two<{
      bulkCreateCartItems: { itemId: string }[]
    }>(BULK_CART_ITEMS, {
      cartItems: [
        { id: `g10-cart-own-${Date.now()}`, cartId, itemId: tea, quantity: 1 },
        {
          id: `g10-cart-h-${Date.now()}`,
          cartId,
          itemId: seed.rice,
          quantity: 1,
        },
      ],
    })

    // Then only the control row is written
    expect(bulkCreateCartItems.map((row) => row.itemId)).toEqual([seed.rice])

    // And OWNER's household holds no row of the own household: Home's stock
    // is Invite Rice only, and its cart holds Invite Rice only
    const { itemStocks } = await seed.owner<{
      itemStocks: { itemId: string }[]
    }>(ITEM_STOCKS, { locationId: seed.home })
    expect(itemStocks.map((row) => row.itemId)).toEqual([seed.rice])
    const { cartItems } = await seed.owner<{ cartItems: { itemId: string }[] }>(
      CART_ITEMS,
      { cartId },
    )
    expect(cartItems.map((row) => row.itemId)).toEqual([seed.rice])

    // And the own household is unchanged: TWO_HOMES's cleanup deletes it
    // with exactly its one item and its one stock row (Own Tea's; the
    // refused Invite Rice row was not added there), and TWO_HOMES's member
    // row in OWNER's household
    const left = await cleanupCloudData(request, TWO_HOMES)
    expect(left.deleted.households).toBe(1)
    expect(left.deleted.items).toBe(1)
    expect(left.deleted.itemStocks).toBe(1)
    expect(left.deleted.cartItems).toBe(0)
    expect(left.deleted.householdMembers).toBe(2)
  })

  test('household member can leave and create a household', async ({
    browser,
    request,
  }) => {
    // Given NEWCOMER is a member of OWNER's household (the join was their
    // first request, so they have no household of their own)
    const seed = await seedOwner(request)
    await joinHousehold(
      request,
      NEWCOMER,
      await createInvite(request, OWNER, 'member', [
        { locationId: seed.home, role: 'participant' },
      ]),
    )
    const page = await openAs(browser, NEWCOMER)
    const members = new MembersPage(page)
    await members.navigateTo()
    await expect(members.memberRow(NAMES[OWNER] ?? '')).toContainText('Owner')

    // When NEWCOMER leaves in their browser
    await members.leaveHousehold()

    // Then NEWCOMER is no longer a member (read back first, so a leave that
    // wrote nothing fails on the value), and sees the no-household screen
    await expect.poll(() => memberIds(seed)).toEqual([OWNER])
    await expect(noHouseholdTitle(page)).toBeVisible()
    // The screen's other actions (owner decision O19). "Sign in to another
    // account" needs Clerk, and the E2E build has none, so it is not shown
    // here; the unit tests of NoHouseholdScreen carry it
    const offline = page.getByRole('button', { name: 'Switch to offline mode' })
    await expect(offline).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Sign in to another account' }),
    ).toHaveCount(0)

    // When NEWCOMER switches to offline mode
    await offline.click()

    // Then the page loads again in local mode, with no screen. The proof of
    // local mode is local's own seeded location, "My Home": a cloud person
    // with no household has no location at all. (The sidebar's "My data" is
    // NOT a proof: `HouseholdLabel` shows it in cloud mode too, while the
    // name cannot be read. A mutation that kept cloud mode passed it.)
    await expect(
      sidebar(page).getByRole('button', {
        name: 'Switch location (current: My Home)',
      }),
    ).toBeVisible()
    await expect(noHouseholdTitle(page)).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('data-mode'))).toBe(
      'local',
    )

    // When NEWCOMER switches back to cloud (the Clerk session, here the E2E
    // user id, was kept, so no sign-in)
    await page.evaluate(() => localStorage.setItem('data-mode', 'cloud'))
    await page.reload()

    // Then the no-household screen shows again, with Create
    await expect(noHouseholdTitle(page)).toBeVisible()

    // When NEWCOMER creates a household with the default name
    await page.getByRole('button', { name: 'Create a household' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create a household' })
    await dialog.getByRole('button', { name: 'Create a household' }).click()
    await page.waitForURL((url) => url.pathname === '/')

    // Then NEWCOMER's pantry is their new household's "Home", with no items
    await expect(sidebar(page)).toContainText("Nico Newcomer's Household")
    await expect(
      sidebar(page).getByRole('button', {
        name: 'Switch location (current: Home)',
      }),
    ).toBeVisible()
    await expect(cardOf(page, ITEM)).toHaveCount(0)
    const newcomer = makeGql(request, NEWCOMER)
    const { household } = await newcomer<{
      household: { id: string; role: string }
    }>(HOUSEHOLD_QUERY)
    expect(household.id).not.toBe(seed.householdId)
    expect(household.role).toBe('owner')
    const { locations } = await newcomer<{ locations: Row[] }>(LOCATIONS)
    expect(locations).toHaveLength(1)
    const { itemStocks } = await newcomer<{ itemStocks: Row[] }>(ITEM_STOCKS, {
      locationId: locations[0]?.id,
    })
    expect(itemStocks).toEqual([])

    // And the leave deleted NEWCOMER's participant role on OWNER's Home
    // (decision T11). The cleanup deletes every role row of NEWCOMER
    // (`OR: [{ userId }, …]` in apps/server/src/lib/e2eCleanup.ts), so it
    // counts the organizer row on NEWCOMER's new Home, plus any row left on
    // OWNER's Home. The page is closed first, so it makes no new request.
    for (const context of contexts.splice(0)) await context.close()
    const left = await cleanupCloudData(request, NEWCOMER)
    expect(left.deleted.households).toBe(1)
    expect(left.deleted.locationMembers).toBe(1)
  })

  test('household owner can make a member a manager, who may remove only members', async ({
    browser,
    request,
  }) => {
    // Given MANAGER and MEMBER, both household members
    const seed = await seedOwner(request)
    for (const id of [MANAGER, MEMBER])
      await joinHousehold(
        request,
        id,
        await createInvite(request, OWNER, 'member', []),
      )

    // When OWNER makes MANAGER a manager in OWNER's browser
    const ownerPage = await openAs(browser, OWNER)
    const ownerMembers = new MembersPage(ownerPage)
    await ownerMembers.navigateTo()
    await ownerMembers.setHouseholdRole(NAMES[MANAGER] ?? '', 'Manager')

    // Then the server stores the new role
    await expect
      .poll(async () => {
        const { householdMembers } = await seed.owner<{
          householdMembers: { userId: string; role: string }[]
        }>(MEMBERS)
        return householdMembers.find((p) => p.userId === MANAGER)?.role
      })
      .toBe('manager')

    // When MANAGER opens the Members page
    const managerPage = await openAs(browser, MANAGER)
    const members = new MembersPage(managerPage)
    await members.navigateTo()

    // Then MANAGER may remove MEMBER, but not OWNER, and sets no roles
    // (present first: MEMBER's Remove button)
    const main = members.main()
    await expect(
      main.getByRole('button', { name: `Remove ${NAMES[MEMBER]}` }),
    ).toBeVisible()
    await expect(members.memberRow(NAMES[OWNER] ?? '')).toContainText('Owner')
    await expect(
      main.getByRole('button', { name: `Remove ${NAMES[OWNER]}` }),
    ).toHaveCount(0)
    await expect(main.getByRole('combobox')).toHaveCount(0)

    // And MANAGER's invite form offers the member role only (O3-A)
    await members.openInvite()
    await members
      .inviteDialog()
      .getByRole('combobox', { name: 'Household role' })
      .click()
    await expect(
      managerPage.getByRole('option', { name: 'Member', exact: true }),
    ).toBeVisible()
    await expect(
      managerPage.getByRole('option', { name: 'Manager', exact: true }),
    ).toHaveCount(0)
    await managerPage.keyboard.press('Escape')
    await members.inviteDialog().getByRole('button', { name: 'Cancel' }).click()

    // And the server refuses a manager invite from MANAGER
    await expect(
      makeGql(request, MANAGER)(CREATE_INVITE_RAW, {
        householdRole: 'manager',
        locationRoles: [],
      }),
    ).rejects.toThrow(/FORBIDDEN/)
    // And the server refuses MANAGER setting a role (owner only) and
    // removing the owner (a manager removes only a `member`)
    const managerGql = makeGql(request, MANAGER)
    await expect(
      managerGql(SET_ROLE, { userId: MEMBER, role: 'manager' }),
    ).rejects.toThrow(/"code":"FORBIDDEN"/)
    await expect(managerGql(REMOVE_MEMBER, { userId: OWNER })).rejects.toThrow(
      /"code":"FORBIDDEN"/,
    )
    expect(await memberIds(seed)).toEqual([OWNER, MANAGER, MEMBER])

    // When MANAGER removes MEMBER
    await members.removeMember(NAMES[MEMBER] ?? '')

    // Then MEMBER is gone, and OWNER and MANAGER stay
    await expect.poll(() => memberIds(seed)).toEqual([OWNER, MANAGER])
  })

  /**
   * Every screen of invite, join and members, scanned with the rules of
   * `a11y.spec.ts`. A page with a Radix dialog open marks the rest of the app
   * `aria-hidden`, so an open dialog is scanned alone (location-switcher.spec.ts
   * gives the measured reason). A dialog scan allows one KNOWN defect: the
   * filled buttons fail contrast at rest (`KNOWN_FILLED_BUTTON_CONTRAST` in
   * e2e/helpers/axe.ts, which has the measured ratios).
   */
  async function scanEverything(
    browser: Browser,
    request: APIRequestContext,
    dark: boolean,
  ) {
    const seed = await seedOwner(request)
    await joinHousehold(
      request,
      MEMBER,
      await createInvite(request, OWNER, 'member', [
        { locationId: seed.home, role: 'viewer' },
      ]),
    )
    const theme = dark ? [{ name: 'theme-preference', value: 'dark' }] : []
    async function open(userId: string): Promise<Page> {
      const context = await newUserContext(browser, userId, theme)
      contexts.push(context)
      return context.newPage()
    }
    /**
     * The whole page (no selector) with every WCAG AA rule, or one open
     * dialog with the known filled-button contrast defect allowed
     * (`checkDialogA11y`, e2e/helpers/axe.ts).
     */
    async function scan(page: Page, selector?: string) {
      await injectAxe(page)
      if (selector) {
        await checkDialogA11y(page, selector)
        return
      }
      // `detailedReport` prints each failing node, so a failure names it
      await checkA11y(page, undefined, {
        ...AXE_OPTIONS,
        detailedReport: true,
        detailedReportOptions: { html: true },
      })
    }

    // The Members page of the owner, with an open invite in the list
    const ownerPage = await open(OWNER)
    const members = new MembersPage(ownerPage)
    await members.navigateTo()
    await expect(members.memberRow(NAMES[MEMBER] ?? '')).toBeVisible()
    await members.openInvite()
    await expect(
      members.inviteDialog().getByRole('combobox', { name: 'Home' }),
    ).toBeVisible()
    await scan(ownerPage, '[role="dialog"]')
    const token = await members.createLink()
    await scan(ownerPage, '[role="dialog"]')
    await members.closeInvite()
    await expect(
      members.main().getByRole('heading', { name: 'Open invites' }),
    ).toBeVisible()
    await expect(members.main().getByText('No location roles')).toBeVisible()
    await ownerPage.waitForLoadState('networkidle')
    await scan(ownerPage)
    await members.openRemove(NAMES[MEMBER] ?? '')
    await scan(ownerPage, '[role="alertdialog"]')
    await members
      .confirmDialog()
      .getByRole('button', { name: 'Cancel' })
      .click()

    // The join page, with a valid link
    const newcomerPage = await open(NEWCOMER)
    const join = new JoinPage(newcomerPage)
    await join.navigateTo(token)
    await expect(join.heading()).toHaveText(`Join ${HOUSEHOLD}`)
    await newcomerPage.waitForLoadState('networkidle')
    await scan(newcomerPage)

    // The Leave confirm, then the no-household screen and its Create dialog
    const memberPage = await open(MEMBER)
    const memberMembers = new MembersPage(memberPage)
    await memberMembers.navigateTo()
    await expect(memberMembers.memberRow(NAMES[OWNER] ?? '')).toBeVisible()
    await memberMembers.openLeave()
    await scan(memberPage, '[role="alertdialog"]')
    await memberMembers
      .confirmDialog()
      .getByRole('button', { name: 'Leave household', exact: true })
      .click()
    await memberPage.waitForURL((url) => url.pathname === '/')
    await expect(noHouseholdTitle(memberPage)).toBeVisible()
    await memberPage.waitForLoadState('networkidle')
    await scan(memberPage)
    await memberPage.getByRole('button', { name: 'Create a household' }).click()
    await expect(
      memberPage.getByRole('dialog', { name: 'Create a household' }),
    ).toBeVisible()
    await scan(memberPage, '[role="dialog"]')
  }

  test('user can use invite, join and members without accessibility violations', async ({
    browser,
    request,
  }) => {
    await scanEverything(browser, request, false)
  })

  test('user can use invite, join and members without accessibility violations in dark mode', async ({
    browser,
    request,
  }) => {
    await scanEverything(browser, request, true)
  })
})
