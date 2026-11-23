import type { IncomingHttpHeaders } from 'node:http'
import { appLanguageFrom, type Context, clientIdFrom, householdIdFrom } from '../context.js'

/**
 * What the GraphQL context function needs from the outside. `index.ts` passes
 * the real ones. A test passes its own, so the function can be tested without
 * starting Apollo or Clerk.
 */
export interface GraphQLContextDeps {
  /** True when the server runs with `E2E_TEST_MODE=true`. */
  e2eTestMode: boolean
  /** The signed-in Clerk user id of a request, or `null`. */
  clerkUserId: (req: { headers: IncomingHttpHeaders }) => string | null
  /**
   * Make sure the `User` row exists. `index.ts` passes `ensureUserOrLog`
   * (lib/userRow.ts), which never throws, so a failure there never fails the
   * request (plan P11).
   */
  ensureUser: (userId: string) => Promise<void>
}

/**
 * Who sent this request or opened this socket? The one rule for HTTP and for
 * the WebSocket (households H3c-1, decision P3), so the two cannot drift.
 *
 * - In E2E test mode, a non-empty `e2eUserId` is the user. It comes from the
 *   `x-e2e-user-id` header (HTTP) or `connectionParams.e2eUserId` (socket).
 * - Otherwise, or when there is no such id: the Clerk user, from `clerkUserId`.
 *   Outside E2E mode `e2eUserId` is never read.
 *
 * A found user goes through `ensureUser` once. `clerkUserId` may be async
 * (the socket checks a token) and may throw (a bad token); a throw is passed
 * on to the caller, and then `ensureUser` is not called.
 */
export async function identifyCaller(input: {
  e2eTestMode: boolean
  e2eUserId: unknown
  clerkUserId: () => string | null | Promise<string | null>
  ensureUser: (userId: string) => Promise<void>
}): Promise<string | null> {
  const testUserId =
    input.e2eTestMode && typeof input.e2eUserId === 'string' && input.e2eUserId.length > 0
      ? input.e2eUserId
      : null
  const userId = testUserId ?? (await input.clerkUserId())
  if (userId) await input.ensureUser(userId)
  return userId
}

/**
 * Build the context of one GraphQL request.
 *
 * Who the user is comes from `identifyCaller`: the `x-e2e-user-id` header in
 * E2E test mode, otherwise the Clerk session. The socket uses the same
 * function (`lib/wsServer.ts`).
 *
 * The context also carries `x-app-language` (households H3a, decision H3)
 * the tab id from `x-client-id` (households H3c-1, decision P4), and the
 * household the tab shows from `x-household-id` (households H7 task L.1,
 * decision T66). `graphqlContext.test.ts` checks all three, in E2E mode and
 * in Clerk mode.
 *
 * Every request gets a new, empty `requestCache`, so a value worked out for
 * one request is never seen by another.
 */
export function createGraphQLContext(deps: GraphQLContextDeps) {
  return async ({ req }: { req: { headers: IncomingHttpHeaders } }): Promise<Context> => {
    const userId = await identifyCaller({
      e2eTestMode: deps.e2eTestMode,
      e2eUserId: req.headers['x-e2e-user-id'],
      clerkUserId: () => deps.clerkUserId(req),
      ensureUser: deps.ensureUser,
    })
    return {
      userId,
      language: appLanguageFrom(req.headers['x-app-language']),
      clientId: clientIdFrom(req.headers['x-client-id']),
      shownHouseholdId: householdIdFrom(req.headers['x-household-id']),
      requestCache: {},
    }
  }
}
