import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { checkA11y, injectAxe } from 'axe-playwright'
import {
  CLOUD_GRAPHQL_URL,
  CLOUD_WEB_URL,
  E2E_SECOND_USER_ID,
} from '../constants'
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
import { LocationPeoplePage } from '../pages/LocationPeoplePage'
import { MembersPage } from '../pages/MembersPage'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// The people page of one location, on real SQL, with a browser per person
// (households H5c task H.8). These are the first real-SQL runs of
// `locationPeople`, `setLocationRole`, `removeLocationRole` and
// `leaveLocation` (all four in apps/server/src/resolvers/location.resolver.ts),
// and of their household-level `LOCATION` event.
//
// | Test | What                                                      | Review Focus |
// |------|-----------------------------------------------------------|--------------|
// | 1    | an owner gives a member with no location role a role; the | —            |
// |      | member's empty screen turns into the pantry, no reload    |              |
// | 2    | an organizer gives participant and viewer only; no control| 1            |
// |      | on an organizer row; the server refuses a forged organizer|              |
// | 3    | a member loses the role on the active location: the tab   | 2            |
// |      | moves, one toast, no old rows; then the empty screen      |              |
// | 4    | the only organizer leaves; "No organizer"; the owner gives| 5            |
// |      | themselves the role                                       |              |
// | 5    | an owner leaves their active location and stays on its    | 2            |
// |      | page; the tab moves through the leave's own read          |              |
// | 6    | an owner with No access sees the people, and no request   | 4            |
// |      | of the page names the location except `LocationPeople`    |              |
// | 7    | a role write at the same moment as a removal leaves no    | 3            |
// |      | role row behind (read back through a rejoin). No browser  |              |
// | 8, 9 | axe (WCAG AA), light and dark: the Members page mark, the | —            |
// |      | name links on Settings › Locations, the people page with  |              |
// |      | No organizer, Add person, the Remove and Leave confirms   |              |
//
// | Person | Household role | Home (OWNER's first sign-in) | Garage (made by CLEO) |
// |--------|----------------|------------------------------|-----------------------|
// | OWNER  | owner          | organizer                    | none ("No access")    |
// | CLEO   | member         | none                         | organizer (the only)  |
// | BEN    | member         | none                         | none                  |
//
// BEN and CLEO join with `createInvite(…, [])` + `joinHousehold` (plan
// decision T44), so neither has a location role from the join. Each test
// then gives the roles it needs. People Rice is stocked at Home, People
// Nails at Garage, so a pantry shows which location it is on.
//
// ── TRAPS ────────────────────────────────────────────────────────────────────
//
// - A change made through `makeGql` sends no `x-client-id`, so the server
//   sends its event to EVERY open tab, the acting person's too.
// - Cleanup order: BEN and CLEO first, OWNER last. OWNER's cleanup deletes
//   the household (household-invites.spec.ts, the same rule).
// - A forged write and a page check are different proofs. Test 2 checks
//   both: the page hides the organizer choice, and the server refuses it.
//
// ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
//
// - That the two writes of test 7 really overlapped in Postgres. They are
//   sent together, but the run has one worker and the order inside the
//   server is not controlled. The unit tests of task H.3 prove the lock
//   order. This test proves only the end state: no role row is left. It
//   adds a `race order` annotation that says which write went first.
// - The H18 filter of `locationPeople` with a person who is NOT a member and
//   still holds a role row, on its own. No real write leaves such a row:
//   `removeMember`, `leaveHousehold` and the E2E cleanup all delete the
//   person's role rows. Test 7 still goes red on the filter, but only when
//   `removeMember`'s delete is ALSO removed (e2e/CLAUDE.md, the mutation
//   table).
// - The production socket and Clerk. The E2E client sends `e2eUserId`.

const OWNER = `${E2E_SECOND_USER_ID}-people-owner`
const CLEO = `${E2E_SECOND_USER_ID}-people-cleo`
const BEN = `${E2E_SECOND_USER_ID}-people-ben`

const NAMES = {
  [OWNER]: 'Olga Owner',
  [CLEO]: 'Cleo Keeper',
  [BEN]: 'Ben Basic',
} as const
const OWNER_NAME = NAMES[OWNER]
const CLEO_NAME = NAMES[CLEO]
const BEN_NAME = NAMES[BEN]
const RICE = 'People Rice'
const NAILS = 'People Nails'

