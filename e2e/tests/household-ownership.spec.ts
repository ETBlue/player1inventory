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
  readCloudUser,
  sendFakeUserDeleted,
} from '../helpers/cloudUsers'
import {
  connects,
  HOUSEHOLD_EVENT_KEY,
  markDocument,
  operationResponse,
  routeLiveSocket,
  stillSameDocument,
  warmUpLiveSocket,
} from '../helpers/liveSocket'
import { newUserContext } from '../helpers/userContext'
import { LocationPeoplePage } from '../pages/LocationPeoplePage'
import { MembersPage } from '../pages/MembersPage'
import { OwnershipBanner } from '../pages/OwnershipBanner'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// Ownership transfer and the hand-over of households H6b (tasks K.3 to K.7),
// on real SQL, with a browser per person where a page is the subject (task
// K.8 of docs/global/permissions/2026-11-20-households-plan-h6.md).
//
// | Test | What                                                              |
// |------|-------------------------------------------------------------------|
// | 1    | the owner transfers to MIA; MIA's open tab shows the banner with  |
// |      | no reload; MIA accepts; the owner is a manager, MIA the owner     |
// | 2    | MIA declines; the owner's tab loses the waiting row live          |
// | 3    | the owner's account is deleted; MIA (manager) gets the hand-over  |
// |      | banner with no reload, BEN (member) gets none; MIA accepts        |
// | 4    | BEN, Garage's only organizer, deletes their account: Garage shows |
// |      | No organizer, and BEN is gone from Members and Garage's people    |
// | 5    | the only live person of a household deletes their account: the   |
// |      | household is deleted with its data (a tag with a tag type, an     |
// |      | item, stock, a cart row, a log). A member whose account was       |
// |      | deleted BEFORE does not count as a person                         |
// | 6    | two managers accept the hand-over at the same moment: exactly one |
// |      | wins, the other gets OFFER_GONE (or FORBIDDEN, by timing)         |
// | 7    | owner decision O37-A: the last live person LEAVES a household     |
// |      | with no owner, and the household is deleted                       |
// | 8, 9 | axe (WCAG AA), light and dark: both banner kinds, the Members     |
// |      | page with a waiting offer, and the transfer confirm               |
//
// | Person | Household role        | Notes                                     |
// |--------|-----------------------|-------------------------------------------|
// | OWNER  | owner                 | "Home" from first sign-in                 |
// | MIA    | manager               | joins with no location role               |
// | BEN    | member                | joins with no role, creates Garage, so    |
// |        |                       | BEN is Garage's only organizer            |
// | MAX    | manager (test 6 only) |                                           |
// | OTTO   | owner of ANOTHER household, which every test checks is untouched |
// | SOLO   | test 5: alone in their household, with data                      |
// | GHOST  | tests 5 and 7: a member whose account was deleted BEFORE joining |
//
// ── GHOST: A MEMBER WHOSE ACCOUNT IS ALREADY DELETED ─────────────────────────
//
// Since K.4 a `user.deleted` event removes the person from every household,
// so no real event leaves a deleted account in a household. Accounts deleted
// before H6 deploys can still be there (the O36 step), and every "live"
// count (`deletedAt: null`) exists for them. E2E makes that state on
// purpose: GHOST's account is marked deleted while GHOST is in no household,
// and THEN GHOST joins through a real invite. The E2E server checks no
// Clerk session, so the deleted account can still send a request. (Clerk
// would refuse such a session in production.) Without GHOST, the "only
// person" counts in tests 5 and 7 would give the same answer with or
// without their `deletedAt` filter (plan K.8, *Mutation checks*).
//
// ── THE CLEANUP TRAP ─────────────────────────────────────────────────────────
//
// A household whose owner's account was deleted has NO owner row until
// someone accepts the hand-over. An owner rule alone cannot find it, so a
// test that fails half way can leave one behind.
//
// Since E2E speed plan task S.4 one cleanup call in `beforeEach` takes
// EVERY user of this file, plus the build-time user. `/e2e/cleanup` deletes
// the households a listed user owns AND the households whose members are
// all listed (lib/e2eCleanupSql.ts, decision D6, owner answer P5-A). Every
// person who can be left in such a household (MIA, BEN, MAX, GHOST) is in
// the list, so that call deletes it, whatever state the test ended in.
//
// Until task S.4 each test had to END in a state the cleanup could remove
// (an accept, a delete, or a live owner), and `rescueOrphans` ran before
// seven cleanup calls: MIA, BEN and MAX accepted any open offer, and
// GHOST's deletion was sent again. Both are gone. Proved by failure
// injection on 2026-11-22 (a `throw` right after the owner's account is
// deleted in test 3, and in test 7): the next test passed, and its one
// cleanup call reported 2 households deleted (the one with no owner, and
// OTTO's). With the D6 rule removed it reported 1: the household with no
// owner stayed behind, and the next test passed anyway. So a green next
// test does not prove the cleanup; the count does.
//
// ── TRAPS ────────────────────────────────────────────────────────────────────
//
// - A change made through `makeGql` or the E2E `user.deleted` route sends no
//   `x-client-id`, so the server sends its event to EVERY open tab.
// - A tab's FIRST socket connect refetches nothing, so a tab that only
//   loaded the page can miss an event sent before its subscription is
//   registered. Every tab whose live update a test checks (tests 1, 2 and
//   3) is opened with `openLive`, and that tab is checked with
//   `stillSameDocument` after the update shows.
// - The warm-up's own event (`CATALOG`) refetches `MyOwnershipOffers` and
//   `GetHousehold` (households H6b task K.5) in EVERY open tab. `openLive`
//   waits for those refetches in this tab and in the tabs already open, so
//   none is in flight when the change under test commits.
// - An absence can be satisfied by the loading state. Every "not there"
//   check below comes after a check that the page or the server answered.
//
// ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
//
// - `Household.ownerGoneAt`. No GraphQL field and no E2E route reads it.
//   Test 3 checks `hasOwner`, which reads `ownerId` only.
// - That the two accepts of test 6 overlapped inside Postgres, on every
//   run. They are sent together. When the loser's first read comes BEFORE
//   the winner's commit, it waits at the lock and gets OFFER_GONE; when it
//   comes AFTER, it gets FORBIDDEN. Both are correct, so the test accepts
//   both and records which one ran (annotation `loser answer`). Only an
//   OFFER_GONE run exercises the lock, so mutation M2 can go red only on
//   such a run. Until the K.8 review it asserted OFFER_GONE alone, which
//   would fail correct code on a FORBIDDEN run.
// - That `countedOrganizerIn`'s `deletedAt` filter matters on real SQL.
//   Test 4 stays green without it, because the hand-over already removed
//   BEN's role rows (a negative control, plan K.8). K.2's unit test is the
//   proof.
// - The production socket and Clerk. The E2E client sends `e2eUserId`.

