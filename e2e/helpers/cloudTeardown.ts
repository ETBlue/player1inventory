import type { APIRequestContext } from '@playwright/test'
import { CLOUD_SERVER_URL, E2E_USER_ID } from '../constants'

/**
 * Every model `/e2e/cleanup` deletes, in the order the route deletes them
 * (apps/server/src/lib/e2eCleanup.ts). The route returns one count per key
 * under `deleted`. 18 models (15 until households H3a task 3.10 added
 * `locationMembers`, `householdMembers` and `households`); `users` is the
 * `User` row itself, deleted last.
 *
 * This list is the contract between the route and the tests. A model dropped
 * from the route's `$transaction` loses its key there, and `cleanupCloudData`
 * below throws on the next cloud test that runs — which is every cloud test.
 *
 * The server keeps the same list as `CLEANUP_MODEL_KEYS` in
 * apps/server/src/lib/e2eCleanup.ts. `e2eCleanup.test.ts` reads this file as
 * text and fails if the two lists differ, so change both together.
 */
export const CLEANUP_MODEL_KEYS = [
  'inventoryLogs',
  'cartItems',
  'carts',
  'itemTags',
  'itemVendors',
  'recipeItems',
  'itemStocks',
  'items',
  'tags',
  'tagTypes',
  'vendors',
  'recipes',
  'shelves',
  'locationMembers',
  'locations',
  'householdMembers',
  'households',
  'users',
] as const

export type CleanupModelKey = (typeof CLEANUP_MODEL_KEYS)[number]

/** The body `/e2e/cleanup` returns: `ok`, plus one deleted count per model. */
export type CleanupResponse = {
  ok: boolean
  deleted: Record<CleanupModelKey, number>
}

/**
 * Delete one user's households and account, and return the per-model deleted
 * counts. "The user's households" means the households the user OWNS. A
 * household the user only belongs to is not deleted; only the user's own role
 * rows in it go (apps/server/src/lib/e2eCleanup.ts).
 *
 * Call it from both `beforeEach` and `afterEach`, guarded on
 * `baseURL === CLOUD_WEB_URL`. The `beforeEach` call is the guard against a
 * previous run that crashed before its teardown.
 *
 * `userId` defaults to `E2E_USER_ID`, which is the only account the browser can
 * ever be. An API-only spec that writes as a second account (see
 * `E2E_SECOND_USER_ID` in `e2e/constants.ts`) must call this helper ONCE PER
 * USER in both hooks. One call deletes one user's households — the ones that
 * user owns — so a second user's household left behind survives into the next
 * spec and fails it for a reason nobody will find.
 *
 * ── WHAT IT CHECKS ───────────────────────────────────────────────────────────
 *
 * 1. The status is ok. The nine older cloud specs hand-rolled the same request
 *    and ignored what came back, so a cleanup that silently stopped working
 *    there showed up much later as an unexplained failure in some other test.
 *    Here it fails the test that owns the cleanup instead.
 *
 * 2. The body carries a `deleted` count for EVERY key in `CLEANUP_MODEL_KEYS`.
 *    A model dropped from the route's delete list fails here.
 *
 * **It does NOT assert any count is above zero, and must not.** This helper runs
 * in the `beforeEach` and `afterEach` of every cloud spec, where zero rows is
 * the normal and correct answer — the `beforeEach` call usually deletes nothing
 * at all. A "count > 0" check here would fail every clean run.
 *
 * The assertion that a count CAN be above zero — the one that catches a wrong
 * `where` clause — lives in `e2e/tests/cleanup-endpoint.spec.ts`, which seeds a
 * row of every model first.
 */
export async function cleanupCloudData(
  request: APIRequestContext,
  userId: string = E2E_USER_ID,
): Promise<CleanupResponse> {
  // One URL for the request and for every error message below. Issue #325: all
  // three messages used to spell out the literal `/e2e/cleanup`, so they dropped
  // the host and port, and would have kept naming the old path after a rename.
  const url = `${CLOUD_SERVER_URL}/e2e/cleanup`
  const response = await request.delete(url, {
    headers: { 'x-e2e-user-id': userId },
  })
  if (!response.ok()) {
    throw new Error(
      `cleanupCloudData(${userId}): DELETE ${url} returned ${response.status()} ${response.statusText()} — ${await response.text()}`,
    )
  }

  const body = (await response.json()) as Partial<CleanupResponse>
  const deleted = body.deleted
  if (!deleted || typeof deleted !== 'object') {
    throw new Error(
      `cleanupCloudData: DELETE ${url} returned no "deleted" object — got ${JSON.stringify(body)}`,
    )
  }

  const missing = CLEANUP_MODEL_KEYS.filter(
    (key) => typeof deleted[key] !== 'number',
  )
  if (missing.length > 0) {
    throw new Error(
      `cleanupCloudData: DELETE ${url} returned no deleted count for ${missing.join(', ')} — a model was dropped from the delete list in apps/server/src/lib/e2eCleanup.ts. Got ${JSON.stringify(deleted)}`,
    )
  }

  return {
    ok: body.ok === true,
    deleted: deleted as Record<CleanupModelKey, number>,
  }
}
