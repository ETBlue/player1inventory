import { defineConfig, devices } from '@playwright/test'
import {
  CLOUD_GRAPHQL_URL,
  CLOUD_GRAPHQL_WS_URL,
  CLOUD_SERVER_PORT,
  CLOUD_WEB_PORT,
  CLOUD_WEB_URL,
  E2E_USER_ID,
  LOCAL_WEB_PORT,
  LOCAL_WEB_URL,
  PWA_WEB_PORT,
  PWA_WEB_URL,
} from './constants'
import { cloudProjectFor, e2eDatabaseKind } from './helpers/e2eDatabase'
import {
  type ProjectName,
  requestedProjects,
  selectedProjects,
} from './helpers/selectedProjects'
import { assertNeonSpecsInCloud, NEON_SPECS, neonPattern } from './neonSpecs'

// Which database the cloud specs use (E2E speed plan, task S.8, decisions D9
// and D11). `E2E_DATABASE=neon` runs them on the Neon TEST branch, in the
// `cloud-neon` project; unset or `local` runs them on the local E2E database,
// in the `cloud` project (owner answer P7-A). `e2e/run-all.sh` sets it per row.
// An unknown value throws here, before any server starts.
const E2E_DATABASE = e2eDatabaseKind()
const CLOUD_PROJECT = cloudProjectFor(E2E_DATABASE)

// A project named on the command line that this database does not build would
// fail with Playwright's own "Project(s) not found". This says what to change.
const requested = requestedProjects()
if (requested?.includes('cloud-neon') && CLOUD_PROJECT !== 'cloud-neon') {
  throw new Error(
    'The cloud-neon project runs only with E2E_DATABASE=neon. ' +
      'Run: E2E_DATABASE=neon pnpm test:e2e --project=cloud-neon',
  )
}
if (requested?.includes('cloud') && CLOUD_PROJECT !== 'cloud') {
  throw new Error(
    'With E2E_DATABASE=neon the cloud specs run in the cloud-neon project. ' +
      'Use --project=cloud-neon, or unset E2E_DATABASE to use the local database.',
  )
}

const LOCAL_WEB_SERVER = {
  // Local-mode web app — always start fresh on a dedicated port to avoid
  // conflicts with a dev server running in another worktree.
  command: `pnpm --filter web dev --port ${LOCAL_WEB_PORT}`,
  url: LOCAL_WEB_URL,
  reuseExistingServer: false,
  timeout: 60000,
}

const CLOUD_WEB_SERVER = {
  // Cloud-mode web app — always start fresh with E2E env vars:
  //   VITE_E2E_TEST_USER_ID: skips Clerk, renders with a static userId
  //   VITE_GRAPHQL_HTTP_URL: points Apollo at the E2E backend (not the dev server)
  //   VITE_GRAPHQL_WS_URL: the live-updates socket on the same E2E backend.
  //     Without it the socket would go to the default ws://localhost:4000,
  //     the normal dev server, and no live update would ever arrive
  command: [
    `VITE_E2E_TEST_USER_ID=${E2E_USER_ID}`,
    `VITE_GRAPHQL_HTTP_URL=${CLOUD_GRAPHQL_URL}`,
    `VITE_GRAPHQL_WS_URL=${CLOUD_GRAPHQL_WS_URL}`,
    `pnpm --filter web dev --port ${CLOUD_WEB_PORT}`,
  ].join(' '),
  url: CLOUD_WEB_URL,
  reuseExistingServer: false,
  timeout: 60000,
}

const CLOUD_API_SERVER = {
  // Cloud-mode backend — dedicated port avoids conflicts with the normal dev
  // server. E2E_TEST_MODE bypasses Clerk auth and mounts the /e2e/* routes.
  //
  // Which database: `E2E_DATABASE` (above) is passed on the command, so the
  // server and this config read the same value. apps/server/src/lib/prisma.ts
  // then picks the URL from apps/server/.env, which dotenv loads inside the
  // server process, never in this shell: `local` reads E2E_LOCAL_DATABASE_URL
  // (refused unless it is a loopback host and no other *_URL names the same
  // database), `neon` reads TEST_DATABASE_URL, a dedicated Neon branch. Each
  // throws rather than fall back to another database. `e2e/global-setup.ts`
  // asks `GET /e2e/database` which one the server really uses, and stops the
  // run when it is not the expected one or is behind the migrations.
  command: [
    'E2E_TEST_MODE=true',
    `E2E_DATABASE=${E2E_DATABASE}`,
    `PORT=${CLOUD_SERVER_PORT}`,
    `CLIENT_ORIGIN=${CLOUD_WEB_URL}`,
    'pnpm --filter server dev',
  ].join(' '),
  url: CLOUD_GRAPHQL_URL,
  reuseExistingServer: false,
  timeout: 60000,
}

const PWA_WEB_SERVER = {
  // PWA-mode web app — the dev server has no service worker, so these
  // tests run against the built preview output on a dedicated port.
  command: `pnpm --filter web build && pnpm --filter web preview --port ${PWA_WEB_PORT} --strictPort`,
  url: PWA_WEB_URL,
  reuseExistingServer: !process.env.CI,
  timeout: 180_000,
}

