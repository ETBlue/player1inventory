import type { APIRequestContext } from '@playwright/test'
import { CLOUD_SERVER_URL, E2E_USER_ID } from '../constants'

/**
 * Every model `/e2e/cleanup` deletes, in the order the route deletes them
 * (apps/server/src/index.ts). The route returns one count per key under
 * `deleted`.
 *
 * This list is the contract between the route and the tests. A model dropped
 * from the route's `$transaction` loses its key here, and `cleanupCloudData`
 * below throws on the next cloud test that runs — which is every cloud test.
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
  'locations',
] as const

export type CleanupModelKey = (typeof CLEANUP_MODEL_KEYS)[number]

/** The body `/e2e/cleanup` returns: `ok`, plus one deleted count per model. */
export type CleanupResponse = {
  ok: boolean
  deleted: Record<CleanupModelKey, number>
}

/**
 * Delete every row owned by E2E_USER_ID, and return the per-model deleted counts.
 *
 * Call it from both `beforeEach` and `afterEach`, guarded on
 * `baseURL === CLOUD_WEB_URL`. The `beforeEach` call is the guard against a
 * previous run that crashed before its teardown.
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
): Promise<CleanupResponse> {
  const response = await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
    headers: { 'x-e2e-user-id': E2E_USER_ID },
  })
  if (!response.ok()) {
    throw new Error(
      `cleanupCloudData: DELETE /e2e/cleanup returned ${response.status()} ${response.statusText()} — ${await response.text()}`,
    )
  }

  const body = (await response.json()) as Partial<CleanupResponse>
  const deleted = body.deleted
  if (!deleted || typeof deleted !== 'object') {
    throw new Error(
      `cleanupCloudData: DELETE /e2e/cleanup returned no "deleted" object — got ${JSON.stringify(body)}`,
    )
  }

  const missing = CLEANUP_MODEL_KEYS.filter(
    (key) => typeof deleted[key] !== 'number',
  )
  if (missing.length > 0) {
    throw new Error(
      `cleanupCloudData: DELETE /e2e/cleanup returned no deleted count for ${missing.join(', ')} — a model was dropped from the delete list in apps/server/src/index.ts. Got ${JSON.stringify(deleted)}`,
    )
  }

  return { ok: body.ok === true, deleted: deleted as Record<CleanupModelKey, number> }
}
