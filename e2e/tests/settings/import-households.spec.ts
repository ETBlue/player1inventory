import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { E2E_SECOND_USER_ID, E2E_USER_ID } from '../../constants'
import { FIXTURE_STOCK_BY_LOCATION } from '../../helpers/backupAssertions'
import { cleanupCloudData } from '../../helpers/cloudTeardown'
import { addHouseholdMember } from '../../helpers/cloudUsers'
import { readLocations, readStockAt } from '../../helpers/stockReadback'
import { SettingsPage } from '../../pages/SettingsPage'
import { makeGql } from '../../utils/cloud'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// The households H4 import rules, against real Postgres and through the real
// import card (docs/global/permissions/2026-11-16-households-plan-h4.md, task
// E.6). One test per rule:
//
// | Rule                                                        | Decision |
// |-------------------------------------------------------------|----------|
// | a household member sees no file button and is refused       | O1, O7, T8 |
// | a manager imports, and is not offered "Clear & import"      | T8, Decision 27 |
// | a file with another household's row writes nothing at all   | T1, rule 2 |
// | a local backup asks "Import into which location?"           | O3, rule 3 |
// | "New location" creates the location and fills it            | O6 |
// | a location the importer cannot edit is skipped and named    | O5 |
// | "Clear & import" of a cloud backup leaves no empty "Home"   | decision 6 (choice A) |
//
// ── WHO THE BROWSER IS ───────────────────────────────────────────────────────
//
// The browser can only be `E2E_USER_ID` (`VITE_E2E_TEST_USER_ID`, see
// e2e/playwright.config.ts). For the role tests it is put into ANOTHER user's
// household with `addHouseholdMember`, BEFORE the page sends its first GraphQL
// request. A request first would give `E2E_USER_ID` a household of its own, and
// the route then answers 409 (e2e/CLAUDE.md, "Use `addHouseholdMember` in this
// order"). `cleanupCloudData` is a REST call, not GraphQL, so the `beforeEach`
// cleanup does not count as a first request.
//
// ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
//
// **One person in TWO households is not here.** `addHouseholdMember` refuses a
// person who is already in a household (409), so no E2E spec can build that
// case before H5's invites. Issue #381's two-household cases are tested only
// against the Prisma fake (`import-role-gate.resolver.test.ts`). So "the target
// household" and "the caller's household" are the same household in every test
// below.
//
// This file is cloud-only: it is in the `cloud` project's `testMatch` and the
// `local` project's `testIgnore`. Local mode has no roles (decision T18).

/** The owner of the household the browser joins in the role tests. */
const OWNER = `${E2E_SECOND_USER_ID}-import-owner`
/** A person in a household of their own, whose rows a file names. */
const STRANGER = `${E2E_SECOND_USER_ID}-import-stranger`

const LOCAL_BACKUP_PATH = path.resolve(
  __dirname,
  '../../fixtures/local-backup.json',
)
const localBackup = JSON.parse(fs.readFileSync(LOCAL_BACKUP_PATH, 'utf-8')) as {
  locations: { id: string }[]
  items: { id: string }[]
}
/** The local backup's one item, stocked at all three of its locations. */
const LOCAL_ITEM_ID = localBackup.items[0]?.id ?? ''

type Gql = ReturnType<typeof makeGql>
type Row = { id: string }
type NamedRow = { id: string; name: string }

const FORBIDDEN = /"code":"FORBIDDEN"/
const ISO = '2026-11-16T00:00:00.000Z'

const LOCATIONS = `query { locations { id name } }`
const CREATE_LOCATION = `mutation ($name: String!) { createLocation(name: $name) { id } }`
const UPDATE_LOCATION = `mutation ($id: ID!, $name: String!) {
  updateLocation(id: $id, input: { name: $name }) { id }
}`
const ITEMS = `query { items { id name } }`
const VENDORS = `query { vendors { id name } }`
const CREATE_ITEM = `mutation ($input: CreateItemInput!) { createItem(input: $input) { id } }`
const UPSERT_STOCK = `mutation ($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
  upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id }
}`
const BULK_CREATE_ITEMS = `mutation ($items: [ItemInput!]!) {
  bulkCreateItems(items: $items) { id }
}`
const IMPORT_CHECK = `query ($ids: ImportCheckInput!, $forClear: Boolean) {
  importCheck(ids: $ids, forClear: $forClear) { anotherHousehold }
}`

