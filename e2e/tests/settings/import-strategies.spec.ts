import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { CLOUD_WEB_URL } from '../../constants'
import {
  DESTINATION_DEFAULT_LOCATION_NAME,
  FIXTURE_DEFAULT_LOCATION_NAME,
  FIXTURE_STOCK_BY_LOCATION,
  expectFixtureStockPerLocation,
} from '../../helpers/backupAssertions'
import { seedCloudFixture } from '../../helpers/cloudSeed'
import { cleanupCloudData } from '../../helpers/cloudTeardown'
import type { Fixture } from '../../helpers/fixture'
import { seedLocalFixture } from '../../helpers/localSeed'
import { readRows } from '../../helpers/locationSeed'
import { readStockAt, readStocksForItem } from '../../helpers/stockReadback'
import { SettingsPage } from '../../pages/SettingsPage'
import { makeGql } from '../../utils/cloud'

// THE FIRST E2E COVERAGE OF THE `clear` AND `replace` IMPORT STRATEGIES.
//
// Until this file, only `skip` had ever run end to end. Both older import specs
// (`import-export-local.spec.ts`, `import-export-cloud.spec.ts`) start from an
// empty destination, so their payload raises no conflict, `ImportCard` never
// shows its conflict dialog, and `ImportCard.tsx`'s own no-conflict branch runs
// `skip` every time. `clear` matters most: it is the only strategy that calls
// `clearAllData` (cloud) / eleven `db.<table>.clear()` calls (local), and
// nothing had ever executed that.
//
// WHAT MAKES THE DIALOG APPEAR. `detectConflicts` (apps/web/src/lib/importData.ts)
// matches items by id OR by lowercased name. The destination seed below holds the
// backup's first item id under a DIFFERENT name, so the two match by id and
// `hasConflicts` is true. Nothing else in the seed is named by the backup, so
// `items` is the only entity type that conflicts — which is what makes the
// `replace` test's passes mixed in a way this file can describe exactly.
//
// THIS FILE RUNS IN BOTH PROJECTS. The flow is mode-neutral, and `importLocalData`
// has its own `clear` and `replace` branches, so the `local` run is the only thing
// that exercises the Dexie write path against a real IndexedDB. Every cloud-only
// call (`cleanupCloudData`, `seedCloudFixture`, `makeGql`) is guarded on
// `baseURL === CLOUD_WEB_URL`.

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../fixtures/strategy-backup.json',
)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const backup = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8')) as any

/** The backup item that MATCHES a row the destination already holds, by id. */
const COLLIDING_ITEM_ID = 'aaaaaaaa-0000-0000-0000-000000000004'
const COLLIDING_ITEM_BACKUP_NAME = 'Fixture Item'
/**
 * The name the DESTINATION gives that same id.
 *
 * It MUST differ from `COLLIDING_ITEM_BACKUP_NAME`. Were the two equal, "the
 * backup's row was written" and "the destination's row was left alone" would
 * give the same answer, and no name assertion below could fail.
 */
const COLLIDING_ITEM_SEED_NAME = 'Stale Name'

/**
 * The backup item the destination does NOT hold.
 *
 * ITS WHOLE PURPOSE IS TO MAKE THE `replace` FIXTURE MIXED. `partitionPayload`
 * sends a non-conflicting row to `toCreate` and a conflicting one to `toUpsert`,
 * so with this item present the `items` entity type has rows on BOTH passes.
 * A fixture where every item collides leaves `toCreate.items` empty, and then
 * issue #330 — `runBulkBatches`' batch key `${spec.entityType}:${i}` carries no
 * mode term, so the two passes share one key space — cannot show at all.
 */
const NEW_ITEM_ID = 'aaaaaaaa-0000-0000-0000-000000000104'
const NEW_ITEM_NAME = 'Backup New Item'

/**
 * The destination item the backup does not name at all.
 *
 * This row is what tells the three strategies apart: `clear` deletes it,
 * `replace` and `skip` keep it.
 */
const SEED_ONLY_ITEM_ID = 'bbbbbbbb-0000-0000-0000-000000000001'
const SEED_ONLY_ITEM_NAME = 'Seed Only Item'

/**
 * The destination's own quantities for the colliding item.
 *
 * NOTHING LIKE THE BACKUP'S (which are 2 / 4 / 1 at the default location — see
 * `FIXTURE_STOCK_BY_LOCATION` in helpers/backupAssertions.ts). Equal numbers
 * would make "the backup's quantities won" and "the destination's were kept"
 * the same answer.
 */
const SEED_COLLIDING_STOCK = {
  packedQuantity: 90,
  targetQuantity: 91,
  refillThreshold: 9,
}

