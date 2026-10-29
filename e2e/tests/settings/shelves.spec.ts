import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { CLOUD_WEB_URL } from '../../constants'
import { seedCloudFixture } from '../../helpers/cloudSeed'
import { cleanupCloudData } from '../../helpers/cloudTeardown'
import type { Fixture } from '../../helpers/fixture'
import { seedLocalFixture } from '../../helpers/localSeed'
import { readRows } from '../../helpers/locationSeed'
import { makeGql } from '../../utils/cloud'

// Deleting a shelf from its own settings page, and the navigation that follows.
//
// RUNS IN BOTH PROJECTS as of issue #323 task 1. It used to seed IndexedDB by
// hand — `page.evaluate` plus `indexedDB.open('Player1Inventory')` and a direct
// `objectStore('shelves').put(...)`, not even `seedRows`. That seed named
// nothing in cloud, where a shelf row lives in Postgres.
//
// The fixture is now described ONCE as plain data (helpers/fixture.ts) and
// translated per mode — `seedLocalFixture` writes IndexedDB, `seedCloudFixture`
// writes Postgres through GraphQL. `tests/shelves.spec.ts` (the pantry group
// view, a different file with the same basename) was converted the same way.
//
// WHAT THE CLOUD RUN ADDS: the first real-SQL coverage of two resolvers.
//
//   `shelf(id:)`    apps/server/src/resolvers/shelf.resolver.ts:17
//   `deleteShelf`   apps/server/src/resolvers/shelf.resolver.ts:50
//
// Neither was reached by any cloud spec before. `tests/shelves.spec.ts` only
// loads `/?groupBy=shelf`, which runs `GetShelves` — never `shelf(id:)`. The
// only other spec that opens a shelf detail view is `a11y.spec.ts`, and that
// runs in `local` and `pwa`, not `cloud`. This spec passes through three
// `useShelfQuery` call sites — `ShelfDetailView` for the pantry detail view,
// then `$shelfId.tsx` (the settings layout) and `$shelfId/index.tsx` (its info
// tab). Three call sites, not three round trips: Apollo serves the same query
// and variables from its cache. It reaches `deleteShelf` once, through
// `useDeleteShelfMutation`'s cloud branch.
//
// THE GUARD IS THE READBACK, NOT THE SCREEN. The version of this test that
// ran only in `local` ended on `expect(page.getByText('My Test Shelf'))
// .not.toBeVisible()`, and that assertion cannot fail. Measured 2026-10-12 in
// `cloud` with `deleteShelf` turned into a no-op that returns true: the run
// passed in 11.1s. `/settings/shelves` renders an EMPTY list while its
// `GetShelves` refetch is still in flight, so `not.toBeVisible()` is satisfied
// by that first paint and the test is over before the real data arrives. The
// same probe with a 3s wait inserted failed, naming the row that was still
// there:
//
//   9 x locator resolved to <a ... href="/settings/shelves/bbbbbbbb-...">
//   My Test Shelf</a> - unexpected value "visible"
//
// So `readShelves` below reads the row back out of the backend. A fixed sleep
// would have worked too and would have gone stale; reading state does not.
// `helpers/stockReadback.ts` is the same idea for `ItemStock`.
//
// WHAT THIS SPEC CANNOT CATCH: it seeds ONE location and NO items. It says
// nothing about location scoping or about shelf membership.

const SHELF_ID = 'bbbbbbbb-0000-0000-0000-000000000001'

// One empty selection shelf, one default location, nothing else. The shelf id
// is a fixed string because the spec navigates by literal id; `ShelfInput`
// declares `id: ID!`, so cloud keeps the same value rather than minting a cuid.
const FIXTURE: Fixture = {
  // The default location must be listed first — `seedLocalFixture` writes
  // `order: index`, so moving it changes the local page order while cloud stays
  // silent (helpers/cloudSeed.ts skips the default entirely).
  locations: [{ key: 'HOME', name: 'My Home', isDefault: true }],
  vendors: [],
  items: [],
  stocks: [],
  shelves: [
    {
      id: SHELF_ID,
      name: 'My Test Shelf',
      type: 'selection',
      order: 1,
      itemIds: [],
    },
  ],
  recipes: [],
}

/** Seed `fixture` into whichever backend this project runs against. */
async function seedFixture(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  fixture: Fixture,
): Promise<void> {
  if (baseURL === CLOUD_WEB_URL) {
    await seedCloudFixture(request, fixture)
    return
  }
  await seedLocalFixture(page, fixture)
}

const SHELVES_QUERY = `query { shelves { id name } }`

/**
 * Every shelf row in whichever backend this project runs against.
 *
 * A cloud run has no IndexedDB, so `readRows(page, 'shelves')` returns an empty
 * array there and any assertion built on it would pass against every
 * implementation. `shelves` is the server-side twin, and the same query the
 * settings page itself runs.
 */