/** A catalog item row as a backup file holds it. */
function fileItem(id: string, name: string) {
  return {
    id,
    name,
    tagIds: [],
    vendorIds: [],
    targetUnit: 'package',
    consumeAmount: 1,
    createdAt: ISO,
    updatedAt: ISO,
  }
}

/** A stock row as a backup file holds it. */
function fileStock(
  id: string,
  itemId: string,
  locationId: string,
  packedQuantity: number,
) {
  return {
    id,
    itemId,
    locationId,
    packedQuantity,
    unpackedQuantity: 0,
    targetQuantity: 10,
    refillThreshold: 1,
    createdAt: ISO,
    updatedAt: ISO,
  }
}

/**
 * Write a backup file for this test and return its path. Every list the card
 * requires is present, so the card accepts it. `locations` and `itemStocks`
 * are present too (empty unless given), so a file with no `'local'` row does
 * NOT open "Import into which location?" (`needsImportLocation`).
 */
function writeBackup(name: string, parts: Record<string, unknown>): string {
  const file = test.info().outputPath(name)
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      exportedAt: ISO,
      tagTypes: [],
      tags: [],
      vendors: [],
      items: [],
      recipes: [],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
      shelves: [],
      locations: [],
      itemStocks: [],
      ...parts,
    }),
  )
  return file
}

/** The first location of `gql`'s household. Its first request runs first sign-in. */
async function firstLocation(gql: Gql): Promise<NamedRow> {
  const { locations } = await gql<{ locations: NamedRow[] }>(LOCATIONS)
  const first = locations[0]
  if (!first) throw new Error('no location after first sign-in')
  return first
}

async function itemNames(gql: Gql): Promise<Record<string, string>> {
  const { items } = await gql<{ items: NamedRow[] }>(ITEMS)
  return Object.fromEntries(items.map((i) => [i.id, i.name]))
}

async function cleanupAll(request: APIRequestContext) {
  // The browser's user first: in the role tests it is only a member of the
  // owner's household, and its cleanup removes its own role rows. Then the
  // owner, whose cleanup deletes the household.
  await cleanupCloudData(request, E2E_USER_ID)
  await cleanupCloudData(request, OWNER)
  await cleanupCloudData(request, STRANGER)
}

test.beforeEach(async ({ page, request }) => {
  // `__root.tsx` sends an account with no items to /onboarding, which would
  // hide the import card.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  await cleanupAll(request)
})

test.afterEach(async ({ request }) => {
  await cleanupAll(request)
})

test.describe('who can import (decisions O1, O7, T8)', () => {
  test('household member sees why they cannot import, and the server refuses them', async ({
    page,
    request,
  }) => {
    const owner = makeGql(request, OWNER)
    const member = makeGql(request, E2E_USER_ID)

    // Given the browser's user is a household MEMBER who ORGANIZES "Home".
    // Decision O7: organizing a location does not make a member an importer.
    const home = await firstLocation(owner)
    await addHouseholdMember(request, {
      ownerUserId: OWNER,
      memberUserId: E2E_USER_ID,
      householdRole: 'member',
      locations: [{ locationId: home.id, role: 'organizer' }],
    })

    // When they open the household page
    await new SettingsPage(page).navigateTo()

    // Then the import card says why, and offers no file button. The line is
    // asserted FIRST: it shows only once the role has loaded, so the absence
    // below cannot be the loading state.
    await expect(
      page.getByText('Only the owner or a manager can import data.'),
    ).toBeVisible()
    // t('settings.import.button') = "Import". No other button on the page
    // has that name.
    await expect(
      page.getByRole('button', { name: 'Import', exact: true }),
    ).toHaveCount(0)

    // And the server refuses a direct import of a NEW item (rule 17: a row
    // that would otherwise be written)
    await expect(
      member(BULK_CREATE_ITEMS, {
        items: [fileItem('h4e6-member-item', 'Member Bread')],
      }),
    ).rejects.toThrow(FORBIDDEN)
    // And the check query too
    await expect(
      member(IMPORT_CHECK, { ids: { items: ['h4e6-member-item'] } }),
    ).rejects.toThrow(FORBIDDEN)

    // And the household holds no item: nothing was written
    expect(await itemNames(owner)).toEqual({})
  })

  test('household manager can import, and is not offered Clear & import', async ({
    page,
    request,
  }) => {
    const owner = makeGql(request, OWNER)
    const manager = makeGql(request, E2E_USER_ID)
    const settings = new SettingsPage(page)

    // Given the household holds "Owner Milk", and the browser's user is a
    // household MANAGER
    const home = await firstLocation(owner)
    await owner(BULK_CREATE_ITEMS, {
      items: [fileItem('h4e6-manager-milk', 'Owner Milk')],
    })
    await addHouseholdMember(request, {
      ownerUserId: OWNER,
      memberUserId: E2E_USER_ID,
      householdRole: 'manager',
      locations: [{ locationId: home.id, role: 'participant' }],
    })

    // Then the check query for a CLEAR is refused (owner only), and the
    // check for any other strategy is not. The second call is the control:
    // without it, a check that refused everybody would pass the first.
    await expect(
      manager(IMPORT_CHECK, {
        ids: { items: ['h4e6-manager-milk'] },
        forClear: true,
      }),
    ).rejects.toThrow(FORBIDDEN)
    await expect(
      manager(IMPORT_CHECK, { ids: { items: ['h4e6-manager-milk'] } }),
    ).resolves.toEqual({ importCheck: { anotherHousehold: false } })

    // When the manager imports a file that renames "Owner Milk" and brings a
    // new item
    const file = writeBackup('manager.json', {
      items: [
        fileItem('h4e6-manager-milk', 'Backup Milk'),
        fileItem('h4e6-manager-bread', 'Backup Bread'),
      ],
    })
    await settings.navigateTo()
    await settings.triggerImport(file)

    // Then the conflict dialog offers Skip and Replace, and no Clear
    const dialog = settings.getConflictDialog()
    await expect(
      dialog.getByRole('button', { name: 'Replace matches', exact: true }),
    ).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Skip conflicts', exact: true }),
    ).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Clear & import', exact: true }),
    ).toHaveCount(0)

    // And "Replace matches" writes the file into the household
    await settings.chooseConflictStrategy('Replace matches')
    await settings.waitForImportDone('cloud')
    await expect
      .poll(() => itemNames(owner))
      .toEqual({
        'h4e6-manager-milk': 'Backup Milk',
        'h4e6-manager-bread': 'Backup Bread',
      })
  })
})

