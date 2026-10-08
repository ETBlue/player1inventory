import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import {
  DESTINATION_DEFAULT_LOCATION_NAME,
  FIXTURE_DEFAULT_LOCATION_NAME,
  FIXTURE_NON_DEFAULT_LOCATION_NAMES,
  FIXTURE_STOCK_BY_LOCATION,
  expectFixtureStockPerLocation,
} from '../../helpers/backupAssertions'
import { seedCloudFixture } from '../../helpers/cloudSeed'
import { cleanupCloudData } from '../../helpers/cloudTeardown'
import type { Fixture } from '../../helpers/fixture'
import { seedLocalFixture } from '../../helpers/localSeed'
import { readRows } from '../../helpers/locationSeed'
import { makeGql } from '../../utils/cloud'

// THE SECOND PATH TO THE `clear` IMPORT STRATEGY, AND THE ONLY ONE A REAL USER
// TAKES WHEN MOVING OFF LOCAL MODE.
//
// `settings/import-strategies.spec.ts` reaches `clear` through `ImportCard`'s
// conflict dialog: a JSON file is chosen, the payload collides with what the
// account holds, and the user picks a strategy for the collision. This file
// reaches the same strategy through a different door, with NO file and NO
// conflict: Settings -> "Switch..." -> "Switch to cloud" -> "Yes, copy data" ->
// "Clear & import". `DataModeCard.doEnableSwitch('clear')` writes
// `migration-strategy` to localStorage, flips `data-mode` to cloud, and reloads;
// after that reload `usePostLoginMigration`'s auto-import branch runs the import
// on its own.
//
// UNTIL CLOUD-PARITY PR C TASK 1 THIS PATH COULD NOT BE DRIVEN AT ALL.
// `PostLoginMigrationDialog` is the only mount site of `usePostLoginMigration`,
// and `__root.tsx` mounted it behind `mode === 'cloud' && !isE2ETestMode`. So
// `DataModeCard` wrote the key and nothing in E2E ever read it. Task 1 dropped
// that gate and moved the Clerk `useAuth()` call into a component shim, so the
// hook needs no `ClerkProvider`. `CloudAuthGuard` is still gated off on purpose —
// it would send the run to /sign-in.
//
// CLOUD ONLY. This spec is in the `cloud` project's `testMatch` and the `local`
// project's `testIgnore`. It cannot run in `local`: that project's web server is
// started without `VITE_E2E_TEST_USER_ID` (`e2e/playwright.config.ts`), so
// `data-mode=cloud` there mounts the real `ClerkProvider` tree and
// `CloudAuthGuard` redirects to /sign-in, which E2E has no way to complete.

/** The one item the migration carries, stocked at all three locations. */
const ITEM_ID = 'aaaaaaaa-0000-0000-0000-000000000201'
const ITEM_NAME = 'Local Only Item'

/**
 * The local pantry this test copies up.
 *
 * NAMED AND NUMBERED TO MATCH `helpers/backupAssertions.ts`, so the readback can
 * reuse `expectFixtureStockPerLocation` instead of growing a fourth copy of the
 * same checks. Three locations with three DIFFERENT quantities is what makes
 * those checks able to fail: with one location, or with equal numbers, "each row
 * kept its own location" and "every row landed on the default" give the same
 * answer.
 *
 * The default is listed FIRST on purpose — `seedLocalFixture` assigns
 * `order: index` to every row, so moving it changes the page order in local mode
 * (see `e2e/CLAUDE.md`, "Location order is assigned differently in the two
 * modes").
 */
