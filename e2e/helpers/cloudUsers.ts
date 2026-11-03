import type { APIRequestContext } from '@playwright/test'
import { CLOUD_SERVER_URL } from '../constants'

/**
 * Helpers for the server's E2E-only `User` routes (households plan, tasks 2.5
 * and 2.7). All three routes exist only when the server runs with `E2E_TEST_MODE=true`
 * (apps/server/src/index.ts, inside the `if (E2E_TEST_MODE)` block; the
 * handlers are in apps/server/src/lib/e2eUsers.ts).
 *
 * Which id to pass:
 *
 * - For a second account, use `E2E_SECOND_USER_ID` from `e2e/constants.ts`.
 *   The browser can never be that user, so only API-only specs can use it.
 * - `E2E_USER_ID` also works. Its row is normally created by the server's
 *   request-path safety net (`ensureUser`) on its first GraphQL request,
 *   named by its id. Call `createCloudUser` for it only when a spec needs the
 *   row before any request, or with a different name.
 *
 * A spec that writes a `User` row must clean it up. Since task 2.6 of the
 * plan, `cleanupCloudData(request, id)` deletes the `User` row with that id,
 * along with the rest of that user's data. So a spec that writes a row for
 * `E2E_SECOND_USER_ID` must call it for that id too, in both hooks.
 */

/**
 * Create a `User` row, or overwrite its name and email. `POST /e2e/users`.
 * When `email` is left out, a stored email is set to `null`, the same as a
 * `user.updated` webhook for an account with no email. It never clears
 * `deletedAt` and never writes `lastSeenAt`.
 */
export async function createCloudUser(
  request: APIRequestContext,
  id: string,
  name: string,
  email?: string,
): Promise<void> {
  const url = `${CLOUD_SERVER_URL}/e2e/users`
  const response = await request.post(url, {
    data: { id, displayName: name, ...(email === undefined ? {} : { email }) },
  })
  if (!response.ok()) {
    throw new Error(
      `createCloudUser(${id}): POST ${url} returned ${response.status()} ${response.statusText()} — ${await response.text()}`,
    )
  }
}

/**
 * Mark a user deleted, as Clerk's `user.deleted` webhook would.
 * `POST /e2e/users/:id/deleted`. It runs the same `handleClerkEvent` the real
 * webhook runs, without a signature. For an id with no row, it creates the
 * row already deleted, named "Deleted user" (plan P13).
 */
export async function sendFakeUserDeleted(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  const url = `${CLOUD_SERVER_URL}/e2e/users/${encodeURIComponent(id)}/deleted`
  const response = await request.post(url)
  if (!response.ok()) {
    throw new Error(
      `sendFakeUserDeleted(${id}): POST ${url} returned ${response.status()} ${response.statusText()} — ${await response.text()}`,
    )
  }
}

/** A `User` row as `GET /e2e/users/:id` answers it. Dates are ISO strings. */
export type CloudUserRow = {
  id: string
  displayName: string
  email: string | null
  lastSeenAt: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Read the `User` row with this id, or `null` when there is none.
 * `GET /e2e/users/:id`. The GraphQL schema has no `User` type yet, so this is
 * the only way a spec can read the row. It writes nothing, so it does not
 * change `lastSeenAt`.
 */
export async function readCloudUser(
  request: APIRequestContext,
  id: string,
): Promise<CloudUserRow | null> {
  const url = `${CLOUD_SERVER_URL}/e2e/users/${encodeURIComponent(id)}`
  const response = await request.get(url)
  if (!response.ok()) {
    throw new Error(
      `readCloudUser(${id}): GET ${url} returned ${response.status()} ${response.statusText()} — ${await response.text()}`,
    )
  }
  const body = (await response.json()) as { user: CloudUserRow | null }
  return body.user
}
