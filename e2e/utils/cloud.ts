import type { APIRequestContext } from '@playwright/test'
import { CLOUD_GRAPHQL_URL, E2E_USER_ID } from '../constants'

/**
 * Returns a typed GraphQL request helper for cloud seeding.
 * All requests are sent as the E2E test user.
 */
export function makeGql(request: APIRequestContext) {
  return async function gql<T = Record<string, unknown>>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const res = await request.post(CLOUD_GRAPHQL_URL, {
      headers: {
        'x-e2e-user-id': E2E_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { query, variables },
    })
    const json = await res.json()
    if (json.errors?.length) throw new Error(JSON.stringify(json.errors))
    return json.data as T
  }
}
