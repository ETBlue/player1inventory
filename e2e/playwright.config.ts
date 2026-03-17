import { defineConfig, devices } from '@playwright/test'
import {
  CLOUD_GRAPHQL_URL,
  CLOUD_SERVER_PORT,
  CLOUD_SERVER_URL,
  CLOUD_WEB_PORT,
  CLOUD_WEB_URL,
  E2E_MONGODB_URI,
  E2E_USER_ID,
  LOCAL_WEB_URL,
} from './constants'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // cloud tests share a real MongoDB — run all tests serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  projects: [
    {
      // Local mode: app reads from IndexedDB (Dexie). No backend needed.
      name: 'local',
      use: { ...devices['Desktop Chrome'], baseURL: LOCAL_WEB_URL },
    },
    {
      // Cloud mode: app reads from MongoDB via GraphQL. Scoped to item tests for now;
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
      testMatch: ['**/item-management.spec.ts', '**/settings/tags.spec.ts', '**/settings/vendors.spec.ts', '**/settings/recipes.spec.ts', '**/cooking.spec.ts'],
    },
  ],
  webServer: [
    {
      // Local-mode web app — reuse an already-running dev server if available.
      command: 'pnpm --filter web dev',
      url: LOCAL_WEB_URL,
      reuseExistingServer: true,
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
      // server. E2E_TEST_MODE bypasses Clerk auth; a dedicated MongoDB database
      // keeps test data isolated from development data.
      command: [
        'E2E_TEST_MODE=true',
        `PORT=${CLOUD_SERVER_PORT}`,
        `CLIENT_ORIGIN=${CLOUD_WEB_URL}`,
        `MONGODB_URI=${E2E_MONGODB_URI}`,
        'pnpm --filter server dev',
      ].join(' '),
      url: CLOUD_GRAPHQL_URL,
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
})