// Which servers each project needs. The cloud projects are the only ones that need
// two: its web app talks to the API server over GraphQL. No spec in `local` or
// `pwa` reaches the API server — every spec that names CLOUD_SERVER_URL,
// CLOUD_GRAPHQL_URL, makeGql, cleanupCloudData, seedCloudFixture or
// ensureCloudHomeLocation is either cloud-only or guarded on
// `baseURL === CLOUD_WEB_URL`.
//
// One spec crosses projects: a11y.spec.ts runs in BOTH `local` and `pwa`, and its
// `offline banner a11y` block sets `baseURL: PWA_WEB_URL` for its two tests. Those
// two are skipped outside the `pwa` project (see the comment in that block), so
// `local` genuinely needs only its own web server. Without that skip, a
// `--project=local` run fails both of them with
// `net::ERR_CONNECTION_REFUSED at http://localhost:5176/`.
const SERVERS_BY_PROJECT: Record<ProjectName, (typeof LOCAL_WEB_SERVER)[]> = {
  local: [LOCAL_WEB_SERVER],
  cloud: [CLOUD_WEB_SERVER, CLOUD_API_SERVER],
  'cloud-neon': [CLOUD_WEB_SERVER, CLOUD_API_SERVER],
  pwa: [PWA_WEB_SERVER],
}

// Every spec file the cloud projects run. `cloud` runs all of them on the
// local database; `cloud-neon` runs the `NEON_SPECS` subset on Neon, or all of
// them when `E2E_NEON_FULL=1` (`pnpm test:e2e:all:neon`, owner answer P10-A).
const CLOUD_SPECS = [
  '**/item-management.spec.ts',
  '**/settings/tags.spec.ts',
  '**/settings/vendors.spec.ts',
  '**/settings/recipes.spec.ts',
  '**/cooking.spec.ts',
  '**/item-list-state-restore.spec.ts',
  '**/tests/shopping.spec.ts',
  '**/tests/item-logs.spec.ts',
  '**/settings/import-export-cloud.spec.ts',
  '**/settings/import-strategies.spec.ts',
  '**/settings/data-mode-migration.spec.ts',
  '**/settings/locations.spec.ts',
  '**/location-switcher.spec.ts',
  '**/location-not-stocked-here.spec.ts',
  '**/location-scoped-writes.spec.ts',
  '**/recipes-group.spec.ts',
  '**/vendors-group.spec.ts',
  '**/tests/shelves.spec.ts',
  '**/settings/shelves.spec.ts',
  '**/settings-global-pages.spec.ts',
  '**/item-stock-input.spec.ts',
  '**/item-stock-pager.spec.ts',
  '**/cleanup-endpoint.spec.ts',
  '**/cart-id-cross-user-leak.spec.ts',
  '**/unified-item-search.spec.ts',
  '**/cloud-user-row.spec.ts',
  '**/purge-two-households.spec.ts',
  '**/cloud-roles.spec.ts',
  '**/household-member-cleanup.spec.ts',
  '**/shared-cart.spec.ts',
  '**/live-cart.spec.ts',
  '**/live-pantry.spec.ts',
  '**/settings/import-households.spec.ts',
  '**/shared-household.spec.ts',
  '**/household-invites.spec.ts',
  '**/location-people.spec.ts',
  '**/household-activity-purges.spec.ts',
  '**/household-ownership.spec.ts',
  '**/household-switch.spec.ts',
  '**/location-sort.spec.ts',
  // Save in the unsaved-changes dialog (2026-11-25). Runs in local too.
  '**/unsaved-dialog-save.spec.ts',
]

// A `NEON_SPECS` entry that is not in the list above throws here, at load, so
// a typo cannot select zero tests and pass (decision D13).
assertNeonSpecsInCloud(CLOUD_SPECS)

const cloudTestMatch =
  CLOUD_PROJECT === 'cloud-neon' && process.env.E2E_NEON_FULL !== '1'
    ? NEON_SPECS.map(({ spec }) => neonPattern(spec))
    : CLOUD_SPECS

const webServer = [
  ...new Set(selectedProjects().flatMap((name) => SERVERS_BY_PROJECT[name])),
]

