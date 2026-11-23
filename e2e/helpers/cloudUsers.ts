import type { APIRequestContext } from '@playwright/test'
import { CLOUD_SERVER_URL } from '../constants'
import { makeGql } from '../utils/cloud'

/**
 * Helpers for the server's E2E-only `User` routes (households plan, tasks 2.5
 * and 2.7) and its household member route (households H3a, task 3.11). All
 * four routes exist only when the server runs with `E2E_TEST_MODE=true`
 * (apps/server/src/index.ts, inside the `if (E2E_TEST_MODE)` block; the
 * handlers are in apps/server/src/lib/e2eUsers.ts and e2eHouseholds.ts).
 *
 * The two invite helpers at the end, `createInvite` and `joinHousehold`
 * (households H5b, task G.6), are different: they call the REAL GraphQL
 * mutations through `makeGql`, with the same role checks as the app. So a
 * spec that uses them is real-SQL coverage of the invite resolvers, not a
 * back door.
 *
 * Which id to pass:
 *
 * - For a second account, use `E2E_SECOND_USER_ID` from `e2e/constants.ts`.
 *   The project's own `page` is never that user. A spec that needs a page as
 *   that user opens one with `newUserContext` (`helpers/userContext.ts`,
 *   since households H5 task F.8).
 * - `E2E_USER_ID` also works. Its row is normally created by the server's
 *   request-path safety net (`ensureUser`) on its first GraphQL request,
 *   named by its id. Call `createCloudUser` for it only when a spec needs the
 *   row before any request, or with a different name.
 *
 * A spec that writes a `User` row must clean it up. Since task 2.6 of the
 * plan, `cleanupCloudData(request, id)` deletes the `User` row with that id,
 * along with the rest of that user's data. So a spec that writes a row for
 * `E2E_SECOND_USER_ID` must call it for that id too, in `beforeEach`.
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
  /** The first sign-in claim (households H3a, decision H1). */
  householdSetupAt: string | null
  /** The household the person joined last (households H5b, decision T14). */
  activeHouseholdId: string | null
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

/** A household role `POST /e2e/household-members` can give. Never `owner`. */
export type AddableHouseholdRole = 'manager' | 'member'

/** A location role, as `LocationRole` in apps/server/prisma/schema.prisma. */
export type LocationRole = 'organizer' | 'participant' | 'viewer'

/**
 * Put `memberUserId` into the household `ownerUserId` owns, with a household
 * role and some location roles. `POST /e2e/household-members` (households H3a,
 * task 3.11; the handler is in apps/server/src/lib/e2eHouseholds.ts). Returns
 * the household id.
 *
 * Two things must be true first, or the route refuses with 409:
 *
 * - **The owner has sent one GraphQL request.** First sign-in makes the
 *   household then.
 * - **The member has NOT sent any GraphQL request.** A request makes the
 *   member a household of their own, and the route refuses a person who is
 *   already in a household. Since households H5b a person CAN be in two
 *   households, through an invite, but this route keeps the rule: specs rely
 *   on "the member's first request reads THIS household" (decision T29). To
 *   put a person who has a household into a second one, use `createInvite`
 *   and `joinHousehold` below. The route creates the member's `User` row when
 *   it is missing.
 *
 * Each location must be one of the owner's household. The route gives the
 * member no location of their own. (A "Home" comes only from first sign-in,
 * and the route sets the member's first sign-in claim.)
 *
 * Clean the member up with `cleanupCloudData(request, memberUserId)` in both
 * hooks. Run the owner's cleanup too: it deletes the household and every
 * member row in it, the member's included.
 */
export async function addHouseholdMember(
  request: APIRequestContext,
  args: {
    ownerUserId: string
    memberUserId: string
    householdRole: AddableHouseholdRole
    locations: { locationId: string; role: LocationRole }[]
  },
): Promise<string> {
  const url = `${CLOUD_SERVER_URL}/e2e/household-members`
  const response = await request.post(url, { data: args })
  if (!response.ok()) {
    throw new Error(
      `addHouseholdMember(${args.memberUserId}): POST ${url} returned ${response.status()} ${response.statusText()} — ${await response.text()}`,
    )
  }
  const body = (await response.json()) as { householdId: string }
  return body.householdId
}

/** A household role an invite can give. Never `owner` (the server refuses it). */
export type InviteHouseholdRole = AddableHouseholdRole

const CREATE_INVITE = `mutation ($householdRole: HouseholdRole!, $locationRoles: [InviteLocationRoleInput!]!) {
  createInvite(householdRole: $householdRole, locationRoles: $locationRoles) { id token }
}`

const JOIN_HOUSEHOLD = `mutation ($token: String!) {
  joinHousehold(token: $token) { id name role }
}`

/**
 * Make an invite to the household `ownerId` acts in, and return its token
 * (the secret part of the join link). It calls the real `createInvite`
 * mutation as `ownerId` (households H5b, task G.3).
 *
 * The caller needs household role `manager` or higher there, and only the
 * owner may invite a `manager`. Each location must be in that household, and
 * the list may be empty. The link works once, for 7 days. A refusal throws,
 * with the GraphQL error in the message.
 *
 * The first request of `ownerId` makes their household, so this works on a
 * clean account too. The invite is deleted by `cleanupCloudData` for the
 * household's owner (with the household), and for the person who made it.
 */
export async function createInvite(
  request: APIRequestContext,
  ownerId: string,
  householdRole: InviteHouseholdRole,
  locationRoles: { locationId: string; role: LocationRole }[],
): Promise<string> {
  const gql = makeGql(request, ownerId)
  const { createInvite: invite } = await gql<{
    createInvite: { id: string; token: string }
  }>(CREATE_INVITE, { householdRole, locationRoles })
  return invite.token
}

/** The household `joinHousehold` answers with. `role` is the joiner's role. */
export type JoinedHousehold = {
  id: string
  name: string
  role: 'owner' | 'manager' | 'member'
}

/**
 * Join the household of an invite as `userId`. It calls the real
 * `joinHousehold` mutation (households H5b, task G.4). An invalid, used,
 * revoked or expired token, or a person who is already a member there,
 * throws, with the GraphQL error in the message (`INVITE_INVALID` or
 * `ALREADY_MEMBER`).
 *
 * What a spec can rely on after it returns:
 *
 * - `userId` is a member of the invite's household, with the invite's
 *   household role, and the invite's location roles on the locations that
 *   still exist.
 * - That household is the one `userId` acts in: the join sets their
 *   `User.activeHouseholdId`, so their next request reads it.
 * - Their own other household is DELETED when it is empty: nobody else in it,
 *   and no catalog row, stock row, log or cart row. A "Home" location and an
 *   empty cart do not count. A household with data is KEPT, and `userId`
 *   stays its owner. So do not assume which of the two happened unless the
 *   spec made that household empty or not on purpose.
 * - A person who sent no request before the join gets no household of their
 *   own at all: the join sets the first sign-in claim.
 * - The invite is used. A second join with the same token throws.
 *
 * Clean `userId` up with `cleanupCloudData(request, userId)` in `beforeEach`.
 * It deletes their member rows in the joined household, and any household
 * they still own.
 */
export async function joinHousehold(
  request: APIRequestContext,
  userId: string,
  token: string,
): Promise<JoinedHousehold> {
  const gql = makeGql(request, userId)
  const { joinHousehold: household } = await gql<{
    joinHousehold: JoinedHousehold
  }>(JOIN_HOUSEHOLD, { token })
  return household
}
