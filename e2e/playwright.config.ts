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
      testIgnore: ['**/settings/import-export-cloud.spec.ts', '**/pwa-offline.spec.ts'],
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
      testMatch: ['**/item-management.spec.ts', '**/settings/tags.spec.ts', '**/settings/vendors.spec.ts', '**/settings/recipes.spec.ts', '**/cooking.spec.ts', '**/item-list-state-restore.spec.ts', '**/tests/shopping.spec.ts', '**/tests/item-logs.spec.ts', '**/settings/import-export-cloud.spec.ts', '**/settings/locations.spec.ts', '**/location-switcher.spec.ts', '**/location-not-stocked-here.spec.ts'],
    },
    {
      // The dev server has no service worker. It only exists in a real build,
      // so these tests run against the built output.
      name: 'pwa',
      use: { ...devices['Desktop Chrome'], baseURL: PWA_WEB_URL },
      testMatch: ['**/pwa-offline.spec.ts', '**/a11y.spec.ts'],
    },
  ],
  webServer: [
    {
      // Local-mode web app — always start fresh on a dedicated port to avoid
      // conflicts with a dev server running in another worktree.
      command: `pnpm --filter web dev --port ${LOCAL_WEB_PORT}`,
      url: LOCAL_WEB_URL,
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
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
    },
    {
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
    },
    {
      // PWA-mode web app — the dev server has no service worker, so these
      // tests run against the built preview output on a dedicated port.
      command: `pnpm --filter web build && pnpm --filter web preview --port ${PWA_WEB_PORT} --strictPort`,
      url: PWA_WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
})
