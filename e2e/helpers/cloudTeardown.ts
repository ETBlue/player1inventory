import type { APIRequestContext, Page } from '@playwright/test'
import { CLOUD_SERVER_URL, E2E_USER_ID } from '../constants'

/**
 * Every model `/e2e/cleanup` deletes, in the order the route deletes them
 * (apps/server/src/lib/e2eCleanup.ts). The route returns one count per key
 * under `deleted`. 22 models (15 until households H3a task 3.10 added
 * `locationMembers`, `householdMembers` and `households`, 18 until households
 * H5b task G.6 added `householdInvites`, 19 until households H6 task J.1
 * added `householdActivities`, 20 until households H6b task K.1 added
 * `ownershipOffers`, 21 until households H7b task M.1 added
 * `locationPreferences`); `users` is the `User` row itself,
 * deleted last.
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
  'locationPreferences',
  'locations',
  'householdInvites',
  'householdActivities',
  'ownershipOffers',
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
 * Call it from `beforeEach` ONLY, guarded on `baseURL === CLOUD_WEB_URL`
 * (E2E speed plan, task S.3, decision D7, owner answer P3-A). A cleanup in
 * `beforeEach` makes each test start clean whatever ran before it: a test
 * that failed half way, an `afterEach` that failed, or a run that was killed.
 * Until task S.3 every spec also cleaned in `afterEach`; that doubled the
 * cost and added nothing, because the next test's `beforeEach` cleans the
 * same users. (On 2026-11-21 an `afterEach` cleanup failed with `socket hang
 * up`; with cleanup in `afterEach` only, the next test would have started
 * dirty.) What a killed run leaves for users this run never reaches is
 * deleted by `e2e/global-setup.ts`, once per cloud run.
 *
 * `userId` defaults to `E2E_USER_ID`, which is the only account the browser can
 * ever be. An API-only spec that writes as a second account (see
 * `E2E_SECOND_USER_ID` in `e2e/constants.ts`) must call this helper ONCE PER
 * USER in `beforeEach`. One call deletes one user's households — the ones that
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
 * in the `beforeEach` of every cloud spec, where zero rows is a normal and
 * correct answer. A "count > 0" check here would fail every clean run.
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

/** The body of `/e2e/cleanup` with `{ "allE2eUsers": true }`. */
export type CleanupAllResponse = CleanupResponse & {
  /** The ids of the `User` rows it deleted. */
  userIds: string[]
}

/**
 * Delete EVERY E2E user (every `User` id that starts with `e2e-`), and every
 * household with no member outside them, in one request (E2E speed plan, task
 * S.3, decision D8). Only `e2e/global-setup.ts` calls it, once before a cloud
 * run, to delete what a killed run left behind, also for users that no spec
 * of this run cleans.
 *
 * It checks the same things as `cleanupCloudData`, and that `userIds` is a
 * list of strings. It throws on any problem, so a broken cleanup stops the run
 * before the first test.
 */
export async function cleanupAllE2eUsers(
  request: APIRequestContext,
): Promise<CleanupAllResponse> {
  const url = `${CLOUD_SERVER_URL}/e2e/cleanup`
  const response = await request.delete(url, { data: { allE2eUsers: true } })
  if (!response.ok()) {
    throw new Error(
      `cleanupAllE2eUsers: DELETE ${url} returned ${response.status()} ${response.statusText()} — ${await response.text()}`,
    )
  }
  const body = (await response.json()) as Partial<CleanupAllResponse>
  const deleted = body.deleted
  const userIds = body.userIds
  if (!deleted || typeof deleted !== 'object') {
    throw new Error(
      `cleanupAllE2eUsers: DELETE ${url} returned no "deleted" object — got ${JSON.stringify(body)}`,
    )
  }
  const missing = CLEANUP_MODEL_KEYS.filter(
    (key) => typeof deleted[key] !== 'number',
  )
  if (missing.length > 0) {
    throw new Error(
      `cleanupAllE2eUsers: DELETE ${url} returned no deleted count for ${missing.join(', ')}. Got ${JSON.stringify(deleted)}`,
    )
  }
  if (
    !Array.isArray(userIds) ||
    !userIds.every((id) => typeof id === 'string')
  ) {
    throw new Error(
      `cleanupAllE2eUsers: DELETE ${url} returned no "userIds" list — got ${JSON.stringify(body)}`,
    )
  }
  return {
    ok: body.ok === true,
    deleted: deleted as Record<CleanupModelKey, number>,
    userIds,
  }
}

/**
 * The `localStorage` key where the app keeps the household id it showed last.
 * The same string as `LAST_HOUSEHOLD_ID_KEY` in
 * apps/web/src/apollo/householdGuard.ts. `e2e/` does not import app code, so
 * the value is written here again.
 */
export const LAST_HOUSEHOLD_ID_KEY = 'last-household-id'

/**
 * Make the open page forget the household that `cleanupCloudData` just
 * deleted. Call it right after a `cleanupCloudData` that runs in the MIDDLE of
 * a test, when the page has already shown the app (households H5b).
 *
 * WHY. `/e2e/cleanup` deletes the user's household. The next GraphQL request
 * creates a new one with a NEW id. But the browser still holds the old id in
 * `last-household-id`. On the next page load `HouseholdChangeGuard`
 * (apps/web/src/apollo/HouseholdChangeGuard.tsx) sees the server answer a
 * different household, clears the cache and RELOADS the page. That is right
 * for a real person who joined or left a household. In a test it reloads the
 * page about one second after it opens, and whatever the test started in that
 * second is lost. Measured on 2026-11-18: the reload came after
 * `triggerImport`, so the import never ran and "Import complete." never
 * showed. In another test it closed the location menu the test had opened.
 *
 * A real person cannot get here: nothing in the app deletes their household
 * and gives them a new one. So the test removes the stale id, which is what a
 * fresh browser has. The guard then stores the new id on the next load and
 * does not reload.
 *
 * The page must be on the app's origin, because `localStorage` belongs to the
 * origin. It keeps every other key, `active-location-id:cloud` included.
 */
export async function forgetDeletedHousehold(page: Page): Promise<void> {
  await page.evaluate(
    (key) => localStorage.removeItem(key),
    LAST_HOUSEHOLD_ID_KEY,
  )
}
