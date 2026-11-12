import type { IncomingHttpHeaders } from 'node:http'
import { appLanguageFrom, type Context } from '../context.js'

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
 * Build the context of one GraphQL request.
 *
 * Two branches:
 * - E2E test mode with an `x-e2e-user-id` header: that header is the user.
 *   Only active when the server is started with `E2E_TEST_MODE=true`.
 * - Otherwise: the Clerk session.
 *
 * Both branches call `ensureUser` and both read `x-app-language` (households
 * H3a, decision H3). The E2E branch returns early, so each branch needs its own
 * call and its own `language`. `graphqlContext.test.ts` checks both.
 *
 * Every request gets a new, empty `requestCache`, so a value worked out for
 * one request is never seen by another.
 */
export function createGraphQLContext(deps: GraphQLContextDeps) {
  return async ({ req }: { req: { headers: IncomingHttpHeaders } }): Promise<Context> => {
    if (deps.e2eTestMode) {
      const testUserId = req.headers['x-e2e-user-id'] as string | undefined
      if (testUserId) {
        await deps.ensureUser(testUserId)
        return {
          userId: testUserId,
          language: appLanguageFrom(req.headers['x-app-language']),
          requestCache: {},
        }
      }
    }
    const userId = deps.clerkUserId(req)
    if (userId) await deps.ensureUser(userId)
    return {
      userId,
      language: appLanguageFrom(req.headers['x-app-language']),
      requestCache: {},
    }
  }
}
