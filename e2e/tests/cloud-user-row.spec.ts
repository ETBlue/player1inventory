import { expect, test } from '@playwright/test'
import { E2E_SECOND_USER_ID } from '../constants'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { readCloudUser, sendFakeUserDeleted } from '../helpers/cloudUsers'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE COVERS ────────────────────────────────────────────────────
//
// The `User` row (households plan, phase H2, task 2.7), against real Postgres:
//
//   | Behaviour                                          | Code                                    |
//   |----------------------------------------------------|-----------------------------------------|
//   | the first GraphQL request creates the row           | `ensureUser` in apps/server/src/lib/userRow.ts, called from the context in apps/server/src/index.ts |
//   | `user.deleted` sets `deletedAt`                     | `handleClerkEvent` in apps/server/src/lib/clerkWebhook.ts |
//   | a later request does not clear `deletedAt`          | `ensureUser` again                      |
//
// The unit tests for all three run against `userFake`. This file is the first
// place they run against SQL.
//
// ── HOW THE ROW IS READ BACK ─────────────────────────────────────────────────
//
// The GraphQL schema has no `User` type yet (H3 adds one). So the row is read
// with `GET /e2e/users/:id` (apps/server/src/lib/e2eUsers.ts), through
// `readCloudUser`. That route is mounted only in E2E test mode, and it writes
// nothing, so reading a row does not change its `lastSeenAt`.
//
// ── WHY EACH TEST HAS ITS OWN USER ID ────────────────────────────────────────
//
// The server remembers, per process, the users it saw today, and then skips
// the database for them (`seenToday` in lib/userRow.ts). The cloud API server
// is one process for the whole run, so that memory lasts across tests and
// across spec files. Two things keep it from hiding a result here:
//
// 1. Each test uses an id no other spec uses. No other spec can have put it
//    in the memory.
// 2. `cleanupCloudData(request, id)` in `beforeEach` deletes the row AND calls
//    `forgetSeenToday(id)` (lib/e2eCleanup.ts). So even a re-run of this file
//    in the same server process starts with the id forgotten.
//
// ── WHY THE "LATER REQUEST" TEST MARKS THE USER DELETED FIRST ────────────────
//
// The obvious order is: request, then delete, then a second request. But the
// first request puts the user in the memory, so the second request makes 0
// queries. It cannot clear `deletedAt` because it never reaches the database,
// and the test would pass even if `ensureUser` did clear it.
//
// So that test marks the user deleted BEFORE any request. The fake event
// creates the row already deleted, with `lastSeenAt` null. The request that
// follows is the first one for that id, so it reaches the database and runs
// the `updateMany` that sets `lastSeenAt`. The test checks that `lastSeenAt`
// is now set: that proves the request reached the row. Only then does
// "`deletedAt` is unchanged" mean something.
//
// ── WHY NO BROWSER ───────────────────────────────────────────────────────────
//
// The browser can only be `E2E_USER_ID` (`VITE_E2E_TEST_USER_ID` is one value
// in the web build), and the behaviour under test is the server's. So this
// file calls GraphQL directly, like location-scoped-writes.spec.ts. It runs in
// the `cloud` project only: it is in that project's `testMatch` and in the
// `local` project's `testIgnore` (e2e/playwright.config.ts).

const FIRST_REQUEST_USER = `${E2E_SECOND_USER_ID}-row-first`
const DELETED_USER = `${E2E_SECOND_USER_ID}-row-deleted`
const COMES_BACK_USER = `${E2E_SECOND_USER_ID}-row-later`
const ALL_USERS = [FIRST_REQUEST_USER, DELETED_USER, COMES_BACK_USER]

// Any query works: the context function runs `ensureUser` before any
// resolver. This one only reads.
const ANY_QUERY = 'query { items { id } }'

// The name `handleClerkEvent` gives a row whose first event is `user.deleted`
// (`DELETED_USER_DISPLAY_NAME` in apps/server/src/lib/clerkWebhook.ts).
const DELETED_USER_DISPLAY_NAME = 'Deleted user'

async function cleanupAll(
  request: Parameters<typeof cleanupCloudData>[0],
): Promise<void> {
  for (const id of ALL_USERS) await cleanupCloudData(request, id)
}

test.beforeEach(async ({ request }) => {
  // Deletes the rows a crashed run left behind, and makes the server forget
  // these ids (see "WHY EACH TEST HAS ITS OWN USER ID" above).
  await cleanupAll(request)
})

test.afterEach(async ({ request }) => {
  await cleanupAll(request)
})

test.describe('cloud User row', () => {
  test('user gets a User row on their first request, named by their id', async ({
    request,
  }) => {
    // Given a user with no row
    // This check is what makes the next one mean something: without it, a
    // row left over from an earlier run would pass.
    expect(await readCloudUser(request, FIRST_REQUEST_USER)).toBeNull()

    // When that user sends one GraphQL request
    await makeGql(request, FIRST_REQUEST_USER)(ANY_QUERY)

    // Then the row exists. E2E mode never calls Clerk, so the display name is
    // the user id. The request set lastSeenAt, and nothing set deletedAt.
    // (`id` is the primary key, so two rows with this id cannot exist.)
    const row = await readCloudUser(request, FIRST_REQUEST_USER)
    expect(row).toMatchObject({
      id: FIRST_REQUEST_USER,
      displayName: FIRST_REQUEST_USER,
      email: null,
      deletedAt: null,
    })
    expect(row?.lastSeenAt).not.toBeNull()
  })

  test('user is marked deleted when Clerk reports the account deleted, and keeps their name', async ({
    request,
  }) => {
    // Given a user whose row was created by a request
    await makeGql(request, DELETED_USER)(ANY_QUERY)
    const before = await readCloudUser(request, DELETED_USER)
    expect(before?.deletedAt).toBeNull()

    // When Clerk's user.deleted event arrives for that user
    await sendFakeUserDeleted(request, DELETED_USER)

    // Then the row is marked deleted. The name and lastSeenAt are not touched.
    const after = await readCloudUser(request, DELETED_USER)
    expect(after?.deletedAt).not.toBeNull()
    expect(after?.displayName).toBe(DELETED_USER)
    expect(after?.lastSeenAt).toBe(before?.lastSeenAt)
  })

  test('user marked deleted is not brought back by a later request', async ({
    request,
  }) => {
    // Given a user marked deleted before any request (see "WHY THE 'LATER
    // REQUEST' TEST MARKS THE USER DELETED FIRST" above)
    await sendFakeUserDeleted(request, COMES_BACK_USER)
    const before = await readCloudUser(request, COMES_BACK_USER)
    expect(before).toMatchObject({
      displayName: DELETED_USER_DISPLAY_NAME,
      lastSeenAt: null,
    })
    expect(before?.deletedAt).not.toBeNull()

    // When that user sends a GraphQL request
    await makeGql(request, COMES_BACK_USER)(ANY_QUERY)

    // Then the request reached the row: lastSeenAt is now set. Without this
    // check, a request that skipped the database would pass the next two.
    const after = await readCloudUser(request, COMES_BACK_USER)
    expect(after?.lastSeenAt).not.toBeNull()
    // And the user is still deleted, with the same name
    expect(after?.deletedAt).toBe(before?.deletedAt)
    expect(after?.displayName).toBe(DELETED_USER_DISPLAY_NAME)
  })
})
