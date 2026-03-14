// Playwright config for cloud-mode E2E tests.
//
// Starts dedicated web (port 5174) and server (port 4001) instances with
// E2E test mode enabled so tests bypass Clerk auth and use a static user ID.
// Run with: pnpm test:e2e:cloud
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*cloud*.spec.ts',
  fullyParallel: false, // cloud tests share a real MongoDB — run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command:
        'VITE_E2E_TEST_USER_ID=e2e-test-user pnpm --filter web dev --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'E2E_TEST_MODE=true PORT=4001 pnpm --filter server dev',
      url: 'http://localhost:4001/graphql',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
})