type Gql = ReturnType<typeof makeGql>
type Row = { id: string }
type Person = { userId: string; role: string }

const LOCATIONS = `query { locations { id name myRole } }`
const HOUSEHOLD_LOCATIONS = `query { householdLocations { id myRole hasOrganizer } }`
const MEMBERS = `query { householdMembers { userId } }`
const CREATE_LOCATION = `mutation ($name: String!) { createLocation(name: $name) { id } }`
const CREATE_ITEM = `mutation ($input: CreateItemInput!) { createItem(input: $input) { id } }`
const CREATE_TAG_TYPE = `mutation ($name: String!, $color: String!) {
  createTagType(name: $name, color: $color) { id }
}`
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
const ITEM_STOCKS = `query ($locationId: ID!) { itemStocks(locationId: $locationId) { itemId } }`
const LOCATION_PEOPLE = `query ($locationId: ID!) {
  locationPeople(locationId: $locationId) { userId role }
}`
const SET_LOCATION_ROLE = `mutation ($locationId: ID!, $userId: ID!, $role: LocationRole!) {
  setLocationRole(locationId: $locationId, userId: $userId, role: $role) { userId role }
}`
const REMOVE_LOCATION_ROLE = `mutation ($locationId: ID!, $userId: ID!) {
  removeLocationRole(locationId: $locationId, userId: $userId)
}`
const LEAVE_LOCATION = `mutation ($locationId: ID!) { leaveLocation(locationId: $locationId) }`
const REMOVE_MEMBER = `mutation ($userId: ID!) { removeMember(userId: $userId) }`

const FORBIDDEN = /"code":"FORBIDDEN"/

type Seed = {
  owner: Gql
  cleo: Gql
  home: string
  garage: string
  rice: string
  nails: string
}

/**
 * The household of the table at the top. Every person is named BEFORE their
 * first request, so the pages show real names.
 */
async function seedHousehold(request: APIRequestContext): Promise<Seed> {
  for (const [id, name] of Object.entries(NAMES))
    await createCloudUser(request, id, name)
  const owner = makeGql(request, OWNER)
  // OWNER's first request: first sign-in makes the household and "Home".
  const { locations } = await owner<{ locations: Row[] }>(LOCATIONS)
  const home = locations[0]?.id
  if (!home) throw new Error('no Home after first sign-in')

  // CLEO joins with no location role, then makes Garage, and so is its
  // only organizer (a member may create a location, owner decision O4-A).
  await joinHousehold(
    request,
    CLEO,
    await createInvite(request, OWNER, 'member', []),
  )
  const cleo = makeGql(request, CLEO)
  const garage = (
    await cleo<{ createLocation: Row }>(CREATE_LOCATION, { name: 'Garage' })
  ).createLocation.id

  // BEN joins with no location role at all (owner decision O14-A).
  await joinHousehold(
    request,
    BEN,
    await createInvite(request, OWNER, 'member', []),
  )

  const rice = (
    await owner<{ createItem: Row }>(CREATE_ITEM, { input: { name: RICE } })
  ).createItem.id
  const nails = (
    await owner<{ createItem: Row }>(CREATE_ITEM, { input: { name: NAILS } })
  ).createItem.id
  const input = { packedQuantity: 2, targetQuantity: 5, refillThreshold: 1 }
  await owner(UPSERT_STOCK, { itemId: rice, locationId: home, input })
  await cleo(UPSERT_STOCK, { itemId: nails, locationId: garage, input })
  return { owner, cleo, home, garage, rice, nails }
}

function setRole(gql: Gql, locationId: string, userId: string, role: string) {
  return gql(SET_LOCATION_ROLE, { locationId, userId, role })
}

async function peopleOf(gql: Gql, locationId: string): Promise<Person[]> {
  const { locationPeople } = await gql<{ locationPeople: Person[] }>(
    LOCATION_PEOPLE,
    { locationId },
  )
  return locationPeople
}