test('user sees the import refused when the file holds another household’s row, and nothing is written', async ({
  page,
  request,
}) => {
  const stranger = makeGql(request, STRANGER)
  const user = makeGql(request, E2E_USER_ID)
  const settings = new SettingsPage(page)

  // Given another household holds "Stranger Milk"
  await firstLocation(stranger)
  await stranger(BULK_CREATE_ITEMS, {
    items: [fileItem('h4e6-stranger-milk', 'Stranger Milk')],
  })

  // And a file that names that item, next to a new vendor and a new item.
  // THE VENDOR IS WHAT MAKES THIS TEST ABLE TO FAIL (rule 17). Vendors are
  // sent before items, in their own call. Without the check that runs before
  // the first write, the vendor is written and only the items call is
  // refused. The new item cannot show that: it is in the same refused call
  // as the stranger's item.
  const file = writeBackup('another-household.json', {
    vendors: [{ id: 'h4e6-new-vendor', name: 'New Vendor' }],
    items: [
      fileItem('h4e6-stranger-milk', 'Taken Over'),
      fileItem('h4e6-new-bread', 'New Bread'),
    ],
  })

  // When the user imports it
  await settings.navigateTo()
  await settings.triggerImport(file)

  // Then the card says another household's rows were found
  await expect(
    page.getByText(
      'Some rows in this file belong to another household, so the import was refused. Nothing was imported.',
    ),
  ).toBeVisible()

  // And the stranger's item kept its name (read first: it is present, so the
  // reads below are reads of a working server, not of an empty answer)
  expect(await itemNames(stranger)).toEqual({
    'h4e6-stranger-milk': 'Stranger Milk',
  })
  // And nothing at all was written into the user's household
  expect(await itemNames(user)).toEqual({})
  const { vendors } = await user<{ vendors: NamedRow[] }>(VENDORS)
  expect(vendors).toEqual([])
})