async function readShelves(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<{ id: string; name: string }[]> {
  if (baseURL === CLOUD_WEB_URL) {
    const gql = makeGql(request)
    const { shelves } = await gql<{ shelves: { id: string; name: string }[] }>(
      SHELVES_QUERY,
    )
    return shelves
  }
  const rows = (await readRows(page, 'shelves')) as unknown as {
    id: string
    name: string
  }[]
  return rows
}

test.beforeEach(async ({ page, request, baseURL }) => {
  // Prevent empty-data redirect to /onboarding so tests can navigate freely.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  if (baseURL === CLOUD_WEB_URL) {
    // Guards against a previous run that crashed before its teardown.
    await cleanupCloudData(request)
  }
})

test.afterEach(async ({ page, request, baseURL }) => {
  if (baseURL === CLOUD_WEB_URL) {
    // Cloud mode: delete this user's rows through the E2E cleanup endpoint.
    await cleanupCloudData(request)
    return
  }
  // Local mode: clear IndexedDB, localStorage, and sessionStorage.
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
              `[afterEach] IndexedDB delete blocked for "${name}"...`,
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

test('user lands on /shelves after deleting a shelf from its settings page', async ({
  page,
  request,
  baseURL,
}) => {
  // Given: an empty selection shelf
  await seedFixture(page, request, baseURL, FIXTURE)

  // When: navigate to the shelf group-by view and verify the shelf card is visible
  await page.goto('/?groupBy=shelf')
  // ShelfCard renders shelf name in a <p> with capitalize class (src/components/shelf/ShelfCard/ShelfCard.tsx:29)
  await expect(page.getByText('My Test Shelf')).toBeVisible()

  // When: navigate directly to the shelf detail view
  await page.goto(`/?groupBy=shelf&id=${SHELF_ID}`)
  await page.waitForURL(`/?groupBy=shelf&id=${SHELF_ID}`)

  // When: navigate directly to the shelf settings info tab
  // (avoids using the link from the detail page which triggers navigation history issues)
  // The info tab is at /settings/shelves/$shelfId/ (with trailing slash)
  await page.goto(`/settings/shelves/${SHELF_ID}/`)
  await page.waitForURL(`/settings/shelves/${SHELF_ID}/`)

  // When: wait for the ShelfInfoTab form to render and the form state to initialize
  // (useEffect in ShelfInfoTab sets name from shelf data; isDirty becomes false once initialized)
  // ShelfInfoTab wraps content in a <form> with a "Save" button (src/routes/settings/shelves/$shelfId/index.tsx:185)
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()

  // Then: the name input carries the shelf's own name. This is the one
  // assertion on what `shelf(id:)` RETURNS rather than on whether it returned
  // anything. Without it, a resolver that answered with a blank name would
  // still render a Save button and the test would pass.
  // Input: aria-label="Shelf name", value={name} set from shelf.name
  // (src/routes/settings/shelves/$shelfId/index.tsx:106-109)
  await expect(page.getByRole('textbox', { name: 'Shelf name' })).toHaveValue(
    'My Test Shelf',
  )

  // When: click the "Delete shelf" trigger button to open the delete dialog
  // DeleteButton trigger prop: "Delete shelf" (src/routes/settings/shelves/$shelfId/index.tsx:196)
  await page.getByRole('button', { name: 'Delete shelf' }).click()

  // When: confirm in the dialog by clicking the destructive confirm button
  // DeleteButton uses AlertDialogAction with t('common.delete') = "Delete" (src/components/shared/DeleteButton/DeleteButton.tsx:84)
  // Use Promise.all to handle navigation that occurs when deletion succeeds (unmounts the dialog)
  // Pattern from e2e/pages/ItemPage.ts:delete()
  await Promise.all([
    page.waitForURL(/\/settings\/shelves\/?$/),
    page
      .getByRole('alertdialog')
      .getByRole('button', { name: /delete/i })
      .click(),
  ])

  // Then: URL becomes /settings/shelves (post-delete navigation — src/routes/settings/shelves/$shelfId/index.tsx)
  // (already asserted by waitForURL in Promise.all above)

  // Then: the shelf row is gone from the backend. THIS is the assertion that
  // fails when `deleteShelf` stops deleting — see the header comment.
  const remaining = await readShelves(page, request, baseURL)
  expect(remaining.map((shelf) => shelf.name)).not.toContain('My Test Shelf')
  expect(remaining.map((shelf) => shelf.id)).not.toContain(SHELF_ID)

  // Then: and it is gone from the screen too. Kept because it is what the user
  // sees, but it is NOT the guard: on its own it passes against a no-op delete.
  await expect(page.getByText('My Test Shelf')).not.toBeVisible()
})
