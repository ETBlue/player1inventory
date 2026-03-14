// E2E test environment constants.
// Change port/URL values here — they propagate to both the Playwright config
// and the test files automatically.

// Ports
export const LOCAL_WEB_PORT = 5173
export const CLOUD_WEB_PORT = 5174
export const CLOUD_SERVER_PORT = 4001

// Base URLs (derived from ports so they never drift)
export const LOCAL_WEB_URL = `http://localhost:${LOCAL_WEB_PORT}`
export const CLOUD_WEB_URL = `http://localhost:${CLOUD_WEB_PORT}`
export const CLOUD_SERVER_URL = `http://localhost:${CLOUD_SERVER_PORT}`
export const CLOUD_GRAPHQL_URL = `${CLOUD_SERVER_URL}/graphql`

// E2E test identity — must match the x-e2e-user-id header and VITE_E2E_TEST_USER_ID
export const E2E_USER_ID = 'e2e-test-user'

// Dedicated MongoDB database for E2E tests — isolated from the dev database
export const E2E_MONGODB_URI = 'mongodb://localhost:27017/player1inventory-e2e'