test.describe('Import into which location? (decisions O3, O6)', () => {
  test('user importing a local backup is asked where, and the rows land in the picked location', async ({
    page,
    request,
    baseURL,
  }) => {
    // 60 s, not the default 30 s. Measured 2026-11-19 with this spec run
    // alone in `cloud` (load average 2.3 to 4.2): 32.6 s and 29.1 s. The
    // other tests in this file, which import little or nothing, took 17 to
    // 25 s in the same runs: each one makes six `/e2e/cleanup` calls in its
    // hooks against the remote test database. This test also imports the
    // whole local backup. No step looked wasteful; it is simply too close to
    // 30 s for a busy machine.
    test.setTimeout(60000)
    const user = makeGql(request, E2E_USER_ID)
    const settings = new SettingsPage(page)

    // Given a household with "Home" and "Second Pantry"
    const home = await firstLocation(user)
    const { createLocation: second } = await user<{ createLocation: Row }>(
      CREATE_LOCATION,
      { name: 'Second Pantry' },
    )

    // When a LOCAL backup is imported (its default location has the id
    // `'local'`)
    expect(localBackup.locations[0]?.id).toBe('local')
    await settings.navigateTo()
    await settings.triggerImport(LOCAL_BACKUP_PATH)

    // Then the dialog asks where, with the FIRST location checked (O3).
    // Asserting the mechanism, not only where the rows end up.
    const dialog = settings.getImportLocationDialog()
    await expect(dialog.getByRole('radio', { name: 'Home' })).toBeChecked()
    await expect(
      dialog.getByRole('radio', { name: 'Second Pantry' }),
    ).not.toBeChecked()

    // When the user picks the SECOND location
    await settings.chooseImportLocation('Second Pantry')
    await settings.waitForImportDone('cloud')

    // Then the backup's default-location stock is at "Second Pantry"
    await expect
      .poll(
        async () =>
          (await readStockAt(page, request, baseURL, LOCAL_ITEM_ID, second.id))
            ?.packedQuantity,
      )
      .toBe(FIXTURE_STOCK_BY_LOCATION.DEFAULT.packedQuantity)
    // And "Home" holds none of it
    expect(
      await readStockAt(page, request, baseURL, LOCAL_ITEM_ID, home.id),
    ).toBeUndefined()
    // And the backup's "Fixture Home" became no location of its own: its
    // rows went into "Second Pantry", which kept its name. The other two
    // locations came in with their own ids.
    expect(
      (await readLocations(page, request, baseURL)).map((l) => l.name).sort(),
    ).toEqual(
      ['Fixture Cabin', 'Fixture Office', 'Home', 'Second Pantry'].sort(),
    )
  })

  test('user importing a local backup into a new location gets that location', async ({
    page,
    request,
    baseURL,
  }) => {
    // 60 s, not the default 30 s. Measured 2026-11-19 with this spec run
    // alone in `cloud` (load average 2.3 to 4.2): 31.6 s and 30.5 s. The
    // reason is the same as in the test above: the hooks, plus the import of
    // the whole local backup.
    test.setTimeout(60000)
    const user = makeGql(request, E2E_USER_ID)
    const settings = new SettingsPage(page)

    // Given a household with only "Home"
    const home = await firstLocation(user)

    // When a local backup is imported and "New location" is chosen
    await settings.navigateTo()
    await settings.triggerImport(LOCAL_BACKUP_PATH)
    const dialog = settings.getImportLocationDialog()
    await dialog.getByRole('radio', { name: 'New location' }).click()

    // Then the name field starts with the backup's default location name (O6)
    const nameField = dialog.getByRole('textbox', {
      name: 'Name of the new location',
    })
    await expect(nameField).toHaveValue('Fixture Home')

    // When the user names it and imports
    await nameField.fill('Imported Pantry')
    await dialog.getByRole('button', { name: 'Import', exact: true }).click()
    await settings.waitForImportDone('cloud')

    // Then "Imported Pantry" exists and holds the default location's stock
    await expect
      .poll(async () =>
        (await readLocations(page, request, baseURL)).map((l) => l.name).sort(),
      )
      .toEqual(
        ['Fixture Cabin', 'Fixture Office', 'Home', 'Imported Pantry'].sort(),
      )
    const imported = (await readLocations(page, request, baseURL)).find(
      (l) => l.name === 'Imported Pantry',
    )
    if (!imported) throw new Error('no "Imported Pantry" location')
    expect(
      (await readStockAt(page, request, baseURL, LOCAL_ITEM_ID, imported.id))
        ?.packedQuantity,
    ).toBe(FIXTURE_STOCK_BY_LOCATION.DEFAULT.packedQuantity)
    // And "Home" holds none of it
    expect(
      await readStockAt(page, request, baseURL, LOCAL_ITEM_ID, home.id),
    ).toBeUndefined()
  })
})