// A JSON report next to the HTML one, only when `PLAYWRIGHT_JSON_OUTPUT_FILE` is
// set. `e2e/run-all.sh` sets it to `e2e-results/<project>.json`, and
// `scripts/spec/e2e-times.mjs` prints the time of every test from it.
//
// The console summary ("170 passed (3.8m)") that run-all.sh reads still
// prints: neither `html` nor `json` with an output file writes to the terminal,
// so Playwright adds its `line` reporter in front of them (`createReporters` in
// playwright/lib/runner/reporters.js, Playwright 1.58). The JSON reporter
// reads the file name from the variable itself.
const reporter: 'html' | [string][] = process.env.PLAYWRIGHT_JSON_OUTPUT_FILE
  ? [['html'], ['json']]
  : 'html'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // cloud tests share one real database — run all tests serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter,
  // Once per invocation, after the `webServer` entries are up: when the
  // `cloud` project is selected, it deletes every E2E user and household that
  // a killed run left behind (E2E speed plan, task S.3; see the file).
  globalSetup: './global-setup.ts',
  // Shared by all three projects. Playwright 1.58 merges this top-level `use`
  // with each project's own `use` key by key (`mergeObjects` in
  // playwright/lib/util.js), and a project key wins. No project sets
  // `screenshot`, so this value reaches all three.
  use: {
    // Spec reports (`pnpm spec:publish`) attach a screenshot to every test, so a
    // non-developer can see the screen. Normal runs keep the default (off), which
    // keeps the report small and the run fast.
    screenshot: process.env.SPEC_REPORT === '1' ? 'on' : 'off',
  },
  projects: [
    {
      // Local mode: app reads from IndexedDB (Dexie). No backend needed.
      name: 'local',
      // pwa-offline.spec.ts needs a real service worker, which the dev
      // server this project runs against does not have — it only runs
      // under the 'pwa' project, against the built preview output.
      // location-scoped-writes.spec.ts, cleanup-endpoint.spec.ts,
      // cart-id-cross-user-leak.spec.ts, cloud-user-row.spec.ts,
      // purge-two-households.spec.ts, cloud-roles.spec.ts,
      // household-member-cleanup.spec.ts and shared-cart.spec.ts drive the
      // cloud backend directly and never open a page — none has a local-mode
      // counterpart. live-cart.spec.ts and live-pantry.spec.ts open a page but need a second
      // (and live-cart a third) user and the live socket, which only the cloud project has. The last six also act as users other than E2E_USER_ID
      // through the API. settings/import-households.spec.ts tests the
      // household import roles, which local mode does not have (households H4
      // decision T18). shared-household.spec.ts opens two browser contexts as
      // two different users (households H5 task F.8): the E2E web build reads
      // `localStorage['e2e-user-id']` (e2e/helpers/userContext.ts). Local mode
      // has no users and no roles. household-invites.spec.ts tests invites,
      // joins and the Members page (households H5b task G.10), which exist in
      // cloud mode only. location-people.spec.ts tests the people page of a
      // location (households H5c task H.8), which is cloud only: local mode
      // has one person and no roles, and the page redirects there.
      // household-activity-purges.spec.ts tests the Activity page and the
      // danger zones (households H6 task J.8), which are cloud only too.
      // household-ownership.spec.ts tests the ownership transfer and the
      // hand-over (households H6b task K.8): local mode has no owner.
      // household-switch.spec.ts tests Switch to…, Create new, the stale-tab
      // refusal and the copy into a chosen household (households H7 task
      // L.6): local mode has no households. location-sort.spec.ts tests the
      // personal location order and the four sorts (households H7b task
      // M.5): local mode has no second person, no "last updated" date and no
      // visits. Local mode's Name and Custom are tested in
      // settings/locations.spec.ts.
      testIgnore: [
        '**/settings/import-export-cloud.spec.ts',
        '**/pwa-offline.spec.ts',
        '**/location-scoped-writes.spec.ts',
        '**/cleanup-endpoint.spec.ts',
        '**/cart-id-cross-user-leak.spec.ts',
        '**/settings/data-mode-migration.spec.ts',
        '**/cloud-user-row.spec.ts',
        '**/purge-two-households.spec.ts',
        '**/cloud-roles.spec.ts',
        '**/household-member-cleanup.spec.ts',
        '**/shared-cart.spec.ts',
        '**/live-cart.spec.ts',
        '**/live-pantry.spec.ts',
        '**/settings/import-households.spec.ts',
        '**/shared-household.spec.ts',
        '**/household-invites.spec.ts',
        '**/location-people.spec.ts',
        '**/household-activity-purges.spec.ts',
        '**/household-ownership.spec.ts',
        '**/household-switch.spec.ts',
        '**/location-sort.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'], baseURL: LOCAL_WEB_URL },
    },
    {
      // Cloud mode: app reads from Postgres via GraphQL. Named `cloud` on the
      // local database and `cloud-neon` on the Neon TEST branch; only one of
      // the two exists in one invocation (decision D11). Both use the same
      // web port, so every spec's `baseURL === CLOUD_WEB_URL` check holds,
      // and the same API server, which can use only one database at a time.
      name: CLOUD_PROJECT,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: CLOUD_WEB_URL,
        // Pre-set data-mode=cloud so main.tsx boots in cloud mode from the very first
        // navigation. Each test gets a fresh browser context, so this runs per test.
        storageState: {
          cookies: [],
          origins: [
            {
              origin: CLOUD_WEB_URL,
              localStorage: [{ name: 'data-mode', value: 'cloud' }],
            },
          ],
        },
      },
      testMatch: cloudTestMatch,
    },
    {
      // The dev server has no service worker. It only exists in a real build,
      // so these tests run against the built output.
      name: 'pwa',
      use: { ...devices['Desktop Chrome'], baseURL: PWA_WEB_URL },
      testMatch: ['**/pwa-offline.spec.ts', '**/a11y.spec.ts'],
    },
  ],
  webServer,
})
