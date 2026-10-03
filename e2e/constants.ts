// E2E test environment constants.
// Change port/URL values here — they propagate to both the Playwright config
// and the test files automatically.

// Ports
export const LOCAL_WEB_PORT = 5175
export const CLOUD_WEB_PORT = 5174
export const CLOUD_SERVER_PORT = 4001
export const PWA_WEB_PORT = 5176

// Base URLs (derived from ports so they never drift)
export const LOCAL_WEB_URL = `http://localhost:${LOCAL_WEB_PORT}`
export const CLOUD_WEB_URL = `http://localhost:${CLOUD_WEB_PORT}`
export const CLOUD_SERVER_URL = `http://localhost:${CLOUD_SERVER_PORT}`
export const CLOUD_GRAPHQL_URL = `${CLOUD_SERVER_URL}/graphql`
export const PWA_WEB_URL = `http://localhost:${PWA_WEB_PORT}`

// E2E test identity — must match the x-e2e-user-id header and VITE_E2E_TEST_USER_ID
export const E2E_USER_ID = 'e2e-test-user'

/**
 * A SECOND synthetic account, for API-only specs that need two users.
 *
 * The server accepts any `x-e2e-user-id` verbatim when `E2E_TEST_MODE=true`
 * (apps/server/src/index.ts:139 for GraphQL, :39 for `/e2e/cleanup`), so this
 * value needs no registration anywhere — it only has to differ from
 * `E2E_USER_ID`.
 *
 * **The browser can never be this user.** `VITE_E2E_TEST_USER_ID` is baked
 * into the web build as a single value (`playwright.config.ts`), so a spec
 * using this constant must drive GraphQL directly and open no page.
 *
 * Any spec that writes as this user MUST also tear it down —
 * `cleanupCloudData(request, E2E_SECOND_USER_ID)` in both `beforeEach` and
 * `afterEach`. The shared teardown only ever deletes `E2E_USER_ID`'s rows, so
 * rows left here survive into the next spec.
 */
export const E2E_SECOND_USER_ID = 'e2e-test-user-2'