const LOCAL_PANTRY: Fixture = {
  locations: [
    { key: 'home', name: FIXTURE_DEFAULT_LOCATION_NAME, isDefault: true },
    { key: 'office', name: FIXTURE_NON_DEFAULT_LOCATION_NAMES[0] },
    { key: 'cabin', name: FIXTURE_NON_DEFAULT_LOCATION_NAMES[1] },
  ],
  vendors: [],
  items: [{ id: ITEM_ID, name: ITEM_NAME }],
  stocks: [
    { itemId: ITEM_ID, location: 'home', ...FIXTURE_STOCK_BY_LOCATION.DEFAULT },
    {
      itemId: ITEM_ID,
      location: 'office',
      ...FIXTURE_STOCK_BY_LOCATION[FIXTURE_NON_DEFAULT_LOCATION_NAMES[0]],
    },
    {
      itemId: ITEM_ID,
      location: 'cabin',
      ...FIXTURE_STOCK_BY_LOCATION[FIXTURE_NON_DEFAULT_LOCATION_NAMES[1]],
    },
  ],
  shelves: [],
  recipes: [],
}

/** The cloud rows `LOCAL_PANTRY` names nowhere. Only `clear` deletes them. */
const CLOUD_ONLY_ITEM_ID = 'bbbbbbbb-0000-0000-0000-000000000201'
const CLOUD_ONLY_ITEM_NAME = 'Cloud Only Item'
const CLOUD_ONLY_LOCATION_NAME = 'Cloud Only Shed'

/**
 * What the cloud account already holds when the migration starts.
 *
 * WITHOUT THIS SEED THE TEST CANNOT TELL `clear` FROM `replace`, and that was
 * measured rather than reasoned about. The first version of this file seeded
 * nothing in cloud, and the mutation check — press "Overwrite conflicts" instead
 * of "Clear & import" — PASSED in 17.5s. With an empty destination `clear`
 * deletes nothing and `replace` collides with nothing, so the two strategies
 * leave the same account behind and no assertion can separate them.
 *
 * The item and the location here are named by nothing in `LOCAL_PANTRY`, so:
 *
 *   - `clear` deletes both, and the account ends up holding only the payload;
 *   - `replace` and `skip` keep both, which gives an extra item and a FOURTH
 *     location.
 *
 * The default is named `DESTINATION_DEFAULT_LOCATION_NAME` so `seedCloudFixture`
 * does not rename the server's own default — the server already calls it that.
 */
const CLOUD_DESTINATION: Fixture = {
  locations: [
    { key: 'home', name: DESTINATION_DEFAULT_LOCATION_NAME, isDefault: true },
    { key: 'shed', name: CLOUD_ONLY_LOCATION_NAME },
  ],
  vendors: [],
  items: [{ id: CLOUD_ONLY_ITEM_ID, name: CLOUD_ONLY_ITEM_NAME }],
  stocks: [
    {
      itemId: CLOUD_ONLY_ITEM_ID,
      location: 'shed',
      packedQuantity: 90,
      targetQuantity: 91,
      refillThreshold: 9,
    },
  ],
  shelves: [],
  recipes: [],
}

type ItemRow = { id: string; name: string }

/** `Record<itemId, itemName>` for every item the CLOUD account holds. */
async function readCloudItemNamesById(
  request: APIRequestContext,
): Promise<Record<string, string>> {
  const { items } = await makeGql(request)<{ items: ItemRow[] }>(
    `query { items { id name } }`,
  )
  const byId: Record<string, string> = {}
  for (const item of items) {
    if (byId[item.id] !== undefined) {
      throw new Error(`two cloud items share the id "${item.id}"`)
    }
    byId[item.id] = item.name
  }
  return byId
}

/** The three localStorage values this flow is steered by. */
function readMigrationKeys(page: Page) {
  return page.evaluate(() => ({
    mode: localStorage.getItem('data-mode'),
    // MIGRATION_STRATEGY_KEY / MIGRATION_PROMPTED_KEY in
    // apps/web/src/hooks/usePostLoginMigration.ts
    strategy: localStorage.getItem('migration-strategy'),
    prompted: localStorage.getItem('migration-prompted'),
  }))
}

test.beforeEach(async ({ page }) => {
  // `__root.tsx` sends an account with no items, tags or vendors to /onboarding,
  // which carries no settings card to click. The flag is read at
  // `__root.tsx` lines 77-79; `addInitScript` re-applies it on every document
  // load, including the reload `doEnableSwitch` triggers.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
})

