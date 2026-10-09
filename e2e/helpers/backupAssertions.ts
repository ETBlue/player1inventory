import { expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { readLocations, readStocksForItem } from './stockReadback'

// The location half of the import/export round-trip checks, shared by
// e2e/tests/settings/import-export-local.spec.ts and
// e2e/tests/settings/import-export-cloud.spec.ts.
//
// WHY THIS IS A SHARED MODULE AND NOT A THIRD COPY. Each of those specs had
// its own `verifyRelations`, and the two had already drifted — the local copy
// grew a seventh check for the shelf that the cloud copy never got. Neither
// asserted a location or a quantity at all, so every imported item could land
// in the WRONG location, or in no location at all, and both specs would still
// have passed. That gap is what PR 4b makes dangerous: task 6 deleted
// `mirrorStockToDefaultLocation`, the server-side mirror that used to stock
// every imported item at the caller's default location and so hid exactly this
// failure. Writing the location assertions once is what stops the two copies
// drifting again.
//
// BOTH FIXTURES (e2e/fixtures/local-backup.json and cloud-backup.json) DESCRIBE
// THE SAME THREE LOCATIONS, with the same quantities. Only the ids differ,
// which is the point: the local default is the `'local'` sentinel, the cloud
// default is a server-generated cuid, and the import remap rewrites the
// payload's default onto whichever one the destination holds.

/** The two locations whose NAME survives an import in both modes. */
export const FIXTURE_NON_DEFAULT_LOCATION_NAMES = [
  'Fixture Office',
  'Fixture Cabin',
]

/**
 * The name the FIXTURES give their default location.
 *
 * It is deliberately NOT `DESTINATION_DEFAULT_LOCATION_NAME`: a fixture whose
 * default was already called "My Home" could not tell "the backup's name was
 * applied" apart from "the destination's name was kept".
 */
export const FIXTURE_DEFAULT_LOCATION_NAME = 'Fixture Home'

/**
 * The name the DESTINATION's default location keeps after an import.
 *
 * It is the literal `'My Home'` in both modes: `apps/web/src/db/index.ts` line
 * 62 for Dexie's `on('populate')`, and `DEFAULT_LOCATION_NAME` in
 * `apps/server/src/lib/defaultLocation.ts` for `ensureDefaultLocation`.
 *
 * It is the right expected value for EVERY cloud import, and for a LOCAL import
 * that runs `skip`. The table further down says which case is which.
 *
 * THE BACKUP'S DEFAULT-LOCATION NAME DOES NOT SURVIVE A `skip` IMPORT, in either
 * mode, and that is correct rather than a defect. `ImportCard`
 * (apps/web/src/components/settings/ImportCard/ImportCard.tsx line 111) runs
 * the `skip` strategy whenever the payload raises no conflict, and `skip`
 * means "add what is missing, change nothing that is already there". The remap
 * has rewritten the backup's default row onto the id the destination already
 * holds, so that row is always the one `skip` leaves alone:
 *
 *   - local: `importLocations` filters it out by `existingIds`
 *     (apps/web/src/lib/importData.ts) and the live row keeps its own name;
 *   - cloud: `bulkCreateLocations` skips a row whose id is taken
 *     (apps/server/src/resolvers/import.resolver.ts), same outcome.
 *
 * Measured 2026-10-04: restoring a backup whose default was called "Fixture
 * Home" gave `[ "Fixture Cabin", "My Home", "Fixture Office" ]` in BOTH
 * projects. The two non-default locations keep their names, because they are
 * genuinely missing from the destination and so `skip` adds them.
 *
 * `clear` AND `replace` ARE NOT DIFFERENT FROM EACH OTHER HERE, AND THEY DIFFER
 * FROM `skip` IN LOCAL MODE ONLY. `importLocations` branches on
 * `strategy === 'skip'` and on nothing else, so both of the other two strategies
 * `bulkPut` the whole location list and the LOCAL default row takes the backup's
 * name. Cloud does not follow: `bulkCreateLocations` skips a row whose id is
 * already taken whatever the strategy, so the server's default keeps "My Home".
 * That split was PR 4b task 4's choice, made so `locations` stays on the create
 * pass ahead of the carts and logs that name them. A location row holds only a
 * name and an order, so no stock, cart or log is lost either way.
 *
 * SO A SPEC THAT RUNS `clear` OR `replace` IN BOTH PROJECTS MUST BRANCH ON
 * `baseURL === CLOUD_WEB_URL` for the default's expected name:
 *
 *   | strategy          | local expects                 | cloud expects                       |
 *   |-------------------|-------------------------------|-------------------------------------|
 *   | `skip`            | DESTINATION_DEFAULT_LOCATION_NAME | DESTINATION_DEFAULT_LOCATION_NAME |
 *   | `replace`, `clear`| FIXTURE_DEFAULT_LOCATION_NAME | DESTINATION_DEFAULT_LOCATION_NAME   |
 *
 * `e2e/tests/settings/import-strategies.spec.ts` does that branch, in its
 * `expectedDefaultLocationName` helper.
 *
 * WHAT COVERS `clear` AND `replace` — this paragraph used to read "WHAT NO TEST
 * HERE COVERS: the `clear` strategy", which stopped being true on 2026-10-08:
 *
 *   - `e2e/tests/settings/import-strategies.spec.ts` — `clear` and `replace`
 *     through `ImportCard`'s conflict dialog, in BOTH projects;
 *   - `e2e/tests/settings/data-mode-migration.spec.ts` — `clear` through
 *     `DataModeCard`'s switch-to-cloud flow, CLOUD only.
 *
 * THE CONFLICT DIALOG IS NOT THE ONLY DOOR, which that paragraph also got wrong.
 * `DataModeCard`'s `enableStrategyDialog` reaches `clear` with NO conflict and no
 * file at all: Settings → "Switch..." → "Switch to cloud" → "Yes, copy data" →
 * "Clear & import".
 *
 * THE BUTTON READS "Clear & import", not "clear and import". It is
 * `settings.import.conflictDialog.clear` in the conflict dialog and
 * `settings.dataMode.enableStrategyDialog.clearAndImport` in `DataModeCard` — the
 * same visible string in two different dialogs on the same settings page. A spec
 * matching on text alone must scope to the one it means: `ConflictDialog` is a
 * Radix `Dialog` (`role="dialog"`), `DataModeCard`'s three are Radix
 * `AlertDialog`s (`role="alertdialog"`).
 */
export const DESTINATION_DEFAULT_LOCATION_NAME = 'My Home'

/**
 * What each location holds after the round trip.
 *
 * `DEFAULT` is keyed by the `isDefault` FLAG, not by a name, because the two
 * strategies disagree about that name (see `DESTINATION_DEFAULT_LOCATION_NAME`) and
 * both answers are correct for their strategy.
 *
 * THE THREE ROWS CARRY THREE DIFFERENT QUANTITIES ON PURPOSE. With one
 * location, or with equal numbers, "each row kept its own location" and "every
 * row landed on the default" give the same answer, and no assertion here could
 * fail. That is the vacuous-fixture failure root CLAUDE.md describes.
 */
export const FIXTURE_STOCK_BY_LOCATION: Record<
  string,
  { packedQuantity: number; targetQuantity: number; refillThreshold: number }
> = {
  DEFAULT: { packedQuantity: 2, targetQuantity: 4, refillThreshold: 1 },
  'Fixture Office': { packedQuantity: 7, targetQuantity: 9, refillThreshold: 2 },
  'Fixture Cabin': { packedQuantity: 3, targetQuantity: 5, refillThreshold: 0 },
}

/**
 * Every fixture location survived the round trip, exactly one of them is the
 * default, and that one is called `defaultLocationName`.
 *
 * "Exactly one default" and "exactly three locations" are what catch a stray
 * extra location. A payload whose default row kept its own id lands BESIDE the
 * destination's own default instead of on it, which gives four locations and
 * two defaults in local mode (and, in cloud mode, a `P2002` on
 * `Location_one_default_per_user_key` after `clearAllData` has already run).
 *
 * Returns `Record<locationName, id>` with the default's id also under the key
 * `DEFAULT`.
 */
export async function expectFixtureLocations(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  defaultLocationName: string,
): Promise<Record<string, string>> {
  const locations = await readLocations(page, request, baseURL)

  expect(locations.map((l) => l.name).sort()).toEqual(
    [defaultLocationName, ...FIXTURE_NON_DEFAULT_LOCATION_NAMES].sort(),
  )
  expect(locations.filter((l) => l.isDefault).map((l) => l.name)).toEqual([
    defaultLocationName,
  ])

  const ids: Record<string, string> = {}
  for (const location of locations) {
    if (ids[location.name] !== undefined) {
      throw new Error(
        `two locations are both called "${location.name}" — ${JSON.stringify(locations)}`,
      )
    }
    ids[location.name] = location.id
    if (location.isDefault) ids.DEFAULT = location.id
  }
  return ids
}

/**
 * The item's stock came back one row per location, each with its own numbers.
 *
 * Two independent things fail here if the location is lost:
 *
 *   1. the SET of locations holding a row — a collapse onto the destination's
 *      default leaves one row, not three;
 *   2. the NUMBERS in each row — the Office's 7 cannot be read at the default
 *      location, so a row written to the wrong location fails on its value
 *      even when the count happens to be right.
 */
export async function expectFixtureStockPerLocation(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  itemId: string,
  defaultLocationName: string,
): Promise<void> {
  const locationIds = await expectFixtureLocations(
    page,
    request,
    baseURL,
    defaultLocationName,
  )
  const rows = await readStocksForItem(page, request, baseURL, itemId)
  const roles = ['DEFAULT', ...FIXTURE_NON_DEFAULT_LOCATION_NAMES]

  // 1. One row per location, and no row anywhere else.
  const roleOf = (locationId: string) =>
    roles.find((role) => locationIds[role] === locationId) ?? locationId
  expect(rows.map((row) => roleOf(row.locationId)).sort()).toEqual(
    [...roles].sort(),
  )

  // 2. Each row's own quantities, read back at its own location.
  const actual: Record<string, unknown> = {}
  for (const role of roles) {
    const row = rows.find((r) => r.locationId === locationIds[role])
    actual[role] = row && {
      packedQuantity: row.packedQuantity,
      targetQuantity: row.targetQuantity,
      refillThreshold: row.refillThreshold,
    }
  }
  expect(actual).toEqual(FIXTURE_STOCK_BY_LOCATION)
}

/**
 * The non-default locations' stock is NOT at the default location.
 *
 * READ THIS AS A RESTATEMENT, NOT AS EXTRA COVERAGE.
 * `expectFixtureStockPerLocation` already fails on any collapse onto the
 * default, and it fails FIRST, so no mutation can single this function out.
 * All three of task 8's mutation checks were red at
 * `expectFixtureStockPerLocation` line 168 or at an earlier UI assertion; none
 * of them ever reached this body. Root `CLAUDE.md` asks for exactly this
 * label: an assertion that cannot be shown to catch something of its own is
 * not evidence, whatever it reports.
 *
 * It is kept because it says the rule in the words a reader needs — "the
 * payload's location, not the caller's default" — and because it reads the
 * default by its `isDefault` FLAG rather than by name, which is one fewer thing
 * to get wrong if the name assertions ever change. Do not count it toward
 * coverage, and do not add a third such restatement.
 */
export async function expectStockNotCollapsedOntoDefault(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  itemId: string,
): Promise<void> {
  const locations = await readLocations(page, request, baseURL)
  const defaultLocation = locations.find((l) => l.isDefault)
  if (!defaultLocation) {
    throw new Error(
      `expectStockNotCollapsedOntoDefault: no default location — got ${JSON.stringify(locations)}`,
    )
  }
  const rows = await readStocksForItem(page, request, baseURL, itemId)

  // Exactly one row sits at the default, carrying the default's own numbers.
  // Were every row collapsed onto it, there would be one row in total and its
  // quantity would be whichever row won.
  expect(
    rows
      .filter((row) => row.locationId === defaultLocation.id)
      .map((row) => row.packedQuantity),
  ).toEqual([FIXTURE_STOCK_BY_LOCATION.DEFAULT.packedQuantity])

  // And the other two rows are elsewhere.
  expect(
    rows.filter((row) => row.locationId !== defaultLocation.id).length,
  ).toBe(FIXTURE_NON_DEFAULT_LOCATION_NAMES.length)
}
