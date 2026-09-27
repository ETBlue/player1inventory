import { defineConfig, devices } from '@playwright/test'
import {
  CLOUD_GRAPHQL_URL,
  CLOUD_SERVER_PORT,
  CLOUD_SERVER_URL,
  CLOUD_WEB_PORT,
  CLOUD_WEB_URL,
  E2E_USER_ID,
  LOCAL_WEB_PORT,
  LOCAL_WEB_URL,
  PWA_WEB_PORT,
  PWA_WEB_URL,
} from './constants'

const PROJECT_NAMES = ['local', 'cloud', 'pwa'] as const
type ProjectName = (typeof PROJECT_NAMES)[number]

/**
 * Which projects did the CLI ask for? Returns all three when it cannot tell.
 *
 * WHY THIS EXISTS: Playwright starts EVERY `webServer` entry, whatever
 * `--project` says. There is no per-project `webServer`. Measured 2026-09-24 at
 * `c36e18a2`, running `pnpm test:e2e --project=local e2e/tests/onboarding.spec.ts`
 * (three local-mode tests that never leave IndexedDB) left all four ports
 * listening:
 *
 *   5174  cloud web app
 *   5175  local web app
 *   5176  pwa preview   <- and a full `pnpm --filter web build` ran first
 *   4001  API server
 *
 * So a filtered run paid the same startup cost as the full one. The gate in root
 * `CLAUDE.md` runs the three projects as three commands, which meant three
 * production builds per gate run. `webServer` below is built from this list so
 * each command starts only what it needs.
 *
 * FALLBACK RULE: when the selection cannot be read with confidence, return all
 * three. A parsing mistake then costs a slow run, never a missing server. That
 * happens when no `--project` is passed, when `--ui` or `--debug` is passed (the
 * user picks projects inside the UI, after this config has already been read),
 * or when a `--project` value is not exactly `local`, `cloud` or `pwa` — a glob
 * counts as unrecognised.
 */
function selectedProjects(): ProjectName[] {
  const argv: string[] = process.argv.slice(2)
  const selected = new Set<ProjectName>()

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    // The UI and debug runners let the user pick projects after startup.
    if (arg === '--debug' || arg.startsWith('--ui')) return [...PROJECT_NAMES]

    let values: string[] = []
    if (arg.startsWith('--project=')) {
      values = [arg.slice('--project='.length)]
    } else if (arg === '--project') {
      // Playwright's `--project` is variadic: `--project local cloud` is valid,
      // so consume every following argument up to the next flag.
      while (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        values.push(argv[++i])
      }
    } else {
      continue
    }

    for (const value of values) {
      if (!(PROJECT_NAMES as readonly string[]).includes(value)) return [...PROJECT_NAMES]
      selected.add(value as ProjectName)
    }
  }

  return selected.size > 0 ? [...selected] : [...PROJECT_NAMES]
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
  command: [
    `VITE_E2E_TEST_USER_ID=${E2E_USER_ID}`,
    `VITE_GRAPHQL_HTTP_URL=${CLOUD_GRAPHQL_URL}`,
    `pnpm --filter web dev --port ${CLOUD_WEB_PORT}`,
  ].join(' '),
  url: CLOUD_WEB_URL,
  reuseExistingServer: false,
  timeout: 60000,
}

const CLOUD_API_SERVER = {
  // Cloud-mode backend — dedicated port avoids conflicts with the normal dev
  // server. E2E_TEST_MODE bypasses Clerk auth and mounts the /e2e/cleanup route.
  //
  // Isolation note: E2E_TEST_MODE=true is read inside apps/server/src/lib/prisma.ts
  // (not here — TEST_DATABASE_URL lives in apps/server/.env, which dotenv loads
  // inside the server process, never in this shell) to route Prisma at
  // TEST_DATABASE_URL, a dedicated Neon branch — it throws rather than falling back
  // to DATABASE_URL if that var is unset. Row ownership under E2E_USER_ID still
  // applies on top of that for /e2e/cleanup, which only deletes rows owned by that
  // user.
  command: [
    'E2E_TEST_MODE=true',
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

// Which servers each project needs. The cloud project is the only one that needs
// two: its web app talks to the API server over GraphQL. No spec in `local` or
// `pwa` reaches the API server — every spec that names CLOUD_SERVER_URL,
// CLOUD_GRAPHQL_URL, makeGql, cleanupCloudData, seedCloudFixture or
// ensureCloudDefaultLocation is either cloud-only or guarded on
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
  pwa: [PWA_WEB_SERVER],
}

const webServer = [...new Set(selectedProjects().flatMap((name) => SERVERS_BY_PROJECT[name]))]

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // cloud tests share one real database — run all tests serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  projects: [
    {
      // Local mode: app reads from IndexedDB (Dexie). No backend needed.
      name: 'local',
      // pwa-offline.spec.ts needs a real service worker, which the dev
      // server this project runs against does not have — it only runs
      // under the 'pwa' project, against the built preview output.
      // location-scoped-writes.spec.ts and cleanup-endpoint.spec.ts drive GraphQL
      // directly against the cloud backend and never open a page — neither has a
      // local-mode counterpart.
      testIgnore: ['**/settings/import-export-cloud.spec.ts', '**/pwa-offline.spec.ts', '**/location-scoped-writes.spec.ts', '**/cleanup-endpoint.spec.ts'],
      use: { ...devices['Desktop Chrome'], baseURL: LOCAL_WEB_URL },
    },
    {
      // Cloud mode: app reads from Postgres via GraphQL. Scoped to item tests for now;
      // expand testMatch as each feature is migrated to the cloud backend.
      name: 'cloud',
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
      testMatch: ['**/item-management.spec.ts', '**/settings/tags.spec.ts', '**/settings/vendors.spec.ts', '**/settings/recipes.spec.ts', '**/cooking.spec.ts', '**/item-list-state-restore.spec.ts', '**/tests/shopping.spec.ts', '**/tests/item-logs.spec.ts', '**/settings/import-export-cloud.spec.ts', '**/settings/locations.spec.ts', '**/location-switcher.spec.ts', '**/location-not-stocked-here.spec.ts', '**/location-scoped-writes.spec.ts', '**/recipes-group.spec.ts', '**/vendors-group.spec.ts', '**/tests/shelves.spec.ts', '**/item-stock-input.spec.ts', '**/item-stock-pager.spec.ts', '**/cleanup-endpoint.spec.ts'],
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