async function locationIdsOf(request: APIRequestContext, userId: string) {
  const { locations } = await makeGql(
    request,
    userId,
  )<{ locations: Row[] }>(LOCATIONS)
  return locations.map((l) => l.id)
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

function activeLocation(id: string) {
  return [{ name: 'active-location-id:cloud', value: id }]
}

/** The location switcher in the sidebar ("Switch location (current: …)"). */
function switcher(page: Page) {
  return page
    .getByRole('navigation', { name: 'Sidebar navigation' })
    .getByRole('button', { name: /^Switch location/ })
}

/** "You have no locations in this household yet." (`noLocations.title`). */
function noLocations(page: Page) {
  return page.getByText('You have no locations in this household yet.')
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

/** The lost-access toast of owner decision O27-A (`common.lostLocationAccess`). */
function lostAccessToast(page: Page, location: string) {
  return page.getByText(`You no longer have access to ${location}.`, {
    exact: true,
  })
}

/** A row of Settings › Locations, found by the location name. */
function locationListRow(page: Page, name: string) {
  return page.getByRole('main').getByRole('listitem').filter({ hasText: name })
}

async function cleanupAll(request: APIRequestContext) {
  // BEN and CLEO first, OWNER last: OWNER's cleanup deletes the household.
  await cleanupCloudData(request, BEN)
  await cleanupCloudData(request, CLEO)
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

test.describe('the people of a location', () => {
  test('household owner can give a role, and the member sees the location without a reload', async ({
    browser,
    request,
  }) => {
    // Measured 43.0 s on 2026-11-19 (load average 2.1 to 2.8, the whole spec
    // run with `--timeout=120000`), over or at the 30 s default
    test.setTimeout(90_000)
    // Given BEN, a member with no location role, sees the empty screen,
    // and BEN's live socket works
    const seed = await seedHousehold(request)
    const benPage = await openAs(browser, BEN)
    const benSocket = await routeLiveSocket(benPage)
    await benPage.goto('/')
    await expect(noLocations(benPage)).toBeVisible()
    await expect.poll(() => connects(benPage), { timeout: 15_000 }).toBe(1)
    // BEN has no location, so only a household-level event reaches BEN
    await warmUpLiveSocket(benSocket, {
      key: HOUSEHOLD_EVENT_KEY,
      change: (attempt) =>
        seed.owner(CREATE_TAG_TYPE, {
          name: `People Warm-up ${attempt}`,
          color: 'blue',
        }),
    })
    await markDocument(benPage)

    // And OWNER's Members page marks BEN, and only BEN, with "No location
    // roles" (CLEO organizes Garage, OWNER organizes Home)
    const ownerPage = await openAs(browser, OWNER)
    const members = new MembersPage(ownerPage)
    await members.navigateTo()
    await expect(members.memberRow(BEN_NAME)).toContainText('No location roles')
    await expect(members.memberRow(BEN_NAME)).toContainText(
      'Give a location role',
    )
    await expect(members.memberRow(CLEO_NAME)).toBeVisible()
    await expect(members.main().getByText('No location roles')).toHaveCount(1)

    // When OWNER opens Home's page from Settings › Locations and gives BEN
    // the participant role
    await ownerPage.goto('/settings/household/locations')
    await ownerPage
      .getByRole('main')
      .getByRole('link', { name: 'Open Home', exact: true })
      .click()
    const people = new LocationPeoplePage(ownerPage)
    await expect(people.heading()).toHaveText('Home')
    await expect(people.personRow(OWNER_NAME)).toBeVisible()
    await people.addPerson(BEN_NAME, 'Participant')

    // Then OWNER's page lists BEN as a participant
    await expect(people.rolePicker(BEN_NAME)).toHaveText('Participant')

    // And the server has the role row
    await expect
      .poll(() => peopleOf(seed.owner, seed.home))
      .toContainEqual({ userId: BEN, role: 'participant' })

    // And BEN's tab, with no reload, leaves the empty screen and shows
    // Home's pantry
    await expect(switcher(benPage)).toHaveAccessibleName(
      'Switch location (current: Home)',
      { timeout: 10_000 },
    )
    await expect(cardOf(benPage, RICE)).toContainText('2 / 5')
    await expect(noLocations(benPage)).toHaveCount(0)
    await stillSameDocument(benPage)
  })

  test('location organizer can give participant and viewer, and nothing more', async ({
    browser,
    request,
  }) => {
    // Measured 29.8 s on 2026-11-19 (load average 2.1 to 2.8, the whole spec
    // run with `--timeout=120000`), over or at the 30 s default
    test.setTimeout(60_000)
    // Given Garage has two organizers: CLEO, and OWNER, who gives
    // themselves the role (an owner may make any change)
    const seed = await seedHousehold(request)
    await setRole(seed.owner, seed.garage, OWNER, 'organizer')

    // When CLEO, a household member, opens Garage's page
    const cleoPage = await openAs(browser, CLEO)
    const people = new LocationPeoplePage(cleoPage)
    await people.navigateTo(seed.garage)

    // Then OWNER's organizer row shows its role (present first) and has no
    // picker and no Remove (Review Focus 1)
    await expect(people.personRow(OWNER_NAME)).toContainText('Organizer')
    await expect(people.rolePicker(OWNER_NAME)).toHaveCount(0)
    await expect(people.removeButton(OWNER_NAME)).toHaveCount(0)
    // And CLEO's own organizer row has no picker either
    await expect(people.personRow(CLEO_NAME)).toContainText('(you)')
    await expect(people.rolePicker(CLEO_NAME)).toHaveCount(0)

    // And Add person offers participant and viewer, not organizer
    await people.openAddPerson()
    await people.openAddRoleChoices()
    await expect(
      cleoPage.getByRole('option', { name: 'Participant', exact: true }),
    ).toBeVisible()
    await expect(
      cleoPage.getByRole('option', { name: 'Viewer', exact: true }),
    ).toBeVisible()
    await expect(
      cleoPage.getByRole('option', { name: 'Organizer', exact: true }),
    ).toHaveCount(0)
    await cleoPage.keyboard.press('Escape')
    await people.addDialog().getByRole('button', { name: 'Cancel' }).click()

    // When CLEO adds BEN as a participant, then makes BEN a viewer
    await people.addPerson(BEN_NAME, 'Participant')
    await expect(people.rolePicker(BEN_NAME)).toHaveText('Participant')
    await people.rolePicker(BEN_NAME).click()
    await expect(
      cleoPage.getByRole('option', { name: 'Viewer', exact: true }),
    ).toBeVisible()
    await expect(
      cleoPage.getByRole('option', { name: 'Organizer', exact: true }),
    ).toHaveCount(0)
    await cleoPage.keyboard.press('Escape')
    await people.setRole(BEN_NAME, 'Viewer')

    // Then the server has BEN as a viewer
    await expect
      .poll(() => peopleOf(seed.owner, seed.garage))
      .toContainEqual({ userId: BEN, role: 'viewer' })

    // And the server refuses what the page hides: CLEO making BEN an
    // organizer, demoting OWNER, or removing OWNER
    await expect(
      setRole(seed.cleo, seed.garage, BEN, 'organizer'),
    ).rejects.toThrow(FORBIDDEN)
    await expect(
      setRole(seed.cleo, seed.garage, OWNER, 'viewer'),
    ).rejects.toThrow(FORBIDDEN)
    await expect(
      seed.cleo(REMOVE_LOCATION_ROLE, {
        locationId: seed.garage,
        userId: OWNER,
      }),
    ).rejects.toThrow(FORBIDDEN)
    // And nothing changed
    const after = await peopleOf(seed.owner, seed.garage)
    expect(after).toEqual([
      { userId: CLEO, role: 'organizer' },
      { userId: OWNER, role: 'organizer' },
      { userId: BEN, role: 'viewer' },
    ])
  })

  test('user who loses the role on the active location is moved to another one', async ({
    browser,
    request,
  }) => {
    // Measured 28.0 s on 2026-11-19 (load average 2.1 to 2.8, the whole spec
    // run with `--timeout=120000`), over or at the 30 s default
    test.setTimeout(60_000)
    // Given BEN is a participant of Home and a viewer of Garage, and BEN's
    // pantry shows Home
    const seed = await seedHousehold(request)
    await setRole(seed.owner, seed.home, BEN, 'participant')
    await setRole(seed.owner, seed.garage, BEN, 'viewer')
    const benPage = await openAs(browser, BEN, activeLocation(seed.home))
    const benSocket = await routeLiveSocket(benPage)
    await benPage.goto('/')
    await expect(cardOf(benPage, RICE)).toContainText('2 / 5')
    await expect(switcher(benPage)).toHaveAccessibleName(
      'Switch location (current: Home)',
    )
    await expect.poll(() => connects(benPage), { timeout: 15_000 }).toBe(1)
    await warmUpLiveSocket(benSocket, {
      key: seed.home,
      change: () =>
        seed.owner(ADD_LOG, {
          itemId: seed.rice,
          locationId: seed.home,
          occurredAt: new Date().toISOString(),
        }),
    })
    await markDocument(benPage)

    // When OWNER removes BEN from Home on Home's page
    const ownerPage = await openAs(browser, OWNER)
    const people = new LocationPeoplePage(ownerPage)
    await people.navigateTo(seed.home)
    await people.removePerson(BEN_NAME)
    await expect(people.personRow(OWNER_NAME)).toBeVisible()
    await expect(people.personRow(BEN_NAME)).toHaveCount(0)

    // Then BEN's tab, with no reload, is on Garage, as View only
    await expect(switcher(benPage)).toHaveAccessibleName(
      'Switch location (current: Garage View only)',
      { timeout: 10_000 },
    )
    // And shows Garage's pantry (present first), and no row of Home
    await expect(cardOf(benPage, NAILS)).toContainText('2 / 5')
    await expect(cardOf(benPage, RICE)).toHaveCount(0)
    // And tells BEN once (owner decision O27-A)
    await expect(lostAccessToast(benPage, 'Home')).toBeVisible()
    await expect(lostAccessToast(benPage, 'Home')).toHaveCount(1)
    await stillSameDocument(benPage)

    // When OWNER removes BEN from Garage too (OWNER has no role there; an
    // owner may still change it)
    await expect(
      seed.owner(REMOVE_LOCATION_ROLE, {
        locationId: seed.garage,
        userId: BEN,
      }),
    ).resolves.toEqual({ removeLocationRole: true })

    // Then BEN's tab shows the empty screen, with no reload
    await expect(noLocations(benPage)).toBeVisible({ timeout: 10_000 })
    await expect(cardOf(benPage, NAILS)).toHaveCount(0)
    await expect(lostAccessToast(benPage, 'Garage')).toBeVisible()
    await stillSameDocument(benPage)
    expect(await locationIdsOf(request, BEN)).toEqual([])
  })

  test('location organizer can leave as the only one, and the location shows No organizer', async ({
    browser,
    request,
  }) => {
    // Measured 29.6 s on 2026-11-19 (load average 2.1 to 2.8, the whole spec
    // run with `--timeout=120000`), over or at the 30 s default
    test.setTimeout(60_000)
    // Given CLEO, the only organizer of Garage, is also a viewer of Home,
    // and CLEO's tab is on Garage's page
    const seed = await seedHousehold(request)
    await setRole(seed.owner, seed.home, CLEO, 'viewer')
    const cleoPage = await openAs(browser, CLEO, activeLocation(seed.garage))
    const cleoPeople = new LocationPeoplePage(cleoPage)
    await cleoPeople.navigateTo(seed.garage)
    await expect(cleoPeople.personRow(CLEO_NAME)).toContainText('Organizer')

    // When CLEO leaves Garage. The confirm warns CLEO is its only organizer
    // (owner decision O25-A)
    await cleoPeople.openLeave()
    await expect(cleoPeople.confirmDialog()).toContainText(
      'You are its only organizer.',
    )
    await cleoPeople
      .confirmDialog()
      .getByRole('button', { name: 'Leave location', exact: true })
      .click()

    // Then CLEO lands on the locations list, which has Home and not Garage
    await cleoPage.waitForURL(
      (url) => url.pathname === '/settings/household/locations',
    )
    await expect(locationListRow(cleoPage, 'Home')).toBeVisible()
    await expect(locationListRow(cleoPage, 'Garage')).toHaveCount(0)
    // And CLEO's tab moved its active location to Home without a reload:
    // the leave's own `GetLocations` read moved it (the tab gets no live
    // event for its own write). Settings pages have no switcher, so this
    // reads the stored active id
    await expect
      .poll(() =>
        cleoPage.evaluate(() =>
          localStorage.getItem('active-location-id:cloud'),
        ),
      )
      .toBe(seed.home)
    // And Garage is gone from CLEO's switcher on the pantry
    await cleoPage.goto('/')
    await expect(switcher(cleoPage)).toHaveAccessibleName(
      'Switch location (current: Home View only)',
    )
    await switcher(cleoPage).click()
    await expect(
      cleoPage.getByRole('menuitem', { name: 'Home View only', exact: true }),
    ).toBeVisible()
    await expect(
      cleoPage.getByRole('menuitem', { name: /Garage/ }),
    ).toHaveCount(0)
    await cleoPage.keyboard.press('Escape')

    // And OWNER's list shows Garage as No access and No organizer
    const ownerPage = await openAs(browser, OWNER)
    await ownerPage.goto('/settings/household/locations')
    const garageRow = locationListRow(ownerPage, 'Garage')
    await expect(garageRow).toContainText('No access')
    await expect(garageRow).toContainText('No organizer')

    // When OWNER opens Garage's page and gives themselves the organizer role
    await garageRow.getByRole('link', { name: 'Open Garage' }).click()
    const ownerPeople = new LocationPeoplePage(ownerPage)
    await expect(ownerPeople.noOrganizerNote()).toBeVisible()
    await expect(
      ownerPeople.main().getByText('Give someone the Organizer role.'),
    ).toBeVisible()
    await ownerPeople.addPerson(OWNER_NAME, 'Organizer')

    // Then OWNER's row is there (present first) and the note is gone
    await expect(ownerPeople.rolePicker(OWNER_NAME)).toHaveText('Organizer')
    await expect(ownerPeople.noOrganizerNote()).toHaveCount(0)
    // And the server says Garage has an organizer again
    await expect
      .poll(async () => {
        const { householdLocations } = await seed.owner<{
          householdLocations: {
            id: string
            myRole: string | null
            hasOrganizer: boolean
          }[]
        }>(HOUSEHOLD_LOCATIONS)
        return householdLocations.find((l) => l.id === seed.garage)
      })
      .toEqual({ id: seed.garage, myRole: 'organizer', hasOrganizer: true })
  })

  test('household owner who leaves the active location stays on its page, and the tab moves', async ({
    browser,
    request,
  }) => {
    // Given OWNER is an organizer of Garage and Garage is OWNER's active
    // location
    const seed = await seedHousehold(request)
    await setRole(seed.owner, seed.garage, OWNER, 'organizer')
    const ownerPage = await openAs(browser, OWNER, activeLocation(seed.garage))
    const people = new LocationPeoplePage(ownerPage)
    await people.navigateTo(seed.garage)
    await expect(people.rolePicker(OWNER_NAME)).toHaveText('Organizer')
    await markDocument(ownerPage)

    // When OWNER leaves Garage on its page
    await people.leaveLocation()

    // Then OWNER stays on the page (an owner may still read it). The people
    // list was read again after the leave: Add person now offers OWNER, which
    // it does only for a person NOT on the list (decision T43). That is a
    // presence check, so the absence checks below cannot pass on a render
    // from before the read
    await people.openAddPerson()
    await people
      .addDialog()
      .getByRole('combobox', { name: 'Person', exact: true })
      .click()
    await expect(
      ownerPage.getByRole('option', { name: OWNER_NAME, exact: true }),
    ).toBeVisible()
    await ownerPage.keyboard.press('Escape')
    await people.addDialog().getByRole('button', { name: 'Cancel' }).click()
    await expect(people.personRow(CLEO_NAME)).toBeVisible()
    await expect(people.personRow(OWNER_NAME)).toHaveCount(0)
    await expect(
      people.main().getByRole('button', { name: 'Leave location' }),
    ).toHaveCount(0)
    // And the tab's active location moved to Home with no reload. Nothing
    // here mounts a new `GetLocations` reader and the tab gets no live event
    // for its own write, so only the leave's own read of `GetLocations`
    // (`useLeaveLocation`) can move it. Settings pages have no switcher, so
    // this reads the stored active id
    await expect
      .poll(() =>
        ownerPage.evaluate(() =>
          localStorage.getItem('active-location-id:cloud'),
        ),
      )
      .toBe(seed.home)
    // And the lost-access message shows (owner decision O27-A names leaving)
    await expect(lostAccessToast(ownerPage, 'Garage')).toBeVisible()
    await stillSameDocument(ownerPage)
  })

  test('household owner with No access sees the people, not the data', async ({
    browser,
    request,
  }) => {
    // Given Garage, made and stocked by CLEO; OWNER has no role there
    const seed = await seedHousehold(request)
    // And the server refuses OWNER Garage's stock (a negative control: it
    // was refused before households H5c too)
    await expect(
      seed.owner(ITEM_STOCKS, { locationId: seed.garage }),
    ).rejects.toThrow(FORBIDDEN)

    // And every GraphQL request of OWNER's tab is recorded
    const ownerPage = await openAs(browser, OWNER)
    const sent: { operationName: string; body: string }[] = []
    ownerPage.on('request', (req) => {
      if (req.url() !== CLOUD_GRAPHQL_URL || req.method() !== 'POST') return
      const body = req.postData() ?? ''
      const parsed = JSON.parse(body) as { operationName?: string }
      sent.push({ operationName: parsed.operationName ?? '', body })
    })

    // When OWNER opens Garage's page from Settings › Locations
    await ownerPage.goto('/settings/household/locations')
    await ownerPage
      .getByRole('main')
      .getByRole('link', { name: 'Open Garage', exact: true })
      .click()
    const people = new LocationPeoplePage(ownerPage)

    // Then OWNER sees CLEO as Garage's organizer (an owner may make any
    // change, so the row has a picker)
    await expect(people.heading()).toHaveText('Garage')
    await expect(people.rolePicker(CLEO_NAME)).toHaveText('Organizer')
    // And the Add person section has rendered, so `HouseholdMembers` has
    // answered too: every read the page makes on its own has been sent
    await expect(
      people.main().getByRole('button', { name: 'Add person', exact: true }),
    ).toBeVisible()

    // And until now the only REQUEST of the tab that named Garage was
    // LocationPeople (Review Focus 4). This checks requests, not responses:
    // a read of Garage's stock, carts or logs would have to be SENT first,
    // and none was. It covers the page from its first render to the point
    // where its people and members are on screen, not any later moment
    const namingGarage = [...sent].filter((r) => r.body.includes(seed.garage))
    expect(namingGarage.length).toBeGreaterThan(0)
    expect([...new Set(namingGarage.map((r) => r.operationName))]).toEqual([
      'LocationPeople',
    ])

    // When OWNER gives themselves the viewer role
    await people.addPerson(OWNER_NAME, 'Viewer')
    await expect(people.rolePicker(OWNER_NAME)).toHaveText('Viewer')

    // Then the server gives OWNER Garage's stock (the positive control of
    // the refusal above)
    await expect
      .poll(async () => {
        const { itemStocks } = await seed.owner<{
          itemStocks: { itemId: string }[]
        }>(ITEM_STOCKS, { locationId: seed.garage })
        return itemStocks.map((s) => s.itemId)
      })
      .toEqual([seed.nails])
  })

  test('user removed from the household keeps no location role, even when a role is given at the same moment', async ({
    request,
  }) => {
    // Given BEN is a participant of Home
    const seed = await seedHousehold(request)
    await setRole(seed.owner, seed.home, BEN, 'participant')

    // When OWNER removes BEN from the household and, in the same moment,
    // makes BEN a viewer of Home (Review Focus 3). Both writes take the
    // household lock, so one waits for the other
    const [removed, roleWrite] = await Promise.allSettled([
      seed.owner(REMOVE_MEMBER, { userId: BEN }),
      setRole(seed.owner, seed.home, BEN, 'viewer'),
    ])

    // Then the removal worked, and the role write either landed first (and
    // the removal deleted it) or was refused
    expect(removed).toEqual({
      status: 'fulfilled',
      value: { removeMember: true },
    })
    if (roleWrite.status === 'rejected')
      expect(String(roleWrite.reason)).toMatch(FORBIDDEN)
    // Which one went first is up to the server. The report names it
    test.info().annotations.push({
      type: 'race order',
      description:
        roleWrite.status === 'fulfilled'
          ? 'the role write went first; the removal deleted it'
          : 'the removal went first; the role write was refused',
    })
    // And Home's people do not list BEN
    expect(await peopleOf(seed.owner, seed.home)).toEqual([
      { userId: OWNER, role: 'organizer' },
    ])

    // When BEN joins again with no location role
    await joinHousehold(
      request,
      BEN,
      await createInvite(request, OWNER, 'member', []),
    )

    // Then BEN has no location at all: no role row was left behind (a left
    // row would count again now that BEN is a member)
    expect(await locationIdsOf(request, BEN)).toEqual([])
    expect(await peopleOf(seed.owner, seed.home)).toEqual([
      { userId: OWNER, role: 'organizer' },
    ])

    // When OWNER removes BEN first, and gives BEN a role after
    await expect(seed.owner(REMOVE_MEMBER, { userId: BEN })).resolves.toEqual({
      removeMember: true,
    })

    // Then the role write is refused: BEN is not a member (decision H18)
    await expect(setRole(seed.owner, seed.home, BEN, 'viewer')).rejects.toThrow(
      FORBIDDEN,
    )
    const { householdMembers } = await seed.owner<{
      householdMembers: { userId: string }[]
    }>(MEMBERS)
    expect(householdMembers.map((m) => m.userId)).not.toContain(BEN)
  })

  /**
   * The people page and what leads to it, scanned with the rules of
   * `a11y.spec.ts` (`e2e/helpers/axe.ts`). That file runs in `local` and
   * `pwa` only, where these cloud pages redirect, so the scans live here
   * (owed by tasks H.5 and H.6). An open dialog is scanned alone, with the
   * known filled-button contrast defect allowed (`checkDialogA11y`).
   */
  async function scanEverything(
    browser: Browser,
    request: APIRequestContext,
    dark: boolean,
  ) {
    // Garage with No organizer: CLEO leaves it. OWNER and BEN are viewers
    // there, so OWNER sees Leave and a Remove on BEN's row. CLEO now has no
    // location role, so the Members page marks CLEO.
    const seed = await seedHousehold(request)
    expect(
      await seed.cleo(LEAVE_LOCATION, { locationId: seed.garage }),
    ).toEqual({ leaveLocation: true })
    await setRole(seed.owner, seed.garage, OWNER, 'viewer')
    await setRole(seed.owner, seed.garage, BEN, 'viewer')

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

    // Each scan waits for what it scans to be ON SCREEN, not for
    // `waitForLoadState('networkidle')`: after a client-side navigation that
    // call returns at once, because the load state was reached long before.

    // The Members page, with "No location roles" and its link on CLEO's row
    const members = new MembersPage(page)
    await members.navigateTo()
    await expect(members.memberRow(CLEO_NAME)).toContainText(
      'No location roles',
    )
    await scan()

    // Settings › Locations, with a name link on each row
    await page.goto('/settings/household/locations')
    await expect(locationListRow(page, 'Garage')).toContainText('No organizer')
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Open Home' }),
    ).toBeVisible()
    await scan()

    // Garage's page, with the No organizer note
    await page
      .getByRole('main')
      .getByRole('link', { name: 'Open Garage', exact: true })
      .click()
    const people = new LocationPeoplePage(page)
    await expect(people.noOrganizerNote()).toBeVisible()
    await expect(people.rolePicker(BEN_NAME)).toHaveText('Viewer')
    await expect(
      people.main().getByRole('button', { name: 'Add person', exact: true }),
    ).toBeVisible()
    await scan()

    // Add person, the Remove confirm and the Leave confirm
    await people.openAddPerson()
    await scan('[role="dialog"]')
    await people.addDialog().getByRole('button', { name: 'Cancel' }).click()
    await expect(people.addDialog()).toHaveCount(0)
    await people.openRemove(BEN_NAME)
    await scan('[role="alertdialog"]')
    await people.cancelConfirm()
    await people.openLeave()
    await scan('[role="alertdialog"]')
    await people.cancelConfirm()
  }

  test('user can use the location people page without accessibility violations', async ({
    browser,
    request,
  }) => {
    await scanEverything(browser, request, false)
  })

  test('user can use the location people page without accessibility violations in dark mode', async ({
    browser,
    request,
  }) => {
    await scanEverything(browser, request, true)
  })
})