test.beforeEach(async ({ request }) => {
  await cleanupCloudData(request)
})

test.afterEach(async ({ page, request }) => {
  await cleanupCloudData(request)

  // Every test gets a fresh browser context, so nothing below can reach the next
  // test. It is cleared anyway: this branch made `PostLoginMigrationDialog` —
  // which can wipe a cloud account — mount in every cloud spec, and a leftover
  // `migration-strategy` key is the one thing that could then matter.
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(
      dbs.map(({ name }) => {
        return new Promise<void>((resolve, reject) => {
          if (!name) {
            resolve()
            return
          }
          const req = indexedDB.deleteDatabase(name)
          req.onsuccess = () => resolve()
          req.onerror = () => reject(req.error)
          req.onblocked = () => {
            console.warn(
              `[afterEach] IndexedDB delete blocked for "${name}" — data may persist`,
            )
            resolve()
          }
        })
      }),
    )
    // `clear()` covers `migration-strategy` and `migration-prompted` along with
    // `data-mode` and the onboarding flag — there is no key here worth keeping.
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('user can switch from offline to cloud mode and clear & import their local data', async ({
  page,
  request,
  baseURL,
}) => {
  // NO `test.setTimeout` HERE, AND THAT WAS MEASURED RATHER THAN ASSUMED. This
  // test does a cloud seed, two full document loads, a three-dialog UI walk, an
  // IndexedDB seed and a whole cloud import. Measured 2026-10-08 on this branch,
  // three consecutive runs at load average 2.3-4.8: 17.7s, 17.2s, 17.6s — inside
  // Playwright's default 30s budget. `settings/import-export-cloud.spec.ts`
  // raises it to 60000 on its one 36.5s round-trip test; this one does not need
  // that, and leaving the default in place is what lets a future slowdown report
  // itself.

  // ── Given a cloud account holding one row the local pantry does not name ────
  // Only `clear` deletes it. See `CLOUD_DESTINATION` above: without this seed
  // the mutation check that presses "Overwrite conflicts" instead passes.
  await seedCloudFixture(request, CLOUD_DESTINATION)
  expect(await readCloudItemNamesById(request)).toEqual({
    [CLOUD_ONLY_ITEM_ID]: CLOUD_ONLY_ITEM_NAME,
  })

  // ── And a local pantry on the SAME origin the cloud app runs on ──────────────
  // THE LOCAL-MODE BOOT MUST COME BEFORE THE SEED, AND THAT WAS MEASURED.
  // `main.tsx` line 107 calls `db.open()` only when the mode it read at line 27
  // is `local`, so in cloud mode Dexie has never created the schema. Measured
  // 2026-10-08 on the cloud origin: in cloud mode `indexedDB.databases()` lists
  // only `Player1InventoryCloudCache`, and after `data-mode=local` plus a reload
  // it lists `Player1Inventory` at IDB version 180 (Dexie v18) with all eleven
  // stores. Seeding before that boot would make `indexedDB.open` create an empty
  // database with no object stores, and `seedRows` would throw `NotFoundError`.
  await page.goto('/')
  await page.evaluate(() => {
    // DATA_MODE_STORAGE_KEY in apps/web/src/lib/dataMode.ts. `main.tsx` line 27
    // reads it once per document load, and the cloud project's `storageState`
    // applies at context creation only, so this write plus a reload sticks.
    localStorage.setItem('data-mode', 'local')
  })
  await page.reload()
  await page.waitForLoadState('load')
  await seedLocalFixture(page, LOCAL_PANTRY)

  // The local seed really landed. A seed that wrote nothing would make the `clear`
  // import copy an empty pantry up, and the final readback would fail several
  // steps later with no hint that the seed was the cause. These two assertions
  // make the failure name the seed.
  expect((await readRows(page, 'items')) as unknown as ItemRow[]).toEqual([
    expect.objectContaining({ id: ITEM_ID, name: ITEM_NAME }),
  ])
  expect(
    ((await readRows(page, 'locations')) as unknown as { name: string }[])
      .map((row) => row.name)
      .sort(),
  ).toEqual(
    [FIXTURE_DEFAULT_LOCATION_NAME, ...FIXTURE_NON_DEFAULT_LOCATION_NAMES].sort(),
  )

  // ── When the user walks the switch flow and picks "Clear & import" ───────────
  // SCOPED TO role="alertdialog" THROUGHOUT. `DataModeCard`'s three dialogs are
  // built on src/components/ui/alert-dialog.tsx (Radix `AlertDialog`), while
  // `ImportCard`'s conflict dialog on the same page is a Radix `Dialog` with
  // role="dialog". The role is what keeps "Clear & import" — the same visible
  // string in both — from matching the wrong one. Only one of the three
  // alertdialogs is open at a time.
  await page.goto('/settings')
  const dialog = page.getByRole('alertdialog')

  // t('settings.dataMode.local.enableButton') = "Switch..."
  await page.getByRole('button', { name: 'Switch...' }).click()
  // t('settings.dataMode.enableDialog.enable') = "Switch to cloud"
  await dialog.getByRole('button', { name: /switch to cloud/i }).click()
  // t('settings.dataMode.enableCopyDialog.yes') = "Yes, copy data"
  await dialog.getByRole('button', { name: 'Yes, copy data' }).click()
  // t('settings.dataMode.enableStrategyDialog.clearAndImport') = "Clear & import"
  await dialog.getByRole('button', { name: 'Clear & import' }).click()

  // ── Then the auto-import branch runs, and it is SEEN running ─────────────────
  // ASSERTING THE MECHANISM, NOT ONLY THE OUTCOME. This dialog renders only
  // while `usePostLoginMigration`'s state is `auto-importing`
  // (PostLoginMigrationDialog.tsx), which only the stored-strategy branch of the
  // hook's effect can set. Data that arrived by any other route would leave this
  // dialog unrendered.
  // t('settings.postLoginMigration.autoImporting') = "Copying local data to cloud…"
  await expect(
    page.getByText('Copying local data to cloud…'),
  ).toBeVisible()

  // And the keys the flow is steered by end up consumed.
  //
  // THIS PAIR IS WHAT PROVES THE HOOK RAN TO COMPLETION, and neither half proves
  // it alone. `migration-strategy` is removed on both the success and the failure
  // path of the auto-import; `migration-prompted` is written on success, and also
  // by the hook's OTHER branch when there is no strategy and no local item. Only
  // a successful auto-import does both.
  await expect
    .poll(() => readMigrationKeys(page), { timeout: 60000, intervals: [500] })
    .toEqual({ mode: 'cloud', strategy: null, prompted: '1' })

  // ── And the local pantry REPLACED the cloud account's contents ──────────────
  // EXACTLY the payload's one item. The absence of `Cloud Only Item` is what
  // only `clear` can produce — `replace` and `skip` both leave it where it is.
  expect(await readCloudItemNamesById(request)).toEqual({
    [ITEM_ID]: ITEM_NAME,
  })

  // All three locations, each holding its OWN quantities.
  //
  // The default's expected name is the DESTINATION's, not the fixture's.
  // `clearAllData` deletes every `Location` row; `fetchCloudDefaultLocationId`
  // then reads the list, which makes `ensureDefaultLocation` create a fresh
  // default called "My Home"; the remap puts the payload's default row onto that
  // id, and `bulkCreateLocations` skips a row whose id is already taken. So the
  // backup's "Fixture Home" does not survive in cloud mode, which is PR 4b task
  // 4's choice rather than a defect — see `helpers/backupAssertions.ts`.
  await expectFixtureStockPerLocation(
    page,
    request,
    baseURL,
    ITEM_ID,
    DESTINATION_DEFAULT_LOCATION_NAME,
  )
})
