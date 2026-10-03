import type { APIRequestContext } from '@playwright/test'
import { CLOUD_GRAPHQL_URL, E2E_USER_ID } from '../constants'

/**
 * Returns a typed GraphQL request helper for cloud seeding.
 *
 * Requests are sent as `E2E_USER_ID` unless `userId` says otherwise. The
 * server accepts whatever `x-e2e-user-id` carries when `E2E_TEST_MODE=true`
 * (apps/server/src/index.ts:139), so passing `E2E_SECOND_USER_ID` is all it
 * takes to act as a second account — see
 * `e2e/tests/cart-id-cross-user-leak.spec.ts`.
 *
 * A spec that writes as a second user must also clean that user up:
 * `cleanupCloudData(request, thatUserId)` in both `beforeEach` and
 * `afterEach`. The default teardown deletes only `E2E_USER_ID`'s rows.
 */
export function makeGql(
  request: APIRequestContext,
  userId: string = E2E_USER_ID,
) {
  return async function gql<T = Record<string, unknown>>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const res = await request.post(CLOUD_GRAPHQL_URL, {
      headers: {
        'x-e2e-user-id': userId,
        'Content-Type': 'application/json',
      },
      data: { query, variables },
    })
    const json = await res.json()
    if (json.errors?.length) throw new Error(JSON.stringify(json.errors))
    return json.data as T
  }
}