/** The destination's own quantities for the row no strategy should rewrite. */
const SEED_ONLY_STOCK = {
  packedQuantity: 1,
  targetQuantity: 2,
  refillThreshold: 0,
}

/**
 * The destination, written the same way in both modes (helpers/fixture.ts).
 *
 * ONE LOCATION ONLY, named like the destination's own default. The backup brings
 * three locations of its own: its default is remapped onto this one, and
 * "Fixture Office" / "Fixture Cabin" are created with the backup's own ids. That
 * is the shape `helpers/backupAssertions.ts` was written for, and it is also the
 * only shape a static backup file can assert in cloud mode — `seedCloudFixture`
 * creates a non-default location through `createLocation`, which assigns a
 * server cuid that no fixture file can name in advance.
 */
const DESTINATION: Fixture = {
  locations: [
    { key: 'home', name: DESTINATION_DEFAULT_LOCATION_NAME, isDefault: true },
  ],
  vendors: [],
  items: [
    { id: COLLIDING_ITEM_ID, name: COLLIDING_ITEM_SEED_NAME },
    { id: SEED_ONLY_ITEM_ID, name: SEED_ONLY_ITEM_NAME },
  ],
  stocks: [
    { itemId: COLLIDING_ITEM_ID, location: 'home', ...SEED_COLLIDING_STOCK },
    { itemId: SEED_ONLY_ITEM_ID, location: 'home', ...SEED_ONLY_STOCK },
  ],
  shelves: [],
  recipes: [],
}

const isCloud = (baseURL: string | undefined) => baseURL === CLOUD_WEB_URL

/**
 * The name the default location answers to after a `clear` or `replace` import.
 * It is NOT the same in the two modes, and both answers are correct.
 *
 * `importLocations` (importData.ts) `bulkPut`s the whole location list for any
 * strategy that is not `skip`, so the LOCAL default row — remapped onto the
 * `'local'` sentinel — takes the backup's name, "Fixture Home". In CLOUD,
 * `bulkCreateLocations` (apps/server/src/resolvers/import.resolver.ts) skips a
 * row whose id is already taken, so the server's default keeps "My Home". That
 * difference was PR 4b task 4's choice, made so `locations` stays on the create
 * pass ahead of the carts and logs that name them.
 */
function expectedDefaultLocationName(baseURL: string | undefined): string {
  return isCloud(baseURL)
    ? DESTINATION_DEFAULT_LOCATION_NAME
    : FIXTURE_DEFAULT_LOCATION_NAME
}

type ItemRow = { id: string; name: string }

/**
 * `Record<itemId, itemName>` for every item the current backend holds.
 *
 * Mode-aware for the reason `helpers/stockReadback.ts` is: a cloud run has no
 * IndexedDB, so `readRows(page, 'items')` returns `[]` there and every assertion
 * built on it would pass against any implementation at all.
 */