test('user sees which locations were skipped because they cannot edit them', async ({
  page,
  request,
}) => {
  const owner = makeGql(request, OWNER)
  const settings = new SettingsPage(page)

  // Given the owner's household has "Home" and "Garage", and the browser's
  // user is a manager who organizes Home and only VIEWS Garage
  const home = await firstLocation(owner)
  const { createLocation: garage } = await owner<{ createLocation: Row }>(
    CREATE_LOCATION,
    { name: 'Garage' },
  )
  await addHouseholdMember(request, {
    ownerUserId: OWNER,
    memberUserId: E2E_USER_ID,
    householdRole: 'manager',
    locations: [
      { locationId: home.id, role: 'organizer' },
      { locationId: garage.id, role: 'viewer' },
    ],
  })

  // When the manager imports a file with a new item stocked at both
  const file = writeBackup('blocked-location.json', {
    locations: [
      { id: home.id, name: 'Home', order: 0, createdAt: ISO, updatedAt: ISO },
      {
        id: garage.id,
        name: 'Garage',
        order: 1,
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
    items: [fileItem('h4e6-flour', 'Flour')],
    itemStocks: [
      fileStock('h4e6-flour-home', 'h4e6-flour', home.id, 4),
      fileStock('h4e6-flour-garage', 'h4e6-flour', garage.id, 6),
    ],
  })
  await settings.navigateTo()
  await settings.triggerImport(file)
  await settings.waitForImportDone('cloud')

  // Then the card names Garage as skipped (decision O5)
  await expect(
    page.getByText('Skipped, because you cannot edit them: Garage.'),
  ).toBeVisible()

  // And the Home row landed (read as the owner, who can see both)
  const stockAt = async (locationId: string) => {
    const { itemStocks } = await owner<{
      itemStocks: { itemId: string; packedQuantity: number }[]
    }>(
      `query ($locationId: ID!) { itemStocks(locationId: $locationId) { itemId packedQuantity } }`,
      { locationId },
    )
    return itemStocks.find((s) => s.itemId === 'h4e6-flour')?.packedQuantity
  }
  await expect.poll(() => stockAt(home.id)).toBe(4)
  // And the Garage row did not
  expect(await stockAt(garage.id)).toBeUndefined()
})

test('user restoring a cloud backup with Clear & import gets no extra empty Home', async ({
  page,
  request,
}) => {
  // A full seed, export and import, like the round trips in
  // import-export-cloud.spec.ts, which carry the same budget.
  test.setTimeout(60000)
  const user = makeGql(request, E2E_USER_ID)
  const settings = new SettingsPage(page)

  // Given a household whose first location is renamed "Main Pantry", plus a
  // "Garage", and an item stocked at both. "Main Pantry" is not called "Home"
  // on purpose: then an extra "Home" after the restore can only be the one
  // `clearAllData` made.
  const home = await firstLocation(user)
  await user(UPDATE_LOCATION, { id: home.id, name: 'Main Pantry' })
  const { createLocation: garage } = await user<{ createLocation: Row }>(
    CREATE_LOCATION,
    { name: 'Garage' },
  )
  const { createItem: flour } = await user<{ createItem: Row }>(CREATE_ITEM, {
    input: { name: 'Flour' },
  })
  await user(UPSERT_STOCK, {
    itemId: flour.id,
    locationId: home.id,
    input: { packedQuantity: 3, unpackedQuantity: 0 },
  })
  await user(UPSERT_STOCK, {
    itemId: flour.id,
    locationId: garage.id,
    input: { packedQuantity: 5, unpackedQuantity: 0 },
  })

  // And the household is backed up
  await settings.navigateTo()
  const download = await settings.triggerExport()
  const downloadPath = await download.path()
  if (!downloadPath) throw new Error('Download path is null')

  // When the backup is restored over it with "Clear & import"
  await settings.navigateTo()
  await settings.triggerImport(downloadPath)
  await settings.chooseConflictStrategy('Clear & import')
  await settings.waitForImportDone('cloud')

  // Then both locations are back under their own ids, with their own stock
  const stockAt = async (locationId: string) => {
    const { itemStocks } = await user<{
      itemStocks: { itemId: string; packedQuantity: number }[]
    }>(
      `query ($locationId: ID!) { itemStocks(locationId: $locationId) { itemId packedQuantity } }`,
      { locationId },
    )
    return itemStocks.find((s) => s.itemId === flour.id)?.packedQuantity
  }
  await expect.poll(() => stockAt(home.id)).toBe(3)
  expect(await stockAt(garage.id)).toBe(5)

  // And the fresh "Home" that `clearAllData` made is gone (decision 6): the
  // import put nothing there
  await expect
    .poll(async () => {
      const { locations } = await user<{ locations: NamedRow[] }>(LOCATIONS)
      return locations.map((l) => l.name).sort()
    })
    .toEqual(['Garage', 'Main Pantry'])
})
