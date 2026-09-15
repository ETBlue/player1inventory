import type { APIRequestContext } from '@playwright/test'
import { CLOUD_SERVER_URL, E2E_USER_ID } from '../constants'

/**
 * Delete every row owned by E2E_USER_ID.
 *
 * Call it from both `beforeEach` and `afterEach`, guarded on
 * `baseURL === CLOUD_WEB_URL`. The `beforeEach` call is the guard against a
 * previous run that crashed before its teardown.
 *
 * This throws when the response is not ok. The nine older cloud specs hand-roll
 * the same request and ignore what comes back, so a cleanup that silently stops
 * working there shows up much later as an unexplained failure in some other
 * test. Here it fails the test that owns the cleanup instead.
 */
export async function cleanupCloudData(
  request: APIRequestContext,
): Promise<void> {
  const response = await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
    headers: { 'x-e2e-user-id': E2E_USER_ID },
  })
  if (!response.ok()) {
    throw new Error(
      `cleanupCloudData: DELETE /e2e/cleanup returned ${response.status()} ${response.statusText()} — ${await response.text()}`,
    )
  }
}