const OWNER = `${E2E_SECOND_USER_ID}-own-owner`
const MIA = `${E2E_SECOND_USER_ID}-own-mia`
const BEN = `${E2E_SECOND_USER_ID}-own-ben`
const MAX = `${E2E_SECOND_USER_ID}-own-max`
const OTTO = `${E2E_SECOND_USER_ID}-own-otto`
const SOLO = `${E2E_SECOND_USER_ID}-own-solo`
const GHOST = `${E2E_SECOND_USER_ID}-own-ghost`

const OWNER_NAME = 'Orla Owner'
const MIA_NAME = 'Mia Manager'
const BEN_NAME = 'Ben Member'
const MAX_NAME = 'Max Manager'
const OTTO_NAME = 'Otto Other'
const SOLO_NAME = 'Sara Solo'
const GHOST_NAME = 'Gus Ghost'
const OTTO_ITEM = 'Otto Rice'

/** Every spec user. One cleanup call takes them all (see *The cleanup trap*). */
const ALL_USERS = [GHOST, BEN, MAX, MIA, OWNER, SOLO, OTTO]

type Gql = ReturnType<typeof makeGql>
type Row = { id: string }
type Person = { userId: string; role: string }
type Offer = { id: string; kind: string; householdId: string }

const LOCATIONS = `query { locations { id name } }`
const HOUSEHOLD = `query {
  household { id name role hasOwner pendingTransfer { toUserId } }
}`
const MEMBERS = `query { householdMembers { userId role } }`
const HOUSEHOLD_LOCATIONS = `query { householdLocations { id name hasOrganizer } }`
const ITEMS = `query { items { name } }`
const CREATE_LOCATION = `mutation ($name: String!) { createLocation(name: $name) { id } }`
const CREATE_TAG_TYPE = `mutation ($name: String!, $color: String!) {
  createTagType(name: $name, color: $color) { id }
}`
const CREATE_TAG = `mutation ($name: String!, $typeId: String!) {
  createTag(name: $name, typeId: $typeId) { id }
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
const ADD_LOG = `mutation ($itemId: ID!, $locationId: ID!, $occurredAt: String!) {
  addInventoryLog(
    itemId: $itemId
    locationId: $locationId
    delta: 2
    quantity: 2
    occurredAt: $occurredAt
  ) { id }
}`
const MY_OFFERS = `query { myOwnershipOffers { id kind householdId } }`
const OFFER = `mutation ($userId: ID!) { offerOwnership(userId: $userId) { id } }`
const ACCEPT = `mutation ($id: ID!) { acceptOwnershipOffer(id: $id) { id role } }`

type Household = {
  id: string
  name: string
  role: string
  hasOwner: boolean
  pendingTransfer: { toUserId: string } | null
}

type Seed = {
  owner: Gql
  home: string
  garage: string | undefined
  household: Household
}

/**
 * OWNER's household. MIA joins as a manager, BEN as a member who then makes
 * Garage (so BEN is its only organizer), MAX as a second manager when asked.
 * Every person is named BEFORE their first request, so the pages show real
 * names, and joins before any other request, so nobody has a household of
 * their own.
 */
async function seedHousehold(
  request: APIRequestContext,
  options: { ben?: boolean; max?: boolean } = {},
): Promise<Seed> {
  const { ben = true, max = false } = options
  await createCloudUser(request, OWNER, OWNER_NAME)
  await createCloudUser(request, MIA, MIA_NAME)
  if (ben) await createCloudUser(request, BEN, BEN_NAME)
  if (max) await createCloudUser(request, MAX, MAX_NAME)
  const owner = makeGql(request, OWNER)
  // OWNER's first request: first sign-in makes the household and "Home".
  const home = (await owner<{ locations: Row[] }>(LOCATIONS)).locations[0]?.id
  if (!home) throw new Error('no Home after first sign-in')

  await joinHousehold(
    request,
    MIA,
    await createInvite(request, OWNER, 'manager', []),
  )
  if (max) {
    await joinHousehold(
      request,
      MAX,
      await createInvite(request, OWNER, 'manager', []),
    )
  }
  let garage: string | undefined
  if (ben) {
    await joinHousehold(
      request,
      BEN,
      await createInvite(request, OWNER, 'member', []),
    )
    // A member may create a location (owner decision O4-A), and the
    // creator is its organizer. OWNER has No access there.
    garage = (
      await makeGql(request, BEN)<{ createLocation: Row }>(CREATE_LOCATION, {
        name: 'Garage',
      })
    ).createLocation.id
  }
  const { household } = await owner<{ household: Household }>(HOUSEHOLD)
  return { owner, home, garage, household }
}

/**
 * GHOST: a member of the household `inviterId` acts in, whose account was
 * deleted BEFORE the join. See *GHOST* at the top.
 */
async function addDeletedMember(request: APIRequestContext, inviterId: string) {
  await createCloudUser(request, GHOST, GHOST_NAME)
  await sendFakeUserDeleted(request, GHOST)
  await joinHousehold(
    request,
    GHOST,
    await createInvite(request, inviterId, 'member', []),
  )
  const row = await readCloudUser(request, GHOST)
  expect(row?.deletedAt).not.toBeNull()
  return row
}

/** OTTO's household, which no test may change. One item in it. */
async function seedOtherHousehold(request: APIRequestContext): Promise<Gql> {
  await createCloudUser(request, OTTO, OTTO_NAME)
  const otto = makeGql(request, OTTO)
  await otto(CREATE_ITEM, { input: { name: OTTO_ITEM } })
  return otto
}

async function expectOtherHouseholdUntouched(otto: Gql) {
  const { household } = await otto<{ household: Household }>(HOUSEHOLD)
  expect(household.role).toBe('owner')
  expect(household.hasOwner).toBe(true)
  const { householdMembers } = await otto<{ householdMembers: Person[] }>(
    MEMBERS,
  )
  expect(householdMembers).toEqual([{ userId: OTTO, role: 'owner' }])
  const { items } = await otto<{ items: { name: string }[] }>(ITEMS)
  expect(items).toEqual([{ name: OTTO_ITEM }])
}

/** The household roles, by user id, as `who` reads them. */
async function rolesOf(who: Gql): Promise<Record<string, string>> {
  const { householdMembers } = await who<{ householdMembers: Person[] }>(
    MEMBERS,
  )
  return Object.fromEntries(householdMembers.map((p) => [p.userId, p.role]))
}

async function offersOf(request: APIRequestContext, userId: string) {
  const { myOwnershipOffers } = await makeGql(
    request,
    userId,
  )<{
    myOwnershipOffers: Offer[]
  }>(MY_OFFERS)
  return myOwnershipOffers
}

/**
 * Every spec user, and the build-time user, in ONE cleanup call (E2E speed
 * plan, task S.4). See *The cleanup trap* at the top. The build-time user is
 * in the list because, if the `e2e-user-id` override ever stops working,
 * every context writes as it (shared-household.spec.ts).
 */
async function cleanupAll(request: APIRequestContext) {
  await cleanupCloudData(request, [...ALL_USERS, E2E_USER_ID])
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
  return context.newPage()
}

/** A tab and the `CATALOG` queries it has mounted (`liveUpdates.ts`). */
type LiveTab = { page: Page; operations: string[] }

/** The `CATALOG` queries the banner reads. It is mounted on every page. */
const BANNER_QUERIES = ['MyOwnershipOffers']
/** The `CATALOG` queries of the Members page: the banner, and the
 * household's `hasOwner` and `pendingTransfer` (`useHousehold`). */
const MEMBERS_QUERIES = ['MyOwnershipOffers', 'GetHousehold']
const MEMBERS_PATH = '/settings/household/members'

/**
 * Open `path` as `userId` with the live socket warmed up, so the next event
 * is heard. The FIRST connect of a tab refetches nothing
 * (`apps/web/src/apollo/liveUpdates.ts`), so an event sent before the
 * subscription is registered is lost for good, and a tab that only loaded
 * the page could miss the change under test.
 *
 * The warm-up's own `CATALOG` event refetches this tab's `operations`, and
 * the event reaches every tab already open too. The warm-up waits for ALL
 * of those refetches (this tab's, and each `others` tab's), so none of them
 * can still be in flight when the change under test commits and show it
 * without a live event.
 */
async function openLive(
  browser: Browser,
  userId: string,
  owner: Gql,
  options: { path?: string; operations?: string[]; others?: LiveTab[] } = {},
): Promise<Page> {
  const { path = '/', operations = BANNER_QUERIES, others = [] } = options
  const page = await openAs(browser, userId)
  const socket = await routeLiveSocket(page)
  await page.goto(path)
  await expect.poll(() => connects(page), { timeout: 15_000 }).toBe(1)
  const tabs: LiveTab[] = [{ page, operations }, ...others]
  await warmUpLiveSocket(socket, {
    key: HOUSEHOLD_EVENT_KEY,
    change: (attempt) =>
      owner(CREATE_TAG_TYPE, {
        name: `Ownership Warm-up ${userId} ${attempt}`,
        color: 'blue',
      }),
    refetch: () =>
      Promise.all(
        tabs.flatMap((tab) =>
          tab.operations.map((name) =>
            operationResponse(tab.page, name, 10_000),
          ),
        ),
      ),
  })
  await markDocument(page)
  return page
}

/** The page shows dark mode, or light mode. A scan of the wrong one
 * would prove nothing about the other. */
async function expectTheme(page: Page, dark: boolean) {
  const html = page.locator('html')
  if (dark) await expect(html).toHaveClass(/(^|\s)dark(\s|$)/)
  else await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/)
}

/** A row of Settings › Locations, found by the location's name. */
function locationListRow(page: Page, name: string) {
  return page.getByRole('main').getByRole('listitem').filter({ hasText: name })
}

/** "You are not in any household." (`noHousehold.title`). */
function noHousehold(page: Page) {
  return page.getByText('You are not in any household.', { exact: true })
}

test.beforeEach(async ({ request, baseURL }) => {
  test.skip(baseURL !== CLOUD_WEB_URL, 'cloud mode only')
  await cleanupAll(request)
})

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close()
})

test.describe('household ownership', () => {
  test('household owner can transfer the household, and the other person accepts', async ({
    browser,
    request,
  }) => {
    test.setTimeout(90_000)
    // Given the owner has the Members page open, and MIA, a manager, has
    // the app open; both tabs' sockets work
    const seed = await seedHousehold(request, { ben: false })
    const otto = await seedOtherHousehold(request)
    const ownerPage = await openLive(browser, OWNER, seed.owner, {
      path: MEMBERS_PATH,
      operations: MEMBERS_QUERIES,
    })
    const miaPage = await openLive(browser, MIA, seed.owner, {
      others: [{ page: ownerPage, operations: MEMBERS_QUERIES }],
    })
    const banner = new OwnershipBanner(miaPage)
    await expect(banner.region()).toHaveCount(0)

    // When the owner transfers the household to MIA on the Members page
    const members = new MembersPage(ownerPage)
    await members.transferTo(MIA_NAME)
    await expect(members.waitingNote(MIA_NAME)).toBeVisible()

    // Then MIA's open tab shows the offer, with no reload
    await expect(
      banner.transferText(OWNER_NAME, seed.household.name),
    ).toBeVisible({ timeout: 15_000 })
    await stillSameDocument(miaPage)

    // When MIA accepts
    await banner.accept()
    await expect(banner.acceptedNotice(seed.household.name)).toBeVisible()

    // Then MIA is the owner and the old owner is a manager
    await expect
      .poll(() => rolesOf(seed.owner))
      .toEqual({ [OWNER]: 'manager', [MIA]: 'owner' })
    // And the old owner's Members page shows it, with no reload
    await expect(members.memberRow(MIA_NAME)).toContainText('Owner', {
      timeout: 15_000,
    })
    await expect(members.memberRow(OWNER_NAME)).toContainText('Manager')
    await expect(members.waitingNote(MIA_NAME)).toHaveCount(0)
    await stillSameDocument(ownerPage)
    await expectOtherHouseholdUntouched(otto)
  })

  test('user can decline a transfer', async ({ browser, request }) => {
    test.setTimeout(60_000)
    // Given the owner offered the household to MIA, and the owner's Members
    // page shows the waiting offer
    const seed = await seedHousehold(request, { ben: false })
    const otto = await seedOtherHousehold(request)
    await seed.owner(OFFER, { userId: MIA })
    const ownerPage = await openLive(browser, OWNER, seed.owner, {
      path: MEMBERS_PATH,
      operations: MEMBERS_QUERIES,
    })
    const members = new MembersPage(ownerPage)
    await expect(members.waitingNote(MIA_NAME)).toBeVisible()
    await expect(members.transferButton(MIA_NAME)).toHaveCount(0)

    // When MIA declines from the banner
    const miaPage = await openAs(browser, MIA)
    await miaPage.goto('/')
    const banner = new OwnershipBanner(miaPage)
    await expect(
      banner.transferText(OWNER_NAME, seed.household.name),
    ).toBeVisible()
    await banner.decline()

    // Then the offer is gone, and the owner is still the owner
    await expect.poll(() => offersOf(request, MIA)).toEqual([])
    const { household } = await seed.owner<{ household: Household }>(HOUSEHOLD)
    expect(household.pendingTransfer).toBeNull()
    expect(await rolesOf(seed.owner)).toEqual({
      [OWNER]: 'owner',
      [MIA]: 'manager',
    })
    // And the owner's tab offers Transfer again, with no waiting row
    await expect(members.transferButton(MIA_NAME)).toBeVisible({
      timeout: 15_000,
    })
    await expect(members.waitingNote(MIA_NAME)).toHaveCount(0)
    await stillSameDocument(ownerPage)
    // And MIA's banner is gone too
    await expect(banner.region()).toHaveCount(0)
    await expectOtherHouseholdUntouched(otto)
  })

  test("manager becomes the owner after the owner's account is deleted", async ({
    browser,
    request,
  }) => {
    test.setTimeout(90_000)
    // Given BEN (member) has the Members page open, and MIA (manager) has
    // the app open; both tabs' sockets work
    const seed = await seedHousehold(request)
    const otto = await seedOtherHousehold(request)
    const benPage = await openLive(browser, BEN, seed.owner, {
      path: MEMBERS_PATH,
      operations: MEMBERS_QUERIES,
    })
    const benMembers = new MembersPage(benPage)
    await expect(benMembers.memberRow(OWNER_NAME)).toBeVisible()
    const miaPage = await openLive(browser, MIA, seed.owner, {
      others: [{ page: benPage, operations: MEMBERS_QUERIES }],
    })
    const miaBanner = new OwnershipBanner(miaPage)
    await expect(miaBanner.region()).toHaveCount(0)

    // When the owner's account is deleted
    await sendFakeUserDeleted(request, OWNER)

    // Then MIA's tab shows the hand-over offer, with no reload
    await expect(miaBanner.handoverText(seed.household.name)).toBeVisible({
      timeout: 15_000,
    })
    await stillSameDocument(miaPage)
    // And BEN's Members page says there is no owner, and the owner is gone
    await expect(benMembers.noOwnerNote()).toBeVisible({ timeout: 15_000 })
    await stillSameDocument(benPage)
    await expect(benMembers.memberRow(MIA_NAME)).toBeVisible()
    await expect(benMembers.memberRow(OWNER_NAME)).toHaveCount(0)
    // And BEN, a member, gets no offer: the table offers managers first
    await expect(new OwnershipBanner(benPage).region()).toHaveCount(0)
    expect(await offersOf(request, BEN)).toEqual([])

    // When MIA accepts
    await miaBanner.accept()
    await expect(miaBanner.acceptedNotice(seed.household.name)).toBeVisible()

    // Then MIA owns the household, and it has an owner again
    const mia = makeGql(request, MIA)
    await expect
      .poll(
        async () => (await mia<{ household: Household }>(HOUSEHOLD)).household,
      )
      .toMatchObject({ id: seed.household.id, role: 'owner', hasOwner: true })
    expect(await rolesOf(mia)).toEqual({ [MIA]: 'owner', [BEN]: 'member' })
    // And BEN's page no longer says there is no owner
    await expect(benMembers.memberRow(MIA_NAME)).toContainText('Owner', {
      timeout: 15_000,
    })
    await expect(benMembers.noOwnerNote()).toHaveCount(0)
    await expectOtherHouseholdUntouched(otto)
  })

  test('a deleted organizer no longer counts', async ({ browser, request }) => {
    test.setTimeout(90_000)
    // Given BEN, a member, is Garage's only organizer
    const seed = await seedHousehold(request)
    const otto = await seedOtherHousehold(request)
    const garage = seed.garage
    if (!garage) throw new Error('no Garage')
    type Loc = { id: string; hasOrganizer: boolean }
    const garageRow = async () =>
      (
        await seed.owner<{ householdLocations: Loc[] }>(HOUSEHOLD_LOCATIONS)
      ).householdLocations.find((l) => l.id === garage)
    expect(await garageRow()).toMatchObject({ hasOrganizer: true })

    // When BEN's account is deleted
    await sendFakeUserDeleted(request, BEN)

    // Then Garage has no organizer
    expect(await garageRow()).toMatchObject({ hasOrganizer: false })
    const page = await openAs(browser, OWNER)
    await page.goto('/settings/household/locations')
    await expect(locationListRow(page, 'Garage')).toContainText('No organizer')

    // And BEN is gone from the Members page
    const members = new MembersPage(page)
    await members.navigateTo()
    await expect(members.memberRow(MIA_NAME)).toBeVisible()
    await expect(members.memberRow(BEN_NAME)).toHaveCount(0)

    // And from Garage's people page, which now lists nobody
    const people = new LocationPeoplePage(page)
    await people.navigateTo(garage)
    await expect(
      people.main().getByText('Nobody has a role here yet.', { exact: true }),
    ).toBeVisible()
    await expect(people.personRow(BEN_NAME)).toHaveCount(0)
    // The owner still owns the household: BEN was a member
    expect(await rolesOf(seed.owner)).toEqual({
      [OWNER]: 'owner',
      [MIA]: 'manager',
    })
    await expectOtherHouseholdUntouched(otto)
  })

  test('the household of a deleted only person is deleted with its data', async ({
    request,
  }) => {
    // Measured 42.1 s alone, hooks included (K.8): over the 30 s default.
    test.setTimeout(90_000)
    // Given SOLO is the only LIVE person of their household, which holds a
    // tag WITH a tag type, an item, stock, a cart row and a log. GHOST is a
    // member too, but GHOST's account was deleted before (see *GHOST*).
    await createCloudUser(request, SOLO, SOLO_NAME)
    const solo = makeGql(request, SOLO)
    const home = (await solo<{ locations: Row[] }>(LOCATIONS)).locations[0]?.id
    if (!home) throw new Error('no Home after first sign-in')
    // `Tag.type` is NoAction, so the delete must remove tags before tag
    // types (`deleteHouseholdData`, decision T64). On real SQL the wrong
    // order fails the whole transaction, and the route answers 500.
    const typeId = (
      await solo<{ createTagType: Row }>(CREATE_TAG_TYPE, {
        name: 'Solo Category',
        color: 'orange',
      })
    ).createTagType.id
    const tagId = (
      await solo<{ createTag: Row }>(CREATE_TAG, { name: 'Solo Grain', typeId })
    ).createTag.id
    const itemId = (
      await solo<{ createItem: Row }>(CREATE_ITEM, {
        input: { name: 'Solo Rice', tagIds: [tagId] },
      })
    ).createItem.id
    await solo(UPSERT_STOCK, {
      itemId,
      locationId: home,
      input: { packedQuantity: 2, targetQuantity: 5, refillThreshold: 1 },
    })
    const { vendorCart } = await solo<{ vendorCart: Row }>(VENDOR_CART, {
      vendorId: null,
      locationId: home,
    })
    await solo(ADD_TO_CART, { cartId: vendorCart.id, itemId, quantity: 1 })
    await solo(ADD_LOG, {
      itemId,
      locationId: home,
      occurredAt: new Date().toISOString(),
    })
    const { household } = await solo<{ household: Household }>(HOUSEHOLD)
    // GHOST's join made SOLO's household GHOST's active one
    const ghost = await addDeletedMember(request, SOLO)
    expect(ghost?.activeHouseholdId).toBe(household.id)
    const otto = await seedOtherHousehold(request)

    // When SOLO's account is deleted
    await sendFakeUserDeleted(request, SOLO)

    // Then the household row is gone: `User.activeHouseholdId` is
    // `onDelete: SetNull`, and nothing else clears GHOST's. A household that
    // was only handed over (the wrong answer) would keep it. The household
    // row cannot go while a row that points at it stays, so its data went
    // with it.
    expect((await readCloudUser(request, GHOST))?.activeHouseholdId).toBeNull()
    // And GHOST's member row went with the household
    const { deleted } = await cleanupCloudData(request, GHOST)
    expect(deleted.householdMembers).toBe(0)
    // And the other household is untouched
    await expectOtherHouseholdUntouched(otto)
  })

  test('two people accept a hand-over at once', async ({ request }) => {
    test.setTimeout(60_000)
    // Given the owner's account was deleted, and MIA and MAX, both
    // managers, each have a hand-over offer
    const seed = await seedHousehold(request, { ben: false, max: true })
    const otto = await seedOtherHousehold(request)
    await sendFakeUserDeleted(request, OWNER)
    const [miaOffer] = await offersOf(request, MIA)
    const [maxOffer] = await offersOf(request, MAX)
    expect(miaOffer).toMatchObject({ kind: 'handover' })
    expect(maxOffer).toMatchObject({ kind: 'handover' })
    if (!miaOffer || !maxOffer) throw new Error('no hand-over offers')

    // When both accept at the same moment
    const results = await Promise.allSettled([
      makeGql(request, MIA)(ACCEPT, { id: miaOffer.id }),
      makeGql(request, MAX)(ACCEPT, { id: maxOffer.id }),
    ])

    // Then exactly one wins, and the other is refused with one of the two
    // answers for "the offer is gone" (see the note below)
    const won = results.flatMap((r, i) =>
      r.status === 'fulfilled' ? [i === 0 ? MIA : MAX] : [],
    )
    const lost = results.flatMap((r) =>
      r.status === 'rejected' ? [String(r.reason)] : [],
    )
    expect(won).toHaveLength(1)
    expect(lost).toHaveLength(1)
    // Which answer the loser gets depends on timing, not on the code:
    //
    // | The loser's first read (`householdOfMyOffer`, outside the lock) | Answer       |
    // |------------------------------------------------------------------|--------------|
    // | before the winner's commit: it then waits for the lock, and its  | OFFER_GONE   |
    // | read after the lock finds the offer gone                         |              |
    // | after the winner's commit: the offer is already gone             | FORBIDDEN    |
    //
    // Both are correct, so the test accepts both. Any OTHER answer fails it:
    // a P2002 from two owner rows, a deadlock, or an internal error. The
    // annotation says which path ran. Only OFFER_GONE shows that the two
    // accepts met at the lock; a FORBIDDEN run proves one owner, not the lock.
    const loserAnswer = lost[0]?.includes('"reason":"OFFER_GONE"')
      ? 'OFFER_GONE'
      : lost[0]?.includes('"code":"FORBIDDEN"')
        ? 'FORBIDDEN'
        : 'other'
    test
      .info()
      .annotations.push(
        { type: 'race winner', description: won.join() },
        { type: 'loser answer', description: loserAnswer },
      )
    expect(loserAnswer, lost[0]).not.toBe('other')
    if (loserAnswer === 'OFFER_GONE') {
      expect(lost[0]).toContain('"code":"BAD_USER_INPUT"')
    }
    // And the household has one owner, the winner
    const winner = won[0] === MIA ? MIA : MAX
    const loser = winner === MIA ? MAX : MIA
    expect(await rolesOf(makeGql(request, winner))).toEqual({
      [winner]: 'owner',
      [loser]: 'manager',
    })
    expect(await offersOf(request, loser)).toEqual([])
    const { household } = await makeGql(
      request,
      winner,
    )<{
      household: Household
    }>(HOUSEHOLD)
    expect(household).toMatchObject({ id: seed.household.id, hasOwner: true })
    await expectOtherHouseholdUntouched(otto)
  })

  test('the last person who leaves a household with no owner deletes it', async ({
    browser,
    request,
  }) => {
    test.setTimeout(90_000)
    // Given the owner's account was deleted, MIA is the only LIVE person
    // left (GHOST's account was deleted before), and MIA has the offer
    const seed = await seedHousehold(request, { ben: false })
    await addDeletedMember(request, OWNER)
    const otto = await seedOtherHousehold(request)
    await sendFakeUserDeleted(request, OWNER)
    expect((await readCloudUser(request, MIA))?.activeHouseholdId).toBe(
      seed.household.id,
    )

    // When MIA leaves from the Members page
    const page = await openAs(browser, MIA)
    const members = new MembersPage(page)
    await members.navigateTo()
    await expect(members.noOwnerNote()).toBeVisible()
    await expect(members.becomeOwnerButton()).toBeVisible()
    await members.openLeave()
    // Then the confirm warns that the household will be deleted (O37-A)
    await expect(members.confirmDialog()).toContainText(
      'You are the last person here. Leaving deletes the household and everything in it.',
    )
    await members
      .confirmDialog()
      .getByRole('button', { name: 'Leave household', exact: true })
      .click()
    await page.waitForURL((url) => url.pathname === '/')

    // And MIA is in no household
    await expect(noHousehold(page)).toBeVisible({ timeout: 15_000 })
    // And the household was DELETED, not just left. A leave writes no `User`
    // row (decision T16), so MIA's `activeHouseholdId` still names a
    // household MIA only left. Only the delete branch clears it.
    expect((await readCloudUser(request, MIA))?.activeHouseholdId).toBeNull()
    expect((await readCloudUser(request, GHOST))?.activeHouseholdId).toBeNull()
    await expectOtherHouseholdUntouched(otto)
  })

  /**
   * Both banner kinds, the Members page with a waiting offer, and the
   * transfer confirm, scanned with the rules of `a11y.spec.ts`
   * (`e2e/helpers/axe.ts`). That file runs in `local` and `pwa` only, where
   * these cloud pages redirect, so the scans live here. An open dialog is
   * scanned alone, with the known filled-button contrast defect allowed
   * (`checkDialogA11y`). It ends with the household still offered to MIA,
   * with no owner; the next `beforeEach` deletes it (see *The cleanup trap*).
   */
  async function scanEverything(
    browser: Browser,
    request: APIRequestContext,
    dark: boolean,
  ) {
    const seed = await seedHousehold(request)
    const theme = dark ? [{ name: 'theme-preference', value: 'dark' }] : []
    async function scan(page: Page, selector?: string) {
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

    // The transfer confirm, then the Members page with the waiting offer
    const ownerPage = await openAs(browser, OWNER, theme)
    const members = new MembersPage(ownerPage)
    await members.navigateTo()
    await expect(members.transferButton(MIA_NAME)).toBeVisible()
    await expectTheme(ownerPage, dark)
    await members.openTransfer(MIA_NAME)
    await scan(ownerPage, '[role="alertdialog"]')
    await members.confirmTransfer()
    await expect(members.waitingNote(MIA_NAME)).toBeVisible()
    await scan(ownerPage)

    // The banner with a transfer offer, on MIA's Members page
    const miaPage = await openAs(browser, MIA, theme)
    const miaMembers = new MembersPage(miaPage)
    await miaMembers.navigateTo()
    const banner = new OwnershipBanner(miaPage)
    await expect(
      banner.transferText(OWNER_NAME, seed.household.name),
    ).toBeVisible()
    await expect(miaMembers.becomeOwnerButton()).toBeVisible()
    await expectTheme(miaPage, dark)
    await scan(miaPage)

    // The banner with a hand-over offer, and "no owner" on the page
    await sendFakeUserDeleted(request, OWNER)
    await miaPage.reload()
    await expect(banner.handoverText(seed.household.name)).toBeVisible()
    await expect(miaMembers.noOwnerNote()).toBeVisible()
    await scan(miaPage)
  }

  test('user can use the ownership banner and transfer without accessibility violations', async ({
    browser,
    request,
  }) => {
    test.setTimeout(90_000)
    await scanEverything(browser, request, false)
  })

  test('user can use the ownership banner and transfer without accessibility violations in dark mode', async ({
    browser,
    request,
  }) => {
    test.setTimeout(90_000)
    await scanEverything(browser, request, true)
  })
})
