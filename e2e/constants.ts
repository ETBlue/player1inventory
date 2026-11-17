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
// The live-updates socket (households H3c-1): same port and path as HTTP.
export const CLOUD_GRAPHQL_WS_URL = `ws://localhost:${CLOUD_SERVER_PORT}/graphql`
export const PWA_WEB_URL = `http://localhost:${PWA_WEB_PORT}`

// E2E test identity — must match the x-e2e-user-id header and VITE_E2E_TEST_USER_ID
export const E2E_USER_ID = 'e2e-test-user'

/**
 * A SECOND synthetic account, for API-only specs that need two users.
 *
 * The server accepts any `x-e2e-user-id` verbatim when `E2E_TEST_MODE=true`
 * (the GraphQL context in apps/server/src/index.ts, and `/e2e/cleanup` in
 * apps/server/src/lib/e2eCleanup.ts), so this
 * value needs no registration anywhere — it only has to differ from
 * `E2E_USER_ID`.
 *
 * **The project's own `page` is always `E2E_USER_ID`.** `VITE_E2E_TEST_USER_ID`
 * is baked into the web build as one value (`playwright.config.ts`). Since
 * households H5 task F.8 a spec can still open a browser as another user:
 * `newUserContext(browser, userId)` (`helpers/userContext.ts`) makes a new
 * context that sets `localStorage['e2e-user-id']`, which only the E2E build
 * reads (`getE2ETestUserId` in apps/web/src/lib/e2eUser.ts). Ids built from
 * this constant (`${E2E_SECOND_USER_ID}-…`) work the same way.
 *
 * Any spec that writes as this user MUST also tear it down —
 * `cleanupCloudData(request, E2E_SECOND_USER_ID)` in both `beforeEach` and
 * `afterEach`. The shared teardown only ever deletes `E2E_USER_ID`'s rows, so
 * rows left here survive into the next spec.
 */
export const E2E_SECOND_USER_ID = 'e2e-test-user-2'

/**
 * The name of the location a NEW, empty pantry starts with.
 *
 * LOCAL: Dexie's `on('populate')` creates "My Home" (apps/web/src/db/index.ts),
 * flagged `isDefault`.
 *
 * CLOUD: first sign-in creates "Home" in English (`firstLocationName` in
 * apps/server/src/lib/household.ts), and `clearAllData` creates it again.
 * Cloud has had no default location since households H3a: "Home" is only the
 * household's first location, at `order` 0, and it can be renamed or deleted
 * like any other (the server refuses only the household's LAST location).
 * The E2E browser runs in English, so the Chinese name "住家" never appears.
 */
export const LOCAL_HOME_LOCATION_NAME = 'My Home'
export const CLOUD_HOME_LOCATION_NAME = 'Home'

/** `CLOUD_HOME_LOCATION_NAME` in the cloud project, `LOCAL_HOME_LOCATION_NAME` otherwise. */
export function homeLocationName(baseURL: string | undefined): string {
  return baseURL === CLOUD_WEB_URL
    ? CLOUD_HOME_LOCATION_NAME
    : LOCAL_HOME_LOCATION_NAME
}