async function readItemNamesById(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<Record<string, string>> {
  const rows: ItemRow[] = isCloud(baseURL)
    ? (await makeGql(request)<{ items: ItemRow[] }>(`query { items { id name } }`))
        .items
    : ((await readRows(page, 'items')) as unknown as ItemRow[])

  const byId: Record<string, string> = {}
  for (const row of rows) {
    if (byId[row.id] !== undefined) {
      throw new Error(`two items share the id "${row.id}"`)
    }
    byId[row.id] = row.name
  }
  return byId
}

/** Write `DESTINATION` into whichever backend this project runs against. */
async function seedDestination(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<string> {
  const locationIds = isCloud(baseURL)
    ? await seedCloudFixture(request, DESTINATION)
    : await seedLocalFixture(page, DESTINATION)
  return locationIds.home
}

/**
 * The backup file still says what these tests assume.
 *
 * Checked inside the tests rather than at module scope, because `expect` throws
 * outside a test. Without this, editing `strategy-backup.json` could make both
 * tests assert something they no longer describe.
 */
function expectBackupPreconditions() {
  expect(
    (backup.items as ItemRow[]).map((item) => [item.id, item.name]),
  ).toEqual([
    [COLLIDING_ITEM_ID, COLLIDING_ITEM_BACKUP_NAME],
    [NEW_ITEM_ID, NEW_ITEM_NAME],
  ])
  // The backup must carry `itemStocks`, or `upgradeLegacyPayload` treats it as a
  // pre-v15 payload — it branches on `payload.itemStocks !== undefined`, NOT on
  // `version` — and synthesises one stock row per item. Every quantity asserted
  // below would then be measuring the synthesiser, not the import.
  expect(Array.isArray(backup.itemStocks)).toBe(true)
  expect(Array.isArray(backup.locations)).toBe(true)
  // And neither of the two items the backup brings may be the seed-only row.
  expect(backup.items.map((item: ItemRow) => item.id)).not.toContain(
    SEED_ONLY_ITEM_ID,
  )
}

test.beforeEach(async ({ page }) => {
  // `__root.tsx` redirects an empty account to /onboarding, which would hide
  // the import card the moment the seed is cleared.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
})

test.beforeEach(async ({ request, baseURL }) => {
  if (isCloud(baseURL)) await cleanupCloudData(request)
})

test.afterEach(async ({ page, request, baseURL }) => {
  if (isCloud(baseURL)) {
    await cleanupCloudData(request)
    return
  }
  await page.goto('/')
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
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('user can clear existing data and import a backup over it', async ({
  page,
  request,
  baseURL,
}) => {
  // NO `test.setTimeout` HERE, AND THAT WAS MEASURED RATHER THAN ASSUMED.
  // Measured 2026-10-08 on this branch at load average ~6: this test takes
  // 18.1s in `cloud` and the whole file 7.3s in `local`, against Playwright's
  // default 30s budget. `settings/import-export-cloud.spec.ts` needs 60000 on
  // its one round-trip test because that one takes 36.5s; this one does not,
  // and leaving the default in place is what lets a future slowdown report
  // itself.
  const settings = new SettingsPage(page)
  const mode = isCloud(baseURL) ? 'cloud' : 'local'
  expectBackupPreconditions()

  // Given a destination holding one id the backup names and one it does not
  const defaultLocationId = await seedDestination(page, request, baseURL)
  expect(await readItemNamesById(page, request, baseURL)).toEqual({
    [COLLIDING_ITEM_ID]: COLLIDING_ITEM_SEED_NAME,
    [SEED_ONLY_ITEM_ID]: SEED_ONLY_ITEM_NAME,
  })
  expect(
    await readStockAt(
      page,
      request,
      baseURL,
      COLLIDING_ITEM_ID,
      defaultLocationId,
    ),
  ).toMatchObject(SEED_COLLIDING_STOCK)

  // When the backup is chosen, the conflict dialog reports the item match.
  // ASSERTING THE MECHANISM, not only the outcome: a dialog that never opened,
  // or one that found a conflict in some other entity type, would change which
  // passes `partitionPayload` fills and so change what this test proves.
  await settings.navigateTo()
  await settings.triggerImport(FIXTURE_PATH)
  const dialog = settings.getConflictDialog()
  // t('settings.import.conflictDialog.title') = "Conflicts detected"
  await expect(
    dialog.getByRole('heading', { name: 'Conflicts detected' }),
  ).toBeVisible()
  await expect(dialog).toContainText('Items (1):')
  await expect(dialog).toContainText(COLLIDING_ITEM_BACKUP_NAME)

  // And "Clear & import" is pressed
  await settings.chooseConflictStrategy('Clear & import')
  await settings.waitForImportDone(mode)

  // Then the account holds EXACTLY the backup's two items. This is the whole
  // proof: `skip` and `replace` both leave "Seed Only Item" where it is, so the
  // absence of that key here is what only `clear` can produce.
  expect(await readItemNamesById(page, request, baseURL)).toEqual({
    [COLLIDING_ITEM_ID]: COLLIDING_ITEM_BACKUP_NAME,
    [NEW_ITEM_ID]: NEW_ITEM_NAME,
  })

  // And its stock row went with it. Read by item rather than by location id,
  // because cloud's `clearAllData` deletes every Location row and
  // `ensureDefaultLocation` then re-creates the default with a NEW cuid — the id
  // the seed returned above no longer exists.
  expect(
    await readStocksForItem(page, request, baseURL, SEED_ONLY_ITEM_ID),
  ).toEqual([])

  // And the backup's three locations are back, each holding its own quantities
  await expectFixtureStockPerLocation(
    page,
    request,
    baseURL,
    COLLIDING_ITEM_ID,
    expectedDefaultLocationName(baseURL),
  )
})

test('user can replace the matching rows and keep everything else', async ({
  page,
  request,
  baseURL,
}) => {
  // Measured 13.5s in `cloud`, so the default 30s budget stands — see the note
  // on the `clear` test above.
  const settings = new SettingsPage(page)
  const mode = isCloud(baseURL) ? 'cloud' : 'local'
  expectBackupPreconditions()

  // Given the same destination: one colliding id with the wrong name and wrong
  // quantities, and one row the backup does not mention
  const defaultLocationId = await seedDestination(page, request, baseURL)
  expect(
    await readStockAt(
      page,
      request,
      baseURL,
      COLLIDING_ITEM_ID,
      defaultLocationId,
    ),
  ).toMatchObject(SEED_COLLIDING_STOCK)

  // When the backup is chosen and "Replace matches" pressed
  await settings.navigateTo()
  await settings.triggerImport(FIXTURE_PATH)
  const dialog = settings.getConflictDialog()
  await expect(
    dialog.getByRole('heading', { name: 'Conflicts detected' }),
  ).toBeVisible()
  // Exactly one item conflicts, so `items` has rows on BOTH of `replace`'s
  // passes — the colliding one on upsert, "Backup New Item" on create.
  await expect(dialog).toContainText('Items (1):')
  await settings.chooseConflictStrategy('Replace matches')
  await settings.waitForImportDone(mode)

  const names = await readItemNamesById(page, request, baseURL)

  // Then nothing was deleted — this is what separates `replace` from `clear`
  expect(names[SEED_ONLY_ITEM_ID]).toBe(SEED_ONLY_ITEM_NAME)
  // And the backup's new item was created, on the create pass
  expect(names[NEW_ITEM_ID]).toBe(NEW_ITEM_NAME)
  // And those three are all there is
  expect(Object.keys(names).sort()).toEqual(
    [COLLIDING_ITEM_ID, NEW_ITEM_ID, SEED_ONLY_ITEM_ID].sort(),
  )

  // And the colliding item's own stock row was OVERWRITTEN by the backup's.
  //
  // THIS IS THE REAL COVERAGE OF `replace`, AND IT IS ASSERTED HERE, ON ITS OWN,
  // BEFORE THE SHARED HELPER BELOW. `partitionPayload` puts every stock row on
  // the UPSERT pass under `replace` and none on the create pass, so
  // `bulkUpsertItemStocks` (cloud) / `importItemStocks` (local) really runs: each
  // deletes the destination's row for the same `(itemId, locationId)` pair and
  // writes the backup's. Under `skip` that row is left alone —
  // `stocksForItems(payload, itemIdsOf(itemsToCreate))` excludes a conflicting
  // item's stock — so this reads the seeded 90 instead of the backup's 2.
  //
  // Written as its own assertion because `expectFixtureStockPerLocation` checks
  // the LOCATION NAMES first and fails there under `skip`, which would leave this
  // quantity claim unproven. Root CLAUDE.md asks for exactly that distinction: an
  // assertion no mutation can single out is not evidence.
  expect(
    await readStockAt(
      page,
      request,
      baseURL,
      COLLIDING_ITEM_ID,
      defaultLocationId,
    ),
  ).toMatchObject(FIXTURE_STOCK_BY_LOCATION.DEFAULT)

  // And every location holds its own numbers, with exactly one default
  await expectFixtureStockPerLocation(
    page,
    request,
    baseURL,
    COLLIDING_ITEM_ID,
    expectedDefaultLocationName(baseURL),
  )

  // And the row the backup never mentioned kept its own numbers. `replace` must
  // not touch it: it is on neither pass. The default location's id is still the
  // one the seed returned, because `replace` deletes no Location row.
  expect(
    await readStockAt(
      page,
      request,
      baseURL,
      SEED_ONLY_ITEM_ID,
      defaultLocationId,
    ),
  ).toMatchObject(SEED_ONLY_STOCK)

  // And the colliding item's own NAME.
  //
  // THE TWO MODES DISAGREE HERE, AND ONLY ONE OF THEM IS RIGHT. Local mode
  // writes "Fixture Item": `importLocalData`'s `replace` branch calls
  // `db.items.bulkPut(toUpsert.items)` directly, with no batch bookkeeping.
  //
  // CLOUD MODE KEEPS "Stale Name", AND THAT IS ISSUE #330. `runBulkBatches`
  // (apps/web/src/lib/importData.ts) builds its resume key as
  // `${spec.entityType}:${i}` with NO term for the pass, and `bulkCreate` and
  // `bulkUpsert` share one `ImportSession`. The create pass sends "Backup New
  // Item" as batch `items:0` and records that key; the upsert pass then finds
  // `items:0` already present and SKIPS its own batch, so `bulkUpsertItems` is
  // never called and the destination's row is never overwritten.
  //
  // The expected value below therefore RECORDS THE DEFECT rather than hiding it.
  // Fixing #330 — adding the pass to the key — makes this assertion fail and say
  // so, which is the signal a reader needs. The stock assertion above is
  // unaffected, because `partitionPayload` gives `itemStocks` zero batches on the
  // create pass, so the upsert pass's `itemStocks:0` key is free.
  expect(names[COLLIDING_ITEM_ID]).toBe(
    isCloud(baseURL) ? COLLIDING_ITEM_SEED_NAME : COLLIDING_ITEM_BACKUP_NAME,
  )
})
