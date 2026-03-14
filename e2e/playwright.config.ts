import { defineConfig, devices } from '@playwright/test'

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
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' },
    },
    {
      // Cloud mode: app reads from MongoDB via GraphQL. Scoped to item tests for now;
      // expand testMatch as each feature is migrated to the cloud backend.
      name: 'cloud',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5174',
        // Pre-set data-mode=cloud so main.tsx boots in cloud mode from the very first
        // navigation. Each test gets a fresh browser context, so this runs per test.
        storageState: {
          cookies: [],
          origins: [
            {
              origin: 'http://localhost:5174',
              localStorage: [{ name: 'data-mode', value: 'cloud' }],
            },
          ],
        },
      },
      testMatch: '**/item-management.spec.ts',
    },
  ],
  webServer: [
    {
      // Local-mode web app — reuse an already-running dev server if available.
      command: 'pnpm --filter web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
    },
    {
      // Cloud-mode web app — always start fresh with E2E env vars:
      //   VITE_E2E_TEST_USER_ID: skips Clerk, renders with a static userId
      //   VITE_GRAPHQL_HTTP_URL: points Apollo at the E2E backend (4001 not 4000)
      command:
        'VITE_E2E_TEST_USER_ID=e2e-test-user VITE_GRAPHQL_HTTP_URL=http://localhost:4001/graphql pnpm --filter web dev --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      // Cloud-mode backend — port 4001 avoids conflicts with the normal dev server on 4000.
      // E2E_TEST_MODE bypasses Clerk auth; a dedicated MongoDB database keeps test
      // data isolated from development data.
      command:
        'E2E_TEST_MODE=true PORT=4001 CLIENT_ORIGIN=http://localhost:5174 MONGODB_URI=mongodb://localhost:27017/player1inventory-e2e pnpm --filter server dev',
      url: 'http://localhost:4001/graphql',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
})
